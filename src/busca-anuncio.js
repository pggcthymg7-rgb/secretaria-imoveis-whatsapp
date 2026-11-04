/**
 * ============================================================================
 * LEITOR DE ANÚNCIO (Camada 2, passo 1.5) — grátis e sem limite de uso
 * ============================================================================
 * A busca (Serper/Tavily/Brave) acha os LINKS; aqui lemos os DADOS e julgamos o pedido sem IA:
 *  - OLX: abre a página pública do anúncio (1 por link achado, no máx. 15 por busca) e lê os dados
 *    estruturados que a própria página traz: preço, m², quartos, vagas, bairro e se o anunciante é
 *    profissional ou particular (campo `professionalAd` — não é estimativa).
 *  - ZAP / VivaReal: bloqueiam leitura automática (403), então usamos só o que o endereço do anúncio
 *    já diz: transação (venda/aluguel), tipo, quartos, m² e — no VivaReal — o preço (RS1399000).
 * Nada daqui inventa dado: o que não foi lido fica vazio (0) e o anúncio vai para conferência.
 * Segurança: só busca endereços https de anúncio OLX que a própria busca devolveu (lista fechada),
 * sem seguir redirecionamento, com limite de tempo, de tamanho e de simultaneidade.
 * ============================================================================
 */
const { normalize } = require('./brain/text');

const UA = 'BIGA-secretaria-imoveis/1.0 (leitura de anuncio publico; contato do corretor)';
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_PAGINAS = 15;
const SIMULTANEAS = 4;
const TETO_TOTAL_MS = 25000; // tempo máximo para ler TODAS as páginas de uma busca

const CABECALHOS = { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'pt-BR,pt;q=0.9' };

const num = v => {
  const n = Number(String(v == null ? '' : v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const primeiro = (txt, re) => {
  const m = String(txt).match(re);
  return m ? m[1] : '';
};

function tipoDoTexto(t) {
  const n = normalize(t);
  if (/\b(apartamento|apto|flat|cobertura|studio|kitnet|loft)\b/.test(n)) return 'apartamento';
  if (/\b(casa|sobrado)\b/.test(n)) return 'casa';
  if (/\b(terreno|lote)\b/.test(n)) return 'terreno';
  if (/\b(sala|conjunto comercial|loja|galpao)\b/.test(n)) return 'comercial';
  return '';
}

/** Dados que o ENDEREÇO do anúncio já traz (ZAP, VivaReal e OLX) */
function lerEndereco(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return {};
  }
  const s = normalize(u.pathname.replace(/[-_/]+/g, ' '));
  const d = {};
  const venda = /\bvenda\b/.test(s);
  const aluguel = /\balugue?l\b/.test(s);
  if (venda || aluguel) d.transacao = venda && aluguel ? 'AMBOS' : venda ? 'VENDA' : 'ALUGUEL';
  // o tipo vem do INÍCIO do slug ("venda-apartamento-…", "casa-4-quartos-…"): nome de edifício/empreendimento vem depois
  d.tipo = tipoDoTexto(s.split(' ').filter(w => w !== 'venda' && w !== 'aluguel' && w !== 'para' && w !== 'a').slice(0, 4).join(' '));
  const q = primeiro(s, /\b(\d{1,2}) quartos?\b/);
  if (q) d.quartos = Number(q);
  const a = primeiro(s, /\b(\d{2,4}) ?m2\b/);
  if (a) d.area = Number(a);
  const p = primeiro(u.pathname, /(?:^|[-/])RS(\d{5,9})(?=[-/]|$)/);
  if (p) d.preco = Number(p);
  return d;
}

/** Número do anúncio na OLX = últimos dígitos do endereço */
const idDoLink = url => primeiro(String(url || '').split('?')[0].replace(/\/+$/, ''), /-(\d{6,})$/);

/**
 * Dados estruturados da PÁGINA do anúncio na OLX (campos do JSON da própria página).
 * Âncora: o número do anúncio (do endereço). Página que não cita esse número (captcha, lista, redirecionada)
 * não vira dado; preço, profissional/particular e anunciante são lidos do bloco desse anúncio, não de "relacionados".
 */
function lerPaginaOlx(html, idAnuncio) {
  const h = String(html || '');
  if (!/"price":"\d+"/.test(h) && !/"professionalAd":/.test(h)) return null;
  let bloco = h;
  if (idAnuncio) {
    const m = h.match(new RegExp(`"listId":${idAnuncio}(?!\\d)`)); // (?!\d): "1" não casa com "1509799842"
    if (!m) return null;
    bloco = h.slice(m.index, m.index + 1500);
  }
  const prof = primeiro(bloco, /"professionalAd":(true|false)/);
  const preco = (idAnuncio && primeiro(h, new RegExp(`"list_id":${idAnuncio}(?!\\d)[^}]{0,400}?"price":"(\\d+)"`))) || primeiro(bloco, /"price":"(\d+)"/) || primeiro(h, /"price":"(\d+)"/);
  const titulo = primeiro(h, /<title>([^<]{5,200})<\/title>/).replace(/\s*\|\s*OLX.*$/i, '');
  const desc = primeiro(h, /"@type":"Product","name":"[^"]*","url":"[^"]*","description":"((?:[^"\\]|\\.){0,1500})"/);
  const texto = `${titulo} ${desc}`.replace(/<br\s*\/?>/gi, ' ');
  const suites = primeiro(normalize(texto), /\b(\d{1,2}) suites?\b/);
  const tipoOlx = primeiro(h, /"real_estate_type":"([^"]*)"/);
  const vagas = primeiro(h, /"garage_spaces":"(\d+)"/);
  return {
    preco: num(preco),
    area: num(primeiro(h, /"size":(\d+)/)),
    quartos: num(primeiro(h, /"rooms":"(\d+)"/)),
    banheiros: num(primeiro(h, /"bathrooms":"(\d+)"/)),
    vagas: vagas === '' ? null : Number(vagas), // null = a página não informa (0 = informa que não tem)
    suites: suites ? Number(suites) : 0, // inferido do texto livre: só serve para "conferir", nunca para reprovar
    bairro: primeiro(h, /"neighbourhood":"([^"]*)"/),
    cidade: primeiro(h, /"municipality":"([^"]*)"/),
    anunciante: primeiro(bloco, /"sellerName":"([^"]*)"/).slice(0, 80),
    profissional: prof === '' ? null : prof === 'true',
    tipo: tipoDoTexto(tipoOlx || titulo),
    transacao: /^venda/i.test(tipoOlx) ? 'VENDA' : /^alugu/i.test(tipoOlx) ? 'ALUGUEL' : '',
    titulo: titulo.slice(0, 140)
  };
}

