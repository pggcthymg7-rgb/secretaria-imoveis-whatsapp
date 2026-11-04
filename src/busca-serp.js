/**
 * ============================================================================
 * MOTOR DE BUSCA DESACOPLADO (Tavily / Serper / Brave) — Camada 2 da busca nos portais
 * ============================================================================
 * Acha ANÚNCIOS INDIVIDUAIS nos portais por uma API de busca (não pelo Google Search do Gemini,
 * que no plano grátis costuma ter cota zero). Só HTTP nativo (fetch), sem dependências.
 * Devolve um catálogo numerado de resultados REAIS; a leitura e a escolha ficam por conta do
 * Gemini sem ferramentas (busca-curadoria.js) e a trava anti-invenção confere cada link.
 * ============================================================================
 */

const PORTAIS = {
  'olx.com.br': 'OLX',
  'zapimoveis.com.br': 'ZAP Imóveis',
  'vivareal.com.br': 'VivaReal'
};

const norm = s =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Qual portal é essa URL? (aceita subdomínio: go.olx.com.br, www.zapimoveis.com.br) */
function portalDaUrl(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return Object.keys(PORTAIS).find(d => h === d || h.endsWith(`.${d}`)) || null;
  } catch {
    return null;
  }
}

/**
 * A URL é de UM anúncio (e não de uma página de lista/categoria/busca)?
 * - ZAP e VivaReal: caminho /imovel/… (com id)
 * - OLX: /imoveis/… terminando em -ID numérico, sem ?q= de listagem
 */
function ehPaginaDeAnuncio(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const portal = portalDaUrl(url);
  const caminho = u.pathname.replace(/\/+$/, '');
  if (portal === 'zapimoveis.com.br' || portal === 'vivareal.com.br') return /^\/imovel\//.test(u.pathname) && /(?:^|[-/])id-\d{5,}$/.test(caminho);
  if (portal === 'olx.com.br') return /\/imoveis\//.test(u.pathname) && /-\d{6,}$/.test(caminho) && !u.searchParams.has('q');
  return false;
}

// ---------------------------------------------------------------------------
// Consultas cirúrgicas (uma por portal)
// ---------------------------------------------------------------------------
/** Termos do pedido: local (condomínio/edifício ou bairro), tipo, cidade */
function termosDoPedido(c) {
  const f = c.filtros || {};
  const local = f.local || f.bairro || (c.local.condominios[0] && c.local.condominios[0].name) || (c.local.edificios[0] && c.local.edificios[0].name) || c.local.bairros[0] || '';
  const tipo = (c.tipos && c.tipos[0]) || '';
  const cidade = (c.local.cidades.find(x => x !== 'Goiânia') || 'Goiânia').trim();
  return { local, tipo, cidade, aluguel: c.transacao === 'ALUGUEL', quartos: c.quartos_min || 0 };
}

/**
 * Consulta no estilo Google (Serper/Brave aceitam o operador site:).
 * OLX: o anúncio real é go.olx.com.br/<região>/imoveis/<slug>-<id> — a região vem ANTES de /imoveis,
 * então `site:olx.com.br/imoveis` não casa com nenhum anúncio (só com listas).
 */
function consultaSite(portal, t) {
  const aspas = s => (s ? `"${s}"` : '');
  const base = { 'olx.com.br': 'site:go.olx.com.br', 'zapimoveis.com.br': 'site:zapimoveis.com.br/imovel', 'vivareal.com.br': 'site:vivareal.com.br/imovel' }[portal];
  return [base, aspas(t.cidade), aspas(t.local), aspas(t.tipo), t.aluguel ? 'aluguel' : 'venda'].filter(Boolean).join(' ');
}

/** Consulta solta (sem aspas nem caminho): usada quando a precisa não acha nada */
function consultaSolta(portal, t) {
  const base = { 'olx.com.br': 'site:go.olx.com.br', 'zapimoveis.com.br': 'site:zapimoveis.com.br/imovel', 'vivareal.com.br': 'site:vivareal.com.br/imovel' }[portal] || `site:${portal}`;
  return [base, t.tipo, t.local, t.cidade, t.aluguel ? 'aluguel' : 'venda'].filter(Boolean).join(' ');
}

/** Consulta solta + número de quartos (o endereço do ZAP/VivaReal traz "3-quartos"): pega anúncios que as outras deixaram passar */
function consultaQuartos(portal, t) {
  const base = { 'olx.com.br': 'site:go.olx.com.br', 'zapimoveis.com.br': 'site:zapimoveis.com.br/imovel', 'vivareal.com.br': 'site:vivareal.com.br/imovel' }[portal] || `site:${portal}`;
  return [base, t.tipo, t.quartos ? `${t.quartos} quartos` : '', t.local, t.cidade, t.aluguel ? 'aluguel' : 'venda'].filter(Boolean).join(' ');
}

