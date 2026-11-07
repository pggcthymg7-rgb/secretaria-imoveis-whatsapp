'use strict';
// Os 5 modelos (A, B, D, E, F) traduzidos do desenho em gen/models_*.py (fonte dos modelo.html).
// Coordenadas em pt (1 px do HTML = 1 pt). Página 1152 × 648.
const { loc, tipoNeg, preco, temPreco, dadosLinhas, destaques, listaCorrida } = require('./dados');

const W = 1152, H = 648;
const LEG_QR = 'Abrir conversa no WhatsApp';

// ---------------------------------------------------------------- utilidades comuns
/** Grade de células (CSS grid de colunas iguais). itens = arrays de itens de fluxo por célula. */
function grade(m, celulas, cols, gapY, gapX, mt = 0) {
  if (!celulas.length) return null;
  return {
    mt,
    lay(Wc) {
      const cw = (Wc - (cols - 1) * gapX) / cols;
      const hs = celulas.map((c) => m.medirCol(c, cw));
      const nlin = Math.ceil(celulas.length / cols);
      const alt = [];
      for (let r = 0; r < nlin; r++) alt.push(Math.max(...hs.slice(r * cols, r * cols + cols)));
      const h = alt.reduce((a, b) => a + b, 0) + (nlin - 1) * gapY;
      return {
        h, base: h,
        draw(x, y) {
          let yy = y;
          for (let r = 0; r < nlin; r++) {
            for (let c = 0; c < cols; c++) {
              const i = r * cols + c; if (i >= celulas.length) break;
              m.Col(celulas[i], x + c * (cw + gapX), { y: yy, w: cw });
            }
            yy += alt[r] + gapY;
          }
        },
      };
    },
  };
}

/** Distribuição genérica de fotos em linhas (para n sem layout próprio no HTML). */
const LINHAS = { 1: [1], 2: [2], 3: [3], 4: [2, 2], 5: [2, 3], 6: [3, 3], 7: [4, 3], 8: [4, 4], 9: [3, 3, 3], 10: [4, 3, 3] };
function caixasLinhas(x, y, w, h, n, gap) {
  const rows = LINHAS[n]; const out = [];
  const rh = (h - (rows.length - 1) * gap) / rows.length;
  rows.forEach((cnt, ri) => {
    const cw = (w - (cnt - 1) * gap) / cnt;
    for (let i = 0; i < cnt; i++) out.push([x + i * (cw + gap), y + ri * (rh + gap), cw, rh]);
  });
  return out;
}

/** Desenha o QR centrado em cx; devolve o tamanho (0 se não houver telefone). */
function qrCentro(m, ctx, y, mod, cx, r = 0) {
  if (!ctx.qr) return 0;
  const size = (ctx.qr.size + 8) * mod;
  m.qr(ctx.qr, Math.round(cx - size / 2), y, mod, r);
  return size;
}