/**
 * Julga os dados contra o pedido (mesmas tolerâncias de `dentroDoPedido`: ±5% no preço/área).
 * Só reprova com dado LIDO; dado ausente nunca reprova. Retorna { ok, motivo, conferir:[…] }.
 */
function avaliar(d, c) {
  const conferir = [];
  if (d.transacao && d.transacao !== 'AMBOS' && c.transacao && d.transacao !== c.transacao) return { ok: false, motivo: `é ${d.transacao.toLowerCase()}` };
  const tipos = (c.tipos || []).map(tipoDoTexto).filter(Boolean);
  if (d.tipo && tipos.length && !tipos.includes(d.tipo)) return { ok: false, motivo: `é ${d.tipo}` };
  if (d.cidade && c.local && c.local.cidades && c.local.cidades.length && !c.local.cidades.some(x => normalize(x) === normalize(d.cidade))) return { ok: false, motivo: `cidade ${d.cidade}` };
  const bairros = (c.local && !c.local.condominios.length && !c.local.edificios.length && c.local.bairros) || [];
  if (d.bairro && bairros.length) {
    const b = normalize(d.bairro);
    if (!bairros.some(x => { const n = normalize(typeof x === 'string' ? x : x.name); return n && (b.includes(n) || n.includes(b)); })) return { ok: false, motivo: `bairro ${d.bairro}` };
  }
  if (d.preco) {
    if (c.valor_max && d.preco > c.valor_max * 1.05) return { ok: false, motivo: 'acima do valor' };
    if (c.valor_min && d.preco < c.valor_min * 0.95) return { ok: false, motivo: 'abaixo do valor' };
  } else if (c.valor_min || c.valor_max) conferir.push('preço');
  if (d.area) {
    if (c.area_min && d.area < c.area_min * 0.95) return { ok: false, motivo: 'área menor' };
    if (c.area_max && d.area > c.area_max * 1.05) return { ok: false, motivo: 'área maior' };
  }
  if (c.quartos_min) {
    if (d.quartos && d.quartos < c.quartos_min) return { ok: false, motivo: 'poucos quartos' };
    if (!d.quartos) conferir.push('quartos');
  }
  if (c.suites_min) {
    // suíte vem de texto livre ("2 quartos sendo 1 suíte master"): não reprova, só pede conferência
    if (!d.suites || d.suites < c.suites_min) conferir.push('suítes');
  }
  if (c.vagas_min) {
    if (d.vagas != null && d.vagas < c.vagas_min) return { ok: false, motivo: 'poucas vagas' };
    if (d.vagas == null) conferir.push('vagas');
  }
  return { ok: true, conferir };
}

