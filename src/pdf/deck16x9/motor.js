'use strict';
// Motor de layout mínimo sobre o pdfkit, reproduzindo o comportamento de CSS usado nos modelo.html:
// caixa de linha (line-height) com meia-entrelinha, colunas flex verticais ancoradas no topo ou na base,
// linhas com alinhamento por linha de base, e medição real com widthOfString.
// Não usa fs: roda em Node e no navegador.

const NBSP = ' ';

class Motor {
  /**
   * @param doc   PDFDocument
   * @param o.pal paleta derivada (kit.derivar)
   * @param o.fam {t: família da marca, b: família do texto, s: script}
   * @param o.pesos {família: [pesos disponíveis]}
   * @param o.logoWt peso da inicial do logo
   */
  constructor(doc, o) {
    Object.assign(this, o);
    this.doc = doc;
    this.avisos = o.avisos || [];
    this.medidas = o.medidas || []; // registro das reduções de corpo (para o relatório)
  }

  // ---------------------------------------------------------------- fontes
  fonte(f, wt) {
    const fam = this.fam[f] || this.fam.b;
    const ws = this.pesos[fam] || [];
    let w = wt;
    if (!ws.includes(wt) && ws.length) {
      w = ws.slice().sort((a, b) => Math.abs(a - wt) - Math.abs(b - wt))[0];
      this.aviso(`peso ${wt} indisponível em ${fam}; usado ${w}`);
    }
    const key = `${fam}-${w}`;
    this.doc.font(key);
    return key;
  }
  aviso(m) { if (!this.avisos.includes(m)) this.avisos.push(m); }
  larg(txt, f, wt, s) { this.fonte(f, wt); this.doc.fontSize(s); return this.doc.widthOfString(String(txt)); }
  metr(f, wt) { this.fonte(f, wt); const F = this.doc._font; return { a: F.ascender, d: F.descender }; }
  /** distância do topo da caixa de linha até a linha de base (CSS: meia-entrelinha). */
  base(f, wt, s, lh) {
    const { a, d } = this.metr(f, wt);
    const cont = (a - d) * s / 1000;
    return (lh * s - cont) / 2 + a * s / 1000;
  }
  cor(c) { return this.pal[c] || c; }

  // ---------------------------------------------------------------- quebra de linha
  quebrar(txt, f, wt, s, W) {
    this.fonte(f, wt);
    const d = this.doc;
    d.fontSize(s);
    const linhas = [];
    for (const par of String(txt).split('\n')) {
      const ws = par.split(' ').filter((x) => x !== '');
      let cur = '';
      for (const w of ws) {
        const tent = cur ? cur + ' ' + w : w;
        if (!cur || d.widthOfString(tent) <= W + 0.01) cur = tent;
        else { linhas.push(cur); cur = w; }
      }
      linhas.push(cur);
    }
    return linhas;
  }

  /**
   * Regras de encolhimento (refeitas com widthOfString):
   *  fit:  reduz até a MAIOR PALAVRA caber na largura;
   *  maxl: depois reduz de 2 em 2 até caber em maxl linhas (mín. 16 pt);
   *  one:  reduz até a linha inteira caber (e-mail; mín. 12 pt).
   */
  ajustar(txt, o, W) {
    let s = o.s;
    const minimo = o.min || (o.maxl ? 16 : 12);
    if (o.one) {
      while (s > minimo && this.larg(txt, o.f, o.wt, s) > W) s -= 0.5;
      if (this.larg(txt, o.f, o.wt, s) > W) this.aviso(`"${txt.slice(0, 40)}" não cabe em ${W} pt nem no mínimo de ${minimo} pt: quebra forçada`);
    } else if (o.fit || o.maxl) {
      const maior = String(txt).split(/[ \n]/).reduce((m, w) => Math.max(m, this.larg(w, o.f, o.wt, 1)), 0);
      if (o.fit && maior * s > W) s = Math.max(minimo, Math.floor((W / maior) * 2) / 2);
      if (o.maxl) while (s > minimo && this.quebrar(txt, o.f, o.wt, s, W).length > o.maxl) s = Math.max(minimo, s - 2);
    }
    if (s !== o.s) this.medidas.push({ texto: String(txt).slice(0, 48), de: o.s, para: s, largura: W });
    return s;
  }

