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
const {
  markContactAsKnown,
  handleIncomingCalls,
  handlePrivateDailyMessage
} = require('./atendimento-diario');

const AUTH_DIR = path.join(__dirname, '..', 'auth_info_baileys');
const FOTOS_DIR = path.join(__dirname, '..', 'fotos');

let sock = null;
let connectionStatus = 'DESCONECTADO';
let latestQrCode = null;
let connectedGroups = [];
const activityLogs = [];

// Evita mandar a mesma proposta repetidamente para a mesma pessoa no mesmo dia
const sentOffersCache = new Set();
const sentDoubtAlertsCache = new Set();

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
 * Resolve o JID real do WhatsApp no Brasil (tratando automaticamente o 9º dígito do DDD, ex: 5562983443060 vs 556283443060)
 * e também reconhece quando o número de alerta é o próprio número conectado ao painel!
 */
async function resolveOwnerWhatsAppJids(rawPhone) {
  let digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits || digits.length < 10) return [];

  // Se digitou apenas DDD + número (10 ou 11 dígitos), adiciona o DDI 55 do Brasil
  if (digits.length === 10 || digits.length === 11) {
    digits = '55' + digits;
  }

  const candidates = new Set([digits]);
  // Tratamento automático do 9º dígito brasileiro (55 + 2 dígitos DDD + 9 + 8 dígitos = 13 dígitos)
  if (digits.startsWith('55') && digits.length === 13 && digits[4] === '9') {
    const without9 = digits.slice(0, 4) + digits.slice(5);
    candidates.add(without9);
  } else if (digits.startsWith('55') && digits.length === 12) {
    const with9 = digits.slice(0, 4) + '9' + digits.slice(4);
    candidates.add(with9);
  }

  const resolvedJids = new Set();

  // 1. Verifica se o número de alerta é o próprio WhatsApp conectado na sessão atual
  if (sock?.user?.id) {
    const selfBase = sock.user.id.split(':')[0].split('@')[0].replace(/\D/g, '');
    if (candidates.has(selfBase)) {
      resolvedJids.add(`${selfBase}@s.whatsapp.net`);
    }
  }

  // 2. Consulta o servidor do WhatsApp (onWhatsApp) para descobrir o JID exato registrado na conta (com ou sem 9º dígito)
  if (sock && typeof sock.onWhatsApp === 'function') {
    try {
      const results = await sock.onWhatsApp(...Array.from(candidates));
      if (Array.isArray(results)) {
        for (const r of results) {
          if (r && r.exists && r.jid) {
            resolvedJids.add(r.jid.replace(/:\d+@/, '@'));
          }
        }
      }
    } catch (err) {
      console.error('Aviso ao consultar onWhatsApp para alerta:', err.message);
    }
  }

  // 3. Fallback: se por algum motivo onWhatsApp não retornou, adiciona as duas variações (sem 9º dígito e com 9º dígito)
  if (resolvedJids.size === 0) {
    for (const c of candidates) {
      resolvedJids.add(`${c}@s.whatsapp.net`);
    }
  }

  return Array.from(resolvedJids);
}

/**
 * Envia um alerta (de Oportunidade ou de Dúvida) diretamente para o WhatsApp do corretor (MEU_WHATSAPP_ALERTA)
 */
async function sendOwnerWhatsAppAlert(alertMsg) {
  if (!sock || connectionStatus !== 'CONECTADO') {
    addLog('AVISO_ALERTA', 'Não foi possível enviar alerta para o seu WhatsApp pois o WhatsApp ainda não está conectado.');
    return { ok: false, error: 'WhatsApp desconectado' };
  }

  const settings = loadSettings();
  const meuAlerta = (process.env.MEU_WHATSAPP_ALERTA || settings.meuWhatsappAlerta || '5562983443060').replace(/\D/g, '');
  if (meuAlerta.length < 10) {
    addLog('AVISO_ALERTA', 'Número MEU_WHATSAPP_ALERTA não configurado.');
    return { ok: false, error: 'Número de alerta inválido' };
  }

  const targetJids = await resolveOwnerWhatsAppJids(meuAlerta);
  let sentSuccess = false;
  let lastError = null;

  for (const ownerJid of targetJids) {
    try {
      markContactAsKnown(ownerJid);
      await sock.sendMessage(ownerJid, { text: alertMsg });
      sentSuccess = true;
      addLog('ALERTA_ENVIADO', `📲 Alerta enviado com sucesso para o seu WhatsApp (${ownerJid.split('@')[0]})!`);
      break;
    } catch (err) {
      lastError = err.message;
      addLog('ERRO_ALERTA', `Falha ao tentar enviar alerta para ${ownerJid}: ${err.message}`);
    }
  }

  return { ok: sentSuccess, targetJids, error: lastError };
}

