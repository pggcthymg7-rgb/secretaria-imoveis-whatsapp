/**
 * ============================================================================
 * BUSCA INTELIGENTE
 * ============================================================================
 * O corretor manda o pedido do cliente ("busca apto 800 mil a 1 milhão no Marista,
 * mínimo 100 m²") e a BIGA devolve um relatório com:
 *   1. anúncios dos GRUPOS dele (memória de 90 dias) — quem anunciou, em qual grupo;
 *   2. anúncios dos PORTAIS (OLX, ZAP, VivaReal) achados pelo Gemini com busca no Google,
 *      separados em profissional x particular, sem repetir;
 *   3. links prontos de busca em cada portal.
 * Regra de ouro dos portais: só entra anúncio cujo link veio da busca real do Google
 * (groundingMetadata). O que a IA "inventar" sem fonte é descartado.
 * ============================================================================
 */
const { readJson, writeJson } = require('./store');
const { normalize } = require('./brain/text');
const { parseRequest, fmtPrice } = require('./brain/parser');
const { buildIndex, osmVersion, detectLocations } = require('./brain/locations');
const { evaluateProperty } = require('./brain/engine');
const { loadSettings } = require('./settings');
const anuncios = require('./anuncios');
const { normalizarFiltros, preenchidos } = require('./busca-filtros');
const serp = require('./busca-serp');
const leitor = require('./busca-anuncio');
const { curar } = require('./busca-curadoria');
const { buscarApify, apifyConfigurado } = require('./busca-apify');
const links = require('./busca-links');

const USO_FILE = 'busca_inteligente.json';
const PORTAIS = { 'olx.com.br': 'OLX', 'zapimoveis.com.br': 'ZAP Imóveis', 'vivareal.com.br': 'VivaReal' };

let indexCache = null;
let indexKey = '';
function getIndex() {
  const s = loadSettings();
  const key = `${osmVersion()}:${JSON.stringify(s.extraPlaces || [])}`;
  if (!indexCache || key !== indexKey) {
    indexCache = buildIndex({ extraPlaces: s.extraPlaces || [] });
    indexKey = key;
  }
  return indexCache;
}

/** Entende o pedido do cliente com o mesmo cérebro dos pedidos dos grupos */
function entenderPedido(texto) {
  const index = getIndex();
  const c = parseRequest(texto, { index });
  c.intent = 'BUSCA';
  // o cérebro erra uma letra ("Goiânia" -> Goianira): só vale a cidade cujo nome (ou parte distintiva, ex.: "Canedo" de
  // "Senador Canedo") está escrito no texto como palavra inteira
  const palavras = new Set(normalize(texto).split(' ').filter(Boolean));
  const soltas = new Set(['de', 'do', 'da', 'dos', 'das', 'e']);
  c.local.cidades = c.local.cidades.filter(x => normalize(x).split(' ').some(w => w.length >= 4 && !soltas.has(w) && palavras.has(w)));
  return { criterios: c, index };
}

// ---------------------------------------------------------------------------
// FILTROS (campos iguais aos dos portais) -> critérios, sem "adivinhar" texto
// ---------------------------------------------------------------------------
const GENERICAS = new Set(['condominio', 'residencial', 'edificio', 'ed', 'edif', 'predio', 'empreendimento', 'setor', 'jardim', 'jardins', 'parque', 'vila', 'bairro', 'loteamento', 'de', 'do', 'da', 'dos', 'das', 'e']);
const tokens = s => normalize(s).split(' ').filter(Boolean);
function lev1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1); // troca
  const [c, d] = a.length > b.length ? [a, b] : [b, a];
  return c.slice(i + 1) === d.slice(i); // 1 letra a mais
}
// tolerante (só condomínio/edifício): aceita 1 letra de diferença ("Itália"/"Italia"). Cidade e bairro: exato — Goiânia e Goianira diferem por 1 letra.
const tokenIgual = (a, b, tolerante) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a))) || (tolerante && Math.min(a.length, b.length) >= 5 && lev1(a, b));
/** O que o mapa achou serve para o que o corretor digitou? (o cérebro erra: "Goiânia" -> Goianira, "Xyzabc Park" -> outro condomínio) */
function credivel(digitado, nome, aliases = [], tolerante = false) {
  let ts = tokens(digitado).filter(t => !GENERICAS.has(t));
  if (!ts.length) ts = tokens(digitado);
  if (!ts.length) return false;
  const alvo = [nome, ...aliases].flatMap(tokens).filter(t => !GENERICAS.has(t) || ts.every(x => GENERICAS.has(x)));
  return ts.every(t => alvo.some(a => tokenIgual(t, a, tolerante)));
}

