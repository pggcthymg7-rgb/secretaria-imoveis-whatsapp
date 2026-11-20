/**
 * Rotas de prospecção em massa, contatos e liberação para teste de atendimento diário.
 */
const express = require('express');

const { ah, str } = require('../helpers');
const sheets = require('../../domain/sheets');
const contacts = require('../../whatsapp/contacts');
const daily = require('../../whatsapp/atendimento-diario');
const prospeccao = require('../../domain/prospeccao');

const router = express.Router();

router.get('/api/prospeccao', (req, res) => res.json(prospeccao.getState()));
router.get('/api/contatos', (req, res) => res.json({ contatos: contacts.listContacts() }));
router.post('/api/prospeccao/parse', (req, res) => res.json({ contatos: prospeccao.parseContactsInput(str(req.body?.texto, 200000)) }));
router.post('/api/prospeccao/config', (req, res) => res.json({ ok: true, config: prospeccao.updateConfig(req.body || {}) }));

router.post('/api/prospeccao/campanha', ah(async (req, res) => {
  const b = req.body || {};
  const camp = prospeccao.createCampaign({
    nome: str(b.nome, 80),
    mensagem: str(b.mensagem, 3000),
    imagem: b.imagem ? sheets.sanitizePhotoRef(b.imagem) : '',
    contatos: Array.isArray(b.contatos) ? b.contatos.slice(0, 1000) : []
  });
  if (b.iniciar) prospeccao.setCampaignStatus(camp.id, 'ATIVA');
  res.json({ ok: true, state: prospeccao.getState() });
}));

router.post('/api/prospeccao/campanha/:id/status', ah(async (req, res) => {
  prospeccao.setCampaignStatus(req.params.id, String(req.body?.status || ''));
  res.json({ ok: true, state: prospeccao.getState() });
}));

router.delete('/api/prospeccao/campanha/:id', (req, res) => {
  prospeccao.deleteCampaign(req.params.id);
  res.json({ ok: true, state: prospeccao.getState() });
});

router.get('/api/prospeccao/campanha/:id', (req, res) => {
  const c = prospeccao.getCampaign(req.params.id);
  if (!c) return res.status(404).json({ error: 'Campanha não encontrada.' });
  res.json(c);
});

router.post('/api/daily/reset-contact', (req, res) => {
  const phone = str(req.body?.phone, 30).replace(/\D/g, '');
  if (phone.length < 10) return res.status(400).json({ error: 'Número inválido.' });
  const removed = contacts.forget(phone);
  daily.addDailyLog('TESTE', `Número ${phone} liberado para testar a 1ª mensagem.`);
  res.json({ ok: true, removed, message: `Número ${phone} liberado: a próxima mensagem dele será tratada como 1ª mensagem.` });
});

module.exports = router;
