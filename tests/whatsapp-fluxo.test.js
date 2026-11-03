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
    DisconnectReason: { loggedOut: 401, timedOut: 408, restartRequired: 515 },
    fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0] }),
    downloadMediaMessage: async m => (m.message && m.message.documentMessage ? Buffer.from(m._conteudo || '') : Buffer.from([0xff, 0xd8, 0xff]))
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

test('Pareamento: depois de ler o QR (515) reconecta quase na hora; QR vencido (408) volta rápido', () => {
  const { reconnectDelay } = wa._test;
  // caso real da Laura: várias tentativas 408 antes e, ao ler o QR, 515 esperava até 60 s e o celular desistia
  assert.ok(reconnectDelay(515, 6) <= 1000);
  assert.equal(reconnectDelay(408, 6), 3000);
  assert.equal(reconnectDelay(undefined, 6, true), 3000, 'sem aparelho pareado: QR novo logo');
  assert.equal(reconnectDelay(428, 1), 6000);
  assert.equal(reconnectDelay(428, 9), 60000, 'quedas normais continuam com espera crescente');
});

test('"Mensagem para mim" pelo código interno (LID) sem o LID conhecido também é atendido (caso Laura)', async () => {
  const { isOwnerChatAsync } = wa._test;
  fakeSock.signalRepository.lidMapping.getPNForLID = async jid => (jid === '999999999@lid' ? `${SELF}:0@s.whatsapp.net` : null);
  assert.equal(await isOwnerChatAsync({ key: { remoteJid: '999999999@lid', fromMe: true } }), true);
  assert.equal(await isOwnerChatAsync({ key: { remoteJid: '888888888@lid', fromMe: true } }), false, 'LID de outra pessoa não é o dono');
  assert.equal(await isOwnerChatAsync({ key: { remoteJid: '999999999@lid', fromMe: false } }), false, 'mensagem recebida não é comando do dono');
  sent.length = 0;
  fakeSock.ev.emit('messages.upsert', { type: 'notify', messages: [{ key: { remoteJid: '999999999@lid', id: 'L1', fromMe: true }, messageTimestamp: nowTs(), message: { conversation: 'ajuda' } }] });
  await wait(300);
  assert.equal(sent.length, 1);
  assert.match(sent[0].content.text, /lista/i);
  fakeSock.signalRepository.lidMapping.getPNForLID = async () => null;
});

test('Comando recente que chega como "append" é atendido; antigo não; e fica registrado', async () => {
  sent.length = 0;
  fakeSock.ev.emit('messages.upsert', { type: 'append', messages: [{ key: { remoteJid: `${SELF}@s.whatsapp.net`, id: 'A1', fromMe: true }, messageTimestamp: nowTs(), message: { conversation: 'ajuda' } }] });
  await wait(300);
  assert.equal(sent.length, 1, 'recente: responde');
  fakeSock.ev.emit('messages.upsert', { type: 'append', messages: [{ key: { remoteJid: `${SELF}@s.whatsapp.net`, id: 'A2', fromMe: true }, messageTimestamp: nowTs() - 3600, message: { conversation: 'ajuda' } }] });
  await wait(300);
  assert.equal(sent.length, 1, 'de 1 hora atrás: não responde');
  assert.ok(wa.getAgentState().activityLogs.some(l => /mensagem antiga/.test(l.message)), 'motivo aparece no registro');
  // conversa comum com cliente marcada como append continua ignorada
  fakeSock.ev.emit('messages.upsert', { type: 'append', messages: [{ key: { remoteJid: '5562977776666@s.whatsapp.net', id: 'A3', fromMe: true }, messageTimestamp: nowTs(), message: { conversation: 'ajuda' } }] });
  await wait(300);
  assert.equal(sent.length, 1);
});

// ---------------------------------------------------------------------------
// Busca inteligente (memória de anúncios, histórico, conversa exportada, comando "busca")
const anunciosMem = require('../src/anuncios');
const F2 = require('./fixtures-mensagens-reais');