// ============================================================================ A · ESCURO SOFISTICADO
const A = {
  id: 'A', nome: 'A · Escuro sofisticado', pasta: 'A-escuro-sofisticado',
  fontes: { t: 'Jost', b: 'Jost' }, pesosMarca: [300, 700], pesosTexto: [300, 500, 700], logoWt: 700, margem: 36,
  pal1: { fundo: '#0E0E0F', texto: '#ECE9E2', principal: '#2A2A2D', secundaria: '#8C8A84', destaque: '#C8A15A' },
  pal2: { fundo: '#F2F0EB', texto: '#131314', principal: '#DAD6CC', secundaria: '#7A776F', destaque: '#8C6420' },
  tb: { x: 468, y: 72, w: 500, h: 504, s: 16, wt: 300, lh: 1.7, pgap: 12, f: 'b' },
  marca: (m, kit) => m.marca(kit, { s: 32, forma: 'rect', r: 2, fill: 'destaque', nm: 15, wt: 500, c: 'texto', gap: 12 }),

  capa(m, d, kit, ctx) {
    const [lab, val] = preco(d);
    const t = d.edificio || d.tipo;
    const sub = d.edificio ? tipoNeg(d) : d.neg;
    m.foto(468, 0, 684, 648, ctx.foto(0), 0, 'capa');
    m.Col([this.marca(m, kit)], 48, { y: 48 });
    m.Col([
      m.T(sub, { s: 14, wt: 500, mut: true }),
      m.T(t, { s: 56, wt: 300, lh: 1.04, f: 't', mt: 12, w: 372, fit: true, maxl: 3 }),
      m.T(loc(d), { s: 16, wt: 500, mt: 16 }),
      temPreco(d) ? m.HL('destaque', { t: 2, w: 48, mt: 32 }) : null,
      m.T(lab, { s: 13, wt: 500, c: 'destaque', mt: 12 }),
      m.T(val, { s: 40, wt: 700, c: 'destaque', mt: 4, w: 372, fit: true }),
    ], 48, { bottom: 48, w: 372 });
  },

  resumo(m, d, kit) {
    const [lab, val] = preco(d);
    const t = d.edificio || d.tipo;
    m.rect(0, 0, 520, 648, 'principal');
    m.Col([this.marca(m, kit)], 48, { y: 48 });
    m.Col([
      m.T(tipoNeg(d), { s: 13, wt: 500, mut: true }),
      m.T(t, { s: 24, wt: 500, mt: 4, maxl: 2 }),
      m.T(loc(d), { s: 14, wt: 300, mut: true, mt: 4 }),
      m.T(lab, { s: 13, wt: 500, c: 'destaque', mt: 40 }),
      m.T(val, { s: 68, wt: 300, mt: 4, f: 't', w: 424, fit: true }),
    ], 48, { bottom: 48, w: 424 });
    const linhas = dadosLinhas(d).map(([l, v]) => m.Linha([
      m.T(l, { s: 14, wt: 500, mut: true }), m.T(v, { s: 24, wt: 500, al: 'right' }),
    ], { jc: 'space-between', padT: 11, padB: 11, borda: { c: 'principal', t: 1 } }));
    const hs = destaques(d, 6);
    const extra = hs.length ? [
      m.T('Destaques', { s: 13, wt: 500, mut: true, mt: 28 }),
      grade(m, hs.map((x) => [m.T(x, { s: 15, wt: 500 })]), 2, 8, 24, 12),
    ] : [];
    m.Col([...linhas, ...extra], 596, { y: 72, w: 508 });
  },

  foto(m, d, kit, ctx, f) {
    const cap = [m.T(d.edificio, { s: 24, wt: 500 }), m.T(loc(d), { s: 14, wt: 300, mut: true, mt: 4 })].filter(Boolean);
    const ph = cap.length ? 528 : 648;
    m.foto(0, 0, 1152, ph, f, 0, 'foto grande');
    if (cap.length) {
      m.rect(0, 528, 1152, 120, 'fundo');
      m.Col(cap, 48, { y: 546, w: 700 });
      m.Col([m.T(tipoNeg(d), { s: 14, wt: 500, mut: true, al: 'right' })], 804, { y: 546, w: 300 });
    }
  },

  galeria(m, d, kit, ctx, fs) {
    const n = fs.length;
    let cx;
    if (n === 3) cx = [[36, 36, 672, 576], [716, 36, 400, 284], [716, 328, 400, 284]];
    else if (n === 10) { const cw = (1080 - 32) / 5; cx = fs.map((_, i) => [36 + (i % 5) * (cw + 8), 36 + Math.floor(i / 5) * 292, cw, 284]); }
    else if (n === 9 || n === 8) cx = caixasLinhas(36, 36, 1080, 576, n, 8);
    else if (n === 6) cx = caixasLinhas(36, 36, 1080, 576, 6, 8);
    else cx = caixasLinhas(36, 36, 1080, 576, n, 8);
    cx.forEach((c, i) => m.foto(...c, fs[i], 0, `galeria ${n}`));
  },

  texto(m, d, kit, ctx, res, cont) {
    m.Col([
      m.T(ctx.titulo || 'Descrição', { s: 44, wt: 300, f: 't' }),
      m.HL('destaque', { t: 2, w: 48, mt: 20 }),
      m.T(cont ? 'continuação' : '', { s: 15, wt: 500, mut: true, mt: 16 }),
    ], 48, { y: 72, w: 340 });
    m.desenharCorpo(res, this.tb);
    m.Col([m.T(d.edificio, { s: 15, wt: 500 }), m.T(loc(d), { s: 13, wt: 300, mut: true, mt: 4 })], 48, { bottom: 48, w: 340 });
  },

  contato(m, d, kit, ctx) {
    m.rect(700, 0, 452, 648, 'principal');
    m.Col([this.marca(m, kit)], 48, { y: 48 });
    const size = qrCentro(m, ctx, 150, 8, 926, 2);
    if (size) m.Col([m.T(LEG_QR, { s: 15, wt: 500, al: 'center' })], 736, { y: 150 + size + 20, w: 380 });
    m.Col([
      m.T(d.corretor, { s: 56, wt: 300, f: 't', lh: 1.04, w: 600, fit: true, maxl: 2 }),
      m.T(d.creci, { s: 14, wt: 500, mut: true, mt: 12 }),
      m.T(ctx.fone, { s: 28, wt: 500, mt: 36 }),
      m.T(d.email, { s: 18, wt: 300, mt: 8, fw: 600, one: true }),
    ], 48, { bottom: 48, w: 600 });
  },
};

