/**
 * ============================================================================
 * INTÉRPRETE DE PEDIDOS DOS GRUPOS
 * ============================================================================
 * Transforma a mensagem do corretor em critérios objetivos:
 * intenção (busca x oferta), tipo, localização, preço (máximo, mínimo, "em torno de",
 * ágio), quartos, suítes, vagas, metragem (m², mil m², hectare, alqueire),
 * mobília, lazer, condomínio, idade do prédio, características exigidas e desejáveis,
 * forma de pagamento (à vista, financiamento, permuta), formato pedido (PDF/vídeo),
 * tom (urgente, parceria, investidor).
 * ============================================================================
 */
const { normalize, wordOrDigit, parseBrazilianNumber } = require('./text');
const { detectLocations, stripPermutaClause } = require('./locations');

const NUM = '(\\d+|um|uma|dois|duas|tres|quatro|cinco|seis)';

// ---------------------------------------------------------------------------
// INTENÇÃO
// ---------------------------------------------------------------------------
const SEARCH_RX = [
  /\bbusc(?:o|amos|ando|a-se)\b/, /\bprocur(?:o|amos|ando|a-se)\b/, /\bprecis(?:o|amos|ando)\b/, /\bquer(?:o|emos|endo)\b/,
  /\bgostaria\b/, /\bnecessit(?:o|amos)\b/, /\btenho (?:um |uma )?cliente\b/, /\bcliente (?:procura|busca|quer|precisa|procurando|buscando|interessad[oa]|com perfil)\b/,
  /\balguem (?:tem|com|teria|possui)\b/, /\bquem (?:tem|tiver|possui)\b/, /\btem (?:algum|alguma|disponivel)\b/, /\bcompro\b/,
  /\bdemanda\b/, /\b(?:estou|to|tô) atras\b/, /\binteressad[oa]s? em\b/, /\bindicac(?:ao|oes) de\b/, /\bme (?:mand[ae]m?|envi[ae]m?)\b/,
  /\bopc(?:ao|oes) de\b/, /\bpesquisando\b/, /\bperfil do cliente\b/, /\bpedido\b/, /\bdemanda\b/
];
const OFFER_RX = [
  /\bvendo\b/, /\balugo\b/, /\bvende-?se\b/, /\baluga-?se\b/, /\ba venda\b/, /\bdisponivel para (?:venda|locacao)\b/,
  /\blancamento\b/, /\bexclusividade\b/, /\bcaptei\b/, /\bacabei de captar\b/, /\bchama no pv\b/, /\bfotos no pv\b/,
  /\bcomissao\b/, /\bagende (?:sua|a) visita\b/, /\bconfira\b/, /\bpasso (?:o )?agio\b/, /\brepasso\b/, /\bimperdivel\b/,
  /\btenho (?:para|pra) (?:venda|vender|alugar)\b/, /\bvalor de venda\b/, /\bproprietario aceita\b/
];

function firstIndex(norm, list) {
  let best = -1;
  for (const rx of list) {
    const m = norm.match(rx);
    if (m && (best === -1 || m.index < best)) best = m.index;
  }
  return best;
}

function detectIntent(norm, rawText) {
  const s = firstIndex(norm, SEARCH_RX);
  const o = firstIndex(norm, OFFER_RX);
  const hasNoun = /\b(ap|apto|apartamento|casa|sobrado|imovel|kitnet|studio|flat|lote|terreno|cobertura|sala|chacara|sitio|fazenda|galpao|loja)\b/.test(norm);
  if (s >= 0 && (o === -1 || s <= o)) return 'BUSCA';
  if (o >= 0) return 'OFERTA';
  if (hasNoun && /\?/.test(rawText) && /\b(alguem|quem|tem|teria)\b/.test(norm)) return 'BUSCA';
  return 'OUTRO';
}

// ---------------------------------------------------------------------------
// TIPO
// ---------------------------------------------------------------------------
function detectTipos(norm) {
  const tipos = [];
  const add = t => !tipos.includes(t) && tipos.push(t);
  if (/\bflats?\b/.test(norm)) add('Flat');
  if (/\b(cobertura|coberturas|penthouse)\b/.test(norm)) add('Cobertura');
  if (/\b(kitnet|kitnets|kit net|studio|studios|stud|loft|lofts|quitinete)\b/.test(norm)) add('Studio');
  if (/\b(ap|aps|apto|aptos|apartamento|apartamentos|apt)\b/.test(norm)) add('Apartamento');
  if (/\b(sobrado|sobrados)\b/.test(norm)) add('Sobrado');
  if (/\b(casa|casas|terrea)\b/.test(norm)) add('Casa');
  if (/\b(lote|lotes|terreno|terrenos)\b/.test(norm)) add('Terreno');
  if (/\b(chacara|chacaras|sitio|sitios|rancho|ranchos)\b/.test(norm)) add('Chácara');
  if (/\b(fazenda|fazendas)\b/.test(norm)) add('Fazenda');
  if (/\b(sala comercial|salas comerciais|loja|lojas|galpao|galpoes|ponto comercial|predio comercial|imovel comercial|consultorio)\b/.test(norm)) add('Comercial');
  return tipos;
}