function montarLocal(f, index, avisos) {
  const local = { qualquer: false, regioes: [], bairros: [], perto: [], marcos: [], condominios: [], edificios: [], cidades: [], raio: null, nomesDesconhecidos: [], mencionaLocal: false, resumo: [], localNaoReconhecido: false, rotulos: [] };
  const L = t => detectLocations(t, { index });
  if (f.cidade) {
    const n = normalize(f.cidade);
    const cid = /^goiania(\s+go)?$/.test(n) ? 'Goiânia' : L(f.cidade).cidades.find(x => credivel(f.cidade, x, [x]));
    if (cid) {
      local.cidades.push(cid);
      local.rotulos.push(cid);
    } else avisos.push(`Não conheço a cidade "${f.cidade}" no meu mapa: não filtrei por cidade.`);
  }
  const nome = f.local || f.bairro;
  if (f.local && f.bairro) avisos.push('Bairro e condomínio/edifício preenchidos: usei só o condomínio/edifício (é o mais específico).');
  if (nome) {
    const r = L(nome);
    const ach = [];
    for (const b of r.bairros) if (credivel(nome, b, [b])) ach.push(['bairros', b]);
    for (const x of r.regioes) if (credivel(nome, x, [x])) ach.push(['regioes', x]);
    for (const c of r.condominios) if (credivel(nome, c.name, c.aliases, true)) ach.push(['condominios', c]);
    for (const e of r.edificios) if (credivel(nome, e.name, e.aliases, true)) ach.push(['edificios', e]);
    if (ach.length) for (const [k, v] of ach) local[k].push(v);
    else {
      local.nomesDesconhecidos.push(normalize(nome));
      avisos.push(`"${nome}" não está no meu mapa: procuro esse nome escrito nos anúncios.`);
    }
    local.rotulos.push(nome);
  }
  local.mencionaLocal = Boolean(local.cidades.length || local.bairros.length || local.regioes.length || local.condominios.length || local.edificios.length || local.nomesDesconhecidos.length);
  local.resumo = local.rotulos.slice();
  return local;
}

/** Filtros já validados (normalizarFiltros) -> critérios do mesmo formato do parseRequest */
function entenderFiltros(f) {
  const index = getIndex();
  const avisos = [];
  const c = parseRequest(f.extras ? String(f.extras) : 'busco imovel', { index }); // "extras": piscina, mobiliado, aceita permuta…
  c.intent = 'BUSCA';
  if (f.tipo) {
    c.tipos = [f.tipo];
    c.subtipo_casa = null;
  }
  c.transacao = f.negocio === 'ALUGUEL' ? 'ALUGUEL' : 'VENDA';
  c.agio = false;
  if (f.valorMin !== undefined || f.valorMax !== undefined) {
    c.valor_min = f.valorMin ?? null;
    c.valor_max = f.valorMax ?? null;
    c.valor_alvo = null;
  }
  if (f.areaMin !== undefined || f.areaMax !== undefined) {
    c.area_min = f.areaMin ?? null;
    c.area_max = f.areaMax ?? null;
    c.alternativas = [];
  }
  if (f.quartos) c.quartos_min = f.quartos;
  if (f.suites) c.suites_min = f.suites;
  if (f.vagas) c.vagas_min = f.vagas;
  if (f.cidade || f.bairro || f.local) c.local = montarLocal(f, index, avisos);
  c.filtros = f;
  c.resumo = descreverPedido(c);
  return { criterios: c, index, avisos };
}

/** Texto dos filtros (histórico, prompt dos portais e relatório) */
function textoDosFiltros(f) {
  return descreverPedido(entenderFiltros(f).criterios);
}

// ---------------------------------------------------------------------------
// 1. GRUPOS
// ---------------------------------------------------------------------------
function buscarNosGrupos(criterios, index) {
  const porImovel = new Map();
  for (const a of anuncios.todos()) {
    if (!grupoNaBusca(a.grupoId)) continue;
    const r = evaluateProperty({ ...a.prop, id: a.id, descricao: a.texto }, criterios, index);
    if (r.status !== 'MATCH' && r.status !== 'QUASE') continue;
    const chave = a.fp && a.fp.replace(/\|/g, '') ? a.fp : a.id;
    const atual = porImovel.get(chave);
    const fonte = { grupo: a.grupo, autor: a.autor, telefone: a.telefone, ts: a.ts };
    if (atual) {
      if (!atual.fontes.some(f => f.grupo === fonte.grupo && f.autor === fonte.autor)) atual.fontes.push(fonte);
      if (a.ts > atual.ts) Object.assign(atual, { ts: a.ts, texto: a.texto });
    } else {
      porImovel.set(chave, { ts: a.ts, texto: a.texto, prop: a.prop, status: r.status, score: r.score || 0, faltando: r.unknowns || [], fontes: [fonte] });
    }
  }
  return [...porImovel.values()].sort((x, y) => (x.status === y.status ? y.ts - x.ts : x.status === 'MATCH' ? -1 : 1));
}

// ---------------------------------------------------------------------------
// 3. LINKS PRONTOS
// ---------------------------------------------------------------------------
const slug = s => normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function linksProntos(criterios) {
  return links.linksProntos(criterios, portaisAtivos());
}

// ---------------------------------------------------------------------------
// 2. PORTAIS (Gemini + Google Search, com limite diário)
// ---------------------------------------------------------------------------
function hoje() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}
function usoHoje() {
  const u = readJson(USO_FILE, {});
  return u.dia === hoje() ? u.usadas || 0 : 0;
}
function registrarUso() {
  writeJson(USO_FILE, { dia: hoje(), usadas: usoHoje() + 1 });
}
/** Chamada que o Google recusou não conta como busca do dia */
function devolverUso() {
  writeJson(USO_FILE, { dia: hoje(), usadas: Math.max(0, usoHoje() - 1) });
}
function limiteDia(env) {
  const bruto = env.BUSCA_LIMITE_DIA !== undefined && env.BUSCA_LIMITE_DIA !== '' ? env.BUSCA_LIMITE_DIA : loadSettings().buscaLimiteDia;
  const n = parseInt(bruto ?? '20', 10);
  return Number.isFinite(n) && n >= 0 ? n : 20;
}

// ---------------------------------------------------------------------------
// CONFIGURAÇÃO (a mesma no painel e no "Mensagem para mim")
// ---------------------------------------------------------------------------
const CHAVE_PORTAL = { 'olx.com.br': 'buscaOlx', 'zapimoveis.com.br': 'buscaZap', 'vivareal.com.br': 'buscaVivareal' };

