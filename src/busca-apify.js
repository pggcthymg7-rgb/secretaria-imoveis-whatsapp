/**
 * CAMADA 3 (OPCIONAL): OLX, ZAP e VivaReal estruturados via Apify
 * Só roda se APIFY_API_TOKEN estiver configurado. Os robôs ("Actors") do Apify abrem os portais por
 * IP residencial brasileiro (a OLX recusa IP de servidor com HTTP 403 da Cloudflare; ZAP/VivaReal também)
 * e devolvem os anúncios já em campos (preço, área, quartos…), filtrados pelo próprio portal — sem IA.
 * ATENÇÃO: leitura automática de portais vai contra os termos de uso deles; só use se aceitar o risco.
 * Guardamos só dados públicos do anúncio (nunca telefone nem nome de dono particular).
 *
 * Robôs (entrada conferida no esquema público de cada um, api.apify.com/v2/acts/<robô>/builds/default):
 *  - ZAP/VivaReal: haketa~zapimoveis-scraper (APIFY_ACTOR) — portal ZAP|VIVA_REAL, filtros nativos.
 *  - OLX: solidcode~olx-brazil-scraper (APIFY_ACTOR_OLX) — recebe o endereço de busca da OLX com os filtros.
 * Cobrança: por anúncio devolvido (por isso os filtros vão no pedido ao robô: só pagamos o que serve).
 */
const { slug, localDoPedido, linksProntos } = require('./busca-links');
const { lerEndereco, tipoDoTexto } = require('./busca-anuncio');
const { normalize } = require('./brain/text');

const ACTOR_PADRAO = 'haketa~zapimoveis-scraper';
const ACTOR_OLX_PADRAO = 'solidcode~olx-brazil-scraper';
const PORTAL_DO_DOMINIO = { 'zapimoveis.com.br': 'ZAP', 'vivareal.com.br': 'VIVA_REAL', 'olx.com.br': 'OLX' };
const DOMINIO_DO_PORTAL = { ZAP: 'zapimoveis.com.br', VIVA_REAL: 'vivareal.com.br', OLX: 'olx.com.br' };
const NOME_PORTAL = { ZAP: 'ZAP', VIVA_REAL: 'VivaReal', OLX: 'OLX' };
/** Cidades que o robô do ZAP aceita em `cities` (lista fixa do esquema); as outras vão em `citiesCustom` */
const CIDADES_ZAP = new Set(['sao-paulo', 'rio-de-janeiro', 'belo-horizonte', 'brasilia', 'curitiba', 'porto-alegre', 'florianopolis', 'salvador', 'recife', 'fortaleza', 'goiania', 'campinas', 'santos', 'guarulhos', 'niteroi', 'sao-jose-dos-campos', 'ribeirao-preto', 'sorocaba', 'londrina', 'joinville', 'uberlandia', 'vitoria', 'manaus', 'belem', 'natal', 'campo-grande', 'cuiaba', 'maceio', 'joao-pessoa', 'aracaju']);
/** Tipo do pedido -> unitTypes do robô do ZAP (valores do enum do esquema) */
const UNIDADES = { Apartamento: ['APARTMENT'], Cobertura: ['PENTHOUSE'], Flat: ['FLAT'], Studio: ['KITNET', 'FLAT'], Kitnet: ['KITNET'], Terreno: ['LAND_LOT'], Lote: ['LAND_LOT'], Sobrado: ['HOME'], Chacara: ['FARM'], Chácara: ['FARM'], Fazenda: ['FARM'] };

