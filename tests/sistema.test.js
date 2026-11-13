const { tmp } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sistema = require('../src/sistema');
const assistant = require('../src/assistant');
const { app } = require('../index');

test('Versão em uso vem do git', () => {
  assert.match(sistema.version() || '', /^[0-9a-f]{7}$/);
});

test('Pedido de atualização cria o gatilho na pasta de dados e lê o resultado', () => {
  const r = sistema.requestUpdate();
  assert.equal(r.ok, true);
  assert.ok(fs.existsSync(path.join(tmp, 'atualizar-agora')));
  fs.writeFileSync(path.join(tmp, 'atualizacao.log'), '2026-11-02 04:15 OK atualizada de aaaaaaa para bbbbbbb\n');
  assert.match(sistema.lastResults()[0], /OK atualizada/);
});

test('Comando "atualizar" no WhatsApp pede a atualização', async () => {
  fs.rmSync(path.join(tmp, 'atualizar-agora'), { force: true });
  const sent = [];
  const wa = { sendText: async (j, t) => sent.push(t) };
  assert.equal(await assistant.handleOwnerMessage(wa, { chatJid: 'x@s.whatsapp.net', text: 'atualizar' }), true);
  assert.match(sent[0], /Atualização pedida/);
  assert.ok(fs.existsSync(path.join(tmp, 'atualizar-agora')));
  assert.equal(await assistant.handleOwnerMessage(wa, { chatJid: 'x@s.whatsapp.net', text: 'versão' }), true);
  assert.match(sent[1], /Versão [0-9a-f]{7}/);
});

test('API do sistema exige login', async () => {
  const server = await new Promise(r => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let r = await fetch(`${base}/api/sistema/atualizar`, { method: 'POST', headers: { 'x-secretaria': '1' } });
    assert.equal(r.status, 401);
    r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-secretaria': '1' }, body: JSON.stringify({ senha: process.env.PAINEL_SENHA }) });
    const cookie = r.headers.get('set-cookie').split(';')[0];
    r = await fetch(`${base}/api/sistema/atualizar`, { method: 'POST', headers: { cookie } });
    assert.equal(r.status, 403, 'sem o cabeçalho do painel (CSRF) é bloqueado');
    r = await fetch(`${base}/api/sistema/atualizar`, { method: 'POST', headers: { cookie, 'x-secretaria': '1' } });
    assert.equal(r.status, 200);
    r = await fetch(`${base}/api/sistema`, { headers: { cookie } });
    const j = await r.json();
    assert.equal(j.naVM, true);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Corretores extras (uma BIGA por corretor na mesma VM)
const { execFileSync, spawnSync } = require('child_process');
const os = require('os');
const ROOT = path.join(__dirname, '..');

test('corretores.conf é válido e a Laura roda dentro da BIGA principal (modo equipe)', () => {
  const out = execFileSync('bash', [path.join(ROOT, 'deploy/corretores.sh'), '--checar'], { env: { ...process.env, APP_DIR: ROOT }, encoding: 'utf-8' });
  const linhas = out.trim().split('\n').filter(Boolean).map(l => l.split(' '));
  assert.equal(linhas.find(l => l[0] === 'laura'), undefined, 'Laura não tem mais processo/porta próprios');
  assert.ok(linhas.every(l => l[2] !== '3000'), 'porta 3000 é da BIGA principal');
});

test('corretores.sh recusa linhas perigosas ou repetidas (roda como root)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-'));
  const ruins = ['Laura x.sslip.io 3001', 'ana x.sslip.io;rm 3001', 'ana x.sslip.io 3000', 'ana x.sslip.io 3001 extra', 'ana a.sslip.io 3001\nbia b.sslip.io 3001', 'ana$(id) a.sslip.io 3001'];
  for (const conteudo of ruins) {
    const f = path.join(dir, 'c.conf');
    fs.writeFileSync(f, conteudo + '\n');
    const r = spawnSync('bash', [path.join(ROOT, 'deploy/corretores.sh'), '--checar'], { env: { ...process.env, CORRETORES_CONF: f }, encoding: 'utf-8' });
    assert.notEqual(r.status, 0, `deveria recusar: ${conteudo}`);
  }
});

test('SETUP_CODE fixo vira o código de criar senha da BIGA nova (e só enquanto não há senha)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biga-nova-'));
  const env = { ...process.env, DATA_DIR: dir, SETUP_CODE: 'abcdef1234', PAINEL_SENHA: '' };
  const code = execFileSync(process.execPath, ['-e', "process.stdout.write(String(require('./src/auth').getSetupCode()))"], { cwd: ROOT, env, encoding: 'utf-8' });
  assert.equal(code.trim().split('\n').pop(), 'ABCDEF1234');
  const fraco = execFileSync(process.execPath, ['-e', "process.stdout.write(String(require('./src/auth').getSetupCode()))"], { cwd: ROOT, env: { ...env, SETUP_CODE: '12' }, encoding: 'utf-8' });
  assert.notEqual(fraco.trim().split('\n').pop(), '12', 'código curto demais é ignorado');
});

test('Comando "corretores" mostra o endereço e o código da Laura para o João', async () => {
  const sent = [];
  const wa = { sendText: async (j, t) => sent.push(t) };
  fs.rmSync(path.join(tmp, 'corretores.json'), { force: true });
  assert.equal(await assistant.handleOwnerMessage(wa, { chatJid: 'x@s.whatsapp.net', text: 'corretores' }), true);
  assert.match(sent[0], /Nenhuma BIGA/);
  fs.writeFileSync(path.join(tmp, 'corretores.json'), JSON.stringify([{ nome: 'laura', url: 'https://laura.147-15-87-168.sslip.io', codigo: 'ABCDEF1234' }]));
  await assistant.handleOwnerMessage(wa, { chatJid: 'x@s.whatsapp.net', text: 'corretores' });
  assert.match(sent[1], /Laura.*laura\.147-15-87-168\.sslip\.io/s);
  assert.match(sent[1], /ABCDEF1234/);
  fs.writeFileSync(path.join(tmp, 'corretores.json'), JSON.stringify([{ nome: 'laura', url: 'https://laura.147-15-87-168.sslip.io', codigo: '' }]));
  await assistant.handleOwnerMessage(wa, { chatJid: 'x@s.whatsapp.net', text: 'corretores' });
  assert.match(sent[2], /senha já criada/);
  assert.doesNotMatch(sent[2], /ABCDEF1234/);
});

test('Painel carrega app.js/app.css com a versão (depois de "atualizar" o celular pega o painel novo)', async () => {
  const server = await new Promise(r => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  try {
    const html = await (await fetch(`http://127.0.0.1:${server.address().port}/`)).text();
    for (const f of ['app.js', 'app.css', 'biga-art.js']) assert.match(html, new RegExp(`/assets/${f.replace('.', '\\.')}\\?v=[0-9a-f]{7}"`));
  } finally {
    server.close();
  }
});