function getConfig() {
  const s = loadSettings();
  return {
    limiteDia: limiteDia({}),
    olx: s.buscaOlx !== false,
    zap: s.buscaZap !== false,
    vivareal: s.buscaVivareal !== false,
    memoriaAtiva: s.buscaMemoriaAtiva !== false,
    todosGrupos: !Array.isArray(s.buscaGruposIds),
    gruposIds: Array.isArray(s.buscaGruposIds) ? s.buscaGruposIds : [],
    temChaveGemini: Boolean(String(process.env.GEMINI_API_KEY || '').trim()),
    motores: (() => {
      const m = motoresConfigurados(process.env);
      return { apify: m.apify, busca: m.serp.map(x => serp.NOME[x]), gemini: m.gemini };
    })(),
    usadasHoje: usoHoje()
  };
}

/** Aceita { limiteDia, olx, zap, vivareal, memoriaAtiva } (valida tudo) */
function atualizarConfig(b = {}) {
  const { saveSettings } = require('./settings');
  const upd = {};
  if (b.limiteDia !== undefined && b.limiteDia !== '') {
    const n = parseInt(b.limiteDia, 10);
    if (!Number.isFinite(n) || n < 0 || n > 500) throw Object.assign(new Error('Limite diário deve ser de 0 a 500.'), { status: 400 });
    upd.buscaLimiteDia = n;
  }
  for (const [k, key] of [['olx', 'buscaOlx'], ['zap', 'buscaZap'], ['vivareal', 'buscaVivareal'], ['memoriaAtiva', 'buscaMemoriaAtiva']]) if (b[k] !== undefined) upd[key] = Boolean(b[k]);
  // grupos da busca (separados dos grupos de pedidos): todosGrupos=true -> todos; senão a lista escolhida
  if (b.todosGrupos === true) upd.buscaGruposIds = null;
  else if (Array.isArray(b.gruposIds)) upd.buscaGruposIds = [...new Set(b.gruposIds.map(String).filter(g => /^[\w.-]+@g\.us$/.test(g)))].slice(0, 500);
  if (Object.keys(upd).length) saveSettings(upd);
  return getConfig();
}

/** O grupo entra na busca? (conversa exportada sempre entra: foi você que mandou) */
function grupoNaBusca(grupoId) {
  const ids = loadSettings().buscaGruposIds;
  if (!Array.isArray(ids)) return true;
  return String(grupoId || '').startsWith('exp:') || ids.includes(grupoId);
}

function portaisAtivos() {
  const s = loadSettings();
  return Object.keys(PORTAIS).filter(d => s[CHAVE_PORTAL[d]] !== false);
}

// ---------------------------------------------------------------------------
// HISTÓRICO DAS BUSCAS (rever sem gastar outra busca)
// ---------------------------------------------------------------------------
const HIST_FILE = 'busca_historico.json';
const HIST_MAX = 30;
function historico() {
  const h = readJson(HIST_FILE, []);
  return Array.isArray(h) ? h : [];
}
function guardarNoHistorico(r) {
  const h = historico();
  const seq = h.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
  const item = { id: seq, ts: Date.now(), ...r, grupos: r.grupos.slice(0, 40) };
  h.unshift(item);
  writeJson(HIST_FILE, h.slice(0, HIST_MAX));
  return item;
}
function resumoHistorico() {
  return historico().map(x => ({ id: x.id, ts: x.ts, texto: x.texto, descricao: x.descricao, grupos: x.grupos.length, portais: (x.portais.itens || []).length, portaisOk: x.portais.ok }));
}
function getBusca(id) {
  return historico().find(x => String(x.id) === String(id)) || null;
}

function portalDe(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '').replace(/^[a-z]{2}\./, '');
    return Object.keys(PORTAIS).find(d => h === d || h.endsWith(`.${d}`)) || null;
  } catch {
    return null;
  }
}
function urlChave(url) {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return '';
  }
}

function descreverPedido(c) {
  const partes = [];
  if (c.tipos.length) partes.push(c.tipos.join(' ou '));
  partes.push(c.transacao === 'ALUGUEL' ? 'para alugar' : 'à venda');
  const locais = c.local.rotulos && c.local.rotulos.length ? c.local.rotulos.filter(x => !c.local.cidades.includes(x)) : [...c.local.bairros, ...c.local.condominios.map(x => x.name), ...c.local.regioes.map(r => `região ${r}`)];
  partes.push(`em ${locais.length ? locais.join(', ') + ', ' : ''}${c.local.cidades.find(x => x !== 'Goiânia') || 'Goiânia'} - GO`);
  if (c.valor_min && c.valor_max) partes.push(`de ${fmtPrice(c.valor_min)} a ${fmtPrice(c.valor_max)}`);
  else if (c.valor_max) partes.push(`até ${fmtPrice(c.valor_max)}`);
  else if (c.valor_min) partes.push(`a partir de ${fmtPrice(c.valor_min)}`);
  if (c.area_min) partes.push(`mínimo ${Math.round(c.area_min)} m²`);
  if (c.quartos_min) partes.push(`${c.quartos_min}+ quartos`);
  if (c.suites_min) partes.push(`${c.suites_min}+ suítes`);
  if (c.vagas_min) partes.push(`${c.vagas_min}+ vagas`);
  return partes.join(', ');
}

