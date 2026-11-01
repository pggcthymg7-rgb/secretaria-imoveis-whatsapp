/**
 * RADAR DE BUSCAS: guarda todo pedido detectado nos grupos (com ou sem imóvel compatível).
 * Serve para: histórico no painel, aprovação rápida pelo WhatsApp ("ENVIAR A12 30"),
 * resumo diário e inteligência de demanda (o que mais pedem = o que captar).
 */
const { readJson, writeJson } = require('./store');

const FILE = 'radar.json';
const MAX = 800;
let items = readJson(FILE, []);
if (!Array.isArray(items)) items = [];
let seq = items.reduce((m, i) => Math.max(m, Number(String(i.code || '').replace(/\D/g, '')) || 0), 0);
let timer = null;

function persist() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try {
      writeJson(FILE, items);
    } catch (err) {
      console.error('[RADAR] erro ao salvar:', err.message);
    }
  }, 1000);
  if (timer.unref) timer.unref();
}

function add(entry) {
  seq = (seq % 999) + 1;
  const item = { code: `A${seq}`, ts: Date.now(), ...entry };
  items.unshift(item);
  if (items.length > MAX) items.length = MAX;
  persist();
  return item;
}

function update(code, patch) {
  const it = items.find(i => i.code === String(code).toUpperCase());
  if (it) {
    Object.assign(it, patch);
    persist();
  }
  return it;
}

function get(code) {
  const c = String(code || '').toUpperCase();
  // só códigos das últimas 48h valem para aprovação
  return items.find(i => i.code === c && Date.now() - i.ts < 48 * 3600 * 1000) || null;
}

function list({ limit = 200, decision } = {}) {
  return items.filter(i => !decision || i.decision === decision).slice(0, limit);
}

function since(ms) {
  return items.filter(i => i.ts >= ms);
}

/** Demanda agregada dos últimos N dias: tipos, bairros/regiões e faixas de preço mais pedidos */
function demand(days = 30) {
  const from = Date.now() - days * 86400000;
  const tipos = {};
  const locais = {};
  const faixas = {};
  let total = 0;
  for (const i of items) {
    if (i.ts < from) continue;
    total++;
    for (const t of i.tipos || []) tipos[t] = (tipos[t] || 0) + 1;
    for (const l of i.locais || []) locais[l] = (locais[l] || 0) + 1;
    if (i.valorMax) {
      const f = i.valorMax <= 300000 ? 'até 300 mil' : i.valorMax <= 600000 ? '300–600 mil' : i.valorMax <= 1000000 ? '600 mil–1 mi' : 'acima de 1 mi';
      faixas[f] = (faixas[f] || 0) + 1;
    }
  }
  const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([nome, qtd]) => ({ nome, qtd }));
  return { total, tipos: top(tipos), locais: top(locais), faixas: top(faixas) };
}

function flush() {
  writeJson(FILE, items);
}

module.exports = { add, update, get, list, since, demand, flush };