test('Anúncio postado em QUALQUER grupo vai para a memória (sem mudar o fluxo de pedidos)', async () => {
  anunciosMem._reset();
  sent.length = 0;
  fakeSock.ev.emit('messages.upsert', { type: 'notify', messages: [{ key: { remoteJid: 'g2@g.us', participant: '777@lid', participantAlt: '5562988887777@s.whatsapp.net', id: 'AN1', fromMe: false }, pushName: 'Ana Corretora', messageTimestamp: nowTs(), message: { conversation: F2.anuncioMarista950 } }] });
  await wait(300);
  const a = anunciosMem.todos().find(x => x.id === 'g2@g.us:AN1');
  assert.ok(a, 'anúncio guardado');
  assert.equal(a.telefone, '5562988887777');
  assert.equal(a.autor, 'Ana Corretora');
  assert.equal(sent.length, 0, 'anúncio não gera mensagem para ninguém');
});

test('Comando "busca" no "Mensagem para mim" responde com o relatório; anotação "busca o João…" é ignorada', async () => {
  sent.length = 0;
  fakeSock.ev.emit('messages.upsert', { type: 'notify', messages: [{ key: { remoteJid: `${SELF}@s.whatsapp.net`, id: 'BI1', fromMe: true }, messageTimestamp: nowTs(), message: { conversation: 'busca ' + F2.pedidoClienteMarista } }] });
  await wait(1500);
  assert.match(sent[0].content.text, /Buscando/);
  const relatorio = sent.slice(1).map(s => s.content.text).join('\n');
  assert.match(relatorio, /BUSCA INTELIGENTE/);
  assert.match(relatorio, /Ana Corretora \(wa\.me\/5562988887777\)/);
  assert.match(relatorio, /BUSCA PRONTA NOS PORTAIS/);
  sent.length = 0;
  fakeSock.ev.emit('messages.upsert', { type: 'notify', messages: [{ key: { remoteJid: `${SELF}@s.whatsapp.net`, id: 'BI2', fromMe: true }, messageTimestamp: nowTs(), message: { conversation: 'busca o João no aeroporto amanhã cedo' } }] });
  await wait(300);
  assert.equal(sent.length, 0);
});

test('Importar histórico: pede ao celular 50 por vez a partir da mensagem mais antiga e guarda os anúncios antigos', async () => {
  const pedidos = [];
  const velho = nowTs() - 10 * 86400;
  fakeSock.fetchMessageHistory = async (n, key, tsMs) => {
    pedidos.push({ n, key, tsMs });
    // o celular responde com mensagens mais antigas (só na 1ª vez; depois não tem mais nada)
    if (key.remoteJid === 'g2@g.us' && key.id === 'AN1') {
      setTimeout(() => fakeSock.ev.emit('messaging-history.set', { messages: [
        { key: { remoteJid: 'g2@g.us', participant: '5562911112222@s.whatsapp.net', id: 'OLD1', fromMe: false }, pushName: 'Beto', messageTimestamp: velho, message: { conversation: F2.anuncioMaristaSemVerbo } },
        { key: { remoteJid: 'g2@g.us', participant: '5562911112222@s.whatsapp.net', id: 'OLD2', fromMe: false }, messageTimestamp: velho - 60, message: { conversation: 'bom dia' } }
      ] }), 20);
    }
    return 'ok';
  };
  const fim = new Promise(r => wa.importarHistoricoGrupos({ onFim: r, pausaMs: 0, esperaMs: 200 }));
  const e = await fim;
  const doG2 = pedidos.filter(p => p.key.remoteJid === 'g2@g.us');
  assert.ok(doG2.length >= 2);
  assert.equal(doG2[0].n, 50);
  assert.equal(doG2[0].key.id, 'AN1', 'começa pela mensagem mais antiga conhecida do grupo');
  assert.equal(doG2[1].key.id, 'OLD2', 'depois continua de onde parou');
  assert.ok(anunciosMem.todos().some(a => a.id === 'g2@g.us:OLD1' && a.origem === 'histórico'));
  assert.equal(e.anuncios, 1);
  assert.ok(Array.isArray(e.semAncora));
  assert.equal(e.rodando, false);
});

