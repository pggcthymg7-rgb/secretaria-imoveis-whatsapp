'use strict';
require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const capas = require('../src/domain/capas');

const DOZE_MODELOS = [
  'arquitetura-suica',
  'revista-atelier',
  'vitrine-fosca',
  'traco-fino',
  'noite-dourada',
  'essencia-moderna',
  'visao-glass',
  'galeria-prive',
  'manchete-nobre',
  'assinatura-classica',
  'faixa-imperial',
  'moldura-serena'
];

const FORMATOS = {
  feed: [1080, 1350],
  quadrado: [1080, 1080],
  story: [1080, 1920]
};

function carregarStudioECapasVm() {
  const win = {
    BIGA_STUDIO: null,
    BIGA_CAPAS: null,
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {}
  };
  const ctx = {
    window: win,
    Set,
    Map,
    Uint8ClampedArray,
    Math,
    Number,
    String,
    Array,
    Object,
    Boolean,
    JSON,
    Date,
    RegExp,
    Error,
    Promise,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent
  };
  const pub = path.join(__dirname, '..', 'src', 'public');
  vm.runInNewContext(fs.readFileSync(path.join(pub, 'studio-core.js'), 'utf8'), ctx);
  vm.runInNewContext(fs.readFileSync(path.join(pub, 'capas.js'), 'utf8'), ctx);
  return win;
}

test('1. domain/capas: até 10 slides, lista branca 10 tipos + 23 ícones, anti-prototype pollution e compatibilidade legada', () => {
  const criados = [];
  try {
    // 1a. Truncamento de 12 slides para 10
    const slides12 = Array.from({ length: 12 }, (_, i) => ({
      id: `s_${i + 1}`,
      nome: `Slide ${i + 1}`,
      tipo: i === 0 ? 'capa' : 'conteudo',
      fundo: '#171721',
      camadas: [{ tipo: 'texto', texto: `Slide ${i + 1} · {nome}` }]
    }));
    const m10 = capas.salvar({
      nome: 'Carrossel 12->10',
      tamanho: 'feed',
      slides: slides12
    });
    criados.push(m10.id);
    assert.equal(m10.slides.length, 10, '12 slides enviados devem ser truncados para 10');

    // 1b. Lista branca dos 10 tipos de camada e todos os 23 ícones permitidos
    assert.equal(capas.TIPOS.length, 10);
    assert.equal(capas.ICONES_PERMITIDOS.size, 23);

    const camadas10Tipos = [
      { tipo: 'foto', x: 0, y: 0, w: 1080, h: 1350, indiceFoto: 0 },
      { tipo: 'texto', x: 60, y: 100, w: 800, h: 80, texto: '{preco}' },
      { tipo: 'retangulo', x: 60, y: 200, w: 300, h: 120, blurFundo: 12 },
      { tipo: 'circulo', x: 400, y: 200, w: 100, h: 100 },
      { tipo: 'linha', x: 60, y: 350, w: 400, h: 10, pontos: [0, 5, 400, 5] },
      { tipo: 'degrade', x: 0, y: 500, w: 1080, h: 850 },
      { tipo: 'poligono', x: 60, y: 400, w: 200, h: 120, vertices: [{ x: 20, y: 0 }, { x: 200, y: 0 }, { x: 180, y: 120 }, { x: 0, y: 120 }] },
      { tipo: 'icone', iconeId: 'selo-exclusivo', formaFundo: 'pilula' },
      { tipo: 'logo', origem: 'kit', forma: 'circulo' },
      { tipo: 'qrcode', origem: 'custom', url: 'https://wa.me/5562999998888' },
      { tipo: 'iframe_invalido', x: 0, y: 0 }
    ];
    const mTipos = capas.limparModelo({ nome: 'Todos Tipos', tamanho: 'quadrado', camadas: camadas10Tipos });
    assert.equal(mTipos.camadas.length, 10, 'apenas os 10 tipos da lista branca passam');

    for (const ic of capas.ICONES_PERMITIDOS) {
      const cIc = capas.limparCamada({ tipo: 'icone', iconeId: ic });
      assert.equal(cIc.iconeId, ic, `ícone ${ic} deve ser permitido`);
    }
    assert.equal(capas.limparCamada({ tipo: 'icone', iconeId: 'hacker-icon' }).iconeId, 'estrela');

    // 1c. Bloqueio de prototype pollution
    for (const badId of ['__proto__', 'constructor', 'prototype']) {
      assert.throws(() => capas.salvar({ id: badId, nome: 'Evil', camadas: [{ tipo: 'retangulo' }] }), /ID inválido/);
      assert.equal(capas.apagar(badId), false);
    }
    const payloadPollute = JSON.parse('{"nome":"Seguro","__proto__":{"polluted":true},"constructor":{"prototype":{"hack":1}},"camadas":[{"tipo":"retangulo","__proto__":{"x":999},"x":10,"y":10,"w":100,"h":100}]}');
    const modLimpo = capas.salvar(payloadPollute);
    criados.push(modLimpo.id);
    assert.equal(({}).polluted, undefined, 'Object.prototype não pode ser poluído');
    assert.equal(({}).hack, undefined, 'constructor.prototype não pode ser poluído');

    // 1d. Compatibilidade retroativa: payload legado sem `slides` normaliza para slides[0] e espelha na raiz
    const modLegado = capas.limparModelo({
      nome: 'Legado Sem Slides',
      tamanho: 'story',
      fundo: '#12131a',
      camadas: [{ tipo: 'retangulo', x: 20, y: 30, w: 300, h: 120, cor: '#5266eb' }]
    });
    assert.equal(modLegado.largura, 1080);
    assert.equal(modLegado.altura, 1920);
    assert.equal(modLegado.slides.length, 1);
    assert.equal(modLegado.slides[0].id, 's1');
    assert.equal(modLegado.slides[0].fundo, '#12131a');
    assert.equal(modLegado.fundo, '#12131a');
    assert.equal(modLegado.camadas.length, 1);
    assert.equal(modLegado.camadas[0].tipo, 'retangulo');

    const estadoMigrado = capas.normalizarEstado({
      padrao: 'leg1',
      modelos: [{ id: 'leg1', nome: 'Persistido Legado', tamanho: 'feed', fundo: '#171721', camadas: [{ tipo: 'texto', texto: '{nome}' }] }]
    });
    assert.equal(estadoMigrado.modelos.length, 1);
    assert.equal(estadoMigrado.modelos[0].slides.length, 1);
    assert.equal(estadoMigrado.padrao, 'leg1');
  } finally {
    while (criados.length) capas.apagar(criados.pop());
  }
});

