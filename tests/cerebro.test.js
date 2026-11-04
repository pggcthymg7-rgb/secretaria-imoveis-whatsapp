const { prop } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('./fixtures-mensagens-reais');
const { analyzeMessageAndMatch, formatOutreachMessage } = require('../src/matcher');
const { parseRequest } = require('../src/brain/parser');

// Imóvel REAL da carteira que foi enviado por engano para o pedido do "Flat Metropolitan"
const vivaSudoeste = prop({
  id: '6', tipo: 'Apartamento', setor: 'Setor Sudoeste', mobiliado: 'SIM', quartos: 2, tamanho_m2: 62, valor: 380000,
  descricao: 'Apartamento decorado e mobiliado no edificio viva sudoeste 2 quartos sendo uma suite cozinha integrada com sala de TV e lavanderia, varanda gourmet com fechamento de vidro apartamento impecável area de lazer completa condominio R$500,00'
});

async function run(msg, inventory, sender = 'Corretor Teste') {
  return analyzeMessageAndMatch(msg, sender, inventory, { useAi: false });
}

test('Flat Metropolitan/Brookfield NÃO recebe o apê do Viva Sudoeste (erro real)', async () => {
  const r = await run(F.flatMetropolitan, [vivaSudoeste]);
  assert.equal(r.isLookingForProperty, true);
  assert.notEqual(r.decision, 'ENVIAR');
  assert.equal(r.matches.length, 0);
  assert.deepEqual(r.criteria.local.nomesDesconhecidos, ['metropolitan', 'brookfield']);
  assert.equal(r.wantsPdf, true);
});

test('Flat Metropolitan: envia quando há um flat mobiliado no Metropolitan', async () => {
  const flat = prop({ id: '20', tipo: 'Flat', edificio: 'Metropolitan', setor: 'Setor Marista', mobiliado: 'SIM', quartos: 1, tamanho_m2: 35, valor: 320000 });
  const r = await run(F.flatMetropolitan, [vivaSudoeste, flat]);
  assert.equal(r.decision, 'ENVIAR');
  assert.deepEqual(r.matches.map(m => m.id), ['20']);
});

test('Ágio sobrado Jardins Marselha/Lyon: telefone não vira preço e permuta exige confirmação', async () => {
  const c = parseRequest(F.agioSobradoJardins);
  assert.equal(c.agio, true);
  assert.equal(c.valor_max, 500000);
  assert.equal(c.suites_min, 3);
  assert.deepEqual(c.local.condominios.map(x => x.name).sort(), ['Jardins Lyon', 'Jardins Marselha']);
  assert.ok(!c.local.condominios.some(x => /Cidade Verde/.test(x.name)), 'o imóvel oferecido em permuta não é local procurado');

  const sobrado = prop({ id: '30', tipo: 'Sobrado', negociacao: 'AGIO', edificio: 'Jardins Lyon', setor: 'Jardins Lyon', quartos: 3, suites: 3, valor: 1200000, valor_agio: 450000, descricao: 'Sobrado 3 suítes com piscina' });
  let r = await run(F.agioSobradoJardins, [sobrado]);
  assert.equal(r.decision, 'AVISAR', 'sem saber se aceita permuta, só avisa o corretor');
  assert.match(r.doubtReasons.join(' '), /permuta/);

  const sobradoPermuta = { ...sobrado, aceita_permuta: 'SIM' };
  r = await run(F.agioSobradoJardins, [sobradoPermuta]);
  assert.equal(r.decision, 'ENVIAR');

  const vendaNormal = prop({ ...sobrado, id: '31', negociacao: 'VENDA', aceita_permuta: 'SIM' });
  r = await run(F.agioSobradoJardins, [vendaNormal]);
  assert.equal(r.decision, 'SILENCIO', 'pediram ágio, imóvel é venda normal');
});

test('Casa alto padrão sem região: entende "sem região de preferência" e exige todos os itens', async () => {
  const c = parseRequest(F.casaAltoPadrao);
  assert.equal(c.local.qualquer, true);
  assert.equal(c.valor_max, 1100000);
  assert.equal(c.quartos_min, 3);
  assert.equal(c.suites_min, 2);
  const completa = prop({ id: '40', tipo: 'Casa', setor: 'Jardim América', quartos: 3, suites: 2, valor: 1050000, descricao: 'Casa alto padrão 3 quartos sendo 2 suítes, vagas independentes, área gourmet ampla, quintal com piscina e despensa' });
  const semDespensa = prop({ id: '41', tipo: 'Casa', setor: 'Setor Bueno', quartos: 3, suites: 2, valor: 1000000, descricao: 'Casa 3 quartos, 2 suítes, vagas independentes, área gourmet, quintal com piscina' });
  const r = await run(F.casaAltoPadrao, [completa, semDespensa]);
  assert.equal(r.decision, 'ENVIAR');
  assert.deepEqual(r.matches.map(m => m.id), ['40']);
});

