/**
 * LINKS PRONTOS (🔗 BUSCA PRONTA NOS PORTAIS)
 * Um link por portal com TODOS os filtros do pedido — inclusive o bairro/condomínio, que antes
 * se perdia no ZAP e no VivaReal (caso Jardins Itália). Puro: só monta texto.
 */
const { normalize } = require('./brain/text');

const slug = s => normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** ZAP abrevia "Jardins" como "jds" nos endereços (visto em zapimoveis.com.br/.../go+goiania++jds-italia/) */
const slugZap = s => slug(s).replace(/^jardins-/, 'jds-');

/**
 * Local para o endereço do portal: bairro (preferido) -> bairro do mapa -> o que foi digitado em
 * "condomínio/edifício" -> nome do condomínio/edifício do mapa.
 * `aproximado` = o nome pode não ser um bairro do portal (o relatório avisa para conferir).
 */
function localDoPedido(c) {
  const f = c.filtros || {};
  if (f.bairro) return { nome: f.bairro, aproximado: false };
  if (c.local.bairros[0]) return { nome: c.local.bairros[0], aproximado: false };
  if (f.local) return { nome: f.local, aproximado: true };
  const x = (c.local.condominios[0] && c.local.condominios[0].name) || (c.local.edificios[0] && c.local.edificios[0].name);
  if (x) return { nome: String(x).replace(/^(condom[ií]nio|residencial|edif[ií]cio|ed\.?)\s+/i, ''), aproximado: true };
  return null;
}

/** @param dominiosAtivos lista de domínios ligados, ex.: ['olx.com.br','zapimoveis.com.br','vivareal.com.br'] */
function linksProntos(c, dominiosAtivos) {
  const fl = c.filtros || {};
  const local = localDoPedido(c);
  const cidade = c.local.cidades.find(x => x !== 'Goiânia') || 'Goiânia';
  const tipo = (c.tipos && c.tipos[0]) || 'Apartamento';
  const aluguel = c.transacao === 'ALUGUEL';
  const neg = aluguel ? 'aluguel' : 'venda';
  const emCondominio = tipo === 'Casa' && (Boolean(fl.local) || c.subtipo_casa === 'CONDOMINIO');
  const zapTipo = { Apartamento: 'apartamentos', Cobertura: 'cobertura', Casa: emCondominio ? 'casas-de-condominio' : 'casas', Sobrado: 'sobrado', Terreno: 'terrenos-lotes-condominios', Flat: 'flat', Studio: 'studio', Comercial: 'imoveis' }[tipo] || 'imoveis';
  const vrTipo = { Apartamento: 'apartamento_residencial', Cobertura: 'cobertura_residencial', Casa: emCondominio ? 'condominio_residencial' : 'casa_residencial', Sobrado: 'sobrado_residencial', Terreno: 'lote-terreno_residencial', Flat: 'flat_residencial' }[tipo] || '';

  // filtros comuns de ZAP e VivaReal
  const q = new URLSearchParams();
  if (c.valor_min) q.set('precoMinimo', c.valor_min);
  if (c.valor_max) q.set('precoMaximo', c.valor_max);
  if (c.quartos_min) q.set('quartos', c.quartos_min);
  if (c.suites_min) q.set('suites', c.suites_min);
  if (c.vagas_min) q.set('vagas', c.vagas_min);
  if (c.area_min) q.set('areaMinima', Math.round(c.area_min));
  if (c.area_max) q.set('areaMaxima', Math.round(c.area_max));
  const qs = q.toString() ? `?${q}` : '';

  const zap = `https://www.zapimoveis.com.br/${neg}/${zapTipo}/go+${slug(cidade)}${local ? `++${slugZap(local.nome)}` : ''}/${qs}`;
  const vivareal = `https://www.vivareal.com.br/${neg}/goias/${slug(cidade)}/${local ? `bairros/${slug(local.nome)}/` : ''}${vrTipo ? `${vrTipo}/` : ''}${qs}`;

  // OLX: a busca é por texto (tipo + condomínio/bairro) + filtros de preço, quartos e área
  const termo = [tipo, fl.local || (local && local.nome) || ''].filter(Boolean).join(' ').toLowerCase();
  const o = new URLSearchParams();
  o.set('q', termo);
  if (c.valor_min) o.set('ps', c.valor_min);
  if (c.valor_max) o.set('pe', c.valor_max);
  if (c.quartos_min) o.set('ros', c.quartos_min);
  if (c.area_min) o.set('ss', Math.round(c.area_min));
  const olx = `https://www.olx.com.br/imoveis/${neg}/estado-go/grande-goiania-e-anapolis/${slug(cidade)}?${o}`;

  const todos = { 'olx.com.br': ['OLX', olx], 'zapimoveis.com.br': ['ZAP Imóveis', zap], 'vivareal.com.br': ['VivaReal', vivareal] };
  return Object.fromEntries((dominiosAtivos || Object.keys(todos)).filter(d => todos[d]).map(d => todos[d]));
}

module.exports = { slug, slugZap, localDoPedido, linksProntos };
