/**
 * Chaves no .env da BIGA (painel e "Mensagem para mim" usam o mesmo caminho).
 * Só chaves permitidas, sem quebra de linha, arquivo com permissão 600.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR, ROOT_DIR } = require('./paths');

const ENV_PATH = process.env.DATA_DIR ? path.join(DATA_DIR, '.env') : path.join(ROOT_DIR, '.env');
const ENV_ALLOWED = new Set(['GEMINI_API_KEY', 'GOOGLE_SHEETS_CSV_URL', 'GOOGLE_SHEETS_WEBHOOK_URL', 'MEU_WHATSAPP_ALERTA', 'BRAVE_API_KEY', 'GOOGLE_CSE_KEY', 'GOOGLE_CSE_CX', 'META_PAGE_TOKEN', 'META_PAGE_ID', 'META_IG_USER_ID', 'TAVILY_API_KEY', 'SERPER_API_KEY', 'BRAVE_SEARCH_API_KEY', 'APIFY_API_TOKEN']);

function updateEnvFile(updates) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) return;
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
  let changed = false;
  for (const [key, raw] of Object.entries(updates)) {
    if (!ENV_ALLOWED.has(key)) continue;
    const value = String(raw ?? '').replace(/[\r\n\0]/g, '').trim().slice(0, 500);
    process.env[key] = value;
    const rx = new RegExp(`^${key}=.*$`, 'm');
    content = rx.test(content) ? content.replace(rx, () => `${key}=${value}`) : `${content}\n${key}=${value}`;
    changed = true;
  }
  if (!changed && fs.existsSync(ENV_PATH)) return;
  const dir = path.dirname(ENV_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${ENV_PATH}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmp, content.trim() + '\n', { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmp, ENV_PATH);
    try { fs.chmodSync(ENV_PATH, 0o600); } catch {}
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    console.error('Aviso: não consegui gravar o .env:', err.message);
  }
}

module.exports = { updateEnvFile, ENV_PATH, ENV_ALLOWED };
