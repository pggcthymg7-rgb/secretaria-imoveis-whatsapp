/**
 * Script de Proteção de Estado Real (Sincroniza Carteira de Imóveis, Fotos e Configurações do Render antes de qualquer atualização)
 * - Garante que NENHUM imóvel de teste antigo (Unsplash) volte a aparecer.
 * - Preserva 100% dos imóveis reais, fotos e configurações de mensagens que estão ativos no servidor 24h!
 */
const fs = require('fs');
const path = require('path');
const { saveAllPropertiesToSpreadsheet } = require('./src/sheets');
const { saveSettings } = require('./src/settings');

const CLOUD_URL = 'https://secretaria-imoveis-whatsapp.onrender.com';
const FOTOS_DIR = path.join(__dirname, 'fotos');

function isLegacyFakeTestProperty(prop) {
  const fotosStr = Array.isArray(prop.fotos) ? prop.fotos.join(';') : String(prop.fotos || '');
  if (fotosStr.includes('images.unsplash.com')) return true;
  return false;
}

async function syncFromCloud() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(`${CLOUD_URL}/api/status`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      console.log('ℹ️ Servidor nuvem indisponível no momento; mantendo arquivos locais atuais.');
      return;
    }

    const data = await res.json();

    // 1. Preserva todos os imóveis reais cadastrados no servidor (ignorando imóveis de teste antigos da Unsplash)
    if (Array.isArray(data.inventory)) {
      const realProperties = data.inventory.filter(p => !isLegacyFakeTestProperty(p));
      await saveAllPropertiesToSpreadsheet(realProperties);
      console.log(`✅ Carteira sincronizada da nuvem: ${realProperties.length} imóvel(is) real(is) preservado(s).`);

      // Baixa eventuais fotos novas que tenham sido enviadas direto pelo painel da nuvem
      if (!fs.existsSync(FOTOS_DIR)) fs.mkdirSync(FOTOS_DIR, { recursive: true });
      for (const prop of realProperties) {
        for (const foto of (prop.fotos || [])) {
          if (foto && !/^https?:\/\//i.test(foto)) {
            const localPhotoPath = path.join(FOTOS_DIR, foto);
            if (!fs.existsSync(localPhotoPath)) {
              try {
                const imgRes = await fetch(`${CLOUD_URL}/fotos/${encodeURIComponent(foto)}`);
                if (imgRes.ok) {
                  const buf = Buffer.from(await imgRes.arrayBuffer());
                  fs.writeFileSync(localPhotoPath, buf);
                  console.log(`📸 Foto sincronizada da nuvem: ${foto}`);
                }
              } catch {}
            }
          }
        }
      }
    }

    // 2. Preserva todas as configurações de mensagens, grupos monitorados e alertas salvas no servidor
    if (data.config) {
      const c = data.config;
      saveSettings({
        ...(c.gruposMonitorados ? { gruposMonitorados: c.gruposMonitorados } : {}),
        ...(c.modoApenasAvisar !== undefined ? { modoApenasAvisar: Boolean(c.modoApenasAvisar) } : {}),
        ...(c.meuWhatsappAlerta ? { meuWhatsappAlerta: c.meuWhatsappAlerta } : {}),
        ...(c.googleSheetsUrl ? { googleSheetsUrl: c.googleSheetsUrl } : {}),
        ...(c.googleSheetsWebhookUrl ? { googleSheetsWebhookUrl: c.googleSheetsWebhookUrl } : {}),
        ...(c.messageTemplate ? { messageTemplate: c.messageTemplate } : {}),
        ...(c.maxPhotosPerMatch ? { maxPhotosPerMatch: Number(c.maxPhotosPerMatch) } : {}),
        ...(c.humanTraining ? { humanTraining: c.humanTraining } : {}),
        ...(c.humanModeEnabled !== undefined ? { humanModeEnabled: Boolean(c.humanModeEnabled) } : {}),
        ...(c.firstContactEnabled !== undefined ? { firstContactEnabled: Boolean(c.firstContactEnabled) } : {}),
        ...(c.firstContactMessage ? { firstContactMessage: c.firstContactMessage } : {}),
        ...(c.missedCallEnabled !== undefined ? { missedCallEnabled: Boolean(c.missedCallEnabled) } : {}),
        ...(c.missedCallMessage ? { missedCallMessage: c.missedCallMessage } : {}),
        ...(Array.isArray(c.dailySimpleReplies) ? { dailySimpleReplies: c.dailySimpleReplies } : {})
      });
      console.log('✅ Configurações de mensagens, grupos e alertas sincronizadas e preservadas!');
    }
  } catch (err) {
    console.log('ℹ️ Mantendo estado local atual:', err.message);
  }
}

syncFromCloud();
