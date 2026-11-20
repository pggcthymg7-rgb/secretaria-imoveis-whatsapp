/**
 * Helpers HTTP compartilhados pelas rotas de src/web/routes/.
 */
const {
  loadSettings,
  DEFAULT_MESSAGE_TEMPLATE,
  DEFAULT_HUMAN_TRAINING
} = require('../config/settings');

const ah = fn => (req, res) =>
  Promise.resolve(fn(req, res)).catch(err => {
    const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status >= 500) console.error('[api]', err?.message || err);
    res.status(status).json({ error: status < 500 && err?.message ? err.message : 'Erro interno' });
  });

const str = (v, max = 5000) => (typeof v === 'string' ? v.slice(0, max) : '');

const plainObj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

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

module.exports = { ah, str, plainObj, publicConfig };
