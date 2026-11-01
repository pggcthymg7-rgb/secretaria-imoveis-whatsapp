require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const contacts = require('../src/contacts');
const { shouldSendFirstContact } = require('../src/atendimento-diario');
const { loadSettings } = require('../src/settings');

const now = () => Math.floor(Date.now() / 1000);
function msg({ jid, alt, ts = now(), quoted = false }) {
  return {
    key: { remoteJid: jid, remoteJidAlt: alt, fromMe: false, id: Math.random().toString(36) },
    messageTimestamp: ts,
    message: quoted ? { extendedTextMessage: { text: 'oi', contextInfo: { stanzaId: 'x', quotedMessage: {} } } } : { conversation: 'oi' }
  };
}
// conexão antiga (sem aquecimento) e memória com > 30 contatos
const ctx = { connectedAt: Date.now() - 3 * 3600 * 1000 };
for (let i = 0; i < 40; i++) contacts.markKnown(`55629990000${String(i).padStart(2, '0')}@s.whatsapp.net`);

test('Contato novo de verdade recebe a 1ª mensagem', () => {
  const r = shouldSendFirstContact(msg({ jid: '5562988887777@s.whatsapp.net' }), loadSettings(), ctx);
  assert.equal(r.reply, true);
});

test('Contato que já conversou pelo TELEFONE não recebe quando volta pelo LID', () => {
  contacts.markKnown('5562911112222@s.whatsapp.net');
  const r = shouldSendFirstContact(msg({ jid: '206841397178375@lid', alt: '5562911112222@s.whatsapp.net' }), loadSettings(), ctx);
  assert.equal(r.reply, false);
  assert.match(r.reason, /conhecido/);
});

test('Contato salvo na agenda nunca recebe a 1ª mensagem', () => {
  contacts.upsertContact({ id: '5562933334444@s.whatsapp.net', name: 'Cliente Antigo' });
  const r = shouldSendFirstContact(msg({ jid: '5562933334444@s.whatsapp.net' }), loadSettings(), ctx);
  assert.equal(r.reply, false);
  assert.match(r.reason, /agenda/);
});

test('Mensagem antiga (histórico/offline) não dispara resposta', () => {
  const r = shouldSendFirstContact(msg({ jid: '5562955556666@s.whatsapp.net', ts: now() - 3600 }), loadSettings(), ctx);
  assert.equal(r.reply, false);
});

test('Resposta citando mensagem anterior = conversa existente', () => {
  const r = shouldSendFirstContact(msg({ jid: '5562977778888@s.whatsapp.net', quoted: true }), loadSettings(), ctx);
  assert.equal(r.reply, false);
});

test('Depois de marcado, o mesmo contato não recebe de novo', () => {
  const m = msg({ jid: '5562966665555@s.whatsapp.net' });
  assert.equal(shouldSendFirstContact(m, loadSettings(), ctx).reply, true);
  contacts.markKnown(m.key.remoteJid);
  assert.equal(shouldSendFirstContact(m, loadSettings(), ctx).reply, false);
});

test('Pausada: não responde ninguém', () => {
  const r = shouldSendFirstContact(msg({ jid: '5562944443333@s.whatsapp.net' }), { ...loadSettings(), pausado: true }, ctx);
  assert.equal(r.reply, false);
});
