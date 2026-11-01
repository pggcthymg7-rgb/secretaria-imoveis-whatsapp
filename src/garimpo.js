/**
 * ============================================================================
 * GARIMPO — agente que procura clientes na internet 24h (dentro da lei)
 * ============================================================================
 * Fontes usadas (todas oficiais/públicas):
 *  1. BUSCA NA WEB (Brave Search API ou Google Programmable Search): posts e páginas
 *     públicas da última semana onde alguém pede imóvel em Goiânia ("procuro
 *     apartamento", "alguém indica casa"...). Cada resultado passa pelo cérebro da
 *     BIGA (tipo, bairro, preço, quartos) e é cruzado com a sua carteira.
 *  2. SEUS POSTS no Instagram/Facebook (Graph API oficial da Meta): comentários de
 *     quem pergunta "valor?", "ainda disponível?", "tenho interesse"...
 *  3. CAMPANHAS: links prontos para as bibliotecas oficiais de anúncios (Meta,
 *     Google, TikTok) e para o Google Trends da região.
 *
 * O que NÃO é feito, de propósito:
 *  - Saber quem pesquisa no Google ou quem visita portais: esses dados são privados
 *    das empresas e não existem em nenhuma API.
 *  - Ler comentários de posts de OUTRAS pessoas/empresas no Instagram/TikTok/Facebook:
 *    viola os termos das plataformas (risco de bloqueio da sua conta) e a LGPD.
 *  Guardamos só o link público, o trecho e o nome exibido, por no máximo 30 dias.
 * ============================================================================
 */
const crypto = require('crypto');
const { readJson, writeJson } = require('./store');
const { parseRequest } = require('./brain/parser');
const { evaluateInventory } = require('./brain/engine');
const { buildIndex } = require('./brain/locations');

const FILE = 'garimpo.json';
const MAX_LEADS = 600;
const RETENCAO_DIAS = 30;

const DEFAULT_QUERIES = [
  '"procuro apartamento" Goiânia',
  '"procuro casa" Goiânia',
  '"quero comprar" apartamento Goiânia',
  '"alguém indica" imóvel Goiânia',
  '"procuro imóvel" Goiânia',
  '"procuro" apartamento "Setor Bueno" OR "Setor Marista" OR "Setor Oeste"',
  'site:facebook.com "procuro" apartamento Goiânia',
  'site:instagram.com "procuro apartamento" Goiânia',
  'site:reddit.com Goiânia apartamento comprar',
  '"procuro" casa condomínio Goiânia OR "Aparecida de Goiânia"'
];

const DEFAULT_TERMOS = ['imóveis Goiânia', 'apartamento Goiânia', 'casa condomínio Goiânia', 'lançamento Goiânia', 'imobiliária Goiânia'];

let state = readJson(FILE, () => ({
  config: { ativo: false, intervaloHoras: 6, consultas: DEFAULT_QUERIES, termosCampanha: DEFAULT_TERMOS, alertarNoWhatsApp: true },
  leads: [],
  execucoes: [],
  ultimaExecucao: 0
}));
state.config = { ativo: false, intervaloHoras: 6, consultas: DEFAULT_QUERIES, termosCampanha: DEFAULT_TERMOS, alertarNoWhatsApp: true, ...(state.config || {}) };
state.leads = Array.isArray(state.leads) ? state.leads : [];
state.execucoes = Array.isArray(state.execucoes) ? state.execucoes : [];
let running = false;

function save() {
  const limite = Date.now() - RETENCAO_DIAS * 86400000;
  state.leads = state.leads.filter(l => l.encontradoEm >= limite).slice(0, MAX_LEADS);
  state.execucoes = state.execucoes.slice(0, 40);
  writeJson(FILE, state);
}