test('Conversa exportada mandada no "Mensagem para mim" vira anúncios', async () => {
  sent.length = 0;
  const hoje = new Date();
  const d = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;
  fakeSock.ev.emit('messages.upsert', { type: 'notify', messages: [{ key: { remoteJid: `${SELF}@s.whatsapp.net`, id: 'DOC1', fromMe: true }, messageTimestamp: nowTs(), message: { documentMessage: { fileName: 'Conversa do WhatsApp com Alto Padrão.txt', fileLength: 200 } }, _conteudo: `${d} 08:00 - Duda: ${F2.anuncioCasaMilhoes}` }] });
  await wait(400);
  assert.match(sent[0].content.text, /Conversa "Alto Padrão" lida: 1 mensagens, \*1 anúncios\*/);
  assert.ok(anunciosMem.todos().some(a => a.grupo === 'Alto Padrão' && a.prop.valor === 2800000));
});

test('Configurações da busca pelo "Mensagem para mim" (as mesmas do painel)', async () => {
  const bi = require('../src/busca-inteligente');
  const cmd = async t => {
    sent.length = 0;
    fakeSock.ev.emit('messages.upsert', { type: 'notify', messages: [{ key: { remoteJid: `${SELF}@s.whatsapp.net`, id: 'CF' + Math.random(), fromMe: true }, messageTimestamp: nowTs(), message: { conversation: t } }] });
    await wait(400);
    return sent.map(s => s.content.text).join('\n');
  };
  assert.match(await cmd('config busca'), /Configuração da busca/);
  assert.match(await cmd('limite busca 30'), /até \*30\*/);
  assert.equal(bi.getConfig().limiteDia, 30);
  assert.match(await cmd('portais olx zap'), /OLX ✅ · ZAP ✅ · VivaReal ❌/);
  assert.match(await cmd('portais todos'), /VivaReal ✅/);
  assert.match(await cmd('memória desligar'), /Parei de guardar/);
  fakeSock.ev.emit('messages.upsert', { type: 'notify', messages: [{ key: { remoteJid: 'g2@g.us', participant: '5562911113333@s.whatsapp.net', id: 'OFF1', fromMe: false }, pushName: 'X', messageTimestamp: nowTs(), message: { conversation: F2.anuncioMaristaSemVerbo } }] });
  await wait(300);
  assert.ok(!anunciosMem.todos().some(a => a.id === 'g2@g.us:OFF1'), 'desligado: não guarda');
  assert.match(await cmd('memória ligar'), /Volto a guardar/);
  assert.match(await cmd('minhas buscas'), /nº 1/);
  assert.match(await cmd('ver busca 1'), /BUSCA INTELIGENTE\* nº 1/);
  assert.match(await cmd('ver busca 999'), /Não achei/);
  const fetchReal = global.fetch;
  global.fetch = async url => (/generativelanguage/.test(String(url)) ? { ok: true, status: 200, json: async () => ({ models: [] }) } : fetchReal(url));
  try {
    assert.match(await cmd('chave gemini AIzaTesteTesteTesteTeste123'), /funcionando[\s\S]*apague esta mensagem/);
    global.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'API key not valid.' } }) });
    assert.match(await cmd('chave gemini AIzaOutraChaveErradaErrada9'), /Não salvei: O Google recusou a chave \(400: API key not valid/);
  } finally {
    global.fetch = fetchReal;
  }
  assert.equal(process.env.GEMINI_API_KEY, 'AIzaTesteTesteTesteTeste123');
  process.env.GEMINI_API_KEY = '';
  bi.atualizarConfig({ limiteDia: 20 });
});

test('Grupos da busca pelo "Mensagem para mim": listar, escolher, e anúncio de grupo fora da lista não é guardado', async () => {
  const bi = require('../src/busca-inteligente');
  const cmd = async t => {
    sent.length = 0;
    fakeSock.ev.emit('messages.upsert', { type: 'notify', messages: [{ key: { remoteJid: `${SELF}@s.whatsapp.net`, id: 'GB' + Math.random(), fromMe: true }, messageTimestamp: nowTs(), message: { conversation: t } }] });
    await wait(400);
    return sent.map(s => s.content.text).join('\n');
  };
  assert.match(await cmd('grupos da busca'), /Grupos da busca\* \(todos\)[\s\S]*✅ 1\. BUSCA ADÃO/);
  assert.match(await cmd('busca grupos 1'), /Busca em 1 grupo\(s\): BUSCA ADÃO/);
  assert.deepEqual(bi.getConfig().gruposIds, ['g1@g.us']);
  // g2 não está na busca -> anúncio não é guardado; e os pedidos do g1 continuam funcionando como antes
  fakeSock.ev.emit('messages.upsert', { type: 'notify', messages: [{ key: { remoteJid: 'g2@g.us', participant: '5562911114444@s.whatsapp.net', id: 'FORA1', fromMe: false }, pushName: 'Y', messageTimestamp: nowTs(), message: { conversation: F2.anuncioMaristaSemVerbo } }] });
  await wait(300);
  assert.ok(!anunciosMem.todos().some(a => a.id === 'g2@g.us:FORA1'));
  assert.match(await cmd('busca grupos 9'), /Não existe o grupo nº 9/);
  assert.match(await cmd('busca grupos tirar 1'), /Busca em 0 grupo/);
  assert.match(await cmd('busca grupos todos'), /todos/);
  assert.equal(bi.getConfig().todosGrupos, true);
});

