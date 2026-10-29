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

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Verifica se `term` aparece como palavra/frase inteira dentro de `text` (respeitando bordas de palavra \b).
 * Impede erros como "sudoeste" dar match com "oeste"!
 */
function hasExactWordOrPhrase(textNorm, termNorm) {
  if (!textNorm || !termNorm) return false;
  const rx = new RegExp(`(?:^|\\b)${escapeRegex(termNorm)}(?:\\b|$)`, 'i');
  return rx.test(textNorm);
}

/**
 * Remove prefixos genéricos ("setor", "st", "jardim", "parque", etc.) para comparar o núcleo do bairro
 */
function stripSetorPrefix(setorStr) {
  return normalizeText(setorStr)
    .replace(/^(?:setor|st|bairro|jardim|jd|parque|pq|vila|vl|residencial|res|condominio|cond)\s+/i, '')
    .trim();
}

/**
 * Formata o nome do setor para exibição limpa (ex: "bueno" -> "Setor Bueno", "jardim america" -> "Jardim América")
 */
function formatCanonicalSetorName(rawTerm) {
  const clean = stripSetorPrefix(rawTerm);
  const mapCanonical = {
    'bueno': 'Setor Bueno',
    'marista': 'Setor Marista',
    'oeste': 'Setor Oeste',
    'sudoeste': 'Setor Sudoeste',
    'bela vista': 'Setor Bela Vista',
    'pedro ludovico': 'Setor Pedro Ludovico',
    'nova suica': 'Setor Nova Suíça',
    'serrinha': 'Setor Serrinha',
    'sul': 'Setor Sul',
    'aeroporto': 'Setor Aeroporto',
    'central': 'Setor Central',
    'centro': 'Setor Central',
    'universitario': 'Setor Universitário',
    'leste universitario': 'Setor Leste Universitário',
    'vila nova': 'Setor Vila Nova',
    'jao': 'Setor Jaó',
    'santa genoveva': 'Setor Santa Genoveva',
    'urias magalhaes': 'Setor Urias Magalhães',
    'negrao de lima': 'Setor Negrão de Lima',
    'campinas': 'Setor Campinas',
    'coimbra': 'Setor Coimbra',
    'aeroviario': 'Setor Aeroviário',
    'castelo branco': 'Setor Castelo Branco',
    'faicalville': 'Setor Faiçalville',
    'jardim america': 'Jardim América',
    'parque amazonia': 'Parque Amazônia',
    'jardim goias': 'Jardim Goiás',
    'alto da gloria': 'Alto da Glória',
    'vila rosa': 'Vila Rosa',
    'jardim atlantico': 'Jardim Atlântico',
    'cidade jardim': 'Cidade Jardim',
    'eldorado': 'Residencial Eldorado',
    'parque oeste': 'Parque Oeste',
    'jardim europa': 'Jardim Europa',
    'celina park': 'Celina Park',
    'novo horizonte': 'Novo Horizonte',
    'alphaville': 'Alphaville',
    'portal do sol': 'Portal do Sol',
    'aldeia do vale': 'Aldeia do Vale',
    'jardim guanabara': 'Jardim Guanabara',
    'goiania 2': 'Goiânia 2',
    'goiania ii': 'Goiânia 2',
    'novo mundo': 'Jardim Novo Mundo',
    'jardim novo mundo': 'Jardim Novo Mundo',
    'flamboyant': 'Parque Flamboyant',
    'parque flamboyant': 'Parque Flamboyant'
  };
  if (mapCanonical[clean]) return mapCanonical[clean];
  return rawTerm
    .trim()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Extrai TODOS os setores/bairros mencionados na mensagem do cliente, mesmo quando
 * o cliente escreve sem a palavra "Setor" na frente e lista vários separados por vírgula!
 * Ex: "Apartamento, Bueno, Marista, Oeste!" -> ['Setor Bueno', 'Setor Marista', 'Setor Oeste']
 * IMPORTANTE: Se o cliente disser "na região sul próximo ao Bueno", extrai a Região Sul e não trava apenas no bairro de referência!
 */
function extractRequestedSetores(normText, inventory = []) {
  // Remove menções explícitas a regiões ("região sul", "zona oeste", etc.)
  let scanText = normText.replace(/\b(?:regiao|zona)\s+(?:sul|sudoeste|oeste|norte|leste|central|centro)\b/g, ' ');

  // Se a pessoa pediu "na região X próximo a [bairro]", remove o trecho "proximo a/ao [bairro]" da trava estrita de setor
  // para que a busca respeite a Região X inteira caso ela tenha pedido por Região!
  if (/\b(?:regiao|zona)\s+(?:sul|sudoeste|oeste|norte|leste|central|centro)\b/.test(normText)) {
    scanText = scanText.replace(/\b(?:proximo|perto|ao lado|vizinho)\s+(?:a|ao|as|aos|de|do|da|dos|das)\s+[a-z0-9\s,]+?(?=[,.!?;:\n]|$)/g, ' ');
  }

  const foundNucleos = new Set();
  const foundLabels = [];

  const addSetor = (label) => {
    const nucleo = stripSetorPrefix(label);
    if (!nucleo || nucleo.length < 3) return;
    if (!foundNucleos.has(nucleo)) {
      foundNucleos.add(nucleo);
      foundLabels.push(formatCanonicalSetorName(label));
    }
  };

  // 1. Coleta todos os setores conhecidos do mapa de Goiânia + setores cadastrados na planilha
  const candidateTerms = new Set();
  for (const list of Object.values(SETOR_TO_REGIAO_MAP)) {
    for (const item of list) {
      candidateTerms.add(normalizeText(item));
    }
  }
  for (const prop of inventory) {
    if (prop.setor) {
      const sNorm = normalizeText(prop.setor);
      const sCore = stripSetorPrefix(prop.setor);
      if (sNorm) candidateTerms.add(sNorm);
      if (sCore.length >= 4) candidateTerms.add(sCore);
    }
  }

  const requirePrefixIfAlone = new Set(['sul', 'centro', 'central']);
  const sortedTerms = [...candidateTerms].sort((a, b) => b.length - a.length);

  for (const term of sortedTerms) {
    if (!term || term.length < 3) continue;
    if (requirePrefixIfAlone.has(term)) continue;

    if (hasExactWordOrPhrase(scanText, term)) {
      addSetor(term);
      const rxConsume = new RegExp(`(?:^|\\b)${escapeRegex(term)}(?:\\b|$)`, 'gi');
      scanText = scanText.replace(rxConsume, ' ');
    }
  }

  // 2. Também captura qualquer bairro antecedido explicitamente por "setor / st / jardim / parque / bairro / vila / residencial"
  const explicitPrefixRx = /\b(?:setor|st|bairro|jardim|jd|parque|pq|vila|vl|residencial|res)\s+([a-z0-9]+(?:\s+[a-z0-9]+){0,2}?)(?=\s+(?:ate|de|por|com|sem|mobiliado|novo|seminovo|andar|quartos?|qts?|suites?|lazer|condominio|ou|e)\b|[,.!?;:\n]|$)/gi;
  let match;
  while ((match = explicitPrefixRx.exec(scanText)) !== null) {
    const candidate = `${match[0]}`.trim();
    if (!candidate.includes('qualquer')) {
      addSetor(candidate);
    }
  }

  return foundLabels;
}

/**
 * Converte números escritos por extenso ("uma", "duas", "três", "quatro") ou dígitos em inteiro
 */
function parseWordOrDigitNumber(token) {
  if (!token) return null;
  const map = {
    'um': 1, 'uma': 1,
    'dois': 2, 'duas': 2,
    'tres': 3,
    'quatro': 4,
    'cinco': 5,
    'seis': 6
  };
  if (map[token] !== undefined) return map[token];
  const n = parseInt(token, 10);
  return isNaN(n) ? null : n;
}

/**
 * Extrai critérios de Quartos e Suítes separadamente:
 * - Suporta "no mínimo 3 suítes", "a partir de 3 suítes", "3 suítes ou mais" -> suites_min = 3, suites_max = 10
 * - Suporta "2 suítes ou 3", "2 ou 3 suítes" -> suites_min = 2, suites_max = 3
 * - Suporta "3 quartos sendo 1 suíte" -> quartos = 3, suites_min = 1
 */
function extractQuartosAndSuites(normText) {
  let quartosMin = null;
  let quartosMax = null;
  let suitesMin = null;
  let suitesMax = null;

  // 1. SUÍTES: verifica primeiro se pediu "no mínimo X suítes" / "a partir de X suítes" / "X suítes ou mais" / "acima de X suítes"
  const minSuiteBefore = normText.match(/\b(?:no minimo|minimo|minimo de|pelo menos|a partir de|acima de)\s*(\d+|uma|duas|tres|quatro)\s*suites?\b/);
  const minSuiteAfter = normText.match(/\b(\d+|uma|duas|tres|quatro)\s*suites?\s*(?:ou mais|pra cima|para cima|no minimo)\b/);
  const suiteRangeAfter = normText.match(/\b(\d+|uma|duas|tres|quatro)\s*suites?\s*(?:ou|a|\/)\s*(\d+|uma|duas|tres|quatro)\b/);
  const suiteRangeBefore = normText.match(/\b(\d+|uma|duas|tres|quatro)\s*(?:ou|a|\/)\s*(\d+|uma|duas|tres|quatro)\s*suites?\b/);

  if (minSuiteBefore) {
    const n = parseWordOrDigitNumber(minSuiteBefore[1]);
    if (n) {
      suitesMin = n;
      suitesMax = 10;
    }
  } else if (minSuiteAfter) {
    const n = parseWordOrDigitNumber(minSuiteAfter[1]);
    if (n) {
      suitesMin = n;
      suitesMax = 10;
    }
  } else if (suiteRangeAfter) {
    const n1 = parseWordOrDigitNumber(suiteRangeAfter[1]);
    const n2 = parseWordOrDigitNumber(suiteRangeAfter[2]);
    if (n1 && n2) {
      suitesMin = Math.min(n1, n2);
      suitesMax = Math.max(n1, n2);
    }
  } else if (suiteRangeBefore) {
    const n1 = parseWordOrDigitNumber(suiteRangeBefore[1]);
    const n2 = parseWordOrDigitNumber(suiteRangeBefore[2]);
    if (n1 && n2) {
      suitesMin = Math.min(n1, n2);
      suitesMax = Math.max(n1, n2);
    }
  } else {
    // Ex: "3 suítes", "2 suítes", "sendo 1 suíte", "com 1 suíte"
    const singleSuite = normText.match(/\b(\d+|uma|duas|tres|quatro)\s*suites?\b/);
    if (singleSuite) {
      const n = parseWordOrDigitNumber(singleSuite[1]);
      if (n) {
        suitesMin = n;
        // Se a pessoa pediu "3 suítes" (sem dizer "sendo 1 suíte"), aceita 3 suítes ou mais; se disse "sendo 1 suíte", aceita 1 ou mais
        suitesMax = 10;
      }
    } else if (/\bcom\s+suite\b/.test(normText)) {
      suitesMin = 1;
      suitesMax = 10;
    }
  }

  // 2. QUARTOS / DORMITÓRIOS
  const minQuartoBefore = normText.match(/\b(?:no minimo|minimo|pelo menos|a partir de)\s*(\d+|um|dois|duas|tres|quatro)\s*(?:quartos?|qts?|q|dormitorios?|dorms?)\b/);
  const quartoRangeBefore = normText.match(/\b(\d+|um|dois|duas|tres|quatro)\s*(?:ou|a|\/)\s*(\d+|dois|duas|tres|quatro)\s*(?:quartos?|qts?|q|dormitorios?|dorms?)\b/);
  const quartoRangeAfter = normText.match(/\b(\d+|um|dois|duas|tres|quatro)\s*(?:quartos?|qts?|q|dormitorios?|dorms?)\s*(?:ou|a|\/)\s*(\d+|dois|duas|tres|quatro)\b/);

  if (minQuartoBefore) {
    const n = parseWordOrDigitNumber(minQuartoBefore[1]);
    if (n) {
      quartosMin = n;
      quartosMax = 10;
    }
  } else if (quartoRangeBefore) {
    const n1 = parseWordOrDigitNumber(quartoRangeBefore[1]);
    const n2 = parseWordOrDigitNumber(quartoRangeBefore[2]);
    if (n1 && n2) {
      quartosMin = Math.min(n1, n2);
      quartosMax = Math.max(n1, n2);
    }
  } else if (quartoRangeAfter) {
    const n1 = parseWordOrDigitNumber(quartoRangeAfter[1]);
    const n2 = parseWordOrDigitNumber(quartoRangeAfter[2]);
    if (n1 && n2) {
      quartosMin = Math.min(n1, n2);
      quartosMax = Math.max(n1, n2);
    }
  } else {
    const singleQuarto = normText.match(/\b(\d+|um|dois|duas|tres|quatro)\s*(?:quartos?|qts?|q|dormitorios?|dorms?)\b/);
    if (singleQuarto) {
      const n = parseWordOrDigitNumber(singleQuarto[1]);
      if (n) {
        quartosMin = n;
        quartosMax = n;
      }
    }
  }

  return {
    quartos: quartosMin && quartosMin === quartosMax ? quartosMin : (quartosMin || null),
    quartos_min: quartosMin,
    quartos_max: quartosMax,
    suites_min: suitesMin,
    suites_max: suitesMax
  };
}

/**
 * Descobre quantas suítes um imóvel da nossa carteira realmente tem (analisando a descrição e os quartos)
 */
function extractPropertySuitesCount(prop) {
  if (prop.suites !== undefined && prop.suites !== null && String(prop.suites).trim() !== '') {
    const n = parseInt(prop.suites, 10);
    if (!isNaN(n)) return n;
  }

  const descNorm = normalizeText(prop.descricao || '');
  if (!descNorm.includes('suite')) {
    return 0;
  }

  // Procura número explícito antes da palavra suite/suites (ex: "1 suite", "uma suite", "2 suites", "duas suites", "3 suites")
  const explicitMatch = descNorm.match(/\b(\d+|um|uma|dois|duas|tres|quatro|cinco)\s*suites?\b/);
  if (explicitMatch) {
    const parsed = parseWordOrDigitNumber(explicitMatch[1]);
    if (parsed !== null) return parsed;
  }

  // Se diz "todas suites", "todo suite", "suites plenas", "suites americanas", assume o número de quartos
  if (/\b(todas\s+suites|todo\s+suite|suites\s+plenas|suites\s+americanas)\b/.test(descNorm)) {
    return Number(prop.quartos) || 2;
  }

  // Se menciona apenas "suite" no singular (ex: "2 quartos com suite"), é 1 suíte
  if (/\bsuite\b/.test(descNorm) && !/\bsuites\b/.test(descNorm)) {
    return 1;
  }

  return Math.max(2, Number(prop.quartos) || 2);
}

/**
 * Extrai o critério de Área de Lazer da mensagem do cliente:
 * - Se disser "pode ser sem área de lazer", "com ou sem lazer", "tanto faz lazer" -> retorna 'INDIFERENTE' (aceita com ou sem!)
 * - Se disser "sem área de lazer", "sem lazer", "prédio sem lazer" -> retorna 'NAO'
 * - Se disser "área de lazer", "lazer completo", "com lazer", "condomínio clube" -> retorna 'SIM'
 * - Se não mencionar -> retorna null
 */
function extractLazerCriterion(normText) {
  if (/\b(pode ser sem (?:area de )?lazer|com ou sem (?:area de )?lazer|tanto faz (?:area de )?lazer|indiferente (?:area de )?lazer|com ou sem area de lazer|sem ou com (?:area de )?lazer)\b/.test(normText)) {
    return 'INDIFERENTE';
  }
  if (/\b(sem area de lazer|sem lazer|predio sem lazer|nao precisa (?:de )?(?:area de )?lazer)\b/.test(normText)) {
    return 'NAO';
  }
  if (/\b(area de lazer|lazer completo|com lazer|com area de lazer|condominio clube|lazer de clube|lazer)\b/.test(normText)) {
    return 'SIM';
  }
  return null;
}

/**
 * Analisa se o imóvel da carteira possui Área de Lazer ('SIM', 'NAO' ou 'NAO_INFORMADO')
 */
function extractPropertyLazerStatus(prop) {
  if (prop.lazer) {
    const lNorm = normalizeText(prop.lazer);
    if (['sim', 's', 'completo', 'true'].includes(lNorm)) return 'SIM';
    if (['nao', 'n', 'sem', 'false'].includes(lNorm)) return 'NAO';
  }
  const descNorm = normalizeText(prop.descricao || '');
  if (/\b(sem area de lazer|sem lazer|predio sem lazer)\b/.test(descNorm)) {
    return 'NAO';
  }
  if (/\b(area de lazer|lazer completo|com lazer|condominio clube|lazer|piscina|salao de festas|academia|brinquedoteca|playground|quadra|espaco gourmet|churrasqueira)\b/.test(descNorm)) {
    return 'SIM';
  }
  return 'NAO_INFORMADO';
}

/**
 * Extrai valor máximo de Condomínio pedido pelo cliente (ex: "condomínio até 800", "condomínio abaixo de 1.000", "condomínio até 5 mil")
 */
function extractCondominioCriterion(normText) {
  // Captura trechos como "condominio ate 800", "condominio abaixo de 1.200", "condominio de ate 5 mil", "condominio max 600", "cond ate R$ 700"
  const condMatch = normText.match(/\b(?:condominio|cond\.?)\s*(?:no maximo|maximo|max|abaixo de|menor que|ate|de ate|de no maximo|em torno de|de|valor|r\$|:)?\s*(?:ate|abaixo de|r\$)?\s*(\d{1,2}(?:\.\d{3})+(?:,\d{2})?|\d+(?:[.,]\d+)?)\s*(mil|k)?\b/);
  if (!condMatch) return null;

  let rawNum = condMatch[1];
  const isMil = Boolean(condMatch[2]);

  if (isMil) {
    const val = parseFloat(rawNum.replace(',', '.')) * 1000;
    return val > 0 ? val : null;
  }

  // Se tiver ponto de milhar (ex: "1.000" ou "1.200,00")
  if (/^\d{1,2}\.\d{3}(?:,\d{2})?$/.test(rawNum)) {
    rawNum = rawNum.replace(/\./g, '').replace(/,\d+$/, '');
  } else {
    rawNum = rawNum.replace(/,\d+$/, '').replace(',', '.');
  }

  const parsed = parseFloat(rawNum);
  if (!isNaN(parsed) && parsed > 0 && parsed <= 30000) {
    return parsed;
  }
  return null;
}

/**
 * Extrai o valor do Condomínio de um imóvel da carteira (olhando campo `condominio` ou a `descricao`)
 * Ex: "condominio R$500,00" -> retorna 500
 */
function extractPropertyCondominio(prop) {
  if (prop.condominio !== undefined && prop.condominio !== null && Number(prop.condominio) > 0) {
    return Number(prop.condominio);
  }
  const descNorm = normalizeText(prop.descricao || '');
  if (/\b(sem condominio|isento de condominio|condominio zero)\b/.test(descNorm)) {
    return 0;
  }
  const match = descNorm.match(/\b(?:condominio|cond\.?)\s*(?:de|valor|em media|aprox\.?|r\$|:|-)?\s*(?:r\$\s*)?(\d{1,2}(?:\.\d{3})+(?:,\d{2})?|\d+(?:[.,]\d+)?)\s*(mil|k)?\b/);
  if (!match) return null;

  let rawNum = match[1];
  const isMil = Boolean(match[2]);
  if (isMil) {
    return parseFloat(rawNum.replace(',', '.')) * 1000;
  }
  if (/^\d{1,2}\.\d{3}(?:,\d{2})?$/.test(rawNum)) {
    rawNum = rawNum.replace(/\./g, '').replace(/,\d+$/, '');
  } else {
    rawNum = rawNum.replace(/,\d+$/, '').replace(',', '.');
  }
  const parsed = parseFloat(rawNum);
  return !isNaN(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Extrai exigência de Idade do Prédio / Imóvel Novo:
 * REGRA DO CORRETOR:
 * - Se a pessoa pedir "prédio novo" / "apartamento novo" / "novo" (sem dizer "novo ou seminovo"), o prédio pode ter NO MÁXIMO 5 ANOS!
 * - Se pedir "até X anos" / "menos de X anos", usa X anos como limite máximo.
 */
function extractIdadeImovelCriterion(normText) {
  // 1. Verifica se pediu limite explícito de anos (ex: "até 5 anos", "no máximo 3 anos", "menos de 5 anos")
  const explicitYears = normText.match(/\b(?:ate|no maximo|maximo|menos de|abaixo de)\s*(\d+)\s*anos?\b/);
  if (explicitYears) {
    const y = parseInt(explicitYears[1], 10);
    if (!isNaN(y) && y > 0) {
      return { apenas_novo: y <= 5, novo_ou_seminovo: false, idade_max_anos: y };
    }
  }

  // 2. Verifica se pediu "novo ou seminovo" / "seminovo"
  if (/\b(novo ou seminovo|seminovo ou novo|semi novo|seminovo|semi-novo)\b/.test(normText)) {
    return { apenas_novo: false, novo_ou_seminovo: true, idade_max_anos: null };
  }

  // 3. Verifica se pediu "prédio novo", "apartamento novo", "imóvel novo", "recém entregue", "nunca habitado" ou a palavra "novo"
  // Cuidado para não confundir o bairro "Mundo Novo" ou "Novo Mundo" ou "Novo Horizonte" com imóvel novo!
  const textWithoutBairrosNovos = normText
    .replace(/\b(jardim\s+novo\s+mundo|novo\s+mundo|novo\s+horizonte|vila\s+nova|nova\s+suica|ano\s+novo|de\s+novo)\b/g, ' ');

  if (/\b(predio novo|apartamento novo|ap novo|apto novo|imovel novo|casa nova|recem entregue|nunca habitado|zero km|novo)\b/.test(textWithoutBairrosNovos)) {
    return { apenas_novo: true, novo_ou_seminovo: false, idade_max_anos: 5 };
  }

  return { apenas_novo: false, novo_ou_seminovo: false, idade_max_anos: null };
}

/**
 * Analisa a idade em anos e o estado ("novo", "seminovo", "antigo") de um imóvel cadastrado na carteira
 */
function extractPropertyAgeInfo(prop) {
  if (prop.idade_anos !== undefined && prop.idade_anos !== null && String(prop.idade_anos).trim() !== '') {
    const parsedAge = parseInt(prop.idade_anos, 10);
    if (!isNaN(parsedAge)) {
      return { ageYears: parsedAge, isExplicitlyNew: parsedAge <= 5, isSeminovo: parsedAge > 5 && parsedAge <= 12 };
    }
  }

  const descNorm = normalizeText(prop.descricao || '').replace(
    /\b(jardim\s+novo\s+mundo|novo\s+mundo|novo\s+horizonte|vila\s+nova|nova\s+suica)\b/g,
    ' '
  );

  // 1. Procura menção explícita a "X anos" na descrição (ex: "6 anos", "prédio com 4 anos", "3 anos de construído")
  const yearsMatch = descNorm.match(/\b(\d+)\s*anos?(?:\s+de\s+construcao|\s+de\s+construido|\s+de\s+entrega|\s+de\s+uso|\s+de\s+idade)?\b/);
  let ageYears = null;
  if (yearsMatch) {
    const n = parseInt(yearsMatch[1], 10);
    if (!isNaN(n) && n >= 0 && n <= 80) {
      ageYears = n;
    }
  }

  // 2. Procura ano de entrega/construção (ex: "entregue em 2018", "construído em 2023")
  if (ageYears === null) {
    const yearBuiltMatch = descNorm.match(/\b(?:entregue em|construido em|construcao de|ano)\s*(19\d{2}|20\d{2})\b/);
    if (yearBuiltMatch) {
      const builtYear = parseInt(yearBuiltMatch[1], 10);
      const currentYear = 2026;
      if (builtYear <= currentYear) {
        ageYears = currentYear - builtYear;
      }
    }
  }

  const isSeminovo = /\b(seminovo|semi-novo|semi novo)\b/.test(descNorm);
  const isExplicitlyNew =
    !isSeminovo &&
    /\b(predio novo|apartamento novo|imovel novo|casa nova|recem entregue|nunca habitado|lancamento|novo)\b/.test(descNorm);

  return {
    ageYears,
    isExplicitlyNew: ageYears !== null ? ageYears <= 5 : isExplicitlyNew,
    isSeminovo
  };
}

/**
 * Extrai Metragem Mínima e/ou Máxima sem tolerância para erro:
 * - "acima de 360m²", "a partir de 360m²", "no mínimo 360m²", "lote 360m²" -> minM2 = 360 (não envia menor que 360!)
 * - "até 100m²", "abaixo de 100m²" -> maxM2 = 100 (não envia maior que 100!)
 */
function extractMetragemCriterion(normText) {
  let minM2 = null;
  let maxM2 = null;

  const maxMatch = normText.match(/\b(?:ate|abaixo de|menor que|no maximo|maximo)\s*(\d+(?:[.,]\d+)?)\s*(?:metros?\s*quadrados?|metros?|m2|m²|m)\b/);
  const minMatch = normText.match(/\b(?:acima de|a partir de|no minimo|minimo|minimo de|maior que|mais de|pelo menos)?\s*(\d+(?:[.,]\d+)?)\s*(?:metros?\s*quadrados?|metros?|m2|m²)\b/);

  if (maxMatch) {
    maxM2 = parseFloat(maxMatch[1].replace(',', '.'));
  }
  if (minMatch) {
    const val = parseFloat(minMatch[1].replace(',', '.'));
    // Só define minM2 se não for o mesmo número capturado como "até X m²"
    if (!maxMatch || val !== maxM2 || /\b(acima de|a partir de|no minimo|minimo|maior que|mais de)\b/.test(minMatch[0])) {
      minM2 = val;
    }
  }

  return { minM2, maxM2 };
}

/**
 * Extrai se a pessoa pediu "Casa de Rua" vs "Casa em Condomínio Fechado"
 */
function extractSubtipoCasa(normText) {
  if (/\b(casa de rua|sobrado de rua|fora de condominio|sem condominio)\b/.test(normText)) {
    return 'CASA_DE_RUA';
  }
  if (/\b(condominio fechado|casa em condominio|sobrado em condominio|condominio horizontal)\b/.test(normText)) {
    return 'CONDOMINIO_FECHADO';
  }
  return null;
}

/**
 * Extrai Mobília / Armários com separação rigorosa:
 * - 'MOBILIADO' (mobiliado, porteira fechada, 100% mobiliado) -> NÃO aceita apenas com armários e NÃO aceita sem armários!
 * - 'COM_ARMARIOS' (com armários, completo em armários, rico em armários, semimobiliado) -> NÃO aceita sem armários!
 * - 'SEM_ARMARIOS' (sem armários, sem mobília, vazio) -> Só aceita sem mobília!
 * - null (não especificou) -> Aceita qualquer um!
 */
function extractMobiliaArmariosCriterion(normText) {
  if (/\b(sem armarios|sem mobilia|nao mobiliado|vazio|pelado)\b/.test(normText)) {
    return 'SEM_ARMARIOS';
  }
  if (/\b(com armarios|rico em armarios|completo em armarios|armarios planejados|repleto de armarios|armarios|semimobiliado|semi mobiliado|semi-mobiliado)\b/.test(normText)) {
    return 'COM_ARMARIOS';
  }
  if (/\b(mobiliado|mobiliada|porteira fechada|todo mobiliado|100% mobiliado|decorado e mobiliado)\b/.test(normText)) {
    return 'MOBILIADO';
  }
  return null;
}

/**
 * Verifica se o imóvel atende rigorosamente ao critério de Mobília / Armários
 */
function propertyMatchesMobiliaStrict(prop, targetMobilia) {
  if (!targetMobilia) return { pass: true };

  const propMob = (prop.mobiliado || 'NAO').toUpperCase();
  const descNorm = normalizeText(prop.descricao || '');

  const isFullyFurnished =
    propMob === 'SIM' ||
    /\b(mobiliado|mobiliada|porteira fechada|decorado e mobiliado|todo mobiliado|100% mobiliado)\b/.test(descNorm);

  const hasCabinets =
    isFullyFurnished ||
    propMob === 'SEMI' ||
    /\b(semimobiliado|semi mobiliado|semi-mobiliado|armarios|rico em armarios|completo em armarios)\b/.test(descNorm);

  if (targetMobilia === 'MOBILIADO' || targetMobilia === 'SIM') {
    if (!isFullyFurnished) {
      return { pass: false, reason: 'Cliente pediu imóvel MOBILIADO, mas este imóvel não é mobiliado completo.' };
    }
    return { pass: true };
  }

  if (targetMobilia === 'COM_ARMARIOS' || targetMobilia === 'SEMI') {
    if (!hasCabinets) {
      return { pass: false, reason: 'Cliente pediu COM ARMÁRIOS, mas este imóvel está sem armários.' };
    }
    return { pass: true };
  }

  if (targetMobilia === 'SEM_ARMARIOS' || targetMobilia === 'NAO') {
    if (hasCabinets) {
      return { pass: false, reason: 'Cliente pediu SEM ARMÁRIOS / VAZIO, mas este imóvel possui armários/mobília.' };
    }
    return { pass: true };
  }

  return { pass: true };
}

/**
 * Verifica se um imóvel pertence exatamente ao(s) setor(es) pedido(s) pelo cliente,
 * usando borda de palavra (\b) para que "Setor Sudoeste" NUNCA dê match com "Setor Oeste"!
 */
function propertyMatchesSetores(prop, requestedSetores) {
  if (!Array.isArray(requestedSetores) || requestedSetores.length === 0) return true;

  const propSetorFull = normalizeText(prop.setor);
  const propSetorCore = stripSetorPrefix(prop.setor);

  return requestedSetores.some(reqSetor => {
    const reqFull = normalizeText(reqSetor);
    const reqCore = stripSetorPrefix(reqSetor);
    if (!reqCore) return false;

    return (
      propSetorCore === reqCore ||
      hasExactWordOrPhrase(propSetorFull, reqFull) ||
      hasExactWordOrPhrase(propSetorCore, reqCore)
    );
  });
}

/**
 * Verifica se um imóvel pertence à região pedida pelo cliente (olhando a coluna regiao ou o mapa de setores)
 */
function propertyMatchesRegiao(prop, targetRegiao) {
  const targetNorm = normalizeText(targetRegiao);
  const propRegNorm = normalizeText(prop.regiao);
  if (propRegNorm && hasExactWordOrPhrase(propRegNorm, targetNorm)) {
    return true;
  }

  const propSetorNorm = normalizeText(prop.setor);
  const mapSetores = SETOR_TO_REGIAO_MAP[targetNorm] || [];
  return mapSetores.some(st => hasExactWordOrPhrase(propSetorNorm, st));
}

/**
 * MOTOR DE EXCLUSÃO 100% RIGOROSO + DETECÇÃO DE DÚVIDA:
 * Regra: Tudo o que estiver na busca do cliente deve ser 100% atendido!
 * - Se ao menos 1 parâmetro pedido pelo cliente falhar -> o imóvel é EXCLUÍDO (não envia).
 * - Se o imóvel bater nos itens principais (Tipo, Localização, Preço, Quartos/Suítes), mas o cliente exigiu
 *   um parâmetro (ex: Prédio Novo <= 5 anos, Condomínio <= X, Área de Lazer, Andar Baixo) que NÃO está informado
 *   no cadastro desse imóvel, registra como DÚVIDA (`doubtItems`) e NÃO envia para o cliente, avisando o corretor!
 */
function evaluateInventoryByExclusion(inventory, criteria) {
  let targetSetores = Array.isArray(criteria.setores) ? [...criteria.setores] : [];
  if (targetSetores.length === 0 && criteria.setor) {
    targetSetores = String(criteria.setor)
      .split(/\s*(?:,|\/|\bou\b|\be\b)\s*/i)
      .map(s => s.trim())
      .filter(Boolean);
  }

  const matchedProperties = [];
  const nearMissDoubts = [];

  for (const prop of inventory) {
    let hardExcluded = false;
    const missingOrDoubtfulChecks = [];

    // 1. Filtro de Tipo (Obrigatório se especificado)
    if (criteria.tipo) {
      const propTipo = normalizeText(prop.tipo);
      const critTipo = normalizeText(criteria.tipo);
      if (propTipo && !propTipo.includes(critTipo) && !critTipo.includes(propTipo)) {
        hardExcluded = true;
      }
    }
    if (hardExcluded) continue;

    // 1b. Subtipo Casa de Rua vs Condomínio Fechado
    if (criteria.subtipo_casa) {
      const descNorm = normalizeText(`${prop.tipo} ${prop.descricao}`);
      const isPropCondFechado = /\b(condominio fechado|condominio horizontal|casa em condominio|sobrado em condominio|alphaville|portal do sol|jardins|aldeia do vale)\b/.test(descNorm);
      if (criteria.subtipo_casa === 'CASA_DE_RUA' && isPropCondFechado) {
        continue; // Pediu casa de rua, não envia condomínio fechado
      }
      if (criteria.subtipo_casa === 'CONDOMINIO_FECHADO' && !isPropCondFechado) {
        continue; // Pediu condomínio fechado, não envia casa de rua
      }
    }

    // 2. Filtro de Setor / Bairros (Exclusão Rígida com borda de palavra \b)
    if (targetSetores.length > 0) {
      if (!propertyMatchesSetores(prop, targetSetores)) {
        continue;
      }
    }

    // 3. Filtro de Região (Ex: "Região Sul", "na região sul próximo a bairros" -> não envia fora da região!)
    if (criteria.regiao) {
      if (!propertyMatchesRegiao(prop, criteria.regiao)) {
        continue;
      }
    }

    // 4. Filtro de Valor Máximo do Imóvel (Exclusão Rígida: R$ 499 mil passa em até 500 mil; R$ 501 mil é excluído!)
    if (criteria.valor_maximo && criteria.valor_maximo > 0) {
      if (prop.valor > criteria.valor_maximo) {
        continue;
      }
    }

    // 5. Filtro de Quantidade de Quartos (Exclusão Rígida)
    if (criteria.quartos_min && criteria.quartos_min > 0) {
      const maxQ = criteria.quartos_max || criteria.quartos_min;
      if (prop.quartos < criteria.quartos_min || prop.quartos > maxQ) {
        continue;
      }
    } else if (criteria.quartos && criteria.quartos > 0 && !criteria.suites_min) {
      if (prop.quartos !== criteria.quartos) {
        continue;
      }
    }

    // 6. Filtro de Quantidade de Suítes (Ex: "no mínimo 3 suítes" -> envia apenas com 3 suítes ou mais!)
    if (criteria.suites_min && criteria.suites_min > 0) {
      const propSuites = extractPropertySuitesCount(prop);
      const maxSuites = criteria.suites_max || 10;
      if (propSuites < criteria.suites_min || propSuites > maxSuites) {
        continue;
      }
      if (prop.quartos < criteria.suites_min) {
        continue;
      }
    }

    // 7. Filtro de Metragem Mínima e Máxima (Ex: "lote acima de 360m²" -> NUNCA envia abaixo de 360m²!)
    const minM2 = criteria.tamanho_min_m2 || criteria.tamanho_m2;
    if (minM2 && minM2 > 0) {
      if (!prop.tamanho_m2 || prop.tamanho_m2 < minM2) {
        continue;
      }
    }
    if (criteria.tamanho_max_m2 && criteria.tamanho_max_m2 > 0) {
      if (!prop.tamanho_m2 || prop.tamanho_m2 > criteria.tamanho_max_m2) {
        continue;
      }
    }

    // 8. Filtro de Mobília / Com Armários vs Sem Armários
    if (criteria.mobiliado) {
      const mobCheck = propertyMatchesMobiliaStrict(prop, criteria.mobiliado);
      if (!mobCheck.pass) {
        continue;
      }
    }

    // 9. Filtro de Área de Lazer ("com área de lazer" vs "pode ser sem área de lazer" vs "sem lazer")
    if (criteria.lazer && criteria.lazer !== 'INDIFERENTE') {
      const propLazer = extractPropertyLazerStatus(prop);
      if (criteria.lazer === 'SIM') {
        if (propLazer === 'NAO') {
          continue; // Excluído: cliente pediu lazer e o imóvel não tem lazer
        }
        if (propLazer === 'NAO_INFORMADO') {
          missingOrDoubtfulChecks.push('Cliente exigiu ÁREA DE LAZER, mas a descrição do imóvel não confirma se possui lazer');
        }
      } else if (criteria.lazer === 'NAO') {
        if (propLazer === 'SIM') {
          continue; // Cliente pediu prédio sem lazer
        }
      }
    }

    // 10. Filtro de Valor de Condomínio (Ignorado automaticamente se o cliente pediu "Casa de Rua"!)
    if (criteria.condominio_max && criteria.condominio_max > 0 && criteria.subtipo_casa !== 'CASA_DE_RUA') {
      const propCond = extractPropertyCondominio(prop);
      if (propCond !== null) {
        if (propCond > criteria.condominio_max) {
          continue; // Excluído: condomínio do imóvel é maior do que o limite pedido pelo cliente!
        }
      } else {
        missingOrDoubtfulChecks.push(
          `Cliente exigiu CONDOMÍNIO ATÉ R$ ${Number(criteria.condominio_max).toLocaleString('pt-BR')}, mas o valor do condomínio não consta na descrição deste imóvel`
        );
      }
    }

    // 11. Filtro de Prédio Novo / Idade Máxima (Se pediu "novo", máximo de 5 anos! Se tiver 6 anos, é EXCLUÍDO!)
    if (criteria.apenas_novo || (criteria.idade_max_anos && criteria.idade_max_anos > 0)) {
      const maxAllowedYears = criteria.idade_max_anos || 5;
      const ageInfo = extractPropertyAgeInfo(prop);

      if (ageInfo.ageYears !== null) {
        if (ageInfo.ageYears > maxAllowedYears) {
          continue; // Excluído! Ex: pediu Novo (máx 5 anos) e o imóvel tem 6 anos!
        }
      } else if (ageInfo.isSeminovo && criteria.apenas_novo) {
        continue; // Excluído! Pediu prédio NOVO (até 5 anos) e o imóvel é apenas seminovo sem confirmar <= 5 anos
      } else if (!ageInfo.isExplicitlyNew) {
        missingOrDoubtfulChecks.push(
          `Cliente exigiu IMÓVEL NOVO (máximo ${maxAllowedYears} anos), mas a idade do prédio não está informada na descrição deste imóvel`
        );
      }
    }

    // 12. Filtro de Características Extras (Andar Baixo, Andar Alto, Nascente, Piscina, Varanda Gourmet, etc.)
    if (Array.isArray(criteria.caracteristicas) && criteria.caracteristicas.length > 0) {
      const fullPropText = normalizeText(`${prop.tipo} ${prop.setor} ${prop.regiao} ${prop.descricao}`);
      let failedFeature = false;

      for (const feat of criteria.caracteristicas) {
        const featNorm = normalizeText(feat);
        if (featNorm === 'andar baixo') {
          if (/\bandar alto\b/.test(fullPropText)) {
            failedFeature = true;
            break;
          }
          if (!/\b(andar baixo|terreo|1o andar|2o andar|3o andar|primeiro andar|segundo andar)\b/.test(fullPropText)) {
            missingOrDoubtfulChecks.push('Cliente exigiu ANDAR BAIXO, mas a descrição deste imóvel não confirma o andar');
          }
        } else if (featNorm === 'andar alto') {
          if (/\b(andar baixo|terreo)\b/.test(fullPropText)) {
            failedFeature = true;
            break;
          }
          if (!/\bandar alto\b/.test(fullPropText)) {
            missingOrDoubtfulChecks.push('Cliente exigiu ANDAR ALTO, mas a descrição deste imóvel não confirma o andar');
          }
        } else if (!fullPropText.includes(featNorm)) {
          failedFeature = true;
          break;
        }
      }

      if (failedFeature) continue;
    }

    // REGRA DE SEGURANÇA CONTRA DÚVIDAS:
    // Se faltou confirmar algum item exigido pelo cliente, NÃO envia para o cliente e separa como Dúvida para alertar o corretor!
    if (missingOrDoubtfulChecks.length > 0) {
      nearMissDoubts.push({
        property: prop,
        reasons: missingOrDoubtfulChecks
      });
    } else {
      matchedProperties.push(prop);
    }
  }

  return {
    matchedProperties,
    nearMissDoubts
  };
}

/**
 * Mantém compatibilidade direta retornando apenas os imóveis que passaram 100% sem nenhuma dúvida
 */
function filterInventory(inventory, criteria) {
  return evaluateInventoryByExclusion(inventory, criteria).matchedProperties;
}

/**
 * Verifica se a própria mensagem de busca do grupo gera DÚVIDA de interpretação
 * (ex: pediu localização que não foi reconhecida, pediu permuta complexa, ou gerou dúvida em imóvel quase compatível)
 */
function detectSearchDoubts(rawText, normText, criteria, nearMissDoubts) {
  const reasons = [];

  // 1. Se houve imóvel na carteira que bateu Setor, Tipo, Quartos, Suítes e Preço, mas ficou retido por dúvida em detalhe não preenchido
  for (const nm of nearMissDoubts) {
    reasons.push(
      `Imóvel #${nm.property.id} (${nm.property.tipo} - ${nm.property.setor}) bateu nos filtros principais, mas NÃO foi enviado por precaução: ${nm.reasons.join('; ')}.`
    );
  }

  // 2. Se a pessoa escreveu "setor X" ou "bairro X" ou "região X", mas nenhum setor/região conhecido foi identificado
  const mentionedLocationWord = /\b(setor|bairro|regiao|proximo|perto|condominio|residencial|edificio)\b/.test(normText);
  const qualquerSetor = /\b(qualquer setor|qualquer bairro|qualquer regiao|qualquer lugar|tanto faz o setor)\b/.test(normText);
  if (
    mentionedLocationWord &&
    !qualquerSetor &&
    (!criteria.setores || criteria.setores.length === 0) &&
    !criteria.regiao
  ) {
    reasons.push(
      'A mensagem menciona uma localização/condomínio específico que não foi reconhecido com 100% de certeza na lista de setores.'
    );
  }

  // 3. Se a pessoa pediu condições complexas (ex: permuta, troca, ágio, parcelamento direto) que exigem avaliação humana do corretor
  if (/\b(permuta|troca por|aceita troca|agio|repasse de agio|parcelamento direto)\b/.test(normText)) {
    reasons.push(
      'O cliente mencionou condição especial (permuta / troca / ágio / parcelamento direto) que requer avaliação direta do corretor.'
    );
  }

  return {
    hasDoubt: reasons.length > 0,
    doubtReasons: reasons
  };
}

/**
 * 1ª Camada (Motor de Regras Inteligentes por Exclusão 100% + Detecção de Dúvidas):
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

  const hasPropertyNoun = /\b(ap|apto|apartamento|casa|sobrado|imovel|kitnet|studio|flat|lote|terreno|cobertura|sala)\b/.test(norm);
  const hasPriceLimitOrQuestion = /\b(ate|max|maximo|no maximo)\b/.test(norm) || text.includes('?');
  const isImplicitSearch = !hasExplicitOffer && hasPropertyNoun && hasPriceLimitOrQuestion;

  if ((!hasExplicitSearch && !isImplicitSearch) || (hasExplicitOffer && !hasExplicitSearch)) {
    return { isLookingForProperty: false, reason: 'Mensagem não possui intenção de busca/compra de imóvel.' };
  }

  // 3. Extrair Tipo de Imóvel e Subtipo (Casa de Rua vs Condomínio Fechado)
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
  const subtipoCasa = extractSubtipoCasa(norm);

  // 4. Extrair Mobília / Armários (MOBILIADO vs COM_ARMARIOS vs SEM_ARMARIOS)
  const mobiliado = extractMobiliaArmariosCriterion(norm);

  // 5. Extrair Quantidade de Quartos e de Suítes separadamente (incluindo "no mínimo 3 suítes", "2 suítes ou 3")
  const qs = extractQuartosAndSuites(norm);

  // 6. Extrair Metragem Mínima e Máxima (sem tolerância abaixo do mínimo pedido!)
  const { minM2, maxM2 } = extractMetragemCriterion(norm);

  // 7. Extrair Área de Lazer ('SIM', 'NAO', 'INDIFERENTE' ou null)
  const lazer = extractLazerCriterion(norm);

  // 8. Extrair Valor de Condomínio ("condomínio até 800", "abaixo de 1.000", "até 5 mil")
  // IMPORTANTE: Antes de extrair o valor do imóvel, removemos o trecho de condomínio para não confundir "condomínio até 5 mil" com valor do imóvel!
  const condominioMax = extractCondominioCriterion(norm);
  const normWithoutCondominio = norm.replace(
    /\b(?:condominio|cond\.?)\s*(?:no maximo|maximo|max|abaixo de|menor que|ate|de ate|de no maximo|em torno de|de|valor|r\$|:)?\s*(?:ate|abaixo de|r\$)?\s*(?:\d{1,2}(?:\.\d{3})+(?:,\d{2})?|\d+(?:[.,]\d+)?)\s*(?:mil|k)?\b/g,
    ' '
  );

  // 9. Extrair Valor Máximo do Imóvel ("500mil", "500k", "R$500.000,00", "750.000", "1.2 milhão")
  let maxValor = null;
  const milhaoMatch = normWithoutCondominio.match(/(\d+(?:[.,]\d+)?)\s*(?:milhao|milhoes|mi)\b/);
  const milMatch = normWithoutCondominio.match(/(?:ate|de|por|maximo|max|valor|r\$)?\s*(\d+(?:[.,]\d+)?)\s*(?:mil|k)\b/);
  const fullNumberMatch = normWithoutCondominio.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d{5,9}(?:,\d{2})?)\b/);

  if (milhaoMatch) {
    maxValor = parseFloat(milhaoMatch[1].replace(',', '.')) * 1000000;
  } else if (milMatch) {
    const candidateMil = parseFloat(milMatch[1].replace(',', '.')) * 1000;
    if (candidateMil >= 30000) {
      maxValor = candidateMil;
    }
  } else if (fullNumberMatch) {
    const cleanNum = fullNumberMatch[1].replace(/\./g, '').replace(/,\d+$/, '');
    const parsed = parseFloat(cleanNum);
    if (parsed >= 30000) {
      maxValor = parsed;
    }
  }

  // 10. Extrair Prédio Novo / Idade Máxima (se pedir "novo", máximo 5 anos!)
  const idadeCriterion = extractIdadeImovelCriterion(norm);

  // 11. Extrair Região (ex: "região sul", "zona sul", "na região sul próximo a bairros") ou "qualquer setor"
  let regiaoDetectada = null;
  const qualquerSetor = /\b(qualquer setor|qualquer bairro|qualquer regiao|qualquer lugar|tanto faz o setor)\b/.test(norm);

  const regiaoMatch = norm.match(/\b(?:regiao|zona)\s+(sul|sudoeste|oeste|norte|leste|central|centro)\b/);
  if (regiaoMatch) {
    const r = regiaoMatch[1] === 'centro' ? 'central' : regiaoMatch[1];
    regiaoDetectada = 'Região ' + r.charAt(0).toUpperCase() + r.slice(1);
  }

  // 12. Extrair TODOS os Setores / Bairros pedidos
  let setoresDetectados = [];
  if (!qualquerSetor) {
    setoresDetectados = extractRequestedSetores(norm, inventory);
  }

  // 13. Extrair Características Extras
  const featureVocabulary = [
    { key: 'piscina', rx: /\bpiscina\b/ },
    { key: 'varanda gourmet', rx: /\b(varanda gourmet|sacada gourmet)\b/ },
    { key: 'churrasqueira', rx: /\bchurrasqueira\b/ },
    { key: 'nascente', rx: /\bnascente\b/ },
    { key: 'andar alto', rx: /\bandar alto\b/ },
    { key: 'andar baixo', rx: /\bandar baixo\b/ },
    { key: 'terrea', rx: /\b(terrea|terreo)\b/ },
    { key: 'elevador privativo', rx: /\belevador privativo\b/ }
  ];
  const caracteristicasExtras = featureVocabulary
    .filter(f => f.rx.test(norm))
    .map(f => f.key);

  const criteria = {
    tipo,
    subtipo_casa: subtipoCasa,
    setor: qualquerSetor || setoresDetectados.length === 0 ? null : setoresDetectados.join(', '),
    setores: qualquerSetor ? [] : setoresDetectados,
    regiao: regiaoDetectada,
    mobiliado,
    lazer,
    condominio_max: subtipoCasa === 'CASA_DE_RUA' ? null : condominioMax,
    apenas_novo: idadeCriterion.apenas_novo,
    novo_ou_seminovo: idadeCriterion.novo_ou_seminovo,
    idade_max_anos: idadeCriterion.idade_max_anos,
    quartos: qs.quartos,
    quartos_min: qs.quartos_min,
    quartos_max: qs.quartos_max,
    suites_min: qs.suites_min,
    suites_max: qs.suites_max,
    tamanho_m2: minM2,
    tamanho_min_m2: minM2,
    tamanho_max_m2: maxM2,
    valor_maximo: maxValor,
    caracteristicas: caracteristicasExtras
  };

  const { matchedProperties, nearMissDoubts } = evaluateInventoryByExclusion(inventory, criteria);
  const doubtAnalysis = detectSearchDoubts(text, norm, criteria, nearMissDoubts);

  // REGRA DE SEGURANÇA MÁXIMA:
  // Se houver dúvida na interpretação da busca (ex: pediu condição de permuta/ágio ou localização desconhecida),
  // bloqueia o envio automático para não incomodar a pessoa e reporta a dúvida para o corretor!
  const hasBlockingSearchDoubt =
    doubtAnalysis.hasDoubt &&
    nearMissDoubts.length === 0 &&
    matchedProperties.length > 0;

  const finalMatches = hasBlockingSearchDoubt ? [] : matchedProperties;

  const settings = loadSettings();
  const humanParts = buildHumanContextualParts(text, 'Cliente', settings.humanTraining);

  return {
    isLookingForProperty: true,
    criteria,
    matches: finalMatches,
    hasDoubt: doubtAnalysis.hasDoubt,
    doubtReasons: doubtAnalysis.doubtReasons,
    nearMissDoubts,
    detectedTone: humanParts.detectedTone,
    customOpening: humanParts.opening,
    customClosing: humanParts.closing,
    usedEngine: 'Motor Rígido por Exclusão (100% Critérios) + Alerta de Dúvida'
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

  if (humanTraining && humanTraining.trim()) {
    const lines = humanTraining.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
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

  const isUrgent = /\b(urgente|urgencia|pra hoje|para hoje|hoje ainda|visita hoje|agora|rapido|imediato|cliente na cidade|fechar hoje|preciso logo|com pressa)\b/.test(norm);
  if (isUrgent) {
    return {
      detectedTone: '⚡ URGÊNCIA (Visita disponível a qualquer horário)',
      opening: `${saudacao} ${firstName}, tudo bem? Vi lá no grupo que você precisa com urgência! Tenho essa daqui disponível na carteira e podemos ir visitar a qualquer horário, é só me avisar:`,
      closing: `Segue(m) a(s) foto(s) do imóvel! Como você precisa rápido, consigo me organizar para irmos lá a qualquer horário, é só me falar aqui.`
    };
  }

  const isPartnerBroker = /\b(tenho cliente|cliente procura|cliente buscando|cliente quer|cliente precisa|parceria|fifty|50\/50|corretor)\b/.test(norm);
  if (isPartnerBroker) {
    return {
      detectedTone: '🤝 PARCERIA / CORRETOR COM CLIENTE',
      opening: `${saudacao} ${firstName}, tudo bem? Vi sua mensagem no grupo falando do seu cliente! Tenho essa opção aqui na nossa carteira que encaixa certinho no perfil que ele busca:`,
      closing: `Segue(m) a(s) foto(s)! Fazemos parceria sim — se quiser apresentar para o seu cliente, podemos ir visitar a qualquer horário, é só me avisar!`
    };
  }

  const isCashOrInvestor = /\b(a vista|dinheiro na mao|investidor|investimento|permuta)\b/.test(norm);
  if (isCashOrInvestor) {
    return {
      detectedTone: '💎 COMPRADOR À VISTA / INVESTIDOR',
      opening: `${saudacao} ${firstName}, tudo bem? Vi sua busca agora no grupo! Tenho essa daqui na carteira que é uma excelente oportunidade de negócio nesse perfil:`,
      closing: `Segue(m) a(s) foto(s)! Se quiser ir lá conhecer pessoalmente, podemos ir a qualquer horário, é só me avisar por aqui.`
    };
  }

  return {
    detectedTone: `💬 CONVERSA HUMANA NATURAL (${saudacao})`,
    opening: `${saudacao} ${firstName}, tudo bem? Vi sua mensagem agora lá no grupo e tenho essa daqui na nossa carteira que encaixa muito bem no que você procura:`,
    closing: `Segue(m) a(s) foto(s) do imóvel! Se gostar e quiser conhecer pessoalmente, podemos ir a qualquer horário, é só me avisar.`
  };
}

/**
 * Analisa a mensagem com IA (Google Gemini) + Motor Rígido por Exclusão Local
 */
async function analyzeMessageAndMatch(messageText, senderName, inventory) {
  if (!messageText || messageText.trim().length < 4) {
    return { isLookingForProperty: false, reason: 'Mensagem muito curta' };
  }

  const localResult = parseWithSmartRules(messageText, inventory);
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
        suites_detectadas: extractPropertySuitesCount(p),
        lazer_detectado: extractPropertyLazerStatus(p),
        condominio_detectado: extractPropertyCondominio(p),
        idade_info: extractPropertyAgeInfo(p),
        tamanho_m2: p.tamanho_m2,
        valor: p.valor,
        descricao: p.descricao
      }));

      const prompt = `
Você é uma secretária humana especialista do mercado imobiliário analisando mensagens em um grupo de WhatsApp.
Horário atual para saudação: "${saudacao}".
Nome de quem enviou no grupo: "${senderName || 'Cliente'}".

REGRA DE OURO DA NOSSA IMOBILIÁRIA (TRABALHAMOS 100% POR EXCLUSÃO):
- Tudo o que estiver pedido na busca do cliente deve ser 100% atendido!
- Se ao menos 1 único parâmetro pedido não for atendido pelo imóvel (ex: pediu prédio novo [máximo 5 anos] e o imóvel tem 6 anos; pediu com armários e não tem; pediu mobiliado e não é mobiliado; pediu condomínio até X e é acima; pediu lote acima de 360m² e é menor; pediu no mínimo 3 suítes e tem menos; pediu área de lazer e não tem), NÃO ENVIE NADA (matchedIds vazio)!
- Se ficar com qualquer DÚVIDA na interpretação da busca ou se faltar confirmar algum dado exigido pelo cliente, marque "hasDoubt": true e explique em "doubtReason", deixando matchedIds vazio!

MENSAGEM ENVIADA POR "${senderName || 'Participante'}":
"""
${messageText}
"""

NOSSA CARTEIRA DE IMÓVEIS DISPONÍVEIS:
${JSON.stringify(portfolioSummary, null, 2)}

Responda APENAS com um JSON válido seguindo exatamente este formato:
{
  "isLookingForProperty": true ou false,
  "hasDoubt": true ou false,
  "doubtReason": "Explique a dúvida caso tenha ficado em dúvida, ou string vazia",
  "reason": "Breve explicação do que você entendeu da mensagem",
  "detectedTone": "Ex: Urgência / Parceria / Conversa Natural",
  "customOpening": "Frase de abertura humana e natural adaptada ao pedido",
  "customClosing": "Frase de fechamento humana e natural adaptada ao pedido",
  "matchedIds": ["id1"]
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
      const doubtReasons = [...(localResult.doubtReasons || [])];
      if (parsed.hasDoubt && parsed.doubtReason) {
        doubtReasons.push(parsed.doubtReason);
      }

      const hasDoubt = Boolean(localResult.hasDoubt || parsed.hasDoubt);

      // Se a IA ficou em dúvida, bloqueia qualquer envio automático para não incomodar o cliente!
      const verifiedMatches = parsed.hasDoubt ? [] : localResult.matches;
      const fallbackHuman = buildHumanContextualParts(messageText, senderName, settings.humanTraining);

      return {
        isLookingForProperty: Boolean(parsed.isLookingForProperty && localResult.isLookingForProperty),
        reason: parsed.reason || localResult.reason || '',
        hasDoubt,
        doubtReasons,
        nearMissDoubts: localResult.nearMissDoubts || [],
        detectedTone: parsed.detectedTone || fallbackHuman.detectedTone,
        customOpening: parsed.customOpening || fallbackHuman.opening,
        customClosing: parsed.customClosing || fallbackHuman.closing,
        criteria: localResult.criteria,
        matches: verifiedMatches,
        usedEngine: 'Google Gemini AI + Motor Rígido por Exclusão (100%)'
      };
    } catch (err) {
      console.error('⚠️ Aviso na chamada Gemini AI (usando motor rígido por exclusão local):', err.message);
    }
  }

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
      ? 'Com Armários / Semimobiliado'
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
  buildHumanContextualParts,
  extractPropertySuitesCount,
  extractPropertyLazerStatus,
  extractPropertyCondominio,
  extractPropertyAgeInfo,
  evaluateInventoryByExclusion,
  filterInventory
};
