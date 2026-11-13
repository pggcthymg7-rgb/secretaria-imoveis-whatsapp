/**
 * WhatsAppRouter — o elo entre a infraestrutura (WhatsAppSessionManager) e o domínio da BIGA.
 *
 * Para cada evento do Manager:
 *   1. extrai o tenantId;
 *   2. lê a configuração isolada do corretor (TenantStore) e monta o TenantContext;
 *   3. entrega ao domínio DAQUELE corretor (contêiner próprio, ver container.js), que responde
 *      pelo socket obtido em sessionManager.getSession(tenantId).
 */
const { createTenantContainer, buildTenantEnv, CONFIG_TO_ENV } = require('./container');

/**
 * @typedef {Object} TenantContext
 * @property {string} tenantId
 * @property {string} nome
 * @property {string} dataDir
 * @property {{ geminiApiKey: string, geminiModel: string, humanTraining: string, messageTemplate: string }} ia
 * @property {{ meuWhatsapp: string }} alertas
 */

// configIA -> settings.json do tenant (persona e regras que o domínio já lê via loadSettings)
const CONFIG_TO_SETTINGS = ['humanTraining', 'messageTemplate', 'meuWhatsappAlerta', 'gruposMonitorados', 'modoApenasAvisar'];

class WhatsAppRouter {
  /**
   * @param {{ sessionManager: import('./session-manager').WhatsAppSessionManager, tenantStore: import('./tenant-store').TenantStore, startScheduler?: boolean }} opts
   */
  constructor({ sessionManager, tenantStore, startScheduler = true }) {
    this.sm = sessionManager;
    this.store = tenantStore;
    this.startScheduler = startScheduler;
    /** @type {Map<string, { container: object, wa: object }>} */
    this.domains = new Map();
    this._attached = false;
  }

  attach() {
    if (this._attached) return this;
    this._attached = true;
    this.sm.on('socket', ({ tenantId, sock }) => this._safe(tenantId, () => this._bindSocket(tenantId, sock)));
    this.sm.on('connection', ({ tenantId, connection, qr }) => this._safe(tenantId, () => this.domain(tenantId).wa.onConnectionState({ connection, qr })));
    this.sm.on('message', payload => this._safe(payload.tenantId, () => this.onMessage(payload)));
    this.sm.on('event', ({ tenantId, name, payload }) => this._safe(tenantId, () => this.domain(tenantId).wa.DOMAIN_EVENTS[name]?.(payload)));
    return this;
  }

  /** @returns {TenantContext} */
  buildTenantContext(tenantId) {
    const cfg = this.store.get(tenantId);
    if (!cfg) throw new Error(`Corretor ${tenantId} não cadastrado.`);
    // Configuração que VALE (o corretor pode ter mudado no painel dele depois do cadastro)
    const { container } = this.domain(tenantId);
    const env = container.env;
    const s = container.require('settings').loadSettings();
    return Object.freeze({
      tenantId,
      nome: cfg.nome,
      dataDir: this.store.dataDir(tenantId),
      ia: Object.freeze({
        geminiApiKey: String(env.GEMINI_API_KEY || '').trim(),
        geminiModel: String(env.GEMINI_MODEL || '').trim(),
        humanTraining: s.humanTraining || '',
        messageTemplate: s.messageTemplate || ''
      }),
      alertas: Object.freeze({ meuWhatsapp: s.meuWhatsappAlerta || '' })
    });
  }

  /**
   * Cria (ou recria, após mudança de config) o domínio isolado do tenant.
   * Chamado pela rota de cadastro ANTES de initializeTenant, para o socket já encontrar o domínio.
   */
  prepareTenant(tenantId) {
    const cfg = this.store.get(tenantId);
    if (!cfg) throw new Error(`Corretor ${tenantId} não cadastrado.`);
    const old = this.domains.get(tenantId);
    if (old) return old;
    const dataDir = this.store.dataDir(tenantId);
    const container = createTenantContainer({
      tenantId,
      dataDir,
      env: buildTenantEnv({ baseEnv: process.env, dataDir, configIA: cfg.configIA, tenantId }),
      onExit: () => setImmediate(() => this.reloadTenant(tenantId).catch(err => console.error(`[tenant:${tenantId}] recarga falhou: ${err.message}`)))
    });
    const wa = container.require('whatsapp');
    const domain = { container, wa, app: null };
    this.domains.set(tenantId, domain);
    const sock = this.sm.getSession(tenantId);
    if (sock) {
      this._bindSocket(tenantId, sock);
      if (this.sm.getStatus(tenantId).status === 'CONECTADO') wa.onConnectionState({ connection: 'open' }).catch(() => {});
    }
    if (this.startScheduler) container.require('scheduler').start(wa.api, wa.addLog);
    return domain;
  }