function detectSubtipoCasa(norm) {
  if (/\b(casa de rua|sobrado de rua|fora de condominio|sem condominio|nao pode ser (?:em )?condominio)\b/.test(norm)) return 'RUA';
  if (/\b(condominio fechado|casa em condominio|sobrado em condominio|condominio horizontal|em condominio)\b/.test(norm)) return 'CONDOMINIO';
  return null;
}

// ---------------------------------------------------------------------------
// QUARTOS / SUÍTES / VAGAS
// ---------------------------------------------------------------------------
const Q = '(?:quartos?|qts?|q|dormitorios?|dorms?|qrts?)';
const S = '(?:suites?|suite)';

function detectRooms(norm) {
  const out = { quartos_min: null, quartos_max: null, suites_min: null, suites_max: null, vagas_min: null };
  const n = v => wordOrDigit(v);

  let m;
  if ((m = norm.match(new RegExp(`\\b(?:no minimo|minimo(?: de)?|pelo menos|a partir de|acima de|mais de)\\s*${NUM}\\s*${Q}\\b`)))) {
    out.quartos_min = n(m[1]) + (/acima de|mais de/.test(m[0]) ? 1 : 0);
  } else if ((m = norm.match(new RegExp(`\\b${NUM}\\s*${Q}\\s*(?:ou mais|pra cima|para cima|no minimo|\\+)`)))) {
    out.quartos_min = n(m[1]);
  } else if ((m = norm.match(new RegExp(`\\b${NUM}\\s*(?:ou|a|\\/|-)\\s*${NUM}\\s*${Q}\\b`))) || (m = norm.match(new RegExp(`\\b${NUM}\\s*${Q}\\s*(?:ou|a|\\/)\\s*${NUM}\\b(?!\\s*${S})`)))) {
    const a = n(m[1]);
    const b = n(m[2]);
    out.quartos_min = Math.min(a, b);
    out.quartos_max = Math.max(a, b);
  } else if ((m = norm.match(new RegExp(`\\b${NUM}\\s*${Q}\\b`)))) {
    out.quartos_min = n(m[1]);
    out.quartos_max = n(m[1]);
  } else if (/\bquarto e sala\b/.test(norm)) {
    out.quartos_min = 1;
    out.quartos_max = 1;
  }

  if ((m = norm.match(new RegExp(`\\b(?:no minimo|minimo(?: de)?|pelo menos|a partir de)\\s*${NUM}\\s*${S}\\b`)))) {
    out.suites_min = n(m[1]);
  } else if ((m = norm.match(new RegExp(`\\b${NUM}\\s*(?:ou|a|\\/)\\s*${NUM}\\s*${S}\\b`)))) {
    out.suites_min = Math.min(n(m[1]), n(m[2]));
    out.suites_max = Math.max(n(m[1]), n(m[2]));
  } else if ((m = norm.match(new RegExp(`\\b${NUM}\\s*${S}\\b`)))) {
    out.suites_min = n(m[1]);
  } else if (/\b(com suite|uma suite|sendo suite)\b/.test(norm)) {
    out.suites_min = 1;
  }
  // "todas suítes" -> suítes = quartos
  if (/\btodos? (?:os quartos )?(?:sendo )?suites?\b|\btodas suites\b/.test(norm) && out.quartos_min) {
    out.suites_min = out.quartos_min;
  }
  // "3 suítes" sem falar de quartos -> no mínimo 3 quartos também
  if (out.suites_min && !out.quartos_min) out.quartos_min = out.suites_min;
  if (out.quartos_max && out.suites_min && out.quartos_max < out.suites_min) out.quartos_max = null;

  if ((m = norm.match(new RegExp(`\\b${NUM}\\s*vagas?\\b`)))) out.vagas_min = n(m[1]);
  else if ((m = norm.match(new RegExp(`\\bvagas?\\s*(?:de garagem\\s*)?:?\\s*${NUM}\\b`)))) out.vagas_min = n(m[1]);

  return out;
}