test('2. capas.js + studio-core.js (vm): 12 modelos x 3 formatos = 36 combinações, aliases legados e invariantes de estilo', () => {
  const win = carregarStudioECapasVm();
  assert.ok(win.BIGA_STUDIO, 'BIGA_STUDIO carregado no vm');
  assert.ok(win.BIGA_CAPAS, 'BIGA_CAPAS carregado no vm');
  assert.equal(win.BIGA_CAPAS.MODELOS_CAPA.length, 12, 'devem existir exatamente 12 modelos prontos');

  const camposNumericos = ['x', 'y', 'w', 'h', 'rot', 'skewX', 'skewY', 'opacidade', 'tamanho', 'raio', 'borda', 'blurFundo', 'espacamento', 'entrelinha'];

  for (const modeloId of DOZE_MODELOS) {
    for (const [fmt, [W, H]] of Object.entries(FORMATOS)) {
      const m = win.BIGA_CAPAS.modeloPronto(modeloId, fmt);
      assert.equal(m.id, modeloId);
      assert.equal(m.largura, W, `${modeloId}/${fmt} largura`);
      assert.equal(m.altura, H, `${modeloId}/${fmt} altura`);
      assert.ok(Array.isArray(m.camadas) && m.camadas.length >= 4, `${modeloId}/${fmt} deve ter camadas`);
      assert.equal(m.slides.length, 1);

      // Zero NaN / Infinity
      for (const c of m.camadas) {
        for (const k of camposNumericos) {
          if (c[k] !== undefined) {
            assert.equal(Number.isFinite(Number(c[k])), true, `${modeloId}/${fmt} camada "${c.nome}" campo ${k} inválido: ${c[k]}`);
          }
        }
        if (Array.isArray(c.vertices)) {
          for (const v of c.vertices) {
            assert.equal(Number.isFinite(v.x) && Number.isFinite(v.y), true, `${modeloId}/${fmt} vértice inválido`);
          }
        }
        if (Array.isArray(c.pontos)) {
          for (const pt of c.pontos) {
            assert.equal(Number.isFinite(pt), true, `${modeloId}/${fmt} ponto de linha inválido`);
          }
        }
        // Nenhuma camada essencial sai totalmente fora de [0..W, 0..H]
        assert.ok(
          c.x + c.w > 0 && c.x < W && c.y + c.h > 0 && c.y < H,
          `${modeloId}/${fmt} camada "${c.nome}" fora do retângulo [${W}x${H}]`
        );
        assert.ok(
          c.x >= 0 && c.y >= 0 && c.x + c.w <= W + 2 && c.y + c.h <= H + 4,
          `${modeloId}/${fmt} camada "${c.nome}" extrapola limites [${c.x},${c.y},${c.w},${c.h}] em [${W}x${H}]`
        );
      }

      // Textos utilizam tokens de Campos Inteligentes
      const textos = m.camadas.filter(c => c.tipo === 'texto').map(c => c.texto).join(' ');
      assert.ok(textos.includes('{preco}'), `${modeloId}/${fmt} deve exibir {preco}`);
      assert.ok(textos.includes('{nome}') || textos.includes('{nomeDestaque}'), `${modeloId}/${fmt} deve exibir {nome} ou {nomeDestaque}`);
      assert.ok(
        /\{(localizacao|bairro|cidade)\}/.test(textos),
        `${modeloId}/${fmt} deve exibir token de localização`
      );

      // Invariantes de estilo por modelo
      if (modeloId === 'vitrine-fosca' || modeloId === 'visao-glass') {
        assert.ok(
          m.camadas.some(c => c.tipo === 'retangulo' && Number(c.blurFundo) > 0),
          `${modeloId}/${fmt} deve possuir blurFundo > 0`
        );
      }
      if (modeloId === 'essencia-moderna') {
        assert.ok(
          m.camadas.some(c => c.tipo === 'poligono' && Array.isArray(c.vertices) && c.vertices.length === 4),
          `${modeloId}/${fmt} deve possuir card chanfrado poligonal 4pt`
        );
        const logoEss = m.camadas.find(c => c.tipo === 'logo');
        assert.ok(logoEss && logoEss.ocultarSemLogo === true, `${modeloId}/${fmt} deve ocultar monograma sem logo`);
      }
      if (modeloId === 'traco-fino') {
        const logoTf = m.camadas.find(c => c.tipo === 'logo');
        assert.ok(logoTf && logoTf.ocultarSemLogo === true, `${modeloId}/${fmt} deve ocultar monograma sem logo`);
      }
      if (modeloId === 'arquitetura-suica') {
        const fotoArq = m.camadas.find(c => c.tipo === 'foto');
        assert.ok(fotoArq && fotoArq.x === 0 && fotoArq.y === 0 && fotoArq.w === W && fotoArq.h === H, `${modeloId}/${fmt} foto deve ser full-bleed`);
        assert.ok(
          m.camadas.filter(c => c.tipo === 'linha').length >= 2,
          `${modeloId}/${fmt} deve possuir divisores estruturais`
        );
      }
      if (modeloId === 'manchete-nobre') {
        const manchete = m.camadas.find(c => c.tipo === 'texto' && c.texto === 'À VENDA');
        assert.ok(manchete && Math.abs((manchete.x + manchete.w / 2) - W / 2) <= 1, `${modeloId}/${fmt} À VENDA deve estar centralizada em W/2`);
      }
      if (modeloId === 'visao-glass') {
        const precoCam = m.camadas.find(c => c.tipo === 'texto' && c.texto === '{preco}');
        assert.ok(precoCam && precoCam.x + precoCam.w === W - Math.round(W * 0.055), `${modeloId}/${fmt} preço alinhado à margem segura direita`);
      }
      if (modeloId === 'faixa-imperial') {
        assert.ok(
          m.camadas.some(c => c.tipo === 'retangulo' && /faixa/i.test(c.nome)),
          `${modeloId}/${fmt} deve possuir faixa inferior`
        );
      }
    }
  }

  // Aliases legados
  assert.equal(win.BIGA_CAPAS.modeloPronto('classico', 'feed').id, 'assinatura-classica');
  assert.equal(win.BIGA_CAPAS.modeloPronto('faixa', 'quadrado').id, 'faixa-imperial');
  assert.equal(win.BIGA_CAPAS.modeloPronto('minimal', 'story').id, 'moldura-serena');

  // Substituição de tokens em dados reais
  const vars = win.BIGA_CAPAS.variaveis({
    id: 55,
    tipo: 'Cobertura',
    edificio: 'Jardim Veneza',
    setor: 'Setor Marista',
    valor: 2400000,
    quartos: 4,
    suites: 4,
    vagas: 3,
    tamanho_m2: 260
  }, { marca: 'Horizonte', corretor: 'Giovana', telefone: '62999887766' });
  const resolvido = win.BIGA_CAPAS.trocar('{nomeKicker} {nomeDestaque} · {preco} · {bairro}', vars);
  assert.ok(resolvido.includes('Jardim Veneza'));
  assert.ok(resolvido.includes('2.400.000'));
  assert.ok(resolvido.includes('Setor Marista'));
  assert.equal(/\{[a-z]+\}/i.test(resolvido), false);

  // Zero rótulos órfãos quando suites/vagas estiverem vazios/zero
  const varsParc = win.BIGA_CAPAS.variaveis({
    id: 56,
    tipo: 'Apartamento',
    setor: 'Setor Bueno',
    valor: 580000,
    quartos: 2,
    suites: 0,
    vagas: 0,
    tamanho_m2: 62
  }, {});
  const specsLimpas = win.BIGA_CAPAS.trocar('{quartos} qts · {suites} suítes · {area} · {vagas} vagas', varsParc);
  assert.equal(specsLimpas, '2 qts · 62 m²');
  assert.equal(/su[ií]tes|vagas/i.test(specsLimpas), false, 'não deve imprimir rótulos órfãos quando valor for zero/vazio');

  const specsVertLimpas = win.BIGA_CAPAS.trocar('{area}\n{quartos} Quartos\n{suites} Suítes\n{vagas} Vagas', varsParc);
  assert.equal(specsVertLimpas, '62 m²\n2 Quartos');
});
