/**
 * Rotas de status, métricas, backup/restauração e sistema/atualização.
 */
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');

const { ah, publicConfig } = require('../helpers');
const sheets = require('../../domain/sheets');
const wa = require('../../whatsapp/client');
const daily = require('../../whatsapp/atendimento-diario');
const contacts = require('../../whatsapp/contacts');
const radar = require('../../domain/radar');
const metrics = require('../../config/metrics');
const backup = require('../../config/backup');
const sistema = require('../../config/sistema');
const { nowParts } = require('../../config/timeutil');

const restoreUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 150 * 1024 * 1024, files: 1 } });

function createStatusRoutes({ papel }) {
  const router = express.Router();

  router.get('/api/status', ah(async (req, res) => {
    const all = await sheets.loadAllProperties(req.query.refresh === 'google' ? 'from_google' : false);
    const state = wa.getAgentState();
    const qrSvg = state.latestQrCode ? await QRCode.toString(state.latestQrCode, { type: 'svg', margin: 1 }) : null;
    res.json({
      ...state,
      latestQrCode: undefined,
      qrSvg,
      papel, // 'admin' (dono do SaaS) ou 'corretor' (BIGA da equipe, sem a estrutura do SaaS)
      config: publicConfig(),
      daily: daily.getDailyState(),
      contatos: contacts.stats(),
      hoje: metrics.getDay(),
      semana: metrics.lastDays(7),
      inventoryCount: all.filter(p => p.ativo).length,
      totalCount: all.length,
      radarHoje: radar.since(Date.now() - nowParts().minutes * 60000).length
    });
  }));

  router.get('/api/backup', (req, res) => {
    try {
      contacts.flush();
      radar.flush();
    } catch {}
    const buf = backup.createBackup();
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${backup.backupFileName()}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buf);
  });

  router.post('/api/restore', (req, res) => {
    restoreUpload.single('backup')(req, res, err => {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Backup maior que 150 MB.' : err.message });
      if (!req.file) return res.status(400).json({ error: 'Escolha o arquivo de backup (.json.gz).' });
      try {
        const r = backup.restoreBackup(req.file.buffer);
        wa.addLog('BACKUP', `♻️ Backup de ${r.criadoEm} restaurado (${r.arquivos.length} arquivos, ${r.fotos} fotos). Reiniciando…`);
        res.json({ ok: true, ...r, reiniciando: true });
        // reinicia para recarregar tudo da memória restaurada (systemd/Render sobem de novo sozinhos)
        if (process.env.NODE_ENV !== 'test') setTimeout(() => process.exit(0), 1500);
      } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
      }
    });
  });

  router.get('/api/sistema', (req, res) => res.json({ versao: sistema.version(), naVM: Boolean(process.env.DATA_DIR), resultados: sistema.lastResults() }));

  router.post('/api/sistema/atualizar', (req, res) => {
    const r = sistema.requestUpdate();
    wa.addLog('SISTEMA', '🔄 Atualização pedida pelo painel.');
    res.json({ ...r, message: 'Atualização pedida. Se houver versão nova, a BIGA reinicia em 1 a 2 minutos (o WhatsApp continua conectado).' });
  });

  return router;
}

module.exports = { createStatusRoutes };
