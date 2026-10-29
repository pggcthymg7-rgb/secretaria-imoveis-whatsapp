require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');

const {
  LOCAL_CSV_PATH,
  loadInventory,
  loadAllProperties,
  createProperty,
  updateProperty,
  deleteProperty
} = require('./src/sheets');
const { analyzeMessageAndMatch, formatOutreachMessage } = require('./src/matcher');
const { loadSettings, saveSettings, DEFAULT_MESSAGE_TEMPLATE, DEFAULT_HUMAN_TRAINING } = require('./src/settings');
const { startWhatsAppAgent, getAgentState, addLog, sendOwnerWhatsAppAlert } = require('./src/whatsapp');
const { getDailyState, removeKnownContact, addDailyLog } = require('./src/atendimento-diario');

const app = express();
app.use(cors());
app.use(express.json());

const FOTOS_DIR = path.join(__dirname, 'fotos');
if (!fs.existsSync(FOTOS_DIR)) {
  fs.mkdirSync(FOTOS_DIR, { recursive: true });
}
app.use('/fotos', express.static(FOTOS_DIR));

// Configuração do Multer para upload de fotos de imóveis direto pelo Mini-CRM
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, FOTOS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '.jpg').toLowerCase() || '.jpg';
    const safeName = file.originalname
      .replace(ext, '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '_')
      .slice(0, 30);
    cb(null, `${Date.now()}_${safeName}${ext}`);
  }
});
const upload = multer({ storage });

const ENV_PATH = path.join(__dirname, '.env');

/**
 * Atualiza variáveis no arquivo .env sem perder comentários
 */
function updateEnvFile(updates) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';

  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = String(value);
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }

  fs.writeFileSync(ENV_PATH, content.trim() + '\n', 'utf-8');
}

// Endpoint: Status geral do agente, grupos, logs e carteira completa para o Mini-CRM
app.get('/api/status', async (req, res) => {
  const refreshMode = req.query.refresh === 'google' ? 'from_google' : req.query.refresh === 'true';
  const allProperties = await loadAllProperties(refreshMode);
  const activeInventory = allProperties.filter(p => p.ativo);
  const state = getAgentState();
  const settings = loadSettings();

  res.json({
    ...state,
    config: {
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'coloque_sua_chave_aqui'),
      googleSheetsUrl: settings.googleSheetsUrl || process.env.GOOGLE_SHEETS_CSV_URL || '',
      googleSheetsWebhookUrl: settings.googleSheetsWebhookUrl || process.env.GOOGLE_SHEETS_WEBHOOK_URL || '',
      gruposMonitorados: settings.gruposMonitorados !== undefined ? settings.gruposMonitorados : (process.env.GRUPOS_MONITORADOS || 'teste'),
      modoApenasAvisar: settings.modoApenasAvisar !== undefined ? Boolean(settings.modoApenasAvisar) : ((process.env.MODO_APENAS_AVISAR || 'false').toLowerCase() === 'true'),
      meuWhatsappAlerta: settings.meuWhatsappAlerta || process.env.MEU_WHATSAPP_ALERTA || '5562983443060',
      messageTemplate: settings.messageTemplate,
      defaultMessageTemplate: DEFAULT_MESSAGE_TEMPLATE,
      maxPhotosPerMatch: settings.maxPhotosPerMatch || 5,
      humanTraining: settings.humanTraining,
      defaultHumanTraining: DEFAULT_HUMAN_TRAINING,
      humanModeEnabled: settings.humanModeEnabled !== false,
      firstContactEnabled: settings.firstContactEnabled !== false,
      firstContactMessage: settings.firstContactMessage,
      missedCallEnabled: settings.missedCallEnabled !== false,
      missedCallMessage: settings.missedCallMessage,
      dailySimpleReplies: settings.dailySimpleReplies || []
    },
    daily: getDailyState(),
    inventoryCount: activeInventory.length,
    totalCount: allProperties.length,
    inventory: allProperties
  });
});

