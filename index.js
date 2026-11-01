require('dotenv').config({ quiet: true });
// Chaves salvas pelo painel ficam na pasta de dados persistente (na VM o código é somente leitura)
if (process.env.DATA_DIR) require('dotenv').config({ path: require('path').join(process.env.DATA_DIR, '.env'), override: true, quiet: true });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
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
const prospeccao = require('./src/prospeccao');
const scheduler = require('./src/scheduler');
const auth = require('./src/auth');
const { BASE, loadOsm } = require('./src/brain/locations');
const garimpo = require('./src/garimpo');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
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
app.get(['/', '/dia-a-dia'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'src', 'public', 'index.html'));
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

// Atualiza variáveis no .env (somente chaves permitidas e sem quebra de linha)
const ENV_PATH = process.env.DATA_DIR ? path.join(DATA_DIR, '.env') : path.join(ROOT_DIR, '.env');
const ENV_ALLOWED = new Set(['GEMINI_API_KEY', 'GOOGLE_SHEETS_CSV_URL', 'GOOGLE_SHEETS_WEBHOOK_URL', 'MEU_WHATSAPP_ALERTA', 'BRAVE_API_KEY', 'GOOGLE_CSE_KEY', 'GOOGLE_CSE_CX', 'META_PAGE_TOKEN', 'META_PAGE_ID', 'META_IG_USER_ID']);
function updateEnvFile(updates) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
  for (const [key, raw] of Object.entries(updates)) {
    if (!ENV_ALLOWED.has(key)) continue;
    const value = String(raw).replace(/[\r\n]/g, '').trim().slice(0, 500);
    process.env[key] = value;
    const rx = new RegExp(`^${key}=.*$`, 'm');
    content = rx.test(content) ? content.replace(rx, () => `${key}=${value}`) : `${content}\n${key}=${value}`;
  }
  try {
    fs.writeFileSync(ENV_PATH, content.trim() + '\n', { encoding: 'utf-8', mode: 0o600 });
  } catch (err) {
    console.error('Aviso: não consegui gravar o .env:', err.message);
  }
}

function publicConfig() {
  const s = loadSettings();
  return {
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'coloque_sua_chave_aqui'),
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
  if (typeof b.geminiApiKey === 'string' && b.geminiApiKey.trim()) envUpd.GEMINI_API_KEY = b.geminiApiKey.trim();
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
  res.json({ ok: true, config: publicConfig() });
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
  res.json({ ok: true, post: vitrine.upsertPost(p, { texto: typeof req.body?.texto === 'string' ? req.body.texto : undefined, foto }) });
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