const token = env => String((env && env.APIFY_API_TOKEN) || '').replace(/\s+/g, '').trim();
const apifyConfigurado = env => Boolean(token(env));
const olxLigado = env => String((env && env.APIFY_OLX) || '1') !== '0';
const maxPorPortal = env => Math.max(1, Math.min(50, Number((env && env.APIFY_MAX_POR_PORTAL) || 15) || 15));
const ator = (env, chave, padrao) => String((env && env[chave]) || padrao).trim().replace(/\//, '~');

/** Domínios que o Apify cobre com esta configuração (o resto fica para o Serper/Tavily) */
const dominiosApify = env => Object.keys(PORTAL_DO_DOMINIO).filter(d => d !== 'olx.com.br' || olxLigado(env));

function unidadesDoPedido(c) {
  const tipos = c.tipos && c.tipos.length ? c.tipos : ['Apartamento'];
  const u = new Set();
  let comercial = false;
  for (const t of tipos) {
    if (t === 'Casa') {
      // "casa" sem dizer "de rua" aceita casa de condomínio (no ZAP é outro tipo: CONDOMINIUM)
      if (c.subtipo_casa !== 'CONDOMINIO') u.add('HOME');
      if (c.subtipo_casa !== 'RUA') u.add('CONDOMINIUM');
    } else if (t === 'Comercial') comercial = true;
    else for (const x of UNIDADES[t] || []) u.add(x);
  }
  return { unitTypes: [...u], usageTypes: comercial && !u.size ? ['COMMERCIAL'] : comercial ? [] : ['RESIDENTIAL'] };
}

/** Entrada do robô do ZAP/VivaReal (campos e valores do esquema público dele) */
function corpoDaConsulta(c, portal, env = {}) {
  const loc = localDoPedido(c);
  const cidade = slug(c.local.cidades.find(x => x !== 'Goiânia') || 'Goiânia');
  const { unitTypes, usageTypes } = unidadesDoPedido(c);
  const corpo = {
    mode: 'listings',
    portal,
    business: [c.transacao === 'ALUGUEL' ? 'RENTAL' : 'SALE'],
    listingType: [], // vazio = usados E lançamentos (o padrão do robô seria só usados)
    usageTypes,
    unitTypes,
    states: ['GO'],
    cities: CIDADES_ZAP.has(cidade) ? [cidade] : [],
    maxListings: maxPorPortal(env),
    maxPages: 2
  };
  if (!CIDADES_ZAP.has(cidade)) corpo.citiesCustom = [cidade];
  if (loc) corpo.neighborhoods = [slug(loc.nome)];
  if (c.valor_min) corpo.minPrice = c.valor_min;
  if (c.valor_max) corpo.maxPrice = c.valor_max;
  if (c.quartos_min) corpo.minBedrooms = c.quartos_min;
  if (c.vagas_min) corpo.minParkingSpaces = c.vagas_min;
  if (c.area_min) corpo.minArea = Math.round(c.area_min);
  if (c.area_max) corpo.maxArea = Math.round(c.area_max);
  return corpo;
}

/** Entrada do robô da OLX: o MESMO endereço de "Busca pronta" (texto + preço + quartos + área) */
function corpoOlx(c, env = {}) {
  const url = linksProntos(c, ['olx.com.br']).OLX;
  const corpo = { searchUrls: [url], maxResults: maxPorPortal(env), sortBy: 'relevance', enrichDetails: false };
  if (c.valor_min) corpo.minPrice = c.valor_min;
  if (c.valor_max) corpo.maxPrice = c.valor_max;
  return corpo;
}

const pega = (o, ...nomes) => {
  for (const n of nomes) if (o && o[n] !== undefined && o[n] !== null && o[n] !== '') return o[n];
  return undefined;
};
const numeroDe = v => {
  if (typeof v === 'number') return v;
  const n = Number(String(v == null ? '' : v).replace(/[^\d,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const doTexto = (t, re) => {
  const m = normalize(t).match(re);
  return m ? Number(m[1]) : 0;
};

/** Um registro do robô do ZAP/VivaReal -> item bruto do relatório (a trava e o filtro de preço rodam depois) */
function normalizar(reg, portal) {
  const link = String(pega(reg, 'url', 'link', 'listingUrl') || '');
  const editor = String(pega(reg, 'publisherType', 'advertiserType', 'publisher') || '');
  const imobiliaria = pega(reg, 'agencyName', 'advertiserName', 'publisherName');
  const particular = /owner|proprietar|particular|private|individual/i.test(editor);
  const profissional = /agenc|imobili|profession|broker|real.?estate|company|corretor/i.test(editor);
  const quartos = pega(reg, 'bedrooms', 'bedroomsCount') || 0;
  const suites = pega(reg, 'suites', 'suitesCount') || 0;
  const vagas = pega(reg, 'parkingSpaces', 'parking') || 0;
  return {
    titulo: String(pega(reg, 'title', 'name') || '').slice(0, 140),
    link,
    portalDominio: DOMINIO_DO_PORTAL[portal],
    preco: pega(reg, 'priceBRL', 'price', 'salePrice', 'rentPrice') || 0,
    area_m2: pega(reg, 'usableArea', 'area', 'totalArea') || 0,
    quartos,
    suites,
    vagas,
    bairro: String(pega(reg, 'neighborhood', 'bairro') || (reg.address && reg.address.neighborhood) || '').slice(0, 60),
    anunciante: particular ? 'Particular' : String(imobiliaria || '').slice(0, 80),
    tipo_anunciante: particular ? 'particular' : profissional || imobiliaria ? 'profissional' : 'desconhecido',
    resumo: `${quartos || '?'} quartos${suites ? `, ${suites} suítes` : ''}${vagas ? `, ${vagas} vagas` : ''}`
  };
}

/** Um registro do robô da OLX -> item bruto. Quartos/área: campo do robô, senão o título, senão o endereço do anúncio. */
function normalizarOlx(reg) {
  const link = String(pega(reg, 'url', 'link') || '');
  const titulo = String(pega(reg, 'title', 'subject') || '');
  const end = lerEndereco(link);
  const quartos = numeroDe(pega(reg, 'rooms', 'bedrooms')) || doTexto(titulo, /\b(\d{1,2}) ?(?:quartos?|qts?|dorm)/) || end.quartos || 0;
  const area = numeroDe(pega(reg, 'size', 'area', 'usableArea')) || doTexto(titulo, /\b(\d{2,4}) ?m(?:2|²)/) || end.area || 0;
  const suites = doTexto(titulo, /\b(\d{1,2}) ?suites?\b/);
  const vagas = numeroDe(pega(reg, 'garageSpaces', 'parkingSpaces'));
  const neg = pega(reg, 'isBusiness', 'professionalAd');
  const vendedor = reg.seller && typeof reg.seller === 'object' ? reg.seller : {};
  const negocio = neg === undefined ? (vendedor.isBusiness ?? vendedor.professional) : neg;
  const profissional = negocio === true || negocio === 'true';
  const particular = negocio === false || negocio === 'false';
  return {
    titulo: titulo.slice(0, 140),
    link,
    portalDominio: 'olx.com.br',
    preco: numeroDe(pega(reg, 'price', 'priceValue')) || numeroDe(reg.priceDisplay) || end.preco || 0,
    area_m2: area,
    quartos,
    suites,
    vagas,
    bairro: String(pega(reg, 'neighborhood', 'neighbourhood') || '').slice(0, 60),
    anunciante: particular ? 'Particular' : profissional ? String(vendedor.name || '').slice(0, 80) : '', // nome de particular nunca é guardado
    tipo_anunciante: particular ? 'particular' : profissional ? 'profissional' : 'desconhecido',
    tipo: tipoDoTexto(`${titulo} ${link.split('/').pop() || ''}`),
    resumo: `${quartos || '?'} quartos${suites ? `, ${suites} suítes` : ''}${area ? `, ${area} m²` : ''}`
  };
}

/** A busca da OLX é por texto: corta casa quando o pedido é apartamento (e vice-versa), sem gastar IA */
function tipoCombina(item, c) {
  if (!item.tipo) return true;
  const pedidos = (c.tipos && c.tipos.length ? c.tipos : ['Apartamento']).map(t => tipoDoTexto(t) || (t === 'Comercial' ? 'comercial' : '')).filter(Boolean);
  return !pedidos.length || pedidos.includes(item.tipo);
}

async function rodar({ nomeAtor, corpo, t, fetcher, timeoutMs = 180000 }) {
  // timeout do robô (s) menor que o nosso: se a resposta demorar, o Apify para o robô e não cobra mais nada
  const r = await fetcher(`https://api.apify.com/v2/acts/${encodeURIComponent(nomeAtor)}/run-sync-get-dataset-items?timeout=${Math.round(timeoutMs / 1000) - 10}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, // token no cabeçalho (fora da URL e dos logs)
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(timeoutMs)
  });
  let j;
  try {
    j = await r.json();
  } catch {
    j = null;
  }
  if (!r.ok) return { ok: false, status: r.status, mensagem: String((j && (j.error && (j.error.message || j.error))) || r.status).slice(0, 200) };
  return { ok: true, registros: Array.isArray(j) ? j : [] };
}

/**
 * Consulta OLX, ZAP e/ou VivaReal (conforme os portais ligados). { ok, itens, cobertos:[domínios], erros:[] }
 */
async function buscarApify({ criterios, dominios, env = process.env, fetcher = fetch }) {
  const t = token(env);
  if (!t) return { ok: false, motivo: 'sem_chave_apify' };
  const cobre = dominiosApify(env);
  const portais = dominios.filter(d => cobre.includes(d)).map(d => PORTAL_DO_DOMINIO[d]);
  if (!portais.length) return { ok: true, itens: [], cobertos: [], erros: [] };
  const itens = [];
  const cobertos = [];
  const erros = [];
  await Promise.all(
    portais.map(async portal => {
      try {
        const olx = portal === 'OLX';
        const r = await rodar({ nomeAtor: olx ? ator(env, 'APIFY_ACTOR_OLX', ACTOR_OLX_PADRAO) : ator(env, 'APIFY_ACTOR', ACTOR_PADRAO), corpo: olx ? corpoOlx(criterios, env) : corpoDaConsulta(criterios, portal, env), t, fetcher });
        if (!r.ok) return erros.push({ portal, status: r.status, mensagem: r.mensagem });
        cobertos.push(DOMINIO_DO_PORTAL[portal]);
        for (const reg of r.registros) {
          if (olx) {
            const it = normalizarOlx(reg);
            if (tipoCombina(it, criterios)) itens.push(it);
          } else itens.push(normalizar(reg, portal));
        }
      } catch (err) {
        erros.push({ portal, status: 0, mensagem: String(err.message).slice(0, 200) });
      }
    })
  );
  if (!cobertos.length) return { ok: false, motivo: erros.some(e => e.status === 401 || e.status === 403) ? 'chave_apify_recusada' : 'erro_apify', detalhe: erros.map(e => `${NOME_PORTAL[e.portal]}: ${e.mensagem}`).join(' | ').slice(0, 300), erros };
  return { ok: true, itens, cobertos, erros };
}

/**
 * "testar apify": roda cada robô DE VERDADE pedindo só 1 anúncio de apartamento à venda em Goiânia
 * (custo: menos de US$ 0,02) e conta o que voltou. É a prova de que a busca funciona NESTA máquina.
 */
async function testarApify({ env = process.env, fetcher = fetch } = {}) {
  const t = token(env);
  if (!t) return { ok: false, semChave: true, portais: [] };
  let conta = null;
  try {
    const r = await fetcher('https://api.apify.com/v2/users/me/limits', { headers: { Authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(20000) });
    if (r.status === 401 || r.status === 403) return { ok: false, recusado: true, portais: [] };
    const j = r.ok ? await r.json() : null;
    const d = j && j.data;
    if (d) conta = { gasto: Number(d.current && d.current.monthlyUsageUsd) || 0, limite: Number(d.limits && d.limits.maxMonthlyUsageUsd) || 0 };
  } catch {
    conta = null;
  }
  const c = { tipos: ['Apartamento'], transacao: 'VENDA', local: { cidades: ['Goiânia'], bairros: [], condominios: [], edificios: [] }, filtros: {} };
  const envTeste = { ...env, APIFY_MAX_POR_PORTAL: '1' };
  const alvos = [['ZAP', ator(env, 'APIFY_ACTOR', ACTOR_PADRAO), corpoDaConsulta(c, 'ZAP', envTeste)], ['VIVA_REAL', ator(env, 'APIFY_ACTOR', ACTOR_PADRAO), corpoDaConsulta(c, 'VIVA_REAL', envTeste)]];
  if (olxLigado(env)) alvos.push(['OLX', ator(env, 'APIFY_ACTOR_OLX', ACTOR_OLX_PADRAO), corpoOlx(c, envTeste)]);
  const portais = await Promise.all(
    alvos.map(async ([portal, nomeAtor, corpo]) => {
      const inicio = Date.now();
      try {
        const r = await rodar({ nomeAtor, corpo, t, fetcher });
        const s = Math.round((Date.now() - inicio) / 1000);
        if (!r.ok) return { portal, ok: false, status: r.status, mensagem: r.mensagem, s };
        const it = r.registros[0] ? (portal === 'OLX' ? normalizarOlx(r.registros[0]) : normalizar(r.registros[0], portal)) : null;
        return { portal, ok: Boolean(it && it.link && numeroDe(it.preco) > 0), vazio: !it, item: it, campos: r.registros[0] ? Object.keys(r.registros[0]).slice(0, 40) : [], s };
      } catch (err) {
        return { portal, ok: false, status: 0, mensagem: String(err.message).slice(0, 200), s: Math.round((Date.now() - inicio) / 1000) };
      }
    })
  );
  return { ok: portais.every(p => p.ok), portais, conta };
}

const brl = n => `R$ ${Math.round(numeroDe(n)).toLocaleString('pt-BR')}`;

function textoTesteApify(r) {
  if (r.semChave) return '❌ Falta o token do Apify. Mande *chave apify SEU_TOKEN* (apify.com › Settings › API & Integrations) e depois apague a mensagem.';
  if (r.recusado) return '❌ O Apify recusou o token. Copie de novo em apify.com › Settings › API & Integrations e mande *chave apify SEU_TOKEN*.';
  const linhas = [`🔬 *Teste do Apify* (1 anúncio por portal, custo < US$ 0,02)`];
  for (const p of r.portais) {
    const nome = NOME_PORTAL[p.portal];
    if (p.ok) linhas.push(`✅ ${nome} (${p.s}s): ${brl(p.item.preco)} · ${p.item.area_m2 || '?'} m² · ${p.item.quartos || '?'} quartos · ${p.item.tipo_anunciante}\n   ${p.item.link}`);
    else if (p.vazio) linhas.push(`⚠️ ${nome} (${p.s}s): o robô rodou mas não devolveu anúncio.`);
    else if (p.item) linhas.push(`⚠️ ${nome} (${p.s}s): veio anúncio sem preço/link. Campos: ${p.campos.join(', ').slice(0, 300)}`);
    else linhas.push(`❌ ${nome}: ${p.status ? `HTTP ${p.status} — ` : ''}${p.mensagem}`);
  }
  if (r.conta) linhas.push(`💳 Gasto no mês: US$ ${r.conta.gasto.toFixed(2)}${r.conta.limite ? ` de US$ ${r.conta.limite.toFixed(2)}` : ''}`);
  linhas.push(r.ok ? '👍 Tudo certo: a *busca* já usa o Apify nesses portais (preço exato, sem depender do IP da VM).' : '👉 Se algum falhou, mande o print desta mensagem para o Claude.');
  return linhas.join('\n');
}

module.exports = { ACTOR_PADRAO, ACTOR_OLX_PADRAO, apifyConfigurado, dominiosApify, unidadesDoPedido, corpoDaConsulta, corpoOlx, normalizar, normalizarOlx, tipoCombina, buscarApify, testarApify, textoTesteApify };
