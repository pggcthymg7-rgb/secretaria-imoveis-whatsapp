// Alertas do CodeQL (04/11/2026): regex lenta, Bearer, protótipo no vitrine e rota do painel
const { tmp } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Chaves coladas: aspas, prefixo e espaços saem como antes — e em tempo linear (a regex antiga era quadrática)', () => {
  const g = require('../src/integrations/gemini/chave');
  const b = require('../src/integrations/busca/chaves');
  assert.equal(g.limparChave('  "AIzaSyABC DEF"  '), 'AIzaSyABCDEF');
  assert.equal(g.limparChave('GEMINI_API_KEY=AIzaSyABC'), 'AIzaSyABC');
  assert.equal(g.limparChave(`'\`"x"\`'`), 'x');
  assert.equal(g.limparChave(null), '');
  assert.equal(b.limparChave("'APIFY_API_TOKEN=abc'"), 'APIFY_API_TOKEN=abc', 'aspas fora do prefixo: mesmo resultado de antes');
  assert.equal(b.limparChave('APIFY_API_TOKEN=abc'), 'abc');
  const enorme = 'a' + "'".repeat(300000) + 'b';
  for (const limpar of [g.limparChave, b.limparChave]) {
    const t = Date.now();
    assert.equal(limpar(enorme), enorme);
    assert.ok(Date.now() - t < 500, 'a versão antiga levava ~1,7 s com só 40 mil aspas');
  }
});

test('Bearer: token certo entra, errado não, e cabeçalho enorme não trava', () => {
  process.env.API_TOKEN = 'token-de-teste-bem-comprido-123';
  const auth = require('../src/config/auth');
  const req = h => ({ headers: { authorization: h } });
  assert.equal(auth.isAuthenticated(req('Bearer token-de-teste-bem-comprido-123')), true);
  assert.equal(auth.isAuthenticated(req('bearer   token-de-teste-bem-comprido-123')), true, 'maiúscula/minúscula e vários espaços');
  assert.equal(auth.isAuthenticated(req('Bearer outro-token-qualquer-123456')), false);
  assert.equal(auth.isAuthenticated(req('Bearer token-de-teste-bem-comprido-1234')), false);
  assert.equal(auth.isAuthenticated(req('Bearer curto')), false);
  assert.equal(auth.isAuthenticated(req('Bearer')), false);
  const t = Date.now();
  assert.equal(auth.isAuthenticated(req('Bearer' + ' '.repeat(200000) + '\u0000')), false);
  assert.ok(Date.now() - t < 500);
});

test('Vitrine: id "__proto__" ou "constructor" não mexe em Object.prototype', () => {
  const vitrine = require('../src/domain/vitrine');
  assert.equal(vitrine.setStatus('__proto__', 'APROVADO'), null);
  assert.equal(vitrine.setStatus('constructor', 'APROVADO'), null);
  assert.equal(({}).status, undefined, 'Object.prototype.status não pode existir');
  assert.equal(({}).aprovadoEm, undefined);
  assert.doesNotThrow(() => vitrine.removePost('__proto__'));
  // fluxo normal continua igual
  const p = vitrine.upsertPost({ id: 'abc123', tipo: 'Apartamento', setor: 'Setor Marista', valor: 900000, fotos: [] });
  assert.equal(p.status, 'PENDENTE');
  assert.equal(vitrine.setStatus('abc123', 'APROVADO').status, 'APROVADO');
  vitrine.removePost('abc123');
  assert.equal(vitrine.setStatus('abc123', 'APROVADO'), null);
});

function lerPainelFrontend() {
  const pub = path.join(__dirname, '..', 'src', 'public');
  const modNomes = ['core', 'ui', 'inicio', 'dia', 'carteira', 'vitrine', 'pdf', 'busca', 'clientes', 'config'];
  const modulos = modNomes.map(n => ({ nome: `js/${n}.js`, src: fs.readFileSync(path.join(pub, 'js', `${n}.js`), 'utf8') }));
  const coreSrc = modulos[0].src;
  const appSrc = fs.readFileSync(path.join(pub, 'app.js'), 'utf8');
  const allPanelSrc = [coreSrc, ...modulos.slice(1).map(m => m.src), appSrc].join('\n');
  return { pub, modulos, coreSrc, appSrc, allPanelSrc };
}

