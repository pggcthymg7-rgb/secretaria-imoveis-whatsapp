'use strict';
/**
 * Persistência e sanitização estrita (lista branca Schema JSON v1) dos modelos próprios de PDF 16:9.
 * Armazenamento atômico em `pdf_modelos.json` via `config/store.js` (isolado por DATA_DIR / MULTI_TENANT=1).
 */
const crypto = require('crypto');
const path = require('path');
const { readJson, writeJson } = require('../config/store');
const { ICONES_SVG } = require('../pdf/deck16x9/icones');

const FILE = 'pdf_modelos.json';
const MAX_MODELOS = 40;
const MAX_SLIDES = 14;
const MAX_CAMADAS = 60;
const MAX_DATA_IMAGE = 400 * 1024;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const TIPOS_CAMADA = new Set(['foto', 'texto', 'retangulo', 'circulo', 'linha', 'degrade', 'poligono', 'icone', 'logo', 'qrcode']);
const TIPOS_SLIDE = new Set(['capa', 'resumo', 'foto', 'galeria', 'texto', 'contato', 'livre', 'custom']);
const ALINHAMENTOS = new Set(['left', 'center', 'right']);
const ANCORAS = new Set(['topo', 'base']);
const FORMAS_FUNDO_ICONE = new Set(['nenhum', 'circulo', 'quadrado', 'pilula']);
const FORMAS_LOGO = new Set(['quadrado', 'circulo', 'nenhum']);
const PONTAS_LINHA = new Set(['round', 'butt', 'square']);
const MODELOS_BASE = new Set([
  'A', 'B', 'D', 'E', 'F',
  'arquitetura-suica', 'revista-atelier', 'vitrine-fosca', 'traco-fino',
  'noite-dourada', 'essencia-moderna', 'visao-glass', 'galeria-prive',
  'manchete-nobre', 'assinatura-classica', 'faixa-imperial', 'moldura-serena'
]);

const num = (v, min, max, padrao) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
};

const cor = (v, padrao = '#ffffff') => {
  const s = String(v ?? '').trim();
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s) ? s.toLowerCase() : padrao;
};

const texto = (v, max = 300) =>
  String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F<>]/g, '').slice(0, max);

const fonte = v => {
  const s = String(v ?? '').trim();
  return /^[A-Za-z0-9 ]{1,60}$/.test(s) ? s : 'Jost';
};

const limparId = (v, fallbackPrefix = 'id') => {
  const s = String(v ?? '').trim();
  if (!s || FORBIDDEN_KEYS.has(s) || !/^[A-Za-z0-9_-]{1,64}$/.test(s)) {
    return `${fallbackPrefix}_${crypto.randomBytes(5).toString('hex')}`;
  }
  return s;
};

function limparMatrix(m) {
  if (!Array.isArray(m) || m.length !== 6) return undefined;
  const out = [];
  for (const v of m) {
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    out.push(Math.min(1e6, Math.max(-1e6, Math.round(n * 100000) / 100000)));
  }
  return out;
}

function limparRaios(c) {
  if (!Array.isArray(c.raios) || c.raios.length !== 4) return undefined;
  return c.raios.map(v => num(v, 0, 2000, 0));
}

function limparVertices(vertices, w, h) {
  if (Array.isArray(vertices) && vertices.length >= 3) {
    const out = [];
    for (const v of vertices.slice(0, 16)) {
      if (Array.isArray(v) && v.length >= 2) {
        out.push({ x: num(v[0], -6000, 6000, 0), y: num(v[1], -6000, 6000, 0) });
      } else if (v && typeof v === 'object') {
        out.push({ x: num(v.x, -6000, 6000, 0), y: num(v.y, -6000, 6000, 0) });
      }
    }
    if (out.length >= 3) return out;
  }
  return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
}

function limparDataImage(src) {
  if (typeof src !== 'string') return undefined;
  const s = src.trim();
  if (!s || s.length > MAX_DATA_IMAGE) return undefined;
  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(s)) return s;
  return undefined;
}

