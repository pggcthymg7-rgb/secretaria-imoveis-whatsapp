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
  assert.match(txt, /falta a chave do Gemini/);
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
  const k = 'AIzaSyD-abc_123XYZabc123XYZabc123XYZab1';
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
