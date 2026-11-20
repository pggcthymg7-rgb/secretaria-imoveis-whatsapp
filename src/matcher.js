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
const GEMINI_MODEL_RX = /^[\w.-]{1,80}$/;

function parseAiPlacesJson(texto) {
  const bruto = String(texto || '').trim();
  if (!bruto) return [];
  const tryParse = s => {
    try {
      const j = JSON.parse(s);
      return j && Array.isArray(j.lugares) ? j.lugares : null;
    } catch {
      return null;
    }
  };
  const direto = tryParse(bruto);
  if (direto) return direto;
  const ini = bruto.indexOf('{');
  const fim = bruto.lastIndexOf('}');
  if (ini >= 0 && fim > ini) {
    const recortado = tryParse(bruto.slice(ini, fim + 1));
    if (recortado) return recortado;
  }
  return [];
}

async function aiExtractPlaces(messageText, tenant = null, { fetcher = fetch } = {}) {
  // Multi-tenant: chave/modelo vêm só do TenantContext do corretor; modo clássico: do .env
  const rawKey = tenant ? (tenant?.ia?.geminiApiKey ?? '') : (process.env.GEMINI_API_KEY ?? '');
  const apiKey = require('./gemini-chave').limparChave(rawKey);
  if (!apiKey || apiKey === 'coloque_sua_chave_aqui') return null;

  const M = require('./gemini-modelo');
  const prazo = Date.now() + 8000;
  const prompt = `Você lê pedidos de imóveis em grupos de corretores de Goiânia-GO.
Extraia SOMENTE nomes de lugares citados no texto: bairros/setores, condomínios, edifícios/empreendimentos, cidades, praças, avenidas e pontos de referência.
Ignore nomes de pessoas, telefones e lugares mencionados como imóvel oferecido em PERMUTA/TROCA.
Responda apenas JSON: {"lugares":[{"nome":"texto exatamente como aparece","tipo":"bairro|condominio|edificio|cidade|marco"}]}
TEXTO:
"""${String(messageText || '').slice(0, 2000)}"""`;

  const rawModel = tenant ? (tenant?.ia?.geminiModel ?? '') : (process.env.GEMINI_MODEL ?? '');
  const explicito = String(rawModel).trim();
  const seen = new Set();
  const ordem = [];
  const pushModel = m => {
    const s = String(m || '').trim();
    if (s && GEMINI_MODEL_RX.test(s) && !seen.has(s)) {
      seen.add(s);
      ordem.push(s);
    }
  };

  let expandiuFallback = false;
  if (explicito) {
    pushModel(explicito);
  } else {
    expandiuFallback = true;
    for (const m of await M.escolherModelos(apiKey, { fetcher, preferirLite: true, max: 3 })) pushModel(m);
    if (!ordem.length) pushModel(await M.escolherModelo(apiKey, { fetcher }));
  }
  if (!ordem.length) return [];

  let ultimoErro = '';
  for (let i = 0; i < ordem.length; i++) {
    const modelo = ordem[i];
    const restante = prazo - Date.now();
    if (restante <= 200) throw new Error('timeout Gemini');

    let r;
    let d = {};
    try {
      r = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 }
        }),
        signal: AbortSignal.timeout(restante)
      });
      d = await r.json().catch(() => ({}));
    } catch (err) {
      throw new Error(String(err?.message || err).slice(0, 200));
    }

    if (r.ok) {
      const texto = ((d?.candidates?.[0]?.content?.parts) || []).map(p => p?.text || '').join('');
      return parseAiPlacesJson(texto);
    }

    const msg = String(d?.error?.message || r.status).slice(0, 240);
    ultimoErro = `Gemini HTTP ${r.status}: ${msg}`;
    if (M.modeloIndisponivel(r.status, msg)) M.marcarIndisponivel(apiKey, modelo);
    const podeTentarOutro = M.modeloIndisponivel(r.status, msg) || r.status === 429 || M.erroTransitorio(r.status, msg);
    if (!podeTentarOutro) throw new Error(ultimoErro);

    if (!expandiuFallback && prazo - Date.now() > 1000) {
      expandiuFallback = true;
      for (const m of await M.escolherModelos(apiKey, { fetcher, preferirLite: true, max: 2 })) pushModel(m);
    }
  }
  throw new Error(ultimoErro || 'Gemini indisponível');
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
  const list = Array.isArray(inventory) ? inventory : [];
  const cfg = settings && typeof settings === 'object' ? settings : {};
  const extras = Array.isArray(cfg.extraPlaces) ? cfg.extraPlaces : [];
  const key = JSON.stringify([osmVersion(), extras.length, list.map(p => `${p && p.id}:${p && p.setor}:${(p && p.edificio) || ''}`).join('|'), JSON.stringify(extras)]);
  if (!cachedIndex || key !== cachedIndexKey) {
    cachedIndex = buildIndex({ extraPlaces: extras, inventory: list });
    cachedIndexKey = key;
  }
  return cachedIndex;
}