/** Só endereços de ANÚNCIO da OLX, https, host da OLX (nunca um endereço qualquer vindo da resposta) */
function urlLegivel(url, { portalDaUrl, ehPaginaDeAnuncio }) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && portalDaUrl(url) === 'olx.com.br' && ehPaginaDeAnuncio(url);
  } catch {
    return false;
  }
}

async function baixarPagina(url, fetcher, timeoutMs = 12000) {
  const r = await fetcher(url, { headers: CABECALHOS, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) return { erro: `HTTP ${r.status}` };
  const len = Number(r.headers && r.headers.get && r.headers.get('content-length'));
  if (len > MAX_BYTES) return { erro: 'página grande demais' };
  if (r.body && typeof r.body.getReader === 'function') {
    // lê aos pedaços e para no teto (resposta sem Content-Length não enche a memória)
    const reader = r.body.getReader();
    const partes = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) {
        await reader.cancel().catch(() => {});
        return { erro: 'página grande demais' };
      }
      partes.push(Buffer.from(value));
    }
    return { html: Buffer.concat(partes).toString('utf8') };
  }
  const html = await r.text();
  return html.length > MAX_BYTES ? { erro: 'página grande demais' } : { html };
}

/**
 * Lê os dados de cada link do catálogo e julga o pedido.
 * Retorna { decididos:[{cat, dados, tipoExato}], aCurar:[cat com conteudo enriquecido], descartados:n, lidas:n, falhas:n }
 *  - decididos: dados lidos da PÁGINA (OLX) e que atendem ao pedido (a IA nem precisa olhar)
 *  - aCurar: sobra (ZAP/VivaReal, ou OLX que não abriu) com o que o endereço já diz; reprovados pelo endereço saem
 *  - descartados: reprovados com dado lido (não aparecem nem em "outras páginas")
 */
async function lerAnuncios({ catalogo, criterios, fetcher = fetch, portalDaUrl, ehPaginaDeAnuncio, abrirPaginas = true }) {
  const out = { decididos: [], aCurar: [], descartados: new Set(), lidas: 0, falhas: 0, motivos: {} };
  const falhou = m => {
    out.falhas++;
    out.motivos[m] = (out.motivos[m] || 0) + 1;
  };
  const paraLer = abrirPaginas ? catalogo.filter(x => urlLegivel(x.url, { portalDaUrl, ehPaginaDeAnuncio })).slice(0, MAX_PAGINAS) : [];
  const paginas = new Map();
  const fim = Date.now() + TETO_TOTAL_MS;
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(SIMULTANEAS, paraLer.length) }, async () => {
      while (i < paraLer.length && Date.now() < fim) {
        const cat = paraLer[i++];
        try {
          const b = await baixarPagina(cat.url, fetcher, Math.max(1000, Math.min(12000, fim - Date.now())));
          const d = b.html ? lerPaginaOlx(b.html, idDoLink(cat.url)) : null;
          if (d) {
            paginas.set(cat.id, d);
            out.lidas++;
          } else falhou(b.erro || 'página sem dados do anúncio');
        } catch (err) {
          falhou(err && err.name === 'TimeoutError' ? 'tempo esgotado' : String((err && ((err.cause && err.cause.code) || err.message)) || 'erro').slice(0, 40));
        }
      }
    })
  );
  const naoTentadas = paraLer.length - out.lidas - out.falhas;
  for (let k = 0; k < naoTentadas; k++) falhou('sem tempo (teto de 25 s)');
  for (const cat of catalogo) {
    const doEndereco = lerEndereco(cat.url);
    const pagina = paginas.get(cat.id);
    const dados = pagina ? { ...doEndereco, ...Object.fromEntries(Object.entries(pagina).filter(([, v]) => v !== '' && v !== null && v !== 0)), vagas: pagina.vagas, fonte: 'pagina' } : { ...doEndereco, fonte: 'endereco' };
    const av = avaliar(dados, criterios);
    if (!av.ok) {
      out.descartados.add(cat.id);
      continue;
    }
    if (pagina) out.decididos.push({ cat, dados, conferir: av.conferir, tipoExato: pagina.profissional === null ? '' : pagina.profissional ? 'profissional' : 'particular' });
    else {
      const fatos = [dados.transacao && dados.transacao.toLowerCase(), dados.tipo, dados.quartos && `${dados.quartos} quartos`, dados.area && `${dados.area} m²`, dados.preco && `R$ ${dados.preco} (preço no endereço)`].filter(Boolean).join(', ');
      out.aCurar.push({ ...cat, conteudo: `${fatos ? `[do endereço: ${fatos}] ` : ''}${cat.conteudo || ''}`.slice(0, 560), dadosEndereco: dados });
    }
  }
  return out;
}