function promptPortais(descricao, textoOriginal, dominios = Object.keys(PORTAIS)) {
  return [
    'Você é assistente de um corretor de imóveis em Goiânia. Use a busca do Google para achar ANÚNCIOS REAIS e ATUAIS',
    `nos portais ${dominios.join(', ')} que atendam a este pedido:`,
    `"${descricao}"`,
    `(texto original do cliente: "${String(textoOriginal).slice(0, 300)}")`,
    '',
    'Responda SOMENTE com um bloco ```json contendo uma lista. Cada item:',
    `{"titulo":"","portal":"${dominios.map(d => PORTAIS[d]).join('|')}","link":"URL do anúncio",`+'"preco":0,"area_m2":0,"quartos":0,"bairro":"",',
    '"anunciante":"nome da imobiliária/corretor ou Particular","tipo_anunciante":"profissional|particular|desconhecido","resumo":"1 frase"}',
    'Regras: só anúncios que você viu na busca (nunca invente link); preço em reais (número); de preferência a página do anúncio,',
    'não a página de lista; no máximo 15 itens; sem repetir o mesmo imóvel em portais diferentes.'
  ].join('\n');
}

function extrairJson(texto) {
  const bloco = String(texto || '').match(/```(?:json)?\s*([\s\S]*?)```/);
  const bruto = bloco ? bloco[1] : String(texto || '').slice(String(texto || '').indexOf('['));
  try {
    const v = JSON.parse(bruto);
    return Array.isArray(v) ? v : Array.isArray(v?.itens) ? v.itens : [];
  } catch {
    return [];
  }
}

/** Os links das fontes do Google vêm "embrulhados"; abre o embrulho (sem seguir para o site) */
async function abrirFontes(chunks, fetcher) {
  const lista = chunks.map(ch => ch && ch.web).filter(w => w && w.uri).slice(0, 30);
  const res = await Promise.all(
    lista.map(async w => {
      let url = w.uri;
      // só abre o "embrulho" do próprio Google (nunca acessa endereço qualquer vindo da resposta)
      let hostGoogle = false;
      try {
        const u = new URL(url);
        hostGoogle = u.protocol === 'https:' && u.hostname === 'vertexaisearch.cloud.google.com';
      } catch {}
      if (hostGoogle) {
        try {
          const r = await fetcher(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(8000) });
          url = r.headers.get('location') || url;
        } catch {}
      }
      return { url, titulo: w.title || '' };
    })
  );
  return res.filter(f => portalDe(f.url) && portaisAtivos().includes(portalDe(f.url)));
}

