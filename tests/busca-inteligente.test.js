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
