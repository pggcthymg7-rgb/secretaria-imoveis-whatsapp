/**
 * ============================================================================
 * ARQUIVO: src/atendimento-diario.js
 * ============================================================================
 * OBJETIVO DESTE ARQUIVO (SEPARADO DA SECRETÁRIA DOS GRUPOS):
 * Este arquivo cuida EXCLUSIVAMENTE do atendimento individual no seu WhatsApp
 * pessoal (mensagens no privado e ligações), sem misturar com a busca de imóveis
 * nos grupos.
 *
 * O QUE ELE FAZ:
 * 1) SAUDAÇÃO DE 1ª MENSAGEM ("SEMPRE ONLINE" / NOVA CONVERSA):
 *    Responde apenas a 1ª mensagem de pessoas que nunca falaram com você,
 *    usando a saudação do período do dia (Bom dia / Boa tarde / Boa noite)
 *    e mantém a conversa marcada como "Não Lida" (Nova Conversa) no seu celular.
 *
 * 2) RESPOSTA PARA LIGAÇÃO NÃO ATENDIDA:
 *    Quando alguém te liga no WhatsApp e você não atende, envia uma mensagem
 *    automática com a saudação do período do dia dizendo "já te retorno".
 *
 * 3) RESPOSTAS SIMPLES DO DIA A DIA (OPCIONAL):
 *    Permite configurar respostas curtas para perguntas comuns no privado.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { loadSettings } = require('./settings');

const KNOWN_CONTACTS_PATH = path.join(__dirname, '..', 'known_contacts.json');

// Memória de contatos que já falaram com você (para responder APENAS a 1ª mensagem)
const knownContacts = new Set();

// Carrega os contatos já conhecidos salvos no disco ao iniciar
try {
  if (fs.existsSync(KNOWN_CONTACTS_PATH)) {
    const saved = JSON.parse(fs.readFileSync(KNOWN_CONTACTS_PATH, 'utf-8'));
    if (Array.isArray(saved)) {
      saved.forEach(jid => knownContacts.add(jid));
    }
  }
} catch (err) {
  console.error('[DIA-A-DIA] Erro ao carregar known_contacts.json:', err.message);
}

// Histórico exclusivo da página "Saudações & Dia a Dia"
const dailyActivityLogs = [];

function addDailyLog(type, message) {
  const entry = {
    time: new Date().toLocaleTimeString('pt-BR'),
    type,
    message
  };
  dailyActivityLogs.unshift(entry);
  if (dailyActivityLogs.length > 100) dailyActivityLogs.pop();
  console.log(`[DIA-A-DIA] [${entry.time}] [${type}] ${message}`);
}

/**
 * Limpa o identificador do número de WhatsApp para guardar apenas os dígitos
 */
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
    console.error('[DIA-A-DIA] Erro ao salvar known_contacts.json:', err.message);
  }
}

/**
 * Remove um número específico da lista de conhecidos (útil para você testar no seu painel)
 */
function removeKnownContact(phoneOrJid) {
  const key = normalizeContactKey(phoneOrJid);
  if (!key) return false;
  const existed = knownContacts.delete(key);
  try {
    fs.writeFileSync(KNOWN_CONTACTS_PATH, JSON.stringify([...knownContacts], null, 2), 'utf-8');
  } catch {}
  return existed;
}

/**
 * Descobre o período do dia no fuso horário de Brasília (Bom dia / Boa tarde / Boa noite)
 */
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

// Controle das ligações para saber se você atendeu ou se caiu como ligação perdida
const activeCalls = new Map();
const repliedMissedCalls = new Set();

/**
 * ============================================================================
 * BLOCO 1: TRATAMENTO DE LIGAÇÕES NÃO ATENDIDAS NO WHATSAPP
 * Se precisar alterar o tempo ou comportamento das ligações, edite abaixo:
 * ============================================================================
 */
async function handleIncomingCalls(sock, calls, addMainLog) {
  if (!Array.isArray(calls)) return;

  for (const call of calls) {
    try {
      const callId = call.id;
      const callerJid = call.from || call.chatId;
      if (!callId || !callerJid || callerJid.endsWith('@g.us') || call.isGroup) continue;

      if (call.status === 'offer') {
        // O telefone começou a tocar
        activeCalls.set(callId, {
          from: callerJid,
          answered: false,
          replied: false
        });
      } else if (call.status === 'accept') {
        // Você atendeu a ligação -> Marca como atendida para não enviar mensagem
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

        // Se a ligação parou de tocar e NÃO foi atendida:
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

            // Marca como conhecido para não mandar a saudação de 1ª mensagem duplicada
            markContactAsKnown(callerJid);

            await new Promise(r => setTimeout(r, 2000));
            try {
              await sock.sendPresenceUpdate('composing', callerJid);
              await new Promise(r => setTimeout(r, 2000));
            } catch {}

            await sock.sendMessage(callerJid, { text: replyText });

            try {
              await sock.sendPresenceUpdate('paused', callerJid);
              // Mantém a conversa marcada como Não Lida (Nova Conversa) no seu WhatsApp
              await sock.chatModify({ markRead: false }, callerJid);
            } catch {}

            const phoneClean = normalizeContactKey(callerJid);
            const logText = `📞 Ligação não atendida de ${phoneClean} -> Enviado: "${replyText}"`;
            addDailyLog('LIGACAO_PERDIDA', logText);
            if (addMainLog) addMainLog('LIGACAO_PERDIDA', logText);
          }
        }
      }
    } catch (callErr) {
      addDailyLog('ERRO', `Erro ao responder ligação: ${callErr.message}`);
    }
  }
}

