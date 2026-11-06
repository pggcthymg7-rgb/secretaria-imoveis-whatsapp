/**
 * ============================================================================
 * CÉREBRO DA SECRETÁRIA (orquestrador)
 * ============================================================================
 * 1. Interpreta o pedido (src/brain/parser.js) com o mapa de Goiânia
 * 2. (Opcional) Gemini reforça a leitura de nomes de lugares — nunca escolhe imóvel
 * 3. Compara com a carteira (src/brain/engine.js)
 * 4. Decide: ENVIAR ao parceiro | AVISAR o corretor (dúvida real) | SILÊNCIO
 * 5. Monta a mensagem humana adaptada ao horário e ao tom do pedido
 * ============================================================================
 */
const { GoogleGenAI } = require('@google/genai');
const { loadSettings } = require('./settings');
const { parseRequest, fmtPrice } = require('./brain/parser');
const { buildIndex, detectLocations, osmVersion } = require('./brain/locations');
const { evaluateInventory, propTipo, propSuites } = require('./brain/engine');
const { normalize, fuzzyContains } = require('./brain/text');

// ---------------------------------------------------------------------------
// Saudação pelo horário de Brasília
// ---------------------------------------------------------------------------
function getHourBrasilia(date = new Date()) {
  const h = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }).format(date);
  return parseInt(h, 10) % 24;
}

function getGreetingByTime(date = new Date()) {
  try {
    const hour = getHourBrasilia(date);
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  } catch {
    return 'Olá';
  }
}

function pick(list, seed) {
  if (!list.length) return '';
  const i = Math.abs(Math.floor(seed)) % list.length;
  return list[i];
}