function limparFotoCustom(val) {
  if (typeof val !== 'string') return undefined;
  const s = val.trim();
  if (!s) return undefined;
  const dataUri = limparDataImage(s);
  if (dataUri) return dataUri;
  // Permite referência segura a arquivo em /fotos/ ou nome simples de arquivo
  const limpo = s.startsWith('/fotos/') ? s.slice('/fotos/'.length) : s;
  let dec = limpo;
  try { dec = decodeURIComponent(limpo); } catch {}
  if (dec.includes('..') || dec.includes('/') || dec.includes('\\') || dec.startsWith('.')) return undefined;
  const base = path.basename(dec);
  if (/^[A-Za-z0-9._-]+\.(jpe?g|png|webp)$/i.test(base)) {
    return s.startsWith('/fotos/') ? `/fotos/${base}` : base;
  }
  return undefined;
}

function limparTelemetria(t) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return undefined;
  const out = {};
  if (Array.isArray(t.lines)) {
    out.lines = t.lines.slice(0, 200).map(l => texto(l, 2000));
  }
  if (t.baselineShift === null || t.baselineShift === undefined) {
    out.baselineShift = null;
  } else {
    const bs = Number(t.baselineShift);
    out.baselineShift = Number.isFinite(bs) ? Math.min(2000, Math.max(-2000, bs)) : null;
  }
  if (t.textTop !== undefined) out.textTop = num(t.textTop, -2000, 2000, 0);
  if (t.textLeft !== undefined) out.textLeft = num(t.textLeft, -2000, 2000, 0);
  if (t.tamanhoEfetivo !== undefined) out.tamanhoEfetivo = num(t.tamanhoEfetivo, 4, 1000, 40);
  if (typeof t.textoResolvido === 'string') out.textoResolvido = texto(t.textoResolvido, 20000);
  const tm = limparMatrix(t.textMatrix);
  if (tm) out.textMatrix = tm;
  return out;
}

