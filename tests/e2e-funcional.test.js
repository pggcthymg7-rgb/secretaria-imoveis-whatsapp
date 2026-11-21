'use strict';
const { tmp } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');

const { app, shutdown } = require('../src/web/app');
const settings = require('../src/config/settings');
const sheets = require('../src/domain/sheets');

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

  // Confirmar que js/core.js + js/inicio.js tratam deep-link pós login/setup via go() e não deslogam em 401 de /api/change-password
  const coreJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'js', 'core.js'), 'utf-8');
  const inicioJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'js', 'inicio.js'), 'utf-8');
  assert.ok(coreJs.includes("!url.startsWith('/api/change-password')"), '401 em change-password não deve deslogar o painel');
  assert.match(inicioJs, /await api\('POST', setup \? '\/api\/setup' : '\/api\/login', d\);\s*S\.authed = true;\s*S\.configured = true;\s*S\._booted = false;\s*await go\(\);/);

  // Criar imóvel para deixar carteira pronta
  const created = await sheets.createProperty({ tipo: 'Apartamento', setor: 'Setor Bueno', valor: 700000 });
  assert.ok(created.id);
});

test('Agente 2 E2E: rotas HTML / e /dia-a-dia, assets versionados, CSP e proteção contra race de filtro', async t => {
  const srv = http.createServer(app);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => srv.close(r)));
  const base = `http://127.0.0.1:${srv.address().port}`;

  const jsModulos = ['core', 'ui', 'inicio', 'dia', 'carteira', 'vitrine', 'pdf', 'busca', 'clientes', 'config'].map(n => `/assets/js/${n}.js`);

  for (const p of ['/', '/dia-a-dia']) {
    const r = await fetch(`${base}${p}`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-security-policy') || '', /script-src 'self'/);
    assert.match(r.headers.get('cache-control') || '', /no-store/);
    const html = await r.text();
    assert.match(html, /\/assets\/biga-art\.js\?v=/);
    assert.match(html, /\/assets\/vendor\/konva\.min\.js\?v=/);
    assert.match(html, /\/assets\/studio-core\.js\?v=/);
    assert.match(html, /\/assets\/capas\.js\?v=/);
    for (const m of jsModulos) assert.match(html, new RegExp(`${m.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\?v=`));
    assert.match(html, /\/assets\/app\.js\?v=/);
    assert.match(html, /\/assets\/app\.css\?v=/);
    assert.match(html, /\/assets\/studio\.css\?v=/);
  }

  for (const asset of ['/assets/app.js', ...jsModulos, '/assets/vendor/konva.min.js', '/assets/studio-core.js', '/assets/capas.js', '/assets/biga-art.js', '/assets/app.css', '/assets/studio.css', '/assets/fontes-google.json']) {
    const r = await fetch(`${base}${asset}`);
    assert.equal(r.status, 200, `Asset ${asset} deve servir 200`);
  }

  const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf-8');
  assert.match(appJs, /async function go\(\) \{\s*clearTimeout\(S\._ft\);/);
  assert.ok(appJs.includes('if (S.route !== rota) return;'), 'Debounce de filtro deve checar se a rota mudou');
});

test('Agente 3 E2E: Carteira CRUD, Vitrine ciclo completo, Quem Procura e Prospecção', async t => {
  const vitrine = require('../src/domain/vitrine');
  const prospeccao = require('../src/domain/prospeccao');
  const radar = require('../src/domain/radar');
  const contacts = require('../src/whatsapp/contacts');

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

  const clientesJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'js', 'clientes.js'), 'utf-8');
  assert.ok(clientesJs.includes('id="selContactsCount"'), 'Contador de contatos selecionados deve ter id selContactsCount');
  assert.ok(clientesJs.includes("cnt.textContent = String(S.selContacts.size)"), 'Clique em contato deve atualizar selContactsCount');
});