// ---------------------------------------------------------------------------
// METRAGEM (m², mil m², hectare, alqueire)
// ---------------------------------------------------------------------------
const AREA_UNIT = '(mil\\s*m2|mil\\s*metros?(?:\\s*quadrados?)?|m2|metros?\\s*quadrados?|metros?|mts|hectares?|ha|alqueires?)';

function toM2(value, unit) {
  const u = unit.replace(/\s+/g, ' ');
  if (/^mil/.test(u)) return value * 1000;
  if (/^(hectare|ha)/.test(u)) return value * 10000;
  if (/^alqueire/.test(u)) return value * 48400; // alqueire goiano
  return value;
}

function detectArea(norm) {
  let text = norm;
  const out = { area_min: null, area_max: null };
  const spans = [];

  // intervalo: "de 4 a 5 mil m2", "entre 300 e 500 m2"
  const range = text.match(new RegExp(`\\b(?:de|entre)\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:a|e|ate)\\s*(\\d+(?:[.,]\\d+)?)\\s*${AREA_UNIT}`));
  if (range) {
    const unit = range[3];
    out.area_min = toM2(parseBrazilianNumber(range[1]), unit);
    out.area_max = toM2(parseBrazilianNumber(range[2]), unit);
    spans.push(range[0]);
  } else {
    const max = text.match(new RegExp(`\\b(?:ate|abaixo de|menor que|no maximo|maximo|max)\\s*(\\d+(?:[.,]\\d+)?)\\s*${AREA_UNIT}`));
    if (max) {
      out.area_max = toM2(parseBrazilianNumber(max[1]), max[2]);
      spans.push(max[0]);
    }
    const min = text.match(new RegExp(`\\b(?:acima de|a partir de|no minimo|minimo(?: de)?|maior que|mais de|pelo menos)\\s*(\\d+(?:[.,]\\d+)?)\\s*${AREA_UNIT}`));
    if (min) {
      out.area_min = toM2(parseBrazilianNumber(min[1]), min[2]);
      spans.push(min[0]);
    }
    if (!max && !min) {
      const plain = text.match(new RegExp(`\\b(\\d+(?:[.,]\\d+)?)\\s*${AREA_UNIT}(?![a-z])`));
      if (plain) {
        const v = toM2(parseBrazilianNumber(plain[1]), plain[2]);
        // "90m2" = em torno de 90 (aceita 5% abaixo)
        out.area_min = Math.round(v * 0.95);
        spans.push(plain[0]);
      }
    }
  }
  // remove todas as menções de área para não confundir com preço
  text = text.replace(new RegExp(`\\b\\d+(?:[.,]\\d+)?\\s*${AREA_UNIT}(?![a-z])`, 'g'), ' ');
  return { ...out, textWithoutArea: text };
}

// ---------------------------------------------------------------------------
// CONDOMÍNIO (taxa mensal)
// ---------------------------------------------------------------------------
function detectCondominioMax(norm) {
  const m = norm.match(/\b(?:condominio|cond|taxa de condominio)\s*(?:de\s+)?(?:ate|no maximo|maximo|max|abaixo de|menor que|baixo|barato|de ate)\s*(?:r\$|rs)?\s*(\d{1,2}(?:\.\d{3})|\d{2,5})(?:,\d{2})?\s*(mil|reais)?(?!\s*(?:m2|metros|mil m2|a \d))/);
  if (!m) return null;
  let v = parseBrazilianNumber(m[1]);
  if (m[2] === 'mil') v *= 1000;
  return v >= 50 && v <= 30000 ? v : null;
}

// ---------------------------------------------------------------------------
// PREÇO
// ---------------------------------------------------------------------------
function cleanForPrice(text) {
  return text
    .replace(/\b(?:condominio|cond|iptu|taxa)\s*(?:de\s+)?(?:ate|no maximo|maximo|max|abaixo de|de)?\s*(?:r\$|rs)?\s*\d[\d.,]*\s*(?:mil|reais)?/g, ' ')
    .replace(/\b\d{1,3}\s*(?:km|quilometros?)\b/g, ' ')
    .replace(/\(?\b\d{2}\)?\s?9?\d{4}[\s-]\d{4}\b/g, ' ') // telefones (62) 99999-9999 / 99353 0835
    .replace(/\b9\d{4}[\s-]?\d{4}\b/g, ' ')
    .replace(/\b\d{1,2}\s*anos?\b/g, ' ')
    .replace(/\b\d+\s*(?:vagas?|quartos?|suites?|qts?|q)\b/g, ' ');
}