const URL_TESTE_OLX = 'https://go.olx.com.br/grande-goiania-e-anapolis/imoveis/talk-marista-apartamento-com-3-quarto-s-e-4-banheiro-s-a-venda-140-00-por-r-1450000-00-1509799842';

/** Abre UMA página de anúncio da OLX a partir desta máquina e diz o que aconteceu (comando "testar olx") */
async function diagnosticarOlx({ fetcher = fetch, url = URL_TESTE_OLX } = {}) {
  const serp = require('./busca-serp');
  if (!urlLegivel(url, { portalDaUrl: serp.portalDaUrl, ehPaginaDeAnuncio: serp.ehPaginaDeAnuncio })) return { ok: false, invalida: true };
  const ini = Date.now();
  try {
    const r = await fetcher(url, { headers: CABECALHOS, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const html = await r.text().catch(() => '');
    const titulo = String((html.match(/<title>([^<]{1,100})<\/title>/i) || [])[1] || '').trim();
    const dados = r.ok ? lerPaginaOlx(html, idDoLink(url)) : null;
    return { ok: Boolean(dados), status: r.status, ms: Date.now() - ini, kb: Math.round(html.length / 1024), servidor: String((r.headers && r.headers.get && r.headers.get('server')) || ''), titulo, dados };
  } catch (err) {
    return { ok: false, status: 0, ms: Date.now() - ini, erro: err && err.name === 'TimeoutError' ? 'tempo esgotado (15 s)' : String((err && ((err.cause && err.cause.code) || err.message)) || 'erro').slice(0, 80) };
  }
}

function textoDiagnosticoOlx(r) {
  if (r.invalida) return '❌ Mande o link de UM anúncio da OLX (https://go.olx.com.br/…/imoveis/…-número), ou só *testar olx* para usar um de exemplo.';
  const seg = r.ms ? ` em ${(r.ms / 1000).toFixed(1).replace('.', ',')} s` : '';
  if (r.ok) {
    const d = r.dados;
    return `✅ A OLX respondeu${seg} (HTTP ${r.status}, ${r.kb} KB) e eu li o anúncio: R$ ${Number(d.preco).toLocaleString('pt-BR')} · ${d.area} m² · ${d.quartos}q${d.vagas != null ? ` · ${d.vagas} vagas` : ''} · ${d.profissional === null ? 'anunciante?' : d.profissional ? 'Profissional' : 'Particular'}${d.anunciante ? ` (${d.anunciante})` : ''}.\nA leitura das páginas funciona nesta máquina.`;
  }
  if (r.erro) return `❌ Não consegui nem falar com a OLX${seg}: ${r.erro}.\nSem a leitura, a busca usa só o Gemini (sem preço exato).`;
  if (r.status === 403 || r.status === 429 || r.status === 503) return `❌ A OLX recusou esta máquina (HTTP ${r.status}${r.servidor ? `, servidor: ${r.servidor}` : ''}${r.titulo ? `, página: "${r.titulo}"` : ''}).\nProvavelmente ela bloqueia IP de servidor. Sem a leitura, a busca usa só o Gemini (sem preço exato).`;
  if (r.status >= 300 && r.status < 400) return `❌ A OLX mandou redirecionar (HTTP ${r.status}). Me avise para eu ajustar.`;
  if (r.status === 200) return `⚠️ A OLX respondeu (HTTP 200, ${r.kb} KB) mas a página não trouxe os dados do anúncio${r.titulo ? ` (título: "${r.titulo}")` : ''}. Pode ser um desafio anti-robô ou um anúncio que saiu do ar. Tente com outro link: *testar olx <link do anúncio>*.`;
  return `❌ A OLX respondeu HTTP ${r.status}${seg}. Me avise para eu ajustar.`;
}

module.exports = { diagnosticarOlx, textoDiagnosticoOlx, idDoLink, lerEndereco, lerPaginaOlx, avaliar, lerAnuncios, urlLegivel, tipoDoTexto };
