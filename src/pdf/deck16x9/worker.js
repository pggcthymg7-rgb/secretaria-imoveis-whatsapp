'use strict';
/**
 * Worker Thread nativo do Node.js para isolamento total de CPU e Memória.
 * Executa em thread isolada. Carrega sharp, fontes TTF e gera o PDFKit.
 * Ao término, envia a mensagem de conclusão e finaliza.
 */
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const { gerar, gerarDeCena } = require('./gerar');
const { obterFotoReduzida } = require('./cache-fotos');
const { resolverFontesCena } = require('./cache-fontes');

let sharp = null;
try {
  sharp = require('sharp');
  sharp.cache(false);
  sharp.concurrency(1);
} catch {
  sharp = null;
}

const DIR_FONTES = path.join(__dirname, '..', '..', '..', 'fonts');

function carregarFontes() {
  const out = {};
  if (fs.existsSync(DIR_FONTES)) {
    for (const f of fs.readdirSync(DIR_FONTES)) {
      if (f.endsWith('.ttf')) out[f.replace(/\.ttf$/, '')] = fs.readFileSync(path.join(DIR_FONTES, f));
    }
  }
  return out;
}

function clampNum(v, a, b) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : a;
}

function decodificarDataImg(src) {
  if (typeof src !== 'string') return null;
  const m = src.trim().match(/^data:image\/(?:png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if (!m) return null;
  try { return Buffer.from(m[1], 'base64'); } catch { return null; }
}

function construirSvgMascaraRaios(w, h, raios) {
  const maxR = Math.min(w, h) / 2;
  const tl = Math.min(maxR, Math.max(0, raios[0] || 0));
  const tr = Math.min(maxR, Math.max(0, raios[1] || 0));
  const br = Math.min(maxR, Math.max(0, raios[2] || 0));
  const bl = Math.min(maxR, Math.max(0, raios[3] || 0));
  const d = [
    `M ${tl} 0`,
    `L ${w - tr} 0`,
    tr > 0 ? `Q ${w} 0 ${w} ${tr}` : `L ${w} 0`,
    `L ${w} ${h - br}`,
    br > 0 ? `Q ${w} ${h} ${w - br} ${h}` : `L ${w} ${h}`,
    `L ${bl} ${h}`,
    bl > 0 ? `Q 0 ${h} 0 ${h - bl}` : `L 0 ${h}`,
    `L 0 ${tl}`,
    tl > 0 ? `Q 0 0 ${tl} 0` : `L 0 0`,
    'Z'
  ].join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${d}" fill="#ffffff"/></svg>`;
}

async function processarFotoCamadaSharp(srcBuf, c) {
  if (!sharp || !Buffer.isBuffer(srcBuf) || !srcBuf.length) return null;
  try {
    const lw = Math.max(4, Math.round(Number(c.w) || 200));
    const lh = Math.max(4, Math.round(Number(c.h) || 200));
    const ratio = Math.min(2, 1600 / Math.max(lw, lh));
    const outW = Math.max(4, Math.round(lw * ratio));
    const outH = Math.max(4, Math.round(lh * ratio));

    const meta = await sharp(srcBuf, { failOn: 'error', limitInputPixels: 40_000_000 }).rotate().metadata();
    const imgW = meta.width || outW;
    const imgH = meta.height || outH;

    const zoom = clampNum(c.zoom ?? 1, 0.2, 6);
    const offX = clampNum(c.offX ?? 0, -1, 1);
    const offY = clampNum(c.offY ?? 0, -1, 1);
    const escCover = Math.max(outW / imgW, outH / imgH) * zoom;
    const iw = imgW * escCover;
    const ih = imgH * escCover;

    let pipe = sharp(srcBuf, { failOn: 'error', limitInputPixels: 40_000_000 }).rotate();

    if (iw >= outW - 0.5 && ih >= outH - 0.5) {
      const cropW = Math.max(1, Math.min(imgW, Math.round(outW / escCover)));
      const cropH = Math.max(1, Math.min(imgH, Math.round(outH / escCover)));
      const sobraX = imgW - cropW;
      const sobraY = imgH - cropH;
      const left = clampNum(Math.round((sobraX / 2) * (1 - offX)), 0, imgW - cropW);
      const top = clampNum(Math.round((sobraY / 2) * (1 - offY)), 0, imgH - cropH);
      pipe = pipe.extract({ left, top, width: cropW, height: cropH }).resize(outW, outH, { fit: 'fill' });
    } else {
      const dw = Math.max(2, Math.round(iw));
      const dh = Math.max(2, Math.round(ih));
      let resizedBuf = await pipe.resize(dw, dh, { fit: 'fill' }).toBuffer();
      const dx = Math.round(-(dw - outW) / 2 + (offX * (dw - outW)) / 2);
      const dy = Math.round(-(dh - outH) / 2 + (offY * (dh - outH)) / 2);
      const srcLeft = Math.max(0, -dx);
      const srcTop = Math.max(0, -dy);
      const destLeft = Math.max(0, dx);
      const destTop = Math.max(0, dy);
      const visW = Math.min(dw - srcLeft, outW - destLeft);
      const visH = Math.min(dh - srcTop, outH - destTop);
      if (visW >= 1 && visH >= 1) {
        if (srcLeft > 0 || srcTop > 0 || visW < dw || visH < dh) {
          resizedBuf = await sharp(resizedBuf).extract({ left: srcLeft, top: srcTop, width: visW, height: visH }).toBuffer();
        }
        pipe = sharp({
          create: { width: outW, height: outH, channels: 4, background: { r: 23, g: 23, b: 33, alpha: 1 } }
        }).composite([{ input: resizedBuf, left: destLeft, top: destTop }]);
      } else {
        pipe = sharp({
          create: { width: outW, height: outH, channels: 4, background: { r: 23, g: 23, b: 33, alpha: 1 } }
        });
      }
    }

    const brilho = Number(c.brilho ?? 100);
    const contraste = Number(c.contraste ?? 100);
    const saturacao = Number(c.saturacao ?? 100);
    const desfoque = Number(c.desfoque ?? 0);

    if (Math.abs(brilho - 100) >= 1 || Math.abs(saturacao - 100) >= 1) {
      pipe = pipe.modulate({
        brightness: Math.max(0.05, brilho / 100),
        saturation: Math.max(0, saturacao / 100)
      });
    }
    const ct = contraste / 100;
    if (Math.abs(ct - 1) >= 0.01) {
      pipe = pipe.linear(ct, -(128 * ct) + 128);
    }
    if (desfoque > 0.3) {
      pipe = pipe.blur(Math.max(0.3, Math.min(40, desfoque * ratio * 0.5)));
    }

    const raios = Array.isArray(c.raios) && c.raios.length === 4
      ? c.raios.map(v => Math.max(0, Number(v) || 0))
      : [Number(c.raio) || 0, Number(c.raio) || 0, Number(c.raio) || 0, Number(c.raio) || 0];

    if (raios.some(r => r > 0)) {
      const svgMask = construirSvgMascaraRaios(outW, outH, raios.map(r => r * ratio));
      const buf = await pipe
        .ensureAlpha()
        .composite([{ input: Buffer.from(svgMask), blend: 'dest-in' }])
        .png({ compressionLevel: 6 })
        .toBuffer();
      return { buf, w: outW, h: outH };
    }

    const buf = await pipe
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85, mozjpeg: true, chromaSubsampling: '4:2:0' })
      .toBuffer();
    return { buf, w: outW, h: outH };
  } catch {
    return null;
  }
}

