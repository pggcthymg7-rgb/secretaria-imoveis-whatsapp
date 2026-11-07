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
const LARGURA_MAX = 1920;
const QUALIDADE = 78;

function hashArquivo(caminhoOuBuffer) {
  const hash = crypto.createHash('sha256');
  if (Buffer.isBuffer(caminhoOuBuffer)) {
    hash.update(caminhoOuBuffer);
  } else {
    hash.update(fs.readFileSync(caminhoOuBuffer));
  }
  return hash.digest('hex');
}

function limparCacheSeNecessario(dirCache, tetoBytes = TETO_CACHE_BYTES) {
  if (!fs.existsSync(dirCache)) return;
  try {
    const arquivos = fs.readdirSync(dirCache).map(nome => {
      const p = path.join(dirCache, nome);
      try {
        const stat = fs.statSync(p);
        return { path: p, size: stat.size, mtime: stat.mtimeMs };
      } catch {
        return null;
      }
    }).filter(Boolean);

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
  if (!sharp) return null;
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
      // Atualiza mtime para LRU
      fs.utimesSync(arquivoCache, new Date(), new Date());
      return { buf, w: meta.w, h: meta.h, nome: nomeBase };
    } catch {}
  }

  try {
    const entrada = typeof origem === 'string' ? fs.readFileSync(origem) : origem;
    const img = sharp(entrada, { failOn: 'error' }).rotate();
    const { data, info } = await img
      .resize({ width: LARGURA_MAX, height: LARGURA_MAX, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: QUALIDADE, mozjpeg: true, chromaSubsampling: '4:2:0' })
      .toBuffer({ resolveWithObject: true });

    fs.writeFileSync(arquivoCache, data);
    fs.writeFileSync(metaCache, JSON.stringify({ w: info.width, h: info.height }));
    limparCacheSeNecessario(dirCache);

    return { buf: data, w: info.width, h: info.height, nome: nomeBase };
  } catch (err) {
    return null; // Foto corrompida ou ilegível -> espaço neutro
  }
}

module.exports = { hashArquivo, obterFotoReduzida, limparCacheSeNecessario, TETO_CACHE_BYTES };