/** Variantes da consulta, da mais precisa à mais ampla. A rodada N só roda nos portais que ainda têm poucos anúncios. */
const VARIANTES = [{ q: 'precisa' }, { q: 'solta' }, { q: 'solta', pagina: 2 }, { q: 'quartos' }];
const consultaDa = (portal, t, v) => (v.q === 'solta' ? consultaSolta(portal, t) : v.q === 'quartos' ? consultaQuartos(portal, t) : consultaSite(portal, t));

/** Consulta em texto simples (Tavily é semântico: o domínio vai em include_domains) */
function consultaSimples(t) {
  return [t.tipo, t.aluguel ? 'para alugar' : 'à venda', t.local, t.cidade, 'GO'].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Adaptadores (um por provedor)
// ---------------------------------------------------------------------------
const chaveDe = (env, ...nomes) => {
  for (const n of nomes) {
    const v = String((env && env[n]) || '').replace(/\s+/g, '').trim();
    if (v) return v;
  }
  return '';
};

/** Provedores configurados, do preferido ao último */
function provedoresConfigurados(env = process.env) {
  const lista = [];
  if (chaveDe(env, 'TAVILY_API_KEY')) lista.push('tavily');
  if (chaveDe(env, 'SERPER_API_KEY')) lista.push('serper');
  if (chaveDe(env, 'BRAVE_SEARCH_API_KEY', 'BRAVE_API_KEY')) lista.push('brave');
  return lista;
}

async function lerJson(r) {
  try {
    return await r.json();
  } catch {
    return {};
  }
}
const erroDe = (r, j) => String((j && (j.detail?.error || j.detail || j.error || j.message || j.message)) || r.status).slice(0, 240);

async function tavily({ env, fetcher, portal, t }) {
  const r = await fetcher('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chaveDe(env, 'TAVILY_API_KEY')}` },
    body: JSON.stringify({ query: consultaSimples(t), search_depth: 'basic', max_results: 20, include_domains: [portal] }),
    signal: AbortSignal.timeout(30000)
  });
  const j = await lerJson(r);
  if (!r.ok) throw Object.assign(new Error(erroDe(r, j)), { status: r.status });
  return (j.results || []).map(x => ({ url: x.url, titulo: x.title, conteudo: x.content }));
}

async function serper({ env, fetcher, portal, t, variante = VARIANTES[0] }) {
  const r = await fetcher('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': chaveDe(env, 'SERPER_API_KEY') },
    body: JSON.stringify({ q: consultaDa(portal, t, variante), gl: 'br', hl: 'pt-br', num: 10, ...(variante.pagina > 1 ? { page: variante.pagina } : {}) }),
    signal: AbortSignal.timeout(30000)
  });
  const j = await lerJson(r);
  if (!r.ok) throw Object.assign(new Error(erroDe(r, j)), { status: r.status });
  return (j.organic || []).map(x => ({ url: x.link, titulo: x.title, conteudo: x.snippet }));
}

async function brave({ env, fetcher, portal, t, variante = VARIANTES[0] }) {
  const q = new URLSearchParams({ q: consultaDa(portal, t, variante), country: 'BR', search_lang: 'pt', count: '10', ...(variante.pagina > 1 ? { offset: String(variante.pagina - 1) } : {}) });
  const r = await fetcher(`https://api.search.brave.com/res/v1/web/search?${q}`, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': chaveDe(env, 'BRAVE_SEARCH_API_KEY', 'BRAVE_API_KEY') },
    signal: AbortSignal.timeout(30000)
  });
  const j = await lerJson(r);
  if (!r.ok) throw Object.assign(new Error(erroDe(r, j)), { status: r.status });
  return ((j.web && j.web.results) || []).map(x => ({ url: x.url, titulo: x.title, conteudo: x.description }));
}

const ADAPTADORES = { tavily, serper, brave };
const NOME = { tavily: 'Tavily', serper: 'Serper', brave: 'Brave' };

/**
 * Busca os anúncios nos portais pedidos (uma consulta por portal, em paralelo).
 * Retorna { ok, provedor, catalogo:[{id,portal,url,titulo,conteudo}], buscas } ou { ok:false, motivo, detalhe, provedor }.
 * Tenta o próximo provedor configurado se o primeiro der erro.
 */
