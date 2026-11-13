/**
 * WhatsAppRouter — o elo entre a infraestrutura (WhatsAppSessionManager) e o domínio da BIGA.
 *
 * Para cada evento do Manager:
 *   1. extrai o tenantId;
 *   2. lê a configuração isolada do corretor (TenantStore) e monta o TenantContext;
 *   3. entrega ao domínio DAQUELE corretor (contêiner próprio, ver container.js), que responde
 *      pelo socket obtido em sessionManager.getSession(tenantId).
 */
const { createTenantContainer, buildTenantEnv } = require('./container');

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
    const ia = cfg.configIA || {};
    return Object.freeze({
      tenantId,
      nome: cfg.nome,
      dataDir: this.store.dataDir(tenantId),
      ia: Object.freeze({
        geminiApiKey: ia.geminiApiKey || '',
        geminiModel: ia.geminiModel || '',
        humanTraining: ia.humanTraining || '',
        messageTemplate: ia.messageTemplate || ''
      }),
      alertas: Object.freeze({ meuWhatsapp: ia.meuWhatsappAlerta || '' })
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
    if (old) {
      // Config mudou: aplica no domínio já carregado (env + settings), sem perder estado em memória
      Object.assign(old.container.env, buildTenantEnv({ baseEnv: process.env, dataDir: old.container.dataDir, configIA: cfg.configIA }));
      this._applySettings(old.container, cfg.configIA);
      return old;
    }
    const dataDir = this.store.dataDir(tenantId);
    const container = createTenantContainer({ tenantId, dataDir, env: buildTenantEnv({ baseEnv: process.env, dataDir, configIA: cfg.configIA }) });
    this._applySettings(container, cfg.configIA);
    const wa = container.require('whatsapp');
    const domain = { container, wa };
    this.domains.set(tenantId, domain);
    const sock = this.sm.getSession(tenantId);
    if (sock) this._bindSocket(tenantId, sock);
    if (this.startScheduler) container.require('scheduler').start(wa.api, wa.addLog);
    return domain;
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

  getAgentState(tenantId) {
    const d = this.domains.get(tenantId);
    return d ? d.wa.getAgentState() : null;
  }

  stopTenant(tenantId) {
    const d = this.domains.get(tenantId);
    if (!d) return;
    try {
      d.container.require('scheduler').stop();
      d.container.require('contacts').flush();
      d.container.require('radar').flush();
    } catch {}
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