const idOf = (...parts) => crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
const clean = (s, max = 600) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// ---------------------------------------------------------------------------
// Classificadores
// ---------------------------------------------------------------------------
const INTERESSE_RX = /\b(valor|preco|preço|quanto|qto|info|informa[cç](ao|ões|oes)|interess|dispon[ií]vel|ainda tem|tem ainda|mais fotos|localiza[cç]|endere[cç]o|visita|whats|zap|chama|me chama|dm|direct|inbox|pv|privado|financia|aceita|entrada|parcela|metragem|m2|quartos?)\b|\?$/i;
const OFERTA_RX = /\b(vendo|alugo|à venda|a venda|vende-se|aluga-se|lançamento|corretor(a)? de imóveis|imobiliária|creci|anuncie|confira|agende sua visita)\b/i;

/** Trecho público é um pedido de imóvel? Retorna a análise ou null */
function classifyDemand(text, inventory, index = buildIndex({ inventory })) {
  const t = clean(text, 1200);
  if (t.length < 15) return null;
  const c = parseRequest(t, { index });
  if (c.intent !== 'BUSCA') return null;
  if (OFERTA_RX.test(t) && !/\b(procuro|busco|preciso|quero comprar|alguém indica|alguem indica)\b/i.test(t)) return null;
  const ev = evaluateInventory(inventory, c, index);
  return { criteria: c, matches: ev.matches.slice(0, 3).map(m => m.property.id), quase: ev.quase.slice(0, 3).map(q => q.property.id), criterios: ev.criteriaCount };
}

function scoreLead({ matches, criterios, recente, fonte }) {
  let s = 40;
  if (matches && matches.length) s += 30;
  s += Math.min(15, (criterios || 0) * 5);
  if (recente) s += 10;
  if (fonte === 'instagram' || fonte === 'facebook') s += 5; // interagiu com o SEU post
  return Math.min(100, s);
}

function addLead(lead) {
  if (!/^https:\/\/|^http:\/\//i.test(String(lead.link || ''))) return false; // só links web (nada de javascript:)
  lead.link = String(lead.link).slice(0, 800);
  if (state.leads.some(l => l.id === lead.id)) return false;
  state.leads.unshift({ status: 'NOVO', encontradoEm: Date.now(), ...lead });
  return true;
}

// ---------------------------------------------------------------------------
// Fonte 1: busca na web
// ---------------------------------------------------------------------------
async function searchWeb(query, env, fetcher) {
  if (env.BRAVE_API_KEY) {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&freshness=pw&country=BR&search_lang=pt-br&count=20`;
    const r = await fetcher(url, { headers: { Accept: 'application/json', 'X-Subscription-Token': env.BRAVE_API_KEY }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`Brave HTTP ${r.status}`);
    const j = await r.json();
    return ((j.web && j.web.results) || []).map(x => ({ titulo: x.title, texto: `${x.title}. ${x.description || ''} ${(x.extra_snippets || []).join(' ')}`, link: x.url, data: x.page_age || x.age || null }));
  }
  if (env.GOOGLE_CSE_KEY && env.GOOGLE_CSE_CX) {
    const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(env.GOOGLE_CSE_KEY)}&cx=${encodeURIComponent(env.GOOGLE_CSE_CX)}&q=${encodeURIComponent(query)}&dateRestrict=w1&gl=br&lr=lang_pt&num=10`;
    const r = await fetcher(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`Google HTTP ${r.status}`);
    const j = await r.json();
    return (j.items || []).map(x => ({ titulo: x.title, texto: `${x.title}. ${x.snippet || ''}`, link: x.link, data: (x.pagemap && x.pagemap.metatags && x.pagemap.metatags[0] && x.pagemap.metatags[0]['article:published_time']) || null }));
  }
  return null; // sem chave configurada
}

// ---------------------------------------------------------------------------
// Fonte 2: comentários nos SEUS posts (Graph API oficial)
// ---------------------------------------------------------------------------
const GRAPH = 'https://graph.facebook.com/v21.0';
async function graph(path, token, fetcher) {
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetcher(`${GRAPH}/${path}${sep}access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`Meta: ${(j.error && j.error.message) || r.status}`);
  return j;
}

async function ownComments(env, fetcher) {
  const out = [];
  const since = Date.now() - 7 * 86400000;
  if (env.META_PAGE_TOKEN && env.META_PAGE_ID) {
    const posts = await graph(`${env.META_PAGE_ID}/posts?fields=id,message,permalink_url,created_time&limit=15`, env.META_PAGE_TOKEN, fetcher);
    for (const p of posts.data || []) {
      const cm = await graph(`${p.id}/comments?fields=id,from{name},message,created_time,permalink_url&limit=50&filter=stream`, env.META_PAGE_TOKEN, fetcher);
      for (const c of cm.data || []) {
        if (new Date(c.created_time).getTime() < since) continue;
        out.push({ fonte: 'facebook', id: c.id, autor: c.from && c.from.name, texto: c.message, link: c.permalink_url || p.permalink_url, post: clean(p.message, 120), data: c.created_time });
      }
    }
  }
  if (env.META_PAGE_TOKEN && env.META_IG_USER_ID) {
    const media = await graph(`${env.META_IG_USER_ID}/media?fields=id,caption,permalink,timestamp&limit=15`, env.META_PAGE_TOKEN, fetcher);
    for (const m of media.data || []) {
      const cm = await graph(`${m.id}/comments?fields=id,username,text,timestamp&limit=50`, env.META_PAGE_TOKEN, fetcher);
      for (const c of cm.data || []) {
        if (new Date(c.timestamp).getTime() < since) continue;
        out.push({ fonte: 'instagram', id: c.id, autor: c.username ? `@${c.username}` : '', texto: c.text, link: m.permalink, post: clean(m.caption, 120), data: c.timestamp });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fonte 3: campanhas e tendências (links oficiais)
// ---------------------------------------------------------------------------
function campaignLinks(termos = state.config.termosCampanha) {
  return (termos || []).slice(0, 12).map(t => ({
    termo: t,
    meta: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&q=${encodeURIComponent(t)}&search_type=keyword_unordered&media_type=all`,
    google: `https://adstransparency.google.com/?region=BR&query=${encodeURIComponent(t)}`,
    tiktok: `https://library.tiktok.com/ads?region=BR&adv_name=${encodeURIComponent(t)}`,
    trends: `https://trends.google.com.br/trends/explore?date=now%207-d&geo=BR-GO&q=${encodeURIComponent(t)}`
  }));
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------
/**
 * Roda uma varredura completa. deps = { env, fetcher, inventory, extraPlaces, onLeads }
 */