async function buscarAnuncios({ criterios, dominios, env = process.env, fetcher = fetch, limite = 36 }) {
  const provedores = provedoresConfigurados(env);
  if (!provedores.length) return { ok: false, motivo: 'sem_chave_busca', provedor: null };
  const t = termosDoPedido(criterios);
  let ultimoErro = null;
  for (const p of provedores) {
    const vistos = new Set();
    const catalogo = [];
    const diag = {}; // por portal: { brutos: páginas devolvidas, anuncios: páginas de anúncio aceitas }
    let falhasParciais = 0;
    let todasFalharam = true;
    let erroFalha = null;
    // Rodada 1: consulta precisa em todos os portais. Rodadas seguintes (solta, solta página 2, por quartos):
    // só nos portais que ainda têm POUCOS anúncios (< minimo). Antes a solta só rodava com ZERO anúncios,
    // e o ZAP/VivaReal (páginas feitas em JavaScript, que o Google guarda pouco) ficavam com 1 ou 2.
    const minimo = Number(env.BUSCA_MIN_POR_PORTAL) || 8;
    const rodadas = p === 'tavily' ? 1 : Math.min(VARIANTES.length, Math.max(1, Number(env.BUSCA_RODADAS) || 3));
    for (let rodada = 0; rodada < rodadas; rodada++) {
      const variante = VARIANTES[rodada];
      const solta = rodada > 0;
      const alvo = rodada ? dominios.filter(d => ((diag[d] && diag[d].anuncios) || 0) < minimo) : dominios;
      if (!alvo.length || catalogo.length >= limite) break;
      const resultados = await Promise.allSettled(alvo.map(d => ADAPTADORES[p]({ env, fetcher, portal: d, t, solta, variante }).then(lista => ({ d, lista }))));
      const falhas = resultados.filter(r => r.status === 'rejected');
      if (falhas.length === resultados.length) {
        if (!solta) erroFalha = falhas[0].reason || {};
        break;
      }
      if (!solta) falhasParciais = falhas.length;
      todasFalharam = false;
      for (const r of resultados) {
        if (r.status !== 'fulfilled') continue;
        const dg = (diag[r.value.d] = diag[r.value.d] || { brutos: 0, anuncios: 0, descartadas: [] });
        for (const x of r.value.lista) {
          dg.brutos++;
          const portal = portalDaUrl(x.url);
          if (!portal || !dominios.includes(portal) || !ehPaginaDeAnuncio(x.url)) {
            if (dg.descartadas.length < 2) {
              try {
                const caminho = new URL(x.url).pathname.slice(0, 70);
                if (!dg.descartadas.includes(caminho)) dg.descartadas.push(caminho);
              } catch {}
            }
            continue;
          }
          const chave = (() => {
            const u = new URL(x.url);
            return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
          })();
          if (vistos.has(chave)) continue;
          vistos.add(chave);
          dg.anuncios++;
          catalogo.push({ id: catalogo.length + 1, portal: PORTAIS[portal], dominio: portal, url: x.url, titulo: String(x.titulo || '').slice(0, 160), conteudo: String(x.conteudo || '').replace(/\s+/g, ' ').slice(0, 500) });
          if (catalogo.length >= limite) break;
        }
      }
    }
    if (todasFalharam) {
      const e = erroFalha || {};
      ultimoErro = { ok: false, motivo: e.status === 429 ? 'cota_busca' : e.status === 401 || e.status === 403 ? 'chave_busca_recusada' : 'erro_busca', detalhe: String(e.message || e).slice(0, 240), provedor: NOME[p] };
      continue; // próximo provedor
    }
    return { ok: true, provedor: NOME[p], catalogo, buscas: dominios.length, falhasParciais, diag };
  }
  return ultimoErro;
}

/** Teste barato (1 resultado) do provedor principal — usado no diagnóstico */
async function testarProvedor(p, { env = process.env, fetcher = fetch } = {}) {
  try {
    const lista = await ADAPTADORES[p]({ env, fetcher, portal: 'zapimoveis.com.br', t: { local: 'Setor Marista', tipo: 'apartamento', cidade: 'Goiânia', aluguel: false } });
    return { ok: true, resultados: lista.length };
  } catch (e) {
    return { ok: false, status: e.status || 0, mensagem: String(e.message || e).slice(0, 200) };
  }
}

module.exports = { consultaQuartos, VARIANTES, PORTAIS, NOME, portalDaUrl, ehPaginaDeAnuncio, termosDoPedido, consultaSite, consultaSimples, consultaSolta, provedoresConfigurados, buscarAnuncios, testarProvedor, norm };
