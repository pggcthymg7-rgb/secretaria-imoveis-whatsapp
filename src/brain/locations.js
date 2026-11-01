/**
 * ============================================================================
 * DETECTOR DE LOCALIZAÇÃO
 * ============================================================================
 * Lê o pedido do grupo e descobre ONDE a pessoa quer o imóvel:
 * - bairros/setores (com tolerância a erro de digitação)
 * - regiões ("região sul", "zona oeste")
 * - marcos e avenidas ("perto do DETRAN", "região da Praça Tamandaré", "T-63")
 * - condomínios e edifícios pelo nome ("Jardins Lyon", "Flat Metropolitan")
 * - cidades e raio ("raio de 40 km de Goiânia", "Senador Canedo")
 * - "qualquer setor" / "sem região de preferência"
 *
 * Também confere se um imóvel da carteira está dentro do que foi pedido.
 * ============================================================================
 */
const { buildEntries, REGIOES, GOIANIA_CENTER } = require('./gazetteer');
const { normalize, hasPhrase, fuzzyContains, fuzzyFind, tokens, haversineKm } = require('./text');

const BASE = buildEntries();

// Palavras que NUNCA são nome de edifício/condomínio (vocabulário do mercado + português comum)
const STOPWORDS = new Set(`
a o as os um uma uns umas de da do das dos em no na nos nas e ou com sem para pra pro por que se ate
ao aos à mais menos muito pouco bem bom boa otimo otima lindo linda grande pequeno pequena amplo ampla
novo nova novos novas usado usada seminovo seminova reformado reformada pronto pronta planta lancamento
mobiliado mobiliada mobiliados semimobiliado semi mobilia armarios armario decorado decorada porteira fechada
quarto quartos q qts qt dorm dorms dormitorio dormitorios suite suites suit banheiro banheiros lavabo
vaga vagas garagem garagens coberta cobertas gaveta independente independentes
sala salas cozinha americana integrada area areas lazer completa completo gourmet espaco piscina churrasqueira
varanda sacada quintal jardim despensa closet escritorio elevador portaria academia playground quadra salao festas
andar alto baixo terreo terrea nascente poente sol manha tarde frente fundos esquina
casa casas sobrado sobrados apto apartamento apartamentos ap aps flat flats studio kitnet kit loft cobertura duplex triplex
lote lotes terreno terrenos chacara chacaras sitio sitios fazenda fazendas rancho imovel imoveis comercial sala loja galpao
residencial condominio condominios fechado horizontal vertical predio edificio torre torres bloco
setor bairro regiao regioes zona perto proximo proxima proximos arredores redondezas imediacoes lado vizinho
valor valores preco reais mil milhao milhoes k mi r rs orcamento maximo minimo max min teto faixa torno volta cerca
venda vender compra comprar aluguel alugar locacao vista avista financiamento financiado financiavel fgts permuta troca agio repasse quitado
cliente clientes corretor corretora corretores parceria parceiro parceira imobiliaria
busco procuro preciso quero gostaria necessito tenho tem temos alguem quem tiver opcao opcoes envie enviem enviar mandar manda
pdf foto fotos video videos link
urgente urgencia hoje agora rapido
metros metro m2 m km quilometros hectare hectares alqueire alqueires
alto padrao luxo medio popular economico simples
goiania goias go
obs observacao preferencia preferencialmente ideal importante
`.split(/\s+/).filter(Boolean));

const CONNECTORS = new Set(['ou', 'e', '/', ',']);

const PROXIMITY_RX = /(?:regiao|regioes|perto|proximo|proxima|prox|arredores|redondezas|imediacoes|ao lado|vizinho|vizinhanca|entorno|nas proximidades)\s*(?:d[aoe]s?|a|ao|à)?\s*$/;

