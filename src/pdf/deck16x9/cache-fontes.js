'use strict';
/**
 * Resolução e cache híbrido de fontes para o motor PDF 16:9.
 * 3 níveis:
 *   1) Pasta local `fonts/` (34 .ttf estáticas incluídas)
 *   2) Cache persistente em disco (`cacheDir` = DATA_DIR/cache_fontes, com LRU por mtime)
 *   3) Google Fonts CSS2 API (User-Agent Safari 5 -> .ttf/.otf estáticas) + fallback local offline
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR_FONTES = path.join(__dirname, '..', '..', '..', 'fonts');
const UA_SAFARI_TTF =
  'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1';
const TETO_CACHE_FONTES_BYTES = 80 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const MAX_FONT_BYTES = 15 * 1024 * 1024;
const FAMILIA_RX = /^[A-Za-z0-9 ]{1,60}$/;

// Mapeamento de nomes CamelCase legados (modelos.js) para o nome oficial no Google Fonts
const CAMEL_TO_GOOGLE = new Map([
  ['CormorantGaramond', 'Cormorant Garamond'],
  ['WorkSans', 'Work Sans'],
  ['ArchivoBlack', 'Archivo Black'],
  ['SourceSans3', 'Source Sans 3'],
  ['BodoniModa', 'Bodoni Moda'],
  ['PinyonScript', 'Pinyon Script'],
  ['PlayfairDisplay', 'Playfair Display'],
  ['EBGaramond', 'EB Garamond'],
  ['AlfaSlabOne', 'Alfa Slab One'],
  ['LibreBaskerville', 'Libre Baskerville'],
  ['LibreBodoni', 'Libre Bodoni']
]);

const inFlight = new Map();

function normalizarFamilia(familia) {
  if (typeof familia !== 'string') return null;
  const trimmed = familia.trim().replace(/\s+/g, ' ');
  if (!trimmed || !FAMILIA_RX.test(trimmed)) return null;
  return trimmed;
}

function clampPeso(peso) {
  const n = Number(peso);
  if (!Number.isFinite(n) || n <= 0) return 400;
  return Math.min(1000, Math.max(100, Math.round(n)));
}

function famSemEspacos(familia) {
  const norm = normalizarFamilia(familia) || 'Archivo';
  return norm.replace(/\s+/g, '');
}

function famParaGoogle(familia) {
  const norm = normalizarFamilia(familia);
  if (!norm) return 'Archivo';
  return CAMEL_TO_GOOGLE.get(norm) || norm;
}

/**
 * Gera alias explícito sem espaços (ex.: 'OpenSans-700' ou 'OpenSans-700-italic').
 */
function aliasFonte(familia, peso = 400, italico = false) {
  const semEsp = famSemEspacos(familia);
  const p = clampPeso(peso);
  return `${semEsp}-${p}${italico ? '-italic' : ''}`;
}

function isSafePathInside(baseDir, candidate) {
  if (!baseDir || !candidate || typeof candidate !== 'string') return false;
  const baseResolved = path.resolve(baseDir);
  const candResolved = path.resolve(candidate);
  return candResolved === baseResolved || candResolved.startsWith(baseResolved + path.sep);
}

