// Multi-tenant em camada de aplicação: isolamento por corretor no MESMO processo
const { tmp } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// ---- Gemini falso: registra qual chave/modelo cada chamada usou ------------------------------
const geminiCalls = [];
const genaiPath = require.resolve('@google/genai');
require.cache[genaiPath] = {
  id: genaiPath,
  filename: genaiPath,
  loaded: true,
  exports: {
    GoogleGenAI: class {
      constructor({ apiKey }) {
        this.models = { generateContent: async ({ model }) => (geminiCalls.push({ apiKey, model }), { text: '{"lugares":[]}' }) };
      }
    }
  }
};

// ---- Baileys falso: um socket por tenant ------------------------------------------------------
const sockets = [];
function makeFakeSock(self) {
  const ev = new EventEmitter();
  const sent = [];
  let n = 0;
  return {
    ev,
    sent,
    authState: { creds: { me: { id: self } } },
    user: { id: `${self}:7@s.whatsapp.net`, lid: `${self}9:7@lid`, name: 'Corretor' },
    sendMessage: async (jid, content) => {
      sent.push({ jid, content });
      return { key: { id: `BOT-${self}-${++n}`, remoteJid: jid, fromMe: true } };
    },
    sendPresenceUpdate: async () => {},
    chatModify: async () => {},
    groupFetchAllParticipating: async () => ({ 'g1@g.us': { id: 'g1@g.us', subject: 'BUSCA GOIÂNIA', participants: [1, 2] } }),
    groupMetadata: async () => ({ subject: 'Grupo', participants: [] }),
    onWhatsApp: async (...nums) => nums.map(x => ({ exists: true, jid: `${x}@s.whatsapp.net` })),
    signalRepository: { lidMapping: { getPNForLID: async () => null } },
    logout: async () => {},
    end: () => {}
  };
}
const authDirsUsed = [];
const fakeBaileys = {
  default: () => {
    const s = makeFakeSock(`556290000000${sockets.length + 1}`);
    sockets.push(s);
    return s;
  },
  useMultiFileAuthState: async dir => (authDirsUsed.push(dir), { state: {}, saveCreds: () => {} }),
  DisconnectReason: { loggedOut: 401, timedOut: 408, restartRequired: 515 },
  fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0] }),
  downloadMediaMessage: async () => Buffer.from([0xff, 0xd8, 0xff])
};
const baileysPath = require.resolve('@whiskeysockets/baileys');
require.cache[baileysPath] = { id: baileysPath, filename: baileysPath, loaded: true, exports: fakeBaileys };

const { createTenancy } = require('../src/tenancy');
const { createTenantContainer, buildTenantEnv } = require('../src/tenancy/container');
const { TenantStore } = require('../src/tenancy/tenant-store');
const { mountTenantRoutes } = require('../src/tenancy/routes');
const { analyzeMessageAndMatch } = require('../src/matcher');

const wait = ms => new Promise(r => setTimeout(r, ms));
const nowTs = () => Math.floor(Date.now() / 1000);
const PEDIDO = 'Busco apto de 1 quarto com até 50 m2 na região da praça tamandaré';

