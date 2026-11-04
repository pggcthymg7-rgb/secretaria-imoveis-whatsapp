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
  const d = L.lerPaginaOlx(Fx.talkMarista, '1509799842');
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
  assert.equal(L.avaliar(L.lerPaginaOlx(Fx.talkMarista, '1509799842'), c).ok, true);
  assert.deepEqual(L.avaliar(L.lerPaginaOlx(Fx.spotMarista, '1538345527'), c), { ok: false, motivo: 'abaixo do valor' }, '870 mil e 2 quartos');
  assert.equal(L.avaliar(L.lerPaginaOlx(Fx.botanic, '1486983761'), c).ok, false, '1,89 mi está acima de 1,6 mi');
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

test('Revisão: página que não é do anúncio pedido não vira dado; preço vem do bloco do anúncio, não de "relacionados"', () => {
  assert.equal(L.lerPaginaOlx(Fx.talkMarista, '9999999999'), null, 'captcha/lista/redirecionada não cita o número do anúncio');
  assert.equal(L.lerPaginaOlx(Fx.talkMarista, '15097998'), null, 'início do número não é o número');
  const comRelacionado = Fx.talkMarista.replace('<body>', '<body><script>var rel={"price":"199000","professionalAd":false,"sellerName":"Outro"}</script>');
  const d = L.lerPaginaOlx(comRelacionado, '1509799842');
  assert.deepEqual([d.preco, d.profissional, d.anunciante], [1450000, true, 'Adão Imóveis']);
  assert.equal(L.idDoLink(OLX_TALK), '1509799842');
});

test('Revisão: suíte inferida do texto só pede conferência; vaga 0 reprova, vaga ausente pede conferência', () => {
  const c = bi.entenderPedido(PEDIDO).criterios;
  const base = { transacao: 'VENDA', tipo: 'apartamento', preco: 1300000, area: 120, quartos: 3, bairro: 'Setor Marista', cidade: 'Goiânia' };
  assert.deepEqual(L.avaliar({ ...base, suites: 1, vagas: 2 }, c), { ok: true, conferir: ['suítes'] }, '"2 quartos sendo 1 suíte master" não derruba o anúncio');
  assert.equal(L.avaliar({ ...base, suites: 2, vagas: 0 }, c).ok, false, 'a página diz 0 vagas');
  assert.deepEqual(L.avaliar({ ...base, suites: 2, vagas: null }, c), { ok: true, conferir: ['vagas'] });
});

test('Revisão: endereço — tipo vem do início do slug e RS só vale como "RS" + número', () => {
  assert.equal(L.lerEndereco('https://www.zapimoveis.com.br/imovel/venda-apartamento-3-quartos-edificio-casa-grande-setor-marista-goiania-go-120m2-id-2800000001/').tipo, 'apartamento');
  assert.equal(L.lerEndereco('https://www.zapimoveis.com.br/imovel/venda-apartamento-3-quartos-setor-bars1234567-goiania-go-120m2-id-2800000001/').preco, undefined);
});

test('Revisão: resposta sem Content-Length acima do teto é abortada (não vira HTML cortado)', async () => {
  const serp = require('../src/busca-serp');
  const grande = new ReadableStream({ start(ctl) { for (let i = 0; i < 5; i++) ctl.enqueue(new Uint8Array(1024 * 1024)); ctl.close(); } });
  const fetcher = async () => ({ ok: true, status: 200, headers: { get: () => null }, body: grande });
  const r = await L.lerAnuncios({ catalogo: [{ id: 1, portal: 'OLX', dominio: 'olx.com.br', url: OLX_TALK, titulo: 't', conteudo: '' }], criterios: bi.entenderPedido(PEDIDO).criterios, fetcher, portalDaUrl: serp.portalDaUrl, ehPaginaDeAnuncio: serp.ehPaginaDeAnuncio });
  assert.equal(r.lidas, 0);
  assert.equal(r.falhas, 1);
});

test('Revisão: "Canedo" (apelido) continua cidade; "Goiânia" não vira Goianira', () => {
  const c = bi.entenderPedido('Casa em Canedo de 400 mil a 600 mil, 3 quartos').criterios;
  assert.ok(c.local.cidades.some(x => /Canedo/.test(x)), JSON.stringify(c.local.cidades));
});

