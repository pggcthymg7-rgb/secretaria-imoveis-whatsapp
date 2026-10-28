const { GoogleGenAI } = require('@google/genai');
const { loadSettings } = require('./settings');
const { SETOR_TO_REGIAO_MAP } = require('./sheets');

/**
 * Normaliza texto para comparação sem acentos e em minúsculas
 */
function normalizeText(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * 1ª Camada (Motor de Regras Inteligentes com Vocabulário Extenso Imobiliário):
 * Reconhece:
 * - Intenção ampla de compra/busca: quero, querendo, gostaria, busco, preciso, procuro,
 *   tenho cliente, cliente quer, alguém tem, quem tem, tô atrás, estou atrás, compro,
 *   necessito, interesse em, tem disponível, me manda, etc. (E até pedidos diretos como "ap 3q setor bueno até 500k?")
 * - Mobiliado / Semimobiliado / Vazio: mobiliado, todo mobiliado, porteira fechada, decorado,
 *   semimobiliado, rico em armários, sem mobília.
 * - Região ou Qualquer Setor: "região sul", "região sudoeste", "zona sul", "qualquer setor", "qualquer região".
 * - Características extras validadas na descrição da carteira: suíte, piscina, térrea, varanda gourmet, lazer, vagas, condomínio, etc.
 */
function parseWithSmartRules(text, inventory) {
  const norm = normalizeText(text);

  // 1. Identificar se é uma OFERTA (alguém vendendo/divulgando) para não confundir com comprador
  const offerPatterns = [
    /\bvendo\b/,
    /\balugo\b/,
    /\ba venda\b/,
    /\boportunidade unica\b/,
    /\bfotos no pv\b/,
    /\bchama no pv\b/,
    /\bvalor do investimento\b/,
    /\bcomissao\b/,
    /\bdisponivel para venda\b/,
    /\blindo apartamento\b/,
    /\bexcelente oportunidade\b/
  ];

  // 2. Vocabulário extenso de INTENÇÃO DE BUSCA / COMPRA
  const searchPatterns = [
    /\bquero\b/,
    /\bquerendo\b/,
    /\bgostaria\b/,
    /\bbusco\b/,
    /\bbuscando\b/,
    /\bpreciso\b/,
    /\bprecisando\b/,
    /\bprocuro\b/,
    /\bprocurando\b/,
    /\btenho cliente\b/,
    /\bcliente procura\b/,
    /\bcliente buscando\b/,
    /\bcliente quer\b/,
    /\bcliente precisa\b/,
    /\balguem tem\b/,
    /\balguem com\b/,
    /\bquem tem\b/,
    /\bquem tiver\b/,
    /\btem algum\b/,
    /\btem disponivel\b/,
    /\bquero comprar\b/,
    /\bcompro\b/,
    /\bdemanda\b/,
    /\bnecessito\b/,
    /\bestou atras\b/,
    /\bto atras\b/,
    /\binteresse em\b/,
    /\binteressado em\b/,
    /\bme manda\b/,
    /\bmanda opcao\b/,
    /\bopcoes de\b/,
    /\bindicacao de\b/,
    /\bpesquisando\b/,
    /\bsonho de comprar\b/,
    /\bquer comprar\b/
  ];

  const hasExplicitSearch = searchPatterns.some(rx => rx.test(norm));
  const hasExplicitOffer = offerPatterns.some(rx => rx.test(norm));

  // Também aceita mensagens curtas em formato de pergunta ou filtro direto (ex: "Apartamento 3q no Bueno até 500mil?")
  const hasPropertyNoun = /\b(ap|apto|apartamento|casa|sobrado|imovel|kitnet|studio|flat|lote|terreno|cobertura|sala)\b/.test(norm);
  const hasPriceLimitOrQuestion = /\b(ate|max|maximo|no maximo)\b/.test(norm) || text.includes('?');
  const isImplicitSearch = !hasExplicitOffer && hasPropertyNoun && hasPriceLimitOrQuestion;

  if ((!hasExplicitSearch && !isImplicitSearch) || (hasExplicitOffer && !hasExplicitSearch)) {
    return { isLookingForProperty: false, reason: 'Mensagem não possui intenção de busca/compra de imóvel.' };
  }

  // 3. Extrair Tipo de Imóvel (Nota: "imóvel" genérico aceita qualquer tipo!)
  let tipo = null;
  if (/\b(ap|apto|apartamento|apartamentos|flat|studio|kitnet|cobertura)\b/.test(norm)) {
    tipo = 'Apartamento';
  } else if (/\b(casa|casas|sobrado|condominio fechado|terrea)\b/.test(norm)) {
    tipo = 'Casa';
  } else if (/\b(lote|terreno|area)\b/.test(norm)) {
    tipo = 'Terreno';
  } else if (/\b(sala|comercial|galpao|loja)\b/.test(norm)) {
    tipo = 'Comercial';
  }

  // 4. Extrair Mobília (Mobiliado / Semimobiliado / Não mobiliado)
  let mobiliado = null;
  if (/\b(sem mobilia|nao mobiliado|vazio)\b/.test(norm)) {
    mobiliado = 'NAO';
  } else if (/\b(semimobiliado|semi mobiliado|semi-mobiliado|com armarios)\b/.test(norm)) {
    mobiliado = 'SEMI';
  } else if (/\b(mobiliado|mobiliada|porteira fechada|todo mobiliado|100% mobiliado|decorado e mobiliado)\b/.test(norm)) {
    mobiliado = 'SIM';
  }

  // 5. Extrair Quantidade de Quartos ("3 quartos", "3q", "3 qts", "3 dorm", "3 suítes")
  let quartos = null;
  const quartosMatch = norm.match(/\b(\d+)\s*(?:quartos?|qts?|q|dormitorios?|dorms?|suites?)\b/);
  if (quartosMatch) {
    quartos = parseInt(quartosMatch[1], 10);
  }

  // 6. Extrair Tamanho em Metros Quadrados ("90 metros", "90m", "90m2", "90 m²")
  let minM2 = null;
  const m2Match = norm.match(/\b(\d+(?:[.,]\d+)?)\s*(?:metros?\s*quadrados?|metros?|m2|m²|m)\b/);
  if (m2Match) {
    minM2 = parseFloat(m2Match[1].replace(',', '.'));
  }

  // 7. Extrair Valor / Orçamento ("500mil", "500k", "R$500.000,00", "400.000,00", "400.000", "1.2 milhão")
  let maxValor = null;
  const milhaoMatch = norm.match(/(\d+(?:[.,]\d+)?)\s*(?:milhao|milhoes|mi)\b/);
  const milMatch = norm.match(/(?:ate|de|por|maximo|max|valor|r\$)?\s*(\d+(?:[.,]\d+)?)\s*(?:mil|k)\b/);
  const fullNumberMatch = norm.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d{5,9}(?:,\d{2})?)\b/);

  if (milhaoMatch) {
    maxValor = parseFloat(milhaoMatch[1].replace(',', '.')) * 1000000;
  } else if (milMatch) {
    maxValor = parseFloat(milMatch[1].replace(',', '.')) * 1000;
  } else if (fullNumberMatch) {
    const cleanNum = fullNumberMatch[1].replace(/\./g, '').replace(/,\d+$/, '');
    const parsed = parseFloat(cleanNum);
    if (parsed >= 50000) {
      maxValor = parsed;
    }
  }

  // 8. Extrair Região (ex: "região sul", "zona sul", "região sudoeste") ou "qualquer setor"
  let regiaoDetectada = null;
  let qualquerSetor = /\b(qualquer setor|qualquer bairro|qualquer regiao|qualquer lugar|tanto faz o setor)\b/.test(norm);

  const regiaoMatch = norm.match(/\b(?:regiao|zona)\s+(sul|sudoeste|oeste|norte|leste|central|centro)\b/);
  if (regiaoMatch) {
    const r = regiaoMatch[1] === 'centro' ? 'central' : regiaoMatch[1];
    regiaoDetectada = 'Região ' + r.charAt(0).toUpperCase() + r.slice(1);
  }

  // 9. Extrair Setor / Bairro específico (se não disse "qualquer setor")
  let setorDetectado = null;
  if (!qualquerSetor) {
    const setoresConhecidos = [...new Set(inventory.map(i => i.setor).filter(Boolean))];
    for (const s of setoresConhecidos) {
      const sNorm = normalizeText(s);
      const sSemPrefixo = sNorm.replace(/^(setor|st|jardim|jd|parque|pq|vila|vl|residencial|res)\s+/, '');
      if (sNorm && (norm.includes(sNorm) || (sSemPrefixo.length >= 4 && norm.includes(sSemPrefixo)))) {
        setorDetectado = s;
        break;
      }
    }

    if (!setorDetectado && !regiaoDetectada) {
      const setorRegex = norm.match(
        /\b(?:setor|st|bairro|jardim|jd|parque|pq)\s+([a-z0-9\s]{3,20}?)(?:\s+ate\b|\s+de\b|\s+com\b|\s+mobiliado\b|[,.?]|$)/
      );
      if (setorRegex && !setorRegex[1].includes('qualquer')) {
        setorDetectado = setorRegex[1].trim();
      }
    }
  }

  // 10. Extrair palavras-chave de características específicas para validar na descrição da carteira
  const featureVocabulary = [
    { key: 'piscina', rx: /\bpiscina\b/ },
    { key: 'varanda gourmet', rx: /\b(varanda gourmet|sacada gourmet)\b/ },
    { key: 'churrasqueira', rx: /\bchurrasqueira\b/ },
    { key: 'nascente', rx: /\bnascente\b/ },
    { key: 'andar alto', rx: /\bandar alto\b/ },
    { key: 'terrea', rx: /\b(terrea|terreo)\b/ },
    { key: 'elevador privativo', rx: /\belevador privativo\b/ }
  ];
  const caracteristicasExtras = featureVocabulary
    .filter(f => f.rx.test(norm))
    .map(f => f.key);

  const criteria = {
    tipo,
    setor: qualquerSetor ? null : setorDetectado,
    regiao: regiaoDetectada,
    mobiliado,
    quartos,
    tamanho_m2: minM2,
    valor_maximo: maxValor,
    caracteristicas: caracteristicasExtras
  };

  const matchedProperties = filterInventory(inventory, criteria);
  const settings = loadSettings();
  const humanParts = buildHumanContextualParts(text, 'Cliente', settings.humanTraining);

  return {
    isLookingForProperty: true,
    criteria,
    matches: matchedProperties,
    detectedTone: humanParts.detectedTone,
    customOpening: humanParts.opening,
    customClosing: humanParts.closing,
    usedEngine: 'Vocabulário Imobiliário Expandido + Adaptação Humana'
  };
}

