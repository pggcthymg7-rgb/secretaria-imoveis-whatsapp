'use strict';
/**
 * Worker Thread nativo do Node.js para isolamento total de CPU e Memória.
 * Executa em thread isolada. Carrega sharp, fontes TTF e gera o PDFKit.
 * Ao término, envia a mensagem de conclusão e finaliza.
 */
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const { gerar } = require('./gerar');
const { obterFotoReduzida } = require('./cache-fotos');

let sharp = null;
try {
  sharp = require('sharp');
  sharp.cache(false);
  sharp.concurrency(1);
} catch {
  sharp = null;
}

const DIR_FONTES = path.join(__dirname, '..', '..', 'fonts');

function carregarFontes() {
  const out = {};
  if (fs.existsSync(DIR_FONTES)) {
    for (const f of fs.readdirSync(DIR_FONTES)) {
      if (f.endsWith('.ttf')) out[f.replace(/\.ttf$/, '')] = fs.readFileSync(path.join(DIR_FONTES, f));
    }
  }
  return out;
}

async function executarTarefa(dadosTarefa) {
  const t0 = process.hrtime.bigint();
  const { modelo, paleta, kit, dados, fotosCaminhos, paginas, destinoPath, cacheFotosDir } = dadosTarefa;

  // Processa as fotos
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

  // Prepara logo do kit se houver
  let logoBuffer = null;
  if (kit && kit.logoPath && fs.existsSync(kit.logoPath)) {
    try {
      logoBuffer = fs.readFileSync(kit.logoPath);
    } catch {}
  }
  const kitParaGerar = { ...kit, logo: logoBuffer };

  const fontes = carregarFontes();
  const { doc, info } = gerar(PDFDocument, QRCode, {
    modelo: modelo || 'A',
    paleta: paleta || 'principal',
    kit: kitParaGerar,
    dados,
    fotos: fotosProcessadas,
    paginas,
    fontes
  });

  const chunks = [];
  doc.on('data', c => chunks.push(c));

  await new Promise((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
  });

  const pdfBuffer = Buffer.concat(chunks);
  if (destinoPath) {
    fs.mkdirSync(path.dirname(destinoPath), { recursive: true });
    fs.writeFileSync(destinoPath, pdfBuffer);
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