  // ---------------------------------------------------------------- itens de fluxo
  /** Texto. Devolve null se vazio (o bloco some). */
  T(txt, o = {}) {
    if (txt === null || txt === undefined || txt === '') return null;
    const m = this;
    const op = { s: 16, wt: 400, c: 'texto', lh: 1.2, al: 'left', f: 'b', mt: 0, ...o };
    return {
      mt: op.mt,
      lay(Wc) {
        const W = op.w || Wc || 1000;
        const s = m.ajustar(txt, op, op.fw || W);
        let linhas;
        if (op.one) {
          linhas = [String(txt)];
          if (m.larg(txt, op.f, op.wt, s) > (op.fw || W)) linhas = m.quebrarForcado(String(txt), op.f, op.wt, s, op.fw || W);
        } else linhas = m.quebrar(txt, op.f, op.wt, s, W);
        const lhpt = op.lh * s;
        const b = m.base(op.f, op.wt, s, op.lh);
        const larguras = linhas.map((l) => m.larg(l, op.f, op.wt, s));
        return {
          h: linhas.length * lhpt, base: b, s, linhas,
          wNat: Math.max(...larguras),
          draw(x, y, Wd) {
            const Wa = op.w || Wd || W;
            m.fonte(op.f, op.wt);
            m.doc.fillColor(m.cor(op.c)).fillOpacity(op.mut ? 0.62 : 1);
            linhas.forEach((l, i) => {
              let dx = 0;
              if (op.al === 'center') dx = (Wa - larguras[i]) / 2;
              else if (op.al === 'right') dx = Wa - larguras[i];
              m.doc.fontSize(s).text(l, x + dx, y + i * lhpt + b, { lineBreak: false, baseline: 'alphabetic' });
            });
            m.doc.fillOpacity(1);
          },
        };
      },
    };
  }