test('Apto 3Q 1 suíte "no valor de 500mil" que aceite permuta', async () => {
  const c = parseRequest(F.apto3qPermuta);
  assert.equal(c.permuta, true);
  assert.equal(c.valor_alvo, 500000);
  const ok = prop({ id: '50', tipo: 'Apartamento', setor: 'Setor Bueno', quartos: 3, suites: 1, valor: 490000, aceita_permuta: 'SIM' });
  const caro = prop({ id: '51', tipo: 'Apartamento', setor: 'Setor Bueno', quartos: 3, suites: 1, valor: 750000, aceita_permuta: 'SIM' });
  const naoAceita = prop({ id: '52', tipo: 'Apartamento', setor: 'Setor Bueno', quartos: 3, suites: 1, valor: 500000, aceita_permuta: 'NAO' });
  const r = await run(F.apto3qPermuta, [ok, caro, naoAceita]);
  assert.equal(r.decision, 'ENVIAR');
  assert.deepEqual(r.matches.map(m => m.id), ['50']);
});

test('"região da Marechal Rondom" (com erro de digitação) é reconhecida', async () => {
  const c = parseRequest(F.apto3qMarechal);
  assert.ok(c.local.bairros.includes('Setor Marechal Rondon'));
  const perto = prop({ id: '60', tipo: 'Apartamento', setor: 'Setor Marechal Rondon', quartos: 3, suites: 1, valor: 520000, aceita_permuta: 'SIM' });
  const longe = prop({ id: '61', tipo: 'Apartamento', setor: 'Setor Bueno', quartos: 3, suites: 1, valor: 520000, aceita_permuta: 'SIM' });
  const r = await run(F.apto3qMarechal, [perto, longe]);
  assert.deepEqual(r.matches.map(m => m.id), ['60']);
});

test('Ágio no Lyon "em torno de 200mil"', async () => {
  const c = parseRequest(F.agioLyon);
  assert.equal(c.agio, true);
  assert.equal(c.valor_alvo, 200000);
  const lyon = prop({ id: '70', tipo: 'Casa', negociacao: 'AGIO', setor: 'Jardins Lyon', quartos: 3, valor: 900000, valor_agio: 210000 });
  const paris = prop({ id: '71', tipo: 'Casa', negociacao: 'AGIO', setor: 'Jardins Paris', quartos: 3, valor: 900000, valor_agio: 200000 });
  const r = await run(F.agioLyon, [lyon, paris]);
  assert.equal(r.decision, 'ENVIAR');
  assert.deepEqual(r.matches.map(m => m.id), ['70']);
});

test('Apto 1 quarto até 50 m² na região da Praça Tamandaré', async () => {
  const c = parseRequest(F.aptoTamandare);
  // regra de 04/11: "até 50 m²" = perto de 50 → 80% a 105% (40 a 53 m²), não "qualquer coisa menor"
  assert.deepEqual([c.area_min, c.area_max, c.area_alvo], [40, 53, 50]);
  assert.equal(c.quartos_min, 1);
  assert.ok(c.local.perto.includes('Setor Oeste'));
  const oeste = prop({ id: '80', tipo: 'Apartamento', setor: 'Setor Oeste', quartos: 1, tamanho_m2: 45, valor: 300000 });
  const grande = prop({ id: '81', tipo: 'Apartamento', setor: 'Setor Oeste', quartos: 1, tamanho_m2: 62, valor: 300000 });
  const jdGoias = prop({ id: '82', tipo: 'Apartamento', setor: 'Jardim Goiás', quartos: 1, tamanho_m2: 45, valor: 300000 });
  const r = await run(F.aptoTamandare, [oeste, grande, jdGoias]);
  assert.deepEqual(r.matches.map(m => m.id), ['80']);
});

test('Casa térrea perto do DETRAN, até 600 mil, mínimo 3 quartos', async () => {
  const c = parseRequest(F.casaDetran);
  assert.equal(c.valor_max, 600000);
  assert.equal(c.quartos_min, 3);
  assert.ok(c.local.perto.includes('Cidade Jardim'));
  const casa = prop({ id: '90', tipo: 'Casa', setor: 'Cidade Jardim', quartos: 3, valor: 580000, descricao: 'Casa térrea 3 quartos' });
  const sobrado = prop({ id: '91', tipo: 'Sobrado', setor: 'Cidade Jardim', quartos: 4, valor: 590000 });
  const longe = prop({ id: '92', tipo: 'Casa', setor: 'Setor Jaó', quartos: 3, valor: 500000 });
  const r = await run(F.casaDetran, [casa, sobrado, longe]);
  assert.deepEqual(r.matches.map(m => m.id), ['90']);
});

