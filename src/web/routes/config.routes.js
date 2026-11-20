/**
 * Rotas de configurações do painel, teste de alerta e controle de grupos/sessão WA.
 */
const express = require('express');

const { ah, str, plainObj, publicConfig } = require('../helpers');
const { saveSettings } = require('../../config/settings');
const { updateEnvFile } = require('../../config/envfile');
const { hhmmToMinutes } = require('../../config/timeutil');
const wa = require('../../whatsapp/client');
const geminiChave = require('../../integrations/gemini/chave');
const buscaChaves = require('../../integrations/busca/chaves');

const router = express.Router();

const BOOL_KEYS = ['backupSemanalAtivo', 'modoApenasAvisar', 'humanModeEnabled', 'alertarQuase', 'usarIaGemini', 'enviarPdfQuandoPedir', 'firstContactEnabled', 'firstContactIgnorarAgenda', 'missedCallEnabled', 'assistenteAtivo', 'resumoDiarioAtivo', 'pausado'];
const TEXT_KEYS = { messageTemplate: 3000, humanTraining: 5000, firstContactMessage: 1000, missedCallMessage: 1000, gruposMonitorados: 500, assistenteNumerosExtras: 200 };
const NUM_KEYS = { maxPhotosPerMatch: [0, 10], minCriteriosParaEnvio: [1, 6], maxOfertasPorPedido: [1, 5], firstContactAquecimentoMin: [0, 240] };

router.post('/api/config', ah(async (req, res) => {
  const b = plainObj(req.body);
  // chave do Gemini em Ajustes: mesma conferência da página Busca (antes de salvar qualquer coisa)
  let chaveGemini = null;
  if (typeof b.geminiApiKey === 'string' && b.geminiApiKey.trim()) {
    const v = await geminiChave.validarChave(b.geminiApiKey);
    if (!v.ok) return res.status(400).json({ error: v.mensagem });
    chaveGemini = v.chave;
  }
  // chaves dos motores de busca nos portais (Tavily, Serper, Brave, Apify): conferidas no serviço antes de salvar
  const chavesBusca = {};
  const mensagensChaves = [];
  for (const [campo, prov] of [['tavilyApiKey', 'tavily'], ['serperApiKey', 'serper'], ['braveSearchKey', 'brave'], ['apifyToken', 'apify']]) {
    if (typeof b[campo] === 'string' && b[campo].trim()) {
      const v = await buscaChaves.validar(prov, b[campo]);
      if (!v.ok) return res.status(400).json({ error: v.mensagem });
      chavesBusca[buscaChaves.PROVEDORES[prov].env] = v.chave;
      mensagensChaves.push(v.mensagem);
    }
  }
  const upd = {};
  for (const k of BOOL_KEYS) if (b[k] !== undefined) upd[k] = Boolean(b[k]);
  for (const [k, max] of Object.entries(TEXT_KEYS)) if (typeof b[k] === 'string') upd[k] = b[k].slice(0, max);
  for (const [k, [min, max]] of Object.entries(NUM_KEYS)) if (b[k] !== undefined) upd[k] = Math.min(max, Math.max(min, parseInt(b[k], 10) || 0));
  if (typeof b.resumoDiarioHorario === 'string' && hhmmToMinutes(b.resumoDiarioHorario) !== null) upd.resumoDiarioHorario = b.resumoDiarioHorario;
  if (Array.isArray(b.gruposMonitoradosIds)) upd.gruposMonitoradosIds = b.gruposMonitoradosIds.map(String).filter(g => /@g\.us$/.test(g)).slice(0, 100);
  if (Array.isArray(b.dailySimpleReplies)) {
    upd.dailySimpleReplies = b.dailySimpleReplies.slice(0, 50).map(r => ({ trigger: str(r.trigger, 100), response: str(r.response, 1000), active: r.active !== false })).filter(r => r.trigger && r.response);
  }
  if (typeof b.meuWhatsappAlerta === 'string') upd.meuWhatsappAlerta = b.meuWhatsappAlerta.replace(/\D/g, '').slice(0, 13);
  const envUpd = {};
  if (chaveGemini) envUpd.GEMINI_API_KEY = chaveGemini;
  Object.assign(envUpd, chavesBusca);
  for (const [k, envK] of [['googleSheetsUrl', 'GOOGLE_SHEETS_CSV_URL'], ['googleSheetsWebhookUrl', 'GOOGLE_SHEETS_WEBHOOK_URL']]) {
    if (typeof b[k] === 'string') {
      const v = b[k].trim();
      if (v) {
        let u = null;
        try { u = new URL(v); } catch {}
        if (!u || u.protocol !== 'https:' || u.username || u.password || !['docs.google.com', 'script.google.com'].includes(u.hostname)) {
          return res.status(400).json({ error: 'Use um link do Google Sheets / Apps Script (https).' });
        }
      }
      upd[k] = v;
      envUpd[envK] = v;
    }
  }
  if (upd.meuWhatsappAlerta !== undefined) envUpd.MEU_WHATSAPP_ALERTA = upd.meuWhatsappAlerta;
  updateEnvFile(envUpd);
  saveSettings(upd);
  wa.addLog('CONFIG', 'Configurações atualizadas pelo painel.');
  res.json({ ok: true, config: publicConfig(), chavesMsg: mensagensChaves.join(' · ') || null });
}));

router.post('/api/test-alert', ah(async (req, res) => {
  const result = await wa.sendOwnerWhatsAppAlert('🔔 *TESTE DE ALERTA*\n\n✅ Seu número de alerta está funcionando. Responda *ajuda* para ver os comandos da BIGA.');
  res.json(result);
}));

router.get('/api/groups', ah(async (req, res) => {
  if (req.query.refresh) await wa.refreshGroups();
  res.json({ groups: wa.getAgentState().connectedGroups });
}));

router.post('/api/whatsapp/reset-session', ah(async (req, res) => {
  await wa.resetSession();
  res.json({ ok: true });
}));

module.exports = router;