  /**
   * Configuração inicial vinda do cadastro do administrador: grava NA BIGA do corretor
   * (.env e settings.json dele). Depois disso o corretor pode mudar tudo no painel dele;
   * só um novo "salvar" do administrador sobrescreve de novo.
   */
  applyConfig(tenantId, configIA = {}) {
    const { container } = this.domain(tenantId);
    const keys = {};
    for (const [field, envKey] of Object.entries(CONFIG_TO_ENV)) if (typeof configIA[field] === 'string' && configIA[field]) keys[envKey] = configIA[field];
    if (Object.keys(keys).length) container.require('envfile').updateEnvFile(keys);
    if (configIA.geminiModel) container.env.GEMINI_MODEL = configIA.geminiModel; // não é chave do .env
    this._applySettings(container, configIA);
  }

  /** App web (painel + API) da BIGA do corretor — mesmo código do admin, papel 'corretor' */
  tenantApp(tenantId) {
    const d = this.domain(tenantId);
    if (!d.app) d.app = d.container.require('app').app;
    return d.app;
  }

  /** Recarrega a BIGA do corretor do disco (ex.: depois de restaurar backup), sem tocar nos outros */
  async reloadTenant(tenantId) {
    this.stopTenant(tenantId, { flush: false });
    if (!this.store.get(tenantId) || this.store.get(tenantId).ativo === false) return null;
    return this.prepareTenant(tenantId);
  }

  domain(tenantId) {
    return this.domains.get(tenantId) || this.prepareTenant(tenantId);
  }

  _applySettings(container, configIA = {}) {
    const updates = {};
    for (const k of CONFIG_TO_SETTINGS) if (configIA[k] !== undefined && configIA[k] !== '') updates[k] = configIA[k];
    if (Object.keys(updates).length) container.require('settings').saveSettings(updates);
  }

  _bindSocket(tenantId, sock) {
    this.domain(tenantId).wa.useSocket(sock, { reset: () => this.sm.resetTenant(tenantId) });
  }

  /** Mensagem nova de um tenant -> TenantContext -> domínio da BIGA daquele corretor */
  async onMessage({ tenantId, messages, type }) {
    const ctx = this.buildTenantContext(tenantId);
    const { wa } = this.domain(tenantId);
    // A resposta sai pela sessão do próprio tenant (nunca pela de outro corretor)
    const sock = this.sm.getSession(tenantId);
    if (!sock) throw new Error('sessão do WhatsApp indisponível');
    wa.useSocket(sock, { reset: () => this.sm.resetTenant(tenantId) });
    await wa.onMessagesUpsert({ messages, type }, ctx);
  }

  /** Configuração que está valendo no domínio do tenant (settings.json + env), para o painel */
  efetivo(tenantId) {
    const d = this.domains.get(tenantId);
    if (!d) return null;
    const s = d.container.require('settings').loadSettings();
    const env = d.container.env;
    return {
      meuWhatsappAlerta: s.meuWhatsappAlerta || '',
      modoApenasAvisar: Boolean(s.modoApenasAvisar),
      humanTraining: s.humanTraining || '',
      googleSheetsCsvUrl: env.GOOGLE_SHEETS_CSV_URL || '',
      hasGeminiApiKey: Boolean(String(env.GEMINI_API_KEY || '').trim())
    };
  }

  getAgentState(tenantId) {
    const d = this.domains.get(tenantId);
    return d ? d.wa.getAgentState() : null;
  }

  stopTenant(tenantId, { flush = true } = {}) {
    const d = this.domains.get(tenantId);
    if (!d) return;
    try {
      d.container.require('scheduler').stop();
      if (flush) {
        d.container.require('contacts').flush();
        d.container.require('radar').flush();
      }
    } catch {}
    d.container.dispose();
    this.domains.delete(tenantId);
  }

  async _safe(tenantId, fn) {
    try {
      await fn();
    } catch (err) {
      const d = this.domains.get(tenantId);
      if (d) d.wa.addLog('ERRO', `[tenant ${tenantId}] ${err.message}`);
      else console.error(`[tenant:${tenantId}] ${err.message}`);
    }
  }
}

module.exports = { WhatsAppRouter, CONFIG_TO_SETTINGS };