function numero(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v || '').replace(/[^\d,.]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function classificar(item, portal) {
  const t = normalize(`${item.anunciante || ''} ${item.titulo || ''} ${item.resumo || ''} ${item.tipo_anunciante || ''}`);
  if (/\b(particular|proprietario|direto com o dono|direto do dono|sem corretor|sem creci)\b/.test(t)) return { tipo: 'particular', certeza: portal === 'olx.com.br' ? 'anúncio' : 'estimativa' };
  if (/\b(profissional|imobiliaria|corretor|creci|imoveis\b|negocios imobiliarios)/.test(t)) return { tipo: 'profissional', certeza: portal === 'olx.com.br' ? 'anúncio' : 'estimativa' };
  // ZAP e VivaReal: quase tudo é anunciado por imobiliária
  return { tipo: portal === 'olx.com.br' ? 'desconhecido' : 'profissional', certeza: 'estimativa' };
}

function dentroDoPedido(item, c) {
  const preco = numero(item.preco);
  const area = numero(item.area_m2);
  if (preco) {
    if (c.valor_max && preco > c.valor_max * 1.05) return false;
    if (c.valor_min && preco < c.valor_min * 0.95) return false;
  }
  if (area && c.area_min && area < c.area_min * 0.95) return false;
  if (area && c.area_max && area > c.area_max * 1.05) return false;
  if (item.quartos && c.quartos_min && numero(item.quartos) < c.quartos_min) return false;
  if (item.suites && c.suites_min && numero(item.suites) < c.suites_min) return false;
  if (item.vagas && c.vagas_min && numero(item.vagas) < c.vagas_min) return false;
  return true;
}

/**
 * Trava anti-invenção + filtro + separação profissional/particular.
 * `permitidos`: Set com as urlChave REAIS devolvidas pela busca (qualquer link fora dele é descartado);
 * null só para fonte já estruturada (Apify), que ainda precisa ser URL de um dos portais ligados.
 */
function finalizarItens(brutos, { permitidos, dominios, criterios, certeza }) {
  const vistos = new Set();
  const impressoes = new Set();
  const itens = [];
  for (const it of brutos) {
    const link = String(it.link || '');
    const portal = portalDe(link);
    if (!portal || !dominios.includes(portal)) continue;
    if (permitidos && !permitidos.has(urlChave(link))) continue; // anti-invenção
    if (!dentroDoPedido(it, criterios)) continue;
    const ch = urlChave(link);
    const fp = [Math.round(numero(it.preco) / 10000), Math.round(numero(it.area_m2) / 5), normalize(it.bairro)].join('|');
    if (vistos.has(ch) || (numero(it.preco) && numero(it.area_m2) && impressoes.has(fp))) continue;
    vistos.add(ch);
    impressoes.add(fp);
    const cl = it.tipo_exato ? { tipo: it.tipo_exato, certeza: 'anúncio' } : classificar(it, portal);
    itens.push({
      titulo: String(it.titulo || '').slice(0, 140),
      portal: PORTAIS[portal],
      link,
      preco: numero(it.preco),
      area: numero(it.area_m2),
      quartos: numero(it.quartos),
      suites: numero(it.suites),
      vagas: numero(it.vagas),
      conferir: Array.isArray(it.conferir) ? it.conferir.slice(0, 4) : [],
      bairro: String(it.bairro || '').slice(0, 60),
      anunciante: String(it.anunciante || '').slice(0, 80),
      resumo: String(it.resumo || '').slice(0, 200),
      tipoAnunciante: cl.tipo,
      certeza: certeza || cl.certeza
    });
  }
  return { itens, vistos };
}

/** Camada 1 — Grounding do Gemini (google_search). Fila de modelos com o 2.5 primeiro (os únicos com cota grátis documentada). */
async function buscarPortaisGemini(criterios, textoOriginal, { env, fetcher, dominios }) {
  const key = require('./gemini-chave').limparChave(env.GEMINI_API_KEY);
  const M = require('./gemini-modelo');
  const body = {
    contents: [{ role: 'user', parts: [{ text: promptPortais(descreverPedido(criterios), textoOriginal, dominios) }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.2 }
  };
  const ordem = [...new Set([String(env.GEMINI_BUSCA_MODEL || '').trim(), 'gemini-2.5-flash', 'gemini-2.5-flash-lite', ...(await M.escolherModelos(key, { fetcher, max: 2 })), await M.escolherModelo(key, { fetcher })].filter(Boolean))].filter(m => !M.ehIndisponivel(key, m) || m === String(env.GEMINI_BUSCA_MODEL || '').trim());
  const tentativas = [];
  let data = null;
  let usado = ordem[0];
  for (const modelo of ordem) {
    usado = modelo;
    try {
      const r = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90000)
      });
      const d = await r.json();
      if (r.ok) {
        tentativas.push({ modelo, status: r.status });
        data = d;
        break;
      }
      const msg = String((d && d.error && d.error.message) || r.status).slice(0, 500);
      tentativas.push({ modelo, status: r.status, mensagem: msg });
      if (M.modeloIndisponivel(r.status, msg)) M.marcarIndisponivel(key, modelo);
      if (M.modeloIndisponivel(r.status, msg) || r.status === 429 || M.erroTransitorio(r.status, msg)) continue; // sem cota/indisponível/sobrecarga: tenta o próximo modelo da fila
      return { ok: false, motivo: 'erro', detalhe: msg, modelo, tentativas, itens: [], fontesSoltas: [] };
    } catch (err) {
      tentativas.push({ modelo, status: 0, mensagem: String(err.message).slice(0, 200) });
      return { ok: false, motivo: 'erro', detalhe: String(err.message).slice(0, 200), modelo, tentativas, itens: [], fontesSoltas: [] };
    }
  }
  if (!data) {
    const ult = tentativas[tentativas.length - 1] || {};
    const algum429 = tentativas.some(t => t.status === 429);
    return { ok: false, motivo: algum429 ? 'cota' : 'erro', detalhe: (algum429 ? tentativas.filter(t => t.status === 429).pop() : ult).mensagem || 'nenhum modelo aceitou', modelo: usado, tentativas, itens: [], fontesSoltas: [] };
  }
  const cand = data?.candidates?.[0] || {};
  const texto = (cand.content?.parts || []).map(p => p.text || '').join('');
  const fontes = await abrirFontes(cand.groundingMetadata?.groundingChunks || [], fetcher);
  const fontesPorChave = new Set(fontes.map(f => urlChave(f.url)));
  const { itens, vistos } = finalizarItens(extrairJson(texto), { permitidos: fontesPorChave, dominios, criterios });
  return { ok: true, itens, fontesSoltas: fontes.filter(f => !vistos.has(urlChave(f.url))).slice(0, 8), modelo: usado, tentativas };
}

// ---------------------------------------------------------------------------
// MOTORES (cascata) e mensagens
// ---------------------------------------------------------------------------
function motoresConfigurados(env = process.env) {
  return { apify: apifyConfigurado(env), serp: serp.provedoresConfigurados(env), gemini: Boolean(require('./gemini-chave').limparChave(env.GEMINI_API_KEY)) };
}

/** Texto em português para cada motivo de falha (relatório do WhatsApp e painel) */
function explicarMotivo(p) {
  const d = p.detalhe ? `: ${p.detalhe}` : '';
  const modelos = (p.tentativas || []).length ? ` Modelos tentados: ${p.tentativas.map(t => t.modelo).join(', ')}.` : '';
  return (
    {
      sem_chave: 'falta uma chave de busca: Tavily ou Serper (grátis, recomendado) ou Gemini. Painel › Ajustes, ou mande *chave tavily SUA_CHAVE*.',
      desligado: 'todos os portais estão desligados (painel › Busca, ou *portais olx zap vivareal*).',
      limite: 'limite diário de buscas atingido (protege de cobranças). Volta amanhã.',
      cota: `o Google respondeu "sem cota" (429)${d}.${modelos} Se a mensagem fala em "limit: 0", a busca com Google não vem no plano grátis desta chave: mande *testar gemini fundo*. Com uma chave Tavily ou Serper a busca passa a não depender disso.`,
      erro: `o Gemini não respondeu agora${d}.${modelos}`,
      sem_chave_busca: 'falta a chave do Tavily/Serper.',
      cota_busca: `o ${p.provedor || 'provedor de busca'} recusou por cota${d}.`,
      chave_busca_recusada: `o ${p.provedor || 'provedor de busca'} recusou a chave${d}. Gere outra e salve de novo.`,
      erro_busca: `o ${p.provedor || 'provedor de busca'} não respondeu${d}.`,
      chave_apify_recusada: `o Apify recusou o token${d}.`,
      erro_apify: `o Apify não respondeu${d}.`
    }[p.motivo] || `não consegui buscar${d}.`
  );
}