function priceCandidates(text) {
  const cands = [];
  const push = (value, idx, len) => {
    if (value && value >= 10000 && value <= 200000000) cands.push({ value, idx, len });
  };
  let m;
  const rxMilhao = /(\d+(?:[.,]\d+)?)\s*(?:milhoes|milhao|milhoes|mi|mm|m)\b(?!\s*(?:m2|metros|2))/g;
  while ((m = rxMilhao.exec(text)) !== null) {
    if (/\bm$/.test(m[0]) && !/r\$\s*$/.test(text.slice(Math.max(0, m.index - 4), m.index))) continue; // "5m" só vale com R$
    push(parseBrazilianNumber(m[1]) * 1e6, m.index, m[0].length);
  }
  const rxMil = /(\d+(?:[.,]\d+)?)\s*(?:mil|k)\b(?!\s*(?:m2|metros))/g;
  while ((m = rxMil.exec(text)) !== null) push(parseBrazilianNumber(m[1]) * 1e3, m.index, m[0].length);
  // (?![\d]|[.,]\d): não deixa cortar o número no meio ("R$ 950 mil" virava 95 mil; "R$ 2,8 mi" virava 2 mi)
  const rxRs = /(?:r\$|rs)\s*(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+(?:[.,]\d{1,2})?)(?![\d]|[.,]\d)(?!\s*(?:mil|k|milh|mi\b))/g;
  while ((m = rxRs.exec(text)) !== null) {
    let v = parseBrazilianNumber(m[1]);
    if (v < 50) v *= 1e6; // "R$1.2" / "R$ 1,5" = milhões
    else if (v < 10000 && !/\./.test(m[1])) v *= 1e3; // "R$ 500" = 500 mil
    push(v, m.index, m[0].length);
  }
  const rxFull = /\b(\d{1,3}(?:\.\d{3}){1,2}(?:,\d{2})?)\b/g;
  while ((m = rxFull.exec(text)) !== null) {
    // pula se colado num valor já lido (ex.: "1.200 mil"), mas não o 2º valor de uma faixa ("800 mil a 1.000.000")
    if (cands.some(c => m.index >= c.idx && m.index < c.idx + c.len + 4 && !/^\s*(?:e|a|ate)\s/.test(text.slice(c.idx + c.len, m.index + 1)))) continue;
    push(parseBrazilianNumber(m[1]), m.index, m[0].length);
  }
  const rxRaw = /(?:valor|orcamento|ate|teto|preco|por)\s*:?\s*(\d{6,9})\b/g;
  while ((m = rxRaw.exec(text)) !== null) push(parseInt(m[1], 10), m.index, m[0].length);
  return cands.sort((a, b) => a.idx - b.idx);
}

