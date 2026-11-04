require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { prop } = require('./helpers');
const { FOTOS_DIR } = require('../src/paths');
const fichaPdf = require('../src/pdf-ficha');

// JPEG mínimo válido (1x1) para a capa e a galeria
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

test('Ficha PDF: padrão vem da carteira (descrição completa, diferenciais) e gera PDF com galeria', async () => {
  fs.mkdirSync(FOTOS_DIR, { recursive: true });
  for (const n of ['f1.jpg', 'f2.jpg', 'f3.jpg']) fs.writeFileSync(path.join(FOTOS_DIR, n), JPG);
  const longa = 'Decorado, varanda gourmet com piscina privativa. ' + 'Texto longo do imóvel. '.repeat(300) + 'FIM.';
  const p = prop({ id: '77', tipo: 'Apartamento', setor: 'Setor Marista', edificio: 'Aurora', quartos: 3, suites: 3, vagas: 2, tamanho_m2: 190, valor: 1850000, fotos: ['f1.jpg', 'f2.jpg', 'f3.jpg', '../../etc/passwd', 'https://x.com/a.jpg'], descricao: longa });
  const f = fichaPdf.ficha(p);
  assert.equal(f.titulo, 'Aurora');
  assert.ok(f.descricao.endsWith('FIM.'), 'descrição inteira, sem corte');
  assert.deepEqual(f.fotos, ['f1.jpg', 'f2.jpg', 'f3.jpg'], 'só fotos locais (sem caminho nem URL)');
  assert.match(f.destaques, /Piscina privativa/);
  assert.match(f.destaques, /Varanda gourmet/);
  assert.match(f.destaques, /Mobiliado e decorado/);
  const buf = await fichaPdf.gerar(p, f);
  assert.equal(buf.slice(0, 4).toString(), '%PDF');
  const paginas = (buf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
  assert.ok(paginas >= 2, `descrição longa continua em outra página (${paginas})`);
  assert.equal(fichaPdf.nomeArquivo(p, f), 'Aurora_77.pdf');
});

test('Ficha PDF: edições salvas por imóvel (lista branca), contato vale para todas, restaurar volta ao padrão', () => {
  const p = prop({ id: '78', tipo: 'Casa de condomínio', setor: 'Jardins Itália', valor: 4900000 });
  const q = prop({ id: '79', tipo: 'Apartamento', setor: 'Setor Bueno', valor: 500000 });
  const f = fichaPdf.salvar(p, { titulo: 'Casa dos sonhos', cor: 'dourado', corretor: 'João', creci: '123', fotos: ['../segredo.jpg'], hack: 'x', cor2: 'y' });
  assert.equal(f.titulo, 'Casa dos sonhos');
  assert.equal(f.cor, 'dourado');
  assert.deepEqual(f.fotos, []);
  assert.equal(f.hack, undefined);
  assert.equal(fichaPdf.ficha(q).corretor, 'João', 'contato vale para todas as fichas');
  assert.equal(fichaPdf.salvar(p, { cor: 'rosa-choque' }).cor, 'dourado', 'cor fora da lista é ignorada');
  assert.equal(fichaPdf.restaurar(p).titulo, 'Casa de condomínio no Jardins Itália');
  assert.throws(() => fichaPdf.salvar(prop({ id: '__proto__' }), { titulo: 'x' }), /inválido/);
});
