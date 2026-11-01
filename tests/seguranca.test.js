const { tmp } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { app } = require('../index');
const { sanitizePhotoRef, normalizePropertyRecord, serializeCsv } = require('../src/sheets');

let server;
let base;
let cookie = '';

test.before(async () => {
  await new Promise(r => {
    server = app.listen(0, '127.0.0.1', r);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const H = (extra = {}) => ({ 'Content-Type': 'application/json', 'x-secretaria': '1', ...(cookie ? { cookie } : {}), ...extra });

test('Sem login: API e fotos bloqueadas, QR Code nunca exposto', async () => {
  for (const url of ['/api/status', '/api/inventory', '/api/radar', '/api/contatos', '/fotos/qualquer.jpg']) {
    const r = await fetch(base + url, { headers: { 'x-secretaria': '1' } });
    assert.equal(r.status, 401, url);
  }
  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});

test('Login: senha errada recusa; certa cria sessão HttpOnly', async () => {
  let r = await fetch(base + '/api/login', { method: 'POST', headers: H(), body: JSON.stringify({ senha: 'errada' }) });
  assert.equal(r.status, 401);
  r = await fetch(base + '/api/login', { method: 'POST', headers: H(), body: JSON.stringify({ senha: process.env.PAINEL_SENHA }) });
  assert.equal(r.status, 200);
  const sc = r.headers.get('set-cookie');
  assert.match(sc, /HttpOnly/);
  assert.match(sc, /SameSite=Strict/);
  cookie = sc.split(';')[0];
  r = await fetch(base + '/api/status', { headers: H() });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.latestQrCode, undefined);
});

test('Sem cabeçalho do painel (CSRF) alterações são bloqueadas', async () => {
  const r = await fetch(base + '/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ pausado: true }) });
  assert.equal(r.status, 403);
});

test('Upload aceita só imagem (bloqueia .html e .js)', async () => {
  const fd = new FormData();
  fd.append('photos', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'x.html');
  const r = await fetch(base + '/api/upload-photos', { method: 'POST', headers: { 'x-secretaria': '1', cookie }, body: fd });
  assert.equal(r.status, 400);
  const fd2 = new FormData();
  fd2.append('photos', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' }), 'foto.jpg');
  const r2 = await fetch(base + '/api/upload-photos', { method: 'POST', headers: { 'x-secretaria': '1', cookie }, body: fd2 });
  assert.equal(r2.status, 200);
  const j = await r2.json();
  assert.match(j.files[0], /^\d+_[a-f0-9]{8}\.jpg$/);
});

test('Caminho de foto não sai da pasta de fotos (../../.env)', () => {
  assert.equal(sanitizePhotoRef('../../.env'), '.env');
  assert.equal(sanitizePhotoRef('/etc/passwd'), 'passwd');
  assert.equal(sanitizePhotoRef('https://exemplo.com/a.jpg'), 'https://exemplo.com/a.jpg');
  const p = normalizePropertyRecord({ setor: 'Bueno', fotos: '../../auth_info_baileys/creds.json' });
  assert.deepEqual(p.fotos, ['creds.json']);
});

test('CSV exportado não executa fórmula no Excel', () => {
  const csv = serializeCsv([normalizePropertyRecord({ id: '1', setor: 'Bueno', descricao: '=HYPERLINK("http://mal")' })]);
  assert.match(csv, /'=HYPERLINK/);
});

test('Cadastro via API ignora id enviado e campos desconhecidos', async () => {
  const r = await fetch(base + '/api/property', { method: 'POST', headers: H(), body: JSON.stringify({ id: '../../x', tipo: 'Casa', setor: 'Setor Bueno', valor: '500 mil', hack: 'x' }) });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.match(j.property.id, /^\d+$/);
  assert.equal(j.property.hack, undefined);
});

test('Config: só aceita link do Google e não injeta variáveis no .env', async () => {
  let r = await fetch(base + '/api/config', { method: 'POST', headers: H(), body: JSON.stringify({ googleSheetsUrl: 'http://evil.com/x' }) });
  assert.equal(r.status, 400);
  r = await fetch(base + '/api/config', { method: 'POST', headers: H(), body: JSON.stringify({ meuWhatsappAlerta: '62999990000\nAPI_TOKEN=hack' }) });
  assert.equal(r.status, 200);
  assert.ok(!(process.env.API_TOKEN || '').includes('hack'));
});

test('Simulador funciona logado', async () => {
  const r = await fetch(base + '/api/simulate', { method: 'POST', headers: H(), body: JSON.stringify({ message: 'Busco casa no Setor Bueno até 600 mil', useAi: false }) });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.analysis.isLookingForProperty, true);
});

test('Dados de teste ficaram na pasta temporária', () => {
  assert.ok(fs.existsSync(path.join(tmp, 'imoveis.csv')));
});
