#!/usr/bin/env node
/**
 * ============================================================================
 * ATUALIZA O MAPA DA BIGA COM DADOS ABERTOS DO OPENSTREETMAP (licença ODbL)
 * ============================================================================
 * Baixa bairros, loteamentos, condomínios e edifícios com nome de Goiânia e região
 * metropolitana e gera src/brain/data/mapa-osm.json (ou DATA_DIR/mapa-osm.json).
 *
 * Uso:
 *   node scripts/atualizar-mapa.js                 -> baixa da internet (Overpass)
 *   node scripts/atualizar-mapa.js --de pasta/     -> usa arquivos .json já baixados
 *   node scripts/atualizar-mapa.js --saida arquivo.json
 *
 * Por que OpenStreetMap: é aberto e pode ser usado livremente com atribuição.
 * O portal da prefeitura (geo360) não oferece exportação aberta; por isso não é
 * consultado automaticamente.
 * ============================================================================
 */
const fs = require('fs');
const path = require('path');

const MIRRORS = (process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter,https://overpass.private.coffee/api/interpreter,https://overpass.kumi.systems/api/interpreter').split(',');
const CIDADES = ['Goiânia', 'Aparecida de Goiânia', 'Senador Canedo', 'Trindade', 'Goianira', 'Abadia de Goiás', 'Hidrolândia', 'Bela Vista de Goiás', 'Nerópolis', 'Santo Antônio de Goiás'];
const BBOX = '(-17.00,-49.60,-16.40,-49.00)';

const QUERIES = {
  lugares: `[out:json][timeout:150];(nwr["place"~"^(suburb|neighbourhood|quarter|hamlet|village)$"]${BBOX};relation["boundary"="administrative"]["admin_level"~"^(9|10|11)$"]${BBOX};);out center tags;`,
  condominios: `[out:json][timeout:150];(way["landuse"="residential"]["name"]${BBOX};relation["landuse"="residential"]["name"]${BBOX};nwr["residential"]["name"]${BBOX};);out center tags;`,
  edificios: `[out:json][timeout:180];nwr["building"~"^(apartments|residential|commercial|office|yes|hotel|dormitory)$"]["name"]${BBOX};out center tags;`,
  ...Object.fromEntries(CIDADES.map(c => [`cidade:${c}`, `[out:json][timeout:120];area["name"="${c}"]["admin_level"="8"]->.a;(nwr["place"~"^(suburb|neighbourhood|quarter)$"](area.a);relation["boundary"="administrative"]["admin_level"~"^(9|10|11)$"](area.a);way["landuse"="residential"]["name"](area.a);nwr["building"]["name"](area.a););out ids;`]))
};

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function overpass(query) {
  let lastErr;
  for (const url of MIRRORS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'BIGA-secretaria-imobiliaria/1.0' },
          body: 'data=' + encodeURIComponent(query),
          signal: AbortSignal.timeout(240000)
        });
        const text = await r.text();
        if (!r.ok || !text.trim().startsWith('{')) throw new Error(`${url} -> HTTP ${r.status}`);
        return JSON.parse(text);
      } catch (err) {
        lastErr = err;
        await new Promise(res => setTimeout(res, 5000));
      }
    }
  }
  throw lastErr;
}

const norm = s =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Nomes que não identificam lugar nenhum (quadras numeradas, áreas públicas, etc.)
const JUNK = /^(\d+[a-z]?|apm(\s*-?\s*\d+)?|quadra.*|qd.*|lote.*|area.*|gleba.*|setor \d+|chacara \d+.*|centro|bloco.*|torre \d*|casa.*|predio|edificio|condominio|residencial)$/;
const GENERIC_BUILDING = /^(igreja|escola|colegio|hospital|posto|supermercado|mercado|farmacia|banco|loja|galpao|deposito|ginasio|capela|templo|creche|clinica|policia|delegacia|cmei|ceu|unidade|centro de saude|cais|ubs|upa|predio|bloco|portaria|guarita|garagem)\b/;
const RESIDENTIAL_HINT = /\b(edificio|ed|residencial|residence|condominio|torre|tower|flat|home|living|park|parque|village|ville|garden|jardins?|solar|mansao|palace|plaza|prime|square|boulevard|essence|spazio|vision|life)\b/;

function classifyPlace(t) {
  const n = norm(t.name);
  if (/^(condominio|cond|residencial|alphaville|jardins|village|ville|ecovill|aldeia|portal|reserva|terras|loteamento)\b/.test(n)) return 'condominio';
  return 'bairro';
}

function center(e) {
  if (e.center) return { lat: e.center.lat, lng: e.center.lon };
  if (e.lat !== undefined) return { lat: e.lat, lng: e.lon };
  return null;
}

