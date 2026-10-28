const { GoogleGenAI } = require('@google/genai');

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
 * 1ª Camada (Rápida / Filtro Pré-IA ou Fallback sem chave de API):
 * Analisa a mensagem com expressões regulares inteligentes que reconhecem todas as variações pedidas:
 * - busco / preciso / procuro / tenho cliente / alguém tem / compro
 * - quarto / quartos / q / qts / suítes
 * - metros / m / m2 / m²
 * - 500mil / 500k / R$500.000,00 / 500.000 / 1.2M
 */
function parseWithSmartRules(text, inventory) {
  const norm = normalizeText(text);

  // 1. Verifica se é realmente uma mensagem de PROCURA (e não alguém vendendo/ofertando)
  const searchKeywords = [
    /\bbusco\b/, /\bpreciso\b/, /\bprocuro\b/, /\bprocurando\b/, /\bbuscando\b/,
    /\btenho cliente\b/, /\bcliente procura\b/, /\bcliente buscando\b/,
    /\balguem tem\b/, /\bquero comprar\b/, /\bcompro\b/, /\bdemanda\b/
  ];
  const offerKeywords = [
    /\bvendo\b/, /\balugo\b/, /\boportunidade unica\b/, /\bfotos no pv\b/, /\bvalor de venda\b/
  ];

  const hasSearchIntent = searchKeywords.some(rx => rx.test(norm));
  const isPureOffer = offerKeywords.some(rx => rx.test(norm)) && !hasSearchIntent;

  if (!hasSearchIntent || isPureOffer) {
    return { isLookingForProperty: false, reason: 'Mensagem não possui intenção de busca/compra de imóvel.' };
  }

  // 2. Extrair Tipo de Imóvel (se mencionado)
  let tipo = null;
  if (/\b(ap|apto|apartamento|apartamentos|flat|studio|kitnet)\b/.test(norm)) {
    tipo = 'Apartamento';
  } else if (/\b(casa|sobrado|condominio fechado|terrea)\b/.test(norm)) {
    tipo = 'Casa';
  } else if (/\b(lote|terreno|area)\b/.test(norm)) {
    tipo = 'Terreno';
  } else if (/\b(sala|comercial|galpao|loja)\b/.test(norm)) {
    tipo = 'Comercial';
  }

  // 3. Extrair Quantidade de Quartos (ex: "3 quartos", "3q", "3 qts", "3 dorm", "3 suites")
  let quartos = null;
  const quartosMatch = norm.match(/\b(\d+)\s*(?:quartos?|qts?|q|dormitorios?|dorms?|suites?)\b/);
  if (quartosMatch) {
    quartos = parseInt(quartosMatch[1], 10);
  }

  // 4. Extrair Tamanho em Metros Quadrados (ex: "90 metros", "90m", "90m2", "90 m²")
  let minM2 = null;
  const m2Match = norm.match(/\b(\d+(?:[.,]\d+)?)\s*(?:metros?\s*quadrados?|metros?|m2|m²|m)\b/);
  if (m2Match) {
    minM2 = parseFloat(m2Match[1].replace(',', '.'));
  }

  // 5. Extrair Valor / Orçamento (ex: "500mil", "500 mil", "500k", "R$500.000,00", "500.000", "1.5 milhao")
  let maxValor = null;

  // Padrão A: "500 mil", "500mil", "500k"
  const milMatch = norm.match(/(?:ate|de|por|maximo|valor|r\$)?\s*(\d+(?:[.,]\d+)?)\s*(?:mil|k)\b/);
  // Padrão B: "1.2 milhao", "1 milhao", "1.5M"
  const milhaoMatch = norm.match(/(\d+(?:[.,]\d+)?)\s*(?:milhao|milhoes|mi)\b/);
  // Padrão C: "R$ 500.000,00", "500.000,00", "500.000"
  const fullNumberMatch = norm.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d{6,9})\b/);

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

  // 6. Extrair Setor / Bairro (comparando com os setores existentes na carteira ou após "no setor X", "no bairro X")
  let setorDetectado = null;
  const setoresConhecidos = [...new Set(inventory.map(i => i.setor).filter(Boolean))];
  for (const s of setoresConhecidos) {
    const sNorm = normalizeText(s);
    const sSemSetor = sNorm.replace(/^(setor|st|jardim|jd|parque|pq|vila|vl|residencial|res)\s+/, '');
    if (sNorm && (norm.includes(sNorm) || (sSemSetor.length >= 4 && norm.includes(sSemSetor)))) {
      setorDetectado = s;
      break;
    }
  }

  if (!setorDetectado) {
    const setorRegex = norm.match(/\b(?:setor|st|bairro|jardim|jd|parque|pq)\s+([a-z0-9\s]{3,20}?)(?:\s+ate\b|\s+de\b|\s+com\b|[,.]|$)/);
    if (setorRegex) {
      setorDetectado = setorRegex[1].trim();
    }
  }

  // 7. Filtrar os imóveis da carteira que dão Match!
  const matchedProperties = filterInventory(inventory, {
    tipo,
    setor: setorDetectado,
    quartos,
    minM2,
    maxValor
  });

  return {
    isLookingForProperty: true,
    criteria: {
      tipo,
      setor: setorDetectado,
      quartos,
      tamanho_m2: minM2,
      valor_maximo: maxValor
    },
    matches: matchedProperties,
    usedEngine: 'Regras Inteligentes (Local)'
  };
}