/**
 * Retorna a saudação correta pelo fuso horário de Brasília (Bom dia / Boa tarde / Boa noite)
 */
function getGreetingByTime() {
  try {
    const hourStr = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric',
      hour12: false
    }).format(new Date());
    const hour = parseInt(hourStr, 10);
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  } catch {
    return 'Olá';
  }
}

/**
 * Analisa o tom da mensagem do grupo + regras de treinamento do corretor para adaptar
 * a fala da secretária como uma pessoa real conversando no WhatsApp
 */
function buildHumanContextualParts(messageText, senderName, humanTraining = '') {
  const norm = normalizeText(messageText || '');
  const firstName = senderName ? senderName.split(' ')[0] : 'tudo bem';
  const saudacao = getGreetingByTime();

  // 1. Verifica regras personalizadas escritas pelo usuário na caixa de Treinamento ("Se pedir X, diga Y")
  if (humanTraining && humanTraining.trim()) {
    const lines = humanTraining.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      // Ignora as regras padrão que já tratamos nativamente abaixo
      if (line.includes('urgência (ex:') || line.includes('corretor falando que tem cliente') || line.includes('pagamento à vista ou investidor') || line.includes('Use sempre um tom humano')) {
        continue;
      }
      const matchRule = line.match(/se\s+(?:a pessoa\s+|alguem\s+|o cliente\s+)?(?:pedir|falar|mencionar|disser|buscar|procurar)\s+([^,:-]+?)\s*(?:,|->|:|\bdiga\b|\bfale\b|\bresponda\b)\s*(?:diga|fale|responda)?\s*:?\s*["“]?([^"”]+)["”]?/i);
      if (matchRule) {
        const triggerWords = matchRule[1]
          .split(/\s+ou\s+|\s*\/\s*|\s*,\s*/)
          .map(w => normalizeText(w))
          .filter(w => w.length >= 3);
        const customReply = matchRule[2].trim();
        if (triggerWords.some(tw => norm.includes(tw))) {
          return {
            detectedTone: `Regra Treinada ("${triggerWords[0]}")`,
            opening: `${saudacao} ${firstName}, tudo bem? Vi sua mensagem agora lá no grupo! ${customReply}`,
            closing: `Segue(m) a(s) foto(s) aqui embaixo! Qualquer dúvida ou se quiser ir lá conhecer, é só me chamar.`
          };
        }
      }
    }
  }

  // 2. Contexto de URGÊNCIA ("urgente", "pra hoje", "visita hoje", "rápido", "cliente na cidade", "imediato")
  const isUrgent = /\b(urgente|urgencia|pra hoje|para hoje|hoje ainda|visita hoje|agora|rapido|imediato|cliente na cidade|fechar hoje|preciso logo|com pressa)\b/.test(norm);
  if (isUrgent) {
    return {
      detectedTone: '⚡ URGÊNCIA (Visita disponível a qualquer horário)',
      opening: `${saudacao} ${firstName}, tudo bem? Vi lá no grupo que você precisa com urgência! Tenho essa daqui disponível na carteira e podemos ir visitar a qualquer horário, é só me avisar:`,
      closing: `Segue(m) a(s) foto(s) do imóvel! Como você precisa rápido, consigo me organizar para irmos lá a qualquer horário, é só me falar aqui.`
    };
  }

  // 3. Contexto de PARCERIA / CORRETOR COM CLIENTE ("tenho cliente", "cliente procura", "parceria", "fifty")
  const isPartnerBroker = /\b(tenho cliente|cliente procura|cliente buscando|cliente quer|cliente precisa|parceria|fifty|50\/50|corretor)\b/.test(norm);
  if (isPartnerBroker) {
    return {
      detectedTone: '🤝 PARCERIA / CORRETOR COM CLIENTE',
      opening: `${saudacao} ${firstName}, tudo bem? Vi sua mensagem no grupo falando do seu cliente! Tenho essa opção aqui na nossa carteira que encaixa certinho no perfil que ele busca:`,
      closing: `Segue(m) a(s) foto(s)! Fazemos parceria sim — se quiser apresentar para o seu cliente, podemos ir visitar a qualquer horário, é só me avisar!`
    };
  }

  // 4. Contexto de PAGAMENTO À VISTA / INVESTIDOR / PERMUTA
  const isCashOrInvestor = /\b(a vista|dinheiro na mao|investidor|investimento|permuta)\b/.test(norm);
  if (isCashOrInvestor) {
    return {
      detectedTone: '💎 COMPRADOR À VISTA / INVESTIDOR',
      opening: `${saudacao} ${firstName}, tudo bem? Vi sua busca agora no grupo! Tenho essa daqui na carteira que é uma excelente oportunidade de negócio nesse perfil:`,
      closing: `Segue(m) a(s) foto(s)! Se quiser ir lá conhecer pessoalmente, podemos ir a qualquer horário, é só me avisar por aqui.`
    };
  }

  // 5. Tom Humano Natural Padrão (adaptado ao horário do dia)
  return {
    detectedTone: `💬 CONVERSA HUMANA NATURAL (${saudacao})`,
    opening: `${saudacao} ${firstName}, tudo bem? Vi sua mensagem agora lá no grupo e tenho essa daqui na nossa carteira que encaixa muito bem no que você procura:`,
    closing: `Segue(m) a(s) foto(s) do imóvel! Se gostar e quiser conhecer pessoalmente, podemos ir a qualquer horário, é só me avisar.`
  };
}

