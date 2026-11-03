/**
 * Chave do Gemini (Google AI Studio): limpa o que vem colado e confere no próprio Google.
 * Antes só aceitava [A-Za-z0-9_-] e recusava chave válida colada com espaço/quebra de linha
 * invisível ou em formato novo do Google.
 */

/** Tira espaços, quebras de linha, caracteres invisíveis, aspas e "GEMINI_API_KEY=" */
function limparChave(bruto) {
  return String(bruto || '')
    .replace(/[​-‍⁠﻿ ]/g, '')
    .replace(/\s+/g, '')
    .replace(/^(?:GEMINI_API_KEY|GOOGLE_API_KEY|API_KEY)=/i, '')
    .replace(/^["'`]+|["'`]+$/g, '');
}

/** Formato aceito: sem espaço nem caractere de controle; só os usados em chaves do Google */
function formatoValido(chave) {
  return /^[A-Za-z0-9._~+/=-]{20,300}$/.test(chave);
}

/**
 * Pergunta ao Google se a chave funciona (lista os modelos; não gasta cota de geração).
 * { ok: true } | { ok: false, motivo } | { ok: null, motivo } (sem internet: não deu para conferir)
 */
async function testarChave(chave, fetcher = fetch) {
  try {
    const r = await fetcher('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
      headers: { 'x-goog-api-key': chave },
      signal: AbortSignal.timeout(15000)
    });
    if (r.ok) return { ok: true };
    let msg = '';
    try {
      msg = (await r.json())?.error?.message || '';
    } catch {}
    if (r.status === 429) return { ok: true, aviso: 'A chave funciona, mas a cota do Google está esgotada agora.' };
    return { ok: false, motivo: `O Google recusou a chave (${r.status}${msg ? `: ${String(msg).slice(0, 160)}` : ''}).` };
  } catch (err) {
    return { ok: null, motivo: `Não consegui falar com o Google agora (${String(err.message).slice(0, 80)}).` };
  }
}

/** Limpa, confere o formato e testa no Google. Retorna { ok, chave, mensagem } */
async function validarChave(bruto, fetcher) {
  const chave = limparChave(bruto);
  if (!chave) return { ok: false, mensagem: 'Cole a chave do Gemini.' };
  if (!formatoValido(chave)) return { ok: false, mensagem: 'Isso não parece uma chave do Gemini (tem caractere estranho ou é curta demais). Copie de novo em aistudio.google.com › Get API key.' };
  const t = await testarChave(chave, fetcher);
  if (t.ok === false) return { ok: false, mensagem: t.motivo };
  if (t.ok === null) return { ok: true, chave, mensagem: `Chave salva, mas ${t.motivo.charAt(0).toLowerCase()}${t.motivo.slice(1)} Ela será usada na próxima busca.` };
  return { ok: true, chave, mensagem: t.aviso || 'Chave do Gemini funcionando ✅' };
}

/** Testa a chave que já está salva na BIGA (botão do painel e "testar gemini") */
async function testarChaveSalva(fetcher) {
  const bruta = String(process.env.GEMINI_API_KEY || '');
  const chave = limparChave(bruta);
  if (!chave) return { ok: false, mensagem: 'Nenhuma chave do Gemini salva ainda.' };
  // chave salva "suja" (espaço ou caractere invisível no meio, colada pela versão antiga de Ajustes): corrige
  if (chave !== bruta) require('./envfile').updateEnvFile({ GEMINI_API_KEY: chave });
  const t = await testarChave(chave, fetcher);
  if (t.ok === true) {
    const modelo = process.env.GEMINI_BUSCA_MODEL || (await require('./gemini-modelo').escolherModelo(chave, fetcher ? { fetcher } : {}));
    return { ok: true, mensagem: t.aviso || `Chave do Gemini funcionando ✅ (modelo da busca: ${modelo}).` };
  }
  return { ok: false, mensagem: t.ok === null ? t.motivo : `${t.motivo} Crie outra chave em aistudio.google.com › Get API key.` };
}

module.exports = { limparChave, formatoValido, testarChave, validarChave, testarChaveSalva };
