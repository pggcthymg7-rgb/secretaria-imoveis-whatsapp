/**
 * Rotas da carteira de imóveis, upload de fotos, CSV e script do Google Planilhas.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const { ah } = require('../helpers');
const { FOTOS_DIR, ROOT_DIR } = require('../../config/paths');
const sheets = require('../../domain/sheets');
const vitrine = require('../../domain/vitrine');
const wa = require('../../whatsapp/client');
const quemProcura = require('../../domain/quem-procura');

const router = express.Router();

function hasImageMagic(filePath, mimetype) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
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

// Upload de fotos: só imagens, até 10 MB cada, nome aleatório
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, FOTOS_DIR),
    filename: (req, file, cb) => {
      const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[file.mimetype] || '.jpg';
      cb(null, `${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) && /\.(jpe?g|png|webp)$/i.test(file.originalname || '');
    cb(ok ? null : Object.assign(new Error('Envie apenas fotos JPG, PNG ou WEBP.'), { status: 400 }), ok);
  }
});

router.get('/api/inventory', ah(async (req, res) => {
  res.json({ inventory: await sheets.loadAllProperties(req.query.refresh === 'google' ? 'from_google' : false) });
}));

router.post('/api/upload-photos', (req, res) => {
  upload.array('photos', 20)(req, res, err => {
    if (err) return res.status(err.status || 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Foto maior que 10 MB.' : err.message });
    const files = req.files || [];
    const invalid = files.filter(f => !hasImageMagic(f.path, f.mimetype));
    if (invalid.length) {
      for (const f of files) try { fs.rmSync(f.path, { force: true }); } catch {}
      return res.status(400).json({ error: 'Arquivo de imagem inválido ou corrompido.' });
    }
    res.json({ ok: true, files: files.map(f => f.filename) });
  });
});

router.post('/api/property', ah(async (req, res) => {
  const created = await sheets.createProperty(req.body || {});
  wa.addLog('CRM_CADASTRO', `Imóvel #${created.id} (${created.tipo} - ${created.setor}) cadastrado.`);
  // 🎯 match reverso em segundo plano: avisa o dono no WhatsApp se alguém já pediu algo assim
  quemProcura.avisarNovoImovel(created, { enviarAoDono: t => wa.sendOwnerWhatsAppAlert(t), log: wa.addLog });
  res.json({ ok: true, property: created, inventory: await sheets.loadAllProperties() });
}));

router.put('/api/property/:id', ah(async (req, res) => {
  const updated = await sheets.updateProperty(req.params.id, req.body || {});
  wa.addLog('CRM_EDICAO', `Imóvel #${updated.id} atualizado.`);
  res.json({ ok: true, property: updated, inventory: await sheets.loadAllProperties() });
}));

router.delete('/api/property/:id', ah(async (req, res) => {
  const inventory = await sheets.deleteProperty(req.params.id);
  vitrine.removePost(req.params.id);
  wa.addLog('CRM_EXCLUSAO', `Imóvel #${req.params.id} excluído.`);
  res.json({ ok: true, inventory });
}));

router.get('/api/export-csv', (req, res) => {
  if (!fs.existsSync(sheets.LOCAL_CSV_PATH)) return res.status(404).send('Planilha não encontrada.');
  res.download(sheets.LOCAL_CSV_PATH, 'carteira_imoveis.csv');
});

router.get('/api/google-script', (req, res) => {
  const p = path.join(ROOT_DIR, 'GOOGLE_SHEETS_SCRIPT.gs');
  res.json({ code: fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '' });
});

module.exports = router;
