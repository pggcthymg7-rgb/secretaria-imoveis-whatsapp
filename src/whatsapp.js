const fs = require('fs');
const path = require('path');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const {
  default: makeWASocket,
  useMultiFileSingleState,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const { loadInventory } = require('./sheets');
const { analyzeMessageAndMatch, formatOutreachMessage } = require('./matcher');
const { loadSettings } = require('./settings');

const AUTH_DIR = path.join(__dirname, '..', 'auth_info_baileys');
const FOTOS_DIR = path.join(__dirname, '..', 'fotos');

let sock = null;
let connectionStatus = 'DESCONECTADO';
let latestQrCode = null;
let connectedGroups = [];
const activityLogs = [];

// Evita mandar a mesma proposta repetidamente para a mesma pessoa no mesmo dia
const sentOffersCache = new Set();

function addLog(type, message, details = null) {
  const entry = {
    time: new Date().toLocaleTimeString('pt-BR'),
    type,
    message,
    details
  };
  activityLogs.unshift(entry);
  if (activityLogs.length > 100) activityLogs.pop();
  console.log(`[${entry.time}] [${type}] ${message}`);
}

/**
 * Verifica se o grupo deve ser monitorado com base na variável GRUPOS_MONITORADOS do .env
 */
function shouldMonitorGroup(groupJid, groupSubject) {
  const filterStr = (process.env.GRUPOS_MONITORADOS || '').trim();
  if (!filterStr) return true; // Se estiver vazio, monitora todos os grupos em que o número está

  const filters = filterStr
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  if (filters.length === 0) return true;

  const subjectLower = (groupSubject || '').toLowerCase();
  const jidLower = (groupJid || '').toLowerCase();

  return filters.some(f => subjectLower.includes(f) || jidLower.includes(f));
}

/**
 * Envia a descrição e até 5 fotos (ou o limite configurado) do imóvel para o WhatsApp do cliente (no privado)
 */
async function sendPropertyOffer(recipientJid, senderName, originalMessage, property) {
  if (!sock) throw new Error('WhatsApp não está conectado no momento.');

  const settings = loadSettings();
  const maxPhotos = Number(settings.maxPhotosPerMatch || 5);
  const textMessage = formatOutreachMessage(senderName, originalMessage, property);

  // Envia até 5 fotos cadastradas (a primeira foto já vai com a descrição completa como legenda)
  const allFotos = Array.isArray(property.fotos) ? property.fotos : [];
  const fotos = allFotos.slice(0, maxPhotos);

  if (fotos.length > 0) {
    let sentTextWithFirstPhoto = false;

    for (let i = 0; i < fotos.length; i++) {
      const fotoRef = fotos[i];
      const caption = !sentTextWithFirstPhoto ? textMessage : `📸 Foto ${i + 1}/${fotos.length} - ${property.tipo} (${property.setor})`;

      try {
        let imagePayload = null;

        if (/^https?:\/\//i.test(fotoRef)) {
          imagePayload = { url: fotoRef };
        } else {
          const localPath = path.isAbsolute(fotoRef) ? fotoRef : path.join(FOTOS_DIR, fotoRef);
          if (fs.existsSync(localPath)) {
            imagePayload = fs.readFileSync(localPath);
          }
        }

        if (imagePayload) {
          await sock.sendMessage(recipientJid, {
            image: imagePayload,
            caption
          });
          sentTextWithFirstPhoto = true;
        }
      } catch (imgErr) {
        addLog('AVISO', `Não foi possível enviar a foto (${fotoRef}): ${imgErr.message}`);
      }
    }

    // Se nenhuma foto pôde ser carregada, garante o envio do texto completo
    if (!sentTextWithFirstPhoto) {
      await sock.sendMessage(recipientJid, { text: textMessage });
    }
  } else {
    // Sem fotos cadastradas: envia apenas a mensagem de texto completa
    await sock.sendMessage(recipientJid, { text: textMessage });
  }
}

/**
 * Inicializa a conexão com o WhatsApp via Baileys
 */
async function startWhatsAppAgent() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    syncFullHistory: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQrCode = qr;
      connectionStatus = 'AGUARDANDO_QR_CODE';
      console.log('\n======================================================');
      console.log('📱 ESCANEIE O QR CODE ABAIXO NO SEU WHATSAPP:');
      console.log('(Ou acesse http://localhost:3000 no navegador)');
      console.log('======================================================\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      latestQrCode = null;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      connectionStatus = 'DESCONECTADO';
      addLog('CONEXAO', `Conexão encerrada (código ${statusCode}). Reconectando: ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(() => startWhatsAppAgent(), 4000);
      } else {
        addLog('CONEXAO', 'Sessão desconectada pelo celular. Apague a pasta auth_info_baileys para gerar novo QR Code.');
      }
    } else if (connection === 'open') {
      latestQrCode = null;
      connectionStatus = 'CONECTADO';
      addLog('CONEXAO', '✅ Secretária Imobiliária conectada ao WhatsApp e monitorando grupos!');

      // Lista todos os grupos em que a conta participa para exibir no painel e facilitar a escolha
      try {
        const groupsObj = await sock.groupFetchAllParticipating();
        connectedGroups = Object.values(groupsObj).map(g => ({
          id: g.id,
          subject: g.subject,
          participantsCount: g.participants?.length || 0,
          monitored: shouldMonitorGroup(g.id, g.subject)
        }));
        addLog('GRUPOS', `Encontrados ${connectedGroups.length} grupos na conta.`);
      } catch (err) {
        console.error('Erro ao listar grupos:', err.message);
      }
    }
  });

  // Escuta todas as mensagens recebidas em tempo real
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        if (!msg.message || msg.key.fromMe) continue;

        const remoteJid = msg.key.remoteJid || '';
        const isGroup = remoteJid.endsWith('@g.us');
        if (!isGroup) continue; // Inspenciona apenas grupos de WhatsApp

        // Extrai o texto da mensagem (seja texto simples ou legenda de imagem/documento)
        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          msg.message.videoMessage?.caption ||
          '';

        if (!text || text.trim().length < 8) continue;

        // Descobre o nome do grupo
        let groupInfo = connectedGroups.find(g => g.id === remoteJid);
        if (!groupInfo) {
          try {
            const meta = await sock.groupMetadata(remoteJid);
            groupInfo = {
              id: remoteJid,
              subject: meta.subject,
              participantsCount: meta.participants?.length || 0,
              monitored: shouldMonitorGroup(remoteJid, meta.subject)
            };
            connectedGroups.push(groupInfo);
          } catch {
            groupInfo = { id: remoteJid, subject: remoteJid, monitored: shouldMonitorGroup(remoteJid, '') };
          }
        }

        if (!shouldMonitorGroup(remoteJid, groupInfo.subject)) {
          continue; // Ignora grupos que não estão no filtro GRUPOS_MONITORADOS
        }

        // Identifica quem enviou a mensagem dentro do grupo
        const participantJid = msg.key.participant || msg.participant;
        const senderName = msg.pushName || 'Cliente';

        addLog('MENSAGEM_GRUPO', `[${groupInfo.subject}] ${senderName}: "${text}"`);

        // Carrega carteira atualizada (do Google Sheets ou CSV local)
        const inventory = await loadInventory();
        if (inventory.length === 0) continue;

        // Analisa a mensagem com IA / Regras Inteligentes
        const analysis = await analyzeMessageAndMatch(text, senderName, inventory);

        if (analysis.isLookingForProperty) {
          addLog(
            'BUSCA_DETECTADA',
            `Intenção de compra detectada em [${groupInfo.subject}] por ${senderName}`,
            analysis.criteria
          );

          if (analysis.matches && analysis.matches.length > 0) {
            const modoApenasAvisar = (process.env.MODO_APENAS_AVISAR || 'false').toLowerCase() === 'true';

            for (const prop of analysis.matches) {
              const dedupeKey = `${participantJid}_${prop.id}`;
              if (sentOffersCache.has(dedupeKey)) {
                addLog('IGNORADO', `Imóvel #${prop.id} já foi enviado hoje para ${senderName}.`);
                continue;
              }
              sentOffersCache.add(dedupeKey);

              if (!modoApenasAvisar && participantJid) {
                // Pequeno delay humano de 3 segundos antes de chamar no privado
                await new Promise(r => setTimeout(r, 3000));
                await sendPropertyOffer(participantJid, senderName, text, prop, analysis.customGreeting);
                addLog(
                  'OPORTUNIDADE_ENVIADA',
                  `✅ Proposta do imóvel #${prop.id} (${prop.tipo} - ${prop.setor}) enviada no privado de ${senderName}!`
                );
              } else {
                addLog(
                  'MODO_AVISO',
                  `🔔 Match encontrado! Imóvel #${prop.id} (${prop.setor}) para ${senderName} (Modo Apenas Avisar ativo).`
                );
              }

              // Se o corretor cadastrou o próprio número em MEU_WHATSAPP_ALERTA, avisa-o na hora!
              const meuAlerta = (process.env.MEU_WHATSAPP_ALERTA || '').replace(/\D/g, '');
              if (meuAlerta.length >= 10) {
                const ownerJid = `${meuAlerta}@s.whatsapp.net`;
                const phoneClean = (participantJid || '').split('@')[0];
                const alertMsg =
                  `🚨 *OPORTUNIDADE DETECTADA NO GRUPO!*\n\n` +
                  `👥 *Grupo:* ${groupInfo.subject}\n` +
                  `👤 *Cliente/Parceiro:* ${senderName} (wa.me/${phoneClean})\n` +
                  `💬 *Mensagem no grupo:* "${text}"\n\n` +
                  `🏠 *Imóvel Compatível:* #${prop.id} - ${prop.tipo} no ${prop.setor} (${prop.quartos}q, ${prop.tamanho_m2}m², R$ ${prop.valor})\n` +
                  `🤖 *Status:* ${modoApenasAvisar ? 'Aguardando seu contato manual' : 'Proposta e fotos já enviadas no privado da pessoa!'}`;

                await sock.sendMessage(ownerJid, { text: alertMsg }).catch(() => {});
              }
            }
          } else {
            addLog(
              'SEM_MATCH',
              `A pessoa buscou um imóvel (${JSON.stringify(analysis.criteria)}), mas não há correspondente na carteira.`
            );
          }
        }
      } catch (err) {
        addLog('ERRO', `Erro ao processar mensagem: ${err.message}`);
      }
    }
  });
}

function getAgentState() {
  return {
    connectionStatus,
    latestQrCode,
    connectedGroups: connectedGroups.map(g => ({
      ...g,
      monitored: shouldMonitorGroup(g.id, g.subject)
    })),
    activityLogs
  };
}

module.exports = {
  startWhatsAppAgent,
  getAgentState,
  addLog
};
