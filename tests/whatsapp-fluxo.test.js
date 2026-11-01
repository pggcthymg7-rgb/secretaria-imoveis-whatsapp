// Teste de ponta a ponta com um WhatsApp FALSO (simula o Baileys)
const { tmp } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// ---- Baileys falso -------------------------------------------------------
const sent = [];
let fakeSock;
const SELF = '5562900000001';
function makeFakeSock() {
  const ev = new EventEmitter();
  let n = 0;
  return {
    ev,
    user: { id: `${SELF}:7@s.whatsapp.net`, lid: '111111111111111:7@lid', name: 'Corretor' },
    sendMessage: async (jid, content) => {
      sent.push({ jid, content });
      return { key: { id: `BOT${++n}`, remoteJid: jid, fromMe: true } };
    },
    sendPresenceUpdate: async () => {},
    chatModify: async () => {},
    groupFetchAllParticipating: async () => ({ 'g1@g.us': { id: 'g1@g.us', subject: 'BUSCA ADÃO', participants: [1, 2, 3] } }),
    groupMetadata: async id => ({ subject: 'Grupo', participants: [] }),
    onWhatsApp: async (...nums) => nums.map(x => ({ exists: true, jid: `${x}@s.whatsapp.net` })),
    signalRepository: { lidMapping: { getPNForLID: async () => null } },
    logout: async () => {}
  };
}
const baileysPath = require.resolve('@whiskeysockets/baileys');
require.cache[baileysPath] = {
  id: baileysPath,
  filename: baileysPath,
  loaded: true,
  exports: {
    default: () => (fakeSock = makeFakeSock()),
    useMultiFileAuthState: async () => ({ state: {}, saveCreds: () => {} }),
    DisconnectReason: { loggedOut: 401 },
    fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0] }),
    downloadMediaMessage: async () => Buffer.from([0xff, 0xd8, 0xff])
  }
};

const sheets = require('../src/sheets');
const { saveSettings } = require('../src/settings');
const contacts = require('../src/contacts');
const wa = require('../src/whatsapp');
const radar = require('../src/radar');

const wait = ms => new Promise(r => setTimeout(r, ms));
const nowTs = () => Math.floor(Date.now() / 1000);

test.before(async () => {
  fs.mkdirSync(path.join(tmp, 'fotos'), { recursive: true });
  await sheets.saveAllPropertiesToSpreadsheet([
    sheets.normalizePropertyRecord({ id: '1', tipo: 'Apartamento', setor: 'Setor Oeste', quartos: 1, tamanho_m2: 45, valor: 300000, descricao: 'Apto 1 quarto reformado', ativo: true })
  ]);
  saveSettings({ gruposMonitoradosIds: ['g1@g.us'], meuWhatsappAlerta: '', firstContactAquecimentoMin: 0, maxPhotosPerMatch: 0 });
  for (let i = 0; i < 40; i++) contacts.markKnown(`55629100000${String(i).padStart(2, '0')}@s.whatsapp.net`);
  await wa.startWhatsAppAgent();
  fakeSock.ev.emit('connection.update', { connection: 'open' });
  await wait(50);
});

test('Pedido no grupo monitorado -> imóvel enviado no privado do parceiro + alerta para o dono', { timeout: 30000 }, async () => {
  sent.length = 0;
  fakeSock.ev.emit('messages.upsert', {
    type: 'notify',
    messages: [{
      key: { remoteJid: 'g1@g.us', participant: '999@lid', participantAlt: '5562977776666@s.whatsapp.net', id: 'G1', fromMe: false },
      pushName: 'Marcela de Sá | Corretora',
      messageTimestamp: nowTs(),
      message: { conversation: 'Busco apto de 1 quarto com até 50 m2 na região da praça tamandaré' }
    }]
  });
  await wait(12000);
  const toPartner = sent.filter(s => s.jid === '5562977776666@s.whatsapp.net');
  assert.ok(toPartner.length >= 1, 'enviou para o telefone real (não para o LID)');
  assert.match(toPartner[0].content.text, /Marcela/);
  const toOwner = sent.filter(s => s.jid === `${SELF}@s.whatsapp.net`);
  assert.ok(toOwner.some(s => /ENVIEI IMÓVEL/.test(s.content.text)), 'alerta no "Mensagem para mim"');
  assert.ok(toOwner.some(s => /wa\.me\/5562977776666/.test(s.content.text)), 'link com telefone real');
  assert.equal(radar.list({ limit: 1 })[0].decision, 'ENVIAR');
});