function writeAtomicSync(targetPath, data) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tmp = `${targetPath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, targetPath);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch {}
    throw err;
  }
}

/**
 * Valida magic bytes TTF/OTF e percorre diretório SFNT para rejeitar fontes variáveis ('fvar'),
 * WOFF/WOFF2, executáveis MZ, HTML e buffers truncados.
 */
function validarBufferFonte(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 64 || buf.length > MAX_FONT_BYTES) return false;

  // Rejeição explícita de formatos proibidos / payloads não-fonte
  const b0 = buf[0];
  const b1 = buf[1];
  const tag4 = buf.toString('ascii', 0, 4);
  if (tag4 === 'wOFF' || tag4 === 'wOF2') return false;
  if (b0 === 0x4d && b1 === 0x5a) return false; // MZ
  if (b0 === 0x3c) return false; // '<' HTML/SVG/XML
  // HTML com espaços em branco iniciais
  let idxTrim = 0;
  while (idxTrim < Math.min(32, buf.length) && (buf[idxTrim] === 0x20 || buf[idxTrim] === 0x09 || buf[idxTrim] === 0x0a || buf[idxTrim] === 0x0d)) {
    idxTrim++;
  }
  if (idxTrim < buf.length && buf[idxTrim] === 0x3c) return false;

  // Magic bytes aceitos: TTF (00 01 00 00 ou 'true') e OTF ('OTTO')
  const magic = buf.readUInt32BE(0);
  const magicValido = magic === 0x00010000 || magic === 0x74727565 || magic === 0x4f54544f;
  if (!magicValido) return false;

  // Diretório de tabelas SFNT: 12 bytes de cabeçalho + numTables * 16 bytes
  const numTables = buf.readUInt16BE(4);
  if (numTables === 0 || numTables > 512) return false;
  if (12 + numTables * 16 > buf.length) return false;

  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16;
    if (off + 16 > buf.length) return false;
    const tag = buf.toString('ascii', off, off + 4);
    if (tag === 'fvar') return false; // Variável incompatível com fontkit ^2.0.4
  }

  return true;
}

function unicodeRangeIncluiBasico(rangeStr) {
  if (!rangeStr || typeof rangeStr !== 'string') return true;
  const tokens = rangeStr.split(',').map(s => s.trim()).filter(Boolean);
  if (!tokens.length) return true;
  for (const tk of tokens) {
    const m = tk.match(/^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/i);
    if (!m) continue;
    let startHex = m[1];
    let endHex = m[2];
    if (startHex.includes('?') && !endHex) {
      endHex = startHex.replace(/\?/g, 'F');
      startHex = startHex.replace(/\?/g, '0');
    }
    const start = parseInt(startHex, 16);
    const end = endHex ? parseInt(endHex, 16) : start;
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if ((start <= 0x0000 && end >= 0x0000) || (start <= 0x0041 && end >= 0x0041)) return true;
  }
  return false;
}

function parseWeightSpec(raw) {
  const s = String(raw || '400').trim().toLowerCase();
  if (s === 'normal') return { weight: 400, weightMin: 400, weightMax: 400 };
  if (s === 'bold') return { weight: 700, weightMin: 700, weightMax: 700 };
  const parts = s.split(/\s+/).map(x => parseInt(x, 10)).filter(n => Number.isFinite(n) && n > 0);
  if (parts.length >= 2) {
    const min = Math.min(parts[0], parts[1]);
    const max = Math.max(parts[0], parts[1]);
    return { weight: min, weightMin: min, weightMax: max };
  }
  const w = parts[0] || 400;
  return { weight: w, weightMin: w, weightMax: w };
}

function parseSrcSources(srcVal) {
  const sources = [];
  const rx = /url\(\s*(['"]?)([^)'"]+)\1\s*\)(?:\s*format\(\s*(['"]?)([^)'"]+)\3\s*\))?/gi;
  let m;
  while ((m = rx.exec(srcVal)) !== null) {
    const url = String(m[2] || '').trim();
    const format = String(m[4] || '').trim().toLowerCase();
    if (/^https?:\/\//i.test(url)) {
      sources.push({ url, format });
    }
  }
  return sources;
}

function scoreSource(src) {
  if (!src) return -1;
  const f = src.format;
  const u = src.url.toLowerCase();
  if (f === 'truetype' || f === 'opentype') return 3;
  if (!f && /\.(ttf|otf)(\?|#|$)/i.test(u)) return 2;
  if (f === 'woff2' || f === 'woff' || /\.(woff2?|eot|svg)(\?|#|$)/i.test(u)) return -1;
  return 1;
}

/**
 * Parser estruturado bloco-a-bloco de @font-face { ... }.
 */
function parseCssFontFaces(css) {
  if (typeof css !== 'string' || !css.trim()) return [];
  const blocks = [];
  const faceRx = /@font-face\s*\{([^}]*)\}/gi;
  let m;
  while ((m = faceRx.exec(css)) !== null) {
    const body = m[1];
    const decl = prop => {
      const r = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i');
      const hit = body.match(r);
      return hit ? hit[1].trim() : '';
    };
    const family = decl('font-family').replace(/^['"]|['"]$/g, '').trim();
    const style = (decl('font-style') || 'normal').toLowerCase();
    const wSpec = parseWeightSpec(decl('font-weight') || '400');
    const unicodeRange = decl('unicode-range') || null;
    const srcRaw = decl('src');
    if (!srcRaw) continue;
    const sources = parseSrcSources(srcRaw);
    if (!sources.length) continue;

    // Escolhe melhor src dentro do bloco (priorizando truetype/opentype e .ttf/.otf)
    const sortedSrc = [...sources].sort((a, b) => scoreSource(b) - scoreSource(a));
    const melhor = sortedSrc[0];

    blocks.push({
      family,
      style,
      italico: style === 'italic' || style === 'oblique',
      weight: wSpec.weight,
      weightMin: wSpec.weightMin,
      weightMax: wSpec.weightMax,
      unicodeRange,
      includesBasicLatin: unicodeRangeIncluiBasico(unicodeRange),
      url: melhor.url,
      format: melhor.format,
      sources
    });
  }
  return blocks;
}

function selecionarBlocoCss(blocks, peso, italico) {
  if (!Array.isArray(blocks) || !blocks.length) return null;
  const p = clampPeso(peso);
  const it = Boolean(italico);

  const candidatos = blocks.filter(b => scoreSource({ url: b.url, format: b.format }) > 0);
  if (!candidatos.length) return null;

  const pontuar = b => {
    let score = 0;
    if (b.italico === it) score += 10000;
    else if (!b.italico && it) score += 2000;
    if (p >= b.weightMin && p <= b.weightMax) score += 5000;
    else score -= Math.min(1000, Math.abs(b.weight - p));
    if (!b.unicodeRange) score += 1000;
    else if (b.includesBasicLatin) score += 700;
    else score -= 500;
    score += scoreSource({ url: b.url, format: b.format }) * 50;
    return score;
  };

  return [...candidatos].sort((a, b) => pontuar(b) - pontuar(a))[0];
}

function isUrlPermitidaGoogle(urlStr, usingCustomFetcher) {
  if (typeof urlStr !== 'string') return false;
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    return false;
  }
  if (usingCustomFetcher) return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  return (
    host === 'fonts.googleapis.com' ||
    host === 'fonts.gstatic.com' ||
    host.endsWith('.gstatic.com') ||
    host.endsWith('.googleapis.com')
  );
}

async function fetchComTimeout(url, opts = {}) {
  const fetcher = typeof opts.fetcher === 'function' ? opts.fetcher : globalThis.fetch;
  if (typeof fetcher !== 'function') throw new Error('fetch indisponível');
  const usingCustom = typeof opts.fetcher === 'function';
  if (!isUrlPermitidaGoogle(url, usingCustom)) {
    throw new Error(`URL de fonte não permitida: ${url}`);
  }

  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : FETCH_TIMEOUT_MS;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error(`Timeout de ${timeoutMs}ms ao buscar fonte`)), timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();
  try {
    return await fetcher(url, {
      method: 'GET',
      headers: {
        'User-Agent': UA_SAFARI_TTF,
        Accept: 'text/css,*/*;q=0.1'
      },
      signal: ac.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

function buscarFonteLocal(familia, peso, italico, localDir = DIR_FONTES) {
  if (!localDir || !fs.existsSync(localDir)) return null;
  const semEsp = famSemEspacos(familia);
  const p = clampPeso(peso);

  const candidatos = italico
    ? [`${semEsp}-${p}-italic.ttf`, `${semEsp}-${p}-italic.otf`]
    : [`${semEsp}-${p}.ttf`, `${semEsp}-${p}.otf`];

  for (const nome of candidatos) {
    const full = path.join(localDir, nome);
    if (!isSafePathInside(localDir, full)) continue;
    try {
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        const buf = fs.readFileSync(full);
        if (validarBufferFonte(buf)) return { buffer: buf, file: full, origem: 'local' };
      }
    } catch {}
  }
  return null;
}

function fallbackLocal(familia, peso, localDir = DIR_FONTES) {
  if (!localDir || !fs.existsSync(localDir)) return null;
  const semEsp = famSemEspacos(familia);
  const p = clampPeso(peso);

  // 1) Mesmo família sem itálico no peso exato ou mais próximo
  try {
    const arquivos = fs.readdirSync(localDir).filter(f => /\.(ttf|otf)$/i.test(f));
    const daFamilia = arquivos
      .filter(f => f.startsWith(`${semEsp}-`))
      .map(f => {
        const m = f.match(/-(\d+)(?:-italic)?\.(ttf|otf)$/i);
        return { f, w: m ? parseInt(m[1], 10) : 400 };
      })
      .sort((a, b) => Math.abs(a.w - p) - Math.abs(b.w - p));

    for (const item of daFamilia) {
      const full = path.join(localDir, item.f);
      try {
        const buf = fs.readFileSync(full);
        if (validarBufferFonte(buf)) return { buffer: buf, file: full, aliasLocal: item.f.replace(/\.(ttf|otf)$/i, ''), origem: 'fallback-local' };
      } catch {}
    }

    // 2) Fontes seguras garantidas na pasta fonts/
    for (const pref of ['Archivo-400.ttf', 'WorkSans-400.ttf', 'Jost-500.ttf', 'Jost-300.ttf', ...arquivos]) {
      const full = path.join(localDir, pref);
      if (!isSafePathInside(localDir, full) || !fs.existsSync(full)) continue;
      try {
        const buf = fs.readFileSync(full);
        if (validarBufferFonte(buf)) return { buffer: buf, file: full, aliasLocal: pref.replace(/\.(ttf|otf)$/i, ''), origem: 'fallback-local' };
      } catch {}
    }
  } catch {}
  return null;
}

function buscarFonteCache(alias, cacheDir) {
  if (!cacheDir || !fs.existsSync(cacheDir)) return null;
  for (const ext of ['.ttf', '.otf']) {
    const full = path.join(cacheDir, `${alias}${ext}`);
    if (!isSafePathInside(cacheDir, full)) continue;
    try {
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        const buf = fs.readFileSync(full);
        if (validarBufferFonte(buf)) {
          try {
            const now = new Date();
            fs.utimesSync(full, now, now);
          } catch {}
          return { buffer: buf, file: full, origem: 'cache' };
        }
        // Arquivo corrompido no cache é descartado
        try { fs.unlinkSync(full); } catch {}
      }
    } catch {}
  }
  return null;
}

/**
 * Limpeza LRU por mtime quando o cache em disco ultrapassa o teto configurado.
 */
function limparCacheFontes(cacheDir, tetoBytes = TETO_CACHE_FONTES_BYTES) {
  if (!cacheDir || !fs.existsSync(cacheDir)) return;
  try {
    const agora = Date.now();
    const arquivos = [];
    for (const nome of fs.readdirSync(cacheDir)) {
      const full = path.join(cacheDir, nome);
      if (!isSafePathInside(cacheDir, full)) continue;
      try {
        const stat = fs.statSync(full);
        if (!stat.isFile()) continue;
        if (nome.endsWith('.tmp')) {
          if (agora - stat.mtimeMs > 5 * 60 * 1000) fs.unlinkSync(full);
          continue;
        }
        if (/\.(ttf|otf)$/i.test(nome)) {
          arquivos.push({ path: full, size: stat.size, mtime: stat.mtimeMs });
        }
      } catch {}
    }
    let total = arquivos.reduce((s, a) => s + a.size, 0);
    if (total <= tetoBytes) return;
    arquivos.sort((a, b) => a.mtime - b.mtime);
    for (const a of arquivos) {
      if (total <= tetoBytes * 0.75) break;
      try {
        fs.unlinkSync(a.path);
        total -= a.size;
      } catch {}
    }
  } catch {}
}

function ordenarTuplasItalWght(variantes) {
  const mapa = new Map();
  for (const v of variantes) {
    const ital = v.italico ? 1 : 0;
    const peso = clampPeso(v.peso);
    mapa.set(`${ital},${peso}`, { ital, peso });
  }
  return [...mapa.values()].sort((a, b) => (a.ital - b.ital) || (a.peso - b.peso));
}

function buildCss2Url(famGoogle, tuplas, usarItal) {
  const famEnc = encodeURIComponent(famGoogle).replace(/%20/g, '+');
  if (usarItal) {
    const ordered = ordenarTuplasItalWght(tuplas.map(t => ({ italico: t.ital === 1, peso: t.peso })));
    const spec = ordered.map(t => `${t.ital},${t.peso}`).join(';');
    return `https://fonts.googleapis.com/css2?family=${famEnc}:ital,wght@${spec}&display=swap`;
  }
  const pesos = [...new Set(tuplas.map(t => clampPeso(t.peso)))].sort((a, b) => a - b);
  return `https://fonts.googleapis.com/css2?family=${famEnc}:wght@${pesos.join(';')}&display=swap`;
}