function limparUrlQr(url) {
  if (typeof url !== 'string') return '';
  const s = url.trim().slice(0, 500);
  if (!s) return '';
  return /^https?:\/\/[^\s<>'"]+$/i.test(s) ? s : '';
}

/**
 * Sanitiza uma camada individual do Schema JSON v1 por lista branca.
 */
function limparCamada(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c) || !TIPOS_CAMADA.has(c.tipo)) return null;

  const base = {
    id: limparId(c.id, 'cam'),
    tipo: c.tipo,
    nome: texto(c.nome || c.tipo, 60),
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
  const mat = limparMatrix(c.matrix);
  if (mat) base.matrix = mat;

  if (c.tipo === 'foto') {
    base.indiceFoto = Math.round(num(c.indiceFoto, 0, 30, 0));
    const fc = limparFotoCustom(c.fotoCustom);
    if (fc) base.fotoCustom = fc;
    base.zoom = num(c.zoom, 0.2, 6, 1);
    base.offX = num(c.offX, -1, 1, 0);
    base.offY = num(c.offY, -1, 1, 0);
    base.brilho = num(c.brilho, 0, 300, 100);
    base.contraste = num(c.contraste, 0, 300, 100);
    base.saturacao = num(c.saturacao, 0, 300, 100);
    base.desfoque = num(c.desfoque, 0, 40, 0);
    base.raio = num(c.raio, 0, 2000, 0);
    const raios = limparRaios(c);
    if (raios) base.raios = raios;
    base.borda = num(c.borda, 0, 80, 0);
    base.corBorda = cor(c.corBorda, '#ffffff');
  } else if (c.tipo === 'texto') {
    base.texto = texto(c.texto, 20000);
    if (typeof c.campoVinculadoAnterior === 'string' && c.campoVinculadoAnterior) {
      base.campoVinculadoAnterior = texto(c.campoVinculadoAnterior, 300);
    }
    base.fonte = fonte(c.fonte);
    base.peso = Math.round(num(c.peso, 100, 1000, 400));
    base.italico = Boolean(c.italico);
    base.tamanho = num(c.tamanho, 6, 600, 40);
    base.cor = cor(c.cor, '#ffffff');
    base.alinhamento = ALINHAMENTOS.has(c.alinhamento) ? c.alinhamento : 'left';
    base.ancora = ANCORAS.has(c.ancora) ? c.ancora : 'topo';
    base.espacamento = num(c.espacamento, -20, 100, 0);
    base.entrelinha = num(c.entrelinha, 0.5, 3.5, 1.15);
    base.escalaX = num(c.escalaX, 0.1, 5, 1);
    base.escalaY = num(c.escalaY, 0.1, 5, 1);
    base.maiusculas = Boolean(c.maiusculas);
    base.autoFit = Boolean(c.autoFit);
    base.sombra = num(c.sombra, 0, 80, 0);
    base.corSombra = cor(c.corSombra, '#000000');
    base.contorno = num(c.contorno, 0, 40, 0);
    base.corContorno = cor(c.corContorno, '#000000');
    base.fundo = Boolean(c.fundo);
    base.corFundo = cor(c.corFundo, '#5266eb');
    base.raioFundo = num(c.raioFundo, 0, 300, 0);
    base.folga = num(c.folga, 0, 200, 0);
    base.bordaFundo = num(c.bordaFundo, 0, 40, 0);
    base.corBordaFundo = cor(c.corBordaFundo, '#ffffff');
    const tel = limparTelemetria(c.telemetria);
    if (tel) base.telemetria = tel;
  } else if (c.tipo === 'retangulo') {
    base.cor = cor(c.cor, '#5266eb');
    base.raio = num(c.raio, 0, 3000, 0);
    const raios = limparRaios(c);
    if (raios) base.raios = raios;
    base.blurFundo = num(c.blurFundo, 0, 40, 0);
    base.borda = num(c.borda, 0, 80, 0);
    base.corBorda = cor(c.corBorda, '#ffffff');
    if (c.strokeScaleEnabled === true) base.strokeScaleEnabled = true;
  } else if (c.tipo === 'circulo') {
    base.cor = cor(c.cor, '#5266eb');
    base.borda = num(c.borda, 0, 80, 0);
    base.corBorda = cor(c.corBorda, '#ffffff');
    if (c.strokeScaleEnabled === true) base.strokeScaleEnabled = true;
  } else if (c.tipo === 'linha') {
    const pts = Array.isArray(c.pontos) && c.pontos.length >= 4
      ? c.pontos.slice(0, 20).map(v => num(v, -6000, 6000, 0))
      : [0, Math.round(base.h / 2), base.w, Math.round(base.h / 2)];
    if (pts.length % 2 === 1) pts.pop();
    base.pontos = pts.length >= 4 ? pts : [0, 0, base.w, 0];
    base.cor = cor(c.cor, '#ffffff');
    base.espessura = num(c.espessura, 1, 80, 4);
    base.ponta = PONTAS_LINHA.has(c.ponta) ? c.ponta : 'round';
    if (Array.isArray(c.tracejado)) {
      const dash = c.tracejado.slice(0, 6).map(v => num(v, 1, 100, 8));
      base.tracejado = dash.length ? dash : false;
    } else {
      base.tracejado = Boolean(c.tracejado);
    }
    if (c.strokeScaleEnabled === true) base.strokeScaleEnabled = true;
  } else if (c.tipo === 'degrade') {
    base.cor1 = cor(c.cor1, '#00000000');
    base.cor2 = cor(c.cor2, '#000000cc');
    base.angulo = num(c.angulo, 0, 360, 180);
    base.raio = num(c.raio, 0, 3000, 0);
    const raios = limparRaios(c);
    if (raios) base.raios = raios;
  } else if (c.tipo === 'poligono') {
    base.vertices = limparVertices(c.vertices, base.w, base.h);
    base.cor = cor(c.cor, '#5266eb');
    base.borda = num(c.borda, 0, 80, 0);
    base.corBorda = cor(c.corBorda, '#ffffff');
    base.strokeScaleEnabled = c.strokeScaleEnabled === true;
  } else if (c.tipo === 'icone') {
    const ic = String(c.iconeId || '').trim();
    base.iconeId = Object.prototype.hasOwnProperty.call(ICONES_SVG, ic) ? ic : 'estrela';
    base.cor = cor(c.cor, '#ffffff');
    base.formaFundo = FORMAS_FUNDO_ICONE.has(c.formaFundo) ? c.formaFundo : 'nenhum';
    base.corFundo = cor(c.corFundo, '#5266eb');
    if (c.folga !== undefined) base.folga = num(c.folga, 0, 200, 0);
    base.bordaFundo = num(c.bordaFundo, 0, 40, 0);
    base.corBordaFundo = cor(c.corBordaFundo, '#ffffff');
  } else if (c.tipo === 'logo') {
    base.origem = c.origem === 'custom' ? 'custom' : 'kit';
    base.forma = FORMAS_LOGO.has(c.forma) ? c.forma : 'quadrado';
    base.raio = num(c.raio, 0, 500, 16);
    base.corFundo = cor(c.corFundo, '#5266eb');
    base.corTexto = cor(c.corTexto, '#ffffff');
    if (c.ocultarSemLogo) base.ocultarSemLogo = true;
    const srcLimpo = limparDataImage(c.src);
    if (srcLimpo) base.src = srcLimpo;
  } else if (c.tipo === 'qrcode') {
    base.origem = c.origem === 'custom' ? 'custom' : 'whatsapp';
    base.url = limparUrlQr(c.url);
    base.corEscuro = cor(c.corEscuro, '#171721');
    base.corClaro = cor(c.corClaro, '#ffffff');
    base.raio = num(c.raio, 0, 200, 12);
    base.margem = num(c.margem, 0, 10, 2);
  }

  return base;
}

