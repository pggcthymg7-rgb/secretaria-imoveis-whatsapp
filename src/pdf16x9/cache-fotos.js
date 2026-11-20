'use strict';
/**
 * Cache em disco de fotos reduzidas indexadas pelo hash SHA-256.
 * Redução: maior lado 1920 px, qualidade 78, rotação EXIF, flatten branco.
 * sharp.cache(false) e sharp.concurrency(1) mandatórios.
 * Teto de tamanho com limpeza LRU dos arquivos mais antigos.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let sharp = null;
try {
  sharp = require('sharp');
  sharp.cache(false);
  sharp.concurrency(1);
} catch {
  sharp = null;
}

const TETO_CACHE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_INPUT_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_INPUT_PIXELS = 40_000_000;
const LARGURA_MAX = 1920;
const QUALIDADE = 78;

function writeAtomicSync(targetPath, data) {
  const tmp = `${targetPath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, targetPath);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch {}
    throw err;
  }
}

function hashArquivo(caminhoOuBuffer) {
  const hash = crypto.createHash('sha256');
  if (Buffer.isBuffer(caminhoOuBuffer)) {
    if (caminhoOuBuffer.length > MAX_INPUT_BYTES) throw new Error('Arquivo de imagem excede o limite permitido');
    hash.update(caminhoOuBuffer);
  } else {
    const st = fs.statSync(caminhoOuBuffer);
    if (!st.isFile() || st.size > MAX_INPUT_BYTES) throw new Error('Arquivo de imagem excede o limite permitido');
    hash.update(fs.readFileSync(caminhoOuBuffer));
  }
  return hash.digest('hex');
}

function limparCacheSeNecessario(dirCache, tetoBytes = TETO_CACHE_BYTES) {
  if (!fs.existsSync(dirCache)) return;
  try {
    const agora = Date.now();
    const arquivos = [];
    for (const nome of fs.readdirSync(dirCache)) {
      const p = path.join(dirCache, nome);
      try {
        const stat = fs.statSync(p);
        if (!stat.isFile()) continue;
        if (nome.endsWith('.tmp')) {
          if (agora - stat.mtimeMs > 5 * 60 * 1000) fs.unlinkSync(p);
          continue;
        }
        arquivos.push({ path: p, size: stat.size, mtime: stat.mtimeMs });
      } catch {}
    }

    let total = arquivos.reduce((s, a) => s + a.size, 0);
    if (total <= tetoBytes) return;

    // Ordena do mais antigo para o mais novo
    arquivos.sort((a, b) => a.mtime - b.mtime);
    for (const a of arquivos) {
      if (total <= tetoBytes * 0.75) break; // reduz para 75% do teto
      try {
        fs.unlinkSync(a.path);
        total -= a.size;
      } catch {}
    }
  } catch {}
}

/**
 * Obtém ou reduz a foto para uso no PDF 16:9.
 * @param {string|Buffer} origem Caminho do arquivo ou Buffer
 * @param {string} dirCache Diretório para guardar o cache
 * @returns {Promise<{buf: Buffer, w: number, h: number, nome: string}|null>}
 */
async function obterFotoReduzida(origem, dirCache) {
  if (!sharp || !origem || !dirCache) return null;
  fs.mkdirSync(dirCache, { recursive: true });

  const nomeBase = typeof origem === 'string' ? path.basename(origem) : 'foto';
  let hash = '';
  try {
    hash = hashArquivo(origem);
  } catch {
    return null;
  }

  const arquivoCache = path.join(dirCache, `${hash}_${LARGURA_MAX}_q${QUALIDADE}.jpg`);
  const metaCache = path.join(dirCache, `${hash}_${LARGURA_MAX}_q${QUALIDADE}.json`);

  if (fs.existsSync(arquivoCache) && fs.existsSync(metaCache)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaCache, 'utf8'));
      const buf = fs.readFileSync(arquivoCache);
      if (meta && Number(meta.w) > 0 && Number(meta.h) > 0 && buf.length > 0) {
        // Atualiza mtime em ambos para LRU
        const now = new Date();
        try { fs.utimesSync(arquivoCache, now, now); } catch {}
        try { fs.utimesSync(metaCache, now, now); } catch {}
        return { buf, w: meta.w, h: meta.h, nome: nomeBase };
      }
    } catch {}
  }

  try {
    const entrada = typeof origem === 'string' ? fs.readFileSync(origem) : origem;
    const img = sharp(entrada, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).rotate();
    const { data, info } = await img
      .resize({ width: LARGURA_MAX, height: LARGURA_MAX, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: QUALIDADE, mozjpeg: true, chromaSubsampling: '4:2:0' })
      .toBuffer({ resolveWithObject: true });

    writeAtomicSync(arquivoCache, data);
    writeAtomicSync(metaCache, JSON.stringify({ w: info.width, h: info.height }));
    limparCacheSeNecessario(dirCache);

    return { buf: data, w: info.width, h: info.height, nome: nomeBase };
  } catch (err) {
    return null; // Foto corrompida ou ilegível -> espaço neutro
  }
}

module.exports = { hashArquivo, obterFotoReduzida, limparCacheSeNecessario, TETO_CACHE_BYTES };
