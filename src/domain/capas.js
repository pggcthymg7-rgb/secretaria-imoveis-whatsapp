/**
 * ============================================================================
 * CAPAS & CARROSSEL — Modelos do Studio Visual (Schema JSON v1)
 * ============================================================================
 * Persistência e sanitização estrita em lista branca para os modelos salvos
 * pelo corretor (até 10 slides por carrossel e todos os 10 tipos de camada).
 * Compatibilidade retroativa total com capas.json legado (sem slides) e
 * proteção anti-prototype pollution.
 * ============================================================================
 */
const crypto = require('crypto');
const { readJson, writeJson } = require('../config/store');

const FILE = 'capas.json';
const MAX_MODELOS = 40;
const MAX_SLIDES = 10;
const MAX_CAMADAS = 40;
const MAX_LOGO = 400 * 1024; // caracteres do data: (~300 KB de imagem)
const TAMANHOS = {
  feed: [1080, 1350],
  quadrado: [1080, 1080],
  story: [1080, 1920]
};
const TIPOS = ['foto', 'texto', 'retangulo', 'circulo', 'linha', 'degrade', 'poligono', 'icone', 'logo', 'qrcode'];
const ALINHA = ['left', 'center', 'right'];
const FORMAS_FUNDO_ICONE = ['nenhum', 'circulo', 'quadrado', 'pilula'];
const FORMAS_LOGO = ['quadrado', 'circulo', 'retangulo', 'nenhum'];
const ORIGENS_LOGO = ['kit', 'custom'];
const ORIGENS_QR = ['whatsapp', 'custom'];
const PONTAS_LINHA = ['butt', 'round', 'square'];
const TIPOS_SLIDE = ['capa', 'conteudo', 'galeria', 'contato', 'custom'];

const ICONES_PERMITIDOS = new Set([
  'quarto', 'banheiro', 'suite', 'vaga', 'area', 'terreno', 'pin', 'casa',
  'predio', 'chave', 'sol', 'piscina', 'estrela', 'check', 'whatsapp',
  'telefone', 'seta', 'selo-exclusivo', 'selo-novo', 'selo-vendido',
  'selo-oportunidade', 'switch-on', 'switch-off'
]);

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const hasOwn = (obj, k) => Boolean(obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, k));

const isForbiddenKey = k => {
  if (k === undefined || k === null) return false;
  return FORBIDDEN_KEYS.has(String(k).trim().toLowerCase());
};

/** Remove recursivamente chaves perigosas (__proto__, constructor, prototype) de qualquer objeto de entrada */
function sanitizarObjeto(val, depth = 0) {
  if (depth > 8 || val === null || val === undefined) return val;
  if (typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(item => sanitizarObjeto(item, depth + 1));
  const out = {};
  for (const k of Object.keys(val)) {
    if (isForbiddenKey(k)) continue;
    out[k] = sanitizarObjeto(val[k], depth + 1);
  }
  return out;
}

const num = (v, min, max, padrao) => {
  if (v === '' || v === null || v === undefined || typeof v === 'boolean') return padrao;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
};

const cor = (v, padrao = '#ffffff') => (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(String(v || '').trim()) ? String(v).trim().toLowerCase() : padrao);

const texto = (v, max = 300) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F<>]/g, '').slice(0, max);

const fonte = v => (/^[A-Za-z0-9][A-Za-z0-9 ]{0,60}$/.test(String(v || '')) ? String(v) : 'Inter');

const id = v => {
  const s = String(v ?? '').trim();
  if (!s || isForbiddenKey(s) || !/^[a-z0-9_-]{1,40}$/i.test(s)) {
    return crypto.randomBytes(5).toString('hex');
  }
  return s;
};

const raios4 = (arr, max = 3000) => {
  if (!Array.isArray(arr) || arr.length !== 4) return null;
  return arr.map(v => num(v, 0, max, 0));
};

const safeDataImage = v => {
  const s = String(v || '').trim();
  if (!s || s.length > MAX_LOGO) return '';
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s) ? s : '';
};

const safeFotoCustom = v => {
  const data = safeDataImage(v);
  if (data) return data;
  const s = String(v || '').trim();
  if (!s || s.includes('..')) return '';
  if (/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}\.(?:jpe?g|png|webp)$/i.test(s)) return s;
  return '';
};