// ---------------------------------------------------------------------------------------------
test('Contêiner: estado, arquivos e process.env isolados por tenant', () => {
  process.env.GEMINI_API_KEY = 'CHAVE-DO-HOSPEDEIRO';
  const base = path.join(tmp, 'iso');
  const mk = (id, configIA) => {
    const dataDir = path.join(base, id);
    return createTenantContainer({ tenantId: id, dataDir, env: buildTenantEnv({ baseEnv: process.env, dataDir, configIA }) });
  };
  const a = mk('ana', { geminiApiKey: 'KEY_ANA' });
  const b = mk('bia', {});
  try {
    assert.equal(a.env.GEMINI_API_KEY, 'KEY_ANA');
    assert.equal(b.env.GEMINI_API_KEY, undefined, 'chave do hospedeiro nunca vaza para tenant');
    assert.equal(a.require('paths').DATA_DIR, path.join(base, 'ana'));

    a.require('settings').saveSettings({ meuWhatsappAlerta: '5562911112222' });
    assert.equal(a.require('settings').loadSettings().meuWhatsappAlerta, '5562911112222');
    assert.notEqual(b.require('settings').loadSettings().meuWhatsappAlerta, '5562911112222');

    a.require('radar').add({ grupo: 'G', texto: 'x', decision: 'AVISAR', tipos: [], locais: [], candidatos: [] });
    assert.equal(a.require('radar').list({ limit: 10 }).length, 1);
    assert.equal(b.require('radar').list({ limit: 10 }).length, 0);
    assert.notEqual(a.require('radar'), b.require('radar'), 'instâncias de módulo diferentes');

    a.require('envfile').updateEnvFile({ GEMINI_API_KEY: 'KEY_ANA_2' });
    assert.equal(a.env.GEMINI_API_KEY, 'KEY_ANA_2');
    assert.equal(process.env.GEMINI_API_KEY, 'CHAVE-DO-HOSPEDEIRO', 'hospedeiro intacto');
    assert.match(fs.readFileSync(path.join(base, 'ana', '.env'), 'utf-8'), /KEY_ANA_2/);
  } finally {
    a.require('radar').flush();
    process.env.GEMINI_API_KEY = '';
  }
});

test('TenantStore: valida id/config, grava com permissão 600 e esconde a chave', () => {
  const store = new TenantStore(path.join(tmp, 'store'));
  for (const bad of ['../etc', 'A', 'x', 'a/b', '', null, 'a'.repeat(40)]) assert.throws(() => store.save(bad, { nome: 'X' }), /corretorId inválido/);
  assert.throws(() => store.save('joao', { nome: 'João', configIA: { prompt: 'x' } }), /não é um campo aceito/);
  assert.throws(() => store.save('joao', { nome: 'João', configIA: { geminiApiKey: 'a\nb' } }), /inválido|formato/);
  assert.throws(() => store.save('joao', { nome: '' }), /nome/);

  const rec = store.save('joao', { nome: 'João', configIA: { geminiApiKey: 'AIzaKEY', humanTraining: 'linha 1\nlinha 2' } });
  store.save('joao', { nome: 'João Z', configIA: { modoApenasAvisar: true } });
  const got = store.get('joao');
  assert.equal(got.nome, 'João Z');
  assert.equal(got.configIA.geminiApiKey, 'AIzaKEY', 'atualização parcial mescla');
  assert.equal(got.criadoEm, rec.criadoEm);
  assert.equal(fs.statSync(path.join(store.tenantDir('joao'), 'config.json')).mode & 0o777, 0o600);
  const pub = TenantStore.publicView(got);
  assert.equal(pub.configIA.geminiApiKey, undefined);
  assert.equal(pub.configIA.hasGeminiApiKey, true);
  assert.deepEqual(store.list(), ['joao']);
});

test('Matcher: usa a chave/modelo do TenantContext e nunca a do processo quando há tenant', async () => {
  process.env.GEMINI_API_KEY = 'CHAVE-DO-HOSPEDEIRO';
  try {
    geminiCalls.length = 0;
    await analyzeMessageAndMatch(PEDIDO, 'X', [], { tenant: { ia: { geminiApiKey: 'KEY_T', geminiModel: 'modelo-t' } } });
    assert.deepEqual(geminiCalls, [{ apiKey: 'KEY_T', model: 'modelo-t' }]);
    geminiCalls.length = 0;
    await analyzeMessageAndMatch(PEDIDO, 'X', [], { tenant: { ia: { geminiApiKey: '' } } });
    assert.equal(geminiCalls.length, 0, 'tenant sem chave não usa a do hospedeiro');
  } finally {
    process.env.GEMINI_API_KEY = '';
  }
});