/**
 * Filtra a carteira de imóveis com base nos critérios extraídos
 */
function filterInventory(inventory, criteria) {
  return inventory.filter(prop => {
    // 1. Filtro de Tipo (Apartamento, Casa, etc.)
    if (criteria.tipo) {
      const propTipo = normalizeText(prop.tipo);
      const critTipo = normalizeText(criteria.tipo);
      if (propTipo && !propTipo.includes(critTipo) && !critTipo.includes(propTipo)) {
        return false;
      }
    }

    // 2. Filtro de Setor / Bairro
    if (criteria.setor) {
      const propSetor = normalizeText(prop.setor).replace(/^(setor|st|jardim|jd|parque|pq)\s+/, '');
      const critSetor = normalizeText(criteria.setor).replace(/^(setor|st|jardim|jd|parque|pq)\s+/, '');
      if (!propSetor.includes(critSetor) && !critSetor.includes(propSetor)) {
        return false;
      }
    }

    // 3. Filtro de Quantidade de Quartos
    if (criteria.quartos && criteria.quartos > 0) {
      // Aceita exato (ou se o cliente pediu 3 quartos e o imóvel tem 3)
      if (prop.quartos !== criteria.quartos) {
        return false;
      }
    }

    // 4. Filtro de Tamanho (Metros Quadrados) - aceita imóveis com pelo menos 90% da metragem pedida
    if (criteria.minM2 && criteria.minM2 > 0) {
      if (prop.tamanho_m2 < criteria.minM2 * 0.9) {
        return false;
      }
    }

    // 5. Filtro de Valor (respeita o teto pedido pelo cliente)
    if (criteria.maxValor && criteria.maxValor > 0) {
      if (prop.valor > criteria.maxValor) {
        return false;
      }
    }

    return true;
  });
}

/**
 * 2ª Camada (IA com Google Gemini + Fallback automático para Regras Inteligentes):
 * Usa o Gemini para compreender gírias, abreviações complexas, contexto da conversa,
 * e cruzar com a carteira de imóveis.
 */
