/**
 * Chaves no .env da BIGA (painel e "Mensagem para mim" usam o mesmo caminho).
 * Só chaves permitidas, sem quebra de linha, arquivo com permissão 600.
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR, ROOT_DIR } = require('./paths');

const ENV_PATH = process.env.DATA_DIR ? path.join(DATA_DIR, '.env') : path.join(ROOT_DIR, '.env');
const ENV_ALLOWED = new Set(['GEMINI_API_KEY', 'GOOGLE_SHEETS_CSV_URL', 'GOOGLE_SHEETS_WEBHOOK_URL', 'MEU_WHATSAPP_ALERTA', 'BRAVE_API_KEY', 'GOOGLE_CSE_KEY', 'GOOGLE_CSE_CX', 'META_PAGE_TOKEN', 'META_PAGE_ID', 'META_IG_USER_ID']);

function updateEnvFile(updates) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
  for (const [key, raw] of Object.entries(updates)) {
    if (!ENV_ALLOWED.has(key)) continue;
    const value = String(raw).replace(/[\r\n]/g, '').trim().slice(0, 500);
    process.env[key] = value;
    const rx = new RegExp(`^${key}=.*$`, 'm');
    content = rx.test(content) ? content.replace(rx, () => `${key}=${value}`) : `${content}\n${key}=${value}`;
  }
  try {
    fs.writeFileSync(ENV_PATH, content.trim() + '\n', { encoding: 'utf-8', mode: 0o600 });
  } catch (err) {
    console.error('Aviso: não consegui gravar o .env:', err.message);
  }
}

module.exports = { updateEnvFile, ENV_PATH, ENV_ALLOWED };
