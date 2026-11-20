/**
 * Armazenamento JSON simples com escrita atômica (grava em .tmp e renomeia),
 * evitando arquivos corrompidos se o processo cair no meio da gravação.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dataPath } = require('./paths');

function readJson(name, fallback) {
  const file = path.isAbsolute(name) ? name : dataPath(name);
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    console.error(`[store] Erro ao ler ${path.basename(file)}: ${err.message}`);
  }
  return typeof fallback === 'function' ? fallback() : fallback;
}

function writeJson(name, data, { mode } = {}) {
  const file = path.isAbsolute(name) ? name : dataPath(name);
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const opts = mode !== undefined ? { encoding: 'utf-8', mode } : 'utf-8';
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), opts);
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {}
    throw err;
  }
}

module.exports = { readJson, writeJson };
