require('dotenv').config({ quiet: true });
// Chaves salvas pelo painel ficam na pasta de dados persistente (na VM o código é somente leitura)
if (process.env.DATA_DIR) require('dotenv').config({ path: require('path').join(process.env.DATA_DIR, '.env'), override: true, quiet: true });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const QRCode = require('qrcode');

const { FOTOS_DIR, DATA_DIR, ROOT_DIR } = require('./src/paths');
const sheets = require('./src/sheets');
const { analyzeMessageAndMatch, formatOutreachMessage } = require('./src/matcher');
const { loadSettings, saveSettings, DEFAULT_MESSAGE_TEMPLATE, DEFAULT_HUMAN_TRAINING } = require('./src/settings');
const wa = require('./src/whatsapp');
const daily = require('./src/atendimento-diario');
const contacts = require('./src/contacts');
const radar = require('./src/radar');
const metrics = require('./src/metrics');
const vitrine = require('./src/vitrine');
const capas = require('./src/capas');
const fichaPdf = require('./src/pdf-ficha');
const prospeccao = require('./src/prospeccao');
const scheduler = require('./src/scheduler');
const auth = require('./src/auth');
const { BASE, loadOsm } = require('./src/brain/locations');
const garimpo = require('./src/garimpo');
const sistema = require('./src/sistema');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
// Limite geral por IP (o login tem o seu, mais rígido, em auth.js). /ping e /health ficam de fora: são para monitor.
// RATE_LIMIT_MAX muda o teto por minuto (o painel faz poucas chamadas; 600/min é bem folgado).
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_MAX) || 600,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: req => req.path === '/ping' || req.path === '/health',
    message: { error: 'Muitas requisições. Aguarde um minuto.' }
  })
);
app.use(express.json({ limit: '1mb' }));

// Cabeçalhos de segurança
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
  next();
});