async function baixarCssGoogle(famGoogle, variantes, opts = {}) {
  const tuplas = ordenarTuplasItalWght(variantes);
  const temItal = tuplas.some(t => t.ital === 1);

  if (temItal) {
    // Em lote, inclui (0,w) e (1,w) ordenados por (italic ASC, weight ASC)
    const tuplasComNormal = ordenarTuplasItalWght([
      ...variantes,
      ...variantes.filter(v => v.italico).map(v => ({ peso: v.peso, italico: false }))
    ]);
    const urlBatch = buildCss2Url(famGoogle, tuplasComNormal, true);
    const res = await fetchComTimeout(urlBatch, opts);
    if (res.ok) {
      const css = await res.text();
      return parseCssFontFaces(css);
    }
    if (res.status !== 400) {
      throw new Error(`Google Fonts CSS2 retornou HTTP ${res.status}`);
    }

    // Fallback individual quando a requisição em lote retornar HTTP 400 (família sem itálico)
    const blocos = [];
    const pesosUnicos = [...new Set(tuplas.map(t => t.peso))].sort((a, b) => a - b);
    for (const peso of pesosUnicos) {
      const precisaItal = tuplas.some(t => t.peso === peso && t.ital === 1);
      if (precisaItal) {
        try {
          const rIt = await fetchComTimeout(buildCss2Url(famGoogle, [{ ital: 0, peso }, { ital: 1, peso }], true), opts);
          if (rIt.ok) {
            blocos.push(...parseCssFontFaces(await rIt.text()));
            continue;
          }
        } catch {}
      }
      try {
        const rReg = await fetchComTimeout(buildCss2Url(famGoogle, [{ ital: 0, peso }], false), opts);
        if (rReg.ok) blocos.push(...parseCssFontFaces(await rReg.text()));
      } catch {}
    }
    return blocos;
  }

  const url = buildCss2Url(famGoogle, tuplas, false);
  const res = await fetchComTimeout(url, opts);
  if (!res.ok) throw new Error(`Google Fonts CSS2 retornou HTTP ${res.status}`);
  return parseCssFontFaces(await res.text());
}

