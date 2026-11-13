// Alertas do CodeQL (03/11/2026): limite geral de requisições e checagem de domínio da foto de teste
process.env.RATE_LIMIT_MAX = '5'; // antes de carregar o servidor (o teto é lido ao subir)
require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');

test('Limite geral por IP: passa do teto → 429; /ping e /health nunca são limitados', async () => {
  const { app } = require('../index');
  const server = await new Promise(r => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const codigos = [];
    for (let i = 0; i < 8; i++) codigos.push((await fetch(`${base}/api/session`)).status);
    assert.deepEqual(codigos.slice(0, 5), [200, 200, 200, 200, 200], 'dentro do teto');
    assert.deepEqual(codigos.slice(5), [429, 429, 429], 'acima do teto');
    const r = await fetch(`${base}/api/session`);
    assert.match((await r.json()).error, /Muitas requisições/);
    for (let i = 0; i < 12; i++) assert.equal((await fetch(`${base}/ping`)).status, 200, '/ping fora do limite');
    assert.equal((await fetch(`${base}/health`)).status, 200, '/health fora do limite');
  } finally {
    server.close();
  }
});
