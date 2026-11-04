/**
 * Chave do Gemini (Google AI Studio): limpa o que vem colado e confere no próprio Google.
 * Antes só aceitava [A-Za-z0-9_-] e recusava chave válida colada com espaço/quebra de linha
 * invisível ou em formato novo do Google.
 */

const ASPAS = new Set(['"', "'", '`']);
/** Tira aspas do começo e do fim em tempo linear (a regex `["'`]+$` era lenta em texto grande) */
function tirarAspas(s) {
  let a = 0;
  let b = s.length;
  while (a < b && ASPAS.has(s[a])) a++;
  while (b > a && ASPAS.has(s[b - 1])) b--;
  return s.slice(a, b);
}

/** Tira espaços, quebras de linha, caracteres invisíveis, aspas e "GEMINI_API_KEY=" */
function limparChave(bruto) {
  const limpo = String(bruto || '')
    .replace(/[​-‍⁠﻿ ]/g, '')
    .replace(/\s+/g, '')
    .replace(/^(?:GEMINI_API_KEY|GOOGLE_API_KEY|API_KEY)=/i, '');
  return tirarAspas(limpo);
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

/**
 * Diagnóstico a fundo: (1) uma resposta simples, (2) uma busca com Google. Cada uma com a
 * resposta EXATA do Google. Serve para separar "a chave não gera texto" de "a busca com Google
 * não está liberada para esta chave" (no plano grátis ela costuma vir com limite 0).
 */
async function diagnosticar(chave, fetcher = fetch) {
  const M = require('./gemini-modelo');
  const modelo = process.env.GEMINI_BUSCA_MODEL || (await M.escolherModelo(chave, { fetcher }));
  const chamar = async (corpo, mod = modelo) => {
    try {
      const r = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(mod)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(60000)
      });
      let j = {};
      try {
        j = await r.json();
      } catch {}
      if (r.ok) return { ok: true, status: r.status, fontes: (j.candidates?.[0]?.groundingMetadata?.groundingChunks || []).length };
      return { ok: false, status: r.status, mensagem: String(j?.error?.message || r.status).slice(0, 300) };
    } catch (err) {
      return { ok: false, status: 0, mensagem: String(err.message).slice(0, 200) };
    }
  };
  // resposta simples: se o modelo principal estiver sobrecarregado (503) ou sem cota, testa os outros da chave
  const corpoSimples = { contents: [{ role: 'user', parts: [{ text: 'Responda apenas: ok' }] }], generationConfig: { maxOutputTokens: 8 } };
  let simples = await chamar(corpoSimples, modelo);
  simples.modelo = modelo;
  const falhasSimples = [];
  if (!simples.ok) {
    for (const outro of (await M.escolherModelos(chave, { fetcher, preferirLite: true, max: 3 })).filter(m => m !== modelo)) {
      falhasSimples.push({ modelo: simples.modelo, status: simples.status, mensagem: simples.mensagem });
      const t = await chamar(corpoSimples, outro);
      simples = { ...t, modelo: outro };
      if (simples.ok) break;
    }
  }
  simples.falhas = falhasSimples;
  // a busca com Google é testada em cada modelo da fila (os 2.5 são os únicos com cota grátis documentada)
  const corpoBusca = { contents: [{ role: 'user', parts: [{ text: 'Qual é a capital de Goiás? Responda em uma palavra.' }] }], tools: [{ google_search: {} }], generationConfig: { maxOutputTokens: 50 } };
  const buscas = [];
  for (const m of [...new Set(['gemini-2.5-flash', 'gemini-2.5-flash-lite', modelo])]) buscas.push({ modelo: m, ...(await chamar(corpoBusca, m)) });
  return { modelo, simples, busca: buscas[0], buscas };
}