async function baixarEValidarArquivoFonte(url, opts = {}) {
  const res = await fetchComTimeout(url, opts);
  if (!res.ok) throw new Error(`Download da fonte retornou HTTP ${res.status}`);
  const arr = await res.arrayBuffer();
  const buf = Buffer.from(arr);
  if (!validarBufferFonte(buf)) throw new Error('Buffer de fonte inválido ou variável (fvar)');
  return buf;
}

function gravarFonteNoCache(alias, buf, cacheDir, tetoBytes) {
  if (!cacheDir) return;
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    const ext = buf.toString('ascii', 0, 4) === 'OTTO' ? '.otf' : '.ttf';
    const destino = path.join(cacheDir, `${alias}${ext}`);
    if (!isSafePathInside(cacheDir, destino)) return;
    writeAtomicSync(destino, buf);
    limparCacheFontes(cacheDir, tetoBytes);
  } catch {}
}

/**
 * Obtém o buffer TTF/OTF de uma fonte através dos 3 níveis (local -> cache -> Google Fonts)
 * com deduplicação single-flight e fallback local resiliente.
 */
async function obterFonte(familia, peso = 400, italico = false, opts = {}) {
  const localDir = opts.localDir || DIR_FONTES;
  const cacheDir = opts.cacheDir || null;
  const famLimpa = normalizarFamilia(familia);
  const p = clampPeso(peso);
  const it = Boolean(italico);

  if (!famLimpa) {
    if (opts.strict) throw new Error('Nome de família de fonte inválido');
    const fb = fallbackLocal('Archivo', 400, localDir);
    if (!fb) throw new Error('Nenhuma fonte local disponível para fallback');
    return {
      alias: 'Archivo-400',
      familia: 'Archivo',
      peso: 400,
      italico: false,
      buffer: fb.buffer,
      origem: 'fallback-local',
      fallbackUsado: true
    };
  }

  const alias = aliasFonte(famLimpa, p, it);
  const flightKey = `${alias}|${cacheDir || ''}|${opts.fetcher ? 'mock' : 'net'}`;
  if (inFlight.has(flightKey)) return inFlight.get(flightKey);

  const prom = (async () => {
    // Nível 1: pasta local fonts/
    const localHit = buscarFonteLocal(famLimpa, p, it, localDir);
    if (localHit) {
      return { alias, familia: famLimpa, peso: p, italico: it, buffer: localHit.buffer, origem: 'local', fallbackUsado: false };
    }

    // Nível 2: cache persistente em disco
    const cacheHit = buscarFonteCache(alias, cacheDir);
    if (cacheHit) {
      return { alias, familia: famLimpa, peso: p, italico: it, buffer: cacheHit.buffer, origem: 'cache', fallbackUsado: false };
    }

    // Nível 3: Google Fonts CSS2 API
    if (!opts.offline) {
      try {
        const famGoogle = famParaGoogle(famLimpa);
        const blocos = await baixarCssGoogle(famGoogle, [{ peso: p, italico: it }], opts);
        const bloco = selecionarBlocoCss(blocos, p, it);
        if (bloco && bloco.url) {
          const buf = await baixarEValidarArquivoFonte(bloco.url, opts);
          gravarFonteNoCache(alias, buf, cacheDir, opts.tetoCacheBytes);
          return { alias, familia: famLimpa, peso: p, italico: it, buffer: buf, origem: 'google', fallbackUsado: false };
        }
      } catch {}
    }

    // Fallback resiliente offline -> fonte local
    const fb = fallbackLocal(famLimpa, p, localDir);
    if (fb) {
      return {
        alias,
        familia: famLimpa,
        peso: p,
        italico: it,
        buffer: fb.buffer,
        origem: 'fallback-local',
        fallbackUsado: true
      };
    }

    throw new Error(`Fonte indisponível: ${alias}`);
  })();

  inFlight.set(flightKey, prom);
  try {
    return await prom;
  } finally {
    inFlight.delete(flightKey);
  }
}