// ============================================================================ B · EDITORIAL CLARO
const B = {
  id: 'B', nome: 'B · Editorial claro', pasta: 'B-editorial-claro',
  fontes: { t: 'CormorantGaramond', b: 'WorkSans' }, pesosMarca: [400, 600], pesosTexto: [400], logoWt: 600, margem: 72,
  pal1: { fundo: '#FAF8F4', texto: '#1D1B18', principal: '#2F4A3E', secundaria: '#8A857B', destaque: '#B5532F' },
  pal2: { fundo: '#17211C', texto: '#EEEAE0', principal: '#3E6354', secundaria: '#7C877F', destaque: '#E0885F' },
  tb: { x: 72, y: 176, w: 1008, h: 396, s: 13, wt: 400, lh: 1.7, pgap: 10, f: 'b', cols: 2, colgap: 48 },
  marca: (m, kit) => m.marca(kit, { s: 24, forma: 'circle', fill: 'principal', nm: 12, wt: 400, c: 'texto', gap: 10 }),

  capa(m, d, kit, ctx) {
    const [lab, val] = preco(d);
    const t = d.edificio || d.tipo;
    m.foto(624, 72, 456, 504, ctx.foto(0), 0, 'capa');
    m.Col([this.marca(m, kit)], 72, { y: 72 });
    m.Col([
      temPreco(d) ? m.HL('destaque', { t: 3, w: 40 }) : null,
      m.T(d.edificio ? tipoNeg(d) : d.neg, { s: 12, wt: 400, mut: true, mt: 24 }),
      m.T(t, { s: 76, wt: 400, f: 't', lh: 0.98, mt: 14, w: 500, fit: true, maxl: 2 }),
      m.HL('secundaria', { t: 1, w: 480, mt: 28 }),
      m.T(loc(d), { s: 13, wt: 400, mt: 16 }),
    ], 72, { y: 180, w: 500 });
    m.Col([
      m.T(lab, { s: 12, wt: 400, mut: true }),
      m.T(val, { s: 44, wt: 600, f: 't', lh: 1, mt: 6, w: 500, fit: true }),
    ], 72, { bottom: 72, w: 500 });
  },

  resumo(m, d, kit) {
    const [lab, val] = preco(d);
    const t = d.edificio || d.tipo;
    m.Col([this.marca(m, kit)], 72, { y: 72 });
    const hs = destaques(d, 9);
    m.Col([
      m.T(lab, { s: 12, wt: 400, mut: true }),
      m.T(val, { s: 64, wt: 600, f: 't', lh: 1, mt: 8, w: 400, fit: true }),
      m.T(tipoNeg(d), { s: 12, wt: 400, mut: true, mt: 36 }),
      m.T(t, { s: 22, wt: 400, f: 't', mt: 4, maxl: 2 }),
      m.T(loc(d), { s: 13, wt: 400, mt: 4 }),
      hs.length ? m.T('Destaques', { s: 12, wt: 400, mut: true, mt: 44 }) : null,
      hs.length ? m.T(listaCorrida(hs), { s: 14, wt: 400, lh: 1.7, mt: 8 }) : null,
    ], 72, { y: 150, w: 400 });
    m.Col(dadosLinhas(d).map(([l, v]) => m.Linha([
      m.T(l, { s: 12, wt: 400, mut: true }), m.T(v, { s: 28, wt: 600, f: 't', al: 'right', lh: 1 }),
    ], { jc: 'space-between', padT: 13, padB: 11, bordaTopo: 'secundaria' })), 560, { y: 150, w: 520 });
  },

  foto(m, d, kit, ctx, f) {
    const l = m.T(d.edificio, { s: 22, wt: 400, f: 't' });
    const r = m.T(loc(d), { s: 12, wt: 400, mut: true, al: 'right' });
    const has = !!(l || r);
    m.foto(72, 48, 1008, has ? 480 : 552, f, 0, 'foto grande');
    if (has) {
      m.rect(72, 548, 1008, 1, 'secundaria');
      m.Col([m.Linha([l || m.T(' ', { s: 1 }), r], { jc: 'space-between' })], 72, { y: 562, w: 1008 });
    }
  },

  galeria(m, d, kit, ctx, fs) {
    const n = fs.length;
    let cx;
    if (n === 3) cx = [[72, 72, 600, 504], [696, 72, 384, 240], [696, 336, 384, 240]];
    else cx = caixasLinhas(72, 72, 1008, 504, n, 16);
    cx.forEach((c, i) => m.foto(...c, fs[i], 0, `galeria ${n}`));
  },

  texto(m, d, kit, ctx, res, cont) {
    m.Col([m.T(ctx.titulo || 'Descrição', { s: 40, wt: 600, f: 't', lh: 1 }), m.T(cont ? 'continuação' : '', { s: 12, wt: 400, mut: true, mt: 10 })], 72, { y: 72, w: 600 });
    m.rect(72, 152, 1008, 1, 'secundaria');
    m.desenharCorpo(res, this.tb);
  },

  contato(m, d, kit, ctx) {
    m.rect(828, 0, 324, 648, 'principal');
    m.Col([this.marca(m, kit)], 72, { y: 72 });
    const size = qrCentro(m, ctx, 190, 6, 990);
    if (size) m.Col([m.T(LEG_QR, { s: 12, wt: 400, c: 'sobre-principal', al: 'center' })], 864, { y: 190 + size + 18, w: 252 });
    m.Col([
      m.T(d.corretor, { s: 64, wt: 600, f: 't', lh: 1, w: 680, fit: true, maxl: 2 }),
      m.HL('secundaria', { t: 1, w: 360, mt: 28 }),
      m.T(d.creci, { s: 12, wt: 400, mut: true, mt: 16 }),
      m.T(ctx.fone, { s: 32, wt: 400, f: 't', mt: 24 }),
      m.T(d.email, { s: 14, wt: 400, mt: 10, fw: 680, one: true }),
    ], 72, { y: 190, w: 680 });
  },
};