test('Falha na leitura da OLX: a linha do buscador diz o MOTIVO (HTTP 403, tempo esgotado, página sem dados)', async () => {
  const serp = require('../src/busca-serp');
  const cat = [OLX_TALK, OLX_SPOT, OLX_BOTANIC].map((url, i) => ({ id: i + 1, portal: 'OLX', dominio: 'olx.com.br', url, titulo: 't', conteudo: '' }));
  const c = bi.entenderPedido(PEDIDO).criterios;
  const ler = fetcher => L.lerAnuncios({ catalogo: cat, criterios: c, fetcher, portalDaUrl: serp.portalDaUrl, ehPaginaDeAnuncio: serp.ehPaginaDeAnuncio });
  let r = await ler(async () => ({ ok: false, status: 403, headers: { get: () => null }, text: async () => '' }));
  assert.deepEqual([r.lidas, r.falhas, r.motivos], [0, 3, { 'HTTP 403': 3 }]);
  r = await ler(async () => {
    throw Object.assign(new Error('x'), { name: 'TimeoutError' });
  });
  assert.deepEqual(r.motivos, { 'tempo esgotado': 3 });
  r = await ler(async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => '<html><title>Verificando…</title></html>' }));
  assert.deepEqual(r.motivos, { 'página sem dados do anúncio': 3 });
  r = await ler(async () => {
    throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } });
  });
  assert.deepEqual(r.motivos, { ENOTFOUND: 3 });
});

test('Busca nos portais: com a OLX recusando (403), a resposta continua e explica "N sem leitura (HTTP 403 ×N)"', async () => {
  const fetcher = async (url, opts) => {
    if (/serper/.test(url)) return { ok: true, status: 200, json: async () => ({ organic: [OLX_TALK, OLX_SPOT, OLX_BOTANIC].map(link => ({ link, title: 'Apartamento Setor Marista', snippet: '' })) }) };
    return { ok: false, status: 403, headers: { get: () => null }, text: async () => '' };
  };
  const r = await bi.buscarNosPortais(bi.entenderPedido(PEDIDO).criterios, PEDIDO, { env: { SERPER_API_KEY: 'x'.repeat(20), BUSCA_LIMITE_DIA: '99' }, fetcher });
  assert.ok(r.ok);
  assert.match(r.diagBusca, /lidos 0, reprovados 0, 3 sem leitura \(HTTP 403 ×3\)/);
});

test('"testar olx": diz se a leitura funciona nesta máquina, por que não funciona, e só aceita link de anúncio da OLX', async () => {
  const ok = await L.diagnosticarOlx({ fetcher: async () => ({ ok: true, status: 200, headers: { get: () => 'cloudflare' }, text: async () => Fx.talkMarista }) });
  assert.equal(ok.ok, true);
  const txt = L.textoDiagnosticoOlx(ok);
  assert.match(txt, /✅ A OLX respondeu/);
  assert.match(txt, /R\$ 1\.450\.000 · 140 m² · 3q · 2 vagas · Profissional \(Adão Imóveis\)/);
  assert.match(txt, /funciona nesta máquina/);
  const bloq = L.textoDiagnosticoOlx(await L.diagnosticarOlx({ fetcher: async () => ({ ok: false, status: 403, headers: { get: () => 'AkamaiGHost' }, text: async () => '<title>Access Denied</title>' }) }));
  assert.match(bloq, /❌ A OLX recusou esta máquina \(HTTP 403, servidor: AkamaiGHost, página: "Access Denied"\)/);
  assert.match(bloq, /bloqueia IP de servidor/);
  const semDados = L.textoDiagnosticoOlx(await L.diagnosticarOlx({ fetcher: async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => '<title>Um momento…</title>' }) }));
  assert.match(semDados, /⚠️ .*HTTP 200.*não trouxe os dados do anúncio.*"Um momento…"/);
  const rede = L.textoDiagnosticoOlx(await L.diagnosticarOlx({ fetcher: async () => { throw Object.assign(new Error('x'), { cause: { code: 'ETIMEDOUT' } }); } }));
  assert.match(rede, /Não consegui nem falar com a OLX.*ETIMEDOUT/);
  let abriu = false;
  const ruim = await L.diagnosticarOlx({ url: 'https://evil.example.com/imoveis/x-1234567', fetcher: async () => { abriu = true; throw new Error('não podia abrir'); } });
  assert.equal(ruim.invalida, true);
  assert.equal(abriu, false, 'endereço que não é anúncio da OLX nunca é aberto');
  assert.match(L.textoDiagnosticoOlx(ruim), /Mande o link de UM anúncio da OLX/);
});


