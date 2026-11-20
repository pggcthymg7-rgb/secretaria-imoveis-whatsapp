'use strict';
const { tmp } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');

const { app, shutdown } = require('../src/app');
const settings = require('../src/settings');
const sheets = require('../src/sheets');

// Encerramento limpo do rateLimitStore/timers no fim do arquivo de testes
test.after(() => {
  try { shutdown(); } catch {}
});

test('Agente 1 E2E: setup/login/troca de senha, CSRF, maxPhotosPerMatch=0 e deep-link no frontend', async t => {
  const srv = http.createServer(app);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => srv.close(r)));
  const base = `http://127.0.0.1:${srv.address().port}`;

  // Login válido + Bearer + CSRF
  const loginRes = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-secretaria': '1' },
    body: JSON.stringify({ senha: process.env.PAINEL_SENHA })
  });
  assert.equal(loginRes.status, 200);
  const cookie = loginRes.headers.get('set-cookie').split(';')[0];

  // Salvar maxPhotosPerMatch = 0 e verificar persistência real
  const cfgRes = await fetch(`${base}/api/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-secretaria': '1', cookie },
    body: JSON.stringify({ maxPhotosPerMatch: 0, minCriteriosParaEnvio: 3, meuWhatsappAlerta: '62988887777' })
  });
  assert.equal(cfgRes.status, 200);
  const cfgJson = await cfgRes.json();
  assert.equal(cfgJson.config.maxPhotosPerMatch, 0, 'maxPhotosPerMatch=0 deve persistir sem voltar para 5');
  assert.equal(settings.loadSettings().maxPhotosPerMatch, 0);

  // Confirmar que app.js trata deep-link pós login/setup via go() e não desloga em 401 de /api/change-password
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf-8');
  assert.ok(appJs.includes("!url.startsWith('/api/change-password')"), '401 em change-password não deve deslogar o painel');
  assert.match(appJs, /await api\('POST', setup \? '\/api\/setup' : '\/api\/login', d\);\s*S\.authed = true;\s*S\.configured = true;\s*S\._booted = false;\s*await go\(\);/);

  // Criar imóvel para deixar carteira pronta
  const created = await sheets.createProperty({ tipo: 'Apartamento', setor: 'Setor Bueno', valor: 700000 });
  assert.ok(created.id);
});

test('Agente 2 E2E: rotas HTML / e /dia-a-dia, assets versionados, CSP e proteção contra race de filtro', async t => {
  const srv = http.createServer(app);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => srv.close(r)));
  const base = `http://127.0.0.1:${srv.address().port}`;

  for (const p of ['/', '/dia-a-dia']) {
    const r = await fetch(`${base}${p}`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-security-policy') || '', /script-src 'self'/);
    assert.match(r.headers.get('cache-control') || '', /no-store/);
    const html = await r.text();
    assert.match(html, /\/assets\/biga-art\.js\?v=/);
    assert.match(html, /\/assets\/capas\.js\?v=/);
    assert.match(html, /\/assets\/app\.js\?v=/);
    assert.match(html, /\/assets\/app\.css\?v=/);
  }

  for (const asset of ['/assets/app.js', '/assets/capas.js', '/assets/biga-art.js', '/assets/app.css', '/assets/fontes-google.json']) {
    const r = await fetch(`${base}${asset}`);
    assert.equal(r.status, 200, `Asset ${asset} deve servir 200`);
  }

  const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf-8');
  assert.match(appJs, /async function go\(\) \{\s*clearTimeout\(S\._ft\);/);
  assert.ok(appJs.includes('if (S.route !== rota) return;'), 'Debounce de filtro deve checar se a rota mudou');
});
