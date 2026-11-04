/**
 * ============================================================================
 * FILTROS DA BUSCA INTELIGENTE (iguais aos dos portais: OLX, ZAP, VivaReal)
 * ============================================================================
 * O corretor preenche campos — tipo, negócio, cidade, bairro, condomínio/edifício,
 * valor (de/até), quartos, suítes, vagas, tamanho (de/até), "mais" — e o que fica em
 * branco fica ABERTO. Os mesmos campos servem para o painel, para o WhatsApp
 * (guiado, ou "campo: valor; campo: valor") e viram critérios direto para os grupos e
 * para os portais (sem depender de a BIGA "adivinhar" um texto).
 * Este arquivo só lê e valida os campos (sem cérebro, sem rede).
 * ============================================================================
 */
const { normalize, parseBrazilianNumber } = require('./brain/text');
const { detectTipos } = require('./brain/parser');

const ROTULO_UNIDADE = /^(milhoes|milhao|mi|mm|m|mil|k)$/;

/** "4 milhões", "800 mil", "R$ 4,5 mi", "4.000.000,00", "4000000" -> número (ou null se vazio). Lança Error se não entender. */
function numeroValor(bruto, { dinheiro = false } = {}) {
  const t = normalize(bruto).replace(/r\$|rs/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const m = t.match(/^(\d+(?:[.,]\d+)*)\s*(milhoes|milhao|mi|mm|m|mil|k)?$/);
  if (!m) throw new Error(`Não entendi o valor "${String(bruto).trim()}".`);
  let n = parseBrazilianNumber(m[1]);
  if (!Number.isFinite(n)) throw new Error(`Não entendi o valor "${String(bruto).trim()}".`);
  if (m[2]) n *= /^(milhoes|milhao|mi|mm|m)$/.test(m[2]) ? 1e6 : 1e3;
  else if (dinheiro) n = n < 50 ? n * 1e6 : n < 10000 ? n * 1e3 : n; // "4" = 4 milhões, "800" = 800 mil (mesma regra dos pedidos)
  return Math.round(n);
}

/** Tamanho em m²: "100", "100 m²", "1.000 m2" */
function numeroArea(bruto) {
  const t = normalize(bruto).replace(/m2|metros quadrados|metros|m²|mts?/g, '').trim();
  if (!t) return null;
  if (!/^\d+(?:[.,]\d+)*$/.test(t)) throw new Error(`Não entendi o tamanho "${String(bruto).trim()}".`);
  return Math.round(parseBrazilianNumber(t));
}

function inteiro(bruto, nome) {
  const t = normalize(bruto).replace(/\+|ou mais|no minimo|minimo|min\.?/g, '').trim();
  if (!t) return null;
  if (!/^\d{1,2}$/.test(t)) throw new Error(`Não entendi ${nome} "${String(bruto).trim()}".`);
  return Number(t);
}

/**
 * Faixa escrita de uma vez: "de 4 milhões a 5 milhões", "4 a 5 milhões", "até 1 milhão",
 * "a partir de 800 mil", "100 a 150" (área). Um valor só = "até" (como nos portais, "preço máximo").
 */
function faixa(bruto, tipo = 'dinheiro') {
  const n = normalize(bruto).replace(/r\$|rs/g, '').replace(/\s+/g, ' ').trim();
  if (!n) return { min: null, max: null };
  const conv = (t, unidadeVizinha = '') => {
    const x = t.trim();
    if (tipo === 'area') return numeroArea(x);
    // "4 a 5 milhões": o 4 herda a unidade do 5
    if (unidadeVizinha && /^\d+(?:[.,]\d+)?$/.test(x)) return numeroValor(`${x} ${unidadeVizinha}`);
    return numeroValor(x, { dinheiro: true });
  };
  const unidade = t => ((t.match(/\b(milhoes|milhao|mil|mi|k)\b\s*$/) || [])[1] || '');
  let m;
  if ((m = n.match(/^(?:ate|no maximo|maximo|max|menos de|abaixo de)\s+(.+)$/))) return { min: null, max: conv(m[1]) };
  if ((m = n.match(/^(?:a partir de|acima de|apartir de|minimo(?: de)?|min|mais de)\s+(.+)$/))) return { min: conv(m[1]), max: null };
  if ((m = n.match(/^(?:de\s+|entre\s+)?(.+?)\s+(?:a|ate|e|ao|-)\s+(.+)$/)) || (m = n.match(/^(.+?)\s*-\s*(.+)$/))) {
    const u = unidade(m[2]);
    const a = conv(m[1], unidade(m[1]) ? '' : u);
    const b = conv(m[2]);
    return a !== null && b !== null && a > b ? { min: b, max: a } : { min: a, max: b };
  }
  return { min: null, max: conv(n) };
}

const TIPOS_VALIDOS = ['Apartamento', 'Casa', 'Casa de condomínio', 'Sobrado', 'Cobertura', 'Flat', 'Studio', 'Terreno', 'Chácara', 'Fazenda', 'Comercial'];

function tipoCanonico(bruto) {
  const t = normalize(bruto);
  if (!t || /^(qualquer|todos|todas|aberto|-)$/.test(t)) return '';
  if (/\bcasas? (?:de|em|no) condominio\b|\bcondominio fechado\b/.test(t)) return 'Casa de condomínio';
  const r = detectTipos(t)[0];
  if (!r) throw new Error(`Não entendi o tipo "${String(bruto).trim()}". Use: casa, casa de condomínio, apartamento, cobertura, sobrado, flat, studio, terreno, chácara ou comercial.`);
  return r;
}

function negocioCanonico(bruto) {
  const t = normalize(bruto);
  if (!t || /^(qualquer|aberto|-)$/.test(t)) return 'VENDA';
  if (/\b(aluguel|alugar|locacao|alugo)\b/.test(t)) return 'ALUGUEL';
  if (/\b(venda|vender|comprar|compra)\b/.test(t)) return 'VENDA';
  throw new Error(`Não entendi "${String(bruto).trim()}": diga venda ou aluguel.`);
}

const texto = (v, max = 100) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Valida e limpa os filtros. Campos aceitos (todos opcionais):
 * tipo, negocio, cidade, bairro, local, valor (faixa) | valorMin, valorMax, quartos, suites, vagas,
 * area (faixa) | areaMin, areaMax, extras.
 * Retorna { filtros, erros: [] }; `filtros` só traz o que foi preenchido.
 */
function normalizarFiltros(bruto = {}) {
  const f = {};
  const erros = [];
  const tenta = fn => {
    try {
      return fn();
    } catch (e) {
      erros.push(e.message);
      return undefined;
    }
  };
  const vazio = v => v === undefined || v === null || String(v).trim() === '' || /^(-|—|\.|qualquer|aberto|pular)$/i.test(String(v).trim());

  if (!vazio(bruto.tipo)) f.tipo = tenta(() => tipoCanonico(bruto.tipo)) || undefined;
  if (!vazio(bruto.negocio)) f.negocio = tenta(() => negocioCanonico(bruto.negocio)) || undefined;
  for (const k of ['cidade', 'bairro', 'local', 'extras']) if (!vazio(bruto[k])) f[k] = texto(bruto[k], k === 'extras' ? 200 : 80);

  // valor: campo "valor" (faixa) e/ou valorMin/valorMax separados (os separados ganham)
  let vmin = null;
  let vmax = null;
  if (!vazio(bruto.valor)) {
    const r = tenta(() => faixa(bruto.valor, 'dinheiro')) || {};
    vmin = r.min ?? null;
    vmax = r.max ?? null;
  }
  if (!vazio(bruto.valorMin)) vmin = tenta(() => numeroValor(bruto.valorMin, { dinheiro: true })) ?? vmin;
  if (!vazio(bruto.valorMax)) vmax = tenta(() => numeroValor(bruto.valorMax, { dinheiro: true })) ?? vmax;
  if (vmin !== null && vmax !== null && vmin > vmax) [vmin, vmax] = [vmax, vmin];
  if (vmin !== null && (vmin < 1000 || vmin > 2e9)) erros.push('Valor mínimo fora do normal.');
  if (vmax !== null && (vmax < 1000 || vmax > 2e9)) erros.push('Valor máximo fora do normal.');
  if (vmin !== null) f.valorMin = vmin;
  if (vmax !== null) f.valorMax = vmax;

  let amin = null;
  let amax = null;
  if (!vazio(bruto.area)) {
    const r = tenta(() => faixa(bruto.area, 'area')) || {};
    amin = r.min ?? null;
    amax = r.max ?? null;
  }
  if (!vazio(bruto.areaMin)) amin = tenta(() => numeroArea(bruto.areaMin)) ?? amin;
  if (!vazio(bruto.areaMax)) amax = tenta(() => numeroArea(bruto.areaMax)) ?? amax;
  if (amin !== null && amax !== null && amin > amax) [amin, amax] = [amax, amin];
  if (amin !== null) f.areaMin = amin;
  if (amax !== null) f.areaMax = amax;

  for (const [k, nome] of [['quartos', 'os quartos'], ['suites', 'as suítes'], ['vagas', 'as vagas']]) {
    if (vazio(bruto[k])) continue;
    const n = tenta(() => inteiro(bruto[k], nome));
    if (n) f[k] = n;
  }
  return { filtros: Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== '')), erros };
}

