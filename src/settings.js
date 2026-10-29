const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '..', 'settings.json');

// ============================================================================
// PARTE 1: CONFIGURAÇÕES DA SECRETÁRIA DOS GRUPOS DE IMÓVEIS
// ============================================================================
const DEFAULT_HUMAN_TRAINING = `- Se a pessoa pedir com urgência (ex: "urgente", "pra hoje", "visita hoje", "rápido", "cliente na cidade"), responda de forma ágil dizendo: "Tenho essa daqui disponível e podemos ir a qualquer horário, é só me avisar!"
- Se for um corretor falando que tem cliente (ex: "tenho cliente", "cliente procura", "parceria"), seja parceira e diga que fazemos parceria e podemos agendar a visita no melhor horário para o cliente dele.
- Se falarem de pagamento à vista ou investidor, destaque que é uma excelente oportunidade de negócio e se coloque à disposição para visita imediata.
- Use sempre um tom humano, simpático e natural de WhatsApp (usando Bom dia / Boa tarde / Boa noite conforme o horário), sem parecer mensagem automática de robô.`;

const DEFAULT_MESSAGE_TEMPLATE = `{abertura_humana}

🏡 *{tipo} - {setor}* ({regiao})
🛋️ *Mobília:* {mobiliado}
🛏️ *Quartos:* {quartos} quartos
📐 *Tamanho:* {tamanho} m²
💰 *Valor:* {valor}

📝 *Descrição:*
{descricao}

{fechamento_humano}`;

// ============================================================================
// PARTE 2: CONFIGURAÇÕES DO DIA A DIA (SAUDAÇÕES, LIGAÇÕES E RESPOSTAS SIMPLES)
// ============================================================================
const DEFAULT_FIRST_CONTACT_MESSAGE = `{saudacao}, tudo bem? Como posso te ajudar?`;
const DEFAULT_MISSED_CALL_MESSAGE = `{saudacao}, já te retorno! Se puder enviar por mensagem, agradeço.`;
const DEFAULT_DAILY_SIMPLE_REPLIES = [];
const DEFAULT_OWNER_WHATSAPP_ALERT = '5562983443060';
const DEFAULT_GRUPOS_MONITORADOS = 'teste';

function loadSettings() {
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      return {
        // Configurações Gerais e da Secretária dos Grupos
        gruposMonitorados: data.gruposMonitorados !== undefined ? String(data.gruposMonitorados) : (process.env.GRUPOS_MONITORADOS || DEFAULT_GRUPOS_MONITORADOS),
        modoApenasAvisar: data.modoApenasAvisar !== undefined ? Boolean(data.modoApenasAvisar) : ((process.env.MODO_APENAS_AVISAR || 'false').toLowerCase() === 'true'),
        meuWhatsappAlerta: data.meuWhatsappAlerta || process.env.MEU_WHATSAPP_ALERTA || DEFAULT_OWNER_WHATSAPP_ALERT,
        googleSheetsUrl: data.googleSheetsUrl !== undefined ? String(data.googleSheetsUrl) : (process.env.GOOGLE_SHEETS_CSV_URL || ''),
        googleSheetsWebhookUrl: data.googleSheetsWebhookUrl !== undefined ? String(data.googleSheetsWebhookUrl) : (process.env.GOOGLE_SHEETS_WEBHOOK_URL || ''),
        messageTemplate: data.messageTemplate || DEFAULT_MESSAGE_TEMPLATE,
        maxPhotosPerMatch: Number(data.maxPhotosPerMatch || 5),
        humanTraining: data.humanTraining !== undefined ? data.humanTraining : DEFAULT_HUMAN_TRAINING,
        humanModeEnabled: data.humanModeEnabled !== undefined ? Boolean(data.humanModeEnabled) : true,

        // Configurações da Página de Saudações & Dia a Dia
        firstContactEnabled: data.firstContactEnabled !== undefined ? Boolean(data.firstContactEnabled) : true,
        firstContactMessage: data.firstContactMessage || DEFAULT_FIRST_CONTACT_MESSAGE,
        missedCallEnabled: data.missedCallEnabled !== undefined ? Boolean(data.missedCallEnabled) : true,
        missedCallMessage: data.missedCallMessage || DEFAULT_MISSED_CALL_MESSAGE,
        dailySimpleReplies: Array.isArray(data.dailySimpleReplies) ? data.dailySimpleReplies : DEFAULT_DAILY_SIMPLE_REPLIES
      };
    } catch (err) {
      console.error('Erro ao ler settings.json:', err.message);
    }
  }
  return {
    gruposMonitorados: process.env.GRUPOS_MONITORADOS || DEFAULT_GRUPOS_MONITORADOS,
    modoApenasAvisar: (process.env.MODO_APENAS_AVISAR || 'false').toLowerCase() === 'true',
    meuWhatsappAlerta: process.env.MEU_WHATSAPP_ALERTA || DEFAULT_OWNER_WHATSAPP_ALERT,
    googleSheetsUrl: process.env.GOOGLE_SHEETS_CSV_URL || '',
    googleSheetsWebhookUrl: process.env.GOOGLE_SHEETS_WEBHOOK_URL || '',
    messageTemplate: DEFAULT_MESSAGE_TEMPLATE,
    maxPhotosPerMatch: 5,
    humanTraining: DEFAULT_HUMAN_TRAINING,
    humanModeEnabled: true,
    firstContactEnabled: true,
    firstContactMessage: DEFAULT_FIRST_CONTACT_MESSAGE,
    missedCallEnabled: true,
    missedCallMessage: DEFAULT_MISSED_CALL_MESSAGE,
    dailySimpleReplies: DEFAULT_DAILY_SIMPLE_REPLIES
  };
}

function saveSettings(updates) {
  const current = loadSettings();
  const next = {
    ...current,
    ...updates
  };
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

module.exports = {
  SETTINGS_PATH,
  DEFAULT_MESSAGE_TEMPLATE,
  DEFAULT_HUMAN_TRAINING,
  DEFAULT_FIRST_CONTACT_MESSAGE,
  DEFAULT_MISSED_CALL_MESSAGE,
  DEFAULT_DAILY_SIMPLE_REPLIES,
  loadSettings,
  saveSettings
};
