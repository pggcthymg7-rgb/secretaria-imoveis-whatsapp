// Leitor de anúncio: dados reais da página da OLX e do endereço do ZAP/VivaReal, sem IA
require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/busca-anuncio');
const bi = require('../src/busca-inteligente');
const Fx = require('./fixtures-olx-anuncio');

const PEDIDO = 'Apartamento à venda no Marista, Goiânia, de R$ 1 mi a R$ 1,6 mi, 3 quartos, 2 suítes, 1 vaga';
const OLX_TALK = 'https://go.olx.com.br/grande-goiania-e-anapolis/imoveis/talk-marista-apartamento-com-3-quarto-s-e-4-banheiro-s-a-venda-140-00-por-r-1450000-00-1509799842';
const OLX_BOTANIC = 'https://go.olx.com.br/grande-goiania-e-anapolis/imoveis/apartamento-a-venda-no-ed-botanic-setor-marista-goiania-go-1486983761';
const OLX_SPOT = 'https://go.olx.com.br/grande-goiania-e-anapolis/imoveis/apartamento-a-venda-no-spot-marista-setor-marista-goiania-2-suites-nascente-1538345527';
const ZAP_ALUGUEL = 'https://www.zapimoveis.com.br/imovel/aluguel-apartamento-3-quartos-com-academia-setor-marista-goiania-go-125m2-id-2857307159/';
const VIVA_CASA = 'https://www.vivareal.com.br/imovel/casa-4-quartos-setor-marista-bairros-goiania-204m2-venda-RS2900000-id-2812671609/';
const ZAP_OK = 'https://www.zapimoveis.com.br/imovel/venda-apartamento-3-quartos-com-academia-setor-marista-goiania-go-139m2-id-2825248279/';

test('Leitor: página real da OLX (Talk Marista) → preço, m², quartos, vagas, suítes e profissional de verdade', () => {
  const d = L.lerPaginaOlx(Fx.talkMarista);
  assert.deepEqual([d.preco, d.area, d.quartos, d.vagas, d.suites, d.bairro, d.cidade, d.profissional], [1450000, 140, 3, 2, 3, 'Setor Marista', 'Goiânia', true]);
  assert.equal(d.anunciante, 'Adão Imóveis');
  assert.equal(d.tipo, 'apartamento');
  assert.equal(d.transacao, 'VENDA');
  assert.equal(L.lerPaginaOlx('<html>captcha</html>'), null, 'página sem dados do anúncio não vira dado');
});

test('Leitor: o endereço do ZAP/VivaReal já diz venda/aluguel, tipo, quartos, m² e (VivaReal) o preço', () => {
  assert.deepEqual(L.lerEndereco(ZAP_ALUGUEL), { transacao: 'ALUGUEL', tipo: 'apartamento', quartos: 3, area: 125 });
  assert.deepEqual(L.lerEndereco(VIVA_CASA), { transacao: 'VENDA', tipo: 'casa', quartos: 4, area: 204, preco: 2900000 });
});

test('Avaliar: reprova só com dado lido; dado ausente vira "conferir"', () => {
  const c = bi.entenderPedido(PEDIDO).criterios;
  assert.equal(L.avaliar(L.lerPaginaOlx(Fx.talkMarista), c).ok, true);
  assert.deepEqual(L.avaliar(L.lerPaginaOlx(Fx.spotMarista), c), { ok: false, motivo: 'abaixo do valor' }, '870 mil e 2 quartos');
  assert.equal(L.avaliar(L.lerPaginaOlx(Fx.botanic), c).ok, false, '1,89 mi está acima de 1,6 mi');
  assert.equal(L.avaliar(L.lerEndereco(ZAP_ALUGUEL), c).ok, false, 'aluguel num pedido de venda');
  assert.equal(L.avaliar(L.lerEndereco(VIVA_CASA), c).ok, false, 'casa de 2,9 mi num pedido de apartamento');
  const av = L.avaliar(L.lerEndereco(ZAP_OK), c);
  assert.equal(av.ok, true);
  assert.ok(av.conferir.includes('preço') && av.conferir.includes('suítes'), 'ZAP não diz preço/suítes no endereço');
});