// ============================================================================ D · GRADE ASSIMÉTRICA
const D = {
  id: 'D', nome: 'D · Grade assimétrica', pasta: 'D-grade-assimetrica',
  fontes: { t: 'ArchivoBlack', b: 'Archivo' }, pesosMarca: [400], pesosTexto: [400, 700], logoWt: 400, margem: 36,
  pal1: { fundo: '#F1EFEA', texto: '#111111', principal: '#0B3D91', secundaria: '#D9D5CB', destaque: '#F44A18' },
  pal2: { fundo: '#121212', texto: '#F1EFEA', principal: '#2F5FC4', secundaria: '#34332F', destaque: '#FF6A3D' },
  tb: { x: 404, y: 40, w: 510, h: 572, s: 15, wt: 400, lh: 1.65, pgap: 12, f: 'b' },
  marca: (m, kit) => m.marca(kit, { s: 28, forma: 'rect', r: 0, fill: 'destaque', nm: 14, wt: 700, c: 'texto', gap: 10 }),

  capa(m, d, kit, ctx) {
    const [lab, val] = preco(d);
    const t = d.edificio || d.tipo;
    m.foto(680, 0, 472, 648, ctx.foto(0), 0, 'capa');
    m.Col([
      this.marca(m, kit),
      m.T(d.edificio ? tipoNeg(d) : d.neg, { s: 15, wt: 700, mut: true, mt: 36 }),
      m.T(t, { s: 92, wt: 400, f: 't', lh: 0.9, mt: 14, w: 620, fit: true, maxl: 3 }),
      m.T(loc(d), { s: 18, wt: 400, mt: 22 }),
    ], 36, { y: 36, w: 620 });
    m.rect(0, 452, 680, 196, 'principal');
    if (temPreco(d)) m.rect(36, 452, 120, 12, 'destaque');
    m.Col([
      m.T(lab, { s: 15, wt: 700, c: 'sobre-principal' }),
      m.T(val, { s: 76, wt: 400, c: 'sobre-principal', f: 't', lh: 1, mt: 6, w: 620, fit: true, maxl: 2 }),
    ], 36, { bottom: 48, w: 620 });
  },

  resumo(m, d, kit) {
    const [lab, val] = preco(d);
    const t = d.edificio || d.tipo;
    const cel = dadosLinhas(d).map(([l, v]) => [m.T(v, { s: 44, wt: 400, f: 't', lh: 1 }), m.T(l, { s: 13, wt: 700, mut: true, mt: 6 })]);
    m.Col([
      m.T(tipoNeg(d), { s: 15, wt: 700, mut: true }),
      m.T(t, { s: 22, wt: 700, mt: 2, maxl: 2 }),
      m.T(lab, { s: 15, wt: 700, c: 'destaque', mt: 36 }),
      m.T(val, { s: 100, wt: 400, f: 't', lh: 0.95, mt: lab ? 6 : 24, w: 712, fit: true }),
      grade(m, cel, 4, 28, 24, 44),
    ], 36, { y: 36, w: 712 });
    m.rect(772, 0, 380, 648, 'principal');
    const hs = destaques(d, 9);
    if (hs.length) {
      const it = [m.T('Destaques', { s: 13, wt: 700, c: 'sobre-principal', mut: true })];
      hs.forEach((x) => { it.push(m.HL('sobre-principal', { t: 1, op: 0.35, mt: 14, mb: 14 })); it.push(m.T(x, { s: 20, wt: 700, c: 'sobre-principal' })); });
      m.Col(it, 804, { y: 36, w: 312 });
    }
  },

  foto(m, d, kit, ctx, f) {
    const cap = [m.T(tipoNeg(d), { s: 14, wt: 700, mut: true }), m.T(d.edificio, { s: 34, wt: 400, f: 't', lh: 1, mt: 16 }),
      m.T(loc(d), { s: 15, wt: 400, mt: 12 })].filter(Boolean);
    const ar = d.area ? [m.T('Área', { s: 13, wt: 700, mut: true }), m.T(d.area, { s: 64, wt: 400, f: 't', lh: 1, mt: 6 })] : [];
    const has = cap.length || ar.length;
    m.foto(0, 0, has ? 812 : 1152, 648, f, 0, 'foto grande');
    if (has) { m.Col(cap, 836, { y: 36, w: 280 }); m.Col(ar, 836, { bottom: 48, w: 280 }); }
  },

  galeria(m, d, kit, ctx, fs) {
    const n = fs.length;
    let cx = [];
    if (n === 3) cx = [[36, 36, 620, 576], [680, 36, 436, 276], [680, 336, 436, 276]];
    else if (n === 10) {
      [[436, 344, 252], [252, 436, 344], [252, 252, 252, 252]].forEach((ws, ri) => {
        let x = 36; ws.forEach((w) => { cx.push([x, 36 + ri * 200, w, 176]); x += w + 24; });
      });
    } else cx = caixasLinhas(36, 36, 1080, 576, n, 24);
    cx.forEach((c, i) => m.foto(...c, fs[i], 0, `galeria ${n}`));
  },

  texto(m, d, kit, ctx, res, cont) {
    m.Col([
      m.T(ctx.titulo || 'Descrição', { s: 52, wt: 400, f: 't', lh: 1 }),
      m.HL('destaque', { t: 10, w: 80, mt: 18 }),
      m.T(cont ? 'continuação' : '', { s: 15, wt: 700, mut: true, mt: 14 }),
    ], 36, { y: 36, w: 344 });
    m.desenharCorpo(res, this.tb);
    m.Col([m.T(d.edificio, { s: 20, wt: 400, f: 't', lh: 1.1 }), m.T(loc(d), { s: 14, wt: 400, mut: true, mt: 6 })], 36, { bottom: 36, w: 344 });
  },

  contato(m, d, kit, ctx) {
    m.rect(680, 0, 472, 648, 'principal');
    m.Col([this.marca(m, kit)], 36, { y: 36 });
    const size = qrCentro(m, ctx, 150, 8, 916);
    if (size) m.Col([m.T(LEG_QR, { s: 16, wt: 700, c: 'sobre-principal', al: 'center' })], 716, { y: 150 + size + 20, w: 400 });
    m.Col([
      m.T(d.corretor, { s: 72, wt: 400, f: 't', lh: 0.95, w: 620, fit: true, maxl: 2 }),
      m.T(d.creci, { s: 15, wt: 700, mut: true, mt: 18 }),
    ], 36, { y: 96, w: 620 });
    m.Col([
      m.T(ctx.fone, { s: 44, wt: 400, f: 't', lh: 1 }),
      m.T(d.email, { s: 22, wt: 700, mt: 10, fw: 620, one: true }),
    ], 36, { bottom: 48, w: 620 });
  },
};