  quebrarForcado(txt, f, wt, s, W) {
    const out = []; let cur = '';
    for (const ch of String(txt || '').slice(0, 2000)) {
      if (cur && this.larg(cur + ch, f, wt, s) > W) { out.push(cur); cur = ch; } else cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }

  /** Bloco de altura fixa (filete, espaço, logo...). draw(x,y,W). */
  B(h, draw, o = {}) {
    return { mt: o.mt || 0, lay: () => ({ h, base: o.base || h, wNat: o.w || 0, draw }) };
  }
  /** Filete horizontal. */
  HL(c, o = {}) {
    const m = this; const t = o.t || 1;
    return {
      mt: o.mt || 0,
      lay: (W) => ({ h: t + (o.mb || 0), base: t, draw(x, y, Wd) { m.rect(x, y, o.w || Wd || W, t, c, 0, o.op); } }),
    };
  }

  /** Coluna flex vertical. Ancorada em y (topo) ou bottom (distância da base da página). */
  Col(itens, x, o = {}) {
    const its = itens.filter(Boolean);
    if (!its.length) return 0;
    const W = o.w;
    const lays = its.map((it) => ({ mt: it.mt || 0, L: it.lay(W) }));
    const gap = o.gap || 0;
    const H = lays.reduce((s, l, i) => s + l.mt + l.L.h + (i ? gap : 0), 0);
    let y = o.y !== undefined ? o.y : 648 - o.bottom - H;
    lays.forEach((l, i) => { y += l.mt + (i ? gap : 0); l.L.draw(x, y, W); y += l.L.h; });
    return H;
  }
  /** Mede uma coluna sem desenhar (para ancorar/encaixar). */
  medirCol(itens, W, gap = 0) {
    return itens.filter(Boolean).reduce((s, it, i) => s + (it.mt || 0) + it.lay(W).h + (i ? gap : 0), 0);
  }

  /** Item composto: linha flex com alinhamento por linha de base (align-items: baseline). */
  Linha(partes, o = {}) {
    const m = this;
    const ps = partes.filter(Boolean);
    if (!ps.length) return null;
    return {
      mt: o.mt || 0,
      lay(W) {
        const Ls = ps.map((p) => p.lay(o.larguras ? undefined : undefined));
        const base = Math.max(...Ls.map((l) => l.base));
        const padT = o.padT || 0, padB = o.padB || 0;
        const h = padT + Math.max(...Ls.map((l) => base - l.base + l.h)) + padB + (o.borda ? o.borda.t || 1 : 0);
        return {
          h, base: padT + base,
          draw(x, y, Wd) {
            const Wa = o.w || Wd || W;
            if (o.bordaTopo) m.rect(x, y, Wa, 1, o.bordaTopo);
            const yy = y + padT;
            if (o.jc === 'space-between' && Ls.length === 2) {
              Ls[0].draw(x, yy + base - Ls[0].base, Ls[0].wNat);
              Ls[1].draw(x + Wa - Ls[1].wNat, yy + base - Ls[1].base, Ls[1].wNat);
            } else {
              let xx = x;
              Ls.forEach((l) => { l.draw(xx, yy + base - l.base, l.wNat); xx += l.wNat + (o.gap || 0); });
            }
            if (o.borda) m.rect(x, y + h - (o.borda.t || 1), Wa, o.borda.t || 1, o.borda.c);
          },
        };
      },
    };
  }

  // ---------------------------------------------------------------- primitivas
  rect(x, y, w, h, c, r = 0, op = 1) {
    const d = this.doc;
    d.save().fillColor(this.cor(c)).fillOpacity(op === undefined ? 1 : op);
    if (r > 0) d.roundedRect(x, y, w, h, Math.min(r, w / 2, h / 2)).fill(); else d.rect(x, y, w, h).fill();
    d.restore();
  }

  /**
   * Foto com recorte "cover" (como object-fit: cover, centrado).
   * foto = {img: imagem aberta pelo pdfkit, w, h} ou null -> espaço neutro.
   * Registra o recorte para o relatório.
   */
  foto(x, y, w, h, foto, r = 0, rotulo = '') {
    const d = this.doc;
    if (!foto || !foto.img || !(foto.w > 0) || !(foto.h > 0)) { this.rect(x, y, w, h, 'ph', r); return; }
    const esc = Math.max(w / foto.w, h / foto.h);
    const dw = foto.w * esc, dh = foto.h * esc;
    const ox = x - (dw - w) / 2, oy = y - (dh - h) / 2;
    d.save();
    if (r > 0) d.roundedRect(x, y, w, h, r).clip(); else d.rect(x, y, w, h).clip();
    try { d.image(foto.img, ox, oy, { width: dw, height: dh }); } catch (e) {
      d.restore(); this.rect(x, y, w, h, 'ph', r); this.aviso(`foto falhou ao desenhar: ${e.message}`); return;
    }
    d.restore();
    if (this.recortes) {
      this.recortes.push({
        slot: rotulo, foto: foto.nome, caixa: `${Math.round(w)}×${Math.round(h)}`,
        corteH: Math.round((1 - w / dw) * 100), corteV: Math.round((1 - h / dh) * 100),
        dpi: Math.round((foto.wReduzida || foto.w) / dw * 72),
      });
    }
  }

  /** Moldura arredondada + foto interna (modelo E). */
  moldura(x, y, w, h, foto, pad = 10, ro = 26, ri = 18, rot = '') {
    this.rect(x, y, w, h, 'secundaria', ro);
    this.foto(x + pad, y + pad, w - 2 * pad, h - 2 * pad, foto, ri, rot);
  }

  /** Logo: imagem do KIT (contida na forma) ou inicial do nome. */
  logo(x, y, s, forma, r, fill, kit) {
    const d = this.doc;
    const nome = (kit && kit.marca) || '';
    if (kit && kit.logoImg) {
      d.save();
      if (forma === 'circle') d.circle(x + s / 2, y + s / 2, s / 2).clip(); else d.roundedRect(x, y, s, s, r || 0.001).clip();
      try { d.image(kit.logoImg, x, y, { fit: [s, s], align: 'center', valign: 'center' }); } catch (e) { this.aviso('logo inválido'); }
      d.restore();
      return;
    }
    d.save().fillColor(this.cor(fill));
    if (forma === 'circle') d.circle(x + s / 2, y + s / 2, s / 2).fill();
    else if (r > 0) d.roundedRect(x, y, s, s, r).fill(); else d.rect(x, y, s, s).fill();
    d.restore();
    const ini = (nome || '?').trim().charAt(0).toUpperCase();
    const fs = Math.round(s * 0.56);
    const b = this.base('t', this.logoWt, fs, 1);
    const w = this.larg(ini, 't', this.logoWt, fs);
    this.fonte('t', this.logoWt);
    d.fillColor(this.cor('sobre-' + fill)).fontSize(fs)
      .text(ini, x + (s - w) / 2, y + (s - fs) / 2 + b, { lineBreak: false, baseline: 'alphabetic' });
  }

  /** Logo + nome da marca (item de fluxo). Sem marca: some. */
  marca(kit, o) {
    if (!kit || !kit.marca) return null;
    const m = this;
    const nome = this.T(kit.marca, { s: o.nm, wt: o.wt, c: o.c, f: 'b' });
    return {
      mt: o.mt || 0,
      lay() {
        const L = nome.lay(800);
        const h = Math.max(o.s, L.h);
        return {
          h, base: h, wNat: o.s + o.gap + L.wNat,
          draw(x, y) {
            m.logo(x, y + (h - o.s) / 2, o.s, o.forma, o.r, o.fill, kit);
            L.draw(x + o.s + o.gap, y + (h - L.h) / 2, L.wNat);
          },
        };
      },
    };
  }

  /** QR desenhado em vetor: módulos qr-escuro sobre qr-claro, margem de 4 módulos. */
  qr(matriz, x, y, mod, raio = 0) {
    const n = matriz.size, q = 4, size = (n + 2 * q) * mod;
    this.rect(x, y, size, size, 'qr-claro', raio);
    const d = this.doc;
    d.save().fillColor(this.cor('qr-escuro'));
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (matriz.get(r, c)) {
          let k = c; while (k < n && matriz.get(r, k)) k++;
          d.rect(x + (c + q) * mod, y + (r + q) * mod, (k - c) * mod, mod);
          c = k;
        } else c++;
      }
    }
    d.fill().restore();
    return size;
  }

  // ---------------------------------------------------------------- texto corrido paginado
  /**
   * Distribui parágrafos numa caixa (1 ou mais colunas). Devolve {cabe: [...linhas posicionadas], resto: [paragrafos]}.
   * Quebra por palavra: a página termina na última linha (logo, última palavra) que cabe.
   */
  paginar(paras, tb) {
    const cols = tb.cols || 1;
    const cw = cols > 1 ? (tb.w - (cols - 1) * tb.colgap) / cols : tb.w;
    const lhpt = tb.s * tb.lh;
    const f = tb.f || 'b';
    const linhas = []; // {txt, col, y}
    let col = 0, y = 0;
    for (let pi = 0; pi < paras.length; pi++) {
      const ls = this.quebrar(paras[pi], f, tb.wt, tb.s, cw);
      if (pi > 0 && y > 0) y += tb.pgap;
      for (let li = 0; li < ls.length; li++) {
        if (y + lhpt > tb.h + 0.5) {
          col++; y = 0;
          if (col >= cols) {
            const restoPar = ls.slice(li).join(' ');
            return { linhas, resto: [restoPar, ...paras.slice(pi + 1)], cw, lhpt };
          }
        }
        linhas.push({ txt: ls[li], col, y });
        y += lhpt;
      }
    }
    return { linhas, resto: [], cw, lhpt };
  }

  desenharCorpo(res, tb) {
    const f = tb.f || 'b';
    const b = this.base(f, tb.wt, tb.s, tb.lh);
    this.fonte(f, tb.wt);
    this.doc.fillColor(this.cor(tb.c || 'texto')).fillOpacity(1).fontSize(tb.s);
    for (const l of res.linhas) {
      this.doc.text(l.txt, tb.x + l.col * (res.cw + (tb.colgap || 0)), tb.y + l.y + b, { lineBreak: false, baseline: 'alphabetic' });
    }
  }
}