const REGION_RX = /\b(?:regiao|zona)\s+(sul|sudoeste|oeste|noroeste|norte|leste|central|centro|sudeste)\b/g;
const QUALQUER_RX = /\b(qualquer\s+(?:setor|bairro|regiao|lugar|local)|sem\s+(?:regiao|bairro|setor|local)\s+(?:de\s+)?preferencia|sem\s+preferencia\s+(?:de\s+)?(?:regiao|bairro|setor|local)|tanto\s+faz\s+(?:o\s+|a\s+)?(?:setor|bairro|regiao)|toda\s+goiania|em\s+qualquer\s+regiao)\b/;
const RAIO_RX = /\b(?:raio\s+de\s+)?(?:ate\s+)?(\d{1,3})\s*(?:km|quilometros?)\s*(?:de|da|do|ao redor de|em volta de)\s+([a-z ]{3,30})/;

function titleRegion(r) {
  const k = r === 'centro' ? 'central' : r;
  return k.charAt(0).toUpperCase() + k.slice(1);
}

/**
 * Monta o índice de busca juntando o mapa base + lugares cadastrados pelo corretor + carteira
 */
function buildIndex({ extraPlaces = [], inventory = [] } = {}) {
  const entries = [
    ...BASE.bairros,
    ...BASE.condominios,
    ...BASE.marcos,
    ...BASE.cidades
  ];

  const bairroByName = new Map(BASE.bairros.map(b => [normalize(b.name), b]));

  for (const p of extraPlaces) {
    if (!p || !p.name) continue;
    const kind = ['bairro', 'condominio', 'edificio', 'marco', 'cidade'].includes(p.kind) ? p.kind : 'edificio';
    const ref = p.bairro ? bairroByName.get(normalize(p.bairro)) : null;
    entries.push({
      kind,
      name: String(p.name).trim(),
      region: p.region || (ref && ref.region) || null,
      bairro: p.bairro || null,
      lat: ref ? ref.lat : null,
      lng: ref ? ref.lng : null,
      city: p.city || 'Goiânia',
      aliases: [p.name, ...(Array.isArray(p.aliases) ? p.aliases : String(p.aliases || '').split(','))]
        .map(a => String(a).trim())
        .filter(Boolean)
    });
  }

  // Nomes de edifícios/condomínios cadastrados nos imóveis também viram vocabulário conhecido
  for (const prop of inventory) {
    const ed = String(prop.edificio || '').trim();
    if (ed.length >= 3) {
      entries.push({ kind: 'edificio', name: ed, region: prop.regiao || null, aliases: [ed], fromInventory: true });
    }
    const setorNorm = normalize(prop.setor);
    if (setorNorm && !bairroByName.has(setorNorm) && !entries.some(e => e.aliases.some(a => normalize(a) === setorNorm))) {
      entries.push({ kind: 'bairro', name: prop.setor, region: (prop.regiao || '').replace(/^regiao\s+/i, '') || null, aliases: [prop.setor], fromInventory: true });
    }
  }

  const aliasList = [];
  for (const e of entries) {
    for (const a of e.aliases) {
      const an = normalize(a);
      if (an.length >= 3) aliasList.push({ alias: an, entry: e });
    }
  }
  aliasList.sort((x, y) => y.alias.length - x.alias.length);
  return { entries, aliasList, bairroByName };
}

function neighborsOf(point, radiusKm) {
  if (!point || point.lat === null || point.lat === undefined) return [];
  return BASE.bairros.filter(b => haversineKm(point, b) <= radiusKm).map(b => b.name);
}

/**
 * Remove o trecho onde a pessoa OFERECE um imóvel na troca ("tem permuta (casa no Cidade Verde)"),
 * para não confundir o imóvel dela com o lugar que ela procura.
 */
function stripPermutaClause(textNorm) {
  return textNorm.replace(/\b(?:permuta|troca)\b[^\n]*/g, ' ');
}

