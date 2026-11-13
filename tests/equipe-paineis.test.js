// SaaS: o admin tem a BIGA dele + administração; cada corretor tem a BIGA COMPLETA dele
// (painel com login próprio, no endereço <id>.<DOMINIO>) sem acesso à estrutura do SaaS.
const { tmp } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { EventEmitter } = require('events');

// Baileys falso (nenhuma conexão real)
const fakeBaileys = {
  default: () => ({
    ev: new EventEmitter(),
    user: null,
    authState: { creds: {} },
    sendMessage: async () => ({ key: { id: 'x' } }),
    logout: async () => {},
    end: () => {}
  }),
  useMultiFileAuthState: async () => ({ state: {}, saveCreds: () => {} }),
  DisconnectReason: { loggedOut: 401, timedOut: 408, restartRequired: 515 },
  fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0] }),
  downloadMediaMessage: async () => Buffer.from('')
};
const baileysPath = require.resolve('@whiskeysockets/baileys');
require.cache[baileysPath] = { id: baileysPath, filename: baileysPath, loaded: true, exports: fakeBaileys };

process.env.MULTI_TENANT = '1';
process.env.DOMINIO = 'biga.test';
const { app, tenancy, PAPEL } = require('../src/app');

let server;
let port;
function req(method, path, { host = '127.0.0.1', body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port, method, path, headers: { host, 'x-secretaria': '1', ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}), ...(cookie ? { cookie } : {}) } }, res => {
      let txt = '';
      res.on('data', c => (txt += c));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(txt);
        } catch {}
        resolve({ status: res.statusCode, json, txt, cookie: String((res.headers['set-cookie'] || [''])[0]).split(';')[0] });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
const LIA = 'lia.biga.test';
let admin;
let lia;

test.before(async () => {
  server = app.listen(0);
  port = server.address().port;
  admin = (await req('POST', '/api/login', { body: { senha: 'senha-de-teste-123' } })).cookie;
});
test.after(async () => {
  server.close();
  await tenancy.shutdown();
});

test('Processo hospedeiro é o admin; cadastrar corretor gera convite e pede o HTTPS do endereço', async () => {
  assert.equal(PAPEL, 'admin');
  assert.equal((await req('GET', '/api/status', { cookie: admin })).json.papel, 'admin');
  assert.equal((await req('POST', '/api/equipe', { cookie: admin, body: { corretorId: 'www', nome: 'X' } })).status, 400, 'nome reservado');
  const r = await req('POST', '/api/equipe', { cookie: admin, body: { corretorId: 'lia', nome: 'Lia', configIA: { meuWhatsappAlerta: '62988887777' } } });
  assert.equal(r.status, 201);
  assert.equal(r.json.corretor.painel.url, 'https://lia.biga.test');
  assert.match(r.json.corretor.painel.codigoConvite, /^[0-9A-F]{8}$/);
  assert.ok(require('fs').existsSync(require('path').join(tmp, 'caddy-sincronizar')), 'pedido de HTTPS para o root');
});