const safeUrlHttps = v => {
  const s = String(v || '').trim();
  if (!s) return '';
  return /^https:\/\/[^\s"'<>\\]{1,500}$/i.test(s) ? s : '';
};

const safePapelCor = v => {
  const s = String(v || '').trim();
  if (!s || isForbiddenKey(s)) return '';
  return /^[a-z0-9_-]{1,30}$/i.test(s) ? s : '';
};

const safeModeloBase = v => {
  const s = String(v || '').trim();
  if (!s || isForbiddenKey(s)) return '';
  return /^[a-z0-9_-]{1,60}$/i.test(s) ? s : '';
};

/** Uma camada vinda do navegador -> camada limpa (só campos conhecidos, números dentro de faixas) */
function limparCamada(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const c = sanitizarObjeto(raw);
  if (!TIPOS.includes(c.tipo)) return null;

  const base = {
    id: id(hasOwn(c, 'id') ? c.id : undefined),
    tipo: c.tipo,
    nome: texto(c.nome, 40),
    x: num(c.x, -4000, 6000, 0),
    y: num(c.y, -4000, 6000, 0),
    w: num(c.w, 1, 6000, 100),
    h: num(c.h, 1, 6000, 100),
    rot: num(c.rot, -360, 360, 0),
    skewX: num(c.skewX, -60, 60, 0),
    skewY: num(c.skewY, -60, 60, 0),
    opacidade: num(c.opacidade, 0, 1, 1),
    visivel: c.visivel !== false,
    travada: Boolean(c.travada)
  };

  const papel = safePapelCor(c.papelCor);
  if (papel) base.papelCor = papel;

  if (Array.isArray(c.matrix) && c.matrix.length === 6 && c.matrix.every(v => typeof v === 'number' && Number.isFinite(v))) {
    base.matrix = c.matrix.map(v => Math.round(v * 100000) / 100000);
  }

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
      indiceFoto: Math.round(num(c.indiceFoto, 0, 30, 0)),
      borda: num(c.borda, 0, 80, 0),
      corBorda: cor(c.corBorda, '#ffffff'),
      fotoCustom: safeFotoCustom(c.fotoCustom)
    });
    const r4 = raios4(c.raios, 2000);
    if (r4) base.raios = r4;
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
      autoFit: Boolean(c.autoFit),
      sombra: num(c.sombra, 0, 80, 0),
      corSombra: cor(c.corSombra, '#000000'),
      contorno: num(c.contorno, 0, 40, 0),
      corContorno: cor(c.corContorno, '#000000'),
      fundo: Boolean(c.fundo),
      corFundo: cor(c.corFundo, '#5266eb'),
      raioFundo: num(c.raioFundo, 0, 300, 24),
      folga: num(c.folga, 0, 200, 24),
      bordaFundo: num(c.bordaFundo, 0, 40, 0),
      corBordaFundo: cor(c.corBordaFundo, '#ffffff')
    });
    const prev = texto(c.campoVinculadoAnterior, 120).trim();
    if (prev) base.campoVinculadoAnterior = prev;
  } else if (c.tipo === 'retangulo') {
    Object.assign(base, {
      cor: cor(c.cor, '#5266eb'),
      raio: num(c.raio, 0, 3000, 0),
      borda: num(c.borda, 0, 80, 0),
      corBorda: cor(c.corBorda, '#ffffff'),
      blurFundo: num(c.blurFundo, 0, 40, 0),
      strokeScaleEnabled: Boolean(c.strokeScaleEnabled)
    });
    const r4 = raios4(c.raios, 3000);
    if (r4) base.raios = r4;
  } else if (c.tipo === 'circulo') {
    Object.assign(base, {
      cor: cor(c.cor, '#5266eb'),
      borda: num(c.borda, 0, 80, 0),
      corBorda: cor(c.corBorda, '#ffffff'),
      strokeScaleEnabled: Boolean(c.strokeScaleEnabled)
    });
  } else if (c.tipo === 'linha') {
    let pontos = [0, Math.round(base.h / 2), base.w, Math.round(base.h / 2)];
    if (Array.isArray(c.pontos) && c.pontos.length >= 4) {
      const pts = c.pontos.slice(0, 20).map(v => num(v, -6000, 6000, 0));
      if (pts.length % 2 !== 0) pts.pop();
      if (pts.length >= 4) pontos = pts;
    }
    let tracejado = false;
    if (Array.isArray(c.tracejado)) {
      const dash = c.tracejado.slice(0, 6).map(v => num(v, 1, 200, 8));
      tracejado = dash.length >= 2 ? dash : false;
    } else {
      tracejado = Boolean(c.tracejado);
    }
    Object.assign(base, {
      pontos,
      cor: cor(c.cor, '#ffffff'),
      espessura: num(c.espessura, 0.5, 80, 4),
      tracejado,
      ponta: PONTAS_LINHA.includes(c.ponta) ? c.ponta : 'round'
    });
  } else if (c.tipo === 'degrade') {
    Object.assign(base, {
      cor1: cor(c.cor1, '#00000000'),
      cor2: cor(c.cor2, '#000000e6'),
      angulo: num(c.angulo, 0, 360, 180),
      raio: num(c.raio, 0, 3000, 0)
    });
    const r4 = raios4(c.raios, 3000);
    if (r4) base.raios = r4;
  } else if (c.tipo === 'poligono') {
    let vertices = [
      { x: 0, y: 0 },
      { x: base.w, y: 0 },
      { x: base.w, y: base.h },
      { x: 0, y: base.h }
    ];
    if (Array.isArray(c.vertices) && c.vertices.length >= 3) {
      const norm = c.vertices.slice(0, 12).map(v => {
        if (Array.isArray(v)) return { x: num(v[0], -6000, 6000, 0), y: num(v[1], -6000, 6000, 0) };
        if (v && typeof v === 'object') return { x: num(v.x, -6000, 6000, 0), y: num(v.y, -6000, 6000, 0) };
        return { x: 0, y: 0 };
      });
      if (norm.length >= 3) vertices = norm;
    }
    Object.assign(base, {
      vertices,
      cor: cor(c.cor, '#5266eb'),
      borda: num(c.borda, 0, 80, 0),
      corBorda: cor(c.corBorda, '#ffffff'),
      strokeScaleEnabled: Boolean(c.strokeScaleEnabled)
    });
  } else if (c.tipo === 'icone') {
    const icId = typeof c.iconeId === 'string' && ICONES_PERMITIDOS.has(c.iconeId) ? c.iconeId : 'estrela';
    Object.assign(base, {
      iconeId: icId,
      cor: cor(c.cor, '#ffffff'),
      corFundo: cor(c.corFundo, '#5266eb'),
      formaFundo: FORMAS_FUNDO_ICONE.includes(c.formaFundo) ? c.formaFundo : 'nenhum',
      folga: num(c.folga, 0, 200, 12),
      bordaFundo: num(c.bordaFundo, 0, 40, 0),
      corBordaFundo: cor(c.corBordaFundo, '#ffffff')
    });
  } else if (c.tipo === 'logo') {
    const origem = c.origem === 'kit' ? 'kit' : (ORIGENS_LOGO.includes(c.origem) ? c.origem : 'custom');
    const src = safeDataImage(c.src);
    // Custom (e legado sem origem:'kit') exige data:image válido; origem:'kit' aceita sem src
    if (origem === 'custom' && !src) return null;
    Object.assign(base, {
      origem,
      forma: FORMAS_LOGO.includes(c.forma) ? c.forma : 'quadrado',
      raio: num(c.raio, 0, 1000, 16),
      corFundo: cor(c.corFundo, '#5266eb'),
      corTexto: cor(c.corTexto, '#ffffff'),
      src: origem === 'kit' ? src : src
    });
  } else if (c.tipo === 'qrcode') {
    Object.assign(base, {
      origem: ORIGENS_QR.includes(c.origem) ? c.origem : 'whatsapp',
      url: safeUrlHttps(c.url),
      corEscuro: cor(c.corEscuro, '#171721'),
      corClaro: cor(c.corClaro, '#ffffff'),
      raio: num(c.raio, 0, 200, 12),
      margem: num(c.margem, 0, 20, 2)
    });
  }
  return base;
}