function textoDiagnostico(d, motores) {
  const linha = (nome, x) => (x.ok ? `✅ ${nome}: funcionou${x.fontes !== undefined && nome.includes('Google') ? ` (${x.fontes} fonte(s))` : ''}${x.modelo && !nome.includes(x.modelo) ? ` (${x.modelo})` : ''}` : `❌ ${nome}: erro ${x.status || ''} — ${x.mensagem}`);
  const buscas = d.buscas || [{ modelo: d.modelo, ...d.busca }];
  const algumaOk = buscas.some(b => b.ok);
  const todas429 = buscas.every(b => !b.ok && b.status === 429);
  const indisponiveis = buscas.filter(b => !b.ok && (b.status === 404 || /no longer available|not found/i.test(b.mensagem || '')));
  let conclusao;
  if (d.semChave) conclusao = 'Sem chave do Gemini salva: ela só é necessária para a curadoria (escolher, entre os anúncios achados, os que servem ao pedido).';
  else if (d.simples.ok && algumaOk) conclusao = `A chave gera texto e a busca com Google funciona em: ${buscas.filter(b => b.ok).map(b => b.modelo).join(', ')}.`;
  else if (d.simples.ok && todas429) conclusao = 'A chave funciona, mas a *busca com Google* está sem cota em todos os modelos testados. No plano grátis isso costuma ser "limit: 0". Pode ser preciso ativar o faturamento do projeto no Google AI Studio (aistudio.google.com › API keys) — não consegui confirmar qual franquia grátis a sua chave tem. Você não precisa disso: com uma chave do Tavily ou do Serper (grátis) a busca nos portais deixa de depender do Google.';
  else if (d.simples.ok && indisponiveis.length === buscas.length) conclusao = 'A chave gera texto, mas o Google não oferece a busca com Google nesses modelos para a sua chave (modelos aposentados para chaves novas). A BIGA usa o modelo mais novo da sua chave sozinha.';
  else if (d.simples.ok) conclusao = 'A chave gera texto, mas a busca com Google foi recusada. Veja a mensagem acima.';
  else if (d.simples.status === 429) conclusao = 'A cota geral desta chave está esgotada agora (nem uma resposta simples passou).';
  else if ([500, 502, 503, 504].includes(d.simples.status)) conclusao = 'O Gemini está sobrecarregado agora (erro 503 "alta demanda"): é passageiro. Tente de novo em alguns minutos; a busca nos portais tenta de novo sozinha e passa por outros modelos.';
  else conclusao = 'A chave não conseguiu gerar nem uma resposta simples. Veja a mensagem acima.';
  const partes = [
    '🔬 *Diagnóstico do Gemini*',
    `Modelo (texto): ${d.modelo}`,
    ...(d.simples.falhas || []).map(f => `↳ ${f.modelo}: erro ${f.status} — ${String(f.mensagem || '').slice(0, 90)}`),
    linha('Resposta simples (sem busca)', d.simples),
    ...buscas.map(b => linha(`Busca com Google em ${b.modelo}`, b)),
    '',
    conclusao
  ];
  if (motores) {
    const sn = (ok, extra = '') => (ok ? `✅ configurado${extra}` : '❌ sem chave');
    const ping = n => (motores.ping && motores.ping[n] ? (motores.ping[n].ok ? ` — respondeu (${motores.ping[n].resultados} resultado(s))` : ` — ❌ erro ${motores.ping[n].status || ''}: ${motores.ping[n].mensagem}`) : '');
    const ativo = [motores.apify ? 'Apify (OLX, ZAP e VivaReal)' : '', motores.busca.length ? `${motores.busca[0]} + Gemini (curadoria sem Google)` : '', !(motores.apify || motores.busca.length) && motores.gemini ? 'Gemini + Google (último recurso)' : ''].filter(Boolean);
    partes.push(
      '',
      '🌐 *Motores da busca nos portais*',
      `• Tavily: ${sn(motores.busca.includes('Tavily'), ping('Tavily'))}`,
      `• Serper: ${sn(motores.busca.includes('Serper'), ping('Serper'))}`,
      `• Brave: ${sn(motores.busca.includes('Brave'), ping('Brave'))}`,
      `• Apify (OLX/ZAP/VivaReal): ${sn(motores.apify)}`,
      `• Gemini + Google: ${motores.gemini ? '✅ chave salva (usado só se os acima falharem)' : '❌ sem chave'}`,
      `Motor principal agora: ${ativo.length ? ativo.join(' + ') : '❌ nenhum — mande *chave tavily SUA_CHAVE* (grátis em tavily.com)'}`
    );
  }
  return partes.join('\n');
}

async function diagnosticarSalva(fetcher) {
  const chave = limparChave(process.env.GEMINI_API_KEY);
  const serp = require('./busca-serp');
  const { motoresConfigurados } = require('./busca-inteligente');
  const m = motoresConfigurados(process.env);
  const motores = { apify: m.apify, gemini: m.gemini, busca: m.serp.map(x => serp.NOME[x]), ping: {} };
  // 1 consulta de teste no provedor principal (custa 1 crédito grátis)
  if (m.serp.length) motores.ping[serp.NOME[m.serp[0]]] = await serp.testarProvedor(m.serp[0], { env: process.env, fetcher: fetcher || fetch });
  if (!chave) {
    const t = textoDiagnostico({ modelo: '—', semChave: true, simples: { ok: false, status: 0, mensagem: 'sem chave do Gemini' }, buscas: [] }, motores);
    return { ok: false, texto: m.serp.length || m.apify ? t : 'Nenhuma chave do Gemini salva ainda.' };
  }
  const d = await diagnosticar(chave, fetcher);
  return { ok: d.simples.ok && (d.buscas || []).some(b => b.ok), texto: textoDiagnostico(d, motores), diagnostico: d };
}

module.exports = { limparChave, formatoValido, testarChave, validarChave, testarChaveSalva, diagnosticar, textoDiagnostico, diagnosticarSalva };
