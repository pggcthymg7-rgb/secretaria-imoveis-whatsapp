/**
 * Chaves dos motores de busca nos portais (Tavily, Serper, Brave, Apify): limpar o que foi colado,
 * conferir NO PRÓPRIO SERVIÇO antes de salvar e dizer em português o que deu errado.
 * Formato é conferido de forma frouxa de propósito: a regra rígida do Gemini já recusou chave válida.
 */
const serp = require('./busca-serp');

const PROVEDORES = {
  tavily: { env: 'TAVILY_API_KEY', nome: 'Tavily', onde: 'tavily.com (grátis, 1.000 buscas por mês, sem cartão)' },
  serper: { env: 'SERPER_API_KEY', nome: 'Serper', onde: 'serper.dev (grátis, 2.500 buscas, sem cartão)' },
  brave: { env: 'BRAVE_SEARCH_API_KEY', nome: 'Brave', onde: 'brave.com/search/api' },
  apify: { env: 'APIFY_API_TOKEN', nome: 'Apify', onde: 'apify.com › Settings › API & Integrations' }
};

/** Tira espaços, quebras, invisíveis, aspas e "NOME_DA_VARIAVEL=" */
function limparChave(bruto) {
  return String(bruto || '')
    .replace(/[​-‍⁠﻿ ]/g, '')
    .replace(/\s+/g, '')
    .replace(/^[A-Z][A-Z0-9_]{3,40}=/, '')
    .replace(/^["'`]+|["'`]+$/g, '');
}

const formatoValido = chave => /^[A-Za-z0-9._~+/=-]{16,300}$/.test(chave);

/** O Apify tem um endereço grátis só para conferir o token (não gasta nada) */
async function testarApify(token, fetcher = fetch) {
  try {
    const r = await fetcher('https://api.apify.com/v2/users/me', { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
    if (r.ok) return { ok: true };
    if (r.status === 401 || r.status === 403) return { ok: false, mensagem: 'O Apify recusou o token. Copie de novo em apify.com › Settings › API & Integrations.' };
    return { ok: null, mensagem: `O Apify respondeu ${r.status}.` };
  } catch (err) {
    return { ok: null, mensagem: `Não consegui falar com o Apify agora (${String(err.message).slice(0, 80)}).` };
  }
}

/** Limpa, confere o formato e testa no serviço. { ok, chave, mensagem } */
async function validar(provedor, bruto, fetcher = fetch) {
  const P = PROVEDORES[provedor];
  if (!P) return { ok: false, mensagem: 'Provedor desconhecido.' };
  const chave = limparChave(bruto);
  if (!chave) return { ok: false, mensagem: `Cole a chave do ${P.nome}.` };
  if (!formatoValido(chave)) return { ok: false, mensagem: `Isso não parece uma chave do ${P.nome} (tem caractere estranho ou é curta demais). Gere em ${P.onde}.` };
  let t;
  if (provedor === 'apify') t = await testarApify(chave, fetcher);
  else {
    const r = await serp.testarProvedor(provedor, { env: { [P.env]: chave, ...(provedor === 'brave' ? { BRAVE_API_KEY: chave } : {}) }, fetcher });
    t = r.ok ? { ok: true } : r.status === 401 || r.status === 403 ? { ok: false, mensagem: `O ${P.nome} recusou a chave. Gere outra em ${P.onde}.` } : r.status === 429 ? { ok: true, aviso: `Chave aceita, mas o ${P.nome} diz que a cota acabou agora.` } : r.status ? { ok: null, mensagem: `O ${P.nome} respondeu ${r.status}: ${r.mensagem}` } : { ok: null, mensagem: `Não consegui falar com o ${P.nome} agora (${r.mensagem.slice(0, 80)}).` };
  }
  if (t.ok === false) return { ok: false, mensagem: t.mensagem };
  if (t.ok === null) return { ok: true, chave, mensagem: `Chave do ${P.nome} salva, mas ${t.mensagem.charAt(0).toLowerCase()}${t.mensagem.slice(1)} Ela será usada na próxima busca.` };
  return { ok: true, chave, mensagem: t.aviso || `Chave do ${P.nome} funcionando ✅` };
}

module.exports = { PROVEDORES, limparChave, formatoValido, validar, testarApify };
