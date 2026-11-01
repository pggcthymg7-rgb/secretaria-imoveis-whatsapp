/**
 * Utilitários de texto do cérebro: normalização, números por extenso e comparação aproximada
 * (tolera erros de digitação comuns em WhatsApp, ex: "Rondom" -> "Rondon").
 */

function normalize(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‐-―]/g, '-')
    .replace(/[^\p{L}\p{N}\s.,;:!?/$%()+\-²]/gu, ' ')
    .replace(/m²/g, 'm2')
    .replace(/²/g, '2')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasPhrase(textNorm, phraseNorm) {
  if (!textNorm || !phraseNorm) return false;
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegex(phraseNorm)}(?:$|[^a-z0-9])`).test(textNorm);
}

function tokens(textNorm) {
  return String(textNorm || '').split(/[^a-z0-9]+/).filter(Boolean);
}

/** Distância de Damerau-Levenshtein (versão OSA) */
function editDistance(a, b) {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (!al) return bl;
  if (!bl) return al;
  const d = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) d[i][0] = i;
  for (let j = 0; j <= bl; j++) d[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[al][bl];
}

/** Quantos erros de digitação aceitamos para um termo desse tamanho */
function allowedTypos(term) {
  const len = term.replace(/\s/g, '').length;
  if (len >= 12) return 2;
  if (len >= 7) return 1;
  return 0;
}

/**
 * Procura `phrase` dentro de `textNorm` aceitando pequenos erros de digitação.
 * Compara janelas com o mesmo número de palavras. Retorna true/false.
 */
function fuzzyFind(textNorm, phraseNorm) {
  if (!phraseNorm) return -1;
  const words = tokens(textNorm);
  const pWords = tokens(phraseNorm);
  const k = pWords.length;
  if (!k || words.length < k) return -1;
  const target = pWords.join(' ');
  const maxTypos = allowedTypos(phraseNorm);
  for (let i = 0; i + k <= words.length; i++) {
    const win = words.slice(i, i + k);
    const window = win.join(' ');
    if (window === target) return i;
    if (maxTypos === 0) continue;
    if (Math.abs(window.length - target.length) > maxTypos) continue;
    // cada palavra precisa começar com a mesma letra (evita "leste" ~ "oeste")
    if (!win.every((w, idx) => w[0] === pWords[idx][0])) continue;
    if (editDistance(window, target) <= maxTypos) return i;
  }
  return -1;
}

function fuzzyContains(textNorm, phraseNorm) {
  if (!phraseNorm) return false;
  if (hasPhrase(textNorm, phraseNorm)) return true;
  return fuzzyFind(textNorm, phraseNorm) >= 0;
}

const WORD_NUMBERS = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10
};

function wordOrDigit(tok) {
  if (tok === undefined || tok === null) return null;
  const t = String(tok).trim();
  if (WORD_NUMBERS[t] !== undefined) return WORD_NUMBERS[t];
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? null : n;
}

/** Converte "1.100.000,00" / "1,2" / "500" / "1.2" em número */
function parseBrazilianNumber(raw) {
  let s = String(raw).trim();
  if (!s) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})+$/.test(s)) {
    s = s.replace(/,/g, '');
  } else {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

function haversineKm(a, b) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

module.exports = {
  normalize,
  escapeRegex,
  hasPhrase,
  tokens,
  editDistance,
  fuzzyContains,
  fuzzyFind,
  wordOrDigit,
  parseBrazilianNumber,
  haversineKm
};
