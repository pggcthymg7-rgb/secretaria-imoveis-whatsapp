// Busca inteligente: memória de anúncios, leitor de preços, relatório e portais (Gemini falso)
require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const F = require('./fixtures-mensagens-reais');
const { detectPrice, detectArea } = require('../src/brain/parser');
const { normalize } = require('../src/brain/text');
const anuncios = require('../src/anuncios');
const bi = require('../src/busca-inteligente');

const preco = t => {
  const a = detectArea(normalize(t));
  return detectPrice(a.textWithoutArea, false);
};
const DIA = 86400000;
// chave FALSA montada em duas partes: o texto inteiro no arquivo faria o Secret scanning do GitHub alertar (falso positivo)
const CHAVE_FALSA = 'AIza' + 'SyD-abc_123XYZabc123XYZabc123XYZab1';

test('Leitor de preços: "R$ 950 mil", "R$ 2,8 mi" e faixas com valor completo', () => {
  assert.equal(preco('R$ 950 mil').valor_alvo, 950000, 'antes virava 95 mil');
  assert.equal(preco('Casa R$ 2,8 mi').valor_alvo, 2800000, 'antes virava 2 mi');
  let p = preco(F.pedidoClienteMarista);
  assert.deepEqual([p.valor_min, p.valor_max], [800000, 1000000], 'antes lia só 800 mil');
  p = preco('entre R$ 900.000 e R$ 1,2 mi');
  assert.deepEqual([p.valor_min, p.valor_max], [900000, 1200000]);
  p = preco('de 1,2 a 1,5 milhão');
  assert.deepEqual([p.valor_min, p.valor_max], [1200000, 1500000], '"milhão" não é "mil"');
  p = preco('de 400 mil a 1 milhão');
  assert.deepEqual([p.valor_min, p.valor_max], [400000, 1000000], 'antes virava 400 milhões');
  p = preco('de 900 mil a 1,2 mi');
  assert.deepEqual([p.valor_min, p.valor_max], [900000, 1200000]);
  // o que já funcionava continua igual
  assert.equal(preco('até R$1.2').valor_max, 1200000);
  assert.deepEqual([preco('de 400 a 500 mil').valor_min, preco('de 400 a 500 mil').valor_max], [400000, 500000]);
  assert.equal(preco('R$ 1.250.000,00').valor_alvo, 1250000);
});

test('Memória: só guarda ANÚNCIO (não pedido nem conversa), sem repetir, 90 dias', () => {
  anuncios._reset();
  assert.ok(anuncios.pareceAnuncio(F.anuncioMarista950));
  assert.ok(anuncios.pareceAnuncio(F.anuncioMaristaSemVerbo), 'anúncio sem "vendo" também conta');
  assert.ok(!anuncios.pareceAnuncio('Busco apartamento no Marista até 1 milhão'), 'pedido não é anúncio');
  assert.ok(!anuncios.pareceAnuncio('Bom dia pessoal, ótima semana a todos!'));
  const a = anuncios.registrar({ id: 'x1', ts: Date.now(), texto: F.anuncioMarista950, grupo: 'G', autor: 'Ana', telefone: '5562999990000' });
  assert.equal(a.prop.valor, 950000);
  assert.equal(a.prop.tamanho_m2, 120);
  assert.equal(anuncios.registrar({ id: 'x1', ts: Date.now(), texto: F.anuncioMarista950 }), null, 'mesma mensagem 2x');
  assert.equal(anuncios.registrar({ id: 'x2', ts: Date.now() - 91 * DIA, texto: F.anuncioMarista950 }), null, 'mais de 90 dias');
  assert.equal(anuncios.registrar({ id: 'x3', ts: Date.now(), texto: F.anuncioCasaMilhoes }).prop.valor, 2800000);
  assert.equal(anuncios.resumo().total, 2);
});

test('Busca nos grupos: acha o perfil, descarta o resto e junta o mesmo imóvel de vários grupos', async () => {
  anuncios._reset();
  const add = (id, texto, grupo, autor, h = 1) => anuncios.registrar({ id, ts: Date.now() - h * 3600e3, texto, grupo, autor, telefone: '5562999990000' });
  add('a', F.anuncioMarista950, 'Grupo Marista', 'Ana');
  add('b', F.anuncioMarista950, 'Corretores GYN', 'Ana', 2);
  add('c', F.anuncioMaristaSemVerbo, 'Imóveis GO', 'Beto');
  add('d', 'Apto Setor Marista 80m² 700 mil', 'Imóveis GO', 'Caio');
  add('e', 'Apto Setor Bueno 120m² 900 mil', 'Imóveis GO', 'Duda');
  add('f', 'Apto Marista 130m² 1.5 milhão', 'Imóveis GO', 'Eva');
  const r = await bi.buscar(F.pedidoClienteMarista, { env: {} });
  assert.equal(r.grupos.length, 2);
  const g950 = r.grupos.find(g => g.prop.valor === 950000);
  assert.deepEqual(g950.fontes.map(f => f.grupo).sort(), ['Corretores GYN', 'Grupo Marista']);
  assert.ok(r.grupos.some(g => g.prop.valor === 980000));
  assert.equal(r.portais.motivo, 'sem_chave');
  const txt = bi.formatarRelatorio(r).join('\n');
  assert.match(txt, /NOS SEUS GRUPOS\* \(2\)/);
  assert.match(txt, /wa\.me\/5562999990000/);
  assert.match(txt, /Grupo Marista/);
  assert.match(txt, /falta uma chave de busca/);
  assert.match(txt, /zapimoveis\.com\.br\/venda\/apartamentos\/go\+goiania\+\+setor-marista\/\?precoMinimo=800000&precoMaximo=1000000&areaMinima=100/);
  assert.match(txt, /vivareal\.com\.br\/venda\/goias\/goiania\/bairros\/setor-marista\/apartamento_residencial/);
  assert.match(txt, /olx\.com\.br\/imoveis\/venda\/.*ps=800000&pe=1000000/);
  assert.ok(bi.formatarRelatorio(r).every(m => m.length <= 3600), 'mensagens cabem no WhatsApp');
});

function geminiFalso({ itens, fontes, status = 200 }) {
  const chamadas = [];
  const fetcher = async (url, opts = {}) => {
    chamadas.push({ url, opts });
    if (opts.method === 'HEAD') {
      const real = fontes.find(f => f.redirect === url);
      return { headers: { get: k => (k === 'location' && real ? real.url : null) } };
    }
    return {
      ok: status === 200,
      status,
      json: async () =>
        status === 200
          ? {
              candidates: [{
                content: { parts: [{ text: 'Aqui estão:\n```json\n' + JSON.stringify(itens) + '\n```' }] },
                groundingMetadata: { groundingChunks: fontes.map(f => ({ web: { uri: f.redirect, title: f.titulo } })) }
              }]
            }
          : { error: { message: 'Resource exhausted' } }
    };
  };
  return { fetcher, chamadas };
}

