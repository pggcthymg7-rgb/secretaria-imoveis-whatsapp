/** Contadores diários (para o painel e o resumo diário) */
const { readJson, writeJson } = require('./store');

const FILE = 'metricas.json';
let data = readJson(FILE, {});
let timer = null;

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function inc(name, n = 1) {
  if (typeof name !== 'string' || !name || UNSAFE_KEYS.has(name) || !Number.isFinite(Number(n))) return;
  const d = today();
  if (!Object.hasOwn(data, d) || !data[d] || typeof data[d] !== 'object') data[d] = {};
  data[d][name] = (data[d][name] || 0) + Number(n);
  const keys = Object.keys(data).sort();
  while (keys.length > 60) delete data[keys.shift()];
  if (!timer) {
    timer = setTimeout(() => {
      timer = null;
      try {
        writeJson(FILE, data);
      } catch {}
    }, 1500);
    if (timer.unref) timer.unref();
  }
}

function getDay(d = today()) {
  return { ...(data[d] || {}) };
}

function lastDays(n = 7) {
  return Object.keys(data).sort().slice(-n).map(d => ({ dia: d, ...data[d] }));
}

function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  try {
    writeJson(FILE, data);
  } catch {}
}

module.exports = { inc, getDay, lastDays, today, flush };