test('Painel (app.js): rota da URL que não é página (#constructor) cai no início e esc() escapa os 5 caracteres', () => {
  const { coreSrc, appSrc, allPanelSrc } = lerPainelFrontend();
  assert.match(coreSrc, /const views = new Map\(\)/, 'rotas num Map: #constructor não é página');
  assert.match(appSrc, /\(views\.get\(S\.route\) \|\| viewHome\)\(\)/);
  assert.match(appSrc, /S\.route = views\.has\(r\) \?/, 'a rota inicial também usa o Map');
  assert.ok(!/views\[/.test(allPanelSrc), 'nenhum acesso views[...] por chave da URL');
  const m = coreSrc.match(/const esc = s =>([\s\S]*?);\n/);
  assert.ok(m, 'esc() encontrada');
  const esc = new Function(`const esc = s =>${m[1]}; return esc;`)();
  assert.equal(esc(`<img src=x onerror="a('&')">`), '&lt;img src=x onerror=&quot;a(&#39;&amp;&#39;)&quot;&gt;');
  assert.equal(esc(null), '');
});

test('Vitrine: nomes do protótipo e id inexistente nunca chegam à atribuição (guarda inline)', () => {
  const vitrine = require('../src/domain/vitrine');
  for (const id of ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'nao-existe', '', undefined, null, {}]) {
    assert.equal(vitrine.setStatus(id, 'APROVADO'), null, `id ${String(id)}`);
  }
  assert.equal(({}).status, undefined);
  assert.equal(({}).aprovadoEm, undefined);
  assert.equal(Object.prototype.status, undefined);
});

test('Agente 2: vitrine.upsertPost e sistema.corretores bloqueiam prototype e esquemas perigosos', () => {
  const vitrine = require('../src/domain/vitrine');
  assert.equal(vitrine.upsertPost({ id: '__proto__' }), null);
  assert.equal(vitrine.upsertPost({ id: 'constructor' }), null);
  assert.equal(({}).texto, undefined);

  const sistema = require('../src/config/sistema');
  fs.writeFileSync(path.join(tmp, 'corretores.json'), JSON.stringify([
    { nome: 'ana', url: 'https://ana.biga.test' },
    { nome: 'evil', url: 'javascript:alert(1)' }
  ]));
  const lista = sistema.corretores();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].nome, 'ana');
});

test('Painel (app.js): campos de filtro gravam em propriedades FIXAS de S (sem S[chave] dinâmica) e a digitação continua funcionando', () => {
  const { appSrc, allPanelSrc } = lerPainelFrontend();
  assert.ok(!/\bS\[[^\]]+\]\s*=/.test(allPanelSrc), 'nenhuma escrita S[chave] = valor');
  assert.match(appSrc, /if \(n === 'busca'\) S\.filtro = e\.target\.value;/);
  assert.match(appSrc, /else if \(n === 'filtroContato'\) S\.filtroContato = e\.target\.value;/);
  assert.match(appSrc, /else S\.filtroBairro = e\.target\.value;/);
  // mesmo comportamento de antes, simulado: cada campo vai para a sua propriedade
  const S = {};
  const digitar = (n, valor) => {
    if (n === 'busca') S.filtro = valor;
    else if (n === 'filtroContato') S.filtroContato = valor;
    else S.filtroBairro = valor;
  };
  digitar('busca', 'casa'); digitar('filtroContato', 'ana'); digitar('filtroBairro', 'marista');
  assert.deepEqual(S, { filtro: 'casa', filtroContato: 'ana', filtroBairro: 'marista' });
});