test('Portais: só entra anúncio com link confirmado pelo Google; separa profissional x particular; sem repetir', async () => {
  const fontes = [
    { redirect: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA', url: 'https://go.olx.com.br/grande-goiania-e-anapolis/imoveis/apto-marista-120m-1234567890', titulo: 'olx.com.br' },
    { redirect: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/BBB', url: 'https://www.zapimoveis.com.br/imovel/venda-apartamento-3-quartos-setor-marista-goiania-go-115m2-id-2700000001/', titulo: 'zapimoveis.com.br' },
    { redirect: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/CCC', url: 'https://www.vivareal.com.br/imovel/apartamento-3-quartos-setor-marista-bairros-goiania-115m2-venda-RS950000-id-2700000002/', titulo: 'vivareal.com.br' },
    { redirect: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/DDD', url: 'https://www.exemplo-blog.com/marista', titulo: 'blog' },
    { redirect: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/EEE', url: 'https://go.olx.com.br/grande-goiania-e-anapolis/imoveis/cobertura-marista-999', titulo: 'olx.com.br' }
  ];
  const itens = [
    { titulo: 'Apto 120m² Marista direto com o proprietário', portal: 'OLX', link: fontes[0].url, preco: 900000, area_m2: 120, quartos: 3, bairro: 'Setor Marista', anunciante: 'Particular', tipo_anunciante: 'particular' },
    { titulo: 'Apartamento 3 quartos 115 m²', portal: 'ZAP Imóveis', link: fontes[1].url, preco: 'R$ 950.000', area_m2: 115, quartos: 3, bairro: 'Setor Marista', anunciante: 'Lopes Imobiliária', tipo_anunciante: 'profissional' },
    { titulo: 'Mesmo apto no VivaReal', portal: 'VivaReal', link: fontes[2].url, preco: 950000, area_m2: 115, quartos: 3, bairro: 'Setor Marista', anunciante: 'Lopes Imobiliária' },
    { titulo: 'Inventado pela IA', portal: 'ZAP Imóveis', link: 'https://www.zapimoveis.com.br/imovel/nao-existe-id-1/', preco: 850000, area_m2: 110, bairro: 'Setor Marista' },
    { titulo: 'Caro demais', portal: 'OLX', link: fontes[4].url, preco: 2000000, area_m2: 200 },
    { titulo: 'Blog', portal: 'OLX', link: fontes[3].url, preco: 900000 }
  ];
  const { fetcher, chamadas } = geminiFalso({ itens, fontes });
  const { criterios } = bi.entenderPedido(F.pedidoClienteMarista);
  const r = await bi.buscarNosPortais(criterios, F.pedidoClienteMarista, { env: { GEMINI_API_KEY: 'k', BUSCA_LIMITE_DIA: '5' }, fetcher });
  assert.equal(r.ok, true);
  assert.deepEqual(r.itens.map(i => i.portal), ['OLX', 'ZAP Imóveis'], 'inventado, caro, blog e repetido ficam de fora');
  assert.equal(r.itens[0].tipoAnunciante, 'particular');
  assert.equal(r.itens[1].tipoAnunciante, 'profissional');
  assert.equal(r.itens[1].preco, 950000);
  const pedido = chamadas.find(c => /generateContent/.test(c.url));
  assert.equal(pedido.opts.headers['x-goog-api-key'], 'k', 'chave vai no cabeçalho, não na URL');
  assert.doesNotMatch(pedido.url, /key=/);
  assert.deepEqual(JSON.parse(pedido.opts.body).tools, [{ google_search: {} }]);
  const txt = bi.formatarRelatorio({ ...(await bi.buscar('apto 800 mil a 1 milhão setor marista', { env: {} })), portais: r }).join('\n');
  assert.match(txt, /PARTICULAR\* \(1\)/);
  assert.match(txt, /PROFISSIONAL\* \(1\)/);
  assert.match(txt, /estimativa/);
});

test('Portais: limite diário, cota do Google e sem chave nunca quebram a busca', async () => {
  const { criterios } = bi.entenderPedido(F.pedidoClienteMarista);
  const env = { GEMINI_API_KEY: 'k', BUSCA_LIMITE_DIA: '0' };
  let r = await bi.buscarNosPortais(criterios, 'x', { env, fetcher: async () => assert.fail('não pode chamar o Gemini') });
  assert.equal(r.motivo, 'limite');
  r = await bi.buscarNosPortais(criterios, 'x', { env: { GEMINI_API_KEY: 'k', BUSCA_LIMITE_DIA: '99' }, fetcher: geminiFalso({ itens: [], fontes: [], status: 429 }).fetcher });
  assert.equal(r.motivo, 'cota');
  r = await bi.buscarNosPortais(criterios, 'x', { env: {}, fetcher: async () => assert.fail('sem chave não chama') });
  assert.equal(r.motivo, 'sem_chave');
  assert.deepEqual(bi.extrairJson('lixo sem json'), []);
});

test('Conversa exportada: Android (.txt) e iPhone (.zip) viram anúncios do grupo certo', () => {
  anuncios._reset();
  const hoje = new Date();
  const d = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;
  const android = `${d} 09:15 - Ana Corretora: ${F.anuncioMarista950}\n${d} 09:20 - Beto: Bom dia!\n${d} 10:00 - +55 62 99999-1111: Apto 3Q Marista 110m² 980 mil\nlazer completo, aceita permuta\n${d} 10:05 - Caio: <Mídia oculta>`;
  let r = anuncios.importarExportacao(Buffer.from(android), 'Conversa do WhatsApp com Corretores Marista.txt');
  assert.equal(r.grupo, 'Corretores Marista');
  assert.equal(r.lidas, 3);
  assert.equal(r.anuncios, 2);
  const lista = anuncios.todos();
  assert.ok(lista.some(a => a.autor === 'Ana Corretora' && a.grupo === 'Corretores Marista'));
  assert.ok(lista.some(a => a.telefone === '5562999991111' && /aceita permuta/.test(a.texto)), 'mensagem de várias linhas fica inteira');

  // iPhone: [dd/mm/aaaa, hh:mm:ss] Nome: texto, dentro de um .zip
  const ios = `[${d}, 11:00:00] Duda Imóveis: ${F.anuncioCasaMilhoes}`;
  const dados = zlib.deflateRawSync(Buffer.from(ios));
  const nome = Buffer.from('_chat.txt');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(dados.length, 18); local.writeUInt16LE(nome.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(dados.length, 20); central.writeUInt16LE(nome.length, 28); central.writeUInt32LE(0, 42);
  const cdOffset = local.length + nome.length + dados.length;
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(1, 8); fim.writeUInt16LE(1, 10); fim.writeUInt32LE(central.length + nome.length, 12); fim.writeUInt32LE(cdOffset, 16);
  const zip = Buffer.concat([local, nome, dados, central, nome, fim]);
  r = anuncios.importarExportacao(zip, 'WhatsApp Chat - Alto Padrão GYN.zip');
  assert.equal(r.grupo, 'Alto Padrão GYN');
  assert.equal(r.anuncios, 1);
  assert.equal(anuncios.importarExportacao(zip, 'WhatsApp Chat - Alto Padrão GYN.zip').anuncios, 0, 'importar 2x não duplica');
  assert.throws(() => anuncios.importarExportacao(Buffer.from('PK\u0003\u0004lixo'), 'x.zip'));
});

test('Segurança: só abre redirecionamento do Google (nada de endereço interno vindo da resposta)', async () => {
  const fontes = [{ redirect: 'http://169.254.169.254/latest/meta-data?vertexaisearch', url: 'https://go.olx.com.br/x-1', titulo: 'olx' }];
  const { fetcher, chamadas } = geminiFalso({ itens: [], fontes });
  const { criterios } = bi.entenderPedido(F.pedidoClienteMarista);
  await bi.buscarNosPortais(criterios, 'x', { env: { GEMINI_API_KEY: 'k', BUSCA_LIMITE_DIA: '99' }, fetcher });
  assert.ok(!chamadas.some(c => c.opts.method === 'HEAD'), 'não fez HEAD no endereço interno');
});

test('Conversa exportada: hora "PM" em inglês e mensagens diferentes no mesmo minuto', () => {
  anuncios._reset();
  const hoje = new Date();
  const d = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;
  const [m1] = anuncios.lerExportacao(`[${d}, 1:05:00 PM] Ana: oi`);
  assert.equal(new Date(m1.ts).getHours(), 13);
  const [m2] = anuncios.lerExportacao(`[${d}, 12:10:00 AM] Ana: oi`);
  assert.equal(new Date(m2.ts).getHours(), 0);
  // mesmo autor, mesmo minuto, mesmo tamanho de texto: são 2 anúncios
  const a1 = 'Vendo apto Setor Marista 120m² R$ 950 mil';
  const a2 = 'Vendo apto Setor Bueno 120m² R$ 900 mil..';
  assert.equal(a1.length, a2.length);
  const r = anuncios.importarExportacao(Buffer.from(`${d} 09:15 - Ana: ${a1}\n${d} 09:15 - Ana: ${a2}`), 'Conversa do WhatsApp com G.txt');
  assert.equal(r.anuncios, 2);
});

// ---------------------------------------------------------------------------
// Painel › Busca (API) e configurações compartilhadas com o "Mensagem para mim"
test('Painel › Busca: exige login, busca, guarda no histórico, valida configurações e importa conversa com acento', async () => {
  const { app } = require('../index');
  const server = await new Promise(r => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { 'x-secretaria': '1' };
  try {
    let r = await fetch(`${base}/api/busca`, { headers: H });
    assert.equal(r.status, 401, 'sem login não entra');
    r = await fetch(`${base}/api/login`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ senha: process.env.PAINEL_SENHA }) });
    const cookie = r.headers.get('set-cookie').split(';')[0];
    const J = { ...H, cookie, 'Content-Type': 'application/json' };
    anuncios._reset();
    anuncios.registrar({ id: 'p1', ts: Date.now(), texto: F.anuncioMarista950, grupo: 'Grupo Marista', autor: 'Ana', telefone: '5562999990000' });
    r = await fetch(`${base}/api/busca`, { method: 'POST', headers: J, body: JSON.stringify({ texto: 'oi' }) });
    assert.equal(r.status, 400);
    r = await fetch(`${base}/api/busca`, { method: 'POST', headers: J, body: JSON.stringify({ texto: F.pedidoClienteMarista }) });
    const j = await r.json();
    assert.equal(j.busca.grupos.length, 1);
    assert.ok(j.estado.historico.some(h => h.id === j.busca.id));
    r = await fetch(`${base}/api/busca/item/${j.busca.id}`, { headers: J });
    assert.equal((await r.json()).descricao, j.busca.descricao, 'rever sem buscar de novo');
    // configurações
    r = await fetch(`${base}/api/busca/config`, { method: 'POST', headers: J, body: JSON.stringify({ limiteDia: 999 }) });
    assert.equal(r.status, 400);
    r = await fetch(`${base}/api/busca/config`, { method: 'POST', headers: J, body: JSON.stringify({ geminiApiKey: 'chave com espaço e ; rm -rf' }) });
    assert.equal(r.status, 400, 'chave inválida não é gravada');
    r = await fetch(`${base}/api/config`, { method: 'POST', headers: J, body: JSON.stringify({ geminiApiKey: 'chave com espaço e ; rm -rf', resumoDiarioHorario: '07:00' }) });
    assert.equal(r.status, 400, 'Ajustes também confere a chave');
    assert.notEqual(require('../src/settings').loadSettings().resumoDiarioHorario, '07:00', 'nada é salvo se a chave for recusada');
    r = await fetch(`${base}/api/busca/config`, { method: 'POST', headers: J, body: JSON.stringify({ limiteDia: 5, olx: false, zap: true, vivareal: false }) });
    const cfg = (await r.json()).config;
    assert.deepEqual([cfg.limiteDia, cfg.olx, cfg.zap, cfg.vivareal], [5, false, true, false]);
    assert.deepEqual(Object.keys(bi.linksProntos(bi.entenderPedido(F.pedidoClienteMarista).criterios)), ['ZAP Imóveis'], 'só o portal ligado');
    bi.atualizarConfig({ olx: false, zap: false, vivareal: false });
    const sem = await bi.buscarNosPortais(bi.entenderPedido(F.pedidoClienteMarista).criterios, 'x', { env: { GEMINI_API_KEY: 'k' }, fetcher: async () => assert.fail('portais desligados não chamam o Gemini') });
    assert.equal(sem.motivo, 'desligado');
    bi.atualizarConfig({ olx: true, zap: true, vivareal: true, limiteDia: 20 });
    // conversa exportada com acento no nome
    const hoje = new Date();
    const d = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;
    const fd = new FormData();
    fd.append('arquivo', new Blob([`${d} 08:00 - Eva: ${F.anuncioCasaMilhoes}`]), 'Conversa do WhatsApp com Imóveis São João.txt');
    r = await fetch(`${base}/api/busca/importar-conversa`, { method: 'POST', headers: { ...H, cookie }, body: fd });
    const imp = await r.json();
    assert.equal(imp.grupo, 'Imóveis São João');
    assert.equal(imp.anuncios, 1);
    const fd2 = new FormData();
    fd2.append('arquivo', new Blob(['x']), 'foto.jpg');
    r = await fetch(`${base}/api/busca/importar-conversa`, { method: 'POST', headers: { ...H, cookie }, body: fd2 });
    assert.equal(r.status, 400, 'só .txt ou .zip');
  } finally {
    server.close();
  }
});

test('Chave do Gemini: limpa o que vem colado e confere no Google (caso João: chave nova recusada)', async () => {
  const g = require('../src/gemini-chave');
  const k = CHAVE_FALSA;
  for (const colado of [k, ` ${k}\n`, `"${k}"`, `GEMINI_API_KEY=${k}`, k.slice(0, 7) + '​' + k.slice(7)]) assert.equal(g.limparChave(colado), k);
  assert.ok(g.formatoValido('AQ.Ab8RN6Kx-formato.novo_com_ponto_123'), 'formato novo com ponto');
  assert.ok(!g.formatoValido(g.limparChave('chave com espaço ; rm -rf')));
  const ok = async () => ({ ok: true, status: 200, json: async () => ({}) });
  const recusa = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'API key not valid.' } }) });
  const semInternet = async () => {
    throw new Error('ENOTFOUND');
  };
  assert.deepEqual(await g.validarChave(` ${k} `, ok), { ok: true, chave: k, mensagem: 'Chave do Gemini funcionando ✅' });
  assert.match((await g.validarChave(k, recusa)).mensagem, /O Google recusou a chave \(400: API key not valid/);
  const off = await g.validarChave(k, semInternet);
  assert.equal(off.ok, true, 'sem internet salva mesmo assim');
  assert.match(off.mensagem, /não consegui falar com o Google/);
  let header;
  await g.testarChave(k, async (url, o) => ((header = o.headers['x-goog-api-key']), ok()));
  assert.equal(header, k, 'chave vai no cabeçalho, nunca na URL');
});