function limparSlide(rawSlide, idx, fallbackFundo) {
  const sl = rawSlide && typeof rawSlide === 'object' && !Array.isArray(rawSlide) ? sanitizarObjeto(rawSlide) : {};
  const slideId = hasOwn(sl, 'id') && !isForbiddenKey(sl.id) && /^[a-z0-9_-]{1,40}$/i.test(String(sl.id || ''))
    ? String(sl.id)
    : `s${idx + 1}`;
  const nome = texto(sl.nome, 60).trim() || (idx === 0 ? 'Capa' : `Slide ${idx + 1}`);
  const tipo = TIPOS_SLIDE.includes(sl.tipo) ? sl.tipo : (idx === 0 ? 'capa' : 'custom');
  const fundo = cor(sl.fundo, fallbackFundo);
  const camadas = (Array.isArray(sl.camadas) ? sl.camadas : []).slice(0, MAX_CAMADAS).map(limparCamada).filter(Boolean);
  return { id: slideId, nome, tipo, fundo, camadas };
}

function limparModelo(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw Object.assign(new Error('Modelo inválido.'), { status: 400 });
  }
  if (hasOwn(raw, 'id') && isForbiddenKey(raw.id)) {
    throw Object.assign(new Error('ID inválido.'), { status: 400 });
  }
  const m = sanitizarObjeto(raw);
  const rawTam = hasOwn(TAMANHOS, m.tamanho) ? m.tamanho : (hasOwn(TAMANHOS, m.formato) ? m.formato : 'feed');
  const tamanho = hasOwn(TAMANHOS, rawTam) ? rawTam : 'feed';
  const [largura, altura] = TAMANHOS[tamanho];
  const fundoRaiz = cor(m.fundo, '#171721');

  let slides;
  if (Array.isArray(m.slides) && m.slides.length) {
    slides = m.slides.slice(0, MAX_SLIDES).map((sl, idx) => limparSlide(sl, idx, fundoRaiz));
  } else {
    const camadasLegado = (Array.isArray(m.camadas) ? m.camadas : []).slice(0, MAX_CAMADAS).map(limparCamada).filter(Boolean);
    slides = [{
      id: 's1',
      nome: 'Capa',
      tipo: 'capa',
      fundo: fundoRaiz,
      camadas: camadasLegado
    }];
  }

  if (!slides.length || !slides.some(sl => sl.camadas.length > 0)) {
    throw Object.assign(new Error('O modelo precisa de pelo menos uma camada.'), { status: 400 });
  }

  const paleta = (Array.isArray(m.paleta) ? m.paleta : []).slice(0, 12).map(x => cor(x, '')).filter(Boolean);
  const modeloBase = safeModeloBase(m.modeloBase);
  const atualizadoEm = typeof m.atualizadoEm === 'string' && !Number.isNaN(Date.parse(m.atualizadoEm))
    ? m.atualizadoEm
    : new Date().toISOString();

  return {
    id: id(hasOwn(m, 'id') ? m.id : undefined),
    nome: texto(m.nome, 60).trim() || 'Meu modelo',
    tamanho,
    largura,
    altura,
    fundo: slides[0].fundo,
    camadas: slides[0].camadas.map(c => ({ ...c })),
    slides,
    paleta,
    modeloBase: modeloBase || null,
    padrao: Boolean(m.padrao),
    atualizadoEm
  };
}