function limparSlide(s, idx = 0) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const tipo = TIPOS_SLIDE.has(s.tipo) ? s.tipo : 'custom';
  const camadas = (Array.isArray(s.camadas) ? s.camadas : []).slice(0, MAX_CAMADAS).map(limparCamada).filter(Boolean);
  return {
    id: limparId(s.id, `sl${idx + 1}`),
    nome: texto(s.nome || `Página ${idx + 1}`, 60).trim() || `Página ${idx + 1}`,
    tipo,
    fundo: cor(s.fundo, '#0e0e0f'),
    camadas
  };
}

function limparCena(entrada) {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    throw Object.assign(new Error('Cena inválida.'), { status: 400 });
  }
  let rawSlides = Array.isArray(entrada.slides) ? entrada.slides : null;
  if (!rawSlides && Array.isArray(entrada.camadas)) {
    rawSlides = [{ id: 'slide-1', nome: 'Capa', tipo: 'capa', fundo: entrada.fundo, camadas: entrada.camadas }];
  }
  const slides = (rawSlides || []).slice(0, MAX_SLIDES).map((s, idx) => limparSlide(s, idx)).filter(Boolean);
  if (!slides.length) {
    throw Object.assign(new Error('A cena precisa de pelo menos uma página.'), { status: 400 });
  }

  const paleta = (Array.isArray(entrada.paleta) ? entrada.paleta : [])
    .slice(0, 12)
    .map(x => cor(x, ''))
    .filter(Boolean);

  const out = {
    versao: 1,
    modo: 'pdf',
    formato: '16:9',
    largura: 1152,
    altura: 648,
    paleta,
    slides
  };
  if (typeof entrada.nome === 'string' && entrada.nome.trim()) out.nome = texto(entrada.nome, 60).trim();
  if (MODELOS_BASE.has(entrada.modeloBase)) out.modeloBase = entrada.modeloBase;
  if (entrada.paletaId === 'principal' || entrada.paletaId === 'segunda') out.paletaId = entrada.paletaId;
  return out;
}