test('Corretor cria a senha com o convite e usa o painel COMPLETO dele, isolado do admin', async () => {
  const sess = await req('GET', '/api/session', { host: LIA });
  assert.equal(sess.json.configured, false);
  const codigo = (await req('GET', '/api/equipe', { cookie: admin })).json.corretores[0].painel.codigoConvite;
  const setup = await req('POST', '/api/setup', { host: LIA, body: { codigo, senha: 'senha-da-lia-1' } });
  assert.equal(setup.status, 200);
  lia = setup.cookie;

  const st = await req('GET', '/api/status', { host: LIA, cookie: lia });
  assert.equal(st.status, 200);
  assert.equal(st.json.papel, 'corretor');
  assert.equal(st.json.config.meuWhatsappAlerta, '62988887777', 'configuração inicial do admin chegou');

  // Funcionalidade dela: muda os próprios ajustes e cadastra imóvel
  assert.equal((await req('POST', '/api/config', { host: LIA, cookie: lia, body: { meuWhatsappAlerta: '62911112222' } })).status, 200);
  const prop = await req('POST', '/api/property', { host: LIA, cookie: lia, body: { tipo: 'Casa', setor: 'Setor Bueno', valor: 900000, quartos: 3 } });
  assert.equal(prop.status, 200);
  const invLia = (await req('GET', '/api/inventory', { host: LIA, cookie: lia })).json.inventory;
  const invAdmin = (await req('GET', '/api/inventory', { cookie: admin })).json.inventory;
  assert.ok(invLia.some(p => p.setor === 'Setor Bueno'));
  assert.ok(!invAdmin.some(p => p.setor === 'Setor Bueno'), 'carteira dela não aparece na do admin');
  assert.notEqual((await req('GET', '/api/status', { cookie: admin })).json.config.meuWhatsappAlerta, '62911112222');

  // O admin vê o que está valendo na BIGA dela (ela mudou depois do cadastro)
  assert.equal(tenancy.router.efetivo('lia').meuWhatsappAlerta, '62911112222');
  assert.equal(tenancy.router.buildTenantContext('lia').alertas.meuWhatsapp, '62911112222');
});

test('Corretor NÃO mexe na estrutura do SaaS', async () => {
  assert.equal((await req('POST', '/api/sistema/atualizar', { host: LIA, cookie: lia })).status, 403);
  assert.equal((await req('GET', '/api/equipe', { host: LIA, cookie: lia })).status, 403);
  assert.equal((await req('POST', '/api/equipe', { host: LIA, cookie: lia, body: { corretorId: 'zeca', nome: 'Z' } })).status, 403);
  assert.equal((await req('POST', '/api/equipe/lia/pausar', { host: LIA, cookie: lia })).status, 403);
  assert.equal(tenancy.tenantStore.get('zeca'), null);
});

test('Sessões não atravessam: login da corretora não vale no admin (nem o contrário)', async () => {
  assert.equal((await req('GET', '/api/status', { cookie: lia })).status, 401, 'cookie da Lia no endereço do admin');
  assert.equal((await req('GET', '/api/status', { host: LIA, cookie: admin })).status, 401, 'cookie do admin no endereço da Lia');
  assert.equal((await req('GET', '/api/status', { host: LIA })).status, 401);
  assert.equal((await req('POST', '/api/login', { host: LIA, body: { senha: 'senha-de-teste-123' } })).status, 401, 'senha do admin não abre a BIGA dela');
});

test('process.exit da BIGA de um corretor recarrega só ela (o SaaS segue no ar)', async () => {
  const antes = tenancy.router.domain('lia').container;
  antes.process.exit(0);
  await new Promise(r => setTimeout(r, 50));
  const depois = tenancy.router.domain('lia').container;
  assert.notEqual(depois, antes, 'instância nova carregada do disco');
  assert.equal(antes.timersAtivos, 0, 'timers da instância antiga foram parados');
  assert.throws(() => antes.require('radar'), /recarregada/);
  assert.equal((await req('GET', '/api/status', { cookie: admin })).status, 200, 'admin no ar');
  assert.equal((await req('GET', '/api/status', { host: LIA, cookie: lia })).status, 200, 'mesma senha/sessão após recarregar');
});

test('Endereços: pausado = 503, inexistente = 404', async () => {
  assert.equal((await req('GET', '/api/session', { host: 'ninguem.biga.test' })).status, 404);
  assert.equal((await req('POST', '/api/equipe/lia/pausar', { cookie: admin })).status, 200);
  assert.equal((await req('GET', '/', { host: LIA })).status, 503);
  assert.equal((await req('POST', '/api/equipe/lia/retomar', { cookie: admin })).status, 200);
  assert.equal((await req('GET', '/api/session', { host: LIA })).status, 200);
});