test('Chácara num raio de 40 km de Goiânia, alternativas em condomínio / fora', async () => {
  const c = parseRequest(F.chacara);
  assert.equal(c.valor_max, 900000);
  assert.equal(c.local.raio.km, 40);
  assert.equal(c.alternativas.length, 2);
  const hidro = prop({ id: '100', tipo: 'Chácara', setor: 'Condomínio Recanto', cidade: 'Hidrolândia', tamanho_m2: 4500, valor: 850000, descricao: 'Chácara em condomínio fechado, escriturada, muito verde e córrego' });
  const pireno = prop({ id: '101', tipo: 'Chácara', setor: 'Zona rural', cidade: 'Pirenópolis', tamanho_m2: 15000, valor: 700000, descricao: 'Chácara escriturada com represa' });
  const r = await run(F.chacara, [hidro, pireno]);
  assert.equal(r.decision, 'ENVIAR');
  assert.deepEqual(r.matches.map(m => m.id), ['100']);
});

test('Casa ou sobrado em condomínio em Senador Canedo, "Até R$1.2" = 1,2 milhão', async () => {
  const c = parseRequest(F.casaCanedo);
  assert.equal(c.valor_max, 1200000);
  assert.ok(c.local.cidades.includes('Senador Canedo'));
  const canedo = prop({ id: '110', tipo: 'Casa', edificio: 'Jardins Senador Canedo', setor: 'Jardins Senador Canedo', cidade: 'Senador Canedo', quartos: 3, valor: 1100000, descricao: 'Casa em condomínio fechado' });
  const goiania = prop({ id: '111', tipo: 'Casa', setor: 'Jardins Atenas', quartos: 3, valor: 1100000, descricao: 'Casa em condomínio fechado' });
  const r = await run(F.casaCanedo, [canedo, goiania]);
  assert.deepEqual(r.matches.map(m => m.id), ['110']);
});

test('Ofertas ("Vendo...") são ignoradas', async () => {
  const r = await run('Vendo excelente apartamento no Setor Bueno 3 quartos R$ 450.000', [vivaSudoeste]);
  assert.equal(r.decision, 'IGNORAR');
});

test('Pedido vago ("Busco apartamento") não dispara envio automático', async () => {
  const r = await run('Busco apartamento', [vivaSudoeste]);
  assert.notEqual(r.decision, 'ENVIAR');
});

test('Região Sudoeste mobiliado até 400 mil envia o Viva Sudoeste', async () => {
  const r = await run('Procuro apartamento mobiliado na região sudoeste até 400.000,00', [vivaSudoeste], 'Sara Lima');
  assert.equal(r.decision, 'ENVIAR');
  const msg = formatOutreachMessage('Sara Lima', 'Procuro apartamento mobiliado', r.matches[0], r);
  assert.match(msg, /Sara/);
  assert.match(msg, /R\$\s?380\.000/);
});

test('"Setor Leste Universitário" não é confundido com "Setor Oeste"', async () => {
  const c = parseRequest('Busco apto 2 quartos no Setor Leste Universitário até 300 mil');
  assert.deepEqual(c.local.bairros, ['Setor Leste Universitário']);
});

test('Aluguel não recebe imóvel de venda', async () => {
  const r = await run('Procuro apartamento para alugar no Setor Sudoeste 2 quartos mobiliado', [vivaSudoeste]);
  assert.equal(r.decision, 'SILENCIO');
});

test('Nome do remetente é limpo ("Marline Pinheiro - Corretora De Imóveis" -> Marline)', () => {
  const { firstNameOf } = require('../src/matcher');
  assert.equal(firstNameOf('Marline Pinheiro - Corretora De Imóveis'), 'Marline');
  assert.equal(firstNameOf('Marcela de Sá | Corretora'), 'Marcela');
  assert.equal(firstNameOf('corretor Alves'), 'Alves');
  assert.equal(firstNameOf('~'), '');
});