test('Grupos da busca são separados dos grupos de pedidos (padrão: todos; conversa exportada sempre entra)', async () => {
  anuncios._reset();
  bi.atualizarConfig({ todosGrupos: true });
  const add = (id, grupoId, grupo) => anuncios.registrar({ id, ts: Date.now(), texto: F.anuncioMarista950.replace('950', String(900 + id.length)), grupo, grupoId, autor: 'Ana' });
  add('a', 'g1@g.us', 'Grupo A');
  add('bb', 'g2@g.us', 'Grupo B');
  add('ccc', 'exp:alto padrao', 'Alto Padrão (exportado)');
  const nomes = () => bi.buscarNosGrupos(bi.entenderPedido(F.pedidoClienteMarista).criterios, bi.entenderPedido(F.pedidoClienteMarista).index).flatMap(g => g.fontes.map(f => f.grupo)).sort();
  assert.deepEqual(nomes(), ['Alto Padrão (exportado)', 'Grupo A', 'Grupo B'], 'padrão: todos');
  const cfg = bi.atualizarConfig({ gruposIds: ['g1@g.us', 'lixo', '<script>@g.us', 'g1@g.us'] });
  assert.deepEqual(cfg.gruposIds, ['g1@g.us'], 'só ids válidos, sem repetir');
  assert.equal(cfg.todosGrupos, false);
  assert.ok(bi.grupoNaBusca('g1@g.us') && !bi.grupoNaBusca('g2@g.us') && bi.grupoNaBusca('exp:qualquer'));
  assert.deepEqual(nomes(), ['Alto Padrão (exportado)', 'Grupo A'], 'Grupo B fora da busca');
  bi.atualizarConfig({ todosGrupos: true });
  assert.equal(bi.getConfig().todosGrupos, true);
});

test('Testar chave salva: corrige chave "suja" salva pela versão antiga de Ajustes e diz se funciona', async () => {
  const g = require('../src/gemini-chave');
  const antes = process.env.GEMINI_API_KEY;
  try {
    process.env.GEMINI_API_KEY = '';
    assert.match((await g.testarChaveSalva(async () => assert.fail('sem chave não chama'))).mensagem, /Nenhuma chave/);
    process.env.GEMINI_API_KEY = CHAVE_FALSA.slice(0, 15) + '\u200b' + CHAVE_FALSA.slice(15);
    let enviada;
    const r = await g.testarChaveSalva(async (url, o) => ((enviada = o.headers['x-goog-api-key']), { ok: true, status: 200, json: async () => ({}) }));
    assert.equal(r.ok, true);
    assert.match(r.mensagem, /funcionando/);
    assert.equal(enviada, CHAVE_FALSA, 'testou a chave limpa');
    assert.equal(process.env.GEMINI_API_KEY, CHAVE_FALSA, 'e corrigiu a salva');
    const ruim = await g.testarChaveSalva(async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'API key not valid.' } }) }));
    assert.equal(ruim.ok, false);
    assert.match(ruim.mensagem, /API key not valid[\s\S]*aistudio/);
  } finally {
    process.env.GEMINI_API_KEY = antes || '';
  }
});

// ---------------------------------------------------------------------------
// Modelo do Gemini descoberto (caso real do João: "gemini-2.5-flash is no longer available to new users")
test('Modelo do Gemini: escolhe o flash estável mais novo que a chave pode usar', () => {
  const M = require('../src/gemini-modelo');
  const gc = ['generateContent'];
  const lista = [
    { name: 'models/gemini-2.5-flash', supportedGenerationMethods: gc },
    { name: 'models/gemini-3.8-flash', supportedGenerationMethods: gc },
    { name: 'models/gemini-3.8-flash-lite', supportedGenerationMethods: gc },
    { name: 'models/gemini-3.9-flash-preview', supportedGenerationMethods: gc },
    { name: 'models/gemini-3.10-flash', supportedGenerationMethods: gc },
    { name: 'models/gemini-3.8-pro', supportedGenerationMethods: gc },
    { name: 'models/gemini-4.0-flash', supportedGenerationMethods: ['embedContent'] },
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] }
  ];
  assert.equal(M.melhorFlash(lista), 'gemini-3.10-flash', '3.10 > 3.8 (comparação numérica); sem lite/preview/pro/sem generateContent');
  assert.equal(M.melhorFlash(lista, ['gemini-3.10-flash']), 'gemini-3.8-flash', 'ignora o que acabou de falhar');
  assert.equal(M.melhorFlash([]), null);
  assert.ok(M.modeloIndisponivel(404, ''));
  assert.ok(M.modeloIndisponivel(400, 'This model models/gemini-2.5-flash is no longer available to new users.'));
  assert.ok(!M.modeloIndisponivel(429, 'quota'), 'cota esgotada não é modelo indisponível');
});