// ---- Mais anúncios do ZAP/VivaReal: a busca solta e a página 2 rodam enquanto o portal tem POUCOS anúncios
const zapN = i => `https://www.zapimoveis.com.br/imovel/venda-apartamento-3-quartos-setor-marista-goiania-go-${100 + i}m2-id-${2800000000 + i}/`;
function serperFalso(porConsulta) {
  const corpos = [];
  const fetcher = async (url, opts) => {
    const corpo = JSON.parse(opts.body);
    corpos.push(corpo);
    const rodada = /"/.test(corpo.q) ? 1 : corpo.page === 2 ? 3 : /\d quartos/.test(corpo.q) ? 4 : 2;
    return { ok: true, status: 200, json: async () => ({ organic: (porConsulta[rodada] || []).map(link => ({ link, title: 'Apartamento', snippet: '' })) }) };
  };
  return { fetcher, corpos };
}

test('ZAP com 1 anúncio na consulta precisa: a solta e a página 2 completam (sem repetir) — antes ficava em 1', async () => {
  const Serp = require('../src/busca-serp');
  const w = serperFalso({ 1: [zapN(0)], 2: [zapN(0), zapN(1), zapN(2), zapN(3), zapN(4)], 3: [zapN(5), zapN(6), zapN(7), zapN(8)] });
  const r = await Serp.buscarAnuncios({ criterios: bi.entenderPedido(PEDIDO).criterios, dominios: ['zapimoveis.com.br'], env: { SERPER_API_KEY: 'x'.repeat(20) }, fetcher: w.fetcher });
  assert.equal(r.catalogo.length, 9, '1 + 4 novos + 4 da página 2, sem repetir o zapN(0)');
  assert.equal(w.corpos.length, 3);
  assert.equal(w.corpos[2].page, 2);
  assert.equal(w.corpos[0].page, undefined, 'a 1ª consulta não manda page');
  assert.equal(r.diag['zapimoveis.com.br'].anuncios, 9);
});

test('Portal que já tem 8+ anúncios na 1ª rodada não gasta mais consultas', async () => {
  const Serp = require('../src/busca-serp');
  const w = serperFalso({ 1: Array.from({ length: 10 }, (_, i) => zapN(i)) });
  const r = await Serp.buscarAnuncios({ criterios: bi.entenderPedido(PEDIDO).criterios, dominios: ['zapimoveis.com.br'], env: { SERPER_API_KEY: 'x'.repeat(20) }, fetcher: w.fetcher });
  assert.equal(r.catalogo.length, 10);
  assert.equal(w.corpos.length, 1);
});

test('BUSCA_RODADAS controla o custo: 1 = só a precisa; 4 = inclui a consulta por número de quartos', async () => {
  const Serp = require('../src/busca-serp');
  const c = bi.entenderPedido(PEDIDO).criterios;
  let w = serperFalso({});
  await Serp.buscarAnuncios({ criterios: c, dominios: ['zapimoveis.com.br'], env: { SERPER_API_KEY: 'x'.repeat(20), BUSCA_RODADAS: '1' }, fetcher: w.fetcher });
  assert.equal(w.corpos.length, 1);
  w = serperFalso({ 4: [zapN(50)] });
  const r = await Serp.buscarAnuncios({ criterios: c, dominios: ['zapimoveis.com.br'], env: { SERPER_API_KEY: 'x'.repeat(20), BUSCA_RODADAS: '4' }, fetcher: w.fetcher });
  assert.equal(w.corpos.length, 4);
  assert.match(w.corpos[3].q, /^site:zapimoveis\.com\.br\/imovel apartamento 3 quartos /i);
  assert.equal(r.catalogo.length, 1);
  assert.equal(Serp.VARIANTES.length, 4);
});

test('Brave: a página 2 usa offset=1; Tavily continua com uma rodada só (já é semântico)', async () => {
  const Serp = require('../src/busca-serp');
  const c = bi.entenderPedido(PEDIDO).criterios;
  const urls = [];
  await Serp.buscarAnuncios({ criterios: c, dominios: ['zapimoveis.com.br'], env: { BRAVE_SEARCH_API_KEY: 'b'.repeat(20) }, fetcher: async url => { urls.push(String(url)); return { ok: true, status: 200, json: async () => ({ web: { results: [] } }) }; } });
  assert.equal(urls.length, 3);
  assert.ok(urls[2].includes('offset=1'));
  const t = [];
  await Serp.buscarAnuncios({ criterios: c, dominios: ['zapimoveis.com.br'], env: { TAVILY_API_KEY: 'tvly-' + 't'.repeat(20) }, fetcher: async (url, o) => { t.push(JSON.parse(o.body)); return { ok: true, status: 200, json: async () => ({ results: [] }) }; } });
  assert.equal(t.length, 1);
  assert.equal(t[0].max_results, 20);
});
