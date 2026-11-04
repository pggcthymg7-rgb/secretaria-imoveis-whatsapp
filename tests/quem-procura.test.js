const { prop } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const QP = require('../src/quem-procura');

const agora = Date.now();
const dia = 86400000;
const pedido = (code, sender, phone, texto, diasAtras = 1, extra = {}) => ({ code, ts: agora - diasAtras * dia, grupo: 'Corretores GYN', sender, phone, jid: `${phone}@s.whatsapp.net`, texto, ...extra });

test('🎯 Quem procura: relê os pedidos dos grupos contra o imóvel novo (bate em tudo x quase) e ignora o resto', async () => {
  const novo = prop({ id: '50', tipo: 'Apartamento', setor: 'Setor Marista', quartos: 3, suites: 3, vagas: 3, tamanho_m2: 190, valor: 1800000, mobiliado: 'SIM', descricao: 'Decorado, varanda gourmet com piscina privativa' });
  const itens = [
    pedido('A10', 'Ana', '5562911110000', 'busco apt decorado com piscina, varanda gourmet, ate 200 m2', 2),
    pedido('A11', 'Bruno', '5562922220000', 'Procuro apto 3 suítes no Marista até 2 milhões', 5, { enviados: ['50'] }),
    pedido('A12', 'Carla', '5562933330000', 'Busco casa no Jardins Itália 4 suítes', 3),
    pedido('A13', 'Ana', '5562911110000', 'busco apto 3 quartos marista', 10), // mesma corretora: só o pedido mais recente
    pedido('A14', 'Davi', '5562944440000', 'Procuro apartamento no Setor Marista até 2 milhões', 90), // fora dos 60 dias
    pedido('A15', 'Eva', '5562955550000', 'Bom dia pessoal, alguém tem contato de pintor?', 1)
  ];
  const lista = await QP.quemProcura(novo, { itens });
  assert.deepEqual(lista.map(l => [l.sender, l.nivel, l.jaRecebeu]), [['Ana', 'MATCH', false], ['Bruno', 'MATCH', true]]);
  const txt = QP.textoAviso(novo, lista);
  assert.match(txt, /QUEM PROCURA O IMÓVEL #50/);
  assert.match(txt, /\*Ana\*.*wa\.me\/5562911110000/);
  assert.match(txt, /já recebeu/);
  assert.match(txt, /Responda \*oferecer 50\* e eu mando para os 1 que batem em tudo/);
});

test('🎯 Quem procura: aviso ao cadastrar só sai quando há interessado e nunca derruba o cadastro', async () => {
  const enviados = [];
  const p = prop({ id: '51', tipo: 'Terreno', setor: 'Zona rural', valor: 100000 });
  assert.deepEqual(await QP.avisarNovoImovel(p, { enviarAoDono: async t => enviados.push(t) }), []);
  assert.equal(enviados.length, 0);
  const quebrado = await QP.avisarNovoImovel(null, { enviarAoDono: async t => enviados.push(t) });
  assert.deepEqual(quebrado, []);
});
