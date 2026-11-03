/**
 * CAMADA 3 (OPCIONAL): ZAP e VivaReal estruturados via Apify
 * Só roda se APIFY_API_TOKEN estiver configurado. Consulta o Actor de coleta pronto e recebe os
 * anúncios já em campos (preço, área, quartos…), filtrados pelo próprio portal — sem gastar IA.
 * ATENÇÃO: leitura automática de portais vai contra os termos de uso deles; só use se aceitar o risco.
 * Guardamos só dados públicos do anúncio (nunca telefone nem nome de dono particular).
 * O formato de entrada/saída do Actor foi passado pelo João e NÃO foi verificado aqui: os campos de
 * saída são lidos com apelidos e qualquer falha volta com a mensagem do Apify.
 */
const { slug } = require('./busca-links');
const { localDoPedido } = require('./busca-links');

const ACTOR_PADRAO = 'haketa~zapimoveis-scraper';
const PORTAL_DO_DOMINIO = { 'zapimoveis.com.br': 'ZAP', 'vivareal.com.br': 'VIVA_REAL' };
const DOMINIO_DO_PORTAL = { ZAP: 'zapimoveis.com.br', VIVA_REAL: 'vivareal.com.br' };

const token = env => String((env && env.APIFY_API_TOKEN) || '').replace(/\s+/g, '').trim();
const apifyConfigurado = env => Boolean(token(env));

function corpoDaConsulta(c, portal) {
  const loc = localDoPedido(c);
  const cidade = c.local.cidades.find(x => x !== 'Goiânia') || 'Goiânia';
  const corpo = { portal, business: [c.transacao === 'ALUGUEL' ? 'RENTAL' : 'SALE'], states: ['GO'], cities: [slug(cidade)], maxListings: 15 };
  if (loc) corpo.neighborhoods = [slug(loc.nome)];
  if (c.valor_min) corpo.minPrice = c.valor_min;
  if (c.valor_max) corpo.maxPrice = c.valor_max;
  if (c.quartos_min) corpo.minBedrooms = c.quartos_min;
  if (c.area_min) corpo.minArea = Math.round(c.area_min);
  return corpo;
}

const pega = (o, ...nomes) => {
  for (const n of nomes) if (o && o[n] !== undefined && o[n] !== null && o[n] !== '') return o[n];
  return undefined;
};

/** Um registro do Actor -> item bruto do relatório (a trava e o filtro de preço rodam depois) */
function normalizar(reg, portal) {
  const link = String(pega(reg, 'url', 'link', 'listingUrl') || '');
  const editor = String(pega(reg, 'publisherType', 'advertiserType', 'publisher') || '');
  const imobiliaria = pega(reg, 'agencyName', 'advertiserName', 'publisherName');
  const particular = /owner|proprietar|particular|private|individual/i.test(editor);
  const profissional = /agenc|imobili|profession|broker|real.?estate|company|corretor/i.test(editor);
  return {
    titulo: String(pega(reg, 'title', 'name') || '').slice(0, 140),
    link,
    portalDominio: DOMINIO_DO_PORTAL[portal],
    preco: pega(reg, 'priceBRL', 'price', 'salePrice', 'rentPrice') || 0,
    area_m2: pega(reg, 'usableArea', 'area', 'totalArea') || 0,
    quartos: pega(reg, 'bedrooms', 'bedroomsCount') || 0,
    suites: pega(reg, 'suites', 'suitesCount') || 0,
    bairro: String(pega(reg, 'neighborhood', 'bairro') || (reg.address && reg.address.neighborhood) || '').slice(0, 60),
    anunciante: particular ? 'Particular' : String(imobiliaria || '').slice(0, 80),
    tipo_anunciante: particular ? 'particular' : profissional || imobiliaria ? 'profissional' : 'desconhecido',
    resumo: `${pega(reg, 'bedrooms', 'bedroomsCount') || '?'} quartos${pega(reg, 'suites', 'suitesCount') ? `, ${pega(reg, 'suites', 'suitesCount')} suítes` : ''}${pega(reg, 'parkingSpaces', 'parking') ? `, ${pega(reg, 'parkingSpaces', 'parking')} vagas` : ''}`
  };
}

/**
 * Consulta o ZAP e/ou VivaReal (conforme os portais ligados). { ok, itens, cobertos:[domínios], erros:[] }
 */
async function buscarApify({ criterios, dominios, env = process.env, fetcher = fetch }) {
  const t = token(env);
  if (!t) return { ok: false, motivo: 'sem_chave_apify' };
  const ator = String(env.APIFY_ACTOR || ACTOR_PADRAO).replace(/\//, '~');
  const portais = dominios.filter(d => PORTAL_DO_DOMINIO[d]).map(d => PORTAL_DO_DOMINIO[d]);
  if (!portais.length) return { ok: true, itens: [], cobertos: [], erros: [] };
  const itens = [];
  const cobertos = [];
  const erros = [];
  await Promise.all(
    portais.map(async portal => {
      try {
        const r = await fetcher(`https://api.apify.com/v2/acts/${encodeURIComponent(ator)}/run-sync-get-dataset-items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, // token no cabeçalho (fora da URL e dos logs)
          body: JSON.stringify(corpoDaConsulta(criterios, portal)),
          signal: AbortSignal.timeout(150000)
        });
        let j;
        try {
          j = await r.json();
        } catch {
          j = null;
        }
        if (!r.ok) {
          erros.push({ portal, status: r.status, mensagem: String((j && (j.error && (j.error.message || j.error))) || r.status).slice(0, 200) });
          return;
        }
        cobertos.push(DOMINIO_DO_PORTAL[portal]);
        for (const reg of Array.isArray(j) ? j : []) itens.push(normalizar(reg, portal));
      } catch (err) {
        erros.push({ portal, status: 0, mensagem: String(err.message).slice(0, 200) });
      }
    })
  );
  if (!cobertos.length) return { ok: false, motivo: erros.some(e => e.status === 401 || e.status === 403) ? 'chave_apify_recusada' : 'erro_apify', detalhe: erros.map(e => `${e.portal}: ${e.mensagem}`).join(' | ').slice(0, 300), erros };
  return { ok: true, itens, cobertos, erros };
}

module.exports = { ACTOR_PADRAO, apifyConfigurado, corpoDaConsulta, normalizar, buscarApify };