// ============================================================================
// Helpers vetoriais e tipográficos 1:1 Konva <-> pdfkit (Schema JSON v1)
// ============================================================================
const { ICONES_SVG } = require('./icones');

const KAPPA_ARC = 0.5522847498;
const TOKENS_RECONHECIDOS = new Set([
  '{nome}', '{nomeKicker}', '{nomeDestaque}', '{tipo}', '{negociacao}', '{preco}', '{precoRotulo}',
  '{bairro}', '{cidade}', '{localizacao}', '{area}', '{areaTotal}',
  '{quartos}', '{suites}', '{vagas}', '{destaques}', '{descricao}',
  '{codigo}', '{marca}', '{corretor}', '{creci}', '{telefone}',
  '{email}', '{rodape}'
]);

function separarNomeKickerDestaque(nome) {
  const s = String(nome || '').trim();
  if (!s) return { kicker: '', destaque: '' };
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { kicker: '', destaque: s };
  const last = words[words.length - 1];
  if (last.length <= 2 && words.length >= 3) {
    return {
      kicker: words.slice(0, -2).join(' '),
      destaque: words.slice(-2).join(' ')
    };
  }
  return {
    kicker: words.slice(0, -1).join(' '),
    destaque: last
  };
}

function calcularPontosDegrade(w, h, anguloDeg = 180) {
  const deg = Number.isFinite(Number(anguloDeg)) ? Number(anguloDeg) : 180;
  const a = degParaRad(deg - 90);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const r = (Math.abs(cos) * w + Math.abs(sin) * h) / 2;
  return {
    start: { x: w / 2 - cos * r, y: h / 2 - sin * r },
    end: { x: w / 2 + cos * r, y: h / 2 + sin * r }
  };
}