// ============================================================================ E · ACOLHEDOR CLÁSSICO
const E = {
  id: 'E', nome: 'E · Acolhedor clássico', pasta: 'E-acolhedor-classico',
  fontes: { t: 'Lora', b: 'SourceSans3' }, pesosMarca: [400, 700], pesosTexto: [400, 600], logoWt: 700, margem: 36,
  pal1: { fundo: '#F6EBDD', texto: '#3B2A20', principal: '#8C4A2F', secundaria: '#D8B98F', destaque: '#5E7A4F' },
  pal2: { fundo: '#2A1D16', texto: '#F4E7D4', principal: '#C27850', secundaria: '#5A4233', destaque: '#9DB88A' },
  tb: { x: 408, y: 140, w: 600, h: 460, s: 17, wt: 400, lh: 1.6, pgap: 12, f: 't' },

  capa(m, d, kit, ctx) {
    const [lab, val] = preco(d);
    const t = d.edificio || d.tipo;
    m.moldura(560, 48, 544, 552, ctx.foto(0), 12, 28, 20, 'capa');
    m.Col([m.marca(kit, { s: 36, forma: 'circle', fill: 'destaque', nm: 17, wt: 600, c: 'texto', gap: 12 })], 60, { y: 60 });
    // bloco do preço: painel arredondado que abraça o conteúdo (máx. 422 pt)
    const pl = m.T(lab, { s: 15, wt: 600, c: 'sobre-principal' });
    const pv = m.T(val, { s: 40, wt: 700, c: 'sobre-principal', f: 't', lh: 1.1, mt: 2, fit: true, maxl: 2 });
    const bloco = {
      mt: 28,
      lay() {
        const Ll = pl ? pl.lay(370) : null, Lv = pv.lay(370);
        const iw = Math.min(370, Math.max(Ll ? Ll.wNat : 0, Lv.wNat));
        const h = 16 + (Ll ? Ll.h : 0) + 2 + Lv.h + 18;
        return {
          h, base: h,
          draw(x, y) {
            m.rect(x, y, iw + 52, h, 'principal', 14);
            let yy = y + 16; if (Ll) { Ll.draw(x + 26, yy, iw); yy += Ll.h; }
            Lv.draw(x + 26, yy + 2, iw);
          },
        };
      },
    };
    m.Col([
      m.T(d.edificio ? tipoNeg(d) : d.neg, { s: 17, wt: 600, c: 'principal' }),
      m.T(t, { s: 54, wt: 700, f: 't', lh: 1.08, mt: 10, w: 470, fit: true, maxl: 3 }),
      m.T(loc(d), { s: 19, wt: 400, mt: 14 }),
      bloco,
    ], 60, { bottom: 60, w: 470 });
  },

  resumo(m, d, kit) {
    const [lab, val] = preco(d);
    const t = d.edificio || d.tipo;
    const sp = 'sobre-principal';
    m.rect(48, 48, 424, 552, 'principal', 28);
    m.Col([
      m.T(lab, { s: 17, wt: 600, c: sp }),
      m.T(val, { s: 52, wt: 700, c: sp, f: 't', lh: 1.05, mt: 4, w: 352, fit: true }),
      m.T(tipoNeg(d), { s: 17, wt: 600, c: sp, mut: true, mt: 28 }),
      m.T(t, { s: 26, wt: 700, c: sp, f: 't', lh: 1.15, mt: 4, maxl: 2 }),
      m.T(loc(d), { s: 17, wt: 400, c: sp, mt: 6 }),
    ], 84, { y: 84, w: 352 });
    const perm = [['Aceita permuta', d.permuta], ['Aceita financiamento', d.financ], ['Área de lazer', d.lazer]].filter((x) => x[1]).map((x) => x[0]);
    m.Col(perm.map((x) => m.T(x, { s: 17, wt: 600, c: sp })), 84, { bottom: 84, w: 352, gap: 6 });
    m.Col(dadosLinhas(d).map(([l, v]) => m.Linha([
      m.T(l, { s: 18, wt: 400 }), m.T(v, { s: 26, wt: 700, f: 't', al: 'right' }),
    ], { jc: 'space-between', padT: 10, padB: 10, borda: { c: 'secundaria', t: 1 } })), 520, { y: 60, w: 584 });
    let feats = (d.feats || []).slice(0, 8);
    if ((d.feats || []).length > 8) feats = d.feats.slice(0, 7).concat(`+${d.feats.length - 7}`);
    if (feats.length) {
      const pills = feats.map((x) => m.T(x, { s: 16, wt: 600 }).lay(560));
      const Wb = 584, gap = 8; const lin = [[]]; let cur = 0;
      pills.forEach((p) => { const pw = p.wNat + 32; if (cur && cur + gap + pw > Wb) { lin.push([]); cur = 0; } lin[lin.length - 1].push(p); cur += (cur ? gap : 0) + pw; });
      const ph = pills[0].h + 12;
      const tot = lin.length * ph + (lin.length - 1) * gap;
      let y = 648 - 48 - tot;
      lin.forEach((row) => {
        let x = 520;
        row.forEach((p) => { const pw = p.wNat + 32; m.rect(x, y, pw, ph, 'secundaria', ph / 2); p.draw(x + 16, y + 6, p.wNat); x += pw + gap; });
        y += ph + gap;
      });
    }
  },

  foto(m, d, kit, ctx, f) {
    const l = m.T(d.edificio, { s: 22, wt: 700, f: 't' });
    const r = m.T(loc(d), { s: 17, wt: 400, al: 'right' });
    const has = !!(l || r);
    const fh = has ? 500 : 552;
    m.moldura(48, 48, 1056, fh, f, 12, 28, 18, 'foto grande');
    if (has) m.Col([m.Linha([l || m.T(' ', { s: 1 }), r], { jc: 'space-between' })], 48, { y: 566, w: 1056 });
  },

  galeria(m, d, kit, ctx, fs) {
    const n = fs.length;
    if (n === 3) {
      [[48, 48, 600, 552], [664, 48, 440, 268], [664, 332, 440, 268]].forEach((c, i) => m.moldura(...c, fs[i], 10, 26, 18, 'galeria 3'));
      return;
    }
    const peq = n >= 7;
    caixasLinhas(48, 48, 1056, 552, n, 16).forEach((c, i) => m.moldura(...c, fs[i], peq ? 6 : 10, peq ? 18 : 26, peq ? 12 : 18, `galeria ${n}`));
  },

  texto(m, d, kit, ctx, res, cont) {
    m.moldura(48, 48, 312, 552, ctx.fotoTexto, 10, 28, 20, 'texto (lateral)');
    const tit = m.T(ctx.titulo || 'Descrição', { s: 34, wt: 700, f: 't', lh: 1.1 });
    const c = cont ? m.T('continuação', { s: 16, wt: 600, mut: true }) : null;
    m.Col([m.Linha([tit, c], { gap: 16 }), m.B(4, (x, y) => m.rect(x, y, 56, 4, 'destaque', 2), { mt: 14 })], 408, { y: 56, w: 632 });
    m.desenharCorpo(res, this.tb);
  },

  contato(m, d, kit, ctx) {
    const sp = 'sobre-principal';
    m.rect(48, 48, 528, 552, 'principal', 28);
    m.Col([m.marca(kit, { s: 32, forma: 'circle', fill: 'destaque', nm: 16, wt: 600, c: sp, gap: 10 })], 84, { y: 84 });
    m.Col([
      m.T(d.corretor, { s: 44, wt: 700, c: sp, f: 't', lh: 1.1, w: 456, fit: true, maxl: 2 }),
      m.T(d.creci, { s: 16, wt: 600, c: sp, mut: true, mt: 6 }),
      m.T(ctx.fone, { s: 28, wt: 700, c: sp, f: 't', mt: 28 }),
      m.T(d.email, { s: 19, wt: 400, c: sp, mt: 8, fw: 456, one: true }),
    ], 84, { bottom: 84, w: 456 });
    const size = qrCentro(m, ctx, 120, 8, 840, 14);
    if (size) m.Col([m.T(LEG_QR, { s: 22, wt: 700, f: 't', al: 'center' })], 612, { y: 120 + size + 24, w: 456 });
  },
};

