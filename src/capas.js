/**
 * ============================================================================
 * CAPAS (beta) — modelos do editor de capas para o Instagram
 * ============================================================================
 * O editor roda no navegador (src/public/capas.js, canvas). Aqui só guardamos os
 * MODELOS que o corretor cria ("Meu modelo"), para aplicar em outros imóveis.
 * Cada modelo = tamanho da arte + lista de camadas (foto, texto, retângulo, degradê, logo).
 * Tudo é validado campo a campo (lista branca): nada de HTML, nada de URL externa,
 * logo só como imagem data: pequena.
 * ============================================================================
 */
const crypto = require('crypto');
const { readJson, writeJson } = require('./store');

const FILE = 'capas.json';
const MAX_MODELOS = 40;
const MAX_CAMADAS = 40;
const MAX_LOGO = 400 * 1024; // caracteres do data: (~300 KB de imagem)
const TAMANHOS = { feed: [1080, 1350], quadrado: [1080, 1080], story: [1080, 1920] };
const TIPOS = ['foto', 'texto', 'retangulo', 'degrade', 'logo'];
const ALINHA = ['left', 'center', 'right'];

const num = (v, min, max, padrao) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
};
const cor = (v, padrao = '#ffffff') => (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(String(v || '')) ? String(v).toLowerCase() : padrao);
const texto = (v, max = 300) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F<>]/g, '').slice(0, max);
const fonte = v => (/^[A-Za-z0-9][A-Za-z0-9 ]{0,60}$/.test(String(v || '')) ? String(v) : 'Inter');
const id = v => (/^[a-z0-9_-]{1,40}$/i.test(String(v || '')) ? String(v) : crypto.randomBytes(5).toString('hex'));

/** Uma camada vinda do navegador -> camada limpa (só campos conhecidos, números dentro de faixas) */
function limparCamada(c) {
  if (!c || typeof c !== 'object' || !TIPOS.includes(c.tipo)) return null;
  const base = {
    id: id(c.id),
    tipo: c.tipo,
    nome: texto(c.nome, 40),
    x: num(c.x, -4000, 6000, 0),
    y: num(c.y, -4000, 6000, 0),
    w: num(c.w, 1, 6000, 100),
    h: num(c.h, 1, 6000, 100),
    rot: num(c.rot, -360, 360, 0),
    opacidade: num(c.opacidade, 0, 1, 1),
    visivel: c.visivel !== false,
    travada: Boolean(c.travada)
  };
  if (c.tipo === 'foto') {
    Object.assign(base, {
      zoom: num(c.zoom, 0.2, 6, 1),
      offX: num(c.offX, -1, 1, 0),
      offY: num(c.offY, -1, 1, 0),
      brilho: num(c.brilho, 0, 300, 100),
      contraste: num(c.contraste, 0, 300, 100),
      saturacao: num(c.saturacao, 0, 300, 100),
      desfoque: num(c.desfoque, 0, 40, 0),
      raio: num(c.raio, 0, 2000, 0),
      indiceFoto: Math.round(num(c.indiceFoto, 0, 30, 0))
    });
  } else if (c.tipo === 'texto') {
    Object.assign(base, {
      texto: texto(c.texto, 600),
      fonte: fonte(c.fonte),
      peso: Math.round(num(c.peso, 100, 900, 700) / 100) * 100,
      italico: Boolean(c.italico),
      tamanho: num(c.tamanho, 6, 600, 72),
      cor: cor(c.cor, '#ffffff'),
      alinhamento: ALINHA.includes(c.alinhamento) ? c.alinhamento : 'left',
      ancora: c.ancora === 'base' ? 'base' : 'topo',
      espacamento: num(c.espacamento, -20, 100, 0),
      entrelinha: num(c.entrelinha, 0.6, 3, 1.15),
      escalaX: num(c.escalaX, 0.1, 5, 1),
      escalaY: num(c.escalaY, 0.1, 5, 1),
      maiusculas: Boolean(c.maiusculas),
      sombra: num(c.sombra, 0, 80, 0),
      corSombra: cor(c.corSombra, '#000000'),
      contorno: num(c.contorno, 0, 40, 0),
      corContorno: cor(c.corContorno, '#000000'),
      fundo: Boolean(c.fundo),
      corFundo: cor(c.corFundo, '#5266eb'),
      raioFundo: num(c.raioFundo, 0, 300, 24),
      folga: num(c.folga, 0, 200, 24)
    });
  } else if (c.tipo === 'retangulo') {
    Object.assign(base, { cor: cor(c.cor, '#5266eb'), raio: num(c.raio, 0, 3000, 0), borda: num(c.borda, 0, 80, 0), corBorda: cor(c.corBorda, '#ffffff') });
  } else if (c.tipo === 'degrade') {
    Object.assign(base, { cor1: cor(c.cor1, '#00000000'), cor2: cor(c.cor2, '#000000e6'), angulo: num(c.angulo, 0, 360, 180) });
  } else if (c.tipo === 'logo') {
    const src = String(c.src || '');
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src) || src.length > MAX_LOGO) return null;
    Object.assign(base, { src });
  }
  return base;
}

function limparModelo(m) {
  if (!m || typeof m !== 'object') throw Object.assign(new Error('Modelo inválido.'), { status: 400 });
  const tamanho = Object.prototype.hasOwnProperty.call(TAMANHOS, m.tamanho) ? m.tamanho : 'feed';
  const camadas = (Array.isArray(m.camadas) ? m.camadas : []).slice(0, MAX_CAMADAS).map(limparCamada).filter(Boolean);
  if (!camadas.length) throw Object.assign(new Error('O modelo precisa de pelo menos uma camada.'), { status: 400 });
  const paleta = (Array.isArray(m.paleta) ? m.paleta : []).slice(0, 12).map(x => cor(x, '')).filter(Boolean);
  return { id: id(m.id), nome: texto(m.nome, 60).trim() || 'Meu modelo', tamanho, fundo: cor(m.fundo, '#171721'), camadas, paleta, atualizadoEm: new Date().toISOString() };
}

let state = { modelos: [], padrao: null, ...readJson(FILE, {}) };
if (!Array.isArray(state.modelos)) state.modelos = [];

function listar() {
  return { modelos: state.modelos, padrao: state.padrao, tamanhos: TAMANHOS };
}

function salvar(entrada) {
  const m = limparModelo(entrada);
  const i = state.modelos.findIndex(x => x.id === m.id);
  if (i >= 0) state.modelos[i] = m;
  else {
    if (state.modelos.length >= MAX_MODELOS) throw Object.assign(new Error(`Limite de ${MAX_MODELOS} modelos. Apague um antes.`), { status: 400 });
    state.modelos.push(m);
  }
  if (entrada.padrao) state.padrao = m.id;
  writeJson(FILE, state);
  return m;
}

function apagar(modeloId) {
  const antes = state.modelos.length;
  state.modelos = state.modelos.filter(x => x.id !== String(modeloId));
  if (state.padrao === String(modeloId)) state.padrao = null;
  writeJson(FILE, state);
  return antes !== state.modelos.length;
}

module.exports = { TAMANHOS, limparCamada, limparModelo, listar, salvar, apagar };