test('Mapa aberto (OSM): reconhece condomínios e bairros que o mapa base não tinha', async () => {
  const { parseRequest } = require('../src/brain/parser');
  let c = parseRequest('Busco casa no Condomínio Gran Paris até 900 mil');
  assert.ok(c.local.condominios.some(x => /Gran Paris/.test(x.name)));
  c = parseRequest('Procuro apto no American Park 2 quartos');
  assert.ok(c.local.bairros.includes('American Park'));
  c = parseRequest('casa em Aldeia dos Sonhos');
  assert.ok(c.local.condominios.some(x => /Aldeia dos Sonhos/.test(x.name)));
  // imóvel no condomínio do mapa aberto é encontrado; fora dele não
  const dentro = prop({ id: '120', tipo: 'Casa', setor: 'Condomínio Gran Paris', quartos: 3, valor: 850000 });
  const fora = prop({ id: '121', tipo: 'Casa', setor: 'Setor Bueno', quartos: 3, valor: 850000 });
  const r = await run('Busco casa 3 quartos no Condomínio Gran Paris até 900 mil', [dentro, fora]);
  assert.deepEqual(r.matches.map(m => m.id), ['120']);
});

test('Cérebro continua rápido com o mapa completo (< 60 ms por mensagem)', () => {
  const { parseRequest } = require('../src/brain/parser');
  const t = Date.now();
  for (let i = 0; i < 10; i++) parseRequest('Busco apto 3 quartos sendo 1 suíte na região da Praça Tamandaré ou Setor Bueno até 700 mil, aceita financiamento');
  assert.ok((Date.now() - t) / 10 < 60, `levou ${(Date.now() - t) / 10} ms`);
});


test('Caso real 04/11: "apt decorado com piscina, varanda gourmet, até 200 m²" — perto de 200, piscina NO apto, decorado = mobiliado', async () => {
  const c = parseRequest(F.aptoDecoradoPiscina);
  assert.deepEqual([c.area_min, c.area_max], [160, 210], 'até 200 = 80% a 105%');
  assert.equal(c.mobilia, 'MOBILIADO', 'decorado = mobiliado');
  assert.deepEqual(c.features_required.map(f => f.key).sort(), ['gourmet', 'piscina_privativa']);
  const base = { tipo: 'Apartamento', setor: 'Setor Marista', quartos: 3, valor: 2500000 };
  const certo = prop({ ...base, id: 'a1', tamanho_m2: 190, mobiliado: 'SIM', descricao: 'Apartamento decorado, varanda gourmet com piscina privativa e churrasqueira' });
  const pequeno = prop({ ...base, id: 'a2', tamanho_m2: 110, mobiliado: 'SIM', descricao: 'Decorado, varanda gourmet com piscina privativa' });
  const piscinaDoPredio = prop({ ...base, id: 'a3', tamanho_m2: 195, mobiliado: 'SIM', descricao: 'Varanda gourmet. Condomínio com piscina adulto e infantil, academia' });
  const vazio = prop({ ...base, id: 'a4', tamanho_m2: 185, descricao: 'Varanda gourmet com piscina privativa, sem mobília' });
  const grande = prop({ ...base, id: 'a5', tamanho_m2: 260, mobiliado: 'SIM', descricao: 'Decorado, varanda gourmet com piscina privativa' });
  const decoradoNoTexto = prop({ ...base, id: 'a6', tamanho_m2: 205, descricao: 'Apartamento todo decorado pelo arquiteto, sacada com piscina e espaço gourmet' });
  const r = await run(F.aptoDecoradoPiscina, [certo, pequeno, piscinaDoPredio, vazio, grande, decoradoNoTexto]);
  assert.deepEqual(r.matches.map(m => m.id).sort(), ['a1', 'a6'], '110 m² é pequeno demais; 260 m² passa; piscina do condomínio não serve; sem mobília não serve');
});

test('Vocabulário: piscina privativa x do condomínio, casa com piscina, sinônimos de mobiliado e de apartamento', () => {
  const k = t => parseRequest(t).features_required.map(f => f.key);
  assert.deepEqual(k('apto num condomínio com piscina'), ['piscina_condominio']);
  assert.deepEqual(k('apartamento com área de lazer com piscina'), ['piscina_condominio']);
  assert.deepEqual(k('cobertura com piscina privativa'), ['piscina_privativa']);
  assert.deepEqual(k('casa com piscina'), ['piscina']);
  for (const t of ['apto decorado', 'apê mobiliado', 'apartamento porteira fechada', 'apto com móveis', 'apto todo equipado']) assert.equal(parseRequest(t).mobilia, 'MOBILIADO', t);
  assert.deepEqual(parseRequest('ape 3 dorms 2 vagas').tipos, ['Apartamento']);
  assert.ok(k('apto com varanda com churrasqueira').includes('gourmet'));
  assert.ok(k('apto com lavabo e banheira').includes('hidromassagem'));
  // "em torno de 150" = 135 a 165; "até 20 mil m² ou menos" = qualquer tamanho abaixo
  const t = parseRequest('apto em torno de 150 m2');
  assert.deepEqual([t.area_min, t.area_max], [135, 165]);
  assert.equal(parseRequest('chácara até 20 mil m² ou menos').area_min, null);
});
