/**
 * WhatsAppSessionManager — várias conexões Baileys no mesmo processo, uma por tenant (corretor).
 *
 * - Sessões em memória: Map<tenantId, Session>.
 * - Credenciais segregadas em <storageDir>/<tenantId> (useMultiFileAuthState).
 * - Reconexão com a mesma política do modo clássico (src/whatsapp/reconexao.js).
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
const { reconnectDelay } = require('../whatsapp/reconexao');
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
    /** @type {Map<string, Promise<any>>} */
    this._locks = new Map();
    fs.mkdirSync(this.storageDir, { recursive: true, mode: 0o700 });
  }

  authDir(tenantId) {
    return tenantPath(this.storageDir, tenantId);
  }

  _withLock(tenantId, fn) {
    const prev = this._locks.get(tenantId) || Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => {});
    this._locks.set(tenantId, tail);
    tail.finally(() => {
      if (this._locks.get(tenantId) === tail) this._locks.delete(tenantId);
    });
    return run;
  }

  _cleanupSocket(sock) {
    if (!sock) return;
    try {
      sock.end?.(undefined);
    } catch {}
    try {
      sock.ev?.removeAllListeners?.();
    } catch {}
  }

  /**
   * Sobe (ou reaproveita) a conexão isolada do tenant.
   * @returns {Promise<{ tenantId: string, status: string }>}
   */
  async initializeTenant(tenantId, config = {}) {
    validateTenantId(tenantId);
    return this._withLock(tenantId, () => this._initializeLocked(tenantId, config));
  }

  async _initializeLocked(tenantId, config = {}) {
    const existing = this.sessions.get(tenantId);
    if (existing && !existing.stopped) {
      existing.config = { ...existing.config, ...config };
      return this.getStatus(tenantId);
    }
    const session = { tenantId, config, sock: null, status: 'INICIANDO', qr: null, attempts: 0, timer: null, stopped: false };
    this.sessions.set(tenantId, session);
    try {
      await this._connect(session);
    } catch (err) {
      session.stopped = true;
      clearTimeout(session.timer);
      session.timer = null;
      this._cleanupSocket(session.sock);
      session.sock = null;
      if (this.sessions.get(tenantId) === session) this.sessions.delete(tenantId);
      throw err;
    }
    return this.getStatus(tenantId);
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
    if (session.stopped || this.sessions.get(tenantId) !== session) return;

    const prevSock = session.sock;
    const sock = makeWASocket({ ...(version ? { version } : {}), auth: state, logger: this.logger, printQRInTerminal: false, syncFullHistory: false, markOnlineOnConnect: false });
    session.sock = sock;
    if (prevSock && prevSock !== sock) this._cleanupSocket(prevSock);
    const isCurrent = () => session.sock === sock && !session.stopped && this.sessions.get(tenantId) === session;
    sock.ev.on('creds.update', saveCreds);
    this.emit('socket', { tenantId, sock });

    sock.ev.on('connection.update', update => {
      if (!isCurrent()) return;
      const { connection, qr, lastDisconnect } = update;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (qr) {
        session.qr = qr;
        session.status = 'AGUARDANDO_QR_CODE';
        this.emit('qr', { tenantId, qr });
      }
      if (connection === 'open') {
        session.qr = null;
        session.status = 'CONECTADO';
        session.attempts = 0;
      }
      this.emit('connection', { tenantId, connection, qr, statusCode });
      if (connection === 'close') {
        session.qr = null;
        session.status = 'DESCONECTADO';
        if (statusCode === DisconnectReason.loggedOut) {
          this.log(tenantId, 'Sessão encerrada no celular. Um novo QR Code será gerado.');
          fs.rmSync(authDir, { recursive: true, force: true });
          session.attempts = 0;
        }
        this._cleanupSocket(sock);
        if (session.sock === sock) session.sock = null;
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
    if (session.timer || session.stopped || this.sessions.get(session.tenantId) !== session) return;
    session.attempts++;
    const semSessao = !session.sock?.authState?.creds?.me;
    const delay = reconnectDelay(statusCode, session.attempts, semSessao);
    session.timer = setTimeout(() => {
      session.timer = null;
      if (session.stopped || this.sessions.get(session.tenantId) !== session) return;
      this._connect(session).catch(err => {
        this.log(session.tenantId, `Erro ao reconectar: ${err.message}`);
        this._scheduleReconnect(session, null);
      });
    }, delay);
    if (session.timer.unref) session.timer.unref();
  }

  /** Socket Baileys ativo do tenant (ou null) — é por ele que as respostas saem */
  getSession(tenantId) {
    return this.sessions.get(tenantId)?.sock || null;
  }

  getStatus(tenantId) {
    const s = this.sessions.get(tenantId);
    if (!s) return { tenantId, status: 'NAO_INICIADO', qr: null };
    return { tenantId, status: s.status, qr: s.qr };
  }

  listTenants() {
    return [...this.sessions.keys()];
  }

  /** Desliga a conexão (mantém as credenciais no disco) */
  async stopTenant(tenantId) {
    validateTenantId(tenantId);
    return this._withLock(tenantId, () => this._stopLocked(tenantId));
  }

  _stopLocked(tenantId) {
    const s = this.sessions.get(tenantId);
    if (!s) return false;
    s.stopped = true;
    clearTimeout(s.timer);
    s.timer = null;
    this.sessions.delete(tenantId);
    this._cleanupSocket(s.sock);
    s.sock = null;
    return true;
  }

  /** Desconecta, apaga as credenciais e gera um QR Code novo */
  async resetTenant(tenantId) {
    validateTenantId(tenantId);
    return this._withLock(tenantId, async () => {
      const s = this.sessions.get(tenantId);
      const config = s?.config || {};
      if (s) s.stopped = true; // impede reconexão enquanto logout está em andamento
      clearTimeout(s?.timer);
      if (s) s.timer = null;
      try {
        await s?.sock?.logout?.();
      } catch {}
      this._stopLocked(tenantId);
      fs.rmSync(this.authDir(tenantId), { recursive: true, force: true });
      return this._initializeLocked(tenantId, config);
    });
  }

  async stopAll() {
    await Promise.all(this.listTenants().map(id => this.stopTenant(id)));
  }
}

module.exports = { WhatsAppSessionManager, FORWARDED_EVENTS };