test('Portais (Gemini + Google): fila de modelos começa pelo 2.5 e passa ao próximo em 404/429, sem gastar outra busca do dia', async () => {
  const M = require('../src/gemini-modelo');
  const fonte = { redirect: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/ZZZ', url: 'https://go.olx.com.br/grande-goiania-e-anapolis/imoveis/apto-marista-777', titulo: 'olx' };
  const item = { titulo: 'Apto Marista', portal: 'OLX', link: fonte.url, preco: 900000, area_m2: 120, quartos: 3, bairro: 'Setor Marista', anunciante: 'Particular', tipo_anunciante: 'particular' };
  const usados = [];
  const fabrica = ({ aposentados = [], semCota = [], semLista = false }) => async (url, o = {}) => {
    if (o.method === 'HEAD') return { headers: { get: () => fonte.url } };
    if (/\/models\?pageSize/.test(url)) return semLista ? { ok: false, status: 500 } : { ok: true, status: 200, json: async () => ({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }] }) };
    const modelo = decodeURIComponent(url.match(/models\/([^:]+):generateContent/)[1]);
    usados.push(modelo);
    if (aposentados.includes(modelo)) return { ok: false, status: 404, json: async () => ({ error: { message: `This model models/${modelo} is no longer available to new users.` } }) };
    if (semCota.includes(modelo)) return { ok: false, status: 429, json: async () => ({ error: { message: 'You exceeded your current quota, limit: 0' } }) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify([item]) + '\n```' }] }, groundingMetadata: { groundingChunks: [{ web: { uri: fonte.redirect, title: 'olx' } }] } }] }) };
  };
  const { criterios } = bi.entenderPedido(F.pedidoClienteMarista);
  const env = chave => ({ GEMINI_API_KEY: chave, BUSCA_LIMITE_DIA: '99' });

  // 1) modelo fixado que o Google aposentou: cai para o próximo da fila (2.5-flash-lite)
  M.esquecer('k-modelo');
  let antes = bi._uso.usoHoje();
  let r = await bi.buscarNosPortais(criterios, F.pedidoClienteMarista, { env: { ...env('k-modelo'), GEMINI_BUSCA_MODEL: 'gemini-2.5-flash' }, fetcher: fabrica({ aposentados: ['gemini-2.5-flash'] }) });
  assert.equal(r.ok, true);
  assert.equal(r.modelo, 'gemini-2.5-flash-lite');
  assert.deepEqual(usados, ['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  assert.equal(r.itens.length, 1);
  assert.equal(bi._uso.usoHoje(), antes + 1, 'as novas tentativas não gastam outra busca do dia');

  // 2) os dois 2.5 aposentados (caso real do João): chega ao modelo descoberto na lista da chave
  M.esquecer('k-modelo');
  usados.length = 0;
  r = await bi.buscarNosPortais(criterios, F.pedidoClienteMarista, { env: env('k-modelo'), fetcher: fabrica({ aposentados: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'] }) });
  assert.equal(r.ok, true);
  assert.deepEqual(usados, ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.8-flash']);

  // 3) todos sem cota (429 / limit: 0): "cota" com os modelos tentados e SEM gastar a busca do dia
  M.esquecer('k-modelo');
  usados.length = 0;
  antes = bi._uso.usoHoje();
  r = await bi.buscarNosPortais(criterios, F.pedidoClienteMarista, { env: env('k-modelo'), fetcher: fabrica({ semCota: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.8-flash'] }) });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'cota');
  assert.equal(r.tentativas.length, 3);
  assert.match(r.explicacao, /Modelos tentados: gemini-2\.5-flash, gemini-2\.5-flash-lite, gemini-3\.8-flash/);
  assert.match(r.explicacao, /limit: 0/);
  assert.equal(bi._uso.usoHoje(), antes, 'busca sem resposta não conta');

  // 4) sem lista de modelos: usa o 2.5-flash direto (e, se faltar tudo, o apelido gemini-flash-latest)
  M.esquecer('k-modelo');
  usados.length = 0;
  await bi.buscarNosPortais(criterios, F.pedidoClienteMarista, { env: env('k-modelo'), fetcher: fabrica({ semLista: true }) });
  assert.deepEqual(usados, ['gemini-2.5-flash']);
  M.esquecer('k-modelo');
  usados.length = 0;
  await bi.buscarNosPortais(criterios, F.pedidoClienteMarista, { env: env('k-modelo'), fetcher: fabrica({ semLista: true, aposentados: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'] }) });
  assert.deepEqual(usados, ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest']);
});

// ---------------------------------------------------------------------------
// Filtros iguais aos dos portais (pedido do João: cidade, bairro, condomínio/edifício, valor, quartos, tamanho…)
test('Filtros: valores, faixas e campos em branco (o que não é preenchido fica aberto)', () => {
  const Fl = require('../src/busca-filtros');
  const n = b => Fl.normalizarFiltros(b);
  assert.deepEqual(n({ valor: 'de 4 milhões até 5 milhões' }).filtros, { valorMin: 4000000, valorMax: 5000000 });
  assert.deepEqual(n({ valor: '4 a 5 milhões' }).filtros, { valorMin: 4000000, valorMax: 5000000 }, '4 herda a unidade do 5');
  assert.deepEqual(n({ valor: 'de 800 mil a 1.000.000,00' }).filtros, { valorMin: 800000, valorMax: 1000000 });
  assert.deepEqual(n({ valorMin: '4 milhões', valorMax: '5 milhões' }).filtros, { valorMin: 4000000, valorMax: 5000000 });
  assert.deepEqual(n({ valorMin: '5 milhões', valorMax: '4 milhões' }).filtros, { valorMin: 4000000, valorMax: 5000000 }, 'ao contrário: troca');
  assert.deepEqual(n({ valorMax: '800' }).filtros, { valorMax: 800000 }, '800 = 800 mil');
  assert.deepEqual(n({ area: 'a partir de 100 m²' }).filtros, { areaMin: 100 });
  assert.deepEqual(n({ areaMin: '1.000', areaMax: '' }).filtros, { areaMin: 1000 });
  assert.deepEqual(n({ tipo: 'Apto', suites: '4+', quartos: '-', vagas: '' }).filtros, { tipo: 'Apartamento', suites: 4 });
  assert.deepEqual(n({ cidade: '  ', bairro: '—' }).filtros, {}, 'branco/traço = aberto');
  assert.match(n({ valorMin: 'caro' }).erros[0], /Não entendi o valor "caro"/);
  assert.match(n({ tipo: 'nave espacial' }).erros[0], /Não entendi o tipo/);
  assert.equal(n({ bairro: '<script>alert(1)</script>' }).filtros.bairro.includes('<'), false, 'sem < nem >');
  // "campo: valor; campo: valor" (WhatsApp)
  assert.deepEqual(Fl.parseCampos('cidade: Goiânia; condomínio: Jardins Itália\nsuítes: 4; valor: de 4 milhões a 5 milhões'), { cidade: 'Goiânia', local: 'Jardins Itália', suites: '4', valor: 'de 4 milhões a 5 milhões' });
  assert.equal(Fl.parseCampos('casa no marista até 1 milhão'), null, 'texto livre não é campo');
  assert.equal(Fl.parseCampos('apto marista: 100m²'), null, 'campo desconhecido não é campo');
});

test('Filtros -> critérios: confere nome por nome (o mapa errava "Goiânia" -> Goianira e "Xyzabc Park" -> outro condomínio)', () => {
  const Fl = require('../src/busca-filtros');
  const crit = b => bi.entenderFiltros(Fl.normalizarFiltros(b).filtros);
  let { criterios: c, avisos } = crit({ cidade: 'Goiânia', bairro: 'Setor Marista', tipo: 'apto', area: 'a partir de 100', valor: '800 mil a 1 milhão' });
  assert.deepEqual(c.local.cidades, ['Goiânia'], 'Goiânia é Goiânia');
  assert.deepEqual(c.local.bairros, ['Setor Marista']);
  assert.deepEqual([c.valor_min, c.valor_max, c.area_min, c.tipos[0]], [800000, 1000000, 100, 'Apartamento']);
  assert.deepEqual(avisos, []);
  ({ criterios: c } = crit({ tipo: 'casa', local: 'Jardins Itália', suites: '4', valor: '4 a 5 milhões' }));
  assert.deepEqual(c.local.condominios.map(x => x.name), ['Condomínio Jardim Itália'], 'plural/typo do nome digitado acha o condomínio');
  assert.equal(c.suites_min, 4);
  ({ criterios: c, avisos } = crit({ cidade: 'Aparecida de Goiânia', local: 'Residencial Xyzabc Park' }));
  assert.deepEqual(c.local.condominios, [], 'nome que o mapa não conhece NÃO vira outro condomínio');
  assert.deepEqual(c.local.nomesDesconhecidos, ['residencial xyzabc park'], 'vira busca pelo nome escrito nos anúncios');
  assert.match(avisos[0], /não está no meu mapa/);
  ({ avisos } = crit({ cidade: 'Cidade Que Nao Existe', bairro: 'Jardim Goiás' }));
  assert.match(avisos[0], /Não conheço a cidade/);
  ({ avisos } = crit({ bairro: 'Setor Marista', local: 'Jardins Itália' }));
  assert.match(avisos[0], /usei só o condomínio/);
  assert.ok(bi.credivel('Jardins Itália', 'Condomínio Jardim Itália', [], true));
  assert.ok(bi.credivel('Condominio Jardim Italia', 'Condomínio Jardim Itália', [], true));
  assert.ok(bi.credivel('Alphavile Flamboyant', 'Alphaville Flamboyant', [], true), '1 letra a menos no condomínio: aceita');
  assert.ok(!bi.credivel('Goiânia', 'Goianira', ['Goianira']), 'cidade: exato (Goiânia e Goianira diferem por 1 letra)');
  assert.ok(!bi.credivel('Goianira', 'Goiânia', ['Goiânia']));
  assert.ok(!bi.credivel('Residencial Xyzabc Park', 'Residencail', []));
});

test('Busca por filtros nos grupos: condomínio + 4 suítes + de 4 a 5 milhões acha só o que serve', async () => {
  anuncios._reset();
  bi.atualizarConfig({ todosGrupos: true });
  const add = (id, texto, grupo, autor) => anuncios.registrar({ id, ts: Date.now(), texto, grupo, grupoId: 'g1@g.us', autor, telefone: '5562999990000' });
  add('a', 'Vendo casa no Condomínio Jardins Itália, 5 suítes, 450m², R$ 4,5 milhões. Chama no pv', 'Alto Padrão GYN', 'Ana');
  add('b', 'Vendo casa no Condomínio Alphaville Flamboyant 4 suítes 500m² R$ 4,8 milhões', 'Alto Padrão GYN', 'Beto');
  add('c', 'Vendo casa Condomínio Jardins Itália 3 suítes 300m² R$ 3,2 milhões', 'Alto Padrão GYN', 'Caio');
  add('d', 'Vendo casa Condomínio Jardins Itália 4 suítes 400m² R$ 6 milhões', 'Alto Padrão GYN', 'Duda');
  const r = await bi.buscarComFiltros({ tipo: 'casa', local: 'Jardins Itália', suites: '4', valor: 'de 4 milhões até 5 milhões' }, { env: {}, guardar: false });
  assert.deepEqual(r.grupos.map(g => g.fontes[0].autor), ['Ana'], 'só o de 4,5 mi, 5 suítes, no Jardins Itália');
  assert.equal(r.descricao, 'Casa, à venda, em Jardins Itália, Goiânia - GO, de R$ 4 mi a R$ 5 mi, 4+ suítes');
  assert.equal(r.filtros.local, 'Jardins Itália');
  // só o condomínio preenchido: o resto fica aberto (acha os 3 do Jardins Itália)
  const aberto = await bi.buscarComFiltros({ local: 'Jardins Itália' }, { env: {}, guardar: false });
  assert.deepEqual(aberto.grupos.map(g => g.fontes[0].autor).sort(), ['Ana', 'Caio', 'Duda']);
  // o mesmo pedido escrito em texto livre (caso real do João) dá os mesmos critérios dos campos
  const livre = bi.entenderPedido(F.pedidoJardinsItalia).criterios;
  const porCampos = bi.entenderFiltros(require('../src/busca-filtros').normalizarFiltros({ tipo: 'casa', local: 'Jardins Itália', suites: '4', valor: 'de 4 milhões até 5 milhões' }).filtros).criterios;
  assert.deepEqual([livre.tipos, livre.valor_min, livre.valor_max, livre.suites_min, livre.local.condominios.map(x => x.name)], [porCampos.tipos, porCampos.valor_min, porCampos.valor_max, porCampos.suites_min, porCampos.local.condominios.map(x => x.name)]);
  // sem nenhum campo: recusa
  await assert.rejects(() => bi.buscarComFiltros({ negocio: 'VENDA' }, { env: {}, guardar: false }), /Preencha pelo menos um campo/);
  // links prontos usam o nome digitado
  assert.match(r.links['OLX'], /q=casa\+jardins\+it%C3%A1lia/i);
  // portais recebem a descrição completa no pedido ao Gemini
  let prompt;
  await bi.buscarNosPortais(r.criterios, r.criterios.resumo, { env: { GEMINI_API_KEY: 'k-filtros', GEMINI_BUSCA_MODEL: 'gemini-3.8-flash', BUSCA_LIMITE_DIA: '99' }, fetcher: async (u, o) => ((prompt = JSON.parse(o.body).contents[0].parts[0].text), { ok: true, status: 200, json: async () => ({ candidates: [] }) }) });
  assert.match(prompt, /Casa, à venda, em Jardins Itália, Goiânia - GO, de R\$ 4 mi a R\$ 5 mi, 4\+ suítes/);
});

test('Painel › Busca por filtros (API): valida, usa os campos e o texto livre vira "mais detalhes"', async () => {
  const { app } = require('../index');
  const server = await new Promise(r => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { 'x-secretaria': '1' };
  try {
    let r = await fetch(`${base}/api/login`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ senha: process.env.PAINEL_SENHA }) });
    const J = { ...H, cookie: r.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json' };
    anuncios._reset();
    anuncios.registrar({ id: 'f1', ts: Date.now(), texto: 'Vendo casa no Condomínio Jardins Itália, 5 suítes, 450m², R$ 4,5 milhões', grupo: 'G', grupoId: 'g1@g.us', autor: 'Ana', telefone: '5562999990000' });
    r = await fetch(`${base}/api/busca`, { method: 'POST', headers: J, body: JSON.stringify({ filtros: { tipo: 'Casa', negocio: 'VENDA', local: 'Jardins Itália', suites: 4, valorMin: '4 milhões', valorMax: '5 milhões', cidade: '' } }) });
    const j = await r.json();
    assert.equal(r.status, 200);
    assert.equal(j.busca.grupos.length, 1);
    assert.equal(j.busca.filtros.valorMax, 5000000);
    assert.ok(j.estado.historico.some(h => h.id === j.busca.id));
    r = await fetch(`${base}/api/busca/item/${j.busca.id}`, { headers: J });
    assert.equal((await r.json()).filtros.local, 'Jardins Itália', 'histórico guarda os filtros (Refazer com estes filtros)');
    r = await fetch(`${base}/api/busca`, { method: 'POST', headers: J, body: JSON.stringify({ filtros: { valorMin: 'caro demais' } }) });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /Não entendi o valor/);
    r = await fetch(`${base}/api/busca`, { method: 'POST', headers: J, body: JSON.stringify({ filtros: { negocio: 'VENDA' }, texto: '' }) });
    assert.equal(r.status, 400, 'sem nenhum filtro e sem texto');
    r = await fetch(`${base}/api/busca`, { method: 'POST', headers: J, body: JSON.stringify({ texto: F.pedidoClienteMarista }) });
    assert.equal(r.status, 200, 'só texto livre continua funcionando');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Caso real do João: "a cota grátis acabou" sem ele ter usado nada (429 da busca com Google)
test('Diagnóstico do Gemini: separa "chave gera texto" de "busca com Google sem cota" e mostra o motivo exato do Google', async () => {
  const g = require('../src/gemini-chave');
  const M = require('../src/gemini-modelo');
  M.esquecer('k-diag');
  const msg429 = 'You exceeded your current quota. * Quota exceeded for metric: generate_content_free_tier_grounding_requests, limit: 0';
  const fetcher = async (url, o = {}) => {
    if (/\/models\?pageSize/.test(url)) return { ok: true, status: 200, json: async () => ({ models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }] }) };
    const corpo = JSON.parse(o.body);
    if (corpo.tools) return { ok: false, status: 429, json: async () => ({ error: { message: msg429 } }) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) };
  };
  const d = await g.diagnosticar('k-diag', fetcher);
  assert.equal(d.modelo, 'gemini-3.8-flash');
  assert.equal(d.simples.ok, true);
  assert.equal(d.busca.ok, false);
  const t = g.textoDiagnostico(d);
  assert.match(t, /✅ Resposta simples/);
  assert.match(t, /❌ Busca com Google em gemini-2\.5-flash: erro 429 — You exceeded your current quota[\s\S]*limit: 0/);
  assert.match(t, /Busca com Google em gemini-2\.5-flash-lite: erro 429[\s\S]*Busca com Google em gemini-3\.8-flash: erro 429/, 'cada modelo da fila é testado e aparece');
  assert.deepEqual(d.buscas.map(b => b.modelo), ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.8-flash']);
  assert.match(t, /busca com Google\* está sem cota em todos os modelos testados[\s\S]*faturamento[\s\S]*Tavily ou do Serper/);
  // tudo certo
  const tudo = await g.diagnosticar('k-diag', async (u, o = {}) => (/\/models\?pageSize/.test(u) ? fetcher(u, o) : { ok: true, status: 200, json: async () => ({ candidates: [{ groundingMetadata: { groundingChunks: [{}, {}] } }] }) }));
  assert.match(g.textoDiagnostico(tudo), /busca com Google funciona em: gemini-2\.5-flash, gemini-2\.5-flash-lite, gemini-3\.8-flash/);
  // cota geral
  const geral = await g.diagnosticar('k-diag', async (u, o = {}) => (/\/models\?pageSize/.test(u) ? fetcher(u, o) : { ok: false, status: 429, json: async () => ({ error: { message: 'quota' } }) }));
  assert.match(g.textoDiagnostico(geral), /cota geral desta chave/);
});

test('Portais com 429: o relatório mostra a mensagem do Google e a busca recusada NÃO conta no limite do dia', async () => {
  const msg429 = 'Quota exceeded ... limit: 0';
  const { criterios } = bi.entenderPedido(F.pedidoClienteMarista);
  const antes = bi._uso.usoHoje();
  const r = await bi.buscarNosPortais(criterios, F.pedidoClienteMarista, {
    env: { GEMINI_API_KEY: 'k-429', GEMINI_BUSCA_MODEL: 'gemini-3.8-flash', BUSCA_LIMITE_DIA: '99' },
    fetcher: async () => ({ ok: false, status: 429, json: async () => ({ error: { message: msg429 } }) })
  });
  assert.equal(r.motivo, 'cota');
  assert.equal(bi._uso.usoHoje(), antes, 'busca recusada pelo Google não gasta uma das buscas do dia');
  const txt = bi.formatarRelatorio({ ...(await bi.buscar('apto 800 mil a 1 milhão setor marista', { env: {}, guardar: false })), portais: r }).join('\n');
  assert.match(txt, /sem cota" \(429\): Quota exceeded[\s\S]*limit: 0[\s\S]*testar gemini fundo/);
  assert.doesNotMatch(txt, /acabou por hoje/);
});


// ---------------------------------------------------------------------------
// Busca nos portais por camadas: links com o local, busca desacoplada (Tavily/Serper/Brave) + Gemini sem google_search,
// trava anti-invenção e Apify opcional
const Serp = require('../src/busca-serp');

const ZAP_AD = 'https://www.zapimoveis.com.br/imovel/venda-casa-4-quartos-jardins-italia-goiania-go-369m2-id-2700000001/';
const VIVA_AD = 'https://www.vivareal.com.br/imovel/casa-de-condominio-4-quartos-jardins-italia-bairros-goiania-com-garagem-355m2-venda-RS4520000-id-2587529552/';
const OLX_AD = 'https://go.olx.com.br/grande-goiania-e-anapolis/imoveis/casa-no-condominio-jardins-italia-1234567890';
const OLX_LISTA = 'https://www.olx.com.br/imoveis/venda/estado-go/grande-goiania-e-anapolis/goiania?q=casa+jardins+italia';

const pedidoJardins = filtros => bi.entenderFiltros(require('../src/busca-filtros').normalizarFiltros(filtros).filtros).criterios;

test('Links prontos: o local (condomínio/bairro) e as suítes entram na OLX, no ZAP e no VivaReal (caso Jardins Itália)', () => {
  const c = pedidoJardins({ tipo: 'casa', local: 'Jardins Itália', quartos: '3', suites: '3', valor: '3 a 7 milhões' });
  const l = bi.linksProntos(c);
  assert.equal(l['OLX'], 'https://www.olx.com.br/imoveis/venda/estado-go/grande-goiania-e-anapolis/goiania?q=casa+jardins+it%C3%A1lia&ps=3000000&pe=7000000&ros=3');
  assert.equal(l['ZAP Imóveis'], 'https://www.zapimoveis.com.br/venda/casas-de-condominio/go+goiania++jds-italia/?precoMinimo=3000000&precoMaximo=7000000&quartos=3&suites=3', 'ZAP: "Jardins" vira "jds" no endereço');
  assert.equal(l['VivaReal'], 'https://www.vivareal.com.br/venda/goias/goiania/bairros/jardins-italia/condominio_residencial/?precoMinimo=3000000&precoMaximo=7000000&quartos=3&suites=3');
  // bairro normal continua igual
  const m = bi.linksProntos(bi.entenderPedido(F.pedidoClienteMarista).criterios);
  assert.match(m['ZAP Imóveis'], /venda\/apartamentos\/go\+goiania\+\+setor-marista\/\?precoMinimo=800000&precoMaximo=1000000&areaMinima=100$/);
  // bairro digitado + condomínio: o portal usa o bairro; a OLX usa o nome do condomínio
  const b = bi.linksProntos(pedidoJardins({ tipo: 'casa', bairro: 'Setor Bueno', local: 'Alphaville Flamboyant' }));
  assert.match(b['ZAP Imóveis'], /go\+goiania\+\+setor-bueno\//);
  assert.match(b['OLX'], /q=casa\+alphaville\+flamboyant/);
});

test('Busca desacoplada: só entram páginas de UM anúncio (nada de lista/categoria/busca)', () => {
  assert.ok(Serp.ehPaginaDeAnuncio(ZAP_AD));
  assert.ok(Serp.ehPaginaDeAnuncio(VIVA_AD));
  assert.ok(Serp.ehPaginaDeAnuncio(OLX_AD));
  assert.ok(!Serp.ehPaginaDeAnuncio(OLX_LISTA), 'lista da OLX com ?q=');
  assert.ok(!Serp.ehPaginaDeAnuncio('https://www.zapimoveis.com.br/venda/casas-de-condominio/go+goiania++jds-italia/'), 'categoria do ZAP');
  assert.ok(!Serp.ehPaginaDeAnuncio('https://www.vivareal.com.br/venda/goias/goiania/bairros/jardins-italia/casa_residencial/'));
  assert.ok(!Serp.ehPaginaDeAnuncio('https://www.exemplo.com/imovel/algo-id-12345678/'), 'outro site');
  const t = Serp.termosDoPedido(pedidoJardins({ tipo: 'casa', local: 'Jardins Itália' }));
  assert.equal(Serp.consultaSite('zapimoveis.com.br', t), 'site:zapimoveis.com.br/imovel "Goiânia" "Jardins Itália" "Casa" venda');
  assert.equal(Serp.consultaSite('olx.com.br', t), 'site:go.olx.com.br "Goiânia" "Jardins Itália" "Casa" venda');
  assert.equal(Serp.consultaSimples(t), 'Casa à venda Jardins Itália Goiânia GO');
});

/** Fetcher falso de Tavily/Serper/Brave + Gemini (sem rede). `corpos` guarda o que foi enviado a cada serviço. */
function mundoFalso({ gemini = 'ok', provedor = 'tavily', erroProvedor = 0 } = {}) {
  const corpos = { tavily: [], serper: [], brave: [], gemini: [], apify: [] };
  const porPortal = d => (d === 'zapimoveis.com.br' ? [{ url: ZAP_AD, titulo: 'Casa 369 m² Jardins Itália', conteudo: 'Casa de condomínio 4 suítes 369 m² R$ 5.490.000' }] : d === 'vivareal.com.br' ? [{ url: VIVA_AD, titulo: 'Casa de Condomínio Jardins Itália', conteudo: 'R$ 4.520.000 4 quartos 4 suítes 355 m² Imobiliária Lopes CRECI' }] : [{ url: OLX_AD, titulo: 'Casa no condomínio Jardins Itália', conteudo: 'R$ 4.500.000 direto com o proprietário 4 suítes 400 m²' }, { url: OLX_LISTA, titulo: 'Lista', conteudo: '' }]);
  const fetcher = async (url, o = {}) => {
    const u = String(url);
    const corpo = o.body ? JSON.parse(o.body) : null;
    if (/api\.tavily\.com/.test(u)) {
      corpos.tavily.push({ corpo, auth: o.headers.Authorization });
      if (provedor === 'tavily' && erroProvedor) return { ok: false, status: erroProvedor, json: async () => ({ detail: { error: 'Unauthorized: missing or invalid API key.' } }) };
      return { ok: true, status: 200, json: async () => ({ results: porPortal(corpo.include_domains[0]).map(x => ({ url: x.url, title: x.titulo, content: x.conteudo })) }) };
    }
    if (/google\.serper\.dev/.test(u)) {
      corpos.serper.push({ corpo, chave: o.headers['X-API-KEY'] });
      const d = /zapimoveis/.test(corpo.q) ? 'zapimoveis.com.br' : /vivareal/.test(corpo.q) ? 'vivareal.com.br' : 'olx.com.br';
      return { ok: true, status: 200, json: async () => ({ organic: porPortal(d).map(x => ({ link: x.url, title: x.titulo, snippet: x.conteudo })) }) };
    }
    if (/api\.search\.brave\.com/.test(u)) {
      corpos.brave.push({ url: u, token: o.headers['X-Subscription-Token'] });
      const d = /zapimoveis/.test(u) ? 'zapimoveis.com.br' : /vivareal/.test(u) ? 'vivareal.com.br' : 'olx.com.br';
      return { ok: true, status: 200, json: async () => ({ web: { results: porPortal(d).map(x => ({ url: x.url, title: x.titulo, description: x.conteudo })) } }) };
    }
    if (/\/models\?pageSize/.test(u)) return { ok: true, status: 200, json: async () => ({ models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }] }) };
    if (/generateContent/.test(u)) {
      corpos.gemini.push(corpo);
      if (gemini === '429') return { ok: false, status: 429, json: async () => ({ error: { message: 'quota' } }) };
      const ids = corpo.contents[0].parts[0].text;
      // catálogo na ordem dos portais ligados: 1 = OLX, 2 = ZAP, 3 = VivaReal
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify([
        { id: 1, preco: 4500000, area_m2: 400, quartos: 4, suites: 4, bairro: 'Jardins Itália', anunciante: 'Particular', tipo_anunciante: 'PARTICULAR', resumo: 'direto com o dono' },
        { id: 2, preco: 5490000, area_m2: 369, quartos: 4, suites: 4, anunciante: '', tipo_anunciante: 'DESCONHECIDO', resumo: 'acima do teto' },
        { id: 3, preco: 4520000, area_m2: 355, quartos: 4, suites: 4, anunciante: 'Lopes', tipo_anunciante: 'IMOBILIARIA', resumo: 'imobiliária' },
        { id: 99, preco: 4000000, area_m2: 300, quartos: 4, suites: 4, tipo_anunciante: 'PARTICULAR', resumo: 'id que não existe no catálogo' },
        { id: 1000, link: 'https://www.zapimoveis.com.br/imovel/inventado-pela-ia-id-999999999/', preco: 4100000, tipo_anunciante: 'PARTICULAR', resumo: 'link inventado' }
      ]) + (ids ? '' : '') }] } }] }) };
    }
    if (/api\.apify\.com/.test(u)) {
      corpos.apify.push({ url: u, corpo, auth: o.headers.Authorization });
      const portal = corpo.portal;
      return { ok: true, status: 200, json: async () => [portal === 'ZAP' ? { url: ZAP_AD, title: 'Casa 4 suítes', priceBRL: 4900000, usableArea: 369, bedrooms: 4, suites: 4, parkingSpaces: 6, neighborhood: 'Jardins Itália', agencyName: 'Lopes', publisherType: 'AGENCY' } : { url: VIVA_AD, title: 'Casa condomínio', priceBRL: 4520000, usableArea: 355, bedrooms: 4, suites: 4, neighborhood: 'Jardins Itália', publisherType: 'OWNER' }] };
    }
    throw new Error(`url inesperada no teste: ${u}`);
  };
  return { fetcher, corpos };
}

test('Cascata: Tavily + Gemini SEM google_search; o link só vale se veio da busca real (trava anti-invenção)', async () => {
  const { fetcher, corpos } = mundoFalso();
  const c = pedidoJardins({ tipo: 'casa', local: 'Jardins Itália', suites: '4', valor: '4 a 5 milhões' });
  const antes = bi._uso.usoHoje();
  const r = await bi.buscarNosPortais(c, c.resumo, { env: { TAVILY_API_KEY: 'tvly-teste-123456', GEMINI_API_KEY: 'k-cascata', BUSCA_LIMITE_DIA: '99' }, fetcher });
  assert.equal(r.ok, true);
  assert.deepEqual(r.via, ['Tavily + Gemini']);
  // 3 consultas (uma por portal), com a chave no cabeçalho
  assert.equal(corpos.tavily.length, 3);
  assert.ok(corpos.tavily.every(x => x.auth === 'Bearer tvly-teste-123456'));
  assert.deepEqual(corpos.tavily.map(x => x.corpo.include_domains[0]).sort(), ['olx.com.br', 'vivareal.com.br', 'zapimoveis.com.br']);
  // o Gemini foi chamado UMA vez e sem a ferramenta google_search
  assert.equal(corpos.gemini.length, 1);
  assert.equal(corpos.gemini[0].tools, undefined, 'curadoria sem google_search');
  assert.match(corpos.gemini[0].contents[0].parts[0].text, /\[1\] OLX \| Casa no condomínio Jardins Itália/);
  assert.doesNotMatch(corpos.gemini[0].contents[0].parts[0].text, /Lista \|/, 'página de lista da OLX nem chega ao Gemini');
  // resultado: só os 2 que servem e vieram do catálogo
  assert.deepEqual(r.itens.map(i => [i.portal, i.tipoAnunciante, i.link]), [['OLX', 'particular', OLX_AD], ['VivaReal', 'profissional', VIVA_AD]], 'ZAP (5,49 mi) fora do teto; id 99 e link inventado descartados');
  assert.ok(!r.itens.some(i => /inventado|999999999/.test(i.link)));
  assert.equal(bi._uso.usoHoje(), antes + 1);
});

test('Cascata: Serper (consulta site:) e Brave; se o 1º provedor recusa a chave, usa o próximo', async () => {
  let w = mundoFalso();
  const c = pedidoJardins({ tipo: 'casa', local: 'Jardins Itália', suites: '4', valor: '4 a 5 milhões' });
  let r = await bi.buscarNosPortais(c, c.resumo, { env: { SERPER_API_KEY: 'serper-chave-1234567', GEMINI_API_KEY: 'k-cascata', BUSCA_LIMITE_DIA: '99' }, fetcher: w.fetcher });
  assert.deepEqual(r.via, ['Serper + Gemini']);
  assert.ok(w.corpos.serper.every(x => x.chave === 'serper-chave-1234567' && x.corpo.gl === 'br' && x.corpo.hl === 'pt-br' && /^site:(go\.olx\.com\.br|zapimoveis\.com\.br\/imovel|vivareal\.com\.br\/imovel) "Goiânia" "Jardins Itália" "Casa" venda$/.test(x.corpo.q)));
  w = mundoFalso();
  r = await bi.buscarNosPortais(c, c.resumo, { env: { BRAVE_API_KEY: 'brave-chave-1234567', GEMINI_API_KEY: 'k-cascata', BUSCA_LIMITE_DIA: '99' }, fetcher: w.fetcher });
  assert.deepEqual(r.via, ['Brave + Gemini']);
  assert.ok(w.corpos.brave.every(x => x.token === 'brave-chave-1234567' && /country=BR/.test(x.url)));
  // Tavily com chave recusada (401) -> cai para o Serper
  w = mundoFalso({ erroProvedor: 401 });
  r = await bi.buscarNosPortais(c, c.resumo, { env: { TAVILY_API_KEY: 'tvly-ruim-1234567', SERPER_API_KEY: 'serper-chave-1234567', GEMINI_API_KEY: 'k-cascata', BUSCA_LIMITE_DIA: '99' }, fetcher: w.fetcher });
  assert.equal(r.ok, true);
  assert.deepEqual(r.via, ['Serper + Gemini']);
  // só o provedor ruim: o motivo é claro
  w = mundoFalso({ erroProvedor: 401 });
  r = await bi.buscarNosPortais(c, c.resumo, { env: { TAVILY_API_KEY: 'tvly-ruim-1234567', BUSCA_LIMITE_DIA: '99' }, fetcher: w.fetcher });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'chave_busca_recusada');
  assert.match(r.explicacao, /Tavily recusou a chave/);
});

test('Cascata: Gemini sem cota na curadoria ou sem chave -> mostra os anúncios achados sem filtrar (nunca fica mudo)', async () => {
  const c = pedidoJardins({ tipo: 'casa', local: 'Jardins Itália', suites: '4', valor: '4 a 5 milhões' });
  let w = mundoFalso({ gemini: '429' });
  let r = await bi.buscarNosPortais(c, c.resumo, { env: { TAVILY_API_KEY: 'tvly-teste-123456', GEMINI_API_KEY: 'k-cascata-429', BUSCA_LIMITE_DIA: '99' }, fetcher: w.fetcher });
  assert.equal(r.ok, true);
  assert.equal(r.semCuradoria, true);
  assert.deepEqual(r.itens, []);
  assert.deepEqual(r.fontesSoltas.map(f => f.url).sort(), [OLX_AD, VIVA_AD, ZAP_AD].sort());
  w = mundoFalso();
  r = await bi.buscarNosPortais(c, c.resumo, { env: { TAVILY_API_KEY: 'tvly-teste-123456', BUSCA_LIMITE_DIA: '99' }, fetcher: w.fetcher });
  assert.equal(r.semCuradoria, true, 'sem chave do Gemini');
  assert.equal(w.corpos.gemini.length, 0);
  const txt = bi.formatarRelatorio({ ...(await bi.buscar('apto 800 mil a 1 milhão setor marista', { env: {}, guardar: false })), portais: r }).join('\n');
  assert.match(txt, /Não consegui filtrar \(sem chave\/resposta do Gemini\)/);
  assert.match(txt, /vivareal\.com\.br\/imovel\//);
});

test('Cascata: o Google Search do Gemini só é usado se nenhuma camada anterior respondeu', async () => {
  const c = pedidoJardins({ tipo: 'casa', local: 'Jardins Itália', suites: '4', valor: '4 a 5 milhões' });
  // Tavily falha (503) + Gemini com chave -> cai para o grounding (que aqui responde)
  const w = mundoFalso({ erroProvedor: 503 });
  const original = w.fetcher;
  const r = await bi.buscarNosPortais(c, c.resumo, {
    env: { TAVILY_API_KEY: 'tvly-teste-123456', GEMINI_API_KEY: 'k-cascata-gr', BUSCA_LIMITE_DIA: '99' },
    fetcher: async (u, o = {}) => (/generateContent/.test(String(u)) && o.body && JSON.parse(o.body).tools ? { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }) } : original(u, o))
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.via, ['Gemini + Google']);
});

test('Apify (opcional): ZAP e VivaReal estruturados, filtros enviados, token no cabeçalho, sem gastar IA', async () => {
  const w = mundoFalso();
  const c = pedidoJardins({ tipo: 'casa', bairro: 'Jardins Itália', quartos: '3', suites: '4', valor: '4 a 5 milhões', areaMin: '300' });
  const r = await bi.buscarNosPortais(c, c.resumo, { env: { APIFY_API_TOKEN: 'apify_api_teste123', BUSCA_LIMITE_DIA: '99' }, fetcher: w.fetcher });
  assert.equal(r.ok, true);
  assert.deepEqual(r.via, ['Apify']);
  assert.equal(w.corpos.apify.length, 2);
  assert.ok(w.corpos.apify.every(x => x.auth === 'Bearer apify_api_teste123' && !/token=/.test(x.url) && /haketa~zapimoveis-scraper/.test(x.url)));
  const zap = w.corpos.apify.find(x => x.corpo.portal === 'ZAP').corpo;
  assert.deepEqual(zap, { portal: 'ZAP', business: ['SALE'], states: ['GO'], cities: ['goiania'], neighborhoods: ['jardins-italia'], minPrice: 4000000, minBedrooms: 3, minArea: 300, maxListings: 15, maxPrice: 5000000 });
  assert.ok(w.corpos.apify.some(x => x.corpo.portal === 'VIVA_REAL'));
  assert.equal(w.corpos.gemini.length, 0, 'sem Gemini');
  assert.deepEqual(r.itens.map(i => [i.portal, i.tipoAnunciante, i.certeza]), [['ZAP Imóveis', 'profissional', 'anúncio'], ['VivaReal', 'particular', 'anúncio']]);
  // Apify cobre ZAP e VivaReal: a OLX vem do Tavily (e só ela é consultada)
  const w2 = mundoFalso();
  const r2 = await bi.buscarNosPortais(c, c.resumo, { env: { APIFY_API_TOKEN: 'apify_api_teste123', TAVILY_API_KEY: 'tvly-teste-123456', GEMINI_API_KEY: 'k-cascata', BUSCA_LIMITE_DIA: '99' }, fetcher: w2.fetcher });
  assert.deepEqual(r2.via, ['Apify', 'Tavily + Gemini']);
  assert.deepEqual(w2.corpos.tavily.map(x => x.corpo.include_domains[0]), ['olx.com.br']);
  // Apify com token recusado: não derruba a busca
  const r3 = await bi.buscarNosPortais(c, c.resumo, { env: { APIFY_API_TOKEN: 'apify_ruim_123456', BUSCA_LIMITE_DIA: '99' }, fetcher: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'User was not found or authentication token is not valid' } }) }) });
  assert.equal(r3.ok, false);
  assert.equal(r3.motivo, 'chave_apify_recusada');
});


