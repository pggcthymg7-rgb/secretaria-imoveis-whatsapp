// Isola os testes: dados em pasta temporária, sem Gemini, sem planilha real
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'secretaria-test-'));
process.env.DATA_DIR = tmp;
process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = '';
process.env.GOOGLE_SHEETS_WEBHOOK_URL = '';
process.env.GOOGLE_SHEETS_CSV_URL = '';
process.env.PAINEL_SENHA = 'senha-de-teste-123';
process.env.SESSION_SECRET = 'segredo-de-teste';

const { normalizePropertyRecord } = require('../src/sheets');

function prop(fields) {
  return normalizePropertyRecord({ ativo: true, ...fields });
}

module.exports = { tmp, prop };