test('Agente 6: frontend (app.js, js/*.js, capas.js, biga-art.js) sem erros de sintaxe e com sanitização de links, SVG, telefone e viewCarteira', () => {
  const { pub, modulos, coreSrc, appSrc, allPanelSrc } = lerPainelFrontend();
  const capasSrc = fs.readFileSync(path.join(pub, 'capas.js'), 'utf8');
  const artSrc = fs.readFileSync(path.join(pub, 'biga-art.js'), 'utf8');

  new Function(appSrc); // eslint-disable-line no-new-func
  for (const m of modulos) new Function(m.src); // eslint-disable-line no-new-func
  new Function(capasSrc); // eslint-disable-line no-new-func
  new Function(artSrc); // eslint-disable-line no-new-func

  // Helpers obrigatórios de sanitização em js/core.js
  const mh = coreSrc.match(/const safeHref = u => ([^;]+);/);
  const mw = coreSrc.match(/const safeWaPhone = s => ([^;]+);/);
  const mq = coreSrc.match(/const safeQrSvg = s => \{([\s\S]*?)\};/);
  assert.ok(mh && mw && mq, 'helpers safeHref, safeWaPhone e safeQrSvg presentes');

  const safeHref = new Function(`return u => ${mh[1]};`)();
  assert.equal(safeHref('javascript:alert(1)'), '#');
  assert.equal(safeHref('https://zapimoveis.com.br/imovel/1'), 'https://zapimoveis.com.br/imovel/1');

  const safeWaPhone = new Function(`return s => ${mw[1]};`)();
  assert.equal(safeWaPhone('+55 (62) 99999-0000" onclick="alert(1)'), '55629999900001');

  const safeQrSvg = new Function(`return s => {${mq[1]}};`)();
  assert.equal(safeQrSvg('<svg><script>alert(1)</script></svg>'), '');
  assert.equal(safeQrSvg('<svg onload="alert(1)"></svg>'), '');
  assert.equal(safeQrSvg('<svg viewBox="0 0 10 10"><rect/></svg>'), '<svg viewBox="0 0 10 10"><rect/></svg>');

  // Garantia contra XSS não escapado em links e textos do painel
  assert.ok(!allPanelSrc.includes('href="${esc(x.link)}"'), 'x.link deve passar por safeHref');
  assert.ok(!allPanelSrc.includes('href="${esc(l.link)}"'), 'l.link deve passar por safeHref');
  assert.ok(!allPanelSrc.includes('href="${esc(f.url)}"'), 'f.url deve passar por safeHref');
  assert.ok(!allPanelSrc.includes('href="${esc(u)}"'), 'u deve passar por safeHref');
  assert.ok(!allPanelSrc.includes('<span>${f.titulo || f.url}</span>'), 'fontesSoltas deve usar esc()');
  assert.ok(allPanelSrc.includes('pollingEquipe') && allPanelSrc.includes('pollingStatus'), 'pollings devem ter trava anti-reentrância');
});

test('Passada 2: app.shutdown() limpa timers de pdf16x9/rateLimit/anuncios, rotas usam hasOwn e WA cria FOTOS_DIR', () => {
  const pdf16x9 = require('../src/pdf/deck16x9/manager');
  const appMod = require('../src/web/app');
  const waSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'whatsapp', 'client.js'), 'utf8');
  const pdfRoutesSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'web', 'routes', 'pdf.routes.js'), 'utf8');
  const vitrineRoutesSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'web', 'routes', 'vitrine.routes.js'), 'utf8');

  assert.match(waSrc, /fs\.mkdirSync\(FOTOS_DIR,\s*\{\s*recursive:\s*true\s*\}\)/);
  assert.match(pdfRoutesSrc, /Object\.prototype\.hasOwnProperty\.call\(fichas16,\s*pidStr\)/);
  assert.match(vitrineRoutesSrc, /Object\.prototype\.hasOwnProperty\.call\(posts,\s*String\(p\.id\)\)/);

  pdf16x9.agendarPreGeracao({ id: 'passada2_shutdown' }, 60000);
  assert.doesNotThrow(() => appMod.shutdown());
});
