/**
 * Armazenamento JSON simples com escrita atômica (grava em .tmp e renomeia),
 * evitando arquivos corrompidos se o processo cair no meio da gravação.
 */
const fs = require('fs');
const path = require('path');
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

function writeJson(name, data) {
  const file = path.isAbsolute(name) ? name : dataPath(name);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}

module.exports = { readJson, writeJson };