// ============================================================================ F · LUXO CLÁSSICO
const SC = (m, txt, s, o = {}) => m.T(txt, { s, wt: 400, f: 's', lh: 1.15, min: 28, ...o });
const F = {
  id: 'F', nome: 'F · Luxo clássico', pasta: 'F-luxo-classico',
  fontes: { t: 'BodoniModa', b: 'BodoniModa', s: 'PinyonScript' }, pesosMarca: [400, 500], pesosTexto: [400, 500], logoWt: 400, margem: 72,
  pal1: { fundo: '#F5F1EA', texto: '#1C1917', principal: '#3B1A22', secundaria: '#8E857A', destaque: '#8F6A32' },
  pal2: { fundo: '#16100E', texto: '#F0E9DD', principal: '#3A1E26', secundaria: '#9A9084', destaque: '#CBA86B' },
  tb: { x: 528, y: 72, w: 500, h: 504, s: 14, wt: 400, lh: 1.75, pgap: 12, f: 'b' },
  marca: (m, kit, fill = 'principal', c = 'texto') => m.marca(kit, { s: 24, forma: 'rect', r: 0, fill, nm: 12, wt: 400, c, gap: 12 }),

  capa(m, d, kit, ctx) {
    const [lab, val] = preco(d);
    const t = d.edificio || d.tipo;
    m.foto(72, 250, 1008, 272, ctx.foto(0), 0, 'capa');
    m.Col([
      SC(m, d.edificio ? tipoNeg(d) : d.neg, 30, { al: 'center' }),
      m.T(t, { s: 60, wt: 400, f: 't', lh: 1.02, al: 'center', mt: 4, w: 1008, fit: true, maxl: 2 }),
      m.T(loc(d), { s: 14, wt: 400, al: 'center', mt: 12, mut: true }),
    ], 72, { bottom: 648 - 232, w: 1008 });
    m.Col([this.marca(m, kit)], 72, { bottom: 48, w: 420 });
    m.Col([
      m.T(lab, { s: 12, wt: 400, al: 'right', mut: true }),
      m.T(val, { s: val.length <= 18 ? 32 : 24, wt: 400, f: 't', al: 'right', lh: 1.05, mt: 4, w: 520, fit: true }),
    ], 560, { bottom: 48, w: 520 });
  },

  resumo(m, d, kit) {
    const [lab, val] = preco(d);
    const t = d.edificio || d.tipo;
    const hs = destaques(d, 8);
    const rows = dadosLinhas(d);
    const mk = this.marca(m, kit);
    const centro = (it, w) => it && ({ mt: it.mt, lay(Wc) { const L = it.lay(w); return { h: L.h, base: L.base, draw(x, y, Wd) { L.draw(x + ((Wd || Wc) - (w === undefined ? L.wNat : w)) / 2, y, w === undefined ? L.wNat : w); } }; } });
    const itens = [
      centro(mk),
      m.T(tipoNeg(d), { s: 12, wt: 400, al: 'center', mut: true, mt: 40 }),
      m.T(t, { s: 30, wt: 400, f: 't', al: 'center', lh: 1.1, mt: 4, w: 1008, one: true, min: 16 }),
      m.T(loc(d), { s: 14, wt: 400, al: 'center', mut: true, mt: 4 }),
      m.T(lab, { s: 12, wt: 400, al: 'center', c: 'destaque', mt: 36 }),
      m.T(val, { s: 72, wt: 400, f: 't', al: 'center', lh: 1.05, mt: 6, w: 1008, fit: true }),
    ];
    if (rows.length) {
      itens.push({
        mt: 40,
        lay(Wc) {
          const cw = Wc / rows.length;
          const cel = rows.map(([l, v]) => [m.T(v, { s: 28, wt: 400, f: 't', al: 'center', lh: 1.1, w: cw - 8, fit: true }), m.T(l, { s: 12, wt: 400, al: 'center', mut: true, mt: 6 })]);
          const ch = Math.max(...cel.map((c) => m.medirCol(c, cw - 8)));
          const h = 1 + 16 + 4 + ch + 4 + 16 + 1;
          return {
            h, base: h,
            draw(x, y) {
              m.rect(x, y, Wc, 1, 'secundaria'); m.rect(x, y + h - 1, Wc, 1, 'secundaria');
              cel.forEach((c, i) => {
                if (i) m.rect(x + i * cw, y + 17, 1, ch + 8, 'secundaria');
                m.Col(c, x + i * cw + 4, { y: y + 21, w: cw - 8 });
              });
            },
          };
        },
      });
    }
    if (hs.length) {
      itens.push(SC(m, 'Destaques', 28, { al: 'center', c: 'destaque', mt: 28 }));
      itens.push(centro(m.T(listaCorrida(hs), { s: 15, wt: 400, al: 'center', lh: 1.6, mt: 4, w: 640 }), 640));
    }
    m.Col(itens, 72, { y: 54, w: 1008 });
  },

  foto(m, d, kit, ctx, f) {
    const has = !!(d.edificio || loc(d));
    m.foto(72, 72, 1008, has ? 432 : 504, f, 0, 'foto grande');
    if (has) m.Col([SC(m, d.edificio, 30, { al: 'center', w: 1008, one: true }), m.T(loc(d), { s: 13, wt: 400, al: 'center', mut: true, mt: 4 })], 72, { y: 524, w: 1008 });
  },

  galeria(m, d, kit, ctx, fs) {
    const n = fs.length;
    let cx;
    if (n === 3) cx = [[72, 72, 384, 244], [72, 332, 384, 244], [480, 72, 600, 504]];
    else if (n === 10) { const cw = (1008 - 48) / 5; cx = fs.map((_, i) => [72 + (i % 5) * (cw + 12), 72 + Math.floor(i / 5) * 258, cw, 246]); }
    else cx = caixasLinhas(72, 72, 1008, 504, n, 12);
    cx.forEach((c, i) => m.foto(...c, fs[i], 0, `galeria ${n}`));
  },

  texto(m, d, kit, ctx, res, cont) {
    m.Col([SC(m, ctx.titulo || 'Descrição', 52), m.T(cont ? 'continuação' : '', { s: 12, wt: 400, mut: true, mt: 8 })], 72, { y: 72, w: 380 });
    m.rect(464, 72, 1, 504, 'secundaria', 0, 0.5);
    m.desenharCorpo(res, this.tb);
    m.Col([m.T(d.edificio, { s: 14, wt: 500, f: 't' }), m.T(loc(d), { s: 12, wt: 400, mut: true, mt: 4 })], 72, { bottom: 72, w: 360 });
  },

  contato(m, d, kit, ctx) {
    m.rect(0, 0, 420, 648, 'principal');
    m.Col([this.marca(m, kit, 'destaque', 'sobre-principal')], 72, { y: 72 });
    const size = qrCentro(m, ctx, 190, 7, 210);
    if (size) m.Col([m.T(LEG_QR, { s: 12, wt: 400, c: 'sobre-principal', al: 'center' })], 36, { y: 190 + size + 18, w: 348 });
    m.Col([
      SC(m, d.corretor, 72, { w: 580, fit: true, maxl: 2 }),
      m.HL('secundaria', { t: 1, w: 280, mt: 28 }),
      m.T(d.creci, { s: 12, wt: 400, mut: true, mt: 20 }),
      m.T(ctx.fone, { s: 32, wt: 400, f: 't', mt: 24 }),
      m.T(d.email, { s: 15, wt: 400, mt: 10, fw: 580, one: true }),
    ], 492, { y: 190, w: 588 });
  },
};

module.exports = { A, B, D, E, F, MODELOS: { A, B, D, E, F }, W, H };
