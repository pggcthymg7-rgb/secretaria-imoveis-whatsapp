/**
 * Configurações da secretária (settings.json dentro de DATA_DIR).
 * Todas as chaves têm padrão; o arquivo salvo só sobrescreve o que mudou.
 */
const fs = require('fs');
const { SETTINGS_PATH } = require('./paths');

// ============================================================================
// PARTE 1: SECRETÁRIA DOS GRUPOS
// ============================================================================
const DEFAULT_HUMAN_TRAINING = `- Se a pessoa falar "urgente" ou "pra hoje", diga: "Consigo te mostrar ainda hoje, é só me falar o horário!"
- Se o corretor falar "parceria" ou "meu cliente", diga: "Trabalhamos em parceria, fico à disposição para a visita com o seu cliente."
- Se falarem "à vista" ou "investidor", diga: "É uma ótima oportunidade de negócio, posso te passar os detalhes da negociação."`;

const LEGACY_HUMAN_TRAINING_START = '- Se a pessoa pedir com urgência (ex: "urgente"';

const LEGACY_MESSAGE_TEMPLATE = `{abertura_humana}

🏡 *{tipo} - {setor}* ({regiao})
🛋️ *Mobília:* {mobiliado}
🛏️ *Quartos:* {quartos} quartos
📐 *Tamanho:* {tamanho} m²
💰 *Valor:* {valor}

📝 *Descrição:*
{descricao}

{fechamento_humano}`;

const DEFAULT_MESSAGE_TEMPLATE = `{abertura_humana}

{resumo}
🛋️ {mobiliado}
💰 *{valor}*

📝 {descricao}

{fechamento_humano}`;

// ============================================================================
// PARTE 2: DIA A DIA (1ª mensagem, ligações, respostas rápidas)
// ============================================================================
const DEFAULT_FIRST_CONTACT_MESSAGE = `{saudacao}, tudo bem? Como posso te ajudar?`;
const DEFAULT_MISSED_CALL_MESSAGE = `{saudacao}, já te retorno! Se puder enviar por mensagem, agradeço.`;
const DEFAULT_DAILY_SIMPLE_REPLIES = [];

const DEFAULTS = {
  // Grupos
  gruposMonitorados: process.env.GRUPOS_MONITORADOS || '',
  modoApenasAvisar: (process.env.MODO_APENAS_AVISAR || 'false').toLowerCase() === 'true',
  meuWhatsappAlerta: process.env.MEU_WHATSAPP_ALERTA || '',
  googleSheetsUrl: process.env.GOOGLE_SHEETS_CSV_URL || '',
  googleSheetsWebhookUrl: process.env.GOOGLE_SHEETS_WEBHOOK_URL || '',
  messageTemplate: DEFAULT_MESSAGE_TEMPLATE,
  maxPhotosPerMatch: 5,
  humanTraining: DEFAULT_HUMAN_TRAINING,
  humanModeEnabled: true,
  minCriteriosParaEnvio: 2,
  maxOfertasPorPedido: 3,
  alertarQuase: true,
  usarIaGemini: true,
  enviarPdfQuandoPedir: true,
  extraPlaces: [],

  // Dia a dia
  firstContactEnabled: true,
  firstContactMessage: DEFAULT_FIRST_CONTACT_MESSAGE,
  firstContactIgnorarAgenda: true, // contato salvo na sua agenda nunca recebe a 1ª mensagem automática
  firstContactAquecimentoMin: 20, // após conectar, espera o WhatsApp sincronizar as conversas antes de responder
  missedCallEnabled: true,
  missedCallMessage: DEFAULT_MISSED_CALL_MESSAGE,
  dailySimpleReplies: DEFAULT_DAILY_SIMPLE_REPLIES,

  // Assistente pessoal (chat "Mensagem para mim")
  assistenteAtivo: true,
  assistenteNumerosExtras: '',

  // Resumo diário no seu WhatsApp
  resumoDiarioAtivo: true,
  resumoDiarioHorario: '19:00',

  // Backup semanal (domingo) enviado para o seu WhatsApp
  backupSemanalAtivo: true,

  // Busca inteligente (painel › Busca e "Mensagem para mim")
  buscaLimiteDia: 20, // buscas nos portais por dia (protege de cobrança do Gemini)
  buscaOlx: true,
  buscaZap: true,
  buscaVivareal: true,
  buscaMemoriaAtiva: true, // guardar os anúncios dos grupos

  // Pausa geral (para tudo que é automático)
  pausado: false
};

function loadSettings() {
  let data = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      data = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) || {};
    } catch (err) {
      console.error('Erro ao ler settings.json:', err.message);
    }
  }
  const merged = { ...DEFAULTS, ...data };
  // Migração: o modelo antigo padrão vira o novo modelo (mais limpo)
  if (!merged.messageTemplate || merged.messageTemplate.trim() === LEGACY_MESSAGE_TEMPLATE.trim()) {
    merged.messageTemplate = DEFAULT_MESSAGE_TEMPLATE;
  }
  if (typeof merged.humanTraining === 'string' && merged.humanTraining.startsWith(LEGACY_HUMAN_TRAINING_START)) {
    merged.humanTraining = DEFAULT_HUMAN_TRAINING;
  }
  if (!Array.isArray(merged.dailySimpleReplies)) merged.dailySimpleReplies = [];
  if (!Array.isArray(merged.extraPlaces)) merged.extraPlaces = [];
  merged.maxPhotosPerMatch = Math.min(10, Math.max(0, Number(merged.maxPhotosPerMatch) || 5));
  merged.modoApenasAvisar = Boolean(merged.modoApenasAvisar);
  return merged;
}

function saveSettings(updates) {
  let current = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      current = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) || {};
    } catch {}
  }
  const next = { ...current, ...updates };
  const tmp = `${SETTINGS_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf-8');
  fs.renameSync(tmp, SETTINGS_PATH);
  return loadSettings();
}

module.exports = {
  SETTINGS_PATH,
  DEFAULTS,
  DEFAULT_MESSAGE_TEMPLATE,
  DEFAULT_HUMAN_TRAINING,
  DEFAULT_FIRST_CONTACT_MESSAGE,
  DEFAULT_MISSED_CALL_MESSAGE,
  DEFAULT_DAILY_SIMPLE_REPLIES,
  loadSettings,
  saveSettings
};