function firstNameOf(senderName) {
  const raw = String(senderName || '').replace(/[|\-–—].*$/, '').replace(/\b(corretora?|imoveis|imóveis|creci.*)\b/gi, '').trim();
  const first = raw.split(/\s+/)[0] || '';
  if (!first || first.length < 2 || /\d/.test(first)) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/**
 * Abertura e fechamento humanos, adaptados ao tom do pedido e às regras treinadas
 */
function buildHumanContextualParts(messageText, senderName, humanTraining = '', criteria = null) {
  const norm = normalize(messageText || '');
  const nome = firstNameOf(senderName);
  const saud = getGreetingByTime();
  const ola = nome ? `${saud}, ${nome}! Tudo bem?` : `${saud}! Tudo bem?`;
  const seed = norm.length + new Date().getDate();
  const tom = criteria ? criteria.tom : null;

  // Regras treinadas pelo corretor: "Se a pessoa falar X, diga: Y"
  if (humanTraining && humanTraining.trim()) {
    for (const line of humanTraining.split('\n').map(l => l.trim()).filter(Boolean)) {
      const m = line.match(/se\s+(?:a pessoa\s+|alguem\s+|alguém\s+|o cliente\s+|o corretor\s+)?(?:pedir|falar|mencionar|disser|buscar|procurar|escrever)\s+(.+?)\s*(?:,|->|:)\s*(?:diga|fale|responda)?\s*:?\s*["“]?([^"”]+)["”]?\s*$/i);
      if (!m) continue;
      const triggers = m[1].replace(/\(.*?\)/g, ' ').split(/\s+ou\s+|\s*\/\s*|\s*,\s*/).map(w => normalize(w).replace(/^(ex:?|exemplo:?)\s*/, '').replace(/["“”]/g, '').trim()).filter(w => w.length >= 3);
      if (triggers.some(t => norm.includes(t))) {
        return {
          detectedTone: `Regra treinada ("${triggers[0]}")`,
          opening: `${ola} Vi sua mensagem no grupo. ${m[2].trim()}`,
          closing: 'Qualquer dúvida é só me chamar por aqui.'
        };
      }
    }
  }

  const urgente = tom ? tom.urgente : /\b(urgente|pra hoje|para hoje|visita hoje|com pressa)\b/.test(norm);
  const parceria = tom ? tom.parceria : /\b(tenho cliente|cliente procura|parceria|meu cliente)\b/.test(norm);
  const investidor = tom ? tom.investidor || (criteria && criteria.aVista) : /\b(a vista|investidor)\b/.test(norm);

  if (urgente) {
    return {
      detectedTone: '⚡ Urgência',
      opening: pick([
        `${ola} Vi no grupo que é pra agora — tenho uma opção que encaixa no que você pediu:`,
        `${ola} Vi sua busca agora no grupo. Como é urgente, já te mando essa que bate com o perfil:`
      ], seed),
      closing: 'Consigo me organizar pra gente visitar ainda hoje, se for o caso. É só me falar o melhor horário.'
    };
  }
  if (parceria) {
    return {
      detectedTone: '🤝 Parceria com corretor',
      opening: pick([
        `${ola} Vi sua mensagem no grupo sobre o seu cliente. Tenho essa aqui na carteira que encaixa no perfil:`,
        `${ola} Sobre a busca do seu cliente no grupo: tenho uma opção que bate com o que você descreveu.`,
        `${ola} Vi seu pedido no grupo e acho que essa aqui atende bem o seu cliente:`
      ], seed),
      closing: pick([
        'Faço parceria tranquilo. Se o cliente gostar, combinamos a visita no horário que for melhor pra ele.',
        'Trabalhamos em parceria, sim. Me avisa se quiser agendar uma visita com ele.'
      ], seed)
    };
  }
  if (investidor) {
    return {
      detectedTone: '💎 À vista / investidor',
      opening: `${ola} Vi sua busca no grupo. Tenho essa oportunidade que encaixa no perfil:`,
      closing: 'Se fizer sentido, te passo mais detalhes da negociação e marcamos uma visita.'
    };
  }
  return {
    detectedTone: `💬 Conversa natural (${saud})`,
    opening: pick([
      `${ola} Vi sua mensagem no grupo e tenho uma opção que encaixa no que você procura:`,
      `${ola} Vi seu pedido lá no grupo. Olha essa aqui da nossa carteira:`,
      `${ola} Sobre a sua busca no grupo, tenho essa opção que acho que te atende:`
    ], seed),
    closing: pick([
      'Se gostar, podemos agendar uma visita no melhor horário pra você.',
      'Qualquer dúvida me chama. Se quiser conhecer, combinamos a visita.'
    ], seed)
  };
}

// ---------------------------------------------------------------------------
// Gemini (opcional): só ajuda a identificar nomes de lugares que o mapa não conhece
// ---------------------------------------------------------------------------
// Cache da extração por IA: o mesmo pedido repostado em vários grupos paga o Gemini uma vez só
const CACHE_IA_MAX = 500;
const CACHE_IA_TTL_MS = 7 * 24 * 3600 * 1000;
const cacheIa = new Map(); // hash do texto normalizado -> { lugares, ate }

function chaveCacheIa(messageText) {
  return require('crypto').createHash('sha256').update(normalize(String(messageText).slice(0, 2000)).replace(/\s+/g, ' ').trim()).digest('hex');
}

/** LGPD (minimização): telefone e e-mail não vão para o Gemini; só os lugares importam */
function mascararContatos(texto) {
  return String(texto || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/(?:\+?55[\s-]?)?\(?\b\d{2}\)?[\s-]?9?\s?\d{4}[\s-]?\d{4}\b/g, '[telefone]');
}

/** O cérebro local já entendeu o local com segurança? Então o Gemini não precisa ser chamado. */
function localConfiante(local) {
  if (!local) return false;
  if (local.qualquer) return true;
  const achou = ['regioes', 'bairros', 'perto', 'marcos', 'condominios', 'edificios', 'cidades'].some(k => Array.isArray(local[k]) && local[k].length) || Boolean(local.raio);
  return achou && !local.localNaoReconhecido && !(local.nomesDesconhecidos || []).length;
}

/** Modelo da extração: GEMINI_MODEL fixo ou o Flash-Lite mais novo da chave (o Flash cheio custa ~4x mais) */
async function modeloExtracao(apiKey) {
  const fixo = String(process.env.GEMINI_MODEL || '').trim();
  if (fixo) return fixo;
  const lista = await require('./gemini-modelo').escolherModelos(apiKey, { preferirLite: true, max: 1 });
  return lista[0] || require('./gemini-modelo').FALLBACK;
}

async function aiExtractPlaces(messageText) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'coloque_sua_chave_aqui') return null;
  const chave = chaveCacheIa(messageText);
  const salvo = cacheIa.get(chave);
  if (salvo && salvo.ate > Date.now()) return salvo.lugares;
  const planos = require('./planos');
  if (!planos.podeUsar('ia')) return null; // teto do plano: segue só com o cérebro local
  planos.registrar('ia');
  try {
    const lugares = await chamarGemini(apiKey, messageText);
    if (cacheIa.size >= CACHE_IA_MAX) cacheIa.delete(cacheIa.keys().next().value);
    cacheIa.set(chave, { lugares, ate: Date.now() + CACHE_IA_TTL_MS });
    return lugares;
  } catch (err) {
    planos.devolver('ia'); // chamada que falhou não conta no mês
    throw err;
  }
}

async function chamarGemini(apiKey, messageText) {
  const ai = new GoogleGenAI({ apiKey });
  const prompt = `Você lê pedidos de imóveis em grupos de corretores de Goiânia-GO.
Extraia SOMENTE nomes de lugares citados no texto: bairros/setores, condomínios, edifícios/empreendimentos, cidades, praças, avenidas e pontos de referência.
Ignore nomes de pessoas, telefones e lugares mencionados como imóvel oferecido em PERMUTA/TROCA.
Responda apenas JSON: {"lugares":[{"nome":"texto exatamente como aparece","tipo":"bairro|condominio|edificio|cidade|marco"}]}
TEXTO:
"""${mascararContatos(String(messageText).slice(0, 2000))}"""`;
  const call = ai.models.generateContent({
    model: await modeloExtracao(apiKey),
    contents: prompt,
    config: { responseMimeType: 'application/json', temperature: 0 }
  });
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout Gemini')), 8000));
  const response = await Promise.race([call, timeout]);
  const parsed = JSON.parse(response.text);
  return Array.isArray(parsed.lugares) ? parsed.lugares : [];
}

function mergeAiPlaces(criteria, aiPlaces, rawText, index) {
  if (!aiPlaces || !aiPlaces.length) return false;
  const norm = normalize(rawText);
  let changed = false;
  for (const lp of aiPlaces) {
    const nome = normalize(lp && lp.nome);
    if (!nome || nome.length < 4 || !fuzzyContains(norm, nome)) continue; // anti-alucinação: precisa estar no texto
    const already = [
      ...criteria.local.bairros, ...criteria.local.marcos, ...criteria.local.cidades,
      ...criteria.local.condominios.map(c => c.name), ...criteria.local.edificios.map(c => c.name), ...criteria.local.nomesDesconhecidos
    ].some(x => normalize(x).includes(nome) || nome.includes(normalize(x)));
    if (already) continue;
    // tenta reconhecer no mapa; senão vira nome próprio que precisa constar no cadastro
    const sub = detectLocations(nome, { index });
    if (sub.mencionaLocal && !sub.nomesDesconhecidos.length) {
      for (const k of ['bairros', 'perto', 'marcos', 'cidades', 'regioes']) criteria.local[k].push(...sub[k].filter(x => !criteria.local[k].includes(x)));
      criteria.local.condominios.push(...sub.condominios);
      criteria.local.edificios.push(...sub.edificios);
    } else if (lp.tipo !== 'cidade') {
      criteria.local.nomesDesconhecidos.push(nome);
    }
    criteria.local.mencionaLocal = true;
    criteria.local.localNaoReconhecido = false;
    criteria.local.resumo.push(`"${nome}" (IA)`);
    changed = true;
  }
  return changed;
}

let cachedIndex = null;
let cachedIndexKey = '';
function getIndex(inventory, settings) {
  const key = JSON.stringify([osmVersion(), (settings.extraPlaces || []).length, inventory.map(p => `${p.id}:${p.setor}:${p.edificio || ''}`).join('|'), JSON.stringify(settings.extraPlaces || [])]);
  if (!cachedIndex || key !== cachedIndexKey) {
    cachedIndex = buildIndex({ extraPlaces: settings.extraPlaces || [], inventory });
    cachedIndexKey = key;
  }
  return cachedIndex;
}

/**
 * Função principal chamada para cada mensagem de grupo e pelo Simulador
 */
async function analyzeMessageAndMatch(messageText, senderName, inventory, options = {}) {
  if (!messageText || messageText.trim().length < 6) {
    return { isLookingForProperty: false, decision: 'IGNORAR', reason: 'Mensagem muito curta' };
  }
  const settings = loadSettings();
  const index = getIndex(inventory, settings);
  const criteria = parseRequest(messageText, { index });

  if (criteria.intent !== 'BUSCA') {
    return {
      isLookingForProperty: false,
      decision: 'IGNORAR',
      criteria,
      reason: criteria.intent === 'OFERTA' ? 'É uma oferta/divulgação de imóvel, não um pedido.' : 'Mensagem não é pedido de imóvel.'
    };
  }

  let usedEngine = 'Motor de regras + Mapa de Goiânia';
  if (options.useAi !== false && settings.usarIaGemini !== false && !localConfiante(criteria.local)) {
    try {
      const aiPlaces = await aiExtractPlaces(messageText);
      if (aiPlaces) {
        usedEngine += ' + Gemini (lugares)';
        if (mergeAiPlaces(criteria, aiPlaces, messageText, index)) criteria.resumo += ' · (IA reforçou a localização)';
      }
    } catch (err) {
      console.error('⚠️ Gemini indisponível, seguindo só com as regras:', err.message);
    }
  }

  const evaluation = evaluateInventory(inventory, criteria, index);
  const minCriterios = Number(settings.minCriteriosParaEnvio ?? 2);
  const maxOfertas = Math.max(1, Number(settings.maxOfertasPorPedido || 3));

  let decision = 'SILENCIO';
  let reason = 'Nenhum imóvel da carteira atende ao pedido.';
  const doubtReasons = [];

  if (evaluation.matches.length && evaluation.criteriaCount >= minCriterios) {
    decision = 'ENVIAR';
    reason = `${evaluation.matches.length} imóvel(is) atendem 100% ao pedido.`;
  } else if (evaluation.matches.length) {
    decision = 'AVISAR';
    reason = 'Pedido vago demais para envio automático (poucos critérios).';
    doubtReasons.push(`O pedido tem poucos detalhes (${evaluation.criteriaCount} critério(s)). Você tem ${evaluation.matches.length} imóvel(is) do tipo pedido — confira se vale mandar.`);
  }
  if (decision !== 'ENVIAR' && evaluation.quase.length && settings.alertarQuase !== false) {
    decision = 'AVISAR';
    reason = 'Há imóvel quase compatível, falta confirmar dado no cadastro.';
  }
  const quaseList = decision === 'ENVIAR' ? [] : evaluation.quase.slice(0, 5);
  for (const q of quaseList) {
    doubtReasons.push(`Imóvel #${q.property.id} (${q.tipo} - ${q.property.setor}) bate em tudo, mas: ${q.unknowns.join('; ')}.`);
  }
  if (decision === 'AVISAR' && !quaseList.length) {
    for (const m of evaluation.matches.slice(0, 3)) doubtReasons.push(`Candidato: #${m.property.id} (${m.tipo} - ${m.property.setor}).`);
  }

  const matches = decision === 'ENVIAR' ? evaluation.matches.slice(0, maxOfertas).map(r => r.property) : [];
  const human = buildHumanContextualParts(messageText, senderName, settings.humanTraining, criteria);

  return {
    isLookingForProperty: true,
    decision,
    reason,
    criteria,
    resumo: criteria.resumo,
    matches,
    matchDetails: evaluation.matches.slice(0, maxOfertas).map(r => ({ id: r.property.id, hits: r.hits, score: r.score })),
    quase: quaseList.map(q => ({ property: q.property, unknowns: q.unknowns })),
    descartes: evaluation.results.filter(r => r.status === 'NAO').slice(0, 10).map(r => ({ id: r.property.id, motivo: r.fails[0] })),
    hasDoubt: decision === 'AVISAR',
    doubtReasons,
    nearMissDoubts: quaseList.map(q => ({ property: q.property, reasons: q.unknowns })),
    detectedTone: human.detectedTone,
    customOpening: human.opening,
    customClosing: human.closing,
    wantsPdf: criteria.tom.querPdf,
    usedEngine
  };
}

// ---------------------------------------------------------------------------
// Mensagem para o parceiro
// ---------------------------------------------------------------------------
function describeProperty(p) {
  const tipo = propTipo(p);
  const lines = [];
  const local = [p.edificio, p.setor].filter(Boolean).join(' · ');
  lines.push(`🏡 *${tipo}${local ? ' - ' + local : ''}*${p.cidade && p.cidade !== 'Goiânia' ? ` (${p.cidade})` : ''}`);
  const det = [];
  if (Number(p.quartos)) {
    const s = propSuites(p);
    det.push(`${p.quartos} quarto${Number(p.quartos) > 1 ? 's' : ''}${s ? ` (${s} suíte${s > 1 ? 's' : ''})` : ''}`);
  }
  if (Number(p.vagas)) det.push(`${p.vagas} vaga${Number(p.vagas) > 1 ? 's' : ''}`);
  if (Number(p.tamanho_m2)) det.push(`${Number(p.tamanho_m2).toLocaleString('pt-BR')} m²`);
  if (det.length) lines.push(`📐 ${det.join(' · ')}`);
  return lines.join('\n');
}

function formatPriceLabel(p) {
  const neg = normalize(p.negociacao);
  const fmt = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  if (/agio/.test(neg) && Number(p.valor_agio)) {
    return `Ágio ${fmt(p.valor_agio)}${Number(p.valor) ? ` (valor total ${fmt(p.valor)})` : ''}`;
  }
  return Number(p.valor) ? fmt(p.valor) : 'Sob consulta';
}

/**
 * Formata a mensagem enviada ao parceiro usando o Modelo de Mensagem do painel
 */
function formatOutreachMessage(senderName, originalMessage, property, analysisContext = null) {
  const settings = loadSettings();
  const template = settings.messageTemplate;
  const human =
    analysisContext && typeof analysisContext === 'object' && analysisContext.customOpening
      ? { opening: analysisContext.customOpening, closing: analysisContext.customClosing }
      : buildHumanContextualParts(originalMessage, senderName, settings.humanTraining);

  const mob = { SIM: 'Mobiliado', SEMI: 'Com armários', NAO: 'Sem mobília' }[String(property.mobiliado || 'NAO').toUpperCase()] || 'Sem mobília';
  const s = propSuites(property);

  return String(template)
    .replace(/\{abertura_humana\}/gi, human.opening)
    .replace(/\{fechamento_humano\}/gi, human.closing)
    .replace(/\{nome\}/gi, firstNameOf(senderName) || '')
    .replace(/\{tipo\}/gi, propTipo(property))
    .replace(/\{setor\}/gi, [property.edificio, property.setor].filter(Boolean).join(' · ') || 'Consulte')
    .replace(/\{edificio\}/gi, property.edificio || '')
    .replace(/\{regiao\}/gi, property.regiao || property.cidade || 'Goiânia')
    .replace(/\{mobiliado\}/gi, mob)
    .replace(/\{quartos\}/gi, property.quartos ? String(property.quartos) : 'Consulte')
    .replace(/\{suites\}/gi, s ? String(s) : '-')
    .replace(/\{vagas\}/gi, property.vagas ? String(property.vagas) : '-')
    .replace(/\{tamanho\}/gi, property.tamanho_m2 ? String(property.tamanho_m2) : 'Consulte')
    .replace(/\{valor\}/gi, formatPriceLabel(property))
    .replace(/\{descricao\}/gi, property.descricao || '')
    .replace(/\{resumo\}/gi, describeProperty(property))
    .replace(/\{mensagem_original\}/gi, originalMessage || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = {
  analyzeMessageAndMatch,
  localConfiante,
  mascararContatos,
  chaveCacheIa,
  formatOutreachMessage,
  buildHumanContextualParts,
  describeProperty,
  formatPriceLabel,
  getGreetingByTime,
  getHourBrasilia,
  firstNameOf,
  fmtPrice
};
