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
  const c = criterios;
  const fl = c.filtros || {};
  const bairro = fl.bairro || c.local.bairros[0] || '';
  const cidade = (c.local.cidades.find(x => x !== 'Goiânia') || 'Goiânia');
  const tipo = c.tipos[0] || 'Apartamento';
  const aluguel = c.transacao === 'ALUGUEL';
  const zapTipo = { Apartamento: 'apartamentos', Cobertura: 'cobertura', Casa: 'casas', Sobrado: 'sobrado', Terreno: 'terrenos-lotes-condominios', Flat: 'flat', Studio: 'studio', Comercial: 'imoveis' }[tipo] || 'imoveis';
  const vrTipo = { Apartamento: 'apartamento_residencial', Cobertura: 'cobertura_residencial', Casa: 'casa_residencial', Sobrado: 'sobrado_residencial', Terreno: 'lote-terreno_residencial', Flat: 'flat_residencial' }[tipo] || '';
  const q = new URLSearchParams();
  if (c.valor_min) q.set('precoMinimo', c.valor_min);
  if (c.valor_max) q.set('precoMaximo', c.valor_max);
  if (c.area_min) q.set('areaMinima', Math.round(c.area_min));
  if (c.area_max) q.set('areaMaxima', Math.round(c.area_max));
  if (c.quartos_min) q.set('quartos', c.quartos_min);
  const qs = q.toString() ? `?${q}` : '';
  const neg = aluguel ? 'aluguel' : 'venda';
  const zap = `https://www.zapimoveis.com.br/${neg}/${zapTipo}/go+${slug(cidade)}${bairro ? `++${slug(bairro)}` : ''}/${qs}`;
  const vivareal = `https://www.vivareal.com.br/${neg}/goias/${slug(cidade)}/${bairro ? `bairros/${slug(bairro)}/` : ''}${vrTipo ? `${vrTipo}/` : ''}${qs}`;
  const o = new URLSearchParams();
  o.set('q', `${tipo} ${fl.local || bairro}`.trim().toLowerCase());
  if (c.valor_min) o.set('ps', c.valor_min);
  if (c.valor_max) o.set('pe', c.valor_max);
  if (c.area_min) o.set('ss', Math.round(c.area_min));
  const olx = `https://www.olx.com.br/imoveis/${aluguel ? 'aluguel' : 'venda'}/estado-go/grande-goiania-e-anapolis/${slug(cidade)}?${o}`;
  const todos = { 'olx.com.br': ['OLX', olx], 'zapimoveis.com.br': ['ZAP Imóveis', zap], 'vivareal.com.br': ['VivaReal', vivareal] };
  return Object.fromEntries(portaisAtivos().map(d => todos[d]));
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
  return true;
}