/**
 * Extrai nomes próprios desconhecidos logo após palavras como "flat", "edifício", "residencial":
 * "flat metropolitan ou brookfield mobiliado" -> ["metropolitan", "brookfield"]
 */
const TRIGGER_WORDS = new Set(['edificio', 'ed', 'residencial', 'res', 'condominio', 'cond', 'torre', 'flat', 'apto', 'apartamento', 'ap', 'casa', 'sobrado', 'cobertura', 'studio', 'loft', 'predio', 'empreendimento', 'jardins']);

function extractUnknownNames(scanText) {
  const names = [];
  for (const line of String(scanText).split(/\n|[.!?;:]/)) {
    const toks = line.split(/(\s+|,|\/)/).map(t => t.trim()).filter(Boolean);
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i].replace(/[^a-z0-9]/g, '');
      if (!TRIGGER_WORDS.has(t)) continue;
      let current = [];
      for (let j = i + 1; j < toks.length && j <= i + 8; j++) {
        const raw = toks[j];
        const w = raw.replace(/[^a-z0-9]/g, '');
        if (raw === '/' || raw === ',' || CONNECTORS.has(w)) {
          if (current.length) {
            names.push(current.join(' '));
            current = [];
          }
          continue;
        }
        if (!w) break;
        if (['no', 'na', 'do', 'da', 'em'].includes(w) && current.length === 0) continue;
        if (STOPWORDS.has(w) || /^\d/.test(w) || w.length < 3) break;
        current.push(w);
      }
      if (current.length) names.push(current.join(' '));
    }
  }
  return [...new Set(names)].filter(n => n.length >= 4);
}

/**
 * Descobre todas as localizações pedidas no texto
 */