async function run(deps) {
  if (running) return { ok: false, erro: 'já existe uma varredura em andamento' };
  running = true;
  const env = deps.env || process.env;
  const fetcher = deps.fetcher || fetch;
  const inventory = deps.inventory || [];
  const index = buildIndex({ extraPlaces: deps.extraPlaces || [], inventory });
  const resumo = { inicio: Date.now(), web: 0, social: 0, novos: 0, erros: [], semChave: [] };
  const novos = [];
  try {
    // 1) Web
    let webOk = false;
    for (const q of (state.config.consultas || []).slice(0, 15)) {
      try {
        const results = await searchWeb(q, env, fetcher);
        if (results === null) {
          resumo.semChave.push('busca na web (BRAVE_API_KEY ou GOOGLE_CSE_KEY/CX)');
          break;
        }
        webOk = true;
        for (const r of results) {
          resumo.web++;
          const an = classifyDemand(r.texto, inventory, index);
          if (!an) continue;
          const lead = {
            id: idOf('web', r.link),
            fonte: 'web',
            titulo: clean(r.titulo, 160),
            texto: clean(r.texto, 500),
            link: r.link,
            data: r.data,
            consulta: q,
            resumo: an.criteria.resumo,
            matches: an.matches,
            quase: an.quase,
            score: scoreLead({ matches: an.matches, criterios: an.criterios, recente: true, fonte: 'web' })
          };
          if (addLead(lead)) novos.push(lead);
        }
      } catch (err) {
        resumo.erros.push(`${q}: ${err.message}`);
      }
      await new Promise(r => setTimeout(r, deps.pausaMs ?? 1200));
    }
    if (!webOk && !resumo.semChave.length) resumo.semChave.push('busca na web');

    // 2) Seus posts
    if (env.META_PAGE_TOKEN && (env.META_PAGE_ID || env.META_IG_USER_ID)) {
      try {
        for (const c of await ownComments(env, fetcher)) {
          resumo.social++;
          const txt = clean(c.texto, 500);
          if (!INTERESSE_RX.test(txt)) continue;
          const an = classifyDemand(`procuro ${txt}`, inventory, index);
          const lead = {
            id: idOf(c.fonte, c.id),
            fonte: c.fonte,
            titulo: `${c.autor || 'Alguém'} comentou no seu post`,
            texto: txt,
            autor: clean(c.autor, 80),
            link: c.link,
            post: c.post,
            data: c.data,
            resumo: an ? an.criteria.resumo : 'interesse no seu anúncio',
            matches: an ? an.matches : [],
            quase: [],
            score: scoreLead({ matches: an ? an.matches : [], criterios: an ? an.criterios : 0, recente: true, fonte: c.fonte })
          };
          if (addLead(lead)) novos.push(lead);
        }
      } catch (err) {
        resumo.erros.push(err.message);
      }
    } else {
      resumo.semChave.push('seus posts (META_PAGE_TOKEN + META_PAGE_ID / META_IG_USER_ID)');
    }

    state.leads.sort((a, b) => b.encontradoEm - a.encontradoEm || b.score - a.score);
    resumo.novos = novos.length;
    resumo.fim = Date.now();
    state.ultimaExecucao = Date.now();
    state.execucoes.unshift(resumo);
    save();
    if (novos.length && deps.onLeads) await deps.onLeads(novos);
    return { ok: true, ...resumo };
  } finally {
    running = false;
  }
}

