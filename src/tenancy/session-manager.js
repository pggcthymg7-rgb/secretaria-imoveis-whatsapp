/**
 * WhatsAppSessionManager — várias conexões Baileys no mesmo processo, uma por tenant (corretor).
 *
 * - Sessões em memória: Map<tenantId, Session>.
 * - Credenciais segregadas em <storageDir>/<tenantId> (useMultiFileAuthState).
 * - Reconexão com a mesma política do modo clássico (src/whatsapp-reconexao.js).
 * - Eventos (todos com tenantId no payload):
 *     'qr'         { tenantId, qr }
 *     'message'    { tenantId, messages, type }            (messages.upsert)
 *     'connection' { tenantId, connection, qr, statusCode }
 *     'socket'     { tenantId, sock }                      (socket novo criado/reconectado)
 *     'event'      { tenantId, name, payload }             (histórico, contatos, ligações, grupos)
 */
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const pino = require('pino');
const { reconnectDelay } = require('../whatsapp-reconexao');
const { validateTenantId, tenantPath } = require('./tenant-store');

const FORWARDED_EVENTS = ['messaging-history.set', 'chats.upsert', 'contacts.upsert', 'contacts.update', 'groups.upsert', 'call'];

class WhatsAppSessionManager extends EventEmitter {
  /**
   * @param {{ storageDir: string, baileys?: object, logger?: object, log?: (tenantId: string, msg: string) => void }} opts
   */
  constructor({ storageDir, baileys = require('@whiskeysockets/baileys'), logger = pino({ level: 'silent' }), log = null }) {
    super();
    this.storageDir = path.resolve(storageDir);
    this.baileys = baileys;
    this.logger = logger;
    this.log = log || ((tenantId, msg) => console.log(`[tenant:${tenantId}] ${msg}`));
    /** @type {Map<string, any>} */
    this.sessions = new Map();
    fs.mkdirSync(this.storageDir, { recursive: true, mode: 0o700 });
  }

  authDir(tenantId) {
    return tenantPath(this.storageDir, tenantId);
  }

  /**
   * Sobe (ou reaproveita) a conexão isolada do tenant.
   * @returns {Promise<{ tenantId: string, status: string }>}
   */
  async initializeTenant(tenantId, config = {}) {
    validateTenantId(tenantId);
    const existing = this.sessions.get(tenantId);
    if (existing && !existing.stopped) {
      existing.config = { ...existing.config, ...config };
      return this.getStatus(tenantId);
    }
    const session = { tenantId, config, sock: null, status: 'INICIANDO', qr: null, erro: null, attempts: 0, timer: null, stopped: false };
    this.sessions.set(tenantId, session);
    await this._tryConnect(session);
    return this.getStatus(tenantId);
  }

  /**
   * Abre a conexão sem nunca deixar o corretor travado em "Conectando…": se falhar
   * (pasta sem permissão, disco cheio, rede), mostra o motivo no painel e tenta de novo.
   */
  async _tryConnect(session) {
    try {
      await this._connect(session);
    } catch (err) {
      if (session.stopped) return;
      session.status = 'ERRO';
      session.erro = err.message;
      session.qr = null;
      this.log(session.tenantId, `Erro ao conectar: ${err.message}`);
      this._scheduleReconnect(session);
    }
  }

  async _connect(session) {
    const { tenantId } = session;
    const authDir = this.authDir(tenantId);
    fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });
    const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = this.baileys;
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch {}
    if (session.stopped) return;

    const sock = makeWASocket({ ...(version ? { version } : {}), auth: state, logger: this.logger, printQRInTerminal: false, syncFullHistory: false, markOnlineOnConnect: false });
    session.sock = sock;
    const isCurrent = () => session.sock === sock && !session.stopped && this.sessions.get(tenantId) === session;
    sock.ev.on('creds.update', saveCreds);
    this.emit('socket', { tenantId, sock });

    sock.ev.on('connection.update', update => {
      if (!isCurrent()) return;
      const { connection, qr, lastDisconnect } = update;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (qr || connection === 'open') session.erro = null;
      if (qr) {
        session.qr = qr;
        session.status = 'AGUARDANDO_QR_CODE';
        this.emit('qr', { tenantId, qr });
      }
      if (connection === 'open') {
        this.log(tenantId, 'Conectado ao WhatsApp.');
        session.qr = null;
        session.status = 'CONECTADO';
        session.attempts = 0;
      }
      this.emit('connection', { tenantId, connection, qr, statusCode });
      if (connection === 'close') {
        session.qr = null;
        session.status = 'DESCONECTADO';
        const motivo = lastDisconnect?.error?.message || 'sem detalhe';
        if (statusCode === DisconnectReason.restartRequired) this.log(tenantId, 'QR Code lido! Terminando de conectar...');
        else this.log(tenantId, `Conexão encerrada (código ${statusCode ?? '-'}): ${motivo}`);
        // Quedas que não são do ciclo normal do QR ficam visíveis no painel até conectar
        if (![DisconnectReason.restartRequired, DisconnectReason.timedOut].includes(statusCode)) session.erro = `código ${statusCode ?? '-'}: ${motivo}`;
        if (statusCode === DisconnectReason.loggedOut) {
          this.log(tenantId, 'Sessão encerrada no celular. Um novo QR Code será gerado.');
          fs.rmSync(authDir, { recursive: true, force: true });
          session.attempts = 0;
        }
        this._scheduleReconnect(session, statusCode);
      }
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (isCurrent()) this.emit('message', { tenantId, messages, type });
    });
    for (const name of FORWARDED_EVENTS) {
      sock.ev.on(name, payload => {
        if (isCurrent()) this.emit('event', { tenantId, name, payload });
      });
    }
  }

  _scheduleReconnect(session, statusCode) {
    if (session.timer || session.stopped) return;
    session.attempts++;
    const semSessao = !session.sock?.authState?.creds?.me;
    const delay = reconnectDelay(statusCode, session.attempts, semSessao);
    session.timer = setTimeout(() => {
      session.timer = null;
      if (session.stopped) return;
      this._tryConnect(session);
    }, delay);
    if (session.timer.unref) session.timer.unref();
  }

  /** Socket Baileys ativo do tenant (ou null) — é por ele que as respostas saem */
  getSession(tenantId) {
    return this.sessions.get(tenantId)?.sock || null;
  }

  getStatus(tenantId) {
    const s = this.sessions.get(tenantId);
    if (!s) return { tenantId, status: 'NAO_INICIADO', qr: null, erro: null };
    return { tenantId, status: s.status, qr: s.qr, erro: s.erro };
  }

  listTenants() {
    return [...this.sessions.keys()];
  }

  /** Desliga a conexão (mantém as credenciais no disco) */
  async stopTenant(tenantId) {
    const s = this.sessions.get(tenantId);
    if (!s) return false;
    s.stopped = true;
    clearTimeout(s.timer);
    this.sessions.delete(tenantId);
    try {
      s.sock?.end?.(undefined);
    } catch {}
    return true;
  }

  /** Desconecta, apaga as credenciais e gera um QR Code novo */
  async resetTenant(tenantId) {
    const s = this.sessions.get(tenantId);
    const config = s?.config || {};
    try {
      await s?.sock?.logout?.();
    } catch {}
    await this.stopTenant(tenantId);
    fs.rmSync(this.authDir(tenantId), { recursive: true, force: true });
    return this.initializeTenant(tenantId, config);
  }

  async stopAll() {
    await Promise.all(this.listTenants().map(id => this.stopTenant(id)));
  }
}

module.exports = { WhatsAppSessionManager, FORWARDED_EVENTS };