// ---------------------------------------------------------------------------------------------
test('Ponta a ponta: 2 corretores no mesmo processo, cada um responde pela própria sessão', { timeout: 30000 }, async () => {
  const t = createTenancy({ baseDir: path.join(tmp, 'mt'), baileys: fakeBaileys, startScheduler: false });
  const events = { qr: [], message: [] };
  t.sessionManager.on('qr', e => events.qr.push(e));
  t.sessionManager.on('message', e => events.message.push(e));

  t.tenantStore.save('ana', { nome: 'Ana', configIA: { geminiApiKey: 'KEY_ANA', geminiModel: 'm-ana', modoApenasAvisar: true } });
  t.tenantStore.save('bia', { nome: 'Bia', configIA: { geminiApiKey: 'KEY_BIA', geminiModel: 'm-bia' } });
  for (const id of ['ana', 'bia']) {
    const d = t.router.prepareTenant(id);
    d.container.require('settings').saveSettings({ gruposMonitoradosIds: ['g1@g.us'], firstContactAquecimentoMin: 0, maxPhotosPerMatch: 0 });
  }
  // Só a Ana tem o imóvel na carteira
  const sheetsAna = t.router.domain('ana').container.require('sheets');
  await sheetsAna.saveAllPropertiesToSpreadsheet([
    sheetsAna.normalizePropertyRecord({ id: '1', tipo: 'Apartamento', setor: 'Setor Oeste', quartos: 1, tamanho_m2: 45, valor: 300000, descricao: 'Apto 1 quarto', ativo: true })
  ]);

  await t.sessionManager.initializeTenant('ana');
  await t.sessionManager.initializeTenant('bia');
  const sockAna = t.sessionManager.getSession('ana');
  const sockBia = t.sessionManager.getSession('bia');
  assert.ok(sockAna && sockBia && sockAna !== sockBia, 'um socket por tenant (Map)');
  assert.deepEqual(authDirsUsed.slice(-2), [path.join(tmp, 'mt', 'sessions_storage', 'ana'), path.join(tmp, 'mt', 'sessions_storage', 'bia')]);

  sockAna.ev.emit('connection.update', { qr: 'QR-ANA' });
  assert.deepEqual(events.qr, [{ tenantId: 'ana', qr: 'QR-ANA' }]);
  assert.equal(t.sessionManager.getStatus('ana').status, 'AGUARDANDO_QR_CODE');
  sockAna.ev.emit('connection.update', { connection: 'open' });
  sockBia.ev.emit('connection.update', { connection: 'open' });
  await wait(50);
  assert.equal(t.router.getAgentState('ana').connectionStatus, 'CONECTADO');

  const ctx = t.router.buildTenantContext('ana');
  assert.equal(ctx.tenantId, 'ana');
  assert.equal(ctx.ia.geminiApiKey, 'KEY_ANA');
  assert.ok(Object.isFrozen(ctx));

  // O MESMO pedido (mesmo id) chega nos dois WhatsApps
  geminiCalls.length = 0;
  const upsert = () => ({
    type: 'notify',
    messages: [{
      key: { remoteJid: 'g1@g.us', participant: '999@lid', participantAlt: '5562977776666@s.whatsapp.net', id: 'MESMO-ID', fromMe: false },
      pushName: 'Marcela',
      messageTimestamp: nowTs(),
      message: { conversation: PEDIDO }
    }]
  });
  sockAna.ev.emit('messages.upsert', upsert());
  sockBia.ev.emit('messages.upsert', upsert());
  await wait(1500);

  assert.deepEqual(events.message.map(e => e.tenantId), ['ana', 'bia'], "evento 'message' com tenantId");
  assert.ok(sockAna.sent.some(s => /PEDIDO COMPATÍVEL/.test(s.content.text || '')), 'Ana (modo avisar, via configIA) alertada pela sessão dela');
  assert.equal(sockBia.sent.length, 0, 'Bia não tem o imóvel: nada sai, e nada da Ana sai pela sessão da Bia');
  assert.deepEqual(geminiCalls.map(c => c.apiKey).sort(), ['KEY_ANA', 'KEY_BIA'], 'cada tenant usa a própria chave de IA');
  assert.ok(geminiCalls.some(c => c.apiKey === 'KEY_ANA' && c.model === 'm-ana'));
  const radarAna = t.router.domain('ana').container.require('radar').list({ limit: 10 });
  const radarBia = t.router.domain('bia').container.require('radar').list({ limit: 10 });
  assert.equal(radarAna.length, 1);
  assert.equal(radarAna[0].decision, 'AVISAR');
  assert.equal(radarBia.length, 1);
  assert.equal(radarBia[0].decision, 'SILENCIO');

  // Queda com logout: apaga só a sessão daquele tenant e reconecta
  fs.writeFileSync(path.join(tmp, 'mt', 'sessions_storage', 'bia', 'creds.json'), '{}');
  sockAna.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } });
  assert.equal(fs.existsSync(path.join(tmp, 'mt', 'sessions_storage', 'ana')), false);
  assert.equal(fs.existsSync(path.join(tmp, 'mt', 'sessions_storage', 'bia', 'creds.json')), true);
  assert.equal(t.router.getAgentState('ana').connectionStatus, 'DESCONECTADO');
  await t.shutdown();
});