if (!fs.existsSync(FOTOS_DIR)) fs.mkdirSync(FOTOS_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Rotas públicas
// ---------------------------------------------------------------------------
app.get('/ping', (req, res) => res.json({ ok: true, status: 'awake', time: new Date().toISOString() }));
app.get('/health', (req, res) => res.json({ ok: true, whatsapp: wa.getAgentState().connectionStatus }));
app.use('/assets', express.static(path.join(__dirname, 'src', 'public'), { maxAge: '1h', index: false }));
// O painel pede app.js/app.css com ?v=<versão>: depois de "atualizar", o celular já carrega o
// painel novo (antes o navegador podia usar a versão antiga por até 1 hora).
const INDEX_HTML = path.join(__dirname, 'src', 'public', 'index.html');
app.get(['/', '/dia-a-dia'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const v = require('./src/sistema').version() || String(fs.statSync(INDEX_HTML).mtimeMs | 0);
  res.type('html').send(fs.readFileSync(INDEX_HTML, 'utf-8').replace(/(\/assets\/[\w-]+\.(?:js|css))"/g, `$1?v=${v}"`));
});

app.use('/api', auth.requireAppHeader);
auth.routes(app);

// Tudo abaixo exige login
app.use('/api', auth.requireAuth);
app.use('/fotos', auth.requireAuth, express.static(FOTOS_DIR, { index: false, dotfiles: 'deny' }));

const ah = fn => (req, res) => Promise.resolve(fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message || 'Erro interno' }));
const str = (v, max = 5000) => (typeof v === 'string' ? v.slice(0, max) : '');

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

// Atualiza variáveis no .env (somente chaves permitidas e sem quebra de linha) — ver src/envfile.js
const { updateEnvFile } = require('./src/envfile');

function publicConfig() {
  const s = loadSettings();
  return {
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'coloque_sua_chave_aqui'),
    hasTavilyKey: Boolean(process.env.TAVILY_API_KEY),
    hasSerperKey: Boolean(process.env.SERPER_API_KEY),
    hasBraveKey: Boolean(process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY),
    hasApifyToken: Boolean(process.env.APIFY_API_TOKEN),
    googleSheetsUrl: s.googleSheetsUrl || process.env.GOOGLE_SHEETS_CSV_URL || '',
    googleSheetsWebhookUrl: s.googleSheetsWebhookUrl || process.env.GOOGLE_SHEETS_WEBHOOK_URL || '',
    gruposMonitorados: s.gruposMonitorados,
    gruposMonitoradosIds: s.gruposMonitoradosIds || [],
    modoApenasAvisar: s.modoApenasAvisar,
    meuWhatsappAlerta: s.meuWhatsappAlerta,
    messageTemplate: s.messageTemplate,
    defaultMessageTemplate: DEFAULT_MESSAGE_TEMPLATE,
    maxPhotosPerMatch: s.maxPhotosPerMatch,
    humanTraining: s.humanTraining,
    defaultHumanTraining: DEFAULT_HUMAN_TRAINING,
    humanModeEnabled: s.humanModeEnabled,
    minCriteriosParaEnvio: s.minCriteriosParaEnvio,
    maxOfertasPorPedido: s.maxOfertasPorPedido,
    alertarQuase: s.alertarQuase,
    usarIaGemini: s.usarIaGemini,
    enviarPdfQuandoPedir: s.enviarPdfQuandoPedir,
    firstContactEnabled: s.firstContactEnabled,
    firstContactMessage: s.firstContactMessage,
    firstContactIgnorarAgenda: s.firstContactIgnorarAgenda,
    firstContactAquecimentoMin: s.firstContactAquecimentoMin,
    missedCallEnabled: s.missedCallEnabled,
    missedCallMessage: s.missedCallMessage,
    dailySimpleReplies: s.dailySimpleReplies,
    assistenteAtivo: s.assistenteAtivo,
    assistenteNumerosExtras: s.assistenteNumerosExtras,
    resumoDiarioAtivo: s.resumoDiarioAtivo,
    resumoDiarioHorario: s.resumoDiarioHorario,
    backupSemanalAtivo: s.backupSemanalAtivo,
    pausado: s.pausado,
    dataDirPersistente: Boolean(process.env.DATA_DIR)
  };
}

// ---------------------------------------------------------------------------
// Status / visão geral
// ---------------------------------------------------------------------------
app.get('/api/status', ah(async (req, res) => {
  const all = await sheets.loadAllProperties(req.query.refresh === 'google' ? 'from_google' : false);
  const state = wa.getAgentState();
  const qrSvg = state.latestQrCode ? await QRCode.toString(state.latestQrCode, { type: 'svg', margin: 1 }) : null;
  res.json({
    ...state,
    latestQrCode: undefined,
    qrSvg,
    config: publicConfig(),
    daily: daily.getDailyState(),
    contatos: contacts.stats(),
    hoje: metrics.getDay(),
    semana: metrics.lastDays(7),
    inventoryCount: all.filter(p => p.ativo).length,
    totalCount: all.length,
    radarHoje: radar.since(Date.now() - require('./src/timeutil').nowParts().minutes * 60000).length
  });
}));

// ---------------------------------------------------------------------------
// Carteira
// ---------------------------------------------------------------------------
app.get('/api/inventory', ah(async (req, res) => {
  res.json({ inventory: await sheets.loadAllProperties(req.query.refresh === 'google' ? 'from_google' : false) });
}));

app.post('/api/upload-photos', (req, res) => {
  upload.array('photos', 20)(req, res, err => {
    if (err) return res.status(err.status || 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Foto maior que 10 MB.' : err.message });
    res.json({ ok: true, files: (req.files || []).map(f => f.filename) });
  });
});

app.post('/api/property', ah(async (req, res) => {
  const created = await sheets.createProperty(req.body || {});
  wa.addLog('CRM_CADASTRO', `Imóvel #${created.id} (${created.tipo} - ${created.setor}) cadastrado.`);
  // 🎯 match reverso em segundo plano: avisa o dono no WhatsApp se alguém já pediu algo assim
  require('./src/quem-procura').avisarNovoImovel(created, { enviarAoDono: t => wa.sendOwnerWhatsAppAlert(t), log: wa.addLog });
  res.json({ ok: true, property: created, inventory: await sheets.loadAllProperties() });
}));

app.put('/api/property/:id', ah(async (req, res) => {
  const updated = await sheets.updateProperty(req.params.id, req.body || {});
  wa.addLog('CRM_EDICAO', `Imóvel #${updated.id} atualizado.`);
  res.json({ ok: true, property: updated, inventory: await sheets.loadAllProperties() });
}));

app.delete('/api/property/:id', ah(async (req, res) => {
  const inventory = await sheets.deleteProperty(req.params.id);
  vitrine.removePost(req.params.id);
  wa.addLog('CRM_EXCLUSAO', `Imóvel #${req.params.id} excluído.`);
  res.json({ ok: true, inventory });
}));

app.get('/api/export-csv', (req, res) => {
  if (!fs.existsSync(sheets.LOCAL_CSV_PATH)) return res.status(404).send('Planilha não encontrada.');
  res.download(sheets.LOCAL_CSV_PATH, 'carteira_imoveis.csv');
});

app.get('/api/google-script', (req, res) => {
  const p = path.join(__dirname, 'GOOGLE_SHEETS_SCRIPT.gs');
  res.json({ code: fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '' });
});

// ---------------------------------------------------------------------------
// Simulador
// ---------------------------------------------------------------------------
app.post('/api/simulate', ah(async (req, res) => {
  const message = str(req.body?.message, 4000);
  const senderName = str(req.body?.senderName, 80) || 'Corretor Teste';
  const inventory = await sheets.loadInventory();
  const analysis = await analyzeMessageAndMatch(message, senderName, inventory, { useAi: req.body?.useAi !== false });
  const previews = (analysis.matches || []).map(p => ({ property: p, whatsappMessagePreview: formatOutreachMessage(senderName, message, p, analysis) }));
  res.json({ analysis: { ...analysis, quase: (analysis.quase || []).map(q => ({ id: q.property.id, setor: q.property.setor, tipo: q.property.tipo, unknowns: q.unknowns })) }, previews });
}));

// ---------------------------------------------------------------------------
// Configurações
// ---------------------------------------------------------------------------
const BOOL_KEYS = ['backupSemanalAtivo', 'modoApenasAvisar', 'humanModeEnabled', 'alertarQuase', 'usarIaGemini', 'enviarPdfQuandoPedir', 'firstContactEnabled', 'firstContactIgnorarAgenda', 'missedCallEnabled', 'assistenteAtivo', 'resumoDiarioAtivo', 'pausado'];
const TEXT_KEYS = { messageTemplate: 3000, humanTraining: 5000, firstContactMessage: 1000, missedCallMessage: 1000, gruposMonitorados: 500, assistenteNumerosExtras: 200 };
const NUM_KEYS = { maxPhotosPerMatch: [0, 10], minCriteriosParaEnvio: [1, 6], maxOfertasPorPedido: [1, 5], firstContactAquecimentoMin: [0, 240] };

app.post('/api/config', ah(async (req, res) => {
  const b = req.body || {};
  // chave do Gemini em Ajustes: mesma conferência da página Busca (antes de salvar qualquer coisa)
  let chaveGemini = null;
  if (typeof b.geminiApiKey === 'string' && b.geminiApiKey.trim()) {
    const v = await require('./src/gemini-chave').validarChave(b.geminiApiKey);
    if (!v.ok) return res.status(400).json({ error: v.mensagem });
    chaveGemini = v.chave;
  }
  // chaves dos motores de busca nos portais (Tavily, Serper, Brave, Apify): conferidas no serviço antes de salvar
  const chavesBusca = {};
  const mensagensChaves = [];
  const buscaChaves = require('./src/busca-chaves');
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
  if (typeof b.resumoDiarioHorario === 'string' && /^\d{2}:\d{2}$/.test(b.resumoDiarioHorario)) upd.resumoDiarioHorario = b.resumoDiarioHorario;
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
      if (v && !/^https:\/\/(docs\.google\.com|script\.google\.com)\//.test(v)) return res.status(400).json({ error: 'Use um link do Google Sheets / Apps Script (https).' });
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

app.post('/api/test-alert', ah(async (req, res) => {
  const result = await wa.sendOwnerWhatsAppAlert('🔔 *TESTE DE ALERTA*\n\n✅ Seu número de alerta está funcionando. Responda *ajuda* para ver os comandos da BIGA.');
  res.json(result);
}));

// ---------------------------------------------------------------------------
// WhatsApp / grupos
// ---------------------------------------------------------------------------
app.get('/api/groups', ah(async (req, res) => {
  if (req.query.refresh) await wa.refreshGroups();
  res.json({ groups: wa.getAgentState().connectedGroups });
}));

// ---------------------------------------------------------------------------
// Backup / restauração de toda a memória
// ---------------------------------------------------------------------------
const backup = require('./src/backup');
app.get('/api/backup', (req, res) => {
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

const restoreUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 150 * 1024 * 1024, files: 1 } });
app.post('/api/restore', (req, res) => {
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

app.get('/api/sistema', (req, res) => res.json({ versao: sistema.version(), naVM: Boolean(process.env.DATA_DIR), resultados: sistema.lastResults() }));
app.post('/api/sistema/atualizar', (req, res) => {
  const r = sistema.requestUpdate();
  wa.addLog('SISTEMA', '🔄 Atualização pedida pelo painel.');
  res.json({ ...r, message: 'Atualização pedida. Se houver versão nova, a BIGA reinicia em 1 a 2 minutos (o WhatsApp continua conectado).' });
});

app.post('/api/whatsapp/reset-session', ah(async (req, res) => {
  await wa.resetSession();
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Radar de buscas
// ---------------------------------------------------------------------------
app.get('/api/radar', (req, res) => {
  res.json({ items: radar.list({ limit: Math.min(500, parseInt(req.query.limit, 10) || 200), decision: req.query.decision || undefined }), demanda: radar.demand(Number(req.query.dias) || 30) });
});

app.post('/api/radar/:code/enviar', ah(async (req, res) => {
  const r = await wa.approveAlert(null, String(req.params.code).toUpperCase(), req.body?.propId ? String(req.body.propId) : null);
  res.status(r.ok ? 200 : 400).json(r.ok ? r : { error: r.message });
}));

// ---------------------------------------------------------------------------
// Vitrine
// ---------------------------------------------------------------------------
// 🎯 Quem procura este imóvel? (pedidos dos grupos que batem com ele) e oferecer para eles
app.get('/api/property/:id/quem-procura', ah(async (req, res) => {
  const p = await sheets.getPropertyById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Imóvel não encontrado.' });
  const lista = await require('./src/quem-procura').quemProcura(p);
  res.json({ dias: require('./src/quem-procura').DIAS_PADRAO, lista: lista.map(({ texto, jid, ...l }) => ({ ...l, texto: texto.slice(0, 400) })) });
}));
app.post('/api/property/:id/oferecer', ah(async (req, res) => {
  const codes = Array.isArray(req.body?.codes) ? req.body.codes.map(String).filter(c => /^A\d{1,3}$/.test(c)).slice(0, 50) : null;
  const r = await wa.oferecerImovel(null, String(req.params.id), codes && codes.length ? codes : null);
  res.status(r.ok ? 200 : 400).json(r.ok ? r : { error: r.message });
}));

// Ficha em PDF (moderna e editável): ver, salvar edições, baixar e enviar pelo WhatsApp
async function imovelOu404(req, res) {
  const p = await sheets.getPropertyById(req.params.id);
  if (!p) res.status(404).json({ error: 'Imóvel não encontrado.' });
  return p;
}
app.get('/api/pdf/:id', ah(async (req, res) => {
  const p = await imovelOu404(req, res);
  if (p) res.json({ ficha: fichaPdf.ficha(p), cores: fichaPdf.CORES, fotos: (p.fotos || []).filter(f => !/^https?:/i.test(f)) });
}));
app.post('/api/pdf/:id', ah(async (req, res) => {
  const p = await imovelOu404(req, res);
  if (p) res.json({ ok: true, ficha: req.body?.restaurar ? fichaPdf.restaurar(p) : fichaPdf.salvar(p, req.body || {}) });
}));
app.post('/api/pdf/:id/arquivo', ah(async (req, res) => {
  const p = await imovelOu404(req, res);
  if (!p) return;
  const f = fichaPdf.salvar(p, req.body || {});
  const buf = await fichaPdf.gerar(p, f);
  res.set('Content-Disposition', `attachment; filename="${fichaPdf.nomeArquivo(p, f)}"`).type('application/pdf').send(buf);
}));
app.post('/api/pdf/:id/enviar', ah(async (req, res) => {
  const p = await imovelOu404(req, res);
  if (!p) return;
  const tel = prospeccao.normalizePhone(req.body?.telefone);
  if (!tel) return res.status(400).json({ error: 'Telefone inválido. Use DDD + número, ex.: 62 99999-9999.' });
  if (!wa.api.isConnected()) return res.status(400).json({ error: 'WhatsApp desconectado.' });
  const jid = await wa.api.checkNumber(tel);
  if (!jid) return res.status(400).json({ error: 'Esse número não tem WhatsApp.' });
  const f = fichaPdf.salvar(p, req.body?.ficha || {});
  const buf = await fichaPdf.gerar(p, f);
  await wa.api.sendDocument(jid, buf, fichaPdf.nomeArquivo(p, f), str(req.body?.mensagem, 1000));
  wa.addLog('PDF', `📄 Ficha do imóvel #${p.id} enviada para ${tel.slice(0, 4)}…${tel.slice(-2)}.`);
  res.json({ ok: true });
}));

// Capas (beta): modelos do editor de capas para o Instagram (o desenho é feito no navegador)
app.get('/api/capas', (req, res) => res.json(capas.listar()));
app.post('/api/capas/modelos', ah(async (req, res) => res.json({ ok: true, modelo: capas.salvar(req.body || {}), ...capas.listar() })));
app.delete('/api/capas/modelos/:id', (req, res) => res.json({ ok: capas.apagar(req.params.id), ...capas.listar() }));
app.get('/api/vitrine', (req, res) => res.json(vitrine.getState()));
app.post('/api/vitrine/config', (req, res) => res.json({ ok: true, config: vitrine.updateConfig(req.body || {}) }));
app.post('/api/vitrine/gerar', ah(async (req, res) => {
  const inv = await sheets.loadInventory();
  let n = 0;
  for (const p of inv) if (!vitrine.getState().posts[p.id]) {
    vitrine.upsertPost(p);
    n++;
  }
  res.json({ ok: true, criados: n, state: vitrine.getState() });
}));
app.post('/api/vitrine/post/:id', ah(async (req, res) => {
  const p = await sheets.getPropertyById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Imóvel não encontrado.' });
  const foto = typeof req.body?.foto === 'string' ? sheets.sanitizePhotoRef(req.body.foto) : undefined;
  // regerar: refaz o texto a partir da carteira (descrição completa), útil para posts antigos que saíam cortados
  const texto = req.body?.regerar ? vitrine.defaultPostText(p) : typeof req.body?.texto === 'string' ? req.body.texto : undefined;
  res.json({ ok: true, post: vitrine.upsertPost(p, { texto, foto }) });
}));
app.post('/api/vitrine/post/:id/status', (req, res) => {
  const st = String(req.body?.status || '');
  if (!['APROVADO', 'REPROVADO', 'PENDENTE'].includes(st)) return res.status(400).json({ error: 'Status inválido.' });
  const post = vitrine.setStatus(req.params.id, st);
  if (!post) return res.status(404).json({ error: 'Post não encontrado.' });
  res.json({ ok: true, post });
});
app.post('/api/vitrine/enviar-agora', ah(async (req, res) => {
  const r = await vitrine.runSlot(wa.api, await sheets.loadInventory(), 'manual', wa.addLog);
  res.status(r.ok ? 200 : 400).json(r.ok ? r : { error: r.error });
}));

// ---------------------------------------------------------------------------
// Prospecção
// ---------------------------------------------------------------------------
app.get('/api/prospeccao', (req, res) => res.json(prospeccao.getState()));
app.get('/api/contatos', (req, res) => res.json({ contatos: contacts.listContacts() }));
app.post('/api/prospeccao/parse', (req, res) => res.json({ contatos: prospeccao.parseContactsInput(str(req.body?.texto, 200000)) }));
app.post('/api/prospeccao/config', (req, res) => res.json({ ok: true, config: prospeccao.updateConfig(req.body || {}) }));
app.post('/api/prospeccao/campanha', ah(async (req, res) => {
  const b = req.body || {};
  const camp = prospeccao.createCampaign({ nome: str(b.nome, 80), mensagem: str(b.mensagem, 3000), imagem: b.imagem ? sheets.sanitizePhotoRef(b.imagem) : '', contatos: Array.isArray(b.contatos) ? b.contatos.slice(0, 1000) : [] });
  if (b.iniciar) prospeccao.setCampaignStatus(camp.id, 'ATIVA');
  res.json({ ok: true, state: prospeccao.getState() });
}));
app.post('/api/prospeccao/campanha/:id/status', ah(async (req, res) => {
  prospeccao.setCampaignStatus(req.params.id, String(req.body?.status || ''));
  res.json({ ok: true, state: prospeccao.getState() });
}));
app.delete('/api/prospeccao/campanha/:id', (req, res) => {
  prospeccao.deleteCampaign(req.params.id);
  res.json({ ok: true, state: prospeccao.getState() });
});
app.get('/api/prospeccao/campanha/:id', (req, res) => {
  const c = prospeccao.getCampaign(req.params.id);
  if (!c) return res.status(404).json({ error: 'Campanha não encontrada.' });
  res.json(c);
});

// ---------------------------------------------------------------------------
// Busca inteligente (mesmas funções do "Mensagem para mim")
// ---------------------------------------------------------------------------
const buscaInt = require('./src/busca-inteligente');
const anunciosMem = require('./src/anuncios');
function estadoBusca() {
  const imp = wa.estadoImportacao();
  return {
    config: buscaInt.getConfig(),
    memoria: anunciosMem.resumo(),
    importacao: imp ? { rodando: imp.rodando, anuncios: imp.anuncios, grupos: imp.grupos, comHistorico: imp.comHistorico, total: imp.total || 0, vistos: imp.vistos || 0, atual: imp.atual || '', semAncora: imp.semAncora.slice(0, 20), inicio: imp.inicio, fim: imp.fim || null } : null,
    historico: buscaInt.resumoHistorico(),
    grupos: (wa.getAgentState().connectedGroups || []).map(g => ({ id: g.id, subject: g.subject, participantsCount: g.participantsCount || 0, naBusca: buscaInt.grupoNaBusca(g.id) }))
  };
}
async function relatorioNoWhatsApp(r) {
  for (const parte of buscaInt.formatarRelatorio(r)) {
    const ok = await wa.sendOwnerWhatsAppAlert(`🤖 ${parte}`);
    if (ok && ok.ok === false) throw Object.assign(new Error(ok.error || 'WhatsApp desconectado.'), { status: 409 });
  }
}
app.get('/api/busca', (req, res) => res.json(estadoBusca()));
app.post('/api/busca', ah(async (req, res) => {
  const texto = str(req.body?.texto, 500).trim();
  // Filtros (campos iguais aos dos portais). Se vierem preenchidos, valem eles; o texto livre, se houver, entra como "mais detalhes".
  const bf = require('./src/busca-filtros');
  const bruto = {};
  for (const k of ['tipo', 'negocio', 'cidade', 'bairro', 'local', 'valorMin', 'valorMax', 'quartos', 'suites', 'vagas', 'areaMin', 'areaMax', 'extras']) {
    const v = req.body?.filtros?.[k];
    if (typeof v === 'string' || typeof v === 'number') bruto[k] = String(v);
  }
  const { filtros: normalizados, erros: errosFiltros } = bf.normalizarFiltros(bruto);
  if (errosFiltros.length) return res.status(400).json({ error: errosFiltros.join(' ') });
  let r;
  if (bf.preenchidos(normalizados)) {
    if (texto) bruto.extras = [bruto.extras, texto].filter(Boolean).join(', ').slice(0, 200);
    r = await buscaInt.buscarComFiltros(bruto);
  } else {
    if (texto.length < 8) return res.status(400).json({ error: 'Preencha os filtros (cidade, bairro, valor…) ou escreva o pedido do cliente (ex.: apto 800 mil a 1 milhão no Setor Marista).' });
    const { countCriteria } = require('./src/brain/engine');
    if (countCriteria(buscaInt.entenderPedido(texto).criterios) < 2) return res.status(400).json({ error: 'Preciso de mais detalhes: tipo, bairro, preço ou metragem.' });
    r = await buscaInt.buscar(texto);
  }
  wa.addLog('BUSCA', `🔎 Busca nº ${r.id} (painel): ${r.descricao} — ${r.grupos.length} nos grupos, ${r.portais.itens.length} nos portais.`);
  if (req.body?.whatsapp) await relatorioNoWhatsApp(r).catch(() => {});
  res.json({ ok: true, busca: r, estado: estadoBusca() });
}));
app.get('/api/busca/item/:id', (req, res) => {
  const r = buscaInt.getBusca(req.params.id);
  if (!r) return res.status(404).json({ error: 'Busca não encontrada.' });
  res.json(r);
});
app.post('/api/busca/item/:id/whatsapp', ah(async (req, res) => {
  const r = buscaInt.getBusca(req.params.id);
  if (!r) return res.status(404).json({ error: 'Busca não encontrada.' });
  await relatorioNoWhatsApp(r);
  res.json({ ok: true });
}));
app.post('/api/busca/config', ah(async (req, res) => {
  const b = req.body || {};
  let chaveMsg = null;
  if (typeof b.geminiApiKey === 'string' && b.geminiApiKey.trim()) {
    const v = await require('./src/gemini-chave').validarChave(b.geminiApiKey);
    if (!v.ok) return res.status(400).json({ error: v.mensagem });
    updateEnvFile({ GEMINI_API_KEY: v.chave });
    chaveMsg = v.mensagem;
  }
  res.json({ ok: true, chaveMsg, config: buscaInt.atualizarConfig(b), estado: estadoBusca() });
}));
app.post('/api/busca/testar-chave', ah(async (req, res) => {
  res.json(await require('./src/gemini-chave').testarChaveSalva());
}));
app.post('/api/busca/diagnostico', ah(async (req, res) => {
  res.json(await require('./src/gemini-chave').diagnosticarSalva());
}));
app.post('/api/busca/importar-historico', ah(async (req, res) => {
  await wa.importarHistoricoGrupos({
    onFim: e => wa.sendOwnerWhatsAppAlert(`🤖 📥 *Histórico importado*\n${e.anuncios} anúncios de ${e.comHistorico} de ${e.grupos} grupos.`).catch(() => {})
  });
  res.json({ ok: true, estado: estadoBusca() });
}));
const conversaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024, files: 1 } });
app.post('/api/busca/importar-conversa', (req, res) => {
  conversaUpload.single('arquivo')(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo grande demais (máximo 40 MB).' : 'Envio inválido.' });
    if (!req.file || !/\.(txt|zip)$/i.test(req.file.originalname || '')) return res.status(400).json({ error: 'Envie a conversa exportada (.txt ou .zip).' });
    try {
      // o navegador manda o nome em UTF-8, mas o multer lê como latin1 ("PadrÃ£o")
      let nome = String(req.file.originalname || '');
      const utf8 = Buffer.from(nome, 'latin1').toString('utf8');
      if (!utf8.includes('\uFFFD')) nome = utf8;
      const r = anunciosMem.importarExportacao(req.file.buffer, nome);
      wa.addLog('BUSCA', `📥 Conversa exportada "${r.grupo}" (painel): ${r.anuncios} anúncios de ${r.lidas} mensagens.`);
      res.json({ ok: true, ...r, estado: estadoBusca() });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
});

// ---------------------------------------------------------------------------
// Garimpo (clientes procurando imóvel na internet)
// ---------------------------------------------------------------------------
app.get('/api/garimpo', (req, res) => res.json(garimpo.getState()));
app.post('/api/garimpo/config', (req, res) => res.json({ ok: true, config: garimpo.updateConfig(req.body || {}) }));
app.post('/api/garimpo/chaves', (req, res) => {
  const b = req.body || {};
  const map = { braveKey: 'BRAVE_API_KEY', googleKey: 'GOOGLE_CSE_KEY', googleCx: 'GOOGLE_CSE_CX', metaToken: 'META_PAGE_TOKEN', metaPageId: 'META_PAGE_ID', igUserId: 'META_IG_USER_ID' };
  const upd = {};
  for (const [k, env] of Object.entries(map)) if (typeof b[k] === 'string' && b[k].trim()) upd[env] = b[k].trim().slice(0, 400);
  for (const k of ['META_PAGE_ID', 'META_IG_USER_ID', 'GOOGLE_CSE_CX']) if (upd[k] && !/^[\w:-]+$/.test(upd[k])) return res.status(400).json({ error: `Valor inválido para ${k}.` });
  updateEnvFile(upd);
  res.json({ ok: true, state: garimpo.getState() });
});
app.post('/api/garimpo/rodar', ah(async (req, res) => {
  const r = await garimpo.run({ inventory: await sheets.loadInventory(), extraPlaces: loadSettings().extraPlaces, onLeads: scheduler.alertLeads(wa.api) });
  res.json({ ...r, state: garimpo.getState() });
}));
app.post('/api/garimpo/lead/:id', (req, res) => {
  garimpo.setLeadStatus(String(req.params.id), String(req.body?.status || ''));
  res.json({ ok: true, state: garimpo.getState() });
});

// ---------------------------------------------------------------------------
// Cérebro (lugares personalizados)
// ---------------------------------------------------------------------------
app.get('/api/cerebro', (req, res) => {
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
app.post('/api/cerebro/lugares', (req, res) => {
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

// ---------------------------------------------------------------------------
// Atendimento
// ---------------------------------------------------------------------------
app.post('/api/daily/reset-contact', (req, res) => {
  const phone = str(req.body?.phone, 30).replace(/\D/g, '');
  if (phone.length < 10) return res.status(400).json({ error: 'Número inválido.' });
  const removed = contacts.forget(phone);
  daily.addDailyLog('TESTE', `Número ${phone} liberado para testar a 1ª mensagem.`);
  res.json({ ok: true, removed, message: `Número ${phone} liberado: a próxima mensagem dele será tratada como 1ª mensagem.` });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.status ? err.message : 'Erro interno' }));

// ---------------------------------------------------------------------------
// Partida
// ---------------------------------------------------------------------------
function shutdown() {
  try {
    contacts.flush();
    radar.flush();
  } catch {}
  process.exit(0);
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const HOST = process.env.HOST || '0.0.0.0';
  app.listen(PORT, HOST, async () => {
    console.log(`\n🚀 BIGA — SECRETÁRIA IMOBILIÁRIA ATIVA EM: http://${HOST}:${PORT}${process.env.PUBLIC_URL ? ` (público: ${process.env.PUBLIC_URL})` : ''}`);
    console.log(`📂 Dados em: ${DATA_DIR}${process.env.DATA_DIR ? '' : ' (defina DATA_DIR para um disco persistente na nuvem)'}`);
    console.log(`🏠 ${(await sheets.loadInventory()).length} imóveis ativos.`);
    if (!auth.isConfigured()) auth.getSetupCode();
    wa.startWhatsAppAgent().catch(err => console.error('Erro ao iniciar WhatsApp:', err));
    scheduler.start(wa.api, wa.addLog);

    const externalUrl = process.env.RENDER_EXTERNAL_URL;
    if (externalUrl) {
      setInterval(() => fetch(`${externalUrl.replace(/\/$/, '')}/ping`).catch(() => {}), 10 * 60 * 1000);
    }
  });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { app };