async function analyzeMessageAndMatch(messageText, senderName, inventory) {
  if (!messageText || messageText.trim().length < 5) {
    return { isLookingForProperty: false, reason: 'Mensagem muito curta' };
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();

  // Se o usuário configurou a chave do Gemini, usamos o modelo Gemini 2.5 Flash para análise semântica profunda
  if (apiKey && apiKey !== 'coloque_sua_chave_aqui') {
    try {
      const ai = new GoogleGenAI({ apiKey });

      const portfolioSummary = inventory.map(p => ({
        id: p.id,
        tipo: p.tipo,
        setor: p.setor,
        quartos: p.quartos,
        tamanho_m2: p.tamanho_m2,
        valor: p.valor,
        descricao: p.descricao
      }));

      const prompt = `
Você é uma secretária especialista do mercado imobiliário analisando mensagens em um grupo de WhatsApp.
Sua tarefa é ler a mensagem enviada no grupo e identificar:
1) Se a pessoa está PROCURANDO/BUSCANDO um imóvel para comprar (ex: "busco", "preciso", "procuro", "tenho cliente para", "alguém tem").
   ATENÇÃO: Se a pessoa estiver apenas VENDENDO/OFERTANDO um imóvel próprio, isLookingForProperty deve ser false!
2) Extrair todos os filtros mencionados na mensagem, reconhecendo variações naturais do português e abreviações imobiliárias:
   - Intenção: busco = preciso = procuro = tenho cliente = alguém tem
   - Quartos: quarto = quartos = q = qts = suítes (ex: "3q" -> 3)
   - Tamanho: metros = m = m2 = m² (ex: "80m", "80m2" -> 80)
   - Valor: 500mil = 500k = R$500.000,00 = 500.000 = 500 mil (ex: converter tudo para número absoluto: 500000)
   - Setor / Bairro: ex: "Setor Bueno", "Bueno", "Marista", "Jardim América"
3) Comparar com a nossa CARTEIRA DE IMÓVEIS disponível abaixo e retornar os IDs dos imóveis que atendem perfeitamente ao pedido (mesmo setor se especificado, mesma quantidade de quartos se especificado, tamanho compatível se especificado, e valor menor ou igual ao limite pedido).

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
  "criteria": {
    "tipo": "Apartamento/Casa/etc ou null",
    "setor": "Nome do setor ou null",
    "quartos": numero ou null,
    "tamanho_m2": numero ou null,
    "valor_maximo": numero ou null
  },
  "matchedIds": ["id1", "id2"],
  "customGreeting": "Uma saudação super educada, natural e direta como secretária/consultora imobiliária referenciando o que a pessoa pediu no grupo"
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      });

      const parsed = JSON.parse(response.text);
      const matchedIds = Array.isArray(parsed.matchedIds) ? parsed.matchedIds.map(String) : [];
      const matches = inventory.filter(item => matchedIds.includes(String(item.id)));

      return {
        isLookingForProperty: Boolean(parsed.isLookingForProperty),
        reason: parsed.reason || '',
        criteria: parsed.criteria || {},
        matches,
        customGreeting: parsed.customGreeting || null,
        usedEngine: 'Google Gemini AI (gemini-2.5-flash)'
      };
    } catch (err) {
      console.error('⚠️ Aviso na chamada Gemini AI (usando motor de regras local como fallback imediato):', err.message);
    }
  }

  // Fallback imediato (ou quando ainda não colocou a GEMINI_API_KEY)
  return parseWithSmartRules(messageText, inventory);
}

/**
 * Formata a mensagem completa que será enviada no privado (DM) do potencial comprador
 */
function formatOutreachMessage(senderName, originalMessage, property, customGreeting) {
  const valorFormatado = property.valor
    ? property.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : 'Sob consulta';

  const firstName = senderName ? senderName.split(' ')[0] : 'tudo bem';
  const greeting = customGreeting || `Olá ${firstName}, tudo bem? Vi sua mensagem agora no grupo buscando imóvel no *${property.setor}* e tenho uma excelente opção disponível na nossa carteira que se encaixa no que você procura!`;

  return `${greeting}

🏡 *${property.tipo} - ${property.setor}*
🛏️ *Quartos:* ${property.quartos ? `${property.quartos} quartos` : 'Consulte'}
📐 *Tamanho:* ${property.tamanho_m2 ? `${property.tamanho_m2} m²` : 'Consulte'}
💰 *Valor:* ${valorFormatado}

📝 *Descrição:*
${property.descricao}

Segue(m) a(s) foto(s) do imóvel! Se quiser agendar uma visita ou mais detalhes, estou à disposição por aqui.`;
}

module.exports = {
  analyzeMessageAndMatch,
  formatOutreachMessage,
  parseWithSmartRules
};