test('Diagnóstico: mostra os motores da busca nos portais, testa o principal e diz qual está ativo', async () => {
  const g = require('../src/gemini-chave');
  const antes = { gem: process.env.GEMINI_API_KEY, tav: process.env.TAVILY_API_KEY, sp: process.env.SERPER_API_KEY, ap: process.env.APIFY_API_TOKEN };
  const fetcher = async (u, o = {}) => {
    if (/api\.tavily\.com/.test(String(u))) return { ok: true, status: 200, json: async () => ({ results: [{ url: ZAP_AD, title: 'x', content: 'y' }] }) };
    if (/\/models\?pageSize/.test(String(u))) return { ok: true, status: 200, json: async () => ({ models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }] }) };
    return o.body && JSON.parse(o.body).tools ? { ok: false, status: 429, json: async () => ({ error: { message: 'limit: 0' } }) } : { ok: true, status: 200, json: async () => ({ candidates: [] }) };
  };
  try {
    process.env.GEMINI_API_KEY = 'AIzaChaveDeTesteChaveDeTeste123';
    process.env.TAVILY_API_KEY = 'tvly-teste-123456789';
    delete process.env.SERPER_API_KEY;
    delete process.env.APIFY_API_TOKEN;
    let r = await g.diagnosticarSalva(fetcher);
    assert.match(r.texto, /Tavily: ✅ configurado — respondeu \(1 resultado\(s\)\)/);
    assert.match(r.texto, /Serper: ❌ sem chave/);
    assert.match(r.texto, /Apify \(ZAP\/VivaReal\): ❌ sem chave/);
    assert.match(r.texto, /Gemini \+ Google: ✅ chave salva \(usado só se os acima falharem\)/);
    assert.match(r.texto, /Motor principal agora: Tavily \+ Gemini \(curadoria sem Google\)/);
    // sem chave do Gemini: só a curadoria precisa dela
    delete process.env.GEMINI_API_KEY;
    r = await g.diagnosticarSalva(fetcher);
    assert.match(r.texto, /Sem chave do Gemini salva: ela só é necessária para a curadoria/);
    assert.match(r.texto, /Motor principal agora: Tavily \+ Gemini/);
    // nada configurado
    delete process.env.TAVILY_API_KEY;
    r = await g.diagnosticarSalva(fetcher);
    assert.match(r.texto, /Nenhuma chave do Gemini salva ainda/);
  } finally {
    for (const [k, v] of [['GEMINI_API_KEY', antes.gem], ['TAVILY_API_KEY', antes.tav], ['SERPER_API_KEY', antes.sp], ['APIFY_API_TOKEN', antes.ap]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('Chaves dos motores de busca: limpa o que foi colado, confere no serviço e explica o erro', async () => {
  const B = require('../src/busca-chaves');
  const k = 'tvly-dev-AbC123xyz456_7890';
  assert.equal(B.limparChave(` "${k}"\n`), k);
  assert.equal(B.limparChave(`TAVILY_API_KEY=${k}`), k);
  assert.equal(B.limparChave('SERPER_API_KEY = abc123def456ghi789jkl'), 'abc123def456ghi789jkl', 'prefixo com espaços em volta do = também sai');
  const ok = async () => ({ ok: true, status: 200, json: async () => ({ results: [], organic: [], web: { results: [] } }) });
  let usada;
  const v = await B.validar('tavily', ` ${k} `, async (u, o) => ((usada = o.headers.Authorization), ok()));
  assert.deepEqual([v.ok, v.chave, v.mensagem], [true, k, 'Chave do Tavily funcionando ✅']);
  assert.equal(usada, `Bearer ${k}`, 'chave no cabeçalho, nunca na URL');
  const recusada = await B.validar('serper', 'abcdef1234567890abcdef', async () => ({ ok: false, status: 403, json: async () => ({ message: 'Unauthorized' }) }));
  assert.equal(recusada.ok, false);
  assert.match(recusada.mensagem, /Serper recusou a chave[\s\S]*serper\.dev/);
  const semRede = await B.validar('tavily', k, async () => {
    throw new Error('ENOTFOUND');
  });
  assert.equal(semRede.ok, true, 'sem internet: salva mesmo assim, avisando');
  assert.match(semRede.mensagem, /não consegui falar com o Tavily/);
  assert.equal((await B.validar('tavily', 'curta')).ok, false);
  assert.match((await B.validar('serper', 'chave com ç e ; rm -rf')).mensagem, /não parece uma chave do Serper/);
  // Apify: o token é conferido num endereço que não gasta nada
  let url;
  const ap = await B.validar('apify', 'apify_api_AbCdEf1234567890', async u => ((url = String(u)), { ok: true, status: 200, json: async () => ({}) }));
  assert.equal(ap.ok, true);
  assert.match(url, /api\.apify\.com\/v2\/users\/me$/);
  assert.match((await B.validar('apify', 'apify_api_AbCdEf1234567890', async () => ({ ok: false, status: 401 }))).mensagem, /Apify recusou o token/);
});

test('Ajustes (API): chave de busca com formato estranho é recusada antes de salvar; sem Gemini a lista de motores aparece em config busca', async () => {
  const { app } = require('../index');
  const server = await new Promise(r => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { 'x-secretaria': '1' };
  try {
    let r = await fetch(`${base}/api/login`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ senha: process.env.PAINEL_SENHA }) });
    const J = { ...H, cookie: r.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json' };
    r = await fetch(`${base}/api/config`, { method: 'POST', headers: J, body: JSON.stringify({ tavilyApiKey: 'chave com ç ; rm -rf', resumoDiarioHorario: '08:00' }) });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /não parece uma chave do Tavily/);
    assert.notEqual(require('../src/settings').loadSettings().resumoDiarioHorario, '08:00', 'nada é salvo se a chave for recusada');
    r = await fetch(`${base}/api/config`, { headers: J });
    const cfg = (await fetch(`${base}/api/status`, { headers: J }).then(x => x.json())).config;
    assert.equal(typeof cfg.hasTavilyKey, 'boolean');
    assert.equal(typeof cfg.hasSerperKey, 'boolean');
    assert.equal(typeof cfg.hasApifyToken, 'boolean');
  } finally {
    server.close();
  }
});


// ---------------------------------------------------------------------------
// Caso real do João (diagnóstico de 03/11): 2.5 "indisponível para usuários novos", gemini-3.8-flash com 503 "alta demanda"
test('Curadoria resiliente: 404 lembra, 503 tenta de novo e depois passa ao próximo modelo (lite primeiro)', async () => {
  const M = require('../src/gemini-modelo');
  const { curar } = require('../src/busca-curadoria');
  const catalogo = [{ id: 1, portal: 'OLX', dominio: 'olx.com.br', url: OLX_AD, titulo: 'Casa', conteudo: 'R$ 4.500.000' }];
  const modelos = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash'].map(n => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] }));
  const montar = comportamento => {
    const chamadas = [];
    const fetcher = async (url, o = {}) => {
      if (/\/models\?pageSize/.test(String(url))) return { ok: true, status: 200, json: async () => ({ models: modelos }) };
      const m = decodeURIComponent(String(url).match(/models\/([^:]+):generateContent/)[1]);
      chamadas.push(m);
      const r = comportamento(m, chamadas.filter(x => x === m).length);
      return r === 'ok' ? { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '[{"id":1,"preco":4500000,"tipo_anunciante":"PARTICULAR"}]' }] } }] }) } : { ok: false, status: r, json: async () => ({ error: { message: r === 404 ? `This model models/${m} is no longer available to new users.` : 'This model is currently experiencing high demand.' } }) };
    };
    return { fetcher, chamadas };
  };
  const env = { GEMINI_RETRY_MS: '0' };

  // 1) o caso do João: 2.5 aposentados (404), 3.8 sobrecarregado (503), 3.5-lite responde
  M.esquecer('k-res');
  let w = montar((m) => (/^gemini-2\.5/.test(m) ? 404 : m === 'gemini-3.8-flash' ? 503 : 'ok'));
  let r = await curar({ chave: 'k-res', descricao: 'x', catalogo, env, fetcher: w.fetcher });
  assert.equal(r.ok, true);
  assert.equal(r.modelo, 'gemini-3.5-flash-lite', 'os "lite" vão primeiro nesta tarefa simples');
  assert.deepEqual(w.chamadas, ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.5-flash-lite']);
  // 2) na 2ª busca os 2.5 já são lembrados como indisponíveis: nem são chamados
  w = montar(m => (/^gemini-2\.5/.test(m) ? 404 : m === 'gemini-3.8-flash' ? 503 : 'ok'));
  r = await curar({ chave: 'k-res', descricao: 'x', catalogo, env, fetcher: w.fetcher });
  assert.deepEqual(w.chamadas, ['gemini-3.5-flash-lite']);
  assert.ok(M.ehIndisponivel('k-res', 'gemini-2.5-flash') && M.ehIndisponivel('k-res', 'gemini-2.5-flash-lite'));

  // 3) 503 passageiro: o mesmo modelo é tentado de novo e funciona na 3ª vez
  M.esquecer('k-res');
  w = montar((m, vez) => (m === 'gemini-3.5-flash-lite' && vez < 3 ? 503 : /^gemini-2\.5/.test(m) ? 404 : 'ok'));
  r = await curar({ chave: 'k-res', descricao: 'x', catalogo, env, fetcher: w.fetcher });
  assert.equal(r.ok, true);
  assert.equal(w.chamadas.filter(m => m === 'gemini-3.5-flash-lite').length, 3);

  // 4) tudo sobrecarregado: motivo "sobrecarga" (não "erro" genérico)
  M.esquecer('k-res');
  w = montar(() => 503);
  r = await curar({ chave: 'k-res', descricao: 'x', catalogo, env, fetcher: w.fetcher });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'sobrecarga');
  assert.ok(r.tentativas.length >= 6, 'cada modelo foi tentado mais de uma vez');
  M.esquecer('k-res');
});