function construirParadasDegrade(cor1Hex, cor2Hex, op = 1) {
  const p1 = parseCorHex(cor1Hex || '#00000000', '#00000000');
  const p2 = parseCorHex(cor2Hex || '#000000cc', '#000000cc');
  let hex1 = p1.hex;
  let hex2 = p2.hex;
  const a1 = clampNum(p1.alpha * op, 0, 1);
  const a2 = clampNum(p2.alpha * op, 0, 1);
  if (a1 <= 0.001 && a2 > 0.001) hex1 = hex2;
  else if (a2 <= 0.001 && a1 > 0.001) hex2 = hex1;

  if (a1 <= 0.001 && a2 > 0.001) {
    return [
      [0, hex1, 0],
      [0.25, hex2, a2 * 0.14],
      [0.5, hex2, a2 * 0.44],
      [0.75, hex2, a2 * 0.78],
      [1, hex2, a2]
    ];
  }
  if (a2 <= 0.001 && a1 > 0.001) {
    return [
      [0, hex1, a1],
      [0.25, hex1, a1 * 0.78],
      [0.5, hex1, a1 * 0.44],
      [0.75, hex1, a1 * 0.14],
      [1, hex2, 0]
    ];
  }
  return [
    [0, hex1, a1],
    [1, hex2, a2]
  ];
}

function clampNum(v, a, b) {
  const n = Number(v);
  if (!Number.isFinite(n)) return a;
  return Math.min(b, Math.max(a, n));
}

function degParaRad(deg) {
  return (Number(deg) || 0) * Math.PI / 180;
}

function aliasFonteSeguro(familia, peso = 400, italico = false) {
  const s = String(familia ?? '').trim().replace(/\s+/g, ' ');
  const fam = /^[A-Za-z0-9 ]{1,60}$/.test(s) ? s.replace(/\s+/g, '') : 'Archivo';
  const nPeso = Number(peso);
  const p = Number.isFinite(nPeso) && nPeso > 0 ? Math.min(1000, Math.max(100, Math.round(nPeso))) : 400;
  return `${fam}-${p}${italico ? '-italic' : ''}`;
}

function parseCorHex(hex, fallback = '#ffffff') {
  const raw = String(hex ?? '').trim();
  const m3 = raw.match(/^#([0-9a-f]{3})$/i);
  if (m3) {
    const h = m3[1];
    return { hex: `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase(), alpha: 1 };
  }
  const m = raw.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (m) {
    const alpha = m[2] ? parseInt(m[2], 16) / 255 : 1;
    return { hex: `#${m[1]}`.toLowerCase(), alpha };
  }
  if (fallback && fallback !== hex) return parseCorHex(fallback, '#ffffff');
  return { hex: '#ffffff', alpha: 1 };
}

function obterRaiosCamada(c) {
  if (Array.isArray(c?.raios) && c.raios.length === 4) {
    return c.raios.map(v => Math.max(0, Number(v) || 0));
  }
  const r = Math.max(0, Number(c?.raio) || 0);
  return [r, r, r, r];
}

function construirMatrizCamada(c) {
  if (Array.isArray(c?.matrix) && c.matrix.length === 6 && c.matrix.every(v => Number.isFinite(Number(v)))) {
    return c.matrix.map(Number);
  }
  const r = degParaRad(c?.rot || 0);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const kx = Math.tan(degParaRad(clampNum(c?.skewX || 0, -60, 60)));
  const ky = Math.tan(degParaRad(clampNum(c?.skewY || 0, -60, 60)));
  return [
    cos - sin * ky,
    sin + cos * ky,
    cos * kx - sin,
    sin * kx + cos,
    Number(c?.x) || 0,
    Number(c?.y) || 0
  ];
}

function aplicarMatriz2D(m, x, y) {
  return {
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5]
  };
}

function emitirRetanguloRaios(doc, x, y, w, h, raios, matrix = null) {
  const maxR = Math.min(w, h) / 2;
  const arr = Array.isArray(raios) && raios.length === 4 ? raios : [0, 0, 0, 0];
  const tl = clampNum(arr[0], 0, maxR);
  const tr = clampNum(arr[1], 0, maxR);
  const br = clampNum(arr[2], 0, maxR);
  const bl = clampNum(arr[3], 0, maxR);
  const pt = (px, py) => (matrix ? aplicarMatriz2D(matrix, px, py) : { x: px, y: py });

  const p0 = pt(x + tl, y);
  doc.moveTo(p0.x, p0.y);

  const p1 = pt(x + w - tr, y);
  doc.lineTo(p1.x, p1.y);
  if (tr > 0) {
    const c1 = pt(x + w - tr + tr * KAPPA_ARC, y);
    const c2 = pt(x + w, y + tr - tr * KAPPA_ARC);
    const p2 = pt(x + w, y + tr);
    doc.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p2.x, p2.y);
  }

  const p3 = pt(x + w, y + h - br);
  doc.lineTo(p3.x, p3.y);
  if (br > 0) {
    const c1 = pt(x + w, y + h - br + br * KAPPA_ARC);
    const c2 = pt(x + w - br + br * KAPPA_ARC, y + h);
    const p4 = pt(x + w - br, y + h);
    doc.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p4.x, p4.y);
  }

  const p5 = pt(x + bl, y + h);
  doc.lineTo(p5.x, p5.y);
  if (bl > 0) {
    const c1 = pt(x + bl - bl * KAPPA_ARC, y + h);
    const c2 = pt(x, y + h - bl + bl * KAPPA_ARC);
    const p6 = pt(x, y + h - bl);
    doc.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p6.x, p6.y);
  }

  const p7 = pt(x, y + tl);
  doc.lineTo(p7.x, p7.y);
  if (tl > 0) {
    const c1 = pt(x, y + tl - tl * KAPPA_ARC);
    const c2 = pt(x + tl - tl * KAPPA_ARC, y);
    doc.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p0.x, p0.y);
  }

  doc.closePath();
}