function detectLocations(rawText, ctx = {}) {
  const index = ctx.index || buildIndex(ctx);
  const full = normalize(rawText);
  let scan = ` ${stripPermutaClause(full)} `;

  const result = {
    qualquer: QUALQUER_RX.test(full),
    regioes: [],
    bairros: [],
    perto: [],
    marcos: [],
    condominios: [],
    edificios: [],
    cidades: [],
    raio: null,
    nomesDesconhecidos: [],
    mencionaLocal: false,
    resumo: []
  };

  // 1) Raio em km ("raio de 40 km de Goiânia")
  const raio = scan.match(RAIO_RX);
  if (raio) {
    const km = parseInt(raio[1], 10);
    const centerName = normalize(raio[2]).split(' ').slice(0, 4).join(' ');
    const city = index.entries.find(e => e.kind === 'cidade' && e.aliases.some(a => centerName.startsWith(normalize(a))));
    result.raio = { km, centro: city ? city.name : 'Goiânia', lat: city ? city.lat : GOIANIA_CENTER.lat, lng: city ? city.lng : GOIANIA_CENTER.lng };
    scan = scan.replace(raio[0], ' ');
    result.resumo.push(`até ${km} km de ${result.raio.centro}`);
  }

  // 2) Regiões
  let m;
  REGION_RX.lastIndex = 0;
  while ((m = REGION_RX.exec(scan)) !== null) {
    const r = titleRegion(m[1]);
    if (!result.regioes.includes(r)) result.regioes.push(r);
  }
  scan = scan.replace(REGION_RX, ' ');
  if (result.qualquer) scan = scan.replace(QUALQUER_RX, ' ');

  // 3) Lugares conhecidos (do mais longo para o mais curto, consumindo o texto para evitar duplicidade)
  for (const { alias, entry } of index.aliasList) {
    const words = scan.split(/\s+/).filter(Boolean);
    const clean = words.map(w => w.replace(/[^a-z0-9]/g, ''));
    const k = tokens(alias).length;
    const pos = fuzzyFind(clean.join(' '), alias);
    if (pos < 0) continue;

    // evita "centro" de "centro de lazer"/"centro comercial"
    if (alias === 'centro' && /^(de lazer|comercial|empresarial)/.test(clean.slice(pos + 1, pos + 3).join(' '))) continue;

    // Veio depois de "perto de / próximo ao / região da"?
    const before = words.slice(Math.max(0, pos - 4), pos).join(' ');
    const isProximity = PROXIMITY_RX.test(before);

    if (entry.kind === 'bairro') {
      if (!result.bairros.includes(entry.name)) result.bairros.push(entry.name);
      if (isProximity && entry.lat) {
        for (const n of neighborsOf(entry, 2.0)) if (!result.perto.includes(n)) result.perto.push(n);
      }
    } else if (entry.kind === 'marco') {
      if (!result.marcos.includes(entry.name)) result.marcos.push(entry.name);
      if (entry.bairro && !result.perto.includes(entry.bairro)) result.perto.push(entry.bairro);
      for (const n of neighborsOf(entry, 2.5)) if (!result.perto.includes(n)) result.perto.push(n);
    } else if (entry.kind === 'condominio') {
      if (!result.condominios.find(c => c.name === entry.name)) result.condominios.push(entry);
    } else if (entry.kind === 'edificio') {
      if (!result.edificios.find(c => c.name === entry.name)) result.edificios.push(entry);
    } else if (entry.kind === 'cidade') {
      if (!result.cidades.includes(entry.name)) result.cidades.push(entry.name);
    }

    // consome o termo encontrado (mantendo quebras de linha)
    const cleanAll = scan.split(/(\s+)/);
    let wordCount = -1;
    scan = cleanAll
      .map(part => {
        if (/^\s+$/.test(part) || !part) return part;
        if (!part.replace(/[^a-z0-9]/g, '')) return part;
        wordCount++;
        return wordCount >= pos && wordCount < pos + k ? '_' : part;
      })
      .join('');
  }

  // "Goiânia" sozinha não restringe nada (a carteira é de Goiânia por padrão), exceto se for a única cidade com outras
  if (result.raio) result.cidades = result.cidades.filter(c => c !== result.raio.centro);

  // 4) Nomes próprios desconhecidos (edifícios/condomínios que ainda não estão no mapa)
  result.nomesDesconhecidos = extractUnknownNames(scan).filter(n => !STOPWORDS.has(n));

  result.mencionaLocal = Boolean(
    result.regioes.length || result.bairros.length || result.marcos.length || result.condominios.length ||
    result.edificios.length || result.cidades.length || result.raio || result.nomesDesconhecidos.length
  );

  // Palavras de localização sem nada reconhecido -> sinaliza para não enviar às cegas
  result.localNaoReconhecido =
    !result.qualquer &&
    !result.mencionaLocal &&
    /\b(setor|bairro|regiao d[aoe]|perto d[aoe]|proximo (?:a|ao|da|do)|no condominio|edificio|residencial)\b/.test(stripPermutaClause(full));

  if (result.regioes.length) result.resumo.push(`Região ${result.regioes.join('/')}`);
  if (result.bairros.length) result.resumo.push(result.bairros.join(', '));
  if (result.marcos.length) result.resumo.push(`perto de ${result.marcos.join(', ')}`);
  if (result.condominios.length) result.resumo.push(`Cond. ${result.condominios.map(c => c.name).join(' / ')}`);
  if (result.edificios.length) result.resumo.push(`Ed. ${result.edificios.map(c => c.name).join(' / ')}`);
  if (result.nomesDesconhecidos.length) result.resumo.push(`"${result.nomesDesconhecidos.join('" / "')}"`);
  if (result.cidades.length) result.resumo.push(result.cidades.join(', '));
  if (result.qualquer) result.resumo.push('qualquer região');

  return result;
}

/**
 * Onde fica um imóvel da carteira (bairro canônico, região, cidade e coordenada)
 */