/**
 * Verifica se um imóvel pertence à região pedida pelo cliente (olhando a coluna regiao ou o mapa de setores)
 */
function propertyMatchesRegiao(prop, targetRegiao) {
  const targetNorm = normalizeText(targetRegiao);
  const propRegNorm = normalizeText(prop.regiao);
  if (propRegNorm && (propRegNorm.includes(targetNorm) || targetNorm.includes(propRegNorm))) {
    return true;
  }

  const propSetorNorm = normalizeText(prop.setor);
  const mapSetores = SETOR_TO_REGIAO_MAP[targetNorm] || [];
  return mapSetores.some(st => propSetorNorm.includes(st) || st.includes(propSetorNorm));
}

/**
 * Verifica se um imóvel atende ao pedido de mobília (olhando a coluna `mobiliado` E a `descricao` do imóvel)
 */
function propertyMatchesMobiliado(prop, targetMobiliado) {
  const propMob = (prop.mobiliado || 'NAO').toUpperCase();
  const descNorm = normalizeText(prop.descricao);

  if (targetMobiliado === 'SIM') {
    return (
      propMob === 'SIM' ||
      /\b(mobiliado|mobiliada|porteira fechada|decorado e mobiliado|todo mobiliado)\b/.test(descNorm)
    );
  }
  if (targetMobiliado === 'SEMI') {
    return (
      propMob === 'SIM' ||
      propMob === 'SEMI' ||
      /\b(mobiliado|semimobiliado|armarios)\b/.test(descNorm)
    );
  }
  if (targetMobiliado === 'NAO') {
    return propMob === 'NAO';
  }
  return true;
}

