/**
 * Armazenamento persistente e isolado da configuração de cada corretor (substitui o
 * /etc/secretaria-<nome>.env do modelo de 1 processo por corretor).
 *
 * Layout em <baseDir>:
 *   tenants/<id>/config.json   -> { corretorId, nome, configIA, criadoEm, atualizadoEm } (permissão 600)
 *   tenants/<id>/data/         -> DATA_DIR do tenant (radar, contatos, settings.json, fotos...)
 *   sessions_storage/<id>/     -> credenciais do WhatsApp (Baileys) do tenant
 */
const fs = require('fs');
const path = require('path');

const TENANT_ID_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;
const httpsUrl = v => /^https:\/\/[^\s]+$/i.test(v);

// Campos aceitos em configIA: [tipo, tamanho máximo, validação extra]
const CONFIG_FIELDS = {
  geminiApiKey: ['string', 200, v => /^[\w-]*$/.test(v)],
  geminiModel: ['string', 80, v => /^[\w.-]*$/.test(v)],
  humanTraining: ['string', 5000],
  messageTemplate: ['string', 5000],
  meuWhatsappAlerta: ['string', 20, v => /^\d*$/.test(v)],
  gruposMonitorados: ['string', 2000],
  modoApenasAvisar: ['boolean'],
  googleSheetsCsvUrl: ['string', 500, v => !v || httpsUrl(v)],
  googleSheetsWebhookUrl: ['string', 500, v => !v || httpsUrl(v)]
};
const SECRET_FIELDS = new Set(['geminiApiKey']);

class TenantValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

function validateTenantId(id) {
  if (typeof id !== 'string' || !TENANT_ID_RE.test(id)) throw new TenantValidationError('corretorId inválido (use 2–32 caracteres: a-z, 0-9 e hífen).');
  return id;
}

function normalizeNome(nome) {
  if (typeof nome !== 'string' || !nome.trim() || nome.length > 80) throw new TenantValidationError('nome é obrigatório (até 80 caracteres).');
  return nome.replace(/[\r\n\t]/g, ' ').trim();
}

/** Mantém só campos conhecidos, com tipo e tamanho válidos */
function normalizeConfigIA(raw = {}) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new TenantValidationError('configIA deve ser um objeto.');
  const out = {};
  for (const [field, value] of Object.entries(raw)) {
    const spec = CONFIG_FIELDS[field];
    if (!spec) throw new TenantValidationError(`configIA.${field} não é um campo aceito.`);
    const [type, max, check] = spec;
    if (typeof value !== type) throw new TenantValidationError(`configIA.${field} deve ser ${type}.`);
    const v = type === 'string' ? value.trim() : value;
    if (type === 'string' && (v.length > max || (field !== 'humanTraining' && field !== 'messageTemplate' && /[\r\n]/.test(v)))) {
      throw new TenantValidationError(`configIA.${field} é inválido ou longo demais.`);
    }
    if (check && !check(v)) throw new TenantValidationError(`configIA.${field} tem formato inválido.`);
    out[field] = v;
  }
  return out;
}

function writePrivateJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmp, file);
}

class TenantStore {
  /** @param {string} baseDir pasta raiz de dados do processo hospedeiro */
  constructor(baseDir) {
    this.baseDir = path.resolve(baseDir);
    this.tenantsDir = path.join(this.baseDir, 'tenants');
    this.sessionsDir = path.join(this.baseDir, 'sessions_storage');
    fs.mkdirSync(this.tenantsDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(this.sessionsDir, { recursive: true, mode: 0o700 });
  }

  tenantDir(id) {
    return path.join(this.tenantsDir, validateTenantId(id));
  }

  dataDir(id) {
    return path.join(this.tenantDir(id), 'data');
  }

  sessionDir(id) {
    return path.join(this.sessionsDir, validateTenantId(id));
  }

  /** Cria ou atualiza o corretor. configIA parcial é mesclado ao que já existia. */
  save(id, { nome, configIA = {} } = {}) {
    validateTenantId(id);
    const clean = { nome: normalizeNome(nome), configIA: normalizeConfigIA(configIA) };
    const dir = this.tenantDir(id);
    fs.mkdirSync(path.join(dir, 'data'), { recursive: true, mode: 0o700 });
    const prev = this.get(id);
    const now = new Date().toISOString();
    const record = {
      corretorId: id,
      nome: clean.nome,
      configIA: { ...(prev?.configIA || {}), ...clean.configIA },
      ativo: prev?.ativo !== false,
      criadoEm: prev?.criadoEm || now,
      atualizadoEm: now
    };
    writePrivateJson(path.join(dir, 'config.json'), record);
    return record;
  }

  /** Liga/desliga o corretor (desligado não é religado na partida do processo) */
  setAtivo(id, ativo) {
    const rec = this.get(id);
    if (!rec) return null;
    const next = { ...rec, ativo: Boolean(ativo), atualizadoEm: new Date().toISOString() };
    writePrivateJson(path.join(this.tenantDir(id), 'config.json'), next);
    return next;
  }

  /** @returns {null | { corretorId: string, nome: string, configIA: object, criadoEm: string, atualizadoEm: string }} */
  get(id) {
    const file = path.join(this.tenantDir(id), 'config.json');
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
      return null;
    }
  }

  list() {
    return fs
      .readdirSync(this.tenantsDir)
      .filter(id => TENANT_ID_RE.test(id) && fs.existsSync(path.join(this.tenantsDir, id, 'config.json')))
      .sort();
  }

  /** Versão segura para resposta HTTP/log (sem segredos) */
  static publicView(record) {
    if (!record) return null;
    const configIA = {};
    for (const [k, v] of Object.entries(record.configIA || {})) {
      if (SECRET_FIELDS.has(k)) configIA[`has${k[0].toUpperCase()}${k.slice(1)}`] = Boolean(v);
      else configIA[k] = v;
    }
    return { ...record, configIA };
  }
}

module.exports = { TenantStore, TenantValidationError, validateTenantId, normalizeConfigIA, CONFIG_FIELDS };
