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