function emitirElipseMatriz(doc, cx, cy, rx, ry, matrix = null) {
  if (!matrix) {
    doc.ellipse(cx, cy, rx, ry);
    return;
  }
  const kx = rx * KAPPA_ARC;
  const ky = ry * KAPPA_ARC;
  const pt = (px, py) => aplicarMatriz2D(matrix, px, py);
  const top = pt(cx, cy - ry);
  const right = pt(cx + rx, cy);
  const bottom = pt(cx, cy + ry);
  const left = pt(cx - rx, cy);

  doc.moveTo(top.x, top.y);
  let c1 = pt(cx + kx, cy - ry), c2 = pt(cx + rx, cy - ky);
  doc.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, right.x, right.y);
  c1 = pt(cx + rx, cy + ky); c2 = pt(cx + kx, cy + ry);
  doc.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, bottom.x, bottom.y);
  c1 = pt(cx - kx, cy + ry); c2 = pt(cx - rx, cy + ky);
  doc.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, left.x, left.y);
  c1 = pt(cx - rx, cy - ky); c2 = pt(cx - kx, cy - ry);
  doc.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, top.x, top.y);
  doc.closePath();
}

function formatarBrlStudio(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 'Consulte';
  return `R$ ${Math.round(n).toLocaleString('pt-BR')}`;
}

function formatarFoneStudio(fone) {
  const n = String(fone || '').replace(/\D/g, '');
  if (n.length === 13 && n.startsWith('55')) return `(${n.slice(2, 4)}) ${n.slice(4, 9)}-${n.slice(9)}`;
  if (n.length === 12 && n.startsWith('55')) return `(${n.slice(2, 4)}) ${n.slice(4, 8)}-${n.slice(8)}`;
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return String(fone || '').trim();
}

