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
    if (!ws.includes(wt)) {
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
    for (const ch of txt) {
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
    if (!foto || !foto.img) { this.rect(x, y, w, h, 'ph', r); return; }
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

module.exports = { Motor, NBSP };