/**
 * Filtra a carteira de imóveis validando todas as informações contra os imóveis cadastrados
 */
function filterInventory(inventory, criteria) {
  return inventory.filter(prop => {
    // 1. Filtro de Tipo (Se o cliente pediu "imóvel" genérico, criteria.tipo é null e aceita todos!)
    if (criteria.tipo) {
      const propTipo = normalizeText(prop.tipo);
      const critTipo = normalizeText(criteria.tipo);
      if (propTipo && !propTipo.includes(critTipo) && !critTipo.includes(propTipo)) {
        return false;
      }
    }

    // 2. Filtro de Setor / Bairro específico
    if (criteria.setor) {
      const propSetor = normalizeText(prop.setor).replace(/^(setor|st|jardim|jd|parque|pq)\s+/, '');
      const critSetor = normalizeText(criteria.setor).replace(/^(setor|st|jardim|jd|parque|pq)\s+/, '');
      const descNorm = normalizeText(prop.descricao);
      if (!propSetor.includes(critSetor) && !critSetor.includes(propSetor) && !descNorm.includes(critSetor)) {
        return false;
      }
    }

    // 3. Filtro de Região (ex: "Região Sul", "Região Sudoeste")
    if (criteria.regiao) {
      if (!propertyMatchesRegiao(prop, criteria.regiao)) {
        return false;
      }
    }

    // 4. Filtro de Mobiliado (ex: "procuro imóvel mobiliado")
    if (criteria.mobiliado) {
      if (!propertyMatchesMobiliado(prop, criteria.mobiliado)) {
        return false;
      }
    }

    // 5. Filtro de Quantidade de Quartos
    if (criteria.quartos && criteria.quartos > 0) {
      if (prop.quartos !== criteria.quartos) {
        return false;
      }
    }

    // 6. Filtro de Tamanho (Metros Quadrados) - aceita até 10% de tolerância
    if (criteria.tamanho_m2 && criteria.tamanho_m2 > 0) {
      if (prop.tamanho_m2 < criteria.tamanho_m2 * 0.9) {
        return false;
      }
    }

    // 7. Filtro de Valor Máximo
    if (criteria.valor_maximo && criteria.valor_maximo > 0) {
      if (prop.valor > criteria.valor_maximo) {
        return false;
      }
    }

    // 8. Filtro de Características Extras validadas na descrição do imóvel na carteira
    if (Array.isArray(criteria.caracteristicas) && criteria.caracteristicas.length > 0) {
      const fullPropText = normalizeText(`${prop.tipo} ${prop.setor} ${prop.regiao} ${prop.descricao}`);
      for (const feat of criteria.caracteristicas) {
        const featNorm = normalizeText(feat);
        if (!fullPropText.includes(featNorm)) {
          return false;
        }
      }
    }

    return true;
  });
}