function resolverDadosParaTokens(dados = {}, kit = {}) {
  const d = dados && typeof dados === 'object' ? dados : {};
  const k = kit && typeof kit === 'object' ? kit : {};

  const negRaw = String(d.negociacao || d.neg || 'VENDA').trim().toUpperCase();
  const negLabels = new Map([
    ['VENDA', 'Venda'],
    ['AGIO', 'Ágio'],
    ['ALUGUEL', 'Aluguel'],
    ['VENDA_ALUGUEL', 'Venda ou aluguel']
  ]);
  const negociacao = negLabels.get(negRaw) || (d.negociacao || d.neg ? String(d.negociacao || d.neg) : 'Venda');
  const tipo = d.tipo ? String(d.tipo) : 'Imóvel';
  const bairro = d.setor ? String(d.setor) : '';
  const cidade = d.cidade ? String(d.cidade) : (Object.keys(d).length ? 'Goiânia' : '');
  const localizacao = [bairro, cidade].filter(Boolean).join(', ');

  const nome = d.titulo
    ? String(d.titulo)
    : (d.edificio ? String(d.edificio) : (bairro ? `${tipo} no ${bairro}` : tipo));
  const { kicker: nomeKicker, destaque: nomeDestaque } = separarNomeKickerDestaque(nome);

  let preco = '';
  let precoRotulo = negociacao;
  if (d.agio && String(d.agio).trim()) {
    preco = String(d.agio).trim();
    precoRotulo = 'Ágio';
  } else if (negRaw === 'AGIO' && Number(d.valor_agio) > 0) {
    preco = formatarBrlStudio(d.valor_agio);
    precoRotulo = 'Ágio';
  } else if (d.preco !== undefined && d.preco !== null && String(d.preco).trim()) {
    preco = String(d.preco).trim();
    if (negRaw === 'AGIO' || /agio|ágio/i.test(preco)) precoRotulo = 'Ágio';
  } else if (typeof d.valor === 'string' && d.valor.trim() && !/^\d+(\.\d+)?$/.test(d.valor.trim())) {
    preco = d.valor.trim();
  } else if (Number(d.valor) > 0) {
    preco = negRaw === 'ALUGUEL' ? `${formatarBrlStudio(d.valor)}/mês` : formatarBrlStudio(d.valor);
  } else {
    preco = 'Consulte';
  }

  const fmtM2 = val => {
    if (val === undefined || val === null) return '';
    const s = String(val).trim();
    if (!s || s === '0') return '';
    return s.includes('m²') ? s : `${s} m²`;
  };
  const area = fmtM2(d.area !== undefined && d.area !== '' ? d.area : d.tamanho_m2);
  const areaTotal = fmtM2(d.terreno || d.area_terreno || d.area || d.tamanho_m2);
  const numStr = val => (val !== undefined && val !== null && String(val).trim() !== '' && Number(val) !== 0 ? String(val) : '');

  let destaquesStr = '';
  if (typeof d.destaques === 'string' && d.destaques.trim()) {
    destaquesStr = d.destaques.trim();
  } else {
    const lista = [];
    if (d.permuta === true || String(d.aceita_permuta).toUpperCase() === 'SIM') lista.push('Aceita permuta');
    if (d.financ === true || String(d.aceita_financiamento).toUpperCase() === 'SIM') lista.push('Aceita financiamento');
    if (d.lazer === true || String(d.lazer).toUpperCase() === 'SIM') lista.push('Área de lazer');
    if (d.mobiliado === 'SIM' || d.mobiliado === 'Mobiliado') lista.push('Mobiliado');
    else if (d.mobiliado === 'SEMI' || d.mobiliado === 'Armários') lista.push('Com armários');
    if (Array.isArray(d.feats)) {
      d.feats.map(x => String(x || '').trim()).filter(Boolean).forEach(x => lista.push(x));
    } else if (d.caracteristicas) {
      String(d.caracteristicas).split(/[,;\n]/).map(s => s.trim()).filter(Boolean).forEach(s => lista.push(s));
    }
    destaquesStr = [...new Set(lista)].slice(0, 6).join(' · ');
  }

  const descricao = String(d.desc !== undefined ? d.desc : (d.descricao || ''));
  const codigo = d.id !== undefined && d.id !== null && String(d.id).trim() !== '' ? `#${d.id}` : '';
  const marca = k.marca ? String(k.marca) : 'BIGA';
  const corretor = d.corretor ? String(d.corretor) : (k.corretor ? String(k.corretor) : '');
  const creci = d.creci ? String(d.creci) : (k.creci ? String(k.creci) : '');
  const rawFone = d.fone || d.telefone || k.telefone || '';
  const telefone = formatarFoneStudio(rawFone);
  const email = d.email ? String(d.email) : (k.email ? String(k.email) : '');
  const rodape = d.rodape ? String(d.rodape) : (k.rodape ? String(k.rodape) : '');

  return {
    '{nome}': nome,
    '{nomeKicker}': nomeKicker,
    '{nomeDestaque}': nomeDestaque,
    '{tipo}': tipo,
    '{negociacao}': negociacao,
    '{preco}': preco,
    '{precoRotulo}': precoRotulo,
    '{bairro}': bairro,
    '{cidade}': cidade,
    '{localizacao}': localizacao,
    '{area}': area,
    '{areaTotal}': areaTotal,
    '{quartos}': numStr(d.quartos),
    '{suites}': numStr(d.suites),
    '{vagas}': numStr(d.vagas),
    '{destaques}': destaquesStr,
    '{descricao}': descricao,
    '{codigo}': codigo,
    '{marca}': marca,
    '{corretor}': corretor,
    '{creci}': creci,
    '{telefone}': telefone,
    '{email}': email,
    '{rodape}': rodape
  };
}