const preenchidos = f => Object.keys(f || {}).filter(k => k !== 'negocio').length;

// ---------------------------------------------------------------------------
// "campo: valor; campo: valor" (WhatsApp)
// ---------------------------------------------------------------------------
const APELIDOS = {
  tipo: ['tipo', 'imovel', 'tipo de imovel'],
  negocio: ['negocio', 'transacao', 'finalidade', 'venda ou aluguel'],
  cidade: ['cidade', 'municipio'],
  bairro: ['bairro', 'setor', 'regiao'],
  local: ['condominio', 'edificio', 'predio', 'residencial', 'empreendimento', 'local', 'condominio ou edificio', 'edificio ou condominio'],
  valor: ['valor', 'preco', 'faixa de preco', 'orcamento'],
  valorMin: ['valor de', 'valor minimo', 'valor min', 'preco minimo', 'preco de', 'de'],
  valorMax: ['valor ate', 'valor maximo', 'valor max', 'preco maximo', 'preco ate', 'ate'],
  quartos: ['quartos', 'quarto', 'dormitorios'],
  suites: ['suites', 'suite'],
  vagas: ['vagas', 'vaga', 'garagem'],
  area: ['area', 'tamanho', 'metragem', 'm2'],
  areaMin: ['area minima', 'area min', 'tamanho minimo', 'area de', 'tamanho de'],
  areaMax: ['area maxima', 'area max', 'tamanho maximo', 'area ate', 'tamanho ate'],
  extras: ['extras', 'mais', 'detalhes', 'outros', 'obs', 'observacao']
};
const CAMPO_POR_APELIDO = new Map(Object.entries(APELIDOS).flatMap(([campo, lista]) => lista.map(a => [a, campo])));

/**
 * Lê "cidade: Goiânia; condomínio: Jardins Itália; suítes: 4; valor: de 4 a 5 milhões".
 * Só conta se TODAS as partes forem "campo: valor" com campo conhecido. Senão devolve null (é texto livre).
 */
function parseCampos(textoBruto) {
  const partes = String(textoBruto || '')
    .split(/[\n;]+/)
    .map(p => p.trim())
    .filter(Boolean);
  if (!partes.length) return null;
  const bruto = {};
  for (const p of partes) {
    const m = p.match(/^([^:=]{2,30}?)\s*[:=]\s*(.+)$/);
    if (!m) return null;
    const campo = CAMPO_POR_APELIDO.get(normalize(m[1]));
    if (!campo) return null;
    bruto[campo] = m[2].trim();
  }
  return bruto;
}

module.exports = { numeroValor, numeroArea, faixa, tipoCanonico, negocioCanonico, normalizarFiltros, parseCampos, preenchidos, TIPOS_VALIDOS, APELIDOS };
