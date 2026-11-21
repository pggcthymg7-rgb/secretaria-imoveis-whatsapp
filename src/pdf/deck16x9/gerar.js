'use strict';
// Gerador: monta o PDF de um imóvel num modelo. Sem fs: recebe fontes e fotos como buffers,
// por isso o mesmo código roda no Node (casos de teste) e no navegador (mini-editor).
const {
  Motor,
  ICONES_SVG,
  clampNum,
  degParaRad,
  parseCorHex,
  calcularPontosDegrade,
  construirParadasDegrade,
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
} = require('./motor');
const { derivar } = require('./kit');
const { MODELOS } = require('./modelos');
const { waLink, formatarFone, paragrafos, VAZIO } = require('./dados');

const LIMITE_PAGINAS = 14;
const MAX_GALERIA = 10;

/** Fontes compatíveis por modelo (proposta; o João aprova). A fonte do KIT troca só o papel "marca". */
const COMPATIVEIS = {
  A: ['Jost', 'Montserrat', 'Outfit'],
  B: ['CormorantGaramond', 'PlayfairDisplay', 'EBGaramond'],
  D: ['ArchivoBlack', 'Anton', 'AlfaSlabOne'],
  E: ['Lora', 'Merriweather', 'LibreBaskerville'],
  F: ['BodoniModa', 'LibreBodoni', 'PlayfairDisplay'],
};

function paginasPadrao(nFotos) {
  const p = [{ tipo: 'capa' }, { tipo: 'resumo' }];
  if (nFotos > 1) p.push({ tipo: 'foto', foto: 1 });
  const resto = [];
  for (let i = 2; i < nFotos && resto.length < MAX_GALERIA; i++) resto.push(i);
  if (resto.length) p.push({ tipo: 'galeria', fotos: resto });
  p.push({ tipo: 'texto' }, { tipo: 'contato' });
  return p;
}

/**
 * @param PDFDocument classe do pdfkit
 * @param QRCode      módulo qrcode
 * @param e.modelo    'A' | 'B' | 'D' | 'E' | 'F'
 * @param e.paleta    'principal' | 'segunda'
 * @param e.kit       {marca, logo (buffer png/jpg), cores {5}, fonte (família)}
 * @param e.dados     campos do imóvel (ver dados.VAZIO)
 * @param e.fotos     [{buf, w, h, nome}] já reduzidas (JPEG), ou null para foto inválida
 * @param e.paginas   lista opcional de páginas; padrão = 6 páginas
 * @param e.fontes    {'Familia-peso': buffer}
 * @returns {doc, info} doc é um PDFDocument já finalizado (doc.end() chamado)
 */