test('Mesmo pedido repetido não reenvia o mesmo imóvel', { timeout: 20000 }, async () => {
  sent.length = 0;
  fakeSock.ev.emit('messages.upsert', {
    type: 'notify',
    messages: [{
      key: { remoteJid: 'g1@g.us', participant: '999@lid', participantAlt: '5562977776666@s.whatsapp.net', id: 'G2', fromMe: false },
      pushName: 'Marcela',
      messageTimestamp: nowTs(),
      message: { conversation: 'Busco apto de 1 quarto com até 50 m2 na região da praça tamandaré' }
    }]
  });
  await wait(1500);
  assert.equal(sent.filter(s => s.jid === '5562977776666@s.whatsapp.net').length, 0);
});

test('Grupo NÃO monitorado é ignorado', async () => {
  sent.length = 0;
  fakeSock.ev.emit('messages.upsert', {
    type: 'notify',
    messages: [{ key: { remoteJid: 'familia@g.us', participant: '5562955554444@s.whatsapp.net', id: 'G3', fromMe: false }, pushName: 'Tia', messageTimestamp: nowTs(), message: { conversation: 'Busco apto de 1 quarto no Setor Oeste até 400 mil' } }]
  });
  await wait(500);
  assert.equal(sent.length, 0);
});

test('Comando no "Mensagem para mim" é respondido pela assistente, sem loop', async () => {
  sent.length = 0;
  fakeSock.ev.emit('messages.upsert', {
    type: 'notify',
    messages: [{ key: { remoteJid: `${SELF}@s.whatsapp.net`, id: 'S1', fromMe: true }, messageTimestamp: nowTs(), message: { conversation: 'lista' } }]
  });
  await wait(300);
  assert.equal(sent.length, 1);
  assert.match(sent[0].content.text, /Carteira ativa/);
  // a resposta da própria secretária volta como evento e NÃO é tratada como comando
  fakeSock.ev.emit('messages.upsert', { type: 'append', messages: [{ key: { remoteJid: `${SELF}@s.whatsapp.net`, id: 'BOT1', fromMe: true }, message: { conversation: sent[0].content.text } }] });
  fakeSock.ev.emit('messages.upsert', { type: 'notify', messages: [{ key: { remoteJid: `${SELF}@s.whatsapp.net`, id: 'X9', fromMe: true }, message: { conversation: '🤖 Carteira ativa (1)' } }] });
  await wait(300);
  assert.equal(sent.length, 1);
});

test('Anotação comum no "Mensagem para mim" é ignorada', async () => {
  sent.length = 0;
  fakeSock.ev.emit('messages.upsert', { type: 'notify', messages: [{ key: { remoteJid: `${SELF}@s.whatsapp.net`, id: 'S2', fromMe: true }, messageTimestamp: nowTs(), message: { conversation: 'ligar pro João amanhã' } }] });
  await wait(300);
  assert.equal(sent.length, 0);
});

test('1ª mensagem: novo recebe; quem já conversou comigo pelo LID+telefone não', { timeout: 20000 }, async () => {
  sent.length = 0;
  // eu já conversei com esse contato (mensagem minha)
  fakeSock.ev.emit('messages.upsert', { type: 'append', messages: [{ key: { remoteJid: '222@lid', remoteJidAlt: '5562933332222@s.whatsapp.net', id: 'M1', fromMe: true }, message: { conversation: 'oi' } }] });
  fakeSock.ev.emit('messages.upsert', { type: 'notify', messages: [{ key: { remoteJid: '222@lid', remoteJidAlt: '5562933332222@s.whatsapp.net', id: 'M2', fromMe: false }, pushName: 'Antigo', messageTimestamp: nowTs(), message: { conversation: 'Bom dia' } }] });
  fakeSock.ev.emit('messages.upsert', { type: 'notify', messages: [{ key: { remoteJid: '333@lid', remoteJidAlt: '5562944443333@s.whatsapp.net', id: 'M3', fromMe: false }, pushName: 'Novo Cliente', messageTimestamp: nowTs(), message: { conversation: 'Olá, vi seu anúncio' } }] });
  await wait(9000);
  assert.equal(sent.filter(s => s.jid === '222@lid').length, 0, 'contato antigo não recebe');
  assert.equal(sent.filter(s => s.jid === '333@lid').length, 1, 'contato novo recebe uma vez');
});

test.after(() => {
  require('../src/contacts').flush();
});
