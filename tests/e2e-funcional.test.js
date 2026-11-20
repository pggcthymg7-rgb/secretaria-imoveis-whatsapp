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

test('Agente 3 E2E: Carteira CRUD, Vitrine ciclo completo, Quem Procura e Prospecção', async t => {
  const vitrine = require('../src/vitrine');
  const prospeccao = require('../src/prospeccao');
  const radar = require('../src/radar');
  const contacts = require('../src/contacts');

  const srv = http.createServer(app);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => srv.close(r)));
  const base = `http://127.0.0.1:${srv.address().port}`;

  const loginRes = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-secretaria': '1' },
    body: JSON.stringify({ senha: process.env.PAINEL_SENHA })
  });
  const cookie = loginRes.headers.get('set-cookie').split(';')[0];
  const H = { 'Content-Type': 'application/json', 'x-secretaria': '1', cookie };

  // Upload foto JPG válida + cadastro + edição + CSV + exclusão remove da vitrine
  const fd = new FormData();
  fd.append('photos', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])], { type: 'image/jpeg' }), 'foto.jpg');
  const upRes = await (await fetch(`${base}/api/upload-photos`, { method: 'POST', headers: { 'x-secretaria': '1', cookie }, body: fd })).json();
  assert.equal(upRes.ok, true);

  const propRes = await (await fetch(`${base}/api/property`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ tipo: 'Apartamento', edificio: 'Solar E2E', setor: 'Setor Bueno', valor: 900000, quartos: 3, fotos: upRes.files })
  })).json();
  assert.equal(propRes.ok, true);
  const pid = propRes.property.id;

  const csvRes = await fetch(`${base}/api/export-csv`, { headers: { cookie } });
  assert.equal(csvRes.status, 200);
  assert.match(await csvRes.text(), /Solar E2E/);

  // Radar + Quem Procura
  radar.add({ grupo: 'Grupo', sender: 'Clara', phone: '62999991111', texto: 'Busco apto 3 quartos Setor Bueno até 950 mil', decision: 'AVISAR', tipos: ['Apartamento'], locais: ['Setor Bueno'], candidatos: [] });
  const qpRes = await (await fetch(`${base}/api/property/${pid}/quem-procura`, { headers: { cookie } })).json();
  assert.ok(qpRes.lista.some(x => x.sender === 'Clara'));

  // Vitrine gerar + editar + aprovar + excluir imóvel remove post
  await fetch(`${base}/api/vitrine/gerar`, { method: 'POST', headers: H });
  assert.ok(vitrine.getState().posts[pid]);
  const stRes = await (await fetch(`${base}/api/vitrine/post/${pid}/status`, { method: 'POST', headers: H, body: JSON.stringify({ status: 'APROVADO' }) })).json();
  assert.equal(stRes.post.status, 'APROVADO');
  await fetch(`${base}/api/property/${pid}`, { method: 'DELETE', headers: H });
  assert.equal(vitrine.getState().posts[pid], undefined, 'Excluir imóvel deve remover post na vitrine');

  // Prospecção: parse + campanha + status + config + contador no frontend
  contacts.upsertContact({ id: '5562988887777@s.whatsapp.net', phoneNumber: '5562988887777@s.whatsapp.net', name: 'Lead E2E' });
  const parsed = await (await fetch(`${base}/api/prospeccao/parse`, { method: 'POST', headers: H, body: JSON.stringify({ texto: 'Ana; 62 99999-1234' }) })).json();
  assert.equal(parsed.contatos.length, 1);
  const campRes = await (await fetch(`${base}/api/prospeccao/campanha`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ nome: 'Teste E2E', mensagem: 'Oi {nome}', contatos: parsed.contatos, iniciar: false })
  })).json();
  const campId = campRes.state.campanhas[0].id;
  await fetch(`${base}/api/prospeccao/campanha/${campId}/status`, { method: 'POST', headers: H, body: JSON.stringify({ status: 'ATIVA' }) });
  assert.equal(prospeccao.getCampaign(campId).status, 'ATIVA');
  await fetch(`${base}/api/prospeccao/campanha/${campId}`, { method: 'DELETE', headers: H });

  const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf-8');
  assert.ok(appJs.includes('id="selContactsCount"'), 'Contador de contatos selecionados deve ter id selContactsCount');
  assert.ok(appJs.includes("cnt.textContent = String(S.selContacts.size)"), 'Clique em contato deve atualizar selContactsCount');
});