// ---------------------------------------------------------------------------------------------
test('POST /api/conectar-corretor: token de admin, validação, persistência e QR', { timeout: 15000 }, async () => {
  const express = require('express');
  const app = express();
  app.use(express.json());
  const t = createTenancy({ baseDir: path.join(tmp, 'http'), baileys: fakeBaileys, startScheduler: false });
  const TOKEN = 'x'.repeat(40);
  assert.equal(mountTenantRoutes(express(), { ...t, adminToken: 'curto' }), false, 'token fraco desliga as rotas');
  assert.equal(mountTenantRoutes(app, { ...t, adminToken: TOKEN }), true);
  const server = app.listen(0);
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (body, token = TOKEN) =>
    fetch(`${url}/api/conectar-corretor`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  try {
    assert.equal((await post({ corretorId: 'laura', nome: 'Laura' }, null)).status, 401);
    assert.equal((await post({ corretorId: 'laura', nome: 'Laura' }, 'y'.repeat(40))).status, 401);
    assert.equal((await post({ corretorId: '../x', nome: 'Laura' })).status, 400);
    assert.equal((await post({ corretorId: 'laura', nome: 'Laura', configIA: { evil: 1 } })).status, 400);

    const r = await post({ corretorId: 'laura', nome: 'Laura', configIA: { geminiApiKey: 'KEY_LAURA', humanTraining: 'Seja breve.' } });
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.equal(body.corretor.configIA.geminiApiKey, undefined, 'segredo não volta na resposta');
    assert.equal(body.corretor.configIA.hasGeminiApiKey, true);
    assert.equal(t.tenantStore.get('laura').configIA.geminiApiKey, 'KEY_LAURA');
    assert.ok(t.sessionManager.getSession('laura'), 'initializeTenant chamado');
    assert.equal(t.router.domain('laura').container.require('settings').loadSettings().humanTraining, 'Seja breve.');

    assert.equal((await post({ corretorId: 'laura', nome: 'Laura' })).status, 200, 'reenvio atualiza');

    t.sessionManager.getSession('laura').ev.emit('connection.update', { qr: 'QR-LAURA' });
    const st = await (await fetch(`${url}/api/corretores/laura/status`, { headers: { authorization: `Bearer ${TOKEN}` } })).json();
    assert.equal(st.whatsapp.status, 'AGUARDANDO_QR_CODE');
    assert.match(st.whatsapp.qrDataUrl, /^data:image\/png;base64,/);
  } finally {
    server.close();
    await t.shutdown();
  }
});
