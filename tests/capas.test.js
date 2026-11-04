require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const capas = require('../src/capas');

test('Capas: modelo salvo só com campos conhecidos e números dentro da faixa', () => {
  const r = capas.salvar({
    nome: '<b>Meu</b> modelo',
    tamanho: 'feed',
    fundo: '#171721',
    camadas: [
      { tipo: 'foto', x: 0, y: 0, w: 1080, h: 1350, zoom: 99, brilho: 120, hack: 'x' },
      { tipo: 'texto', texto: '{nome}<script>', fonte: 'Playfair Display', peso: 750, tamanho: 9999, cor: 'red', escalaX: 1.4, escalaY: 0.8, ancora: 'base', onclick: 'alert(1)' },
      { tipo: 'logo', src: 'https://site-externo.com/logo.png' },
      { tipo: 'logo', src: 'data:image/png;base64,iVBORw0KGgo=' },
      { tipo: 'script', x: 1 }
    ]
  });
  assert.equal(r.nome, 'bMeu/b modelo', 'sem < >');
  assert.equal(r.camadas.length, 3, 'logo de URL externa e tipo desconhecido saem');
  const [foto, texto, logo] = r.camadas;
  assert.equal(foto.zoom, 6);
  assert.equal(foto.hack, undefined);
  assert.equal(texto.texto, '{nome}script');
  assert.equal(texto.peso, 800);
  assert.equal(texto.tamanho, 600);
  assert.equal(texto.cor, '#ffffff', 'cor inválida volta ao padrão');
  assert.deepEqual([texto.escalaX, texto.escalaY, texto.ancora], [1.4, 0.8, 'base'], 'escala horizontal e vertical separadas');
  assert.equal(texto.onclick, undefined);
  assert.match(logo.src, /^data:image\/png;base64,/);
  assert.equal(capas.limparCamada({ tipo: 'texto', fonte: 'Inter"; } body{x' }).fonte, 'Inter', 'nome de fonte não injeta CSS');
});

test('Capas: listar, atualizar pelo id, padrão e apagar', () => {
  const a = capas.salvar({ nome: 'A', camadas: [{ tipo: 'retangulo' }], padrao: true });
  assert.equal(capas.listar().padrao, a.id);
  const b = capas.salvar({ id: a.id, nome: 'A2', camadas: [{ tipo: 'degrade' }] });
  assert.equal(b.id, a.id);
  assert.equal(capas.listar().modelos.filter(m => m.id === a.id).length, 1);
  assert.throws(() => capas.salvar({ nome: 'vazio', camadas: [] }), /pelo menos uma camada/);
  assert.equal(capas.apagar(a.id), true);
  assert.equal(capas.listar().padrao, null);
});

test('Painel: editor de capas carregado antes do app, rota "capas" no grupo Imóveis e lista de fontes do Google', () => {
  const pub = path.join(__dirname, '..', 'src', 'public');
  const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
  assert.ok(html.indexOf('/assets/capas.js') > 0 && html.indexOf('/assets/capas.js') < html.indexOf('/assets/app.js'));
  const app = fs.readFileSync(path.join(pub, 'app.js'), 'utf8');
  assert.match(app, /\['capas', 'Capas', [^\]]*'imoveis'/);
  const fontes = JSON.parse(fs.readFileSync(path.join(pub, 'fontes-google.json'), 'utf8'));
  assert.ok(fontes.familias.length > 1000);
  assert.ok(fontes.familias.some(f => f[0] === 'Playfair Display'));
  // o editor roda no navegador: sem erro de sintaxe e com as peças principais
  const js = fs.readFileSync(path.join(pub, 'capas.js'), 'utf8');
  new Function(js); // eslint-disable-line no-new-func
  for (const peca of ['escalaX', 'escalaY', 'EyeDropper', 'loteGerar', 'fonts.googleapis.com', 'ancora']) assert.ok(js.includes(peca), peca);
});