/**
 * BUSCA NOS PORTAIS — cascata:
 *  3. Apify (opcional; ZAP e VivaReal estruturados, filtros do próprio portal)
 *  2. Tavily/Serper/Brave (anúncios individuais reais) + Gemini SEM google_search (curadoria)
 *  1. Gemini com google_search — só se nenhuma camada acima respondeu
 * Em todas: link só vale se veio de uma fonte real (trava anti-invenção).
 */
async function buscarNosPortais(criterios, textoOriginal, { env = process.env, fetcher = fetch } = {}) {
  const m = motoresConfigurados(env);
  const vazio = { itens: [], fontesSoltas: [] };
  if (!m.apify && !m.serp.length && !m.gemini) return { ok: false, motivo: 'sem_chave', explicacao: explicarMotivo({ motivo: 'sem_chave' }), ...vazio };
  const dominios = portaisAtivos();
  if (!dominios.length) return { ok: false, motivo: 'desligado', explicacao: explicarMotivo({ motivo: 'desligado' }), ...vazio };
  if (usoHoje() >= limiteDia(env)) return { ok: false, motivo: 'limite', explicacao: explicarMotivo({ motivo: 'limite' }), ...vazio };
  registrarUso();
  const descricao = descreverPedido(criterios);
  const via = [];
  const erros = [];
  const todos = [];
  let fontesSoltas = [];
  let modelo;
  let semCuradoria = false;
  let curadoriaErro = '';
  let diagBusca = '';
  let algumOk = false;
  let cobertos = [];

  // Camada 3 — Apify
  if (m.apify) {
    const r = await buscarApify({ criterios, dominios, env, fetcher });
    if (r.ok) {
      algumOk = true;
      via.push('Apify');
      cobertos = r.cobertos;
      todos.push(...finalizarItens(r.itens, { permitidos: null, dominios, criterios, certeza: 'anúncio' }).itens);
    } else erros.push({ camada: 'apify', ...r });
  }

  // Camada 2 — busca desacoplada + curadoria
  if (m.serp.length) {
    const restantes = dominios.filter(d => !cobertos.includes(d));
    if (restantes.length) {
      const r = await serp.buscarAnuncios({ criterios, dominios: restantes, env, fetcher });
      if (!r.ok) erros.push({ camada: 'busca', ...r });
      else {
        algumOk = true;
        diagBusca = Object.entries(r.diag || {}).map(([d, v]) => `${(serp.PORTAIS[d] || d)}: ${v.brutos} páginas, ${v.anuncios} anúncios${!v.anuncios && v.descartadas && v.descartadas.length ? ` (ex.: ${v.descartadas.join(' , ')})` : ''}`).join(' · ');
        const permitidos = new Set(r.catalogo.map(x => urlChave(x.url))); // urlsPermitidas
        const porId = new Map(r.catalogo.map(x => [x.id, x]));
        // Passo 1.5 — leitura do anúncio (grátis, sem IA): OLX pela página, ZAP/VivaReal pelo endereço
        const lei = await leitor.lerAnuncios({ catalogo: r.catalogo, criterios, fetcher, portalDaUrl: serp.portalDaUrl, ehPaginaDeAnuncio: serp.ehPaginaDeAnuncio, abrirPaginas: env.BUSCA_LER_PAGINAS !== '0' });
        if (lei.lidas) via.push(`leitura de ${lei.lidas} anúncio${lei.lidas > 1 ? 's' : ''}`);
        diagBusca += `${diagBusca ? ' · ' : ''}lidos ${lei.lidas}, reprovados ${lei.descartados.size}${lei.falhas ? `, ${lei.falhas} sem leitura` : ''}`;
        const brutosLidos = lei.decididos.map(({ cat, dados, conferir, tipoExato }) => ({
          link: cat.url,
          titulo: dados.titulo || cat.titulo,
          preco: dados.preco,
          area_m2: dados.area,
          quartos: dados.quartos,
          suites: dados.suites,
          vagas: dados.vagas,
          bairro: dados.bairro,
          anunciante: dados.anunciante,
          tipo_exato: tipoExato,
          conferir,
          resumo: ''
        }));
        const lidos = finalizarItens(brutosLidos, { permitidos, dominios, criterios, certeza: 'anúncio' });
        todos.push(...lidos.itens);
        const resolvidos = new Set([...lidos.vistos, ...[...lei.descartados].map(id => urlChave(porId.get(id).url))]);
        const aCurar = lei.aCurar;
        const chave = require('./gemini-chave').limparChave(env.GEMINI_API_KEY);
        if (aCurar.length && chave) {
          const cur = await curar({ chave, descricao, catalogo: aCurar, env, fetcher });
          if (cur.ok) {
            via.push(`${r.provedor} + Gemini`);
            modelo = cur.modelo;
            const brutos = [];
            for (const x of cur.itens) {
              const cat = porId.get(Number(x && x.id)); // o Gemini devolve o número; o link vem do catálogo
              if (cat && aCurar.some(a => a.id === cat.id)) {
                const e = (aCurar.find(a => a.id === cat.id) || {}).dadosEndereco || {};
                brutos.push({ ...x, preco: x.preco || e.preco || 0, area_m2: x.area_m2 || e.area || 0, quartos: x.quartos || e.quartos || 0, link: cat.url, titulo: cat.titulo, portalDominio: cat.dominio });
              }
            }
            const { itens, vistos } = finalizarItens(brutos, { permitidos, dominios, criterios });
            todos.push(...itens);
            for (const v of vistos) resolvidos.add(v);
          } else {
            erros.push({ camada: 'curadoria', ...cur });
            semCuradoria = true;
            curadoriaErro = `${cur.motivo === 'sobrecarga' ? 'o Gemini está sobrecarregado agora' : cur.motivo === 'cota' ? 'o Gemini está sem cota' : 'o Gemini não respondeu'}${(cur.tentativas || []).length ? ` (tentei ${[...new Set(cur.tentativas.map(t => t.modelo))].join(', ')})` : ''}`;
            via.push(`${r.provedor} (sem curadoria)`);
          }
        } else if (aCurar.length) {
          semCuradoria = true; // sem chave do Gemini: mostro os anúncios achados, mas sem filtrar
          via.push(`${r.provedor} (sem curadoria)`);
        } else via.push(r.provedor);
        fontesSoltas.push(...r.catalogo.filter(x => !resolvidos.has(urlChave(x.url))).slice(0, 8).map(x => ({ url: x.url, titulo: x.titulo })));
      }
    }
  }

  // Camada 1 — grounding do Gemini (último recurso)
  if (!algumOk && m.gemini) {
    const r = await buscarPortaisGemini(criterios, textoOriginal, { env, fetcher, dominios });
    if (r.ok) {
      algumOk = true;
      via.push('Gemini + Google');
      modelo = r.modelo;
      todos.push(...r.itens);
      fontesSoltas.push(...r.fontesSoltas);
    } else erros.push({ camada: 'gemini', ...r });
  }

  if (!algumOk) {
    devolverUso(); // busca que nenhum motor respondeu não conta no limite do dia
    const e = erros[0] || { motivo: 'erro' };
    const { camada, ...resto } = e;
    return { ok: false, ...resto, erros, explicacao: explicarMotivo(e), ...vazio };
  }

  // junta e tira repetidos (mesmo link, ou mesmo imóvel: preço + área + bairro)
  const vistos = new Set();
  const impressoes = new Set();
  const itens = [];
  for (const it of todos) {
    const ch = urlChave(it.link);
    const fp = [Math.round(it.preco / 10000), Math.round(it.area / 5), normalize(it.bairro)].join('|');
    if (vistos.has(ch) || (it.preco && it.area && impressoes.has(fp))) continue;
    vistos.add(ch);
    impressoes.add(fp);
    itens.push(it);
  }
  fontesSoltas = fontesSoltas.filter(f => !vistos.has(urlChave(f.url))).slice(0, 8);
  return { ok: true, itens, fontesSoltas, modelo, via, semCuradoria, curadoriaErro, diagBusca, avisosMotor: erros.map(e => `${e.camada}: ${e.detalhe || e.motivo}`), usadasHoje: usoHoje(), limite: limiteDia(env) };
}