/**
 * Verifica se o grupo deve ser monitorado com base em settings.json ou GRUPOS_MONITORADOS do .env
 */
function shouldMonitorGroup(groupJid, groupSubject) {
  const settings = loadSettings();
  const filterStr = (settings.gruposMonitorados !== undefined ? settings.gruposMonitorados : (process.env.GRUPOS_MONITORADOS || '')).trim();
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
async function sendPropertyOffer(recipientJid, senderName, originalMessage, property, analysisContext = null) {
  if (!sock) throw new Error('WhatsApp não está conectado no momento.');

  const settings = loadSettings();
  const maxPhotos = Number(settings.maxPhotosPerMatch || 5);
  const textMessage = formatOutreachMessage(senderName, originalMessage, property, analysisContext);

  // Registra como contato conhecido para que a recepção de 1ª mensagem não mande texto duplicado
  markContactAsKnown(recipientJid);

  // Simula pessoa real "digitando..." no topo do WhatsApp do cliente antes de enviar
  try {
    await sock.sendPresenceUpdate('composing', recipientJid);
    await new Promise(r => setTimeout(r, 2500));
  } catch {}

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

  // ===========================================================================
  // MÓDULO 2 (SEPARADO): ATENDIMENTO DO DIA A DIA (src/atendimento-diario.js)
  // Cuida de: Contatos Conhecidos, Ligações Não Atendidas e 1ª Mensagem no Privado
  // ===========================================================================
  sock.ev.on('messaging-history.set', ({ chats }) => {
    if (Array.isArray(chats)) {
      for (const c of chats) {
        if (c.id && !c.id.endsWith('@g.us') && c.id !== 'status@broadcast') {
          markContactAsKnown(c.id);
        }
      }
    }
  });

  sock.ev.on('chats.upsert', (chats) => {
    if (Array.isArray(chats)) {
      for (const c of chats) {
        if (c.id && !c.id.endsWith('@g.us') && c.id !== 'status@broadcast' && (c.conversationTimestamp || c.unreadCount === 0)) {
          markContactAsKnown(c.id);
        }
      }
    }
  });

  sock.ev.on('call', async (calls) => {
    await handleIncomingCalls(sock, calls, addLog);
  });

  // ===========================================================================
  // ESCUTA DE MENSAGENS EM TEMPO REAL
  // - Se for mensagem PRIVADA (!isGroup) -> Envia para src/atendimento-diario.js
  // - Se for mensagem de GRUPO (isGroup) -> Segue para a Secretária dos Grupos abaixo
  // ===========================================================================
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        if (!msg.message) continue;

        const remoteJid = msg.key.remoteJid || '';
        if (!remoteJid || remoteJid === 'status@broadcast' || remoteJid.endsWith('@newsletter')) continue;

        const isGroup = remoteJid.endsWith('@g.us');

        if (!isGroup) {
          await handlePrivateDailyMessage(sock, msg, addLog);
          continue; // Encerra aqui; o código abaixo é exclusivo da Secretária dos Grupos!
        }

        if (msg.key.fromMe) continue;

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

          const phoneClean = (participantJid || '').split('@')[0];

          // 1. Se a secretária ficou com DÚVIDA (sobre a busca ou sobre um dado não informado em imóvel quase compatível):
          // NÃO envia nada para a pessoa no grupo e envia um ALERTA DE DÚVIDA direto no seu WhatsApp!
          if (analysis.hasDoubt && (!analysis.matches || analysis.matches.length === 0)) {
            const doubtKey = `${participantJid}_${text.trim().slice(0, 60)}`;
            if (!sentDoubtAlertsCache.has(doubtKey)) {
              sentDoubtAlertsCache.add(doubtKey);
              const reasonsList = (analysis.doubtReasons || ['Dúvida na interpretação de 1 ou mais critérios da busca.'])
                .map(r => `• ${r}`)
                .join('\n');

              addLog(
                'DUVIDA_BLOQUEADA',
                `⚠️ Dúvida detectada na busca de ${senderName} em [${groupInfo.subject}]. Nada foi enviado ao cliente; alerta enviado ao seu WhatsApp!`,
                analysis.doubtReasons
              );

              const doubtAlertMsg =
                `⚠️ *DÚVIDA DA SECRETÁRIA (NADA FOI ENVIADO AO CLIENTE)*\n\n` +
                `👥 *Grupo:* ${groupInfo.subject}\n` +
                `👤 *Quem buscou:* ${senderName} (wa.me/${phoneClean})\n` +
                `💬 *Mensagem original:* "${text}"\n\n` +
                `❓ *Motivo da Dúvida (por que não enviei):*\n${reasonsList}\n\n` +
                `🛠️ *Ação sugerida:* Confira se você tem imóvel para esse perfil ou ajuste a descrição/regras no painel da Secretária.`;

              await sendOwnerWhatsAppAlert(doubtAlertMsg);
            }
            continue;
          }

          // 2. Se houve Match 100% verificado por exclusão (todos os critérios atendidos sem nenhuma dúvida):
          if (analysis.matches && analysis.matches.length > 0) {
            const currentSettings = loadSettings();
            const modoApenasAvisar = Boolean(currentSettings.modoApenasAvisar);

            for (const prop of analysis.matches) {
              const dedupeKey = `${participantJid}_${prop.id}`;
              if (sentOffersCache.has(dedupeKey)) {
                addLog('IGNORADO', `Imóvel #${prop.id} já foi enviado hoje para ${senderName}.`);
                continue;
              }
              sentOffersCache.add(dedupeKey);

              if (!modoApenasAvisar && participantJid) {
                // Pequeno delay humano antes de chamar no privado
                await new Promise(r => setTimeout(r, 2000));
                await sendPropertyOffer(participantJid, senderName, text, prop, analysis);
                try {
                  await sock.sendPresenceUpdate('paused', participantJid);
                } catch {}
                addLog(
                  'OPORTUNIDADE_ENVIADA',
                  `✅ Proposta do imóvel #${prop.id} (${prop.tipo} - ${prop.setor}) enviada no privado de ${senderName} [${analysis.detectedTone || 'Tom Humano'}]!`
                );
              } else {
                addLog(
                  'MODO_AVISO',
                  `🔔 Match encontrado! Imóvel #${prop.id} (${prop.setor}) para ${senderName} (Modo Apenas Avisar ativo).`
                );
              }

              // Envia o alerta de oportunidade para o WhatsApp do corretor (resolvendo 9º dígito brasileiro automaticamente!)
              const alertMsg =
                `🚨 *OPORTUNIDADE 100% COMPATÍVEL NO GRUPO!*\n\n` +
                `👥 *Grupo:* ${groupInfo.subject}\n` +
                `👤 *Cliente/Parceiro:* ${senderName} (wa.me/${phoneClean})\n` +
                `💬 *Mensagem no grupo:* "${text}"\n\n` +
                `🏠 *Imóvel Compatível:* #${prop.id} - ${prop.tipo} no ${prop.setor} (${prop.quartos}q, ${prop.tamanho_m2}m², R$ ${Number(prop.valor).toLocaleString('pt-BR')})\n` +
                `🤖 *Status:* ${modoApenasAvisar ? 'Aguardando seu contato manual' : 'Proposta e fotos já enviadas no privado da pessoa!'}`;

              await sendOwnerWhatsAppAlert(alertMsg);
            }
          } else {
            addLog(
              'SEM_MATCH',
              `A pessoa buscou um imóvel (${JSON.stringify(analysis.criteria)}), mas nenhum imóvel da carteira atende 100% aos critérios pedidos.`
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
  addLog,
  sendOwnerWhatsAppAlert
};