/**
 * ============================================================================
 * BLOCO 2: SAUDAÇÃO DE 1ª MENSAGEM NO PRIVADO ("SEMPRE ONLINE" / NOVA CONVERSA)
 * E RESPOSTAS SIMPLES DO DIA A DIA
 * Se precisar alterar como ela responde mensagens privadas, edite abaixo:
 * ============================================================================
 */
async function handlePrivateDailyMessage(sock, msg, addMainLog) {
  const remoteJid = msg.key.remoteJid || '';
  if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast' || remoteJid.endsWith('@newsletter')) {
    return;
  }

  // Se VOCÊ mesmo enviou uma mensagem para alguém no privado, registra que você já conhece esse contato
  if (msg.key.fromMe) {
    markContactAsKnown(remoteJid);
    return;
  }

  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    '';

  const senderName = msg.pushName || 'Contato';
  const firstName = senderName.split(' ')[0];
  const saudacao = getPeriodGreeting();
  const settings = loadSettings();

  // 1) VERIFICA SE É A PRIMEIRA VEZ QUE ESSA PESSOA MANDA MENSAGEM
  if (!isContactKnown(remoteJid)) {
    // Grava imediatamente na memória para NUNCA enviar segunda mensagem automática
    markContactAsKnown(remoteJid);

    if (settings.firstContactEnabled !== false) {
      const template = settings.firstContactMessage || '{saudacao}, tudo bem? Como posso te ajudar?';
      const replyText = template
        .replace(/\{saudacao\}/gi, saudacao)
        .replace(/\{nome\}/gi, firstName);

      // Efeito "digitando..." para parecer que você está online na hora
      await new Promise(r => setTimeout(r, 1500));
      try {
        await sock.sendPresenceUpdate('composing', remoteJid);
        await new Promise(r => setTimeout(r, 2000));
      } catch {}

      await sock.sendMessage(remoteJid, { text: replyText });

      try {
        await sock.sendPresenceUpdate('paused', remoteJid);
        // Marca como NÃO LIDA ("Nova Conversa") no seu WhatsApp para você ver a bolinha verde!
        await sock.chatModify({ markRead: false }, remoteJid);
      } catch {}

      const phoneClean = normalizeContactKey(remoteJid);
      const logText = `🟢 [Nova Conversa] 1ª mensagem de ${senderName} (${phoneClean}) -> Respondido: "${replyText}"`;
      addDailyLog('NOVA_CONVERSA', logText);
      if (addMainLog) addMainLog('NOVA_CONVERSA', logText);
      return;
    }
  }

  // 2) RESPOSTAS SIMPLES DO DIA A DIA (OPCIONAL - configuradas na Página do Dia a Dia)
  const simpleRules = Array.isArray(settings.dailySimpleReplies) ? settings.dailySimpleReplies : [];
  if (text && simpleRules.length > 0) {
    const normText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    for (const rule of simpleRules) {
      if (!rule || rule.active === false || !rule.trigger || !rule.response) continue;
      const triggerNorm = String(rule.trigger).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      if (triggerNorm && normText === triggerNorm) {
        const replyText = String(rule.response)
          .replace(/\{saudacao\}/gi, saudacao)
          .replace(/\{nome\}/gi, firstName);

        await new Promise(r => setTimeout(r, 1200));
        await sock.sendMessage(remoteJid, { text: replyText });
        try {
          await sock.chatModify({ markRead: false }, remoteJid);
        } catch {}

        const phoneClean = normalizeContactKey(remoteJid);
        addDailyLog('RESPOSTA_RAPIDA', `💬 Gatilho "${rule.trigger}" para ${senderName} (${phoneClean}) -> "${replyText}"`);
        break;
      }
    }
  }
}

function getDailyState() {
  return {
    knownContactsCount: knownContacts.size,
    currentPeriodGreeting: getPeriodGreeting(),
    dailyActivityLogs
  };
}

module.exports = {
  markContactAsKnown,
  isContactKnown,
  removeKnownContact,
  getPeriodGreeting,
  handleIncomingCalls,
  handlePrivateDailyMessage,
  getDailyState,
  addDailyLog
};