// ---------------------------------------------------------------------------
// BUSCA COMPLETA + RELATÓRIO
// ---------------------------------------------------------------------------
async function executar(texto, criterios, index, opts = {}) {
  const grupos = buscarNosGrupos(criterios, index);
  const portais = await buscarNosPortais(criterios, texto, opts);
  const r = { texto: String(texto).slice(0, 500), criterios, descricao: descreverPedido(criterios), grupos, portais, links: linksProntos(criterios), memoria: anuncios.resumo() };
  if (opts.filtros) r.filtros = opts.filtros;
  if (opts.avisos && opts.avisos.length) r.avisos = opts.avisos;
  if (opts.guardar === false) return r;
  const { id, ts } = guardarNoHistorico(r);
  return { id, ts, ...r };
}

/** Busca por texto livre (como o corretor escreveria no grupo) */
async function buscar(texto, opts = {}) {
  const { criterios, index } = entenderPedido(texto);
  return executar(texto, criterios, index, opts);
}

/** Busca pelos filtros (campos iguais aos dos portais; o que ficar em branco fica aberto) */
async function buscarComFiltros(bruto, opts = {}) {
  const { filtros, erros } = normalizarFiltros(bruto);
  if (erros.length) throw Object.assign(new Error(erros.join(' ')), { status: 400 });
  if (!preenchidos(filtros)) throw Object.assign(new Error('Preencha pelo menos um campo (cidade, bairro, valor, quartos…).'), { status: 400 });
  const { criterios, index, avisos } = entenderFiltros(filtros);
  return executar(criterios.resumo, criterios, index, { ...opts, filtros, avisos });
}

const dataBR = ts => new Date(ts).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
const money = v => (v ? fmtPrice(v) : 'preço não informado');

function linhaImovelGrupo(g, i) {
  const p = g.prop;
  const det = [p.tipo, p.setor || p.edificio, p.tamanho_m2 ? `${p.tamanho_m2} m²` : '', p.quartos ? `${p.quartos}q` : '', p.suites ? `${p.suites} suítes` : '', money(p.valor)].filter(Boolean).join(' · ');
  const fontes = g.fontes
    .slice(0, 4)
    .map(f => `   👤 ${f.autor}${f.telefone ? ` (wa.me/${f.telefone})` : ''} — _${f.grupo}_, ${dataBR(f.ts)}`)
    .join('\n');
  const aviso = g.status === 'QUASE' ? `\n   ⚠️ conferir: ${(g.faltando || []).slice(0, 2).join('; ') || 'falta dado no anúncio'}` : '';
  const trecho = g.texto.replace(/\s+/g, ' ').slice(0, 160);
  return `*${i + 1}.* ${det}\n   "${trecho}${g.texto.length > 160 ? '…' : ''}"\n${fontes}${g.fontes.length > 4 ? `\n   (+${g.fontes.length - 4} grupos)` : ''}${aviso}`;
}