function substituirTokens(texto, vars) {
  const mapa = vars && typeof vars === 'object' ? vars : {};
  const temToken = s => /\{[A-Za-z0-9_]+\}/.test(s);
  const resolverUm = s => String(s ?? '').replace(/\{[A-Za-z0-9_]+\}/g, tk => {
    if (Object.prototype.hasOwnProperty.call(mapa, tk)) return String(mapa[tk] ?? '');
    if (TOKENS_RECONHECIDOS.has(tk)) return '';
    return tk;
  });
  const limparVirgulas = s => s
    .replace(/\s*,\s*,\s*/g, ', ')
    .replace(/^\s*,\s*/, '')
    .replace(/\s*,\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const linhas = String(texto ?? '').split('\n');
  const outLinhas = [];
  for (const linha of linhas) {
    if (!temToken(linha)) {
      outLinhas.push(linha);
      continue;
    }
    const parts = linha.split(/(\s+[·|•–—-]\s+|\s*[·|•]\s*)/);
    if (parts.length > 1) {
      const keptSegs = [];
      const seps = [];
      for (let i = 0; i < parts.length; i += 2) {
        const seg = parts[i];
        const sep = parts[i + 1] || '';
        if (!temToken(seg)) {
          const clean = limparVirgulas(seg);
          if (clean) {
            keptSegs.push(clean);
            seps.push(sep);
          }
        } else {
          const tks = seg.match(/\{[A-Za-z0-9_]+\}/g) || [];
          const algumPreenchido = tks.some(tk => resolverUm(tk).trim() !== '');
          if (algumPreenchido) {
            const resolvedSeg = limparVirgulas(resolverUm(seg));
            if (resolvedSeg) {
              keptSegs.push(resolvedSeg);
              seps.push(sep);
            }
          }
        }
      }
      if (keptSegs.length) {
        let joined = keptSegs[0];
        for (let j = 1; j < keptSegs.length; j++) {
          const rawSep = seps[j - 1] || ' · ';
          const sepNorm = /^\s+$/.test(rawSep) ? ' · ' : ` ${rawSep.trim()} `;
          joined += sepNorm + keptSegs[j];
        }
        outLinhas.push(joined);
      }
    } else {
      const tks = linha.match(/\{[A-Za-z0-9_]+\}/g) || [];
      const algumPreenchido = tks.some(tk => resolverUm(tk).trim() !== '');
      if (algumPreenchido) {
        const resolved = limparVirgulas(resolverUm(linha));
        if (resolved) outLinhas.push(resolved);
      }
    }
  }
  return outLinhas.join('\n');
}

function quebrarLinhasPdfKit(doc, texto, maxW, textOpts) {
  const linhas = [];
  for (const par of String(texto ?? '').split('\n')) {
    const ws = par.split(/\s+/).filter(Boolean);
    if (!ws.length) {
      linhas.push('');
      continue;
    }
    let cur = ws[0];
    for (let i = 1; i < ws.length; i++) {
      const tent = `${cur} ${ws[i]}`;
      if (doc.widthOfString(tent, textOpts) <= maxW + 0.01) cur = tent;
      else {
        linhas.push(cur);
        cur = ws[i];
      }
    }
    linhas.push(cur);
  }
  return linhas;
}

function calcularAutoFitPdfKit(doc, texto, baseSize, maxW, maxH, entrelinha, textOpts) {
  let sz = Number(baseSize) || 40;
  const words = String(texto ?? '').split(/\s+/).filter(Boolean);
  while (sz > 8) {
    doc.fontSize(sz);
    let tooWide = false;
    for (const w of words) {
      if (doc.widthOfString(w, textOpts) > maxW + 0.01) {
        tooWide = true;
        break;
      }
    }
    if (!tooWide) {
      const lines = quebrarLinhasPdfKit(doc, texto, maxW, textOpts);
      if (lines.length * sz * entrelinha <= maxH + 1) break;
    }
    sz = Math.max(8, sz - 2);
  }
  return sz;
}

function escolherFonteRegistrada(fontesRegistradas, familia, peso, italico) {
  const ideal = aliasFonteSeguro(familia, peso, italico);
  if (fontesRegistradas.has(ideal)) return ideal;
  const semIt = aliasFonteSeguro(familia, peso, false);
  if (fontesRegistradas.has(semIt)) return semIt;

  const prefixo = `${aliasFonteSeguro(familia, 400, false).split('-')[0]}-`;
  const pAlvo = Number(peso) || 400;
  const daFamilia = [...fontesRegistradas]
    .filter(k => k.startsWith(prefixo))
    .sort((a, b) => {
      const wa = parseInt(a.split('-')[1], 10) || 400;
      const wb = parseInt(b.split('-')[1], 10) || 400;
      return Math.abs(wa - pAlvo) - Math.abs(wb - pAlvo);
    });
  if (daFamilia.length) return daFamilia[0];

  for (const fb of ['Archivo-400', 'Jost-500', 'Jost-300', 'WorkSans-400']) {
    if (fontesRegistradas.has(fb)) return fb;
  }
  const first = fontesRegistradas.values().next().value;
  return first || 'Helvetica';
}

module.exports = {
  Motor,
  NBSP,
  ICONES_SVG,
  clampNum,
  degParaRad,
  calcularPontosDegrade,
  construirParadasDegrade,
  separarNomeKickerDestaque,
  aliasFonteSeguro,
  parseCorHex,
  obterRaiosCamada,
  construirMatrizCamada,
  aplicarMatriz2D,
  emitirRetanguloRaios,
  emitirElipseMatriz,
  resolverDadosParaTokens,
  substituirTokens,
  quebrarLinhasPdfKit,
  calcularAutoFitPdfKit,
  escolherFonteRegistrada
};