async function buscarNosPortais(criterios, textoOriginal, { env = process.env, fetcher = fetch } = {}) {
  const key = require('./gemini-chave').limparChave(env.GEMINI_API_KEY);
  if (!key) return { ok: false, motivo: 'sem_chave', itens: [], fontesSoltas: [] };
  const dominios = portaisAtivos();
  if (!dominios.length) return { ok: false, motivo: 'desligado', itens: [], fontesSoltas: [] };
  if (usoHoje() >= limiteDia(env)) return { ok: false, motivo: 'limite', itens: [], fontesSoltas: [] };
  registrarUso();
  const M = require('./gemini-modelo');
  const body = {
    contents: [{ role: 'user', parts: [{ text: promptPortais(descreverPedido(criterios), textoOriginal, dominios) }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.2 }
  };
  const chamar = async model => {
    const r = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000)
    });
    return { r, data: await r.json() };
  };
  let data;
  let usado = env.GEMINI_BUSCA_MODEL || (await M.escolherModelo(key, { fetcher }));
  try {
    let { r, data: d } = await chamar(usado);
    // "este modelo não está mais disponível para a sua chave": o Google aposenta modelos; tenta o mais novo que ele oferece
    if (!r.ok && M.modeloIndisponivel(r.status, d?.error?.message)) {
      M.esquecer(key);
      const outro = await M.escolherModelo(key, { fetcher, ignorar: [usado] });
      if (outro && outro !== usado) {
        usado = outro;
        ({ r, data: d } = await chamar(usado));
      }
    }
    data = d;
    if (!r.ok) return { ok: false, motivo: r.status === 429 ? 'cota' : 'erro', detalhe: String(data?.error?.message || r.status).slice(0, 200), modelo: usado, itens: [], fontesSoltas: [] };
  } catch (err) {
    return { ok: false, motivo: 'erro', detalhe: String(err.message).slice(0, 200), modelo: usado, itens: [], fontesSoltas: [] };
  }
  const cand = data?.candidates?.[0] || {};
  const texto = (cand.content?.parts || []).map(p => p.text || '').join('');
  const fontes = await abrirFontes(cand.groundingMetadata?.groundingChunks || [], fetcher);
  const fontesPorChave = new Map(fontes.map(f => [urlChave(f.url), f]));

  const vistos = new Set();
  const impressoes = new Set();
  const itens = [];
  for (const it of extrairJson(texto)) {
    const link = String(it.link || '');
    const portal = portalDe(link);
    // anti-invenção: o link tem que estar entre as fontes reais da busca do Google
    if (!portal || !dominios.includes(portal) || !fontesPorChave.has(urlChave(link))) continue;
    if (!dentroDoPedido(it, criterios)) continue;
    const ch = urlChave(link);
    const fp = [Math.round(numero(it.preco) / 10000), Math.round(numero(it.area_m2) / 5), normalize(it.bairro)].join('|');
    if (vistos.has(ch) || (numero(it.preco) && numero(it.area_m2) && impressoes.has(fp))) continue;
    vistos.add(ch);
    impressoes.add(fp);
    const cl = classificar(it, portal);
    itens.push({
      titulo: String(it.titulo || '').slice(0, 140),
      portal: PORTAIS[portal],
      link,
      preco: numero(it.preco),
      area: numero(it.area_m2),
      quartos: numero(it.quartos),
      bairro: String(it.bairro || '').slice(0, 60),
      anunciante: String(it.anunciante || '').slice(0, 80),
      resumo: String(it.resumo || '').slice(0, 200),
      tipoAnunciante: cl.tipo,
      certeza: cl.certeza
    });
  }
  const fontesSoltas = fontes.filter(f => !vistos.has(urlChave(f.url))).slice(0, 8);
  return { ok: true, itens, fontesSoltas, modelo: usado, usadasHoje: usoHoje(), limite: limiteDia(env) };
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
  const det = [p.preco ? fmtPrice(p.preco) : 'preço no link', p.area ? `${p.area} m²` : '', p.quartos ? `${p.quartos}q` : '', p.bairro].filter(Boolean).join(' · ');
  return `*${i + 1}.* ${p.titulo || p.resumo || 'Imóvel'}\n   ${det} — ${p.portal}${p.anunciante ? ` · ${p.anunciante}` : ''}\n   ${p.link}`;
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
    const motivo = {
      sem_chave: 'falta a chave do Gemini (painel › Busca › Configurações, ou mande *chave gemini SUA_CHAVE*).',
      desligado: 'todos os portais estão desligados (painel › Busca, ou *portais olx zap vivareal*).',
      limite: 'limite diário de buscas atingido (protege de cobranças). Volta amanhã.',
      cota: 'a cota grátis do Google acabou por hoje.',
      erro: `o Gemini não respondeu agora${p.detalhe ? ` (${p.detalhe})` : ''}.`
    }[p.motivo];
    blocos.push(`🌐 *NOS PORTAIS*\nNão busquei: ${motivo}\nUse os links prontos abaixo.`);
  } else {
    const prof = p.itens.filter(x => x.tipoAnunciante === 'profissional');
    const part = p.itens.filter(x => x.tipoAnunciante === 'particular');
    const outros = p.itens.filter(x => x.tipoAnunciante === 'desconhecido');
    blocos.push(`🌐 *NOS PORTAIS* (${p.itens.length})\n_só anúncios com link confirmado pela busca do Google · ${p.usadasHoje}/${p.limite} buscas hoje_`);
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
    if (!p.itens.length) blocos.push('Nenhum anúncio confirmado com esse perfil.');
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

module.exports = { getConfig, atualizarConfig, grupoNaBusca, portaisAtivos, resumoHistorico, getBusca, buscar, buscarComFiltros, entenderFiltros, textoDosFiltros, credivel, entenderPedido, buscarNosGrupos, buscarNosPortais, linksProntos, formatarRelatorio, descreverPedido, extrairJson, classificar, _uso: { usoHoje } };
