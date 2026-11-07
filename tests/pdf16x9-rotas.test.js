'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { prop } = require('./helpers');
const { FOTOS_DIR } = require('../src/paths');
const { gerarPdfComFallback, carregarKit, salvarKit } = require('../src/pdf16x9/manager');

test('PDF 16:9 Rotas & Integração: gerarPdfComFallback atende imóvel com fotos reais e gera PDF válido', async () => {
  fs.mkdirSync(FOTOS_DIR, { recursive: true });
  const JPG_VALIDO = Buffer.from('/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCABkAGQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAYI/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AnQCOaRAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf/2Q==', 'base64');
  fs.writeFileSync(path.join(FOTOS_DIR, 'casa1.jpg'), JPG_VALIDO);
  fs.writeFileSync(path.join(FOTOS_DIR, 'casa2.jpg'), JPG_VALIDO);

  const p = prop({
    id: '881',
    tipo: 'Casa de condomínio',
    edificio: 'Jardins Viena',
    setor: 'Jardins Viena',
    valor: 3500000,
    quartos: 4,
    suites: 4,
    vagas: 3,
    tamanho_m2: 380,
    fotos: ['casa1.jpg', 'casa2.jpg'],
    descricao: 'Casa térrea moderna com piscina aquecida e espaço gourmet integrado.'
  });

  const res = await gerarPdfComFallback(p, {
    modelo: 'B',
    paleta: 'principal',
    ficha: {
      titulo: 'Casa Térrea Jardins Viena',
      corretor: 'João Gabriel',
      telefone: '62983443060'
    }
  });

  assert.equal(res.buffer.slice(0, 4).toString(), '%PDF', 'PDF válido');
  assert.equal(res.isFallback, false);
  assert.match(res.nomeArquivo, /\.pdf$/i);
});

test('PDF 16:9 Rotas & Integração: KIT de marca salva e recupera dados aditivos sem quebrar base antiga', () => {
  const kitInicial = carregarKit();
  assert.ok(kitInicial.marca);

  const novoKit = salvarKit({
    marca: 'Biga Premium',
    corretor: 'João Corretor',
    telefone: '62999998888',
    modelo: 'F'
  });
  assert.equal(novoKit.marca, 'Biga Premium');
  assert.equal(novoKit.modelo, 'F');

  const kitRecarregado = carregarKit();
  assert.equal(kitRecarregado.marca, 'Biga Premium');
});