function readState() {
  const raw = readJson(FILE, {});
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const modelos = Array.isArray(obj.modelos) ? obj.modelos.filter(m => m && typeof m === 'object' && m.id && !FORBIDDEN_KEYS.has(String(m.id))) : [];
  const padrao = typeof obj.padrao === 'string' && !FORBIDDEN_KEYS.has(obj.padrao) && modelos.some(m => m.id === obj.padrao)
    ? obj.padrao
    : null;
  return { modelos, padrao };
}

function writeState(state) {
  writeJson(FILE, { modelos: state.modelos, padrao: state.padrao });
}

function listar() {
  const st = readState();
  return { modelos: st.modelos, padrao: st.padrao };
}

function obter(modeloId) {
  const idStr = String(modeloId ?? '').trim();
  if (!idStr || FORBIDDEN_KEYS.has(idStr)) return null;
  const st = readState();
  return st.modelos.find(m => m.id === idStr) || null;
}

function obterPadrao() {
  const st = readState();
  if (!st.padrao) return null;
  return st.modelos.find(m => m.id === st.padrao) || null;
}

function salvar(entrada) {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    throw Object.assign(new Error('Modelo inválido.'), { status: 400 });
  }
  if (entrada.id !== undefined && FORBIDDEN_KEYS.has(String(entrada.id).trim())) {
    throw Object.assign(new Error('ID de modelo inválido.'), { status: 400 });
  }

  const st = readState();
  const idExistente = entrada.id && !entrada.comoNovo ? limparId(entrada.id, 'mod') : null;
  const idx = idExistente ? st.modelos.findIndex(m => m.id === idExistente) : -1;

  // Atualização leve (favoritar ou renomear sem reenviar a cena)
  if (idx >= 0 && entrada.cena === undefined && entrada.doc === undefined && entrada.slides === undefined) {
    const atual = { ...st.modelos[idx] };
    if (typeof entrada.nome === 'string' && entrada.nome.trim()) {
      atual.nome = texto(entrada.nome, 60).trim() || atual.nome;
    }
    atual.atualizadoEm = new Date().toISOString();
    st.modelos[idx] = atual;
    if (entrada.padrao === true || entrada.favorito === true) st.padrao = atual.id;
    else if ((entrada.padrao === false || entrada.favorito === false) && st.padrao === atual.id) st.padrao = null;
    writeState(st);
    return atual;
  }

  const rawCena = entrada.cena || entrada.doc || entrada;
  const cena = limparCena(rawCena);
  const idFinal = idx >= 0 ? idExistente : limparId(entrada.comoNovo ? '' : entrada.id, 'mod');
  const nome = texto(entrada.nome || cena.nome || 'Meu modelo', 60).trim() || 'Meu modelo';

  const registro = {
    id: idFinal,
    nome,
    cena,
    atualizadoEm: new Date().toISOString()
  };

  if (idx >= 0) {
    st.modelos[idx] = registro;
  } else {
    if (st.modelos.length >= MAX_MODELOS) {
      throw Object.assign(new Error(`Limite de ${MAX_MODELOS} modelos próprios atingido. Apague um antes.`), { status: 400 });
    }
    st.modelos.push(registro);
  }

  if (entrada.padrao === true || entrada.favorito === true) {
    st.padrao = registro.id;
  } else if ((entrada.padrao === false || entrada.favorito === false) && st.padrao === registro.id) {
    st.padrao = null;
  }

  writeState(st);
  return registro;
}

function apagar(modeloId) {
  const idStr = String(modeloId ?? '').trim();
  if (!idStr || FORBIDDEN_KEYS.has(idStr)) return false;
  const st = readState();
  const antes = st.modelos.length;
  const padraoAntes = st.padrao;
  st.modelos = st.modelos.filter(m => m.id !== idStr);
  if (st.padrao === idStr) st.padrao = null;
  const removeu = st.modelos.length !== antes;
  if (removeu || padraoAntes !== st.padrao) writeState(st);
  return removeu;
}

module.exports = {
  limparCena,
  limparSlide,
  limparCamada,
  listar,
  obter,
  obterPadrao,
  salvar,
  apagar,
  MAX_MODELOS,
  MAX_SLIDES,
  MAX_CAMADAS
};
