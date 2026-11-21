/**
 * Rotas de fichas em PDF (Kit de Marca 16:9, Studio JSON v1, modelos próprios, QR, edição, geração e envio pelo WhatsApp).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');

const { ah, str } = require('../helpers');
const { FOTOS_DIR } = require('../../config/paths');
const sheets = require('../../domain/sheets');
const wa = require('../../whatsapp/client');
const fichaPdf = require('../../pdf/ficha-a4');
const pdf16x9 = require('../../pdf/deck16x9/manager');
const { MODELOS, COMPATIVEIS } = require('../../pdf/deck16x9/gerar');
const { criarCenaModelo, criarSlideModelo } = require('../../pdf/deck16x9/cenas');
const pdfModelos = require('../../domain/pdf-modelos');
const prospeccao = require('../../domain/prospeccao');

const router = express.Router();

function hasImageMagic(filePath, mimetype) {
  let fd;
  try {
    const baseRoot = path.resolve(FOTOS_DIR);
    const resolved = path.resolve(String(filePath || ''));
    if (!resolved.startsWith(baseRoot + path.sep)) return false;
    const realRoot = fs.realpathSync(baseRoot);
    const realPath = fs.realpathSync(resolved);
    if (realPath === realRoot || !realPath.startsWith(realRoot + path.sep)) return false;
    fd = fs.openSync(realPath, 'r');
    const buf = Buffer.alloc(12);
    const n = fs.readSync(fd, buf, 0, 12, 0);
    if (mimetype === 'image/jpeg') return n >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    if (mimetype === 'image/png') return n >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (mimetype === 'image/webp') return n >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
    return false;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
}

const uploadLogo = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try { fs.mkdirSync(FOTOS_DIR, { recursive: true }); } catch {}
      cb(null, FOTOS_DIR);
    },
    filename: (req, file, cb) => {
      const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[file.mimetype] || '.png';
      cb(null, `logo_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) && /\.(jpe?g|png|webp)$/i.test(file.originalname || '');
    cb(ok ? null : Object.assign(new Error('Envie apenas logo JPG, PNG ou WEBP.'), { status: 400 }), ok);
  }
});

function kitComLogoUrl(kit) {
  const k = kit || {};
  let logoFile = k.logoFile ? path.basename(String(k.logoFile)) : null;
  if (!logoFile && k.logoPath) {
    const baseFotos = path.resolve(FOTOS_DIR);
    const resolved = path.resolve(String(k.logoPath));
    if (resolved.startsWith(baseFotos + path.sep)) logoFile = path.basename(resolved);
  }
  const logoUrl = logoFile ? `/fotos/${encodeURIComponent(logoFile)}` : null;
  return { ...k, logoFile, logoUrl };
}

async function imovelOu404(req, res) {
  const p = await sheets.getPropertyById(req.params.id);
  if (!p) res.status(404).json({ error: 'Imóvel não encontrado.' });
  return p;
}

// ============================================================================
// Rotas fixas (registradas ANTES de /api/pdf/:id para evitar colisão)
// ============================================================================

router.get('/api/pdf/kit', ah(async (req, res) => {
  res.json({ ok: true, kit: kitComLogoUrl(pdf16x9.carregarKit()), modelos: MODELOS, compativeis: COMPATIVEIS });
}));

router.post('/api/pdf/kit', ah(async (req, res) => {
  const kit = pdf16x9.salvarKit(req.body || {});
  res.json({ ok: true, kit: kitComLogoUrl(kit) });
}));

router.post('/api/pdf/kit/logo', (req, res) => {
  uploadLogo.fields([{ name: 'logo', maxCount: 1 }, { name: 'file', maxCount: 1 }])(req, res, err => {
    if (err) {
      return res.status(err.status || 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Logo maior que 5 MB.' : err.message });
    }
    const files = req.files || {};
    const f = (files.logo && files.logo[0]) || (files.file && files.file[0]) || null;
    if (!f) return res.status(400).json({ error: 'Nenhum arquivo de logo enviado.' });

    const baseRoot = path.resolve(FOTOS_DIR);
    const resolved = path.resolve(String(f.path || ''));
    if (!resolved.startsWith(baseRoot + path.sep)) {
      return res.status(400).json({ error: 'Caminho de upload inválido.' });
    }
    let realRoot;
    let realPath;
    try {
      realRoot = fs.realpathSync(baseRoot);
      realPath = fs.realpathSync(resolved);
    } catch {
      return res.status(400).json({ error: 'Arquivo de imagem inválido ou corrompido.' });
    }
    if (realPath === realRoot || !realPath.startsWith(realRoot + path.sep)) {
      return res.status(400).json({ error: 'Caminho de upload inválido.' });
    }

    const safeFileName = path.basename(realPath);
    const safeLogoPath = path.join(FOTOS_DIR, safeFileName);

    if (!hasImageMagic(safeLogoPath, f.mimetype)) {
      try {
        if (realPath.startsWith(realRoot + path.sep)) fs.rmSync(realPath, { force: true });
      } catch {}
      return res.status(400).json({ error: 'Arquivo de imagem inválido ou corrompido.' });
    }

    const kitSalvo = pdf16x9.salvarKit({ logoPath: safeLogoPath, logoFile: safeFileName });
    const kit = kitComLogoUrl(kitSalvo);
    return res.json({ ok: true, kit, logoUrl: kit.logoUrl });
  });
});

router.get('/api/pdf/modelos', ah(async (req, res) => {
  res.json(pdfModelos.listar());
}));

router.post('/api/pdf/modelos', ah(async (req, res) => {
  const modelo = pdfModelos.salvar(req.body || {});
  res.json({ ok: true, modelo, ...pdfModelos.listar() });
}));

router.delete('/api/pdf/modelos/:id', ah(async (req, res) => {
  res.json({ ok: pdfModelos.apagar(req.params.id), ...pdfModelos.listar() });
}));

router.get('/api/pdf/cena-preset/:modelo', ah(async (req, res) => {
  const kit = kitComLogoUrl(pdf16x9.carregarKit());
  const modelo = String(req.params.modelo || kit.modelo || 'A').toUpperCase();
  const paleta = String(req.query.paleta || kit.paletaPadrao || 'principal').toLowerCase() === 'segunda' ? 'segunda' : 'principal';
  const prop = req.query.imovelId ? await sheets.getPropertyById(String(req.query.imovelId)) : null;
  const dados = prop ? pdf16x9.comporDadosImovel(prop, {}, kit) : null;
  const cena = criarCenaModelo(modelo, paleta, kit, dados);
  const resp = { ok: true, cena };
  if (req.query.slide) {
    resp.slide = criarSlideModelo(modelo, String(req.query.slide), paleta, kit);
  }
  res.json(resp);
}));

router.get('/api/pdf/qr', ah(async (req, res) => {
  const raw = String(req.query.url || '').trim().slice(0, 500);
  const urlSegura = /^https?:\/\/[^\s<>'"]+$/i.test(raw) ? raw : 'https://wa.me/';
  const qr = QRCode.create(urlSegura, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const matrix = [];
  for (let r = 0; r < n; r++) {
    const row = [];
    for (let c = 0; c < n; c++) row.push(qr.modules.get(r, c) ? 1 : 0);
    matrix.push(row);
  }
  res.json({ ok: true, size: n, matrix });
}));

// ============================================================================
// Rotas por imóvel (/api/pdf/:id)
// ============================================================================

router.get('/api/pdf/:id', ah(async (req, res) => {
  const p = await imovelOu404(req, res);
  if (!p) return;
  const fLegacy = fichaPdf.ficha(p);
  const fichas16 = pdf16x9.carregarFichas16x9();
  const pidStr = String(p.id);
  const f16 = (fichas16 && Object.prototype.hasOwnProperty.call(fichas16, pidStr)) ? (fichas16[pidStr] || {}) : {};
  const kit = kitComLogoUrl(pdf16x9.carregarKit());
  const modelosProprios = pdfModelos.listar();
  const fichaUnificada = {
    ...fLegacy,
    ...f16,
    modelo: f16.modelo || kit.modelo || 'A',
    paleta: f16.paleta || kit.paletaPadrao || 'principal'
  };

  let cena = null;
  if (f16.cena && typeof f16.cena === 'object') {
    cena = f16.cena;
  } else if (modelosProprios.padrao && !f16.modelo) {
    const modPadrao = modelosProprios.modelos.find(m => m.id === modelosProprios.padrao);
    if (modPadrao && modPadrao.cena) cena = modPadrao.cena;
  }
  if (!cena) {
    cena = criarCenaModelo(
      fichaUnificada.modelo,
      fichaUnificada.paleta,
      kit,
      pdf16x9.comporDadosImovel(p, f16, kit)
    );
  }

  res.json({
    ficha: fichaUnificada,
    cena,
    kit,
    cores: fichaPdf.CORES,
    fotos: (p.fotos || []).filter(f => !/^https?:/i.test(f)),
    modelos: MODELOS,
    compativeis: COMPATIVEIS,
    modelosProprios,
    imovel: p
  });
}));

router.post('/api/pdf/:id', ah(async (req, res) => {
  const p = await imovelOu404(req, res);
  if (!p) return;
  if (req.body?.restaurar) {
    const fLegacy = fichaPdf.restaurar(p);
    pdf16x9.restaurarFicha16x9(p.id);
    pdf16x9.invalidarCache(p.id);
    const kit = kitComLogoUrl(pdf16x9.carregarKit());
    const modelo = kit.modelo || 'A';
    const paleta = kit.paletaPadrao || 'principal';
    const cena = criarCenaModelo(modelo, paleta, kit, pdf16x9.comporDadosImovel(p, fLegacy, kit));
    return res.json({ ok: true, ficha: { ...fLegacy, modelo, paleta }, cena });
  }
  const fLegacy = fichaPdf.salvar(p, req.body || {});
  const f16 = pdf16x9.salvarFicha16x9(p.id, req.body || {});
  pdf16x9.invalidarCache(p.id);
  pdf16x9.agendarPreGeracao(p);
  res.json({ ok: true, ficha: { ...fLegacy, ...f16 }, cena: f16.cena || null });
}));

router.post('/api/pdf/:id/arquivo', ah(async (req, res) => {
  const p = await imovelOu404(req, res);
  if (!p) return;
  const body = req.body || {};
  let cenaPersistida = null;
  if (Object.keys(body).length) {
    fichaPdf.salvar(p, body);
    const f16Salva = pdf16x9.salvarFicha16x9(p.id, body);
    cenaPersistida = f16Salva.cena || null;
    pdf16x9.invalidarCache(p.id);
  }
  const resultado = await pdf16x9.gerarPdfComFallback(p, {
    ficha: body,
    cena: body.cena || cenaPersistida || undefined
  });
  const safeName = String(resultado.nomeArquivo || 'ficha.pdf').replace(/["\r\n\\]/g, '_');
  res.set('Content-Disposition', `attachment; filename="${safeName}"`).type('application/pdf').send(resultado.buffer);
}));

router.post('/api/pdf/:id/enviar', ah(async (req, res) => {
  const p = await imovelOu404(req, res);
  if (!p) return;
  const tel = prospeccao.normalizePhone(req.body?.telefone);
  if (!tel) return res.status(400).json({ error: 'Telefone inválido. Use DDD + número, ex.: 62 99999-9999.' });
  if (!wa.api.isConnected()) return res.status(400).json({ error: 'WhatsApp desconectado.' });
  const jid = await wa.api.checkNumber(tel);
  if (!jid) return res.status(400).json({ error: 'Esse número não tem WhatsApp.' });

  const fichaBody = req.body?.ficha && typeof req.body.ficha === 'object' ? { ...req.body.ficha } : {};
  if (req.body?.cena && typeof req.body.cena === 'object') fichaBody.cena = req.body.cena;
  if (Object.keys(fichaBody).length) {
    fichaPdf.salvar(p, fichaBody);
    pdf16x9.salvarFicha16x9(p.id, fichaBody);
    pdf16x9.invalidarCache(p.id);
  }

  const resultado = await pdf16x9.gerarPdfComFallback(p, {
    ficha: fichaBody,
    cena: req.body?.cena || fichaBody.cena || undefined
  });
  await wa.api.sendDocument(jid, resultado.buffer, resultado.nomeArquivo, str(req.body?.mensagem, 1000));
  wa.addLog('PDF', `📄 Ficha do imóvel #${p.id} enviada para ${tel.slice(0, 4)}…${tel.slice(-2)}.`);
  res.json({ ok: true });
}));

module.exports = router;
