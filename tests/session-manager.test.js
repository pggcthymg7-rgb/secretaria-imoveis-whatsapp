// WhatsAppSessionManager: uma falha ao abrir a conexão não pode travar o corretor em "Conectando…"
const { tmp } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { EventEmitter } = require('events');
const { WhatsAppSessionManager } = require('../src/tenancy/session-manager');

function fakeBaileys() {
  const ctl = { falhar: 0, sockets: [] };
  ctl.baileys = {
    default: () => {
      const s = { ev: new EventEmitter(), authState: { creds: {} }, end() {} };
      ctl.sockets.push(s);
      return s;
    },
    useMultiFileAuthState: async () => {
      if (ctl.falhar > 0) {
        ctl.falhar--;
        throw new Error('EACCES: permissão negada');
      }
      return { state: {}, saveCreds() {} };
    },
    fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0] }),
    DisconnectReason: { loggedOut: 401, timedOut: 408, restartRequired: 515 }
  };
  return ctl;
}
const quiet = () => {};
const esperar = async (cond, ms = 8000) => {
  const fim = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fim) throw new Error('tempo esgotado');
    await new Promise(r => setTimeout(r, 50));
  }
};

test('Falha ao abrir a conexão: mostra ERRO com o motivo e tenta de novo sozinho', { timeout: 15000 }, async () => {
  const ctl = fakeBaileys();
  ctl.falhar = 1;
  const sm = new WhatsAppSessionManager({ storageDir: path.join(tmp, 'sm-1'), baileys: ctl.baileys, log: quiet });
  try {
    const st = await sm.initializeTenant('giovana');
    assert.equal(st.status, 'ERRO');
    assert.match(st.erro, /EACCES/);
    await esperar(() => ctl.sockets.length === 1);
    ctl.sockets[0].ev.emit('connection.update', { qr: 'QR-GIOVANA' });
    assert.equal(sm.getStatus('giovana').status, 'AGUARDANDO_QR_CODE');
    assert.equal(sm.getStatus('giovana').erro, null);
  } finally {
    await sm.stopAll();
  }
});

test('Reconexão logo após ler o QR (515) que falha não para de tentar', { timeout: 20000 }, async () => {
  const ctl = fakeBaileys();
  const sm = new WhatsAppSessionManager({ storageDir: path.join(tmp, 'sm-2'), baileys: ctl.baileys, log: quiet });
  try {
    await sm.initializeTenant('giovana');
    ctl.falhar = 1;
    ctl.sockets[0].ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 515 } } } });
    await esperar(() => ctl.sockets.length === 2, 15000);
    ctl.sockets[1].ev.emit('connection.update', { connection: 'open' });
    assert.equal(sm.getStatus('giovana').status, 'CONECTADO');
  } finally {
    await sm.stopAll();
  }
});

test('Queda fora do ciclo do QR aparece no log e no painel com código e motivo', { timeout: 15000 }, async () => {
  const ctl = fakeBaileys();
  const logs = [];
  const sm = new WhatsAppSessionManager({ storageDir: path.join(tmp, 'sm-3'), baileys: ctl.baileys, log: (id, m) => logs.push(`${id}: ${m}`) });
  try {
    await sm.initializeTenant('giovana');
    ctl.sockets[0].ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { message: 'Connection Failure', output: { statusCode: 405 } } } });
    assert.ok(logs.some(l => /giovana: Conexão encerrada \(código 405\): Connection Failure/.test(l)), logs.join('\n'));
    assert.equal(sm.getStatus('giovana').erro, 'código 405: Connection Failure');
    ctl.sockets[0].ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { message: 'restart', output: { statusCode: 515 } } } });
    assert.ok(logs.some(l => /QR Code lido/.test(l)));
  } finally {
    await sm.stopAll();
  }
});
