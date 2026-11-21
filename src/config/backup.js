/**
 * ============================================================================
 * BACKUP E RESTAURAÇÃO DA MEMÓRIA
 * ============================================================================
 * Um único arquivo .json.gz com tudo que a secretária sabe: carteira, fotos,
 * configurações, contatos conhecidos, radar, vitrine, prospecção e métricas.
 *
 * NÃO inclui (de propósito):
 *  - a sessão do WhatsApp (auth_info_baileys): é presa ao aparelho; no servidor
 *    novo basta escanear o QR Code de novo;
 *  - auth.json (hash da senha e segredo das sessões do painel): no servidor novo
 *    a senha vem da variável PAINEL_SENHA.
 * ============================================================================
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { DATA_DIR, FOTOS_DIR } = require('./paths');

const FORMAT = 'secretaria-backup';
const VERSION = 1;
const DATA_FILES = [
  'settings.json',
  'imoveis.csv',
  'known_contacts.json',
  'contatos.json',
  'radar.json',
  'metricas.json',
  'ofertas_enviadas.json',
  'prospeccao.json',
  'vitrine.json',
  'agendador.json',
  'garimpo.json',
  'anuncios.json',
  'ancoras_grupos.json',
  'busca_historico.json',
  'fichas_pdf.json',
  'kit_marca.json',
  'fichas_16x9.json',
  'pdf_modelos.json',
  'capas.json'
];
const PHOTO_RX = /^[A-Za-z0-9._-]+\.(jpe?g|png|webp)$/i;
const MAX_BYTES = 200 * 1024 * 1024; // 200 MB descompactado

function listPhotos() {
  if (!fs.existsSync(FOTOS_DIR)) return [];
  return fs.readdirSync(FOTOS_DIR).filter(f => {
    if (!PHOTO_RX.test(f) || f.startsWith('.') || f.includes('..')) return false;
    try {
      const st = fs.lstatSync(path.join(FOTOS_DIR, f));
      return st.isFile() && !st.isSymbolicLink();
    } catch {
      return false;
    }
  });
}

/** Gera o backup (Buffer .json.gz) */
function createBackup({ incluirFotos = true } = {}) {
  const arquivos = {};
  for (const f of DATA_FILES) {
    const p = path.join(DATA_DIR, f);
    if (fs.existsSync(p)) arquivos[f] = fs.readFileSync(p).toString('base64');
  }
  const fotos = {};
  if (incluirFotos) for (const f of listPhotos()) fotos[f] = fs.readFileSync(path.join(FOTOS_DIR, f)).toString('base64');
  const payload = { formato: FORMAT, versao: VERSION, criadoEm: new Date().toISOString(), arquivos, fotos };
  return zlib.gzipSync(Buffer.from(JSON.stringify(payload)), { level: 6 });
}

function summary(buf) {
  const p = parseBackup(buf);
  return { criadoEm: p.criadoEm, arquivos: Object.keys(p.arquivos), fotos: Object.keys(p.fotos).length };
}

function parseBackup(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 20) throw Object.assign(new Error('Arquivo de backup vazio ou inválido.'), { status: 400 });
  let json;
  try {
    json = JSON.parse(zlib.gunzipSync(buf, { maxOutputLength: MAX_BYTES }).toString('utf-8'));
  } catch {
    throw Object.assign(new Error('Não é um backup da BIGA (arquivo corrompido ou de outro tipo).'), { status: 400 });
  }
  if (
    !json ||
    json.formato !== FORMAT ||
    !json.arquivos || typeof json.arquivos !== 'object' || Array.isArray(json.arquivos) ||
    !json.fotos || typeof json.fotos !== 'object' || Array.isArray(json.fotos)
  ) {
    throw Object.assign(new Error('Não é um backup da BIGA.'), { status: 400 });
  }
  if (json.versao > VERSION) throw Object.assign(new Error('Backup feito por uma versão mais nova da BIGA. Atualize antes de restaurar.'), { status: 400 });
  return json;
}

function atomicWrite(file, data, mode = 0o600) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  try {
    if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) {
      throw Object.assign(new Error(`Destino inválido (symlink): ${path.basename(file)}`), { status: 400 });
    }
  } catch (err) {
    if (err.status) throw err;
  }
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.restore.tmp`;
  try {
    fs.writeFileSync(tmp, data, { mode });
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    throw err;
  }
}

/**
 * Restaura um backup. Só grava nomes conhecidos (nada de caminhos arbitrários).
 * Retorna o resumo do que foi restaurado.
 */
function restoreBackup(buf) {
  const json = parseBackup(buf);
  const restored = { arquivos: [], fotos: 0, ignorados: [] };
  const dataRoot = path.resolve(DATA_DIR);
  const fotosRoot = path.resolve(FOTOS_DIR);
  for (const [name, b64] of Object.entries(json.arquivos)) {
    if (name === '__proto__' || name === 'constructor' || name === 'prototype' || !DATA_FILES.includes(name) || typeof b64 !== 'string') {
      restored.ignorados.push(name);
      continue;
    }
    const target = path.resolve(dataRoot, name);
    if (!target.startsWith(dataRoot + path.sep) || path.dirname(target) !== dataRoot) {
      restored.ignorados.push(name);
      continue;
    }
    const data = Buffer.from(b64, 'base64');
    if (name.endsWith('.json')) {
      try {
        JSON.parse(data.toString('utf-8'));
      } catch {
        restored.ignorados.push(name);
        continue;
      }
    }
    atomicWrite(target, data, 0o600);
    restored.arquivos.push(name);
  }
  if (!fs.existsSync(FOTOS_DIR)) fs.mkdirSync(FOTOS_DIR, { recursive: true });
  for (const [name, b64] of Object.entries(json.fotos)) {
    if (name === '__proto__' || name === 'constructor' || name === 'prototype' || !PHOTO_RX.test(name) || name.startsWith('.') || name.includes('..') || name !== path.basename(name) || typeof b64 !== 'string') {
      restored.ignorados.push(name);
      continue;
    }
    const target = path.resolve(fotosRoot, name);
    if (!target.startsWith(fotosRoot + path.sep) || path.dirname(target) !== fotosRoot) {
      restored.ignorados.push(name);
      continue;
    }
    atomicWrite(target, Buffer.from(b64, 'base64'), 0o644);
    restored.fotos++;
  }
  return { ...restored, criadoEm: json.criadoEm };
}

function backupFileName(date = new Date()) {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date);
  return `secretaria-backup-${d}.json.gz`;
}

module.exports = { createBackup, restoreBackup, parseBackup, summary, backupFileName, DATA_FILES };