// Cidade e região aproximadas pelo ponto conhecido mais próximo (bairros de Goiânia do mapa base + centros das cidades)
function locator() {
  const { buildEntries } = require('../src/brain/gazetteer');
  const base = buildEntries();
  const anchors = [
    ...base.bairros.map(b => ({ lat: b.lat, lng: b.lng, city: 'Goiânia', region: b.region })),
    ...base.cidades.filter(c => c.name !== 'Goiânia').map(c => ({ lat: c.lat, lng: c.lng, city: c.name, region: null }))
  ];
  const km = (a, b) => {
    const R = 6371;
    const r = d => (d * Math.PI) / 180;
    const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  return p => {
    let best = null;
    let bd = Infinity;
    for (const a of anchors) {
      const d = km(p, a);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return { city: best ? best.city : null, region: best && best.city === 'Goiânia' && bd <= 3.5 ? best.region : null };
  };
}

function build(raw) {
  const locate = locator();
  const cityOf = new Map(); // "type/id" -> cidade
  for (const [k, data] of Object.entries(raw)) {
    if (!k.startsWith('cidade:') || !data) continue;
    const c = k.slice(7);
    for (const e of data.elements || []) cityOf.set(`${e.type}/${e.id}`, c);
  }
  const out = { fonte: 'OpenStreetMap (ODbL) © colaboradores do OpenStreetMap', geradoEm: new Date().toISOString(), bairros: [], condominios: [], edificios: [] };
  const seen = new Set();
  const push = (list, kind, e, extra = {}) => {
    const name = String(e.tags.name || '').trim().replace(/\s+/g, ' ');
    const n = norm(name);
    if (!n || n.length < 4 || JUNK.test(n)) return;
    const c = center(e);
    if (!c) return;
    const key = `${kind}:${n}`;
    if (seen.has(key)) return;
    seen.add(key);
    const guess = locate(c);
    list.push({ name, city: cityOf.get(`${e.type}/${e.id}`) || guess.city, region: guess.region, lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), ...extra });
  };

  for (const e of (raw.lugares && raw.lugares.elements) || []) {
    if (!e.tags || !e.tags.name) continue;
    if (classifyPlace(e.tags) === 'condominio') push(out.condominios, 'condominio', e);
    else push(out.bairros, 'bairro', e);
  }
  for (const e of (raw.condominios && raw.condominios.elements) || []) {
    if (!e.tags || !e.tags.name) continue;
    push(out.condominios, 'condominio', e);
  }
  for (const e of (raw.edificios && raw.edificios.elements) || []) {
    const t = e.tags || {};
    const n = norm(t.name);
    if (!n || GENERIC_BUILDING.test(n)) continue;
    // só prédios com cara de residencial/comercial nomeado (evita "Bar do Zé" etc.)
    if (!(t.building === 'apartments' || t.building === 'residential' || RESIDENTIAL_HINT.test(n))) continue;
    push(out.edificios, 'edificio', e, { tipo: t.building || null });
  }
  for (const k of ['bairros', 'condominios', 'edificios']) out[k].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return out;
}

async function main(opts = {}) {
  const de = opts.de || arg('--de');
  const saida = opts.saida || arg('--saida') || (process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'mapa-osm.json') : path.join(__dirname, '..', 'src', 'brain', 'data', 'mapa-osm.json'));
  const raw = {};
  if (de) {
    // modo offline: arquivos <chave>.json (lugares.json, condominios.json, edificios*.json, cidade-<Nome>.json)
    for (const f of fs.readdirSync(de).filter(x => x.endsWith('.json'))) {
      const data = JSON.parse(fs.readFileSync(path.join(de, f), 'utf-8'));
      let key = f.replace(/\.json$/, '');
      if (key.startsWith('edificios')) key = 'edificios';
      if (key.startsWith('cidade-')) key = 'cidade:' + key.slice(7).replace(/_/g, ' ');
      if (raw[key] && raw[key].elements) raw[key].elements.push(...(data.elements || []));
      else raw[key] = data;
    }
  } else {
    for (const [k, q] of Object.entries(QUERIES)) {
      process.stdout.write(`Baixando ${k}... `);
      try {
        raw[k] = await overpass(q);
        console.log(`${raw[k].elements.length} itens`);
      } catch (err) {
        console.log(`falhou (${err.message})`);
        if (!k.startsWith('cidade:')) throw err;
      }
    }
  }
  const out = build(raw);
  // não troca um mapa bom por um pior (ex: espelho do Overpass fora do ar)
  try {
    const prev = JSON.parse(fs.readFileSync(saida, 'utf-8'));
    if (out.bairros.length < prev.bairros.length * 0.7) throw new Error(`mapa novo menor que o atual (${out.bairros.length} < ${prev.bairros.length}); mantendo o atual`);
  } catch (err) {
    if (/mantendo/.test(err.message)) throw err;
  }
  fs.mkdirSync(path.dirname(saida), { recursive: true });
  const tmp = `${saida}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(out));
  fs.renameSync(tmp, saida);
  console.log(`✅ ${out.bairros.length} bairros, ${out.condominios.length} condomínios, ${out.edificios.length} edifícios -> ${saida}`);
  return { bairros: out.bairros.length, condominios: out.condominios.length, edificios: out.edificios.length };
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌', err.message);
    process.exit(1);
  });
}

module.exports = { build, norm, main };
