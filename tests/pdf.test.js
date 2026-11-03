// Ficha em PDF: guarda para as atualizações do pdfkit (o Dependabot passa "verde" sem isto)
require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { FOTOS_DIR } = require('../src/paths');
const { buildPropertyPdf } = require('../src/pdf');

// PNG 1x1 válido
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const imovel = { id: 7, tipo: 'Apartamento', setor: 'Setor Marista', valor: 1200000, quartos: 3, suites: 2, vagas: 2, tamanho_m2: 120, descricao: 'Apto 3 quartos, nascente. Ação à vista – até 5% de desconto.', fotos: [] };

test('PDF da ficha do imóvel: gera um PDF válido, com e sem foto', async () => {
  fs.mkdirSync(FOTOS_DIR, { recursive: true });
  fs.writeFileSync(path.join(FOTOS_DIR, 'pdf-teste.png'), PNG);
  for (const prop of [imovel, { ...imovel, fotos: ['pdf-teste.png'] }]) {
    const buf = await buildPropertyPdf(prop, { telefone: '5562999999999' });
    assert.ok(Buffer.isBuffer(buf) && buf.length > 1000);
    assert.equal(buf.slice(0, 5).toString(), '%PDF-');
    assert.ok(buf.slice(-16).toString().includes('%%EOF'));
  }
});