/** Normaliza estado completo de capas.json (incluindo migração automática de modelos legados sem slides) */
function normalizarEstado(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { modelos: [], padrao: null };
  }
  const limpo = sanitizarObjeto(raw);
  const listaRaw = Array.isArray(limpo.modelos) ? limpo.modelos.slice(0, MAX_MODELOS) : [];
  const modelos = [];
  for (const item of listaRaw) {
    try {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      if (hasOwn(item, 'id') && isForbiddenKey(item.id)) continue;
      modelos.push(limparModelo(item));
    } catch {
      // ignora entrada corrompida sem impedir boot
    }
  }
  let padrao = null;
  if (typeof limpo.padrao === 'string' && !isForbiddenKey(limpo.padrao) && modelos.some(m => m.id === limpo.padrao)) {
    padrao = limpo.padrao;
  } else {
    const marcado = modelos.find(m => m.padrao === true);
    if (marcado) padrao = marcado.id;
  }
  for (const mod of modelos) {
    mod.padrao = padrao === mod.id;
  }
  return { modelos, padrao };
}

let state = normalizarEstado(readJson(FILE, {}));

function syncPadrao() {
  for (const mod of state.modelos) {
    mod.padrao = state.padrao === mod.id;
  }
}

function listar() {
  state = normalizarEstado(state);
  return { modelos: state.modelos, padrao: state.padrao, tamanhos: TAMANHOS };
}