test('Só abre endereço de ANÚNCIO da OLX (https, host da OLX) — nunca um endereço qualquer', async () => {
  const serp = require('../src/busca-serp');
  const abertos = [];
  const fetcher = async url => {
    abertos.push(url);
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => Fx.talkMarista };
  };
  const catalogo = [
    { id: 1, portal: 'OLX', dominio: 'olx.com.br', url: OLX_TALK, titulo: 't', conteudo: '' },
    { id: 2, portal: 'ZAP Imóveis', dominio: 'zapimoveis.com.br', url: ZAP_OK, titulo: 't', conteudo: '' },
    { id: 3, portal: 'OLX', dominio: 'olx.com.br', url: 'http://go.olx.com.br/x/imoveis/casa-1234567', titulo: 't', conteudo: '' },
    { id: 4, portal: 'OLX', dominio: 'olx.com.br', url: 'https://olx.com.br.malicioso.com/x/imoveis/casa-1234567', titulo: 't', conteudo: '' }
  ];
  await L.lerAnuncios({ catalogo, criterios: bi.entenderPedido(PEDIDO).criterios, fetcher, portalDaUrl: serp.portalDaUrl, ehPaginaDeAnuncio: serp.ehPaginaDeAnuncio });
  assert.deepEqual(abertos, [OLX_TALK]);
});

test('Busca nos portais (caso real Marista R$ 1–1,6 mi): só o que atende, profissional/particular exato, sem Gemini', async () => {
  const paginas = { [OLX_TALK]: Fx.talkMarista, [OLX_SPOT]: Fx.spotMarista, [OLX_BOTANIC]: Fx.botanic };
  const fetcher = async (url, opts) => {
    if (/serper/.test(url)) {
      const q = JSON.parse(opts.body).q;
      const organic = /olx/.test(q) ? [OLX_TALK, OLX_SPOT, OLX_BOTANIC].map(link => ({ link, title: 'Apartamento Setor Marista', snippet: '' })) : /zapimoveis/.test(q) ? [{ link: ZAP_ALUGUEL, title: 'aluguel', snippet: '' }, { link: ZAP_OK, title: 'Apartamento 139m²', snippet: '' }] : [];
      return { ok: true, status: 200, json: async () => ({ organic }) };
    }
    if (paginas[url]) return { ok: true, status: 200, headers: { get: () => null }, text: async () => paginas[url] };
    return { ok: false, status: 403, headers: { get: () => null }, text: async () => '' };
  };
  const criterios = bi.entenderPedido(PEDIDO).criterios;
  const r = await bi.buscarNosPortais(criterios, PEDIDO, { env: { SERPER_API_KEY: 'x'.repeat(20), BUSCA_LIMITE_DIA: '99' }, fetcher });
  assert.ok(r.ok);
  const olx = r.itens.filter(i => i.portal === 'OLX');
  assert.equal(olx.length, 1, 'só o Talk Marista (1,45 mi, 3q, 2 vagas) atende');
  assert.deepEqual([olx[0].preco, olx[0].area, olx[0].quartos, olx[0].vagas, olx[0].tipoAnunciante, olx[0].certeza], [1450000, 140, 3, 2, 'profissional', 'anúncio']);
  assert.ok(!r.itens.some(i => /aluguel/.test(i.link)), 'aluguel descartado');
  assert.ok(!r.fontesSoltas.some(f => f.url === OLX_SPOT || f.url === OLX_BOTANIC || f.url === ZAP_ALUGUEL), 'reprovados com dado lido não voltam em "outras páginas"');
  assert.ok(r.fontesSoltas.some(f => f.url === ZAP_OK), 'ZAP sem Gemini: fica para conferência');
  assert.match(r.diagBusca, /lidos 3, reprovados 3/);
  const txt = bi.formatarRelatorio({ id: 9, descricao: 'x', avisos: [], memoria: { total: 0, grupos: 0 }, grupos: [], portais: r, links: {} }).join('\n');
  assert.match(txt, /Buscador — .*lidos 3/);
  assert.match(txt, /PROFISSIONAL/);
});

test('Busca por texto: "Goiânia" não vira Goianira (erro do cérebro que mandava a consulta para a cidade errada)', () => {
  const c = bi.entenderPedido(PEDIDO).criterios;
  assert.ok(!c.local.cidades.includes('Goianira'));
  assert.deepEqual(c.local.bairros, ['Setor Marista']);
});