test('Agente 4 E2E: API Capas, fontes, SVG BIGA_ART, duplicação de logo e carregamento sem itálico 400', async t => {
  const vm = require('vm');
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

  // Testar biga-art.js e capas.js em contexto sandbox de browser mínimo
  const win = { BIGA_ART: null, BIGA_CAPAS: null, matchMedia: () => ({ matches: false }), addEventListener: () => {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'biga-art.js'), 'utf-8'), { window: win, document: { querySelectorAll: () => [] } });
  assert.match(win.BIGA_ART.bigaSVG('e2e'), /<svg[\s\S]+<\/svg>/);
  assert.match(win.BIGA_ART.skySVG(), /<svg[\s\S]+<\/svg>/);
  assert.match(win.BIGA_ART.miniBiga(), /class="biga-mini"/);

  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'capas.js'), 'utf-8'), { window: win, Set, Map });
  const mPronto = win.BIGA_CAPAS.modeloPronto('minimal', 'story');
  assert.equal(mPronto.camadas.length > 0, true);
  assert.equal(win.BIGA_CAPAS.trocar('Imóvel {preco}', win.BIGA_CAPAS.variaveis({ valor: 500000 })).includes('500.000'), true);

  // API Capas CRUD completo
  const saveRes = await (await fetch(`${base}/api/capas/modelos`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ nome: 'Capas E2E', tamanho: 'quadrado', fundo: '#0D0D0D', camadas: mPronto.camadas })
  })).json();
  assert.equal(saveRes.ok, true);
  const modId = saveRes.modelo.id;

  const listRes = await (await fetch(`${base}/api/capas`, { headers: { cookie } })).json();
  assert.ok(listRes.modelos.some(m => m.id === modId));
  const delRes = await (await fetch(`${base}/api/capas/modelos/${modId}`, { method: 'DELETE', headers: H })).json();
  assert.equal(delRes.ok, true);

  const capasJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'capas.js'), 'utf-8');
  const studioCoreJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'studio-core.js'), 'utf-8');
  assert.ok(capasJs.includes('if (dup.tipo === \'logo\' && E.R.logos[c.id]) E.R.logos[dup.id] = E.R.logos[c.id]'), 'Duplicar logo deve copiar imagem carregada para novo ID');
  assert.ok(capasJs.includes('const ok = italico'), 'carregarFonte só deve tentar ital,wght quando italico estiver ativo');
  assert.ok(studioCoreJs.includes("case 'duplicar':") && studioCoreJs.includes('...copia(c)'), 'studio-core deve duplicar camadas preservando propriedades de logo');
  assert.ok(studioCoreJs.includes('if (italico)') && studioCoreJs.includes(':ital,wght@'), 'studio-core carregarFonte só deve pedir ital,wght quando itálico estiver ativo');
});

