/**
 * Rotas de capas para Instagram e divulgação automática da Vitrine.
 */
const express = require('express');

const { ah } = require('../helpers');
const sheets = require('../../domain/sheets');
const wa = require('../../whatsapp/client');
const vitrine = require('../../domain/vitrine');
const capas = require('../../domain/capas');

const router = express.Router();

// Capas (beta): modelos do editor de capas para o Instagram (o desenho é feito no navegador)
router.get('/api/capas', (req, res) => res.json(capas.listar()));
router.post('/api/capas/modelos', ah(async (req, res) => res.json({ ok: true, modelo: capas.salvar(req.body || {}), ...capas.listar() })));
router.delete('/api/capas/modelos/:id', (req, res) => res.json({ ok: capas.apagar(req.params.id), ...capas.listar() }));

router.get('/api/vitrine', (req, res) => res.json(vitrine.getState()));
router.post('/api/vitrine/config', (req, res) => res.json({ ok: true, config: vitrine.updateConfig(req.body || {}) }));

router.post('/api/vitrine/gerar', ah(async (req, res) => {
  const inv = await sheets.loadInventory();
  const posts = vitrine.getState().posts || {};
  let n = 0;
  for (const p of inv) if (!Object.prototype.hasOwnProperty.call(posts, String(p.id))) {
    if (vitrine.upsertPost(p)) n++;
  }
  res.json({ ok: true, criados: n, state: vitrine.getState() });
}));

router.post('/api/vitrine/post/:id', ah(async (req, res) => {
  const p = await sheets.getPropertyById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Imóvel não encontrado.' });
  const foto = typeof req.body?.foto === 'string' ? sheets.sanitizePhotoRef(req.body.foto) : undefined;
  // regerar: refaz o texto a partir da carteira (descrição completa), útil para posts antigos que saíam cortados
  const texto = req.body?.regerar ? vitrine.defaultPostText(p) : typeof req.body?.texto === 'string' ? req.body.texto : undefined;
  res.json({ ok: true, post: vitrine.upsertPost(p, { texto, foto }) });
}));

router.post('/api/vitrine/post/:id/status', (req, res) => {
  const st = String(req.body?.status || '');
  if (!['APROVADO', 'REPROVADO', 'PENDENTE'].includes(st)) return res.status(400).json({ error: 'Status inválido.' });
  const post = vitrine.setStatus(req.params.id, st);
  if (!post) return res.status(404).json({ error: 'Post não encontrado.' });
  res.json({ ok: true, post });
});

router.post('/api/vitrine/enviar-agora', ah(async (req, res) => {
  const r = await vitrine.runSlot(wa.api, await sheets.loadInventory(), 'manual', wa.addLog);
  res.status(r.ok ? 200 : 400).json(r.ok ? r : { error: r.error });
}));

module.exports = router;
