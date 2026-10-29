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
const KNOWN_CONTACTS_PATH = path.join(__dirname, '..', 'known_contacts.json');

let sock = null;
let connectionStatus = 'DESCONECTADO';
let latestQrCode = null;
let connectedGroups = [];
const activityLogs = [];

// Evita mandar a mesma proposta repetidamente para a mesma pessoa no mesmo dia
const sentOffersCache = new Set();

// Memória permanente de pessoas que já conversaram com você (para responder APENAS a 1ª mensagem de novos contatos)
const knownContacts = new Set();
try {
  if (fs.existsSync(KNOWN_CONTACTS_PATH)) {
    const saved = JSON.parse(fs.readFileSync(KNOWN_CONTACTS_PATH, 'utf-8'));
    if (Array.isArray(saved)) {
      saved.forEach(jid => knownContacts.add(jid));
    }
  }
} catch (err) {
  console.error('Erro ao carregar known_contacts.json:', err.message);
}

function normalizeContactKey(jid) {
  if (!jid) return '';
  return String(jid).split(':')[0].split('@')[0].replace(/\D/g, '') || String(jid).trim().toLowerCase();
}

function isContactKnown(jid) {
  const key = normalizeContactKey(jid);
  return key ? knownContacts.has(key) : true;
}

function markContactAsKnown(jid) {
  const key = normalizeContactKey(jid);
  if (!key || knownContacts.has(key)) return;
  knownContacts.add(key);
  try {
    fs.writeFileSync(KNOWN_CONTACTS_PATH, JSON.stringify([...knownContacts], null, 2), 'utf-8');
  } catch (err) {
    console.error('Erro ao salvar known_contacts.json:', err.message);
  }
}

function getPeriodGreeting() {
  try {
    const hourStr = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric',
      hour12: false
    }).format(new Date());
    const hour = parseInt(hourStr, 10);
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  } catch {
    return 'Olá';
  }
}

// Controle de chamadas em andamento para detectar ligações não atendidas com precisão
const activeCalls = new Map();
const repliedMissedCalls = new Set();

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

  // Registra conversas que já existiam no seu WhatsApp para responder APENAS contatos inéditos
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
        // Se já havia mensagens anteriores nessa conversa antes de hoje, marca como conhecido
        if (c.id && !c.id.endsWith('@g.us') && c.id !== 'status@broadcast' && (c.conversationTimestamp || c.unreadCount === 0)) {
          markContactAsKnown(c.id);
        }
      }
    }
  });

  // Detector de Ligações Não Atendidas no WhatsApp (Voz ou Vídeo)
  sock.ev.on('call', async (calls) => {
    if (!Array.isArray(calls)) return;

    for (const call of calls) {
      try {
        const callId = call.id;
        const callerJid = call.from || call.chatId;
        if (!callId || !callerJid || callerJid.endsWith('@g.us') || call.isGroup) continue;

        if (call.status === 'offer') {
          // Ligação começou a tocar
          activeCalls.set(callId, {
            from: callerJid,
            answered: false,
            replied: false
          });
        } else if (call.status === 'accept') {
          // Você atendeu a ligação no celular/computador -> não manda mensagem de ligação perdida
          const info = activeCalls.get(callId) || { from: callerJid };
          info.answered = true;
          activeCalls.set(callId, info);
        } else if (
          call.status === 'timeout' ||
          call.status === 'reject' ||
          call.status === 'terminate'
        ) {
          const info = activeCalls.get(callId);
          const wasAnswered = info ? info.answered : false;

          // Se foi timeout (tocou até cair), reject, ou terminate sem ter sido atendida:
          if (!wasAnswered && !repliedMissedCalls.has(callId)) {
            repliedMissedCalls.add(callId);
            if (info) info.replied = true;

            const settings = loadSettings();
            if (settings.missedCallEnabled !== false) {
              const saudacao = getPeriodGreeting();
              const template =
                settings.missedCallMessage ||
                '{saudacao}, já te retorno! Se puder enviar por mensagem, agradeço.';
              const replyText = template.replace(/\{saudacao\}/gi, saudacao);

              // Registra nos conhecidos para não disparar a recepção de 1ª mensagem logo em seguida
              markContactAsKnown(callerJid);

              await new Promise(r => setTimeout(r, 2000));
              try {
                await sock.sendPresenceUpdate('composing', callerJid);
                await new Promise(r => setTimeout(r, 2000));
              } catch {}

              await sock.sendMessage(callerJid, { text: replyText });

              try {
                await sock.sendPresenceUpdate('paused', callerJid);
                // Mantém a conversa marcada como Não Lida / Nova Conversa no seu WhatsApp
                await sock.chatModify({ markRead: false }, callerJid);
              } catch {}

              const phoneClean = normalizeContactKey(callerJid);
              addLog(
                'LIGACAO_PERDIDA',
                `📞 Ligação não atendida de ${phoneClean} -> Respondido automaticamente: "${replyText}"`
              );
            }
          }
        }
      } catch (callErr) {
        addLog('ERRO', `Erro ao tratar ligação: ${callErr.message}`);
      }
    }
  });

  // Escuta todas as mensagens recebidas em tempo real
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        if (!msg.message) continue;

        const remoteJid = msg.key.remoteJid || '';
        if (!remoteJid || remoteJid === 'status@broadcast' || remoteJid.endsWith('@newsletter')) continue;

        const isGroup = remoteJid.endsWith('@g.us');

        // Se VOCÊ enviou uma mensagem no privado para alguém, já registra que essa conversa existe
        // para a secretária nunca se intrometer quando a pessoa te responder
        if (msg.key.fromMe) {
          if (!isGroup) {
            markContactAsKnown(remoteJid);
          }
          continue;
        }

        // =========================================================================
        // FUNÇÃO NOVA: RESPONDER APENAS A 1ª MENSAGEM NO PRIVADO ("SEMPRE ONLINE")
        // =========================================================================
        if (!isGroup) {
          // Verifica se essa pessoa NUNCA mandou mensagem antes
          if (!isContactKnown(remoteJid)) {
            // Já grava imediatamente como contato conhecido para enviar APENAS a 1ª mensagem!
            markContactAsKnown(remoteJid);

            const settings = loadSettings();
            if (settings.firstContactEnabled !== false) {
              const senderName = msg.pushName || 'Cliente';
              const firstName = senderName.split(' ')[0];
              const saudacao = getPeriodGreeting();
              const template =
                settings.firstContactMessage || '{saudacao}, tudo bem? Como posso te ajudar?';
              const replyText = template
                .replace(/\{saudacao\}/gi, saudacao)
                .replace(/\{nome\}/gi, firstName);

              // Simula "digitando..." para parecer 100% que você está online na hora
              await new Promise(r => setTimeout(r, 1500));
              try {
                await sock.sendPresenceUpdate('composing', remoteJid);
                await new Promise(r => setTimeout(r, 2000));
              } catch {}

              await sock.sendMessage(remoteJid, { text: replyText });

              try {
                await sock.sendPresenceUpdate('paused', remoteJid);
                // Marca a conversa como NÃO LIDA ("Nova Conversa") no seu celular para você ver!
                await sock.chatModify({ markRead: false }, remoteJid);
              } catch {}

              const phoneClean = normalizeContactKey(remoteJid);
              addLog(
                'NOVA_CONVERSA',
                `🟢 [Nova Conversa] 1ª mensagem de ${senderName} (${phoneClean}) respondida: "${replyText}"`
              );
            }
          }
          continue; // Segue o fluxo normal (o buscador de imóveis abaixo continua exclusivo para grupos)
        }

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
