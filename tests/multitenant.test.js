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

// ---------------------------------------------------------------------------------------------
test('Migração da Laura: dados, sessão do WhatsApp e chaves vão para dentro da BIGA principal', { timeout: 15000 }, async () => {
  const { migrarCorretor } = require('../scripts/migrar-corretor');
  const antiga = path.join(tmp, 'mig', 'secretaria-laura');
  const principal = path.join(tmp, 'mig', 'secretaria');
  fs.mkdirSync(path.join(antiga, 'fotos'), { recursive: true });
  fs.mkdirSync(path.join(antiga, 'auth_info_baileys'), { recursive: true });
  fs.writeFileSync(path.join(antiga, 'auth_info_baileys', 'creds.json'), '{"me":{"id":"5562911110000:1@s.whatsapp.net"}}');
  fs.writeFileSync(path.join(antiga, 'settings.json'), JSON.stringify({ meuWhatsappAlerta: '5562911110000', humanTraining: 'Jeito da Laura', gruposMonitoradosIds: ['g1@g.us'] }));
  fs.writeFileSync(path.join(antiga, 'radar.json'), '[]');
  fs.writeFileSync(path.join(antiga, 'fotos', 'casa.jpg'), 'jpg');
  fs.writeFileSync(path.join(antiga, 'auth.json'), '{"hash":"senha-do-painel-antigo"}');
  fs.writeFileSync(path.join(antiga, '.env'), 'GEMINI_API_KEY=KEY_PAINEL_LAURA\n');
  const envAntigo = path.join(tmp, 'mig', 'secretaria-laura.env');
  fs.writeFileSync(envAntigo, 'PORT=3001\nAPI_TOKEN=nao-copiar\nGEMINI_API_KEY=KEY_ETC\nGOOGLE_SHEETS_CSV_URL=https://docs.google.com/x.csv\n');

  const r = migrarCorretor({ nome: 'laura', dados: antiga, env: envAntigo, destino: principal });
  assert.equal(r.resultado, 'migrado');
  assert.equal(r.sessaoCopiada, true);
  const tdata = path.join(principal, 'tenants', 'laura', 'data');
  assert.ok(fs.existsSync(path.join(tdata, 'fotos', 'casa.jpg')));
  assert.equal(fs.existsSync(path.join(tdata, 'auth.json')), false, 'senha do painel antigo não vem');
  assert.ok(fs.existsSync(path.join(principal, 'sessions_storage', 'laura', 'creds.json')), 'sessão vem junto: sem novo QR');
  const env = fs.readFileSync(path.join(tdata, '.env'), 'utf-8');
  assert.match(env, /GEMINI_API_KEY=KEY_PAINEL_LAURA/, 'chave salva pelo painel dela vence a do /etc');
  assert.match(env, /GOOGLE_SHEETS_CSV_URL=/);
  assert.doesNotMatch(env, /API_TOKEN|PORT/);
  assert.equal(fs.statSync(path.join(tdata, '.env')).mode & 0o777, 0o600);
  assert.equal(migrarCorretor({ nome: 'laura', dados: antiga, env: envAntigo, destino: principal }).resultado, 'ja-migrado');
  assert.throws(() => migrarCorretor({ nome: '../x', dados: antiga, destino: principal }), /nome inválido/);

  // Sobe dentro da principal com os dados e a persona dela intactos
  const t = createTenancy({ baseDir: principal, baileys: fakeBaileys, startScheduler: false });
  assert.deepEqual(await t.restoreAll(), ['laura']);
  const ef = t.router.efetivo('laura');
  assert.equal(ef.meuWhatsappAlerta, '5562911110000');
  assert.equal(ef.humanTraining, 'Jeito da Laura', 'cadastro migrado não sobrescreve a persona');
  assert.equal(ef.hasGeminiApiKey, true);
  assert.equal(t.router.domain('laura').container.env.GEMINI_API_KEY, 'KEY_PAINEL_LAURA');
  await t.shutdown();
});

test('Painel /api/equipe: só com login do João; cadastrar, pausar, retomar e novo QR', { timeout: 15000 }, async () => {
  const express = require('express');
  const { mountPanelRoutes } = require('../src/tenancy/routes');
  const app = express();
  app.use(express.json());
  app.use('/api', (req, res, next) => (req.headers.cookie === 'joao' ? next() : res.status(401).json({ error: 'Faça login no painel.' })));
  const t = createTenancy({ baseDir: path.join(tmp, 'painel'), baileys: fakeBaileys, startScheduler: false });
  mountPanelRoutes(app, t);
  const server = app.listen(0);
  const url = `http://127.0.0.1:${server.address().port}/api/equipe`;
  const call = (method, p = '', body, cookie = 'joao') => fetch(url + p, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  try {
    assert.equal((await call('GET', '', null, null)).status, 401);
    assert.equal((await call('POST', '', { corretorId: 'ana', nome: 'Ana' }, null)).status, 401);

    const r = await call('POST', '', { corretorId: 'ana', nome: 'Ana', configIA: { geminiApiKey: 'KEY_ANA', meuWhatsappAlerta: '(62) 99999-0000', modoApenasAvisar: true } });
    assert.equal(r.status, 201);
    const c = (await r.json()).corretor;
    assert.equal(c.configIA.geminiApiKey, undefined);
    assert.equal(c.efetivo.meuWhatsappAlerta, '62999990000');
    assert.equal(c.efetivo.modoApenasAvisar, true);

    // Editar sem informar a chave mantém a chave atual
    assert.equal((await call('POST', '', { corretorId: 'ana', nome: 'Ana Paula', configIA: { geminiApiKey: '' } })).status, 200);
    assert.equal(t.tenantStore.get('ana').configIA.geminiApiKey, 'KEY_ANA');

    t.sessionManager.getSession('ana').ev.emit('connection.update', { qr: 'QR-ANA' });
    const lista = await (await call('GET')).json();
    assert.equal(lista.multiTenant, true);
    assert.match(lista.corretores[0].whatsapp.qrSvg, /<svg/);

    assert.equal((await (await call('POST', '/ana/pausar')).json()).corretor.whatsapp.status, 'PAUSADO');
    assert.equal(t.sessionManager.getSession('ana'), null);
    assert.equal(t.tenantStore.get('ana').ativo, false);
    assert.deepEqual(await t.restoreAll(), [], 'pausado não religa na partida');
    assert.equal((await call('POST', '/ana/novo-qr')).status, 400);
    await call('POST', '/ana/retomar');
    assert.ok(t.sessionManager.getSession('ana'));
    const antes = t.sessionManager.getSession('ana');
    assert.equal((await call('POST', '/ana/novo-qr')).status, 200);
    assert.notEqual(t.sessionManager.getSession('ana'), antes, 'novo QR = socket novo');
    assert.equal((await call('POST', '/ana/apagar')).status, 404);
    assert.equal((await call('POST', '/..%2Fx/pausar')).status, 400);
    assert.equal((await call('POST', '/zeca/pausar')).status, 404);
  } finally {
    server.close();
    await t.shutdown();
  }
});

test('Painel /api/equipe com o modo equipe desligado', async () => {
  const express = require('express');
  const { mountPanelRoutes } = require('../src/tenancy/routes');
  const app = express();
  app.use(express.json());
  mountPanelRoutes(app, null);
  const server = app.listen(0);
  const url = `http://127.0.0.1:${server.address().port}/api/equipe`;
  try {
    assert.deepEqual(await (await fetch(url)).json(), { multiTenant: false, corretores: [] });
    assert.equal((await fetch(url, { method: 'POST' })).status, 409);
  } finally {
    server.close();
  }
});