/**
 * Função principal chamada para cada mensagem de grupo e pelo Simulador.
 * options.tenant (TenantContext, ver src/tenancy/router.js) traz a configuração de IA do corretor;
 * sem ele, vale a configuração do processo (.env), como no modo de 1 corretor por processo.
 */
async function analyzeMessageAndMatch(messageText, senderName, inventory, options = {}) {
  if (typeof messageText !== 'string' || messageText.trim().length < 6) {
    return { isLookingForProperty: false, decision: 'IGNORAR', reason: 'Mensagem muito curta' };
  }
  const safeInventory = Array.isArray(inventory) ? inventory : [];
  const settings = loadSettings();
  const index = getIndex(safeInventory, settings);
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
  if (options.useAi !== false && settings.usarIaGemini !== false) {
    try {
      const aiPlaces = await aiExtractPlaces(messageText, options.tenant || null, options.fetcher ? { fetcher: options.fetcher } : undefined);
      if (aiPlaces) {
        usedEngine += ' + Gemini (lugares)';
        if (mergeAiPlaces(criteria, aiPlaces, messageText, index)) criteria.resumo += ' · (IA reforçou a localização)';
      }
    } catch (err) {
      console.error('⚠️ Gemini indisponível, seguindo só com as regras:', err.message);
    }
  }

  const evaluation = evaluateInventory(safeInventory, criteria, index);
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

  const safeProp = property && typeof property === 'object' ? property : {};
  const mob = { SIM: 'Mobiliado', SEMI: 'Com armários', NAO: 'Sem mobília' }[String(safeProp.mobiliado || 'NAO').toUpperCase()] || 'Sem mobília';
  const s = propSuites(safeProp);

  return String(template || '')
    .replace(/\{abertura_humana\}/gi, () => human.opening || '')
    .replace(/\{fechamento_humano\}/gi, () => human.closing || '')
    .replace(/\{nome\}/gi, () => firstNameOf(senderName) || '')
    .replace(/\{tipo\}/gi, () => propTipo(safeProp))
    .replace(/\{setor\}/gi, () => [safeProp.edificio, safeProp.setor].filter(Boolean).join(' · ') || 'Consulte')
    .replace(/\{edificio\}/gi, () => safeProp.edificio || '')
    .replace(/\{regiao\}/gi, () => safeProp.regiao || safeProp.cidade || 'Goiânia')
    .replace(/\{mobiliado\}/gi, () => mob)
    .replace(/\{quartos\}/gi, () => (safeProp.quartos ? String(safeProp.quartos) : 'Consulte'))
    .replace(/\{suites\}/gi, () => (s ? String(s) : '-'))
    .replace(/\{vagas\}/gi, () => (safeProp.vagas ? String(safeProp.vagas) : '-'))
    .replace(/\{tamanho\}/gi, () => (safeProp.tamanho_m2 ? String(safeProp.tamanho_m2) : 'Consulte'))
    .replace(/\{valor\}/gi, () => formatPriceLabel(safeProp))
    .replace(/\{descricao\}/gi, () => safeProp.descricao || '')
    .replace(/\{resumo\}/gi, () => describeProperty(safeProp))
    .replace(/\{mensagem_original\}/gi, () => originalMessage || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = {
  analyzeMessageAndMatch,
  formatOutreachMessage,
  buildHumanContextualParts,
  describeProperty,
  formatPriceLabel,
  getGreetingByTime,
  getHourBrasilia,
  firstNameOf,
  fmtPrice
};
