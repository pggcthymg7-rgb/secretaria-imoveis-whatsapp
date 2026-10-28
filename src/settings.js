const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '..', 'settings.json');

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

function loadSettings() {
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      return {
        messageTemplate: data.messageTemplate || DEFAULT_MESSAGE_TEMPLATE,
        maxPhotosPerMatch: Number(data.maxPhotosPerMatch || 5),
        humanTraining: data.humanTraining !== undefined ? data.humanTraining : DEFAULT_HUMAN_TRAINING,
        humanModeEnabled: data.humanModeEnabled !== undefined ? Boolean(data.humanModeEnabled) : true
      };
    } catch (err) {
      console.error('Erro ao ler settings.json:', err.message);
    }
  }
  return {
    messageTemplate: DEFAULT_MESSAGE_TEMPLATE,
    maxPhotosPerMatch: 5,
    humanTraining: DEFAULT_HUMAN_TRAINING,
    humanModeEnabled: true
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
  DEFAULT_MESSAGE_TEMPLATE,
  DEFAULT_HUMAN_TRAINING,
  loadSettings,
  saveSettings
};