function linhaImovelPortal(p, i) {
  const det = [p.preco ? fmtPrice(p.preco) : 'preço no link', p.area ? `${p.area} m²` : '', p.quartos ? `${p.quartos}q` : '', p.suites ? `${p.suites} suítes` : '', p.vagas ? `${p.vagas} vagas` : '', p.bairro].filter(Boolean).join(' · ');
  const conferir = (p.conferir || []).length ? `\n   ⚠️ conferir no anúncio: ${p.conferir.join(', ')}` : '';
  return `*${i + 1}.* ${p.titulo || p.resumo || 'Imóvel'}\n   ${det} — ${p.portal}${p.anunciante ? ` · ${p.anunciante}` : ''}${conferir}\n   ${p.link}`;
}

/** Relatório em mensagens de até ~3.500 caracteres (limite confortável do WhatsApp) */
function formatarRelatorio(r) {
  const blocos = [];
  blocos.push(`🔎 *BUSCA INTELIGENTE*${r.id ? ` nº ${r.id}` : ''}\n_${r.descricao}_${(r.avisos || []).length ? `\n${r.avisos.map(a => `⚠️ ${a}`).join('\n')}` : ''}`);

  // 1. grupos
  const mem = r.memoria;
  const desde = mem.desde ? `desde ${dataBR(mem.desde)}` : 'ainda vazia';
  if (r.grupos.length) {
    blocos.push(`📱 *NOS SEUS GRUPOS* (${r.grupos.length})\n_memória: ${mem.total} anúncios de ${mem.grupos} grupos, ${desde}_`);
    r.grupos.slice(0, 15).forEach((g, i) => blocos.push(linhaImovelGrupo(g, i)));
    if (r.grupos.length > 15) blocos.push(`…e mais ${r.grupos.length - 15}. Refine o pedido para ver menos.`);
  } else {
    blocos.push(`📱 *NOS SEUS GRUPOS*\nNada anunciado com esse perfil. _(memória: ${mem.total} anúncios, ${desde})_`);
  }

  // 2. portais
  const p = r.portais;
  if (!p.ok) {
    const motivo = p.explicacao || explicarMotivo(p);
    blocos.push(`🌐 *NOS PORTAIS*\nNão busquei: ${motivo}\nUse os links prontos abaixo.`);
  } else {
    const prof = p.itens.filter(x => x.tipoAnunciante === 'profissional');
    const part = p.itens.filter(x => x.tipoAnunciante === 'particular');
    const outros = p.itens.filter(x => x.tipoAnunciante === 'desconhecido');
    blocos.push(`🌐 *NOS PORTAIS* (${p.itens.length})\n_só anúncios com link confirmado pela busca (OLX: dados lidos da própria página) · via ${(p.via || []).join(' + ') || 'busca'} · ${p.usadasHoje}/${p.limite} buscas hoje_${p.semCuradoria ? `\n⚠️ Não consegui filtrar${p.curadoriaErro ? `: ${p.curadoriaErro}` : ' (sem chave/resposta do Gemini)'}. Abaixo, os anúncios achados; tente de novo em alguns minutos.` : ''}`);
    if (part.length) {
      blocos.push(`👤 *PARTICULAR* (${part.length})`);
      part.forEach((x, i) => blocos.push(linhaImovelPortal(x, i)));
    }
    if (prof.length) {
      blocos.push(`🏢 *PROFISSIONAL* (${prof.length})`);
      prof.forEach((x, i) => blocos.push(linhaImovelPortal(x, i)));
    }
    if (outros.length) {
      blocos.push(`❔ *NÃO IDENTIFICADO* (${outros.length})`);
      outros.forEach((x, i) => blocos.push(linhaImovelPortal(x, i)));
    }
    if (!p.itens.length) blocos.push(`Nenhum anúncio confirmado com esse perfil.${p.diagBusca ? `\n_O buscador devolveu — ${p.diagBusca}._` : ''}`);
    if (p.itens.length && p.diagBusca) blocos.push(`_Buscador — ${p.diagBusca}._`);
    if (p.fontesSoltas.length) blocos.push(`🔗 Outras páginas encontradas:\n${p.fontesSoltas.map(f => `• ${f.titulo ? f.titulo.slice(0, 60) + ' — ' : ''}${f.url}`).join('\n')}`);
    if (p.itens.some(x => x.certeza === 'estimativa')) blocos.push('_Profissional/particular no ZAP e VivaReal é estimativa (pelo texto do anúncio)._');
  }

  // 3. links prontos
  if (Object.keys(r.links).length) blocos.push(`🔗 *BUSCA PRONTA NOS PORTAIS*\n${Object.entries(r.links).map(([n, u]) => `• ${n}: ${u}`).join('\n')}`);

  const msgs = [];
  let atual = '';
  for (const b of blocos) {
    if ((atual + '\n\n' + b).length > 3500 && atual) {
      msgs.push(atual);
      atual = b;
    } else atual = atual ? `${atual}\n\n${b}` : b;
  }
  if (atual) msgs.push(atual);
  return msgs;
}

module.exports = { motoresConfigurados, explicarMotivo, buscarPortaisGemini, finalizarItens, getConfig, atualizarConfig, grupoNaBusca, portaisAtivos, resumoHistorico, getBusca, buscar, buscarComFiltros, entenderFiltros, textoDosFiltros, credivel, entenderPedido, buscarNosGrupos, buscarNosPortais, linksProntos, formatarRelatorio, descreverPedido, extrairJson, classificar, _uso: { usoHoje } };