/** Chamado pelo agendador: roda se estiver ligado e passou o intervalo */
async function tick(deps) {
  const cfg = state.config;
  if (!cfg.ativo) return null;
  const due = Date.now() - (state.ultimaExecucao || 0) >= Math.max(1, Number(cfg.intervaloHoras) || 6) * 3600000;
  if (!due) return null;
  return run(deps);
}

function updateConfig(input = {}) {
  const c = { ...state.config };
  if (input.ativo !== undefined) c.ativo = Boolean(input.ativo);
  if (input.alertarNoWhatsApp !== undefined) c.alertarNoWhatsApp = Boolean(input.alertarNoWhatsApp);
  if (input.intervaloHoras !== undefined) c.intervaloHoras = Math.min(48, Math.max(2, parseInt(input.intervaloHoras, 10) || 6));
  const lines = v => String(v || '').split('\n').map(x => x.trim()).filter(Boolean);
  if (typeof input.consultas === 'string') c.consultas = lines(input.consultas).slice(0, 15).map(x => x.slice(0, 200));
  if (typeof input.termosCampanha === 'string') c.termosCampanha = lines(input.termosCampanha).slice(0, 12).map(x => x.slice(0, 80));
  state.config = c;
  save();
  return c;
}

function setLeadStatus(id, status) {
  const l = state.leads.find(x => x.id === id);
  if (!l) throw Object.assign(new Error('Lead não encontrado.'), { status: 404 });
  if (!['NOVO', 'CONTATADO', 'DESCARTADO'].includes(status)) throw Object.assign(new Error('Status inválido.'), { status: 400 });
  l.status = status;
  save();
  return l;
}

function getState(env = process.env) {
  return {
    config: state.config,
    chaves: {
      busca: Boolean(env.BRAVE_API_KEY || (env.GOOGLE_CSE_KEY && env.GOOGLE_CSE_CX)),
      buscaProvedor: env.BRAVE_API_KEY ? 'Brave' : env.GOOGLE_CSE_KEY ? 'Google' : null,
      meta: Boolean(env.META_PAGE_TOKEN && (env.META_PAGE_ID || env.META_IG_USER_ID))
    },
    leads: state.leads.slice(0, 300),
    execucoes: state.execucoes.slice(0, 10),
    ultimaExecucao: state.ultimaExecucao,
    proximaExecucao: state.config.ativo ? (state.ultimaExecucao || Date.now()) + state.config.intervaloHoras * 3600000 : null,
    campanhas: campaignLinks(),
    rodando: running
  };
}

module.exports = { run, tick, updateConfig, setLeadStatus, getState, classifyDemand, campaignLinks, INTERESSE_RX, DEFAULT_QUERIES };