function gerar(PDFDocument, QRCode, e) {
  const M = Object.prototype.hasOwnProperty.call(MODELOS, e.modelo) ? MODELOS[e.modelo] : null;
  if (!M) throw new Error('modelo desconhecido: ' + e.modelo);
  const d = { ...VAZIO, ...e.dados };
  const kit = { ...(e.kit || {}) };
  const avisos = [];

  // paleta: KIT (5 cores) ou a do modelo; a "segunda" usa a paleta 2 do modelo
  const base = e.paleta === 'segunda' ? M.pal2 : (kit.cores || M.pal1);
  const pal = derivar(base);

  // fontes
  const pesos = {};
  for (const k of Object.keys(e.fontes)) {
    const i = k.lastIndexOf('-'); const fam = k.slice(0, i); const w = +k.slice(i + 1);
    (pesos[fam] = pesos[fam] || []).push(w);
  }
  let famMarca = M.fontes.t;
  if (kit.fonte && kit.fonte !== famMarca) {
    if (!COMPATIVEIS[M.id].includes(kit.fonte)) avisos.push(`fonte ${kit.fonte} fora da lista do modelo ${M.id}; mantida ${famMarca}`);
    else if (!M.pesosMarca.every((w) => (pesos[kit.fonte] || []).includes(w))) avisos.push(`fonte ${kit.fonte} sem os pesos ${M.pesosMarca}; mantida ${famMarca}`);
    else famMarca = kit.fonte;
  }
  const fam = { t: famMarca, b: M.fontes.b, s: M.fontes.s };

  const doc = new PDFDocument({ size: [1152, 648], margin: 0, autoFirstPage: false, compress: true,
    info: { Title: d.edificio || d.tipo || 'Apresentação do imóvel', Producer: 'BIGA protótipo', Creator: 'BIGA protótipo' } });
  for (const [k, buf] of Object.entries(e.fontes)) {
    const f = k.slice(0, k.lastIndexOf('-'));
    if (f === fam.t || f === fam.b || f === fam.s) doc.registerFont(k, buf);
  }

  // fotos: abre cada uma uma única vez (reutiliza o objeto entre páginas)
  const fotos = (e.fotos || []).map((f, i) => {
    if (!f || !f.buf) return null;
    try { return { img: doc.openImage(f.buf), w: f.w, h: f.h, nome: f.nome || `foto ${i + 1}`, wReduzida: f.w }; } catch (err) {
      avisos.push(`foto ${i + 1} inválida (${err.message}): espaço neutro`); return null;
    }
  });
  if (kit.logo) { try { kit.logoImg = doc.openImage(kit.logo); } catch (err) { avisos.push('logo inválido: usada a inicial'); } }

  const m = new Motor(doc, { pal, fam, pesos, logoWt: M.logoWt, avisos, recortes: e.recortes || null, medidas: e.medidas || [] });
  const fone = d.fone ? formatarFone(d.fone) : '';
  const url = d.fone ? waLink(d.fone) : '';
  const ctx = {
    fone,
    qr: url ? QRCode.create(url, { errorCorrectionLevel: 'M' }).modules : null,
    foto: (i) => fotos[i] || null,
    fotoTexto: fotos[2] || fotos[1] || fotos[0] || null,
  };
  if (d.fone && !url) avisos.push('telefone sem dígitos suficientes: QR omitido');

  let paginas = e.paginas || paginasPadrao(fotos.length);
  const nova = () => { doc.addPage({ size: [1152, 648], margin: 0 }); m.rect(0, 0, 1152, 648, 'fundo'); };
  let total = 0;
  const pular = (motivo) => avisos.push(motivo);

  for (const p of paginas) {
    if (total >= LIMITE_PAGINAS) { pular(`limite de ${LIMITE_PAGINAS} páginas: página "${p.tipo}" e seguintes omitidas`); break; }
    if (p.tipo === 'texto') {
      let paras = paragrafos(p.texto !== undefined ? p.texto : d.desc);
      if (!paras.length) { pular('descrição vazia: página de texto omitida'); continue; }
      let cont = false, guard = 0;
      while (paras.length && guard++ < 8) {
        if (total >= LIMITE_PAGINAS) { pular('limite de páginas atingido na continuação do texto'); break; }
        const res = m.paginar(paras, M.tb);
        if (!res.linhas.length) { pular('texto não coube'); break; }
        nova(); ctx.titulo = p.titulo; M.texto(m, d, kit, ctx, res, cont); total++;
        paras = res.resto; cont = true;
      }
      continue;
    }
    if (p.tipo === 'galeria') {
      const fs = (p.fotos || []).slice(0, MAX_GALERIA).map((i) => fotos[i] || null);
      if (!fs.length) { pular('galeria sem fotos: página omitida'); continue; }
      nova(); M.galeria(m, d, kit, ctx, fs); total++; continue;
    }
    if (p.tipo === 'foto') { nova(); M.foto(m, d, kit, ctx, fotos[p.foto] || null); total++; continue; }
    if (p.tipo === 'contato') {
      const temNome = Boolean(String(d.corretor || '').trim());
      const temFone = Boolean(String(d.fone || '').trim());
      if (!temNome && !temFone) {
        pular('sem nome e sem telefone: página de contato omitida');
        continue;
      }
      nova(); M.contato(m, d, kit, ctx); total++; continue;
    }
    if (p.tipo === 'capa' || p.tipo === 'resumo') { nova(); M[p.tipo](m, d, kit, ctx); total++; continue; }
    pular('tipo de página desconhecido: ' + p.tipo);
  }
  if (!total) { nova(); M.capa(m, d, kit, ctx); total = 1; }
  doc.end();
  return { doc, info: { paginas: total, avisos, fonteMarca: fam.t, medidas: m.medidas } };
}