function qualifierBefore(text, idx) {
  const before = text.slice(Math.max(0, idx - 40), idx);
  if (/(?:entre|de)\s*$/.test(before) && /\b(?:entre)\b/.test(before)) return 'ENTRE';
  if (/(?:ate|no maximo|maximo|max|teto|limite|abaixo de|menos de|orcamento(?: de)?(?: ate)?:?|valor maximo:?|investimento de ate)\s*(?:de\s*)?(?:r\$|rs)?\s*$/.test(before)) return 'MAX';
  if (/(?:a partir de|acima de|minimo(?: de)?|mais de)\s*(?:r\$|rs)?\s*$/.test(before)) return 'MIN';
  if (/(?:em torno de|por volta de|aprox(?:imadamente)?|cerca de|na faixa de|faixa de|media de|no valor de|uns|perto de|algo em torno de|\()\s*(?:de\s*)?(?:r\$|rs)?\s*$/.test(before)) return 'ALVO';
  return 'PADRAO';
}

function detectPrice(textNoArea, isAgio) {
  const text = cleanForPrice(textNoArea);
  const cands = priceCandidates(text);
  const out = { valor_max: null, valor_min: null, valor_alvo: null, preco_texto: null };
  if (!cands.length) return out;

  // "entre 400 e 500 mil" / "de 400 a 500 mil"
  const rangeRx = /\b(?:entre|de)\s*(?:r\$\s*)?(\d+(?:[.,]\d+)?)\s*(?:mil|k)?\s*(?:e|a|ate)\s*(?:r\$\s*)?(\d+(?:[.,]\d+)?)\s*(mil|k|milhao|milhoes|mi)\b/;
  const rm = text.match(rangeRx);
  // "entre R$ 900.000 e R$ 1,2 mi": o 1º número já é valor completo; quem resolve é a faixa por candidatos abaixo
  if (rm && !/^\d{1,3}(?:\.\d{3})+/.test(rm[1])) {
    const mult = /^(?:mil|k)$/.test(rm[3]) ? 1e3 : 1e6; // "milhao" também começa com "mil"
    const a = parseBrazilianNumber(rm[1]) * (parseBrazilianNumber(rm[1]) < 10 && mult === 1e3 ? 1e3 : mult);
    const b = parseBrazilianNumber(rm[2]) * mult;
    out.valor_min = Math.min(a, b);
    out.valor_max = Math.max(a, b);
    out.preco_texto = `entre ${fmt(out.valor_min)} e ${fmt(out.valor_max)}`;
    return out;
  }

  // "de 800 mil a 1.000.000,00" / "entre R$ 900.000 e R$ 1,2 mi" (cada lado com a sua unidade)
  for (let i = 0; i + 1 < cands.length; i++) {
    const a = cands[i];
    const b = cands.slice(i + 1).find(c => c.idx >= a.idx + a.len);
    if (!b) break;
    const meio = text.slice(a.idx + a.len, b.idx);
    const antes = text.slice(Math.max(0, a.idx - 12), a.idx);
    if (/^\s*(?:e|a|ate)\s*(?:r\$|rs)?\s*$/.test(meio) && /\b(?:entre|de)\s*(?:r\$|rs)?\s*$/.test(antes) && b.value > a.value) {
      out.valor_min = a.value;
      out.valor_max = b.value;
      out.preco_texto = `entre ${fmt(out.valor_min)} e ${fmt(out.valor_max)}`;
      return out;
    }
  }

  // Usa o maior valor com qualificador "até"; senão o primeiro valor
  const qualified = cands.map(c => ({ ...c, q: qualifierBefore(text, c.idx) }));
  const max = qualified.filter(c => c.q === 'MAX').sort((a, b) => b.value - a.value)[0];
  const min = qualified.find(c => c.q === 'MIN');
  const alvo = qualified.find(c => c.q === 'ALVO');
  const padrao = qualified.find(c => c.q === 'PADRAO');

  if (max) out.valor_max = max.value;
  if (min) out.valor_min = min.value;
  if (!max && alvo) {
    out.valor_alvo = alvo.value;
    out.valor_min = Math.round(alvo.value * 0.85);
    out.valor_max = Math.round(alvo.value * 1.12);
  }
  if (!max && !alvo && padrao) {
    out.valor_alvo = padrao.value;
    out.valor_max = Math.round(padrao.value * 1.05);
  }
  out.preco_texto = out.valor_alvo
    ? `${isAgio ? 'ágio ' : ''}em torno de ${fmt(out.valor_alvo)}`
    : out.valor_max
    ? `${isAgio ? 'ágio ' : ''}até ${fmt(out.valor_max)}`
    : out.valor_min
    ? `a partir de ${fmt(out.valor_min)}`
    : null;
  return out;
}

function fmt(v) {
  if (!v) return '';
  if (v >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  return `R$ ${Math.round(v / 1000).toLocaleString('pt-BR')} mil`;
}

// ---------------------------------------------------------------------------
// CARACTERÍSTICAS (exigidas x desejáveis)
// ---------------------------------------------------------------------------
// key, rótulo, regex no pedido, regex que comprova no imóvel
const FEATURES = [
  ['piscina', 'Piscina', /\bpiscinas?\b/, /\bpiscinas?\b/],
  ['churrasqueira', 'Churrasqueira', /\bchurrasqueiras?\b/, /\bchurrasqueira|espaco gourmet|area gourmet|varanda gourmet\b/],
  ['gourmet', 'Área/varanda gourmet', /\b(?:area|espaco|varanda|sacada) gourmet\b|\bgourmet\b/, /\bgourmet\b/],
  ['quintal', 'Quintal', /\bquintal\b/, /\bquintal\b/],
  ['despensa', 'Despensa', /\bdespensa\b/, /\bdespensa\b/],
  ['closet', 'Closet', /\bcloset\b/, /\bcloset\b/],
  ['escritorio', 'Escritório', /\b(?:escritorio|home office)\b/, /\b(?:escritorio|home office)\b/],
  ['varanda', 'Varanda/sacada', /\b(?:varanda|sacada)\b(?! gourmet)/, /\b(?:varanda|sacada)\b/],
  ['vagas_independentes', 'Vagas independentes (sem gaveta)', /\b(?:vagas? independentes?|sem vagas? (?:de )?gaveta|vagas? soltas?|nao pode (?:ser )?gaveta)\b/, /\b(?:vagas? independentes?|vagas? soltas?|sem gaveta)\b/],
  ['vaga_coberta', 'Vaga coberta', /\bvagas? cobertas?\b/, /\bvagas? cobertas?|garagem coberta\b/],
  ['nascente', 'Sol da manhã (nascente)', /\b(?:nascente|sol da manha)\b(?! de agua)/, /\b(?:nascente|sol da manha)\b/],
  ['andar_alto', 'Andar alto', /\bandar alto\b/, /\bandar alto|\b(?:[1-9]\d)o andar\b/],
  ['andar_baixo', 'Andar baixo', /\bandar baixo\b/, /\bandar baixo|terreo|\b[1-3]o andar\b/],
  ['terrea', 'Térrea', /\bterrea\b/, /\bterrea\b/],
  ['elevador', 'Elevador', /\belevador(?:es)?\b/, /\belevador/],
  ['portaria_24h', 'Portaria 24h', /\bportaria 24/, /\bportaria 24/],
  ['academia', 'Academia', /\bacademia\b/, /\bacademia|fitness\b/],
  ['jardim', 'Jardim', /\bjardim\b(?! [a-z]{4,})/, /\bjardim\b/],
  ['energia_solar', 'Energia solar', /\b(?:energia|placa|placas) solar(?:es)?\b/, /\b(?:energia|placas?) solar/],
  ['agua', 'Água (córrego, nascente, lago ou represa)', /\b(?:corrego|riacho|rio|represa|lago|lagoa|nascente de agua|mina d.?agua|agua corrente|agua \()/, /\b(?:corrego|riacho|rio|represa|lago|lagoa|nascente|mina|agua corrente|cachoeira)\b/],
  ['escritura', 'Escriturado / documentação regularizada', /\b(?:escriturad[ao]|escritura|documentacao (?:ok|regularizada|em dia)|regularizad[ao])\b/, /\b(?:escriturad[ao]|escritura|documentacao (?:ok|regularizada|em dia)|regularizad[ao]|registrad[ao])\b/],
  ['pet', 'Aceita pet', /\b(?:aceita pets?|pet friendly|aceita animais?)\b/, /\b(?:aceita pets?|pet friendly|aceita animais?)\b/],
  ['dce', 'Dependência de empregada', /\b(?:dce|dependencia de empregada|quarto de empregada)\b/, /\b(?:dce|dependencia de empregada|quarto de empregada)\b/]
];

const PREFERENCE_RX = /\b(?:preferencia|de preferencia|preferencialmente|se possivel|ideal(?:mente)?|seria bom|desejavel|plus|diferencial)\b/;

function detectFeatures(norm) {
  const required = [];
  const desired = [];
  // analisa linha a linha: linhas com "preferência" viram desejáveis
  const lines = norm.split(/\n|;|\.(?!\d)/);
  for (const line of lines) {
    const pref = PREFERENCE_RX.test(line);
    for (const [key, label, rx] of FEATURES) {
      if (!rx.test(line)) continue;
      if (key === 'jardim' && /\bjardins?\s+[a-z]{3,}/.test(line)) continue; // "Jardim América" não é jardim
      if (key === 'nascente' && /nascente de agua|corrego|represa|lago/.test(line) && !/sol da manha/.test(line)) continue;
      const target = pref ? desired : required;
      if (!required.find(f => f.key === key) && !target.find(f => f.key === key)) target.push({ key, label });
    }
  }
  return { required, desired };
}

// ---------------------------------------------------------------------------
// MOBÍLIA / LAZER / IDADE
// ---------------------------------------------------------------------------
function detectMobilia(norm) {
  if (/\b(sem armarios|sem mobilia|nao mobiliado|vazio|sem moveis)\b/.test(norm)) return 'SEM';
  if (/\b(semimobiliado|semi mobiliado|semi-mobiliado|semi)\b/.test(norm)) return 'SEMI';
  if (/\b(com armarios|rico em armarios|completo em armarios|armarios planejados|repleto de armarios|planejados)\b/.test(norm)) return 'SEMI';
  if (/\b(mobiliados?|mobiliadas?|porteira fechada|todo mobiliado|100% mobiliado|decorado e mobiliado|com moveis)\b/.test(norm)) return 'MOBILIADO';
  return null;
}

function detectLazer(norm) {
  if (/\b(pode ser sem (?:area de )?lazer|com ou sem (?:area de )?lazer|tanto faz (?:o )?lazer)\b/.test(norm)) return null;
  if (/\b(sem area de lazer|sem lazer|predio sem lazer|nao precisa (?:de )?(?:area de )?lazer)\b/.test(norm)) return 'NAO';
  if (/\b(area de lazer|lazer completo|com lazer|condominio clube|lazer de clube|clube)\b/.test(norm)) return 'SIM';
  return null;
}

function detectIdade(norm) {
  const cleaned = norm.replace(/\b(jardim novo mundo|novo mundo|novo horizonte|vila nova|nova suica|ano novo|de novo|nova esperanca|nova veneza)\b/g, ' ');
  const m = cleaned.match(/\b(?:ate|no maximo|maximo|menos de|abaixo de)\s*(\d+)\s*anos?\b/);
  if (m) return { idade_max: parseInt(m[1], 10), estado: null };
  if (/\b(na planta|em construcao|lancamento|obra)\b/.test(cleaned)) return { idade_max: null, estado: 'PLANTA' };
  if (/\b(novo ou seminovo|seminovo ou novo|seminovo|semi novo|semi-novo)\b/.test(cleaned)) return { idade_max: 12, estado: 'SEMINOVO' };
  if (/\b(predio novo|apartamento novo|ap novo|apto novo|imovel novo|casa nova|sobrado novo|recem entregue|nunca habitado|zero km|novinho|novo)\b/.test(cleaned)) return { idade_max: 5, estado: 'NOVO' };
  return { idade_max: null, estado: null };
}

// ---------------------------------------------------------------------------
// NEGÓCIO: venda/aluguel, ágio, permuta, à vista, financiamento
// ---------------------------------------------------------------------------
function detectNegocio(norm) {
  const aluguel = /\b(alugar|aluguel|locacao|para locar|pra alugar|temporada)\b/.test(norm) && !/\b(comprar|compra|venda)\b/.test(norm);
  const agio = /\bagio\b/.test(norm);
  const permuta = /\b(?:aceit[ae]m?|aceitando|tem|com|oferece|possui|faz|faria|dou|da)\s+(?:uma\s+)?(?:permuta|troca)\b|\b(?:permuta|troca)\s+(?:um|uma|com|por|em|de|no|na)\b|\bpermuta\b/.test(norm);
  const aVista = /\b(a vista|avista|dinheiro na mao|pagamento a vista|cash)\b/.test(norm);
  const financiamento = /\b(financiamento|financiad[oa]|financiavel|aceit[ae] financiamento|fgts|minha casa minha vida|mcmv|casa verde e amarela|carta de credito)\b/.test(norm);
  return { transacao: aluguel ? 'ALUGUEL' : 'VENDA', agio, permuta, aVista, financiamento };
}

// ---------------------------------------------------------------------------
// TOM / FORMATO
// ---------------------------------------------------------------------------
function detectTone(norm) {
  return {
    urgente: /\b(urgente|urgencia|pra hoje|para hoje|hoje ainda|visita hoje|com pressa|imediato|preciso logo|cliente na cidade|fechar hoje|essa semana|rapido)\b/.test(norm),
    parceria: /\b(tenho (?:um |uma )?cliente|cliente (?:procura|busca|quer|precisa|procurando|buscando)|parceria|fifty|50\/50|meu cliente|minha cliente|para cliente|pra cliente)\b/.test(norm),
    investidor: /\b(investidor|investimento|renda|rentabilidade|oportunidade|abaixo do mercado|valor de oportunidade)\b/.test(norm),
    altoPadrao: /\b(alto padrao|altissimo padrao|luxo|alto luxo|premium)\b/.test(norm),
    querPdf: /\bpdf\b/.test(norm),
    querVideo: /\bvideos?\b/.test(norm)
  };
}

/**
 * Função principal: lê a mensagem e devolve todos os critérios estruturados
 */
function parseRequest(rawText, ctx = {}) {
  const norm = normalize(rawText);
  const intent = detectIntent(norm, rawText);
  const negocio = detectNegocio(norm);
  const semPermuta = stripPermutaClause(norm); // o imóvel oferecido em permuta não é o procurado

  const tipos = detectTipos(semPermuta);
  const subtipo = detectSubtipoCasa(semPermuta);
  const rooms = detectRooms(semPermuta);
  const area = detectArea(semPermuta);
  const price = detectPrice(area.textWithoutArea, negocio.agio);
  const condominio_max = detectCondominioMax(semPermuta);
  const features = detectFeatures(semPermuta);
  const mobilia = detectMobilia(semPermuta);
  const lazer = detectLazer(semPermuta);
  const idade = detectIdade(semPermuta);
  const tom = detectTone(norm);
  const local = detectLocations(rawText, ctx);

  // Alternativas na mesma mensagem: "Em condomínio: de 4 a 5 mil m² / Fora de condomínio: até 20 mil m²"
  const alternativas = [];
  for (const line of semPermuta.split('\n')) {
    const isFora = /\b(fora de condominio|sem condominio|de rua)\b/.test(line);
    const isCond = !isFora && /\b(em condominio|condominio fechado)\b/.test(line);
    if (!isFora && !isCond) continue;
    const a = detectArea(line);
    if (a.area_min || a.area_max) alternativas.push({ subtipo: isFora ? 'RUA' : 'CONDOMINIO', area_min: a.area_min, area_max: a.area_max });
  }
  let subtipoFinal = subtipo;
  let areaMin = area.area_min;
  let areaMax = area.area_max;
  if (alternativas.length >= 2) {
    subtipoFinal = null;
    areaMin = null;
    areaMax = null;
  } else {
    alternativas.length = 0;
  }

  // Se pediu "em condomínio" e não especificou o tipo, provavelmente é casa
  if (!tipos.length && subtipoFinal === 'CONDOMINIO') tipos.push('Casa');

  const criteria = {
    intent,
    tipos,
    subtipo_casa: subtipoFinal,
    local,
    ...rooms,
    area_min: areaMin,
    area_max: areaMax,
    alternativas,
    valor_max: price.valor_max,
    valor_min: price.valor_min,
    valor_alvo: price.valor_alvo,
    preco_texto: price.preco_texto,
    condominio_max,
    mobilia,
    lazer,
    idade_max: idade.idade_max,
    estado: idade.estado,
    features_required: features.required,
    features_desired: features.desired,
    ...negocio,
    tom
  };
  criteria.resumo = summarizeCriteria(criteria);
  return criteria;
}

function summarizeCriteria(c) {
  const parts = [];
  if (c.agio) parts.push('ÁGIO');
  if (c.transacao === 'ALUGUEL') parts.push('ALUGUEL');
  if (c.tipos.length) parts.push(c.tipos.join(' ou '));
  if (c.subtipo_casa === 'CONDOMINIO') parts.push('em condomínio fechado');
  if (c.subtipo_casa === 'RUA') parts.push('de rua');
  if (c.local.resumo.length) parts.push(c.local.resumo.join(' | '));
  if (c.quartos_min) parts.push(c.quartos_max && c.quartos_max !== c.quartos_min ? `${c.quartos_min} a ${c.quartos_max} quartos` : c.quartos_max ? `${c.quartos_min} quarto(s)` : `${c.quartos_min}+ quartos`);
  if (c.suites_min) parts.push(`${c.suites_min}+ suíte(s)`);
  if (c.vagas_min) parts.push(`${c.vagas_min}+ vaga(s)`);
  for (const a of c.alternativas || []) parts.push(`${a.subtipo === 'RUA' ? 'fora de condomínio' : 'em condomínio'} ${a.area_min ? a.area_min.toLocaleString('pt-BR') : '0'}–${a.area_max ? a.area_max.toLocaleString('pt-BR') : '∞'} m²`);
  if (c.area_min || c.area_max) parts.push(`${c.area_min ? c.area_min.toLocaleString('pt-BR') : '0'}${c.area_max ? '–' + c.area_max.toLocaleString('pt-BR') : '+'} m²`);
  if (c.preco_texto) parts.push(c.preco_texto);
  if (c.mobilia) parts.push({ MOBILIADO: 'mobiliado', SEMI: 'com armários', SEM: 'sem mobília' }[c.mobilia]);
  if (c.lazer === 'SIM') parts.push('com lazer');
  if (c.condominio_max) parts.push(`condomínio até R$ ${c.condominio_max}`);
  if (c.estado) parts.push(c.estado.toLowerCase());
  if (c.features_required.length) parts.push(c.features_required.map(f => f.label).join(', '));
  if (c.permuta) parts.push('quer permuta');
  if (c.aVista) parts.push('à vista');
  if (c.financiamento) parts.push('financiamento');
  return parts.join(' · ');
}

module.exports = {
  parseRequest,
  detectIntent,
  detectTipos,
  detectRooms,
  detectArea,
  detectPrice,
  detectFeatures,
  detectMobilia,
  detectLazer,
  detectIdade,
  detectNegocio,
  FEATURES,
  fmtPrice: fmt
};