test('Busca com o Gemini sobrecarregado: o relatório explica e mostra os anúncios achados (e sem espera nos testes)', async () => {
  const w = mundoFalso({ gemini: '429' });
  const original = w.fetcher;
  const fetcher = async (u, o = {}) => (/generateContent/.test(String(u)) ? { ok: false, status: 503, json: async () => ({ error: { message: 'This model is currently experiencing high demand.' } }) } : original(u, o));
  const c = pedidoJardins({ tipo: 'casa', local: 'Jardins Itália', suites: '4', valor: '4 a 5 milhões' });
  const r = await bi.buscarNosPortais(c, c.resumo, { env: { SERPER_API_KEY: 'serper-chave-1234567', GEMINI_API_KEY: 'k-res-503', GEMINI_RETRY_MS: '0', BUSCA_LIMITE_DIA: '99' }, fetcher });
  assert.equal(r.ok, true);
  assert.equal(r.semCuradoria, true);
  assert.match(r.curadoriaErro, /o Gemini está sobrecarregado agora \(tentei /);
  const txt = bi.formatarRelatorio({ ...(await bi.buscar('apto 800 mil a 1 milhão setor marista', { env: {}, guardar: false })), portais: r }).join('\n');
  assert.match(txt, /Não consegui filtrar: o Gemini está sobrecarregado agora[\s\S]*tente de novo em alguns minutos/);
  assert.match(txt, /vivareal\.com\.br\/imovel\//);
});

test('Diagnóstico: a resposta simples passa por outros modelos quando o principal dá 503, e o 503 é explicado como passageiro', async () => {
  const g = require('../src/gemini-chave');
  const M = require('../src/gemini-modelo');
  const modelos = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'].map(n => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] }));
  const fabrica = ok => async (u, o = {}) => {
    if (/\/models\?pageSize/.test(String(u))) return { ok: true, status: 200, json: async () => ({ models: modelos }) };
    const m = decodeURIComponent(String(u).match(/models\/([^:]+):generateContent/)[1]);
    if (JSON.parse(o.body).tools) return { ok: false, status: 429, json: async () => ({ error: { message: 'limit: 0' } }) };
    return ok(m) ? { ok: true, status: 200, json: async () => ({ candidates: [] }) } : { ok: false, status: 503, json: async () => ({ error: { message: 'This model is currently experiencing high demand.' } }) };
  };
  M.esquecer('k-diag-503');
  let d = await g.diagnosticar('k-diag-503', fabrica(m => m === 'gemini-3.5-flash-lite'));
  assert.equal(d.simples.ok, true);
  assert.equal(d.simples.modelo, 'gemini-3.5-flash-lite');
  let t = g.textoDiagnostico(d);
  assert.match(t, /↳ gemini-3\.8-flash: erro 503 — This model is currently experiencing high demand/);
  assert.match(t, /✅ Resposta simples \(sem busca\): funcionou \(gemini-3\.5-flash-lite\)/);
  M.esquecer('k-diag-503');
  d = await g.diagnosticar('k-diag-503', fabrica(() => false));
  t = g.textoDiagnostico(d);
  assert.match(t, /Gemini está sobrecarregado agora \(erro 503 "alta demanda"\): é passageiro/);
  M.esquecer('k-diag-503');
});

test('Busca desacoplada: se a consulta precisa vem vazia, tenta a solta e informa o que o buscador devolveu', async () => {
  const consultas = [];
  const fetcher = async (url, opts) => {
    const corpo = JSON.parse(opts.body);
    consultas.push(corpo.q);
    const solta = !/"/.test(corpo.q);
    const organic = solta ? [{ link: ZAP_AD, title: 'Casa Marista', snippet: 'Casa 3 quartos' }, { link: 'https://www.zapimoveis.com.br/venda/casas/go+goiania/', title: 'lista', snippet: '' }] : [];
    return { ok: true, status: 200, json: async () => ({ organic }) };
  };
  const r = await Serp.buscarAnuncios({ criterios: pedidoJardins({ tipo: 'casa', local: 'Setor Marista' }), dominios: ['zapimoveis.com.br'], env: { SERPER_API_KEY: 'x'.repeat(20) }, fetcher });
  assert.ok(r.ok);
  assert.equal(r.catalogo.length, 1);
  assert.equal(consultas.length, 2);
  assert.deepEqual(r.diag['zapimoveis.com.br'], { brutos: 2, anuncios: 1, descartadas: ['/venda/casas/go+goiania/'] });
});

test('Busca desacoplada (caso real Setor Marista, casa R$ 1–1,5 mi): OLX usa go.olx.com.br e a solta roda só no portal que ficou sem anúncio', async () => {
  // URLs reais: ZAP/VivaReal /imovel/…-id-N; OLX go.olx.com.br/<região>/imoveis/<slug>-N (região antes de /imoveis)
  const ZAP_M = 'https://www.zapimoveis.com.br/imovel/venda-casa-3-quartos-setor-marista-goiania-go-250m2-id-2800000001/';
  const OLX_M = 'https://go.olx.com.br/grande-goiania-e-anapolis/imoveis/casa-3-quartos-setor-marista-1403217895';
  const consultas = [];
  const fetcher = async (url, opts) => {
    const q = JSON.parse(opts.body).q;
    consultas.push(q);
    const solta = !/"/.test(q);
    let organic = [];
    if (/zapimoveis/.test(q)) organic = [{ link: ZAP_M, title: 'Casa', snippet: 'R$ 1.200.000' }];
    else if (/olx/.test(q)) organic = solta ? [{ link: OLX_M, title: 'Casa Marista', snippet: 'R$ 1.300.000' }] : [{ link: 'https://www.olx.com.br/imoveis/venda/casas/estado-go', title: 'lista', snippet: '' }];
    return { ok: true, status: 200, json: async () => ({ organic }) };
  };
  const r = await Serp.buscarAnuncios({ criterios: pedidoJardins({ tipo: 'casa', local: 'Setor Marista' }), dominios: ['zapimoveis.com.br', 'olx.com.br'], env: { SERPER_API_KEY: 'x'.repeat(20) }, fetcher });
  assert.equal(r.catalogo.length, 2, 'ZAP da precisa + OLX da solta');
  assert.ok(consultas.some(q => q.startsWith('site:go.olx.com.br ')), 'OLX precisa sem /imoveis');
  assert.equal(consultas.filter(q => /zapimoveis/.test(q)).length, 1, 'ZAP já tinha anúncio: não repete a solta');
  assert.deepEqual(r.diag['olx.com.br'].anuncios, 1);
});