function decodificarDataImage(src) {
  if (typeof src !== 'string') return null;
  const m = src.trim().match(/^data:image\/(?:png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if (!m) return null;
  try { return Buffer.from(m[1], 'base64'); } catch { return null; }
}

/**
 * Gera o PDF vetorial híbrido a partir de uma Cena JSON v1 (1152 × 648 pt) com paridade 1:1 Konva <-> pdfkit.
 * Suporta Modo A (telemetria exata do Konva) e Modo B (cálculo determinístico headless).
 */
function gerarDeCena(PDFDocument, QRCode, { cena, dados = {}, kit = {}, fotos = [], fotosPorCamada = null, fontesResolvidas = {} } = {}) {
  if (!cena || typeof cena !== 'object') throw new Error('Cena inválida para geração');
  const W = Number(cena.largura) || 1152;
  const H = Number(cena.altura) || 648;
  const avisos = [];
  const telemetriaStats = { modoA: 0, modoB: 0 };

  const dTokens = resolverDadosParaTokens(dados, kit);
  const doc = new PDFDocument({
    size: [W, H],
    margin: 0,
    autoFirstPage: false,
    compress: true,
    info: {
      Title: String(dTokens['{nome}'] || dados.edificio || dados.tipo || cena.nome || 'Apresentação do imóvel'),
      Producer: 'BIGA Studio PDF',
      Creator: 'BIGA Studio PDF'
    }
  });

  // Registra fontes resolvidas (aliases sem espaço)
  const fontesRegistradas = new Set();
  const entriesFontes = fontesResolvidas instanceof Map
    ? [...fontesResolvidas.entries()]
    : Object.entries(fontesResolvidas || {});
  for (const [alias, buf] of entriesFontes) {
    if (Buffer.isBuffer(buf) && buf.length >= 64) {
      try {
        doc.registerFont(alias, buf);
        fontesRegistradas.add(alias);
      } catch (err) {
        avisos.push(`fonte ${alias} ignorada: ${err.message}`);
      }
    }
  }

  // Abre fotos reutilizáveis uma única vez
  const fotosAbertas = (fotos || []).map((f, i) => {
    if (!f || !f.buf) return null;
    try {
      const img = doc.openImage(f.buf);
      return { img, w: f.w || img.width, h: f.h || img.height, nome: f.nome || `foto ${i + 1}` };
    } catch (err) {
      avisos.push(`foto ${i + 1} inválida (${err.message})`);
      return null;
    }
  });

  // Abre fotos já recortadas/filtradas por camada (vindas do sharp no worker.js)
  const fotosCamadaAbertas = new Map();
  const entriesCam = fotosPorCamada instanceof Map
    ? [...fotosPorCamada.entries()]
    : Object.entries(fotosPorCamada || {});
  for (const [key, item] of entriesCam) {
    const buf = Buffer.isBuffer(item) ? item : item?.buf;
    if (!Buffer.isBuffer(buf) || !buf.length) continue;
    try {
      const img = doc.openImage(buf);
      fotosCamadaAbertas.set(key, { img, w: item?.w || img.width, h: item?.h || img.height });
    } catch {}
  }

  // Logo do kit
  let kitLogoImg = null;
  if (kit && kit.logo) {
    try { kitLogoImg = doc.openImage(kit.logo); } catch { avisos.push('logo do kit inválido: usando monograma'); }
  }
  const customImgCache = new Map();
  const abrirDataImg = src => {
    if (!src) return null;
    if (customImgCache.has(src)) return customImgCache.get(src);
    let opened = null;
    const buf = decodificarDataImage(src);
    if (buf) {
      try { opened = doc.openImage(buf); } catch {}
    }
    customImgCache.set(src, opened);
    return opened;
  };

  const slides = (Array.isArray(cena.slides) ? cena.slides : []).slice(0, LIMITE_PAGINAS);
  if (!slides.length) throw new Error('Cena sem slides para gerar PDF');

  let paginas = 0;
  for (let slideIdx = 0; slideIdx < slides.length; slideIdx++) {
    const slide = slides[slideIdx];
    if (!slide || typeof slide !== 'object') continue;
    doc.addPage({ size: [W, H], margin: 0 });
    paginas++;

    const bg = parseCorHex(slide.fundo || '#0e0e0f', '#0e0e0f');
    if (bg.alpha > 0.001) {
      doc.save().rect(0, 0, W, H).fillColor(bg.hex).fillOpacity(bg.alpha).fill().restore();
    }

    const camadas = Array.isArray(slide.camadas) ? slide.camadas : [];
    for (let camIdx = 0; camIdx < camadas.length; camIdx++) {
      const c = camadas[camIdx];
      if (!c || typeof c !== 'object' || c.visivel === false) continue;
      const op = clampNum(c.opacidade ?? 1, 0, 1);
      if (op <= 0.001) continue;

      const m = construirMatrizCamada(c);
      const w = Math.max(1, Number(c.w) || 100);
      const h = Math.max(1, Number(c.h) || 100);
      const raios = obterRaiosCamada(c);

      if (c.tipo === 'retangulo') {
        const blur = Number(c.blurFundo) || 0;
        const borda = Number(c.borda) || 0;
        doc.save();
        doc.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
        if (blur > 0) {
          const fc = parseCorHex(c.cor || '#ffffff30');
          const fillAlpha = fc.alpha > 0 ? fc.alpha * op : 0.18 * op;
          emitirRetanguloRaios(doc, 0, 0, w, h, raios);
          doc.fillColor(fc.alpha > 0 ? fc.hex : '#ffffff').fillOpacity(fillAlpha).fill();
          if (borda <= 0) {
            emitirRetanguloRaios(doc, 0, 0, w, h, raios);
            doc.lineWidth(1.5).strokeColor('#ffffff').strokeOpacity(0.25 * op).stroke();
          }
        } else {
          const fc = parseCorHex(c.cor || '#5266eb');
          if (fc.alpha * op > 0.001) {
            emitirRetanguloRaios(doc, 0, 0, w, h, raios);
            doc.fillColor(fc.hex).fillOpacity(fc.alpha * op).fill();
          }
        }
        if (borda > 0 && c.strokeScaleEnabled === true) {
          const bc = parseCorHex(c.corBorda || '#ffffff');
          if (bc.alpha * op > 0.001) {
            emitirRetanguloRaios(doc, 0, 0, w, h, raios);
            doc.lineWidth(borda).strokeColor(bc.hex).strokeOpacity(bc.alpha * op).stroke();
          }
        }
        doc.restore();

        if (borda > 0 && c.strokeScaleEnabled !== true) {
          const bc = parseCorHex(c.corBorda || '#ffffff');
          if (bc.alpha * op > 0.001) {
            doc.save();
            emitirRetanguloRaios(doc, 0, 0, w, h, raios, m);
            doc.lineWidth(borda).strokeColor(bc.hex).strokeOpacity(bc.alpha * op).stroke();
            doc.restore();
          }
        }
      } else if (c.tipo === 'circulo') {
        const borda = Number(c.borda) || 0;
        const fc = parseCorHex(c.cor || '#5266eb');
        doc.save();
        doc.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
        if (fc.alpha * op > 0.001) {
          emitirElipseMatriz(doc, w / 2, h / 2, w / 2, h / 2);
          doc.fillColor(fc.hex).fillOpacity(fc.alpha * op).fill();
        }
        if (borda > 0 && c.strokeScaleEnabled === true) {
          const bc = parseCorHex(c.corBorda || '#ffffff');
          if (bc.alpha * op > 0.001) {
            emitirElipseMatriz(doc, w / 2, h / 2, w / 2, h / 2);
            doc.lineWidth(borda).strokeColor(bc.hex).strokeOpacity(bc.alpha * op).stroke();
          }
        }
        doc.restore();

        if (borda > 0 && c.strokeScaleEnabled !== true) {
          const bc = parseCorHex(c.corBorda || '#ffffff');
          if (bc.alpha * op > 0.001) {
            doc.save();
            emitirElipseMatriz(doc, w / 2, h / 2, w / 2, h / 2, m);
            doc.lineWidth(borda).strokeColor(bc.hex).strokeOpacity(bc.alpha * op).stroke();
            doc.restore();
          }
        }
      } else if (c.tipo === 'poligono') {
        const pts = Array.isArray(c.vertices) && c.vertices.length >= 3
          ? c.vertices
          : [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
        const fc = parseCorHex(c.cor || '#5266eb');
        const borda = Number(c.borda) || 0;

        doc.save();
        doc.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
        if (fc.alpha * op > 0.001) {
          doc.moveTo(Number(pts[0].x) || 0, Number(pts[0].y) || 0);
          for (let i = 1; i < pts.length; i++) doc.lineTo(Number(pts[i].x) || 0, Number(pts[i].y) || 0);
          doc.closePath();
          doc.fillColor(fc.hex).fillOpacity(fc.alpha * op).fill();
        }
        if (borda > 0 && c.strokeScaleEnabled === true) {
          const bc = parseCorHex(c.corBorda || '#ffffff');
          if (bc.alpha * op > 0.001) {
            doc.moveTo(Number(pts[0].x) || 0, Number(pts[0].y) || 0);
            for (let i = 1; i < pts.length; i++) doc.lineTo(Number(pts[i].x) || 0, Number(pts[i].y) || 0);
            doc.closePath();
            doc.lineWidth(borda).lineJoin('round').strokeColor(bc.hex).strokeOpacity(bc.alpha * op).stroke();
          }
        }
        doc.restore();

        // CRÍTICO (strokeScaleEnabled === false): transforma vértices no espaço mundo e traça fora do transform
        if (borda > 0 && c.strokeScaleEnabled !== true) {
          const bc = parseCorHex(c.corBorda || '#ffffff');
          if (bc.alpha * op > 0.001) {
            const worldPts = pts.map(p => aplicarMatriz2D(m, Number(p.x) || 0, Number(p.y) || 0));
            doc.save();
            doc.moveTo(worldPts[0].x, worldPts[0].y);
            for (let i = 1; i < worldPts.length; i++) doc.lineTo(worldPts[i].x, worldPts[i].y);
            doc.closePath();
            doc.lineWidth(borda).lineJoin('round').strokeColor(bc.hex).strokeOpacity(bc.alpha * op).stroke();
            doc.restore();
          }
        }
      } else if (c.tipo === 'linha') {
        const pts = Array.isArray(c.pontos) && c.pontos.length >= 4 ? c.pontos : [0, h / 2, w, h / 2];
        const sc = parseCorHex(c.cor || '#ffffff');
        if (sc.alpha * op > 0.001) {
          const esp = Number(c.espessura) || 4;
          doc.save();
          if (c.strokeScaleEnabled === true) {
            doc.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
            doc.moveTo(Number(pts[0]) || 0, Number(pts[1]) || 0);
            for (let i = 2; i < pts.length; i += 2) doc.lineTo(Number(pts[i]) || 0, Number(pts[i + 1]) || 0);
          } else {
            const p0 = aplicarMatriz2D(m, Number(pts[0]) || 0, Number(pts[1]) || 0);
            doc.moveTo(p0.x, p0.y);
            for (let i = 2; i < pts.length; i += 2) {
              const pi = aplicarMatriz2D(m, Number(pts[i]) || 0, Number(pts[i + 1]) || 0);
              doc.lineTo(pi.x, pi.y);
            }
          }
          doc.lineWidth(esp).lineCap(c.ponta || 'round').lineJoin('round').strokeColor(sc.hex).strokeOpacity(sc.alpha * op);
          if (c.tracejado) {
            const dash = Array.isArray(c.tracejado) ? c.tracejado : [12, 8];
            doc.dash(Number(dash[0]) || 12, { space: Number(dash[1] ?? dash[0]) || 8 });
          }
          doc.stroke();
          if (c.tracejado) doc.undash();
          doc.restore();
        }
      } else if (c.tipo === 'degrade') {
        doc.save();
        doc.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
        const pts = calcularPontosDegrade(w, h, c.angulo);
        const grad = doc.linearGradient(pts.start.x, pts.start.y, pts.end.x, pts.end.y);
        const stops = construirParadasDegrade(c.cor1 || '#00000000', c.cor2 || '#000000cc', op);
        for (const [pos, hexStop, alphaStop] of stops) {
          grad.stop(pos, hexStop, alphaStop);
        }
        emitirRetanguloRaios(doc, 0, 0, w, h, raios);
        doc.fill(grad);
        doc.restore();
      } else if (c.tipo === 'foto') {
        const camKey = `${slideIdx}_${camIdx}_${c.id}`;
        const borda = Number(c.borda) || 0;
        doc.save();
        doc.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
        doc.opacity(op);
        if (fotosCamadaAbertas.has(camKey)) {
          const entry = fotosCamadaAbertas.get(camKey);
          try {
            doc.image(entry.img, 0, 0, { width: w, height: h });
          } catch {
            emitirRetanguloRaios(doc, 0, 0, w, h, raios);
            doc.fillColor('#272736').fillOpacity(op).fill();
          }
        } else {
          let fImg = null;
          let fw = 0;
          let fh = 0;
          if (c.fotoCustom) {
            const custom = abrirDataImg(c.fotoCustom);
            if (custom) { fImg = custom; fw = custom.width; fh = custom.height; }
          }
          if (!fImg) {
            const fObj = fotosAbertas[Number(c.indiceFoto) || 0] || fotosAbertas[0] || null;
            if (fObj && fObj.img) { fImg = fObj.img; fw = fObj.w; fh = fObj.h; }
          }
          if (fImg && fw > 0 && fh > 0) {
            emitirRetanguloRaios(doc, 0, 0, w, h, raios);
            doc.clip();
            const zoom = clampNum(c.zoom ?? 1, 0.2, 6);
            const escCover = Math.max(w / fw, h / fh) * zoom;
            const iw = fw * escCover;
            const ih = fh * escCover;
            const sobraX = iw - w;
            const sobraY = ih - h;
            const dx = -sobraX / 2 + (clampNum(c.offX ?? 0, -1, 1) * sobraX) / 2;
            const dy = -sobraY / 2 + (clampNum(c.offY ?? 0, -1, 1) * sobraY) / 2;
            try {
              doc.image(fImg, dx, dy, { width: iw, height: ih });
            } catch {
              emitirRetanguloRaios(doc, 0, 0, w, h, raios);
              doc.fillColor('#272736').fillOpacity(op).fill();
            }
          } else {
            emitirRetanguloRaios(doc, 0, 0, w, h, raios);
            doc.fillColor('#272736').fillOpacity(op).fill();
          }
        }
        doc.restore();

        if (borda > 0) {
          const bc = parseCorHex(c.corBorda || '#ffffff');
          if (bc.alpha * op > 0.001) {
            doc.save();
            if (c.strokeScaleEnabled === true) {
              doc.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
              emitirRetanguloRaios(doc, 0, 0, w, h, raios);
            } else {
              emitirRetanguloRaios(doc, 0, 0, w, h, raios, m);
            }
            doc.lineWidth(borda).strokeColor(bc.hex).strokeOpacity(bc.alpha * op).stroke();
            doc.restore();
          }
        }
      } else if (c.tipo === 'icone') {
        const forma = c.formaFundo || 'nenhum';
        const pad = forma === 'nenhum'
          ? 0
          : (c.folga !== undefined ? Number(c.folga) : Math.round(Math.min(w, h) * 0.22));
        doc.save();
        doc.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
        if (forma !== 'nenhum') {
          const cf = parseCorHex(c.corFundo || '#5266eb');
          if (cf.alpha * op > 0.001) {
            if (forma === 'circulo') doc.ellipse(w / 2, h / 2, w / 2, h / 2);
            else {
              const rf = forma === 'pilula' ? Math.min(w, h) / 2 : Math.min(18, Math.min(w, h) * 0.22);
              emitirRetanguloRaios(doc, 0, 0, w, h, [rf, rf, rf, rf]);
            }
            doc.fillColor(cf.hex).fillOpacity(cf.alpha * op).fill();
          }
          if (Number(c.bordaFundo) > 0) {
            const cbf = parseCorHex(c.corBordaFundo || '#ffffff');
            if (cbf.alpha * op > 0.001) {
              if (forma === 'circulo') doc.ellipse(w / 2, h / 2, w / 2, h / 2);
              else {
                const rf = forma === 'pilula' ? Math.min(w, h) / 2 : Math.min(18, Math.min(w, h) * 0.22);
                emitirRetanguloRaios(doc, 0, 0, w, h, [rf, rf, rf, rf]);
              }
              doc.lineWidth(Number(c.bordaFundo)).strokeColor(cbf.hex).strokeOpacity(cbf.alpha * op).stroke();
            }
          }
        }
        const ic = Object.prototype.hasOwnProperty.call(ICONES_SVG, c.iconeId) ? ICONES_SVG[c.iconeId] : ICONES_SVG.estrela;
        const ci = parseCorHex(c.cor || '#ffffff');
        if (ci.alpha * op > 0.001) {
          doc.save();
          doc.translate(pad, pad);
          doc.scale(Math.max(1, w - 2 * pad) / 24, Math.max(1, h - 2 * pad) / 24);
          doc.path(ic.path).fillColor(ci.hex).fillOpacity(ci.alpha * op).fill();
          doc.restore();
        }
        doc.restore();
      } else if (c.tipo === 'logo') {
        doc.save();
        doc.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
        doc.opacity(op);
        const imgLogo = c.origem === 'custom' && c.src ? abrirDataImg(c.src) : kitLogoImg;
        if (imgLogo && imgLogo.width > 0 && imgLogo.height > 0) {
          const escL = Math.min(w / imgLogo.width, h / imgLogo.height);
          const dw = imgLogo.width * escL;
          const dh = imgLogo.height * escL;
          try {
            doc.image(imgLogo, (w - dw) / 2, (h - dh) / 2, { width: dw, height: dh });
          } catch {}
        } else if (!c.ocultarSemLogo) {
          const forma = c.forma || 'quadrado';
          const corBg = parseCorHex(c.corFundo || kit?.cores1?.destaque || '#5266eb');
          if (forma !== 'nenhum' && corBg.alpha * op > 0.001) {
            if (forma === 'circulo') doc.ellipse(w / 2, h / 2, w / 2, h / 2);
            else {
              const rl = Number(c.raio ?? 16);
              emitirRetanguloRaios(doc, 0, 0, w, h, [rl, rl, rl, rl]);
            }
            doc.fillColor(corBg.hex).fillOpacity(corBg.alpha * op).fill();
          }
          const ini = String(kit?.marca || 'B').trim().charAt(0).toUpperCase() || 'B';
          const corTx = parseCorHex(c.corTexto || '#ffffff');
          const fsMono = Math.max(8, Math.round(Math.min(w, h) * 0.52));
          const fMono = escolherFonteRegistrada(fontesRegistradas, kit?.fonte || 'Jost', 700, false);
          const optMono = { lineBreak: false, characterSpacing: 0, features: [] };
          doc.font(fMono).fontSize(fsMono).fillColor(corTx.hex).fillOpacity(corTx.alpha * op);
          const wi = doc.widthOfString(ini, optMono);
          const lhMono = doc.currentLineHeight(false);
          doc.text(ini, (w - wi) / 2, (h - lhMono) / 2, optMono);
        }
        doc.restore();
      } else if (c.tipo === 'qrcode') {
        const tel = dTokens['{telefone}'] || dados?.fone || dados?.telefone || kit?.telefone || '';
        const urlAlvo = (c.url && /^https?:\/\//i.test(String(c.url))) ? String(c.url) : (waLink(tel) || 'https://wa.me/');
        doc.save();
        doc.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
        const rQr = Number(c.raio ?? 12);
        const claro = parseCorHex(c.corClaro || '#ffffff');
        const escuro = parseCorHex(c.corEscuro || '#171721');
        if (claro.alpha * op > 0.001) {
          emitirRetanguloRaios(doc, 0, 0, w, h, [rQr, rQr, rQr, rQr]);
          doc.fillColor(claro.hex).fillOpacity(claro.alpha * op).fill();
        }
        try {
          const qr = QRCode.create(urlAlvo, { errorCorrectionLevel: 'M' });
          const mod = qr.modules;
          const n = mod.size;
          const mrg = Number(c.margem ?? 2);
          const cell = Math.min(w, h) / (n + mrg * 2);
          const ox = (w - n * cell) / 2;
          const oy = (h - n * cell) / 2;
          if (escuro.alpha * op > 0.001) {
            doc.fillColor(escuro.hex).fillOpacity(escuro.alpha * op);
            for (let row = 0; row < n; row++) {
              let col = 0;
              while (col < n) {
                if (mod.get(row, col)) {
                  let k = col;
                  while (k < n && mod.get(row, k)) k++;
                  doc.rect(ox + col * cell, oy + row * cell, (k - col) * cell, cell);
                  col = k;
                } else {
                  col++;
                }
              }
            }
            doc.fill();
          }
          doc.link(0, 0, w, h, urlAlvo);
        } catch (err) {
          avisos.push(`QR inválido: ${err.message}`);
        }
        doc.restore();
      } else if (c.tipo === 'texto') {
        let textoAtual = substituirTokens(c.texto || '', dTokens);
        if (c.maiusculas) textoAtual = textoAtual.toLocaleUpperCase('pt-BR');
        if (!textoAtual && !c.fundo) continue;

        const fonteAlias = escolherFonteRegistrada(fontesRegistradas, c.fonte || 'Jost', c.peso || 400, Boolean(c.italico));
        const espacamento = Number(c.espacamento) || 0;
        const textOpts = {
          lineBreak: false,
          characterSpacing: espacamento,
          features: espacamento !== 0 ? ['-kern'] : []
        };
        const pad = c.fundo ? (Number(c.folga) || 0) : 0;
        const sx = Number(c.escalaX) || 1;
        const sy = Number(c.escalaY) || 1;
        const entrelinha = Number(c.entrelinha) || 1.15;
        const textWidth = Math.max(12, (w - 2 * pad) / sx);

        const modoA = Boolean(
          c.telemetria &&
          Array.isArray(c.telemetria.lines) &&
          c.telemetria.textoResolvido === textoAtual &&
          c.telemetria.baselineShift !== null &&
          c.telemetria.baselineShift !== undefined
        );

        let fontSize;
        let lines;
        let L;
        let firstLineOffsetY;

        if (modoA) {
          telemetriaStats.modoA++;
          fontSize = Number(c.telemetria.tamanhoEfetivo) || Number(c.tamanho) || 40;
          doc.font(fonteAlias).fontSize(fontSize);
          lines = c.telemetria.lines;
          L = entrelinha * fontSize;
          const ascender = (doc._font && Number.isFinite(doc._font.ascender)) ? doc._font.ascender : 800;
          firstLineOffsetY = L / 2 + Number(c.telemetria.baselineShift) - (ascender / 1000) * fontSize;
        } else {
          telemetriaStats.modoB++;
          doc.font(fonteAlias);
          const baseSize = Number(c.tamanho) || 40;
          const maxH = Math.max(12, (h - 2 * pad) / sy);
          fontSize = c.autoFit
            ? calcularAutoFitPdfKit(doc, textoAtual, baseSize, textWidth, maxH, entrelinha, textOpts)
            : baseSize;
          doc.fontSize(fontSize);
          lines = quebrarLinhasPdfKit(doc, textoAtual, textWidth, textOpts);
          L = entrelinha * fontSize;
          firstLineOffsetY = (L - doc.currentLineHeight(false)) / 2;
        }

        const boxH = c.autoFit ? h : Math.max(h, Math.round(lines.length * L * sy + pad * 2));
        const mGrp = [...m];
        if (!modoA && c.ancora === 'base' && !c.autoFit && boxH !== h && !c.matrix) {
          mGrp[5] += (h - boxH);
        }

        if (c.fundo) {
          const corBg = parseCorHex(c.corFundo || '#5266eb');
          const rf = Number(c.raioFundo) || 0;
          doc.save();
          doc.transform(mGrp[0], mGrp[1], mGrp[2], mGrp[3], mGrp[4], mGrp[5]);
          if (corBg.alpha * op > 0.001) {
            emitirRetanguloRaios(doc, 0, 0, w, boxH, [rf, rf, rf, rf]);
            doc.fillColor(corBg.hex).fillOpacity(corBg.alpha * op).fill();
          }
          if (Number(c.bordaFundo) > 0) {
            const bf = parseCorHex(c.corBordaFundo || '#ffffff');
            if (bf.alpha * op > 0.001) {
              emitirRetanguloRaios(doc, 0, 0, w, boxH, [rf, rf, rf, rf]);
              doc.lineWidth(Number(c.bordaFundo)).strokeColor(bf.hex).strokeOpacity(bf.alpha * op).stroke();
            }
          }
          doc.restore();
        }

        doc.save();
        if (modoA && Array.isArray(c.telemetria.textMatrix) && c.telemetria.textMatrix.length === 6) {
          const tm = c.telemetria.textMatrix;
          doc.transform(tm[0], tm[1], tm[2], tm[3], tm[4], tm[5]);
        } else {
          doc.transform(mGrp[0], mGrp[1], mGrp[2], mGrp[3], mGrp[4], mGrp[5]);
          doc.translate(pad, pad);
          doc.scale(sx, sy);
        }

        doc.font(fonteAlias).fontSize(fontSize);
        const corTxt = parseCorHex(c.cor || '#ffffff');
        const sombra = Number(c.sombra) || 0;
        const contorno = Number(c.contorno) || 0;

        for (let i = 0; i < lines.length; i++) {
          const linha = String(lines[i] ?? '');
          if (!linha) continue;
          const lw = doc.widthOfString(linha, textOpts);
          const dx = c.alinhamento === 'center'
            ? (textWidth - lw) / 2
            : (c.alinhamento === 'right' ? (textWidth - lw) : 0);
          const lineY = firstLineOffsetY + i * L;

          if (sombra > 0) {
            const cs = parseCorHex(c.corSombra || '#000000');
            if (cs.alpha * op > 0.001) {
              const offS = Math.max(0.5, sombra / 3);
              doc.fillColor(cs.hex).fillOpacity(cs.alpha * op * 0.45)
                .text(linha, dx + offS * 0.3, lineY + offS, { ...textOpts, fill: true, stroke: false });
            }
          }
          if (contorno > 0) {
            const cc = parseCorHex(c.corContorno || '#000000');
            if (cc.alpha * op > 0.001) {
              doc.lineWidth(contorno).lineJoin('round').strokeColor(cc.hex).strokeOpacity(cc.alpha * op)
                .text(linha, dx, lineY, { ...textOpts, fill: false, stroke: true });
            }
          }
          if (corTxt.alpha * op > 0.001) {
            doc.fillColor(corTxt.hex).fillOpacity(corTxt.alpha * op)
              .text(linha, dx, lineY, { ...textOpts, fill: true, stroke: false });
          }
        }
        doc.restore();
      }
    }
  }

  doc.end();
  return { doc, info: { paginas, avisos, telemetriaStats } };
}

module.exports = { gerar, gerarDeCena, paginasPadrao, COMPATIVEIS, LIMITE_PAGINAS, MAX_GALERIA, MODELOS };