function locateProperty(prop, index) {
  const setorNorm = normalize(prop.setor);
  const text = normalize(`${prop.tipo || ''} ${prop.setor || ''} ${prop.edificio || ''} ${prop.titulo || ''} ${prop.descricao || ''}`);
  let bairro = index.bairroByName.get(setorNorm) || null;
  if (!bairro && setorNorm) {
    bairro = BASE.bairros.find(b => b.aliases.some(a => normalize(a) === setorNorm || fuzzyContains(setorNorm, normalize(a)) && normalize(a).length >= 6)) || null;
  }
  const regionRaw = String(prop.regiao || '').replace(/^regi[aã]o\s+/i, '').trim();
  const region = regionRaw ? titleRegion(normalize(regionRaw)) : bairro ? bairro.region : null;

  let city = String(prop.cidade || '').trim();
  if (!city) {
    const c = BASE.cidades.find(ci => ci.name !== 'Goiânia' && ci.aliases.some(a => normalize(a).length >= 5 && hasPhrase(normalize(`${prop.setor} ${prop.edificio || ''}`), normalize(a))));
    city = c ? c.name : 'Goiânia';
  }
  const cityEntry = BASE.cidades.find(ci => ci.name === city) || null;
  const point = bairro && city === 'Goiânia' ? bairro : cityEntry;

  return { bairro: bairro ? bairro.name : prop.setor, region, city, point, text };
}

/**
 * Confere se o imóvel atende ao local pedido. Retorna { ok, motivo }
 */
function propertyMatchesLocation(prop, loc, index) {
  if (!loc || loc.qualquer || !loc.mencionaLocal) return { ok: true, motivo: null };
  const where = locateProperty(prop, index);

  // Cidade(s) pedida(s) funcionam como filtro obrigatório (E)
  if (loc.cidades.length && !loc.cidades.includes(where.city)) {
    return { ok: false, motivo: `fica em ${where.city}, pediram ${loc.cidades.join('/')}` };
  }

  // Raio em km
  if (loc.raio) {
    if (!where.point) return { ok: false, motivo: 'sem coordenada para medir distância' };
    const km = haversineKm(loc.raio, where.point);
    if (km > loc.raio.km) return { ok: false, motivo: `fica a ~${Math.round(km)} km (limite ${loc.raio.km} km)` };
  }

  const placeFilters =
    loc.regioes.length + loc.bairros.length + loc.perto.length + loc.condominios.length + loc.edificios.length + loc.nomesDesconhecidos.length;
  if (placeFilters === 0) return { ok: true, motivo: null };

  // Qualquer um dos lugares pedidos serve (OU)
  if (loc.bairros.some(b => normalize(b) === normalize(where.bairro))) return { ok: true, motivo: `bairro ${where.bairro}` };
  if (loc.perto.some(b => normalize(b) === normalize(where.bairro))) return { ok: true, motivo: `${where.bairro} fica perto do local pedido` };
  if (where.region && loc.regioes.includes(where.region)) return { ok: true, motivo: `Região ${where.region}` };
  for (const c of loc.condominios) {
    if (c.aliases.some(a => normalize(a).length >= 4 && fuzzyContains(where.text, normalize(a)))) return { ok: true, motivo: `condomínio ${c.name}` };
  }
  for (const e of loc.edificios) {
    if (e.aliases.some(a => fuzzyContains(where.text, normalize(a)))) return { ok: true, motivo: `edifício ${e.name}` };
  }
  for (const n of loc.nomesDesconhecidos) {
    if (fuzzyContains(where.text, n)) return { ok: true, motivo: `"${n}" consta no cadastro` };
  }
  return { ok: false, motivo: `local (${where.bairro}${where.region ? ' / ' + where.region : ''}) diferente do pedido (${loc.resumo.join('; ')})` };
}

module.exports = {
  REGIOES,
  BASE,
  STOPWORDS,
  buildIndex,
  detectLocations,
  locateProperty,
  propertyMatchesLocation,
  stripPermutaClause,
  extractUnknownNames,
  neighborsOf
};