test('Agente 5 E2E: PDF 16:9 respeita páginas customizadas, fotos=[], restaurar ficha_16x9, pgTitulo e concorrência', async t => {
  const { FOTOS_DIR } = require('../src/config/paths');
  const fichaPdf = require('../src/pdf/ficha-a4');
  const pdf16x9 = require('../src/pdf/deck16x9/manager');

  const countPdfPages = buf => (buf.toString('latin1').match(/\/Type\s*\/Page\b(?!s)/g) || []).length;

  const srv = http.createServer(app);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => srv.close(r)));
  const base = `http://127.0.0.1:${srv.address().port}`;

  fs.mkdirSync(FOTOS_DIR, { recursive: true });
  const JPG = Buffer.from('/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCABkAGQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAYI/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AnQCOaRAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf/2Q==', 'base64');
  fs.writeFileSync(path.join(FOTOS_DIR, 'pdf_e2e_1.jpg'), JPG);
  fs.writeFileSync(path.join(FOTOS_DIR, 'pdf_e2e_2.jpg'), JPG);

  const propCreated = await sheets.createProperty({
    tipo: 'Apartamento', edificio: 'Edifício Original E2E', setor: 'Setor Bueno',
    valor: 920000, quartos: 3, vagas: 2, tamanho_m2: 115,
    fotos: ['pdf_e2e_1.jpg', 'pdf_e2e_2.jpg'], descricao: 'Descrição completa.'
  });
  const pid = propCreated.id;

  const loginRes = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-secretaria': '1' },
    body: JSON.stringify({ senha: process.env.PAINEL_SENHA })
  });
  const cookie = loginRes.headers.get('set-cookie').split(';')[0];
  const H = { 'Content-Type': 'application/json', 'x-secretaria': '1', cookie };

  // Salvar ficha customizada (modelo B, 3 páginas, fotos: [], pgTitulo)
  const pagsCustom = [{ tipo: 'capa' }, { tipo: 'resumo' }, { tipo: 'texto', titulo: 'Acabamento E2E' }, { tipo: 'contato' }];
  const saveRes = await (await fetch(`${base}/api/pdf/${pid}`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      titulo: 'Título Editado E2E',
      modelo: 'B',
      paleta: 'segunda',
      corretor: 'Corretor E2E',
      telefone: '62999998888',
      fotos: [],
      paginas: pagsCustom
    })
  })).json();
  assert.equal(saveRes.ok, true);
  assert.equal(saveRes.ficha.paginas[2].titulo, 'Acabamento E2E');

  // Duas gerações concorrentes via HTTP devem usar paginas e retornar PDF válido sem .tmp preso
  const [buf1, buf2] = await Promise.all([
    fetch(`${base}/api/pdf/${pid}/arquivo`, { method: 'POST', headers: H, body: JSON.stringify({}) }).then(async r => Buffer.from(await r.arrayBuffer())),
    fetch(`${base}/api/pdf/${pid}/arquivo`, { method: 'POST', headers: H, body: JSON.stringify({ modelo: 'D', paginas: [{ tipo: 'capa' }, { tipo: 'resumo' }] }) }).then(async r => Buffer.from(await r.arrayBuffer()))
  ]);
  assert.equal(buf1.slice(0, 4).toString(), '%PDF');
  assert.equal(buf2.slice(0, 4).toString(), '%PDF');
  assert.equal(countPdfPages(buf1), 4, 'PDF deve respeitar as 4 páginas customizadas');
  assert.equal(countPdfPages(buf2), 2, 'PDF deve respeitar override de 2 páginas');

  // Restaurar deve limpar TAMBÉM fichas_16x9.json (titulo, modelo, paleta e paginas)
  const restRes = await (await fetch(`${base}/api/pdf/${pid}`, { method: 'POST', headers: H, body: JSON.stringify({ restaurar: true }) })).json();
  assert.equal(restRes.ok, true);
  assert.equal(restRes.ficha.titulo, 'Edifício Original E2E');
  assert.equal(pdf16x9.carregarFichas16x9()[String(pid)], undefined, 'fichas_16x9.json deve remover overrides ao restaurar');

  // A4 fallback sem fotos e validação de photos=[]
  assert.equal((await fichaPdf.gerar({ id: 'semfoto', tipo: 'Casa', setor: 'Sul', valor: 500000, fotos: [] })).slice(0, 4).toString(), '%PDF');
  assert.equal(pdf16x9.resolverFotosLocais(propCreated, { fotos: [] }).length, 0, 'Array vazio de fotos deve ser respeitado');

  const pdfJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'js', 'pdf.js'), 'utf-8');
  assert.ok(pdfJs.includes('BIGA_STUDIO.montar'), 'pdf.js deve montar o editor visual BIGA_STUDIO');
  assert.ok(pdfJs.includes('serializarCenaComTelemetria'), 'pdf.js deve serializar cena com telemetria Konva 1:1');
  assert.ok(pdfJs.includes('/api/pdf/modelos'), 'pdf.js deve integrar modelos próprios em /api/pdf/modelos');
  assert.ok(pdfJs.includes('/api/pdf/${encodeURIComponent(S.pdfSel)}/arquivo'), 'pdf.js deve gerar arquivo via /api/pdf/:id/arquivo');
});

test('Agente 6 E2E: Cérebro extremo, Busca/Garimpo com fallback 502/429/timeout, atendimento e scheduler limpo', async t => {
  const { analyzeMessageAndMatch } = require('../src/domain/matcher');
  const garimpo = require('../src/domain/garimpo');
  const scheduler = require('../src/domain/scheduler');
  const daily = require('../src/whatsapp/atendimento-diario');
  const anuncios = require('../src/domain/anuncios');

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

  // Entradas extremas no Cérebro/Matcher
  await sheets.createProperty({ tipo: 'Apartamento', setor: 'Setor Bueno', valor: 800000, quartos: 3 });
  const inv = await sheets.loadInventory();
  for (const txt of ['', '🏠🏢✨ '.repeat(400), 'Procuro apto 3qts setro marista até 1mi']) {
    const resMatch = await analyzeMessageAndMatch(txt, 'Corretor', inv, { useAi: false });
    assert.ok(resMatch && typeof resMatch.decision === 'string');
  }

  // Simulador + Busca Inteligente com mock HTTP (sucesso e falha 429/502)
  anuncios.registrar({
    id: 'e2e-ag6-1',
    texto: 'VENDO Apartamento 3 quartos Setor Bueno R$ 850 mil 110 m2',
    grupo: 'Grupo E2E',
    grupoId: 'g-e2e@g.us',
    autor: 'Parceiro',
    telefone: '62988887777'
  });

  const realFetch = global.fetch;
  const prevTavily = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = 'tvly-e2e-test';
  let mode = '502';
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1:')) return realFetch(url, opts);
    if (mode === '502') return new Response('Bad Gateway', { status: 502 });
    return new Response(JSON.stringify({ web: { results: [] } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const buscaRes = await (await fetch(`${base}/api/busca`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ filtros: { tipo: 'Apartamento', bairro: 'Setor Bueno', cidade: 'Goiânia', valorMax: '900 mil' } })
    })).json();
    assert.equal(buscaRes.ok, true, 'Busca não deve falhar com HTTP 500 mesmo se provedor externo retornar 502');
    assert.ok(buscaRes.busca.grupos.length >= 1, 'Deve encontrar o anúncio na memória dos grupos');

    const garRes = await garimpo.run({
      inventory: inv,
      env: { BRAVE_API_KEY: 'brave-e2e' },
      pausaMs: 0,
      fetcher: async () => new Response('Rate limit', { status: 429 })
    });
    assert.equal(garRes.ok, true, 'Garimpo deve degradar com elegância em HTTP 429');
    assert.ok(Array.isArray(garRes.erros) && garRes.erros.length > 0);
  } finally {
    global.fetch = realFetch;
    process.env.TAVILY_API_KEY = prevTavily || '';
  }

  // Garimpo chaves rejeita CX inválido + Scheduler start/stop limpo + daily
  const badKey = await fetch(`${base}/api/garimpo/chaves`, { method: 'POST', headers: H, body: JSON.stringify({ googleCx: 'invalid!@#' }) });
  assert.equal(badKey.status, 400);
  assert.equal(typeof daily.getPeriodGreeting(), 'string');
  scheduler.start({ isConnected: () => false }, () => {});
  scheduler.stop();
});

