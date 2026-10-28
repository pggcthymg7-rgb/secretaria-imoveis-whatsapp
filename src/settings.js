const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '..', 'settings.json');

const DEFAULT_MESSAGE_TEMPLATE = `Olá {nome}, tudo bem? Vi sua mensagem agora no grupo procurando imóvel e tenho uma excelente opção disponível na nossa carteira que se encaixa no que você busca!

🏡 *{tipo} - {setor}* ({regiao})
🛋️ *Mobília:* {mobiliado}
🛏️ *Quartos:* {quartos} quartos
📐 *Tamanho:* {tamanho} m²
💰 *Valor:* {valor}

📝 *Descrição:*
{descricao}

Segue(m) a(s) foto(s) do imóvel! Se quiser agendar uma visita ou mais detalhes, estou à disposição por aqui.`;

function loadSettings() {
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      return {
        messageTemplate: data.messageTemplate || DEFAULT_MESSAGE_TEMPLATE,
        maxPhotosPerMatch: Number(data.maxPhotosPerMatch || 5)
      };
    } catch (err) {
      console.error('Erro ao ler settings.json:', err.message);
    }
  }
  return {
    messageTemplate: DEFAULT_MESSAGE_TEMPLATE,
    maxPhotosPerMatch: 5
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
  loadSettings,
  saveSettings
};
