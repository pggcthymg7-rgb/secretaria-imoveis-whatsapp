/**
 * Rotas de fichas em PDF (Kit de Marca 16:9, edição, geração e envio pelo WhatsApp).
 */
const express = require('express');

const { ah, str } = require('../helpers');
const sheets = require('../../domain/sheets');
const wa = require('../../whatsapp/client');
const fichaPdf = require('../../pdf/ficha-a4');
const pdf16x9 = require('../../pdf/deck16x9/manager');
const { MODELOS, COMPATIVEIS } = require('../../pdf/deck16x9/gerar');
const prospeccao = require('../../domain/prospeccao');

const router = express.Router();

async function imovelOu404(req, res) {
  const p = await sheets.getPropertyById(req.params.id);
  if (!p) res.status(404).json({ error: 'Imóvel não encontrado.' });
  return p;
}

// Kit de marca (16:9) — registrado antes de /api/pdf/:id para não colidir com :id
router.get('/api/pdf/kit', ah(async (req, res) => {
  res.json({ ok: true, kit: pdf16x9.carregarKit(), modelos: MODELOS, compativeis: COMPATIVEIS });
}));

router.post('/api/pdf/kit', ah(async (req, res) => {
  const kit = pdf16x9.salvarKit(req.body || {});
  res.json({ ok: true, kit });
}));

router.get('/api/pdf/:id', ah(async (req, res) => {
  const p = await imovelOu404(req, res);
  if (!p) return;
  const fLegacy = fichaPdf.ficha(p);
  const fichas16 = pdf16x9.carregarFichas16x9();
  const pidStr = String(p.id);
  const f16 = (fichas16 && Object.prototype.hasOwnProperty.call(fichas16, pidStr)) ? (fichas16[pidStr] || {}) : {};
  const kit = pdf16x9.carregarKit();
  const fichaUnificada = {
    ...fLegacy,
    ...f16,
    modelo: f16.modelo || kit.modelo || 'A',
    paleta: f16.paleta || kit.paletaPadrao || 'principal'
  };
  res.json({
    ficha: fichaUnificada,
    kit,
    cores: fichaPdf.CORES,
    fotos: (p.fotos || []).filter(f => !/^https?:/i.test(f)),
    modelos: MODELOS,
    compativeis: COMPATIVEIS
  });
}));

router.post('/api/pdf/:id', ah(async (req, res) => {
  const p = await imovelOu404(req, res);
  if (!p) return;
  if (req.body?.restaurar) {
    const fLegacy = fichaPdf.restaurar(p);
    pdf16x9.restaurarFicha16x9(p.id);
    pdf16x9.invalidarCache(p.id);
    const kit = pdf16x9.carregarKit();
    return res.json({ ok: true, ficha: { ...fLegacy, modelo: kit.modelo || 'A', paleta: kit.paletaPadrao || 'principal' } });
  }
  const fLegacy = fichaPdf.salvar(p, req.body || {});
  const f16 = pdf16x9.salvarFicha16x9(p.id, req.body || {});
  pdf16x9.invalidarCache(p.id);
  pdf16x9.agendarPreGeracao(p);
  res.json({ ok: true, ficha: { ...fLegacy, ...f16 } });
}));

router.post('/api/pdf/:id/arquivo', ah(async (req, res) => {
  const p = await imovelOu404(req, res);
  if (!p) return;
  if (req.body && Object.keys(req.body).length) {
    fichaPdf.salvar(p, req.body);
    pdf16x9.salvarFicha16x9(p.id, req.body);
    pdf16x9.invalidarCache(p.id);
  }
  const resultado = await pdf16x9.gerarPdfComFallback(p, { ficha: req.body || {} });
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
  if (req.body?.ficha) {
    fichaPdf.salvar(p, req.body.ficha);
    pdf16x9.salvarFicha16x9(p.id, req.body.ficha);
    pdf16x9.invalidarCache(p.id);
  }
  const resultado = await pdf16x9.gerarPdfComFallback(p, { ficha: req.body?.ficha || {} });
  await wa.api.sendDocument(jid, resultado.buffer, resultado.nomeArquivo, str(req.body?.mensagem, 1000));
  wa.addLog('PDF', `📄 Ficha do imóvel #${p.id} enviada para ${tel.slice(0, 4)}…${tel.slice(-2)}.`);
  res.json({ ok: true });
}));

module.exports = router;
