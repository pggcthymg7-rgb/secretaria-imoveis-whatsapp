/**
 * Escolhe o modelo do Gemini que a chave pode usar.
 * O Google aposenta modelos antigos para chaves novas (ex.: "gemini-2.5-flash is no longer
 * available to new users"), então o nome NÃO fica fixo no código: a BIGA pergunta à API
 * quais modelos existem e usa o "flash" estável mais novo. Quem quiser fixar um modelo
 * define GEMINI_MODEL (pedidos) / GEMINI_BUSCA_MODEL (busca) no .env.
 */
const FALLBACK = 'gemini-flash-latest'; // apelido que o Google mantém apontando para o flash atual
const TTL_MS = 6 * 3600 * 1000;
const cache = new Map(); // chave -> { modelo, ate }

/** "models/gemini-3.8-flash" -> [3, 8] */
function versaoDe(nome) {
  const m = String(nome).match(/gemini-(\d+)(?:\.(\d+))?-flash$/);
  return m ? [Number(m[1]), Number(m[2] || 0)] : null;
}

/** Entre os modelos listados, o flash estável (sem lite/preview/exp/imagem/voz) de maior versão */
function melhorFlash(modelos, ignorar = []) {
  const candidatos = (modelos || [])
    .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
    .map(m => String(m.name || '').replace(/^models\//, ''))
    .filter(n => versaoDe(n) && !ignorar.includes(n));
  candidatos.sort((a, b) => {
    const [a1, a2] = versaoDe(a);
    const [b1, b2] = versaoDe(b);
    return b1 - a1 || b2 - a2;
  });
  return candidatos[0] || null;
}

async function listarModelos(chave, fetcher) {
  const todos = [];
  let token = '';
  for (let i = 0; i < 3; i++) {
    const r = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`, {
      headers: { 'x-goog-api-key': chave },
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) break;
    const j = await r.json();
    todos.push(...(j.models || []));
    token = j.nextPageToken || '';
    if (!token) break;
  }
  return todos;
}

/**
 * Modelo a usar. `ignorar`: modelos que acabaram de falhar (tenta outro).
 * Nunca lança erro: sem internet ou sem lista, usa o apelido FALLBACK.
 */
async function escolherModelo(chave, { fetcher = fetch, ignorar = [] } = {}) {
  const c = cache.get(chave);
  if (c && c.ate > Date.now() && !ignorar.includes(c.modelo)) return c.modelo;
  try {
    const modelo = melhorFlash(await listarModelos(chave, fetcher), ignorar);
    if (modelo) {
      cache.set(chave, { modelo, ate: Date.now() + TTL_MS });
      return modelo;
    }
  } catch {}
  return ignorar.includes(FALLBACK) ? null : FALLBACK;
}

/** O erro significa "este modelo não serve para a sua chave" (vale tentar outro)? */
function modeloIndisponivel(status, mensagem) {
  return status === 404 || /no longer available|not found|is not supported|deprecated|not available/i.test(String(mensagem || ''));
}

// ---------------------------------------------------------------------------
// Vários modelos (um sobrecarregado/indisponível não derruba a busca)
// ---------------------------------------------------------------------------
const listaCache = new Map(); // chave -> { itens, ate }
const indisponiveis = new Map(); // chave -> Set de modelos que o Google não oferece a esta chave

/** "gemini-3.5-flash-lite" -> { nome, v:[3,5], lite:true }; null se não for flash/flash-lite estável */
function parseFlash(nome) {
  const m = String(nome).match(/^gemini-(\d+)(?:\.(\d+))?-flash(-lite)?$/);
  return m ? { nome, v: [Number(m[1]), Number(m[2] || 0)], lite: Boolean(m[3]) } : null;
}

async function modelosDaChave(chave, fetcher) {
  const c = listaCache.get(chave);
  if (c && c.ate > Date.now()) return c.itens;
  try {
    const itens = (await listarModelos(chave, fetcher))
      .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => parseFlash(String(m.name || '').replace(/^models\//, '')))
      .filter(Boolean);
    if (itens.length) listaCache.set(chave, { itens, ate: Date.now() + TTL_MS });
    return itens;
  } catch {
    return [];
  }
}

function marcarIndisponivel(chave, nome) {
  if (!indisponiveis.has(chave)) indisponiveis.set(chave, new Set());
  indisponiveis.get(chave).add(nome);
}
const ehIndisponivel = (chave, nome) => Boolean(indisponiveis.get(chave) && indisponiveis.get(chave).has(nome));

/**
 * Modelos desta chave em ordem de tentativa (sem os que o Google recusou para ela).
 * preferirLite: tarefas simples (escolher anúncios) vão primeiro nos "lite", que são mais leves e menos sobrecarregados.
 */
async function escolherModelos(chave, { fetcher = fetch, preferirLite = false, max = 4 } = {}) {
  const itens = (await modelosDaChave(chave, fetcher)).filter(x => !ehIndisponivel(chave, x.nome));
  const ordenar = lista => [...lista].sort((a, b) => b.v[0] - a.v[0] || b.v[1] - a.v[1]);
  const lites = ordenar(itens.filter(x => x.lite));
  const cheios = ordenar(itens.filter(x => !x.lite));
  const lista = (preferirLite ? [...lites, ...cheios] : [...cheios, ...lites]).map(x => x.nome);
  return lista.length ? lista.slice(0, max) : ehIndisponivel(chave, FALLBACK) ? [] : [FALLBACK];
}

/** Falha passageira (sobrecarga): vale tentar de novo daqui a pouco ou em outro modelo */
function erroTransitorio(status, mensagem) {
  return [500, 502, 503, 504].includes(Number(status)) || /high demand|overloaded|temporarily/i.test(String(mensagem || ''));
}

/** Espera entre tentativas (GEMINI_RETRY_MS no .env; 0 nos testes) */
const esperaMs = env => {
  const n = parseInt((env && env.GEMINI_RETRY_MS) ?? '1500', 10);
  return Number.isFinite(n) && n >= 0 ? n : 1500;
};

function esquecer(chave) {
  cache.delete(chave);
  listaCache.delete(chave);
  indisponiveis.delete(chave);
}

module.exports = { escolherModelo, escolherModelos, melhorFlash, modeloIndisponivel, erroTransitorio, marcarIndisponivel, ehIndisponivel, esperaMs, esquecer, FALLBACK };
