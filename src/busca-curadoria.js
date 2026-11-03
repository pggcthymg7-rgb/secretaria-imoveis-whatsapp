/**
 * CURADORIA PELO GEMINI SEM FERRAMENTAS (Camada 2, passo 2)
 * O Gemini recebe um catálogo numerado de anúncios REAIS (achados por Tavily/Serper/Brave) e só
 * escolhe os que servem ao pedido, extrai preço/m²/quartos citados e classifica o anunciante.
 * Não usa google_search (que no plano grátis vem com cota zero): geração de texto comum.
 * O Gemini NUNCA devolve link: devolve o número do catálogo, e o link vem do catálogo.
 */
const M = require('./gemini-modelo');

/** Ordem: os modelos baratos/leves primeiro; o descoberto na lista da chave por último */
async function ordemDeModelos(chave, env, fetcher) {
  const fixo = String(env.GEMINI_CURADORIA_MODEL || env.GEMINI_BUSCA_MODEL || '').trim();
  const lista = [fixo, 'gemini-2.5-flash-lite', 'gemini-2.5-flash', await M.escolherModelo(chave, { fetcher })].filter(Boolean);
  return [...new Set(lista)];
}

function promptCuradoria(descricao, catalogo) {
  const linhas = catalogo.map(x => `[${x.id}] ${x.portal} | ${x.titulo} | ${x.conteudo}`);
  return [
    'Você é o juiz de compatibilidade de um corretor de imóveis em Goiânia-GO.',
    `PEDIDO DO CLIENTE: "${descricao}"`,
    '',
    'CATÁLOGO (anúncios reais; cada linha é [número] portal | título | trecho do anúncio):',
    ...linhas,
    '',
    'Escolha SOMENTE os anúncios do catálogo que atendem ao pedido (tipo, local/condomínio/bairro, faixa de preço, quartos, suítes, área).',
    'Se o trecho não deixa claro um dado, use 0 (nunca invente números). Descarte o que claramente não serve.',
    'Responda SOMENTE com uma lista JSON. Cada item:',
    '{"id": número do catálogo, "preco": número em reais ou 0, "area_m2": número ou 0, "quartos": número ou 0, "suites": número ou 0,',
    ' "bairro": "", "anunciante": "nome da imobiliária/corretor ou Particular ou vazio", "tipo_anunciante": "PARTICULAR" | "IMOBILIARIA" | "DESCONHECIDO", "resumo": "1 frase"}',
    'PARTICULAR = direto com o proprietário (ex.: "proprietário", "particular", "sem corretor"); IMOBILIARIA = imobiliária ou corretor (ex.: CRECI, nome de imobiliária).',
    'Nunca devolva links nem ids que não estejam no catálogo.'
  ].join('\n');
}

function lerLista(texto) {
  const t = String(texto || '').trim();
  const bloco = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const bruto = bloco ? bloco[1] : t.slice(Math.max(0, t.indexOf('[')));
  try {
    const v = JSON.parse(bruto);
    return Array.isArray(v) ? v : Array.isArray(v && v.itens) ? v.itens : [];
  } catch {
    return [];
  }
}

/**
 * Chama o Gemini (sem tools). Tenta o próximo modelo se este estiver indisponível ou sem cota.
 * Retorna { ok, itens (brutos do modelo), modelo, tentativas } | { ok:false, motivo, detalhe, tentativas }
 */
async function curar({ chave, descricao, catalogo, env = process.env, fetcher = fetch }) {
  const prompt = promptCuradoria(descricao, catalogo);
  const tentativas = [];
  for (const modelo of await ordemDeModelos(chave, env, fetcher)) {
    try {
      const r = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } }),
        signal: AbortSignal.timeout(90000)
      });
      let j = {};
      try {
        j = await r.json();
      } catch {}
      if (r.ok) {
        const texto = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('');
        tentativas.push({ modelo, status: r.status });
        return { ok: true, itens: lerLista(texto), modelo, tentativas };
      }
      const msg = String((j && j.error && j.error.message) || r.status).slice(0, 240);
      tentativas.push({ modelo, status: r.status, mensagem: msg });
      if (M.modeloIndisponivel(r.status, msg) || r.status === 429) continue; // tenta o próximo modelo
      return { ok: false, motivo: 'erro', detalhe: msg, tentativas };
    } catch (err) {
      tentativas.push({ modelo, status: 0, mensagem: String(err.message).slice(0, 160) });
      return { ok: false, motivo: 'erro', detalhe: String(err.message).slice(0, 240), tentativas };
    }
  }
  const ult = tentativas[tentativas.length - 1] || {};
  return { ok: false, motivo: ult.status === 429 ? 'cota' : 'erro', detalhe: ult.mensagem || 'nenhum modelo do Gemini aceitou o pedido', tentativas };
}

module.exports = { promptCuradoria, lerLista, ordemDeModelos, curar };