test('Busca por filtros no WhatsApp: guiada (pergunta campo a campo) e "campo: valor; campo: valor"', async () => {
  anunciosMem._reset();
  anunciosMem.registrar({ id: 'wg1', ts: Date.now(), texto: 'Vendo casa no Condomínio Jardins Itália, 5 suítes, 450m², R$ 4,5 milhões', grupo: 'Alto Padrão', grupoId: 'g1@g.us', autor: 'Ana Corretora', telefone: '5562999990000' });
  const dizer = async t => {
    sent.length = 0;
    fakeSock.ev.emit('messages.upsert', { type: 'notify', messages: [{ key: { remoteJid: `${SELF}@s.whatsapp.net`, id: 'FG' + Math.random(), fromMe: true }, messageTimestamp: nowTs(), message: { conversation: t } }] });
    await wait(500);
    return sent.map(s => s.content.text).join('\n');
  };
  // em uma linha
  let t = await dizer('busca cidade: Goiânia; condomínio: Jardins Itália; suítes: 4; valor: 4 a 5 milhões');
  assert.match(t, /Buscando/);
  await wait(800);
  t = sent.map(s => s.content.text).join('\n');
  assert.match(t, /Ana Corretora \(wa\.me\/5562999990000\)/);
  assert.match(t, /em Jardins Itália, Goiânia - GO, de R\$ 4 mi a R\$ 5 mi, 4\+ suítes/);
  // campo inválido: explica
  assert.match(await dizer('busca valor: caro; cidade: Goiânia'), /Não entendi o valor "caro"/);
  // guiada
  t = await dizer('busca guiada');
  assert.match(t, /Busca por filtros[\s\S]*1\/13[\s\S]*Tipo do imóvel/);
  assert.match(await dizer('casa'), /2\/13[\s\S]*Venda ou aluguel/);
  assert.match(await dizer('venda'), /3\/13[\s\S]*Cidade/);
  assert.match(await dizer('Goiânia'), /4\/13[\s\S]*Bairro/);
  assert.match(await dizer('-'), /5\/13[\s\S]*Condomínio ou edifício/);
  assert.match(await dizer('Jardins Itália'), /6\/13[\s\S]*a partir de/);
  assert.match(await dizer('4 milhões'), /7\/13[\s\S]*até/);
  assert.match(await dizer('caro'), /Não entendi o valor "caro"[\s\S]*7\/13/, 'resposta inválida: pergunta de novo');
  assert.match(await dizer('5 milhões'), /8\/13[\s\S]*Quartos/);
  assert.match(await dizer('voltar'), /7\/13/);
  assert.match(await dizer('5 milhões'), /8\/13/);
  assert.match(await dizer('-'), /9\/13[\s\S]*Suítes/);
  assert.match(await dizer('4'), /10\/13[\s\S]*Vagas/);
  await dizer('-');
  await dizer('-');
  await dizer('-');
  await dizer('buscar'); // "pronto/buscar": termina antes do fim
  await wait(800);
  t = sent.map(s => s.content.text).join('\n');
  assert.match(t, /BUSCA INTELIGENTE[\s\S]*Casa, à venda, em Jardins Itália[\s\S]*Ana Corretora/);
  // cancelar libera a conversa para os outros comandos
  await dizer('busca guiada');
  assert.match(await dizer('cancelar'), /Busca cancelada/);
  assert.match(await dizer('config busca'), /Configuração da busca/);
});
