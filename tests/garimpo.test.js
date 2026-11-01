const { prop } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const garimpo = require('../src/garimpo');

const inventory = [
  prop({ id: '1', tipo: 'Apartamento', setor: 'Setor Bueno', quartos: 3, suites: 1, valor: 600000 }),
  prop({ id: '2', tipo: 'Casa', setor: 'Jardim América', quartos: 3, valor: 550000 })
];

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    const key = Object.keys(routes).find(k => url.includes(k));
    const body = key ? routes[key] : {};
    return { ok: true, status: 200, json: async () => (typeof body === 'function' ? body(url) : body) };
  };
  fn.calls = calls;
  return fn;
}

test('Classifica pedido público e cruza com a carteira', () => {
  const r = garimpo.classifyDemand('Procuro apartamento 3 quartos no Setor Bueno até 650 mil', inventory);
  assert.ok(r);
  assert.deepEqual(r.matches, ['1']);
  assert.equal(garimpo.classifyDemand('Vendo apartamento 3 quartos no Setor Bueno, chama no pv', inventory), null, 'oferta não é lead');
  assert.equal(garimpo.classifyDemand('Bom dia pessoal', inventory), null);
});

test('Varredura web (Brave): cria leads, ignora ofertas e links perigosos, não duplica', async () => {
  garimpo.updateConfig({ consultas: '"procuro apartamento" Goiânia' });
  const fetcher = fakeFetch({
    'api.search.brave.com': {
      web: { results: [
        { title: 'Procuro apartamento no Setor Bueno', description: '3 quartos com suíte até 650 mil, alguém indica?', url: 'https://facebook.com/groups/x/posts/1' },
        { title: 'Vendo casa no Jardim América', description: 'R$ 550 mil, chama no pv', url: 'https://olx.com.br/2' },
        { title: 'Procuro casa no Jardim América', description: 'até 600 mil', url: 'javascript:alert(1)' }
      ] }
    }
  });
  const env = { BRAVE_API_KEY: 'k' };
  let alertados = [];
  const r = await garimpo.run({ env, fetcher, inventory, pausaMs: 0, onLeads: l => (alertados = l) });
  assert.equal(r.ok, true);
  assert.equal(r.novos, 1);
  assert.equal(alertados[0].matches[0], '1');
  assert.match(fetcher.calls[0].url, /freshness=pw/, 'só a última semana');
  assert.equal(fetcher.calls[0].opts.headers['X-Subscription-Token'], 'k');
  const again = await garimpo.run({ env, fetcher, inventory, pausaMs: 0 });
  assert.equal(again.novos, 0, 'mesmo link não vira lead duas vezes');
});

test('Comentários nos SEUS posts (Meta): só quem demonstra interesse vira lead', async () => {
  const now = new Date().toISOString();
  const fetcher = fakeFetch({
    '/posts?': { data: [{ id: 'p1', message: 'Apartamento no Bueno', permalink_url: 'https://facebook.com/p1' }] },
    'p1/comments': { data: [
      { id: 'c1', from: { name: 'Ana' }, message: 'Qual o valor? Ainda está disponível?', created_time: now },
      { id: 'c2', from: { name: 'Beto' }, message: 'Que lindo!', created_time: now }
    ] }
  });
  const r = await garimpo.run({ env: { META_PAGE_TOKEN: 't', META_PAGE_ID: '123' }, fetcher, inventory, pausaMs: 0 });
  assert.equal(r.novos, 1);
  const lead = garimpo.getState().leads.find(l => l.fonte === 'facebook');
  assert.equal(lead.autor, 'Ana');
  assert.ok(fetcher.calls.every(c => c.url.startsWith('https://graph.facebook.com/')), 'só a API oficial');
});

test('Sem chaves: avisa o que falta configurar', async () => {
  const r = await garimpo.run({ env: {}, fetcher: fakeFetch({}), inventory, pausaMs: 0 });
  assert.ok(r.semChave.length >= 2);
});

test('Status do lead e links de campanhas oficiais', () => {
  const l = garimpo.getState().leads[0];
  garimpo.setLeadStatus(l.id, 'CONTATADO');
  assert.equal(garimpo.getState().leads.find(x => x.id === l.id).status, 'CONTATADO');
  assert.throws(() => garimpo.setLeadStatus(l.id, 'HACK'));
  const c = garimpo.campaignLinks(['imóveis Goiânia'])[0];
  assert.match(c.meta, /^https:\/\/www\.facebook\.com\/ads\/library\//);
  assert.match(c.trends, /geo=BR-GO/);
});