async function executarTarefa(dadosTarefa) {
  if (!dadosTarefa || typeof dadosTarefa !== 'object') throw new Error('Tarefa inválida');
  const t0 = process.hrtime.bigint();
  const {
    modo,
    cena,
    modelo,
    paleta,
    kit,
    dados,
    fotosCaminhos,
    fotosCustomCaminhos,
    paginas,
    destinoPath,
    cacheFotosDir,
    cacheFontesDir
  } = dadosTarefa;

  // Processa as fotos base
  const fotosProcessadas = [];
  for (let i = 0; i < (fotosCaminhos || []).length; i++) {
    const fPath = fotosCaminhos[i];
    if (!fPath || !fs.existsSync(fPath)) {
      fotosProcessadas.push(null);
      continue;
    }
    const reduzida = await obterFotoReduzida(fPath, cacheFotosDir);
    fotosProcessadas.push(reduzida);
  }

  // Prepara logo do kit se houver (com teto de 10 MB) e converte WEBP -> PNG para pdfkit
  let logoBuffer = null;
  if (kit && kit.logoPath && fs.existsSync(kit.logoPath)) {
    try {
      const st = fs.statSync(kit.logoPath);
      if (st.isFile() && st.size <= 10 * 1024 * 1024) logoBuffer = fs.readFileSync(kit.logoPath);
    } catch {}
  } else if (kit && Buffer.isBuffer(kit.logo)) {
    logoBuffer = kit.logo;
  } else if (kit && typeof kit.logo === 'string' && kit.logo.startsWith('data:image/')) {
    logoBuffer = decodificarDataImg(kit.logo);
  }
  const isWebpBuffer = buf => Buffer.isBuffer(buf) && buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
  if (sharp && isWebpBuffer(logoBuffer)) {
    try { logoBuffer = await sharp(logoBuffer).png().toBuffer(); } catch {}
  }
  const kitParaGerar = { ...(kit || {}), logo: logoBuffer };

  let doc;
  let info;

  if (modo === 'cena' && cena) {
    const fontesResolvidas = await resolverFontesCena(cena, {
      cacheDir: cacheFontesDir || null,
      kit: kitParaGerar
    });

    const fotosPorCamada = new Map();
    const customFileCache = new Map();
    const slidesOrig = Array.isArray(cena.slides) ? cena.slides : [];
    const slidesNormalizados = [];
    for (let slideIdx = 0; slideIdx < slidesOrig.length; slideIdx++) {
      const sl = slidesOrig[slideIdx];
      const camadasOrig = Array.isArray(sl?.camadas) ? sl.camadas : [];
      const camadasNorm = [];
      for (let camIdx = 0; camIdx < camadasOrig.length; camIdx++) {
        let c = camadasOrig[camIdx];
        if (c && c.tipo === 'logo' && c.origem === 'custom' && typeof c.src === 'string' && /^data:image\/webp;base64,/i.test(c.src) && sharp) {
          const webpBuf = decodificarDataImg(c.src);
          if (webpBuf) {
            try {
              const pngBuf = await sharp(webpBuf).png().toBuffer();
              c = { ...c, src: `data:image/png;base64,${pngBuf.toString('base64')}` };
            } catch {}
          }
        }
        camadasNorm.push(c);
        if (!c || c.tipo !== 'foto' || c.visivel === false) continue;

        let srcBuf = null;
        if (c.fotoCustom) {
          if (String(c.fotoCustom).startsWith('data:image/')) {
            srcBuf = decodificarDataImg(c.fotoCustom);
          } else if (fotosCustomCaminhos && Object.prototype.hasOwnProperty.call(fotosCustomCaminhos, c.fotoCustom)) {
            const pCustom = fotosCustomCaminhos[c.fotoCustom];
            if (pCustom && fs.existsSync(pCustom)) {
              if (!customFileCache.has(pCustom)) {
                const red = await obterFotoReduzida(pCustom, cacheFotosDir);
                customFileCache.set(pCustom, red ? red.buf : null);
              }
              srcBuf = customFileCache.get(pCustom);
            }
          }
        }
        if (!srcBuf) {
          const idx = Number(c.indiceFoto) || 0;
          const fProc = fotosProcessadas[idx] || fotosProcessadas[0] || null;
          srcBuf = fProc ? fProc.buf : null;
        }
        if (srcBuf) {
          const proc = await processarFotoCamadaSharp(srcBuf, c);
          if (proc) fotosPorCamada.set(`${slideIdx}_${camIdx}_${c.id}`, proc);
        }
      }
      slidesNormalizados.push(sl ? { ...sl, camadas: camadasNorm } : sl);
    }
    const cenaParaGerar = { ...cena, slides: slidesNormalizados };

    ({ doc, info } = gerarDeCena(PDFDocument, QRCode, {
      cena: cenaParaGerar,
      dados,
      kit: kitParaGerar,
      fotos: fotosProcessadas,
      fotosPorCamada,
      fontesResolvidas
    }));
  } else {
    const fontes = carregarFontes();
    ({ doc, info } = gerar(PDFDocument, QRCode, {
      modelo: modelo || 'A',
      paleta: paleta || 'principal',
      kit: kitParaGerar,
      dados,
      fotos: fotosProcessadas,
      paginas,
      fontes
    }));
  }

  const chunks = [];
  doc.on('data', c => chunks.push(c));

  await new Promise((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
  });

  const pdfBuffer = Buffer.concat(chunks);
  if (destinoPath) {
    fs.mkdirSync(path.dirname(destinoPath), { recursive: true });
    const tmp = `${destinoPath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      fs.writeFileSync(tmp, pdfBuffer);
      fs.renameSync(tmp, destinoPath);
    } catch (err) {
      try { fs.unlinkSync(tmp); } catch {}
      throw err;
    }
  }

  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return {
    ok: true,
    bytes: pdfBuffer.length,
    ms,
    paginas: info.paginas,
    avisos: info.avisos,
    fonteMarca: info.fonteMarca
  };
}

if (parentPort) {
  parentPort.on('message', async (msg) => {
    try {
      const res = await executarTarefa(msg);
      parentPort.postMessage(res);
    } catch (err) {
      parentPort.postMessage({ ok: false, erro: err.message, stack: err.stack });
    }
  });
}

module.exports = { executarTarefa };