// Endpoint: Upload de fotos do computador pelo Mini-CRM
app.post('/api/upload-photos', upload.array('photos', 15), (req, res) => {
  try {
    const files = (req.files || []).map(f => f.filename);
    res.json({ ok: true, files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Cadastrar novo imóvel pelo Mini-CRM (já valida e grava na planilha)
app.post('/api/property', async (req, res) => {
  try {
    const created = await createProperty(req.body);
    const allProperties = await loadAllProperties(true);
    addLog('CRM_CADASTRO', `Imóvel #${created.id} (${created.tipo} - ${created.setor}) salvo na planilha.`);
    res.json({ ok: true, property: created, inventory: allProperties });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Editar imóvel ou alternar Ativo/Inativo pelo Mini-CRM
app.put('/api/property/:id', async (req, res) => {
  try {
    const updated = await updateProperty(req.params.id, req.body);
    const allProperties = await loadAllProperties(true);
    addLog('CRM_EDICAO', `Imóvel #${updated.id} (${updated.tipo} - ${updated.setor}) atualizado na planilha.`);
    res.json({ ok: true, property: updated, inventory: allProperties });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Excluir imóvel pelo Mini-CRM
app.delete('/api/property/:id', async (req, res) => {
  try {
    const allProperties = await deleteProperty(req.params.id);
    addLog('CRM_EXCLUSAO', `Imóvel #${req.params.id} removido da planilha.`);
    res.json({ ok: true, inventory: allProperties });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Baixar a planilha ideal (.csv) pronta para abrir no Excel ou importar no Google Sheets
app.get('/api/export-csv', (req, res) => {
  if (!fs.existsSync(LOCAL_CSV_PATH)) {
    return res.status(404).send('Planilha não encontrada.');
  }
  res.download(LOCAL_CSV_PATH, 'carteira_imoveis_ideal.csv');
});

// Endpoint: Ler o código do Google Apps Script para copiar com 1 clique
app.get('/api/google-script', (req, res) => {
  const scriptPath = path.join(__dirname, 'GOOGLE_SHEETS_SCRIPT.gs');
  const code = fs.existsSync(scriptPath) ? fs.readFileSync(scriptPath, 'utf-8') : '';
  res.json({ code });
});

// Endpoint: Simulador de mensagens de grupo para testar a IA e os filtros na hora
app.post('/api/simulate', async (req, res) => {
  try {
    const { message, senderName } = req.body;
    const inventory = await loadInventory();
    const analysis = await analyzeMessageAndMatch(message, senderName || 'Cliente Teste', inventory);

    const previews = (analysis.matches || []).map(prop => ({
      property: prop,
      whatsappMessagePreview: formatOutreachMessage(
        senderName || 'João',
        message,
        prop,
        analysis
      )
    }));

    // Mesmo se não houver imóvel compatível na carteira, gera prévia de como a secretária falaria
    const sampleHumanPreview = analysis.isLookingForProperty
      ? formatOutreachMessage(
          senderName || 'João',
          message,
          (analysis.matches && analysis.matches[0]) || {
            tipo: analysis.criteria?.tipo || 'Apartamento',
            setor: analysis.criteria?.setor || 'Setor Bueno',
            regiao: analysis.criteria?.regiao || 'Região Sul',
            mobiliado: analysis.criteria?.mobiliado || 'SIM',
            quartos: analysis.criteria?.quartos || 3,
            tamanho_m2: analysis.criteria?.tamanho_m2 || 95,
            valor: analysis.criteria?.valor_maximo || 480000,
            descricao: 'Imóvel exemplo para demonstrar o tom humano da secretária.'
          },
          analysis
        )
      : null;

    res.json({
      analysis,
      previews,
      sampleHumanPreview
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Salvar configurações pelo Painel Web (incluindo Modelo de Mensagem, Treinamento Humano e Limite de 5 Fotos)
app.post('/api/config', async (req, res) => {
  try {
    const {
      geminiApiKey,
      googleSheetsUrl,
      googleSheetsWebhookUrl,
      gruposMonitorados,
      modoApenasAvisar,
      meuWhatsappAlerta,
      messageTemplate,
      maxPhotosPerMatch,
      humanTraining,
      humanModeEnabled,
      firstContactEnabled,
      firstContactMessage,
      missedCallEnabled,
      missedCallMessage,
      dailySimpleReplies
    } = req.body;
    const updates = {};

    if (geminiApiKey !== undefined && geminiApiKey.trim() !== '') {
      updates.GEMINI_API_KEY = geminiApiKey.trim();
    }
    if (googleSheetsUrl !== undefined) {
      updates.GOOGLE_SHEETS_CSV_URL = googleSheetsUrl.trim();
    }
    if (googleSheetsWebhookUrl !== undefined) {
      updates.GOOGLE_SHEETS_WEBHOOK_URL = googleSheetsWebhookUrl.trim();
    }
    if (gruposMonitorados !== undefined) {
      updates.GRUPOS_MONITORADOS = gruposMonitorados.trim();
    }
    if (modoApenasAvisar !== undefined) {
      updates.MODO_APENAS_AVISAR = String(Boolean(modoApenasAvisar));
    }
    if (meuWhatsappAlerta !== undefined) {
      updates.MEU_WHATSAPP_ALERTA = meuWhatsappAlerta.replace(/\D/g, '');
    }

    updateEnvFile(updates);

    saveSettings({
      ...(googleSheetsUrl !== undefined ? { googleSheetsUrl: googleSheetsUrl.trim() } : {}),
      ...(googleSheetsWebhookUrl !== undefined ? { googleSheetsWebhookUrl: googleSheetsWebhookUrl.trim() } : {}),
      ...(gruposMonitorados !== undefined ? { gruposMonitorados: gruposMonitorados.trim() } : {}),
      ...(modoApenasAvisar !== undefined ? { modoApenasAvisar: Boolean(modoApenasAvisar) } : {}),
      ...(meuWhatsappAlerta !== undefined ? { meuWhatsappAlerta: meuWhatsappAlerta.replace(/\D/g, '') } : {}),
      ...(messageTemplate !== undefined ? { messageTemplate } : {}),
      ...(maxPhotosPerMatch !== undefined ? { maxPhotosPerMatch: Number(maxPhotosPerMatch) || 5 } : {}),
      ...(humanTraining !== undefined ? { humanTraining } : {}),
      ...(humanModeEnabled !== undefined ? { humanModeEnabled: Boolean(humanModeEnabled) } : {}),
      ...(firstContactEnabled !== undefined ? { firstContactEnabled: Boolean(firstContactEnabled) } : {}),
      ...(firstContactMessage !== undefined ? { firstContactMessage } : {}),
      ...(missedCallEnabled !== undefined ? { missedCallEnabled: Boolean(missedCallEnabled) } : {}),
      ...(missedCallMessage !== undefined ? { missedCallMessage: missedCallMessage } : {}),
      ...(dailySimpleReplies !== undefined ? { dailySimpleReplies } : {})
    });

    await loadAllProperties(true);
    addLog('CONFIG', 'Configurações atualizadas pelo Painel Web.');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para testar o envio de Alerta diretamente para o WhatsApp do Corretor
app.post('/api/test-alert', async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (phone && phone.replace(/\D/g, '').length >= 10) {
      const clean = phone.replace(/\D/g, '');
      updateEnvFile({ MEU_WHATSAPP_ALERTA: clean });
      saveSettings({ meuWhatsappAlerta: clean });
    }
    const result = await sendOwnerWhatsAppAlert(
      `🔔 *TESTE DE ALERTA DA SUA SECRETÁRIA IMOBILIÁRIA!*\n\n` +
      `✅ Seu número de alerta está configurado e funcionando perfeitamente.\n` +
      `Sempre que surgir uma oportunidade 100% compatível nos grupos — ou sempre que a secretária ficar com alguma dúvida e bloquear o envio por precaução — você receberá o aviso aqui na hora!`
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Endpoint exclusivo da Página 2 (Dia a Dia): Liberar um número da memória para testar 1ª mensagem
app.post('/api/daily/reset-contact', (req, res) => {
  const { phone } = req.body || {};
  const removed = removeKnownContact(phone);
  addDailyLog('TESTE', `Número ${phone} liberado na memória para teste de 1ª mensagem.`);
  res.json({
    ok: true,
    removed,
    message: `✅ Número ${phone} liberado! A próxima mensagem que ele te mandar no privado será tratada como 1ª mensagem ("Nova Conversa").`
  });
});

// Endpoint de Keep-Alive (Despertador automático para nuvem gratuita não dormir)
app.get('/ping', (req, res) => {
  res.status(200).json({ ok: true, status: 'awake', time: new Date().toISOString() });
});

// ============================================================================
// PÁGINA 1: SECRETÁRIA DOS GRUPOS DE IMÓVEIS + MINI-CRM (/)
// ============================================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'dashboard.html'));
});

// ============================================================================
// PÁGINA 2: SAUDAÇÕES, 1ª MENSAGEM, LIGAÇÕES E DIA A DIA (/dia-a-dia)
// ============================================================================
app.get('/dia-a-dia', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'dashboard-diario.html'));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n🚀 MINI-CRM & SECRETÁRIA IMOBILIÁRIA ATIVO EM: http://0.0.0.0:${PORT}`);
  console.log(`📂 Planilha ideal (${LOCAL_CSV_PATH}) carregada com ${(await loadInventory()).length} imóveis disponíveis.`);
  startWhatsAppAgent().catch(err => {
    console.error('Erro ao iniciar WhatsApp:', err);
  });

  // Despertador automático para manter o Render gratuito acordado 24h
  const externalUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL;
  if (externalUrl) {
    console.log(`⏰ Despertador 24h ativado para: ${externalUrl}/ping`);
    setInterval(() => {
      fetch(`${externalUrl.replace(/\/$/, '')}/ping`).catch(() => {});
    }, 10 * 60 * 1000); // A cada 10 minutos
  }
});
