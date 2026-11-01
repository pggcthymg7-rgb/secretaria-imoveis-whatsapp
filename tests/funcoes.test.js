const { prop } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const assistant = require('../src/assistant');
const prospeccao = require('../src/prospeccao');
const vitrine = require('../src/vitrine');
const sheets = require('../src/sheets');

test('Assistente entende o cadastro por texto livre', () => {
  const p = assistant.parsePropertyFromText('cadastrar apto 3q 2 suítes 98m² setor Bueno ed. Solar das Flores 650 mil aceita permuta 2 vagas condomínio 700');
  assert.equal(p.tipo, 'Apartamento');
  assert.equal(p.setor, 'Setor Bueno');
  assert.equal(p.quartos, 3);
  assert.equal(p.suites, 2);
  assert.equal(p.vagas, 2);
  assert.equal(p.tamanho_m2, 98);
  assert.equal(p.valor, 650000);
  assert.equal(p.aceita_permuta, 'SIM');
  assert.equal(p.condominio, 700);
  assert.match(p.edificio, /Solar/);
});

test('Assistente: ágio com valor do ágio e total', () => {
  const p = assistant.parsePropertyFromText('cadastrar sobrado ágio jardins lyon 3 suítes ágio 450 mil valor total 1,2 milhão');
  assert.equal(p.negociacao, 'AGIO');
  assert.equal(p.valor_agio, 450000);
  assert.equal(p.valor, 1200000);
  assert.equal(p.edificio, 'Jardins Lyon');
});

test('Assistente: correção de campo no rascunho', () => {
  const p = { valor: 100 };
  assert.equal(assistant.applyFieldEdit(p, 'valor 640 mil'), true);
  assert.equal(p.valor, 640000);
  assert.equal(assistant.applyFieldEdit(p, 'quartos 4'), true);
  assert.equal(p.quartos, 4);
  assert.equal(assistant.applyFieldEdit(p, 'setor jardim goias'), true);
  assert.equal(p.setor, 'Jardim Goiás');
  assert.equal(assistant.applyFieldEdit(p, 'qualquer coisa aqui'), false);
});

test('Assistente: fluxo completo cadastrar -> salvar grava na planilha', async () => {
  const sent = [];
  const wa = { sendText: async (j, t) => sent.push(t), sendImage: async () => {}, sendPdf: async () => {} };
  const chat = '556299999999@s.whatsapp.net';
  assert.equal(await assistant.handleOwnerMessage(wa, { chatJid: chat, text: 'cadastrar casa 3 quartos jardim américa 580 mil' }), true);
  assert.match(sent.at(-1), /Rascunho/);
  assert.equal(await assistant.handleOwnerMessage(wa, { chatJid: chat, text: 'salvar' }), true);
  assert.match(sent.at(-1), /salvo/);
  const all = await sheets.loadAllProperties(true);
  assert.ok(all.some(x => x.setor === 'Jardim América' && x.valor === 580000));
  // anotação livre no "Mensagem para mim" é ignorada
  assert.equal(await assistant.handleOwnerMessage(wa, { chatJid: chat, text: 'comprar pão amanhã' }), false);
});

test('Prospecção: lê lista colada, normaliza telefone e personaliza', () => {
  const list = prospeccao.parseContactsInput('Maria Souza; (62) 98888-7777\n62 3333-4444 João\nlixo\n+55 62 99111-2222');
  assert.deepEqual(list.map(c => c.telefone), ['5562988887777', '556233334444', '5562991112222']);
  assert.equal(list[0].nome, 'Maria Souza');
  const msg = prospeccao.renderMessage('{Oi|Olá} {nome}, {saudacao}!', { nome: 'Maria Souza' }, true);
  assert.match(msg, /^(Oi|Olá) Maria, (Bom dia|Boa tarde|Boa noite)!/);
  assert.match(msg, /SAIR/);
});

test('Prospecção: envia 1 por vez, respeita SAIR e conclui campanha', async () => {
  prospeccao.updateConfig({ horaInicio: '00:00', horaFim: '23:59', diasSemana: [0, 1, 2, 3, 4, 5, 6], intervaloMinSeg: 20, intervaloMaxSeg: 20 });
  const camp = prospeccao.createCampaign({ nome: 'Teste', mensagem: 'Olá {nome}', contatos: [{ telefone: '62988880001', nome: 'Ana' }, { telefone: '62988880002', nome: 'Bia' }] });
  prospeccao.setCampaignStatus(camp.id, 'ATIVA');
  const sent = [];
  const wa = { isConnected: () => true, checkNumber: async t => `${t}@s.whatsapp.net`, sendText: async (j, t) => sent.push([j, t]), sendImage: async () => {} };
  await prospeccao.tick(wa, () => {});
  assert.equal(sent.length, 1);
  await prospeccao.tick(wa, () => {}); // ainda dentro do intervalo -> não envia
  assert.equal(sent.length, 1);
  assert.equal(prospeccao.handleReply('5562988880001', 'SAIR'), true);
  assert.equal(prospeccao.handleReply('5562900000000', 'SAIR'), false, 'quem não recebeu prospecção não é descadastro');
  const c = prospeccao.getCampaign(camp.id);
  assert.equal(c.contatos[0].status, 'ENVIADO');
});

test('Vitrine: só posts aprovados entram, em rodízio', async () => {
  const a = prop({ id: '1', tipo: 'Apartamento', setor: 'Setor Bueno', quartos: 2, valor: 400000, fotos: 'a.jpg' });
  const b = prop({ id: '2', tipo: 'Casa', setor: 'Jardim América', quartos: 3, valor: 600000 });
  const c = prop({ id: '3', tipo: 'Casa', setor: 'Setor Oeste', quartos: 3, valor: 700000 });
  vitrine.upsertPost(a);
  vitrine.upsertPost(b);
  vitrine.upsertPost(c);
  vitrine.setStatus('1', 'APROVADO');
  vitrine.setStatus('2', 'APROVADO');
  assert.match(vitrine.getState().posts['1'].texto, /Setor Bueno/);
  vitrine.updateConfig({ grupos: ['123@g.us'], porHorario: 1 });
  const sent = [];
  const wa = { isConnected: () => true, sendImage: async (g, f, t) => sent.push(['img', g, t]), sendText: async (g, t) => sent.push(['txt', g, t]) };
  await vitrine.runSlot(wa, [a, b, c], '08:30', () => {});
  await vitrine.runSlot(wa, [a, b, c], '11:30', () => {});
  await vitrine.runSlot(wa, [a, b, c], '15:00', () => {});
  const ids = sent.map(s => (/Bueno/.test(s[2]) ? '1' : /América/.test(s[2]) ? '2' : '3'));
  assert.deepEqual(ids, ['1', '2', '1'], 'rodízio entre os aprovados; o #3 (pendente) nunca sai');
  // editar texto de um post aprovado volta para pendente
  vitrine.upsertPost(a, { texto: 'Novo texto' });
  assert.equal(vitrine.getState().posts['1'].status, 'PENDENTE');
});