function salvar(entrada) {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    throw Object.assign(new Error('Modelo inválido.'), { status: 400 });
  }
  if (hasOwn(entrada, 'id') && isForbiddenKey(entrada.id)) {
    throw Object.assign(new Error('ID inválido.'), { status: 400 });
  }

  const clean = sanitizarObjeto(entrada);

  // Operações parciais por ID (renomear ou alterar padrão sem reenviar camadas)
  if (hasOwn(clean, 'id') && typeof clean.id === 'string' && clean.id.trim()) {
    const idx = state.modelos.findIndex(x => x.id === clean.id);
    if (hasOwn(clean, 'renomear') && clean.renomear !== false && clean.renomear !== undefined) {
      if (idx < 0) throw Object.assign(new Error('Modelo não encontrado.'), { status: 404 });
      const rawNovoNome = typeof clean.renomear === 'string' ? clean.renomear : clean.nome;
      const novoNome = texto(rawNovoNome, 60).trim();
      if (!novoNome) throw Object.assign(new Error('Nome inválido.'), { status: 400 });
      const atualizado = limparModelo({
        ...state.modelos[idx],
        nome: novoNome,
        atualizadoEm: new Date().toISOString()
      });
      state.modelos[idx] = atualizado;
      if (clean.padrao === true) state.padrao = atualizado.id;
      else if (clean.padrao === false && state.padrao === atualizado.id) state.padrao = null;
      syncPadrao();
      writeJson(FILE, state);
      return state.modelos[idx];
    }

    if (typeof clean.padrao === 'boolean' && !hasOwn(clean, 'camadas') && !hasOwn(clean, 'slides')) {
      if (idx < 0) throw Object.assign(new Error('Modelo não encontrado.'), { status: 404 });
      if (clean.padrao) state.padrao = state.modelos[idx].id;
      else if (state.padrao === state.modelos[idx].id) state.padrao = null;
      state.modelos[idx].atualizadoEm = new Date().toISOString();
      syncPadrao();
      writeJson(FILE, state);
      return state.modelos[idx];
    }
  }

  const m = limparModelo({ ...clean, atualizadoEm: new Date().toISOString() });
  const i = state.modelos.findIndex(x => x.id === m.id);
  if (i >= 0) {
    state.modelos[i] = m;
  } else {
    if (state.modelos.length >= MAX_MODELOS) {
      throw Object.assign(new Error(`Limite de ${MAX_MODELOS} modelos. Apague um antes.`), { status: 400 });
    }
    state.modelos.push(m);
  }

  if (clean.padrao === true) state.padrao = m.id;
  else if (clean.padrao === false && state.padrao === m.id) state.padrao = null;

  syncPadrao();
  writeJson(FILE, state);
  return m;
}

function apagar(modeloId) {
  const sid = String(modeloId ?? '');
  if (!sid || isForbiddenKey(sid)) return false;
  const antes = state.modelos.length;
  const padraoAntes = state.padrao;
  state.modelos = state.modelos.filter(x => x.id !== sid);
  if (state.padrao === sid) state.padrao = null;
  syncPadrao();
  const mudou = antes !== state.modelos.length || padraoAntes !== state.padrao;
  if (mudou) writeJson(FILE, state);
  return antes !== state.modelos.length;
}

module.exports = {
  TAMANHOS,
  MAX_SLIDES,
  TIPOS,
  ICONES_PERMITIDOS,
  limparCamada,
  limparModelo,
  normalizarEstado,
  listar,
  salvar,
  apagar
};