/**
 * Resolve em lote todas as fontes utilizadas em uma cena JSON v1, retornando um mapa
 * `{ [alias]: Buffer }` pronto para `doc.registerFont(alias, buf)`.
 */
async function resolverFontesCena(cena, opts = {}) {
  const localDir = opts.localDir || DIR_FONTES;
  const cacheDir = opts.cacheDir || null;
  const resolvidas = {};
  const setResolvida = (alias, buf) => {
    if (alias && buf && !['__proto__', 'constructor', 'prototype'].includes(alias)) {
      resolvidas[alias] = buf;
    }
  };

  // Garante fontes base de fallback sempre disponíveis
  for (const [f, w] of [['Archivo', 400], ['Jost', 500], ['Jost', 300]]) {
    try {
      const r = await obterFonte(f, w, false, { ...opts, offline: true });
      if (r && r.buffer) setResolvida(r.alias, r.buffer);
    } catch {}
  }

  // Coleta variantes únicas por família
  const porFamilia = new Map();
  const registrarPedido = (famRaw, pesoRaw, itRaw) => {
    const fam = normalizarFamilia(famRaw);
    if (!fam) return;
    const peso = clampPeso(pesoRaw);
    const italico = Boolean(itRaw);
    const key = famSemEspacos(fam);
    if (!porFamilia.has(key)) porFamilia.set(key, { fam, variantes: new Map() });
    porFamilia.get(key).variantes.set(`${peso}|${italico}`, { peso, italico });
  };

  if (opts.kit && opts.kit.fonte) {
    registrarPedido(opts.kit.fonte, 400, false);
    registrarPedido(opts.kit.fonte, 700, false);
  }

  for (const sl of (cena && Array.isArray(cena.slides) ? cena.slides : [])) {
    for (const c of (sl && Array.isArray(sl.camadas) ? sl.camadas : [])) {
      if (c && c.tipo === 'texto') {
        registrarPedido(c.fonte || 'Archivo', c.peso || 400, Boolean(c.italico));
      }
    }
  }

  for (const entry of porFamilia.values()) {
    const pendentes = [];
    for (const v of entry.variantes.values()) {
      const alias = aliasFonte(entry.fam, v.peso, v.italico);
      const localHit = buscarFonteLocal(entry.fam, v.peso, v.italico, localDir);
      if (localHit) {
        setResolvida(alias, localHit.buffer);
        continue;
      }
      const cacheHit = buscarFonteCache(alias, cacheDir);
      if (cacheHit) {
        setResolvida(alias, cacheHit.buffer);
        continue;
      }
      pendentes.push(v);
    }

    if (!pendentes.length) continue;

    let blocosCss = [];
    if (!opts.offline) {
      try {
        blocosCss = await baixarCssGoogle(famParaGoogle(entry.fam), pendentes, opts);
      } catch {
        blocosCss = [];
      }
    }

    const urlCache = new Map();
    for (const v of pendentes) {
      const alias = aliasFonte(entry.fam, v.peso, v.italico);
      let resolvido = null;
      if (blocosCss.length) {
        const bloco = selecionarBlocoCss(blocosCss, v.peso, v.italico);
        if (bloco && bloco.url) {
          try {
            let buf = urlCache.get(bloco.url);
            if (!buf) {
              buf = await baixarEValidarArquivoFonte(bloco.url, opts);
              urlCache.set(bloco.url, buf);
            }
            gravarFonteNoCache(alias, buf, cacheDir, opts.tetoCacheBytes);
            resolvido = buf;
          } catch {}
        }
      }
      if (!resolvido) {
        const resSingle = await obterFonte(entry.fam, v.peso, v.italico, opts).catch(() => null);
        if (resSingle && resSingle.buffer) resolvido = resSingle.buffer;
      }
      if (resolvido) setResolvida(alias, resolvido);
    }
  }

  return resolvidas;
}

module.exports = {
  aliasFonte,
  validarBufferFonte,
  parseCssFontFaces,
  limparCacheFontes,
  obterFonte,
  resolverFontesCena,
  UA_SAFARI_TTF,
  DIR_FONTES,
  TETO_CACHE_FONTES_BYTES
};
