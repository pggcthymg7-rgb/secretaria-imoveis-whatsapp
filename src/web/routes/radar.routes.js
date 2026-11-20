/**
 * Rotas de simulador, radar de buscas, "Quem procura" e cérebro de lugares.
 */
const express = require('express');

const { ah, str } = require('../helpers');
const sheets = require('../../domain/sheets');
const { analyzeMessageAndMatch, formatOutreachMessage } = require('../../domain/matcher');
const { loadSettings, saveSettings } = require('../../config/settings');
const wa = require('../../whatsapp/client');
const radar = require('../../domain/radar');
const quemProcura = require('../../domain/quem-procura');
const { BASE, loadOsm } = require('../../brain/locations');

const router = express.Router();

router.post('/api/simulate', ah(async (req, res) => {
  const message = str(req.body?.message, 4000);
  const senderName = str(req.body?.senderName, 80) || 'Corretor Teste';
  const inventory = await sheets.loadInventory();
  const analysis = await analyzeMessageAndMatch(message, senderName, inventory, { useAi: req.body?.useAi !== false });
  const previews = (analysis.matches || []).map(p => ({ property: p, whatsappMessagePreview: formatOutreachMessage(senderName, message, p, analysis) }));
  res.json({ analysis: { ...analysis, quase: (analysis.quase || []).map(q => ({ id: q.property.id, setor: q.property.setor, tipo: q.property.tipo, unknowns: q.unknowns })) }, previews });
}));

router.get('/api/radar', (req, res) => {
  res.json({ items: radar.list({ limit: Math.min(500, parseInt(req.query.limit, 10) || 200), decision: req.query.decision || undefined }), demanda: radar.demand(Number(req.query.dias) || 30) });
});

router.post('/api/radar/:code/enviar', ah(async (req, res) => {
  const r = await wa.approveAlert(null, String(req.params.code).toUpperCase(), req.body?.propId ? String(req.body.propId) : null);
  res.status(r.ok ? 200 : 400).json(r.ok ? r : { error: r.message });
}));

// 🎯 Quem procura este imóvel? (pedidos dos grupos que batem com ele) e oferecer para eles
router.get('/api/property/:id/quem-procura', ah(async (req, res) => {
  const p = await sheets.getPropertyById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Imóvel não encontrado.' });
  const lista = await quemProcura.quemProcura(p);
  res.json({ dias: quemProcura.DIAS_PADRAO, lista: lista.map(({ texto, jid, ...l }) => ({ ...l, texto: texto.slice(0, 400) })) });
}));

router.post('/api/property/:id/oferecer', ah(async (req, res) => {
  const codes = Array.isArray(req.body?.codes) ? req.body.codes.map(String).filter(c => /^A\d{1,3}$/.test(c)).slice(0, 50) : null;
  const r = await wa.oferecerImovel(null, String(req.params.id), codes && codes.length ? codes : null);
  res.status(r.ok ? 200 : 400).json(r.ok ? r : { error: r.message });
}));

router.get('/api/cerebro', (req, res) => {
  res.json({
    base: (() => {
      const osm = loadOsm() || {};
      return { bairros: BASE.bairros.length + (osm.bairros || []).length, condominios: BASE.condominios.length + (osm.condominios || []).length + (osm.edificios || []).length, marcos: BASE.marcos.length, cidades: BASE.cidades.length, fonteAberta: osm.fonte || null, mapaAtualizadoEm: osm.geradoEm || null };
    })(),
    bairros: [...BASE.bairros.map(b => ({ nome: b.name, regiao: b.region })), ...((loadOsm() || {}).bairros || []).map(b => ({ nome: b.name, regiao: b.region || b.city || '' }))],
    condominios: BASE.condominios.map(c => c.name),
    marcos: BASE.marcos.map(m => ({ nome: m.name, bairro: m.bairro })),
    cidades: BASE.cidades.map(c => c.name),
    extraPlaces: loadSettings().extraPlaces
  });
});

router.post('/api/cerebro/lugares', (req, res) => {
  const list = Array.isArray(req.body?.extraPlaces) ? req.body.extraPlaces : [];
  const clean = list.slice(0, 500).map(p => ({
    name: str(p.name, 80).trim(),
    kind: ['bairro', 'condominio', 'edificio', 'marco', 'cidade'].includes(p.kind) ? p.kind : 'edificio',
    bairro: str(p.bairro, 80).trim(),
    region: str(p.region, 20).trim(),
    aliases: str(Array.isArray(p.aliases) ? p.aliases.join(',') : p.aliases, 300)
  })).filter(p => p.name.length >= 3);
  saveSettings({ extraPlaces: clean });
  res.json({ ok: true, extraPlaces: clean });
});

module.exports = router;
