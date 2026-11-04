// Alertas do CodeQL (04/11/2026): regex lenta, Bearer, protótipo no vitrine e rota do painel
require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Chaves coladas: aspas, prefixo e espaços saem como antes — e em tempo linear (a regex antiga era quadrática)', () => {
  const g = require('../src/gemini-chave');
  const b = require('../src/busca-chaves');
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
  const auth = require('../src/auth');
  const req = h => ({ headers: { authorization: h } });
  assert.equal(auth.isAuthenticated(req('Bearer token-de-teste-bem-comprido-123')), true);
  assert.equal(auth.isAuthenticated(req('bearer   token-de-teste-bem-comprido-123')), true, 'maiúscula/minúscula e vários espaços');
  assert.equal(auth.isAuthenticated(req('Bearer outro-token-qualquer-123456')), false);
  assert.equal(auth.isAuthenticated(req('Bearer')), false);
  const t = Date.now();
  assert.equal(auth.isAuthenticated(req('Bearer' + ' '.repeat(200000) + '\u0000')), false);
  assert.ok(Date.now() - t < 500);
});

test('Vitrine: id "__proto__" ou "constructor" não mexe em Object.prototype', () => {
  const vitrine = require('../src/vitrine');
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

test('Painel (app.js): rota da URL que não é página (#constructor) cai no início e esc() escapa os 5 caracteres', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');
  assert.match(src, /const views = new Map\(Object\.entries\(/, 'rotas num Map: #constructor não é página');
  assert.match(src, /\(views\.get\(S\.route\) \|\| viewHome\)\(\)/);
  assert.match(src, /S\.route = views\.has\(r\) \?/, 'a rota inicial também usa o Map');
  assert.ok(!/views\[/.test(src), 'nenhum acesso views[...] por chave da URL');
  const m = src.match(/const esc = s =>([\s\S]*?);\n/);
  assert.ok(m, 'esc() encontrada');
  const esc = new Function(`const esc = s =>${m[1]}; return esc;`)();
  assert.equal(esc(`<img src=x onerror="a('&')">`), '&lt;img src=x onerror=&quot;a(&#39;&amp;&#39;)&quot;&gt;');
  assert.equal(esc(null), '');
});

test('Vitrine: nomes do protótipo e id inexistente nunca chegam à atribuição (guarda inline)', () => {
  const vitrine = require('../src/vitrine');
  for (const id of ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'nao-existe', '', undefined, null, {}]) {
    assert.equal(vitrine.setStatus(id, 'APROVADO'), null, `id ${String(id)}`);
  }
  assert.equal(({}).status, undefined);
  assert.equal(({}).aprovadoEm, undefined);
  assert.equal(Object.prototype.status, undefined);
});

test('Painel (app.js): campos de filtro gravam em propriedades FIXAS de S (sem S[chave] dinâmica) e a digitação continua funcionando', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');
  assert.ok(!/\bS\[[^\]]+\]\s*=/.test(src), 'nenhuma escrita S[chave] = valor');
  assert.match(src, /if \(n === 'busca'\) S\.filtro = e\.target\.value;/);
  assert.match(src, /else if \(n === 'filtroContato'\) S\.filtroContato = e\.target\.value;/);
  assert.match(src, /else S\.filtroBairro = e\.target\.value;/);
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