/**
 * Analisa a mensagem com IA (Google Gemini) + Vocabulário Expandido Local
 * sempre validando rigorosamente contra os dados da carteira!
 */
async function analyzeMessageAndMatch(messageText, senderName, inventory) {
  if (!messageText || messageText.trim().length < 4) {
    return { isLookingForProperty: false, reason: 'Mensagem muito curta' };
  }

  const settings = loadSettings();
  const saudacao = getGreetingByTime();
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();

  if (apiKey && apiKey !== 'coloque_sua_chave_aqui') {
    try {
      const ai = new GoogleGenAI({ apiKey });

      const portfolioSummary = inventory.map(p => ({
        id: p.id,
        tipo: p.tipo,
        setor: p.setor,
        regiao: p.regiao,
        mobiliado: p.mobiliado,
        quartos: p.quartos,
        tamanho_m2: p.tamanho_m2,
        valor: p.valor,
        descricao: p.descricao
      }));

      const prompt = `
Você é uma secretária humana especialista do mercado imobiliário analisando mensagens em um grupo de WhatsApp.
Horário atual para saudação: "${saudacao}".
Nome de quem enviou no grupo: "${senderName || 'Cliente'}".

INSTRUÇÕES DE TREINAMENTO E TOM HUMANO DA SECRETÁRIA:
${settings.humanTraining || 'Seja simpática, direta e humana como em uma conversa real de WhatsApp.'}

Sua tarefa é ler a mensagem enviada no grupo e identificar:
1) Se a pessoa está PEDINDO/PROCURANDO/QUERENDO um imóvel para comprar.
   Reconheça vocabulário amplo: "quero", "gostaria", "busco", "preciso", "procuro", "tenho cliente", "cliente quer", "alguém tem", "quem tem", "estou atrás", "compro", "me manda opções", etc.
   ATENÇÃO: Se a pessoa estiver apenas VENDENDO/OFERTANDO um imóvel próprio, isLookingForProperty deve ser false!
2) Extrair todos os filtros mencionados na mensagem:
   - Tipo: Apartamento, Casa, Terreno, Comercial, ou null se pediu "imóvel" de forma geral.
   - Setor: Nome do bairro/setor específico, ou null se disse "qualquer setor" ou pediu apenas por região.
   - Região: ex: "Região Sul", "Região Sudoeste", "Região Oeste", "Região Norte", "Região Central", ou null.
   - Mobiliado: "SIM" (se pediu mobiliado / porteira fechada / todo mobiliado), "SEMI" (se pediu semimobiliado / com armários), "NAO" (se pediu vazio), ou null (se não exigiu mobília).
   - Quartos: número inteiro (reconheça quarto = quartos = q = qts = suítes) ou null.
   - Tamanho: número em m² (reconheça metros = m = m2 = m²) ou null.
   - Valor máximo: número absoluto em R$ (reconheça 400.000,00 = R$400.000 = 400mil = 400k -> 400000) ou null.
3) Comparar com a nossa CARTEIRA DE IMÓVEIS disponível abaixo validando TODAS as informações dos imóveis e retornar os IDs compatíveis.
4) Criar "customOpening" (frase inicial humana adaptada à mensagem e às instruções de treinamento acima, ex: se pedir urgente diga que tem essa daqui e podemos ir a qualquer horário, só avisar) e "customClosing" (frase final humana natural).

MENSAGEM ENVIADA POR "${senderName || 'Participante'}":
"""
${messageText}
"""

NOSSA CARTEIRA DE IMÓVEIS DISPONÍVEIS:
${JSON.stringify(portfolioSummary, null, 2)}

Responda APENAS com um JSON válido seguindo exatamente este formato:
{
  "isLookingForProperty": true ou false,
  "reason": "Breve explicação do que você entendeu da mensagem",
  "detectedTone": "Ex: Urgência / Parceria / Conversa Natural",
  "customOpening": "Frase de abertura humana e natural adaptada ao pedido",
  "customClosing": "Frase de fechamento humana e natural adaptada ao pedido",
  "criteria": {
    "tipo": "Apartamento/Casa/etc ou null",
    "setor": "Nome do setor ou null",
    "regiao": "Região Sul/Sudoeste/etc ou null",
    "mobiliado": "SIM/SEMI/NAO ou null",
    "quartos": numero ou null,
    "tamanho_m2": numero ou null,
    "valor_maximo": numero ou null
  },
  "matchedIds": ["id1", "id2"]
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.25
        }
      });

      const parsed = JSON.parse(response.text);
      const matchedIds = Array.isArray(parsed.matchedIds) ? parsed.matchedIds.map(String) : [];
      const matches = inventory.filter(item => matchedIds.includes(String(item.id)));
      const fallbackHuman = buildHumanContextualParts(messageText, senderName, settings.humanTraining);

      return {
        isLookingForProperty: Boolean(parsed.isLookingForProperty),
        reason: parsed.reason || '',
        detectedTone: parsed.detectedTone || fallbackHuman.detectedTone,
        customOpening: parsed.customOpening || fallbackHuman.opening,
        customClosing: parsed.customClosing || fallbackHuman.closing,
        criteria: parsed.criteria || {},
        matches,
        usedEngine: 'Google Gemini AI + Treinamento Humano'
      };
    } catch (err) {
      console.error('⚠️ Aviso na chamada Gemini AI (usando vocabulário expandido + adaptação humana local):', err.message);
    }
  }

  const localResult = parseWithSmartRules(messageText, inventory);
  if (localResult.isLookingForProperty) {
    const humanParts = buildHumanContextualParts(messageText, senderName, settings.humanTraining);
    localResult.detectedTone = humanParts.detectedTone;
    localResult.customOpening = humanParts.opening;
    localResult.customClosing = humanParts.closing;
  }
  return localResult;
}

/**
 * Formata a mensagem enviada para o cliente usando o Modelo de Mensagem + Adaptação Humana Contextual!
 */
function formatOutreachMessage(senderName, originalMessage, property, analysisContext = null) {
  const settings = loadSettings();
  let template = settings.messageTemplate;

  const firstName = senderName ? senderName.split(' ')[0] : 'Cliente';
  const humanParts =
    analysisContext && typeof analysisContext === 'object' && analysisContext.customOpening
      ? {
          opening: analysisContext.customOpening,
          closing: analysisContext.customClosing
        }
      : buildHumanContextualParts(originalMessage, firstName, settings.humanTraining);

  // Se o Modo Humano Adaptativo estiver ativo e o template ainda tiver o texto antigo fixo de robô,
  // converte automaticamente a abertura e o fechamento para se adaptar à mensagem do cliente!
  if (settings.humanModeEnabled !== false) {
    template = template
      .replace(
        /^Olá \{nome\}, tudo bem\? Vi sua mensagem agora no grupo procurando imóvel[^\n]*/i,
        '{abertura_humana}'
      )
      .replace(
        /Segue\(m\) a\(s\) foto\(s\) do imóvel! Se quiser agendar uma visita ou mais detalhes, estou à disposição por aqui\.?$/i,
        '{fechamento_humano}'
      );
  }

  const valorFormatado = property.valor
    ? property.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : 'Sob consulta';

  const mobiliaLabel =
    property.mobiliado === 'SIM'
      ? 'Sim (Mobiliado)'
      : property.mobiliado === 'SEMI'
      ? 'Semimobiliado / Armários'
      : 'Sem mobília';

  return template
    .replace(/\{abertura_humana\}/gi, humanParts.opening)
    .replace(/\{fechamento_humano\}/gi, humanParts.closing)
    .replace(/\{nome\}/gi, firstName)
    .replace(/\{tipo\}/gi, property.tipo || 'Imóvel')
    .replace(/\{setor\}/gi, property.setor || 'Consulte')
    .replace(/\{regiao\}/gi, property.regiao || 'Goiânia')
    .replace(/\{mobiliado\}/gi, mobiliaLabel)
    .replace(/\{quartos\}/gi, property.quartos ? String(property.quartos) : 'Consulte')
    .replace(/\{tamanho\}/gi, property.tamanho_m2 ? String(property.tamanho_m2) : 'Consulte')
    .replace(/\{valor\}/gi, valorFormatado)
    .replace(/\{descricao\}/gi, property.descricao || '')
    .replace(/\{mensagem_original\}/gi, originalMessage || '');
}

module.exports = {
  analyzeMessageAndMatch,
  formatOutreachMessage,
  parseWithSmartRules,
  buildHumanContextualParts
};
