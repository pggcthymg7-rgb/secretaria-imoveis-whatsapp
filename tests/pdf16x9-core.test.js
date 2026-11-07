'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const { lum, contraste, derivar, conferir } = require('../src/pdf16x9/kit');
const { tipoNeg, preco, destaques, waLink, formatarFone, paragrafos, VAZIO } = require('../src/pdf16x9/dados');
const { gerar, COMPATIVEIS, MODELOS } = require('../src/pdf16x9/gerar');

const DIR_FONTES = path.join(__dirname, '..', 'fonts');
function carregarFontes() {
  const out = {};
  for (const f of fs.readdirSync(DIR_FONTES)) {
    if (f.endsWith('.ttf')) out[f.replace(/\.ttf$/, '')] = fs.readFileSync(path.join(DIR_FONTES, f));
  }
  return out;
}

test('PDF 16:9 Core: cálculo de luminosidade e contraste WCAG', () => {
  const cBrancoPreto = contraste('#FFFFFF', '#000000');
  assert.ok(cBrancoPreto >= 20, 'contraste branco/preto deve ser ~21:1');
  const paletaBase = {
    fundo: '#0E0E0F',
    texto: '#ECE9E2',
    principal: '#2A2A2D',
    secundaria: '#8C8A84',
    destaque: '#C8A15A'
  };
  const derivada = derivar(paletaBase);
  assert.ok(derivada['sobre-principal'], 'calcula sobre-principal');
  assert.ok(derivada['qr-claro'] && derivada['qr-escuro'], 'calcula qr');
  const auditoria = conferir(paletaBase);
  assert.ok(auditoria.length >= 5, 'confere pares de contraste');
});

test('PDF 16:9 Core: regras de conteúdo, ágio, venda ou aluguel e limites de destaques', () => {
  assert.equal(tipoNeg({ tipo: 'Casa', neg: 'VENDA_ALUGUEL' }), 'Casa para venda ou aluguel');
  assert.deepEqual(preco({ agio: 'R$ 150.000', valor: 'R$ 800.000' }), ['ÁGIO', 'R$ 150.000']);
  assert.deepEqual(preco({ neg: 'VENDA_ALUGUEL', valor: 'R$ 1.200.000' }), ['Venda ou aluguel', 'R$ 1.200.000']);
  assert.deepEqual(preco({ valor: '' }), ['', 'Sob consulta']);

  // Destaques: mais de 6 mostra 6 e "+N"
  const featsLongos = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'];
  const resDestaques = destaques({ permuta: true, financ: true, lazer: true, feats: featsLongos });
  // total = 3 + 9 = 12 destaques -> deve mostrar 6 e "+6"
  assert.equal(resDestaques.length, 7);
  assert.equal(resDestaques[6], '+6');

  // WhatsApp wa.me
  assert.equal(waLink('62900000000'), 'https://wa.me/5562900000000');
  assert.equal(waLink(''), '');
  assert.match(formatarFone('62900000000'), /\(62\).*90000-0000/);
});

test('PDF 16:9 Core: geração dos 5 modelos (A, B, D, E, F) x 2 paletas com PDFKit', async () => {
  const fontes = carregarFontes();
  const modelos = ['A', 'B', 'D', 'E', 'F'];
  const dados = {
    ...VAZIO,
    tipo: 'Apartamento',
    edificio: 'Residencial Biga Teste',
    setor: 'Setor Bueno',
    cidade: 'Goiânia',
    quartos: '3',
    suites: '3',
    vagas: '2',
    area: '120',
    valor: 'R$ 950.000',
    desc: 'Apartamento amplo e decorado em excelente localização.',
    corretor: 'João da Silva',
    fone: '62900000000',
    creci: '12345'
  };

  for (const mod of modelos) {
    for (const paleta of ['principal', 'segunda']) {
      const { doc, info } = gerar(PDFDocument, QRCode, {
        modelo: mod,
        paleta,
        dados,
        fontes
      });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      await new Promise(r => doc.on('end', r));
      const buf = Buffer.concat(chunks);
      assert.equal(buf.slice(0, 4).toString(), '%PDF', `Modelo ${mod} (${paleta}) gera PDF válido`);
      assert.ok(info.paginas >= 2, `Modelo ${mod} gerou ao menos 2 páginas (${info.paginas})`);
    }
  }
});

test('PDF 16:9 Core: omissão de página de contato quando sem corretor e sem telefone', async () => {
  const fontes = carregarFontes();
  const dadosSemContato = {
    ...VAZIO,
    tipo: 'Casa',
    edificio: 'Jardins Valência',
    valor: 'R$ 2.500.000',
    corretor: '',
    fone: ''
  };

  const { doc, info } = gerar(PDFDocument, QRCode, {
    modelo: 'A',
    paleta: 'principal',
    dados: dadosSemContato,
    fontes
  });
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  await new Promise(r => doc.on('end', r));
  const buf = Buffer.concat(chunks);
  assert.equal(buf.slice(0, 4).toString(), '%PDF');
  assert.ok(info.avisos.some(a => /sem nome e sem telefone/.test(a)), 'registra aviso de omissão de contato');
});

test('PDF 16:9 Core: texto longo (até 2000 caracteres) continua em nova página (máximo 2 páginas de texto)', async () => {
  const fontes = carregarFontes();
  const textoLongo = ('Excelente oportunidade no melhor setor de Goiânia. Vista panorâmica, sol da manhã, acabamento refinado em porcelanato e granito. ').repeat(15).slice(0, 1970);
  const dados = {
    ...VAZIO,
    tipo: 'Cobertura',
    edificio: 'Nexus',
    valor: 'R$ 3.000.000',
    desc: textoLongo,
    corretor: 'João da Silva',
    fone: '62900000000'
  };

  const { doc, info } = gerar(PDFDocument, QRCode, {
    modelo: 'A',
    paleta: 'principal',
    dados,
    fontes,
    paginas: [{ tipo: 'texto' }]
  });
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  await new Promise(r => doc.on('end', r));
  assert.ok(info.paginas >= 1 && info.paginas <= 2, `2000 caracteres ocupam no máx 2 páginas (ocupou ${info.paginas})`);
});