test('Agente 7 E2E: saúde, métricas, backup/restore com capas.json e shutdown()', async t => {
  const zlib = require('zlib');
  const capas = require('../src/domain/capas');

  const srv = http.createServer(app);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => srv.close(r)));
  const base = `http://127.0.0.1:${srv.address().port}`;

  // Saúde pública
  const ping = await (await fetch(`${base}/ping`)).json();
  assert.equal(ping.ok, true);
  const health = await (await fetch(`${base}/health`)).json();
  assert.equal(health.ok, true);

  // Login e validação de status/sistema
  const loginRes = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-secretaria': '1' },
    body: JSON.stringify({ senha: process.env.PAINEL_SENHA })
  });
  const cookie = loginRes.headers.get('set-cookie').split(';')[0];

  const st = await (await fetch(`${base}/api/status`, { headers: { cookie } })).json();
  assert.ok(st.hoje && Array.isArray(st.semana));
  const sys = await (await fetch(`${base}/api/sistema`, { headers: { cookie } })).json();
  assert.equal(typeof sys.versao, 'string');

  // Salvar modelo de capa e confirmar inclusão no backup + restauração completa
  capas.salvar({
    nome: 'Capa E2E Agente 7',
    tamanho: 'feed',
    fundo: '#111111',
    camadas: [{ tipo: 'retangulo', x: 0, y: 0, w: 100, h: 100 }]
  });
  const bkRes = await fetch(`${base}/api/backup`, { headers: { cookie } });
  assert.equal(bkRes.status, 200);
  const bkBuf = Buffer.from(await bkRes.arrayBuffer());
  const bkJson = JSON.parse(zlib.gunzipSync(bkBuf).toString('utf-8'));
  assert.ok(bkJson.arquivos && bkJson.arquivos['capas.json'], 'Backup deve conter capas.json');
  assert.ok(Buffer.from(bkJson.arquivos['capas.json'], 'base64').toString('utf-8').includes('Capa E2E Agente 7'));

  const capasFile = path.join(process.env.DATA_DIR, 'capas.json');
  fs.rmSync(capasFile, { force: true });

  const formOk = new FormData();
  formOk.append('backup', new Blob([bkBuf]), 'backup.json.gz');
  const restOk = await fetch(`${base}/api/restore`, {
    method: 'POST',
    headers: { cookie, 'x-secretaria': '1' },
    body: formOk
  });
  assert.equal(restOk.status, 200);
  assert.equal(fs.existsSync(capasFile), true);
  assert.ok(fs.readFileSync(capasFile, 'utf-8').includes('Capa E2E Agente 7'));

  const formBad = new FormData();
  formBad.append('backup', new Blob([Buffer.from('nao-e-gzip')]), 'lixo.gz');
  const restBad = await fetch(`${base}/api/restore`, {
    method: 'POST',
    headers: { cookie, 'x-secretaria': '1' },
    body: formBad
  });
  assert.equal(restBad.status, 400);

  // shutdown() exportado e usado corretamente no index.js
  assert.equal(typeof shutdown, 'function');
  const idxSrc = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf-8');
  assert.ok(idxSrc.includes('shutdown: appShutdown'), 'index.js deve importar shutdown de src/app');
  assert.equal(/app\.shutdown/.test(idxSrc), false, 'index.js não deve chamar app.shutdown');
});
