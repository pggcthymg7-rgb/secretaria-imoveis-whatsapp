// Planos e uso justo: tetos mensais por plano (trava de margem bruta > 75%)
const { tmp } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const planos = require('../src/planos');
const bi = require('../src/busca-inteligente');
const matcher = require('../src/matcher');
const F = require('./fixtures-mensagens-reais');

const limpar = () => { try { fs.unlinkSync(path.join(tmp, planos.USO_FILE)); } catch {} };

test('planos: sem BIGA_PLANO não há teto (instalação própria)', () => {
  limpar();
  assert.equal(planos.planoAtual({}), null);
  for (let i = 0; i < 5; i++) planos.registrar('apify');
  assert.equal(planos.podeUsar('apify', {}), true);
});

test('planos: limites do Data Room e nome com acento', () => {
  assert.deepStrictEqual([planos.PLANOS.radar.buscas, planos.PLANOS.radar.apify, planos.PLANOS.radar.ia], [100, 0, 1500]);
  assert.deepStrictEqual([planos.PLANOS.designer.buscas, planos.PLANOS.designer.apify], [200, 5]);
  assert.equal(planos.planoAtual({ BIGA_PLANO: 'Imobiliária' }).id, 'imobiliaria');
  assert.equal(planos.planoAtual({ BIGA_PLANO: 'ouro' }), null, 'plano desconhecido não inventa limite');
});

test('planos: teto mensal, devolução e tipo inválido', () => {
  limpar();
  const env = { BIGA_PLANO: 'designer' };
  for (let i = 0; i < 5; i++) planos.registrar('apify');
  assert.equal(planos.podeUsar('apify', env), false, '5 créditos Apify esgotados');
  planos.devolver('apify');
  assert.equal(planos.podeUsar('apify', env), true, 'falha devolve o crédito');
  assert.equal(planos.resumo(env).saldo.apify, 1);
  assert.throws(() => planos.registrar('qualquer'), /desconhecido/);
});

test('planos: uso de mês anterior zera', () => {
  fs.writeFileSync(path.join(tmp, planos.USO_FILE), JSON.stringify({ mes: '2000-01', buscas: 999, apify: 999, ia: 999 }));
  assert.equal(planos.podeUsar('buscas', { BIGA_PLANO: 'radar' }), true);
  assert.equal(planos.resumo({ BIGA_PLANO: 'radar' }).uso.buscas, 0);
});

test('planos: busca nos portais respeita o teto mensal do plano', async () => {
  limpar();
  for (let i = 0; i < 100; i++) planos.registrar('buscas');
  const criterios = bi.entenderPedido(F.pedidoClienteMarista).criterios;
  const r = await bi.buscarNosPortais(criterios, 'x', {
    env: { GEMINI_API_KEY: 'k', BUSCA_LIMITE_DIA: '99', BIGA_PLANO: 'radar' },
    fetcher: async () => assert.fail('sem saldo no plano não chama nenhuma API paga')
  });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'limite_plano');
  assert.match(r.explicacao, /uso justo/);
});

test('planos: Radar (sem crédito Apify) não chama o Apify mesmo com token', async () => {
  limpar();
  const urls = [];
  const fetcher = async url => { urls.push(String(url)); return { ok: false, status: 500, json: async () => ({}), text: async () => '' }; };
  const criterios = bi.entenderPedido(F.pedidoClienteMarista).criterios;
  const env = { APIFY_API_TOKEN: 'apify_api_x', SERPER_API_KEY: 's', BUSCA_LIMITE_DIA: '99', GEMINI_RETRY_MS: '0' };
  await bi.buscarNosPortais(criterios, 'x', { env: { ...env, BIGA_PLANO: 'radar' }, fetcher });
  assert.ok(urls.length, 'chamou algum motor');
  assert.ok(!urls.some(u => /apify/.test(u)), 'nenhuma chamada ao Apify');
  assert.equal(planos.resumo({ BIGA_PLANO: 'radar' }).uso.buscas, 0, 'busca sem resposta devolve o crédito');
  // controle: o Designer tem crédito e chama o Apify; a falha devolve o crédito
  urls.length = 0;
  await bi.buscarNosPortais(criterios, 'x', { env: { ...env, BIGA_PLANO: 'designer' }, fetcher });
  assert.ok(urls.some(u => /apify/.test(u)), 'Designer usa o Apify');
  assert.equal(planos.resumo({ BIGA_PLANO: 'designer' }).uso.apify, 0, 'Apify que falhou não gasta crédito');
});

test('matcher: local reconhecido com segurança dispensa o Gemini; nome desconhecido não', () => {
  assert.equal(matcher.localConfiante({ bairros: ['Setor Bueno'], nomesDesconhecidos: [], localNaoReconhecido: false }), true);
  assert.equal(matcher.localConfiante({ qualquer: true }), true);
  assert.equal(matcher.localConfiante({ bairros: ['Setor Bueno'], nomesDesconhecidos: ['metropolitan'] }), false);
  assert.equal(matcher.localConfiante({ bairros: [], nomesDesconhecidos: [], localNaoReconhecido: true }), false);
  assert.equal(matcher.localConfiante(null), false);
});

test('matcher: cache da IA ignora caixa, acento e espaços (mesmo pedido em vários grupos)', () => {
  assert.equal(matcher.chaveCacheIa('Procuro  APTO no Setor Bueno'), matcher.chaveCacheIa('procuro apto no setor bueno'));
  assert.notEqual(matcher.chaveCacheIa('apto no Bueno'), matcher.chaveCacheIa('apto no Marista'));
});
