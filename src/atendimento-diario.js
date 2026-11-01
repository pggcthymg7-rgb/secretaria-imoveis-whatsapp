/**
 * ============================================================================
 * ATENDIMENTO DO DIA A DIA (privado e ligações)
 * ============================================================================
 * 1) LIGAÇÃO NÃO ATENDIDA -> mensagem automática "já te retorno" (mantido como estava,
 *    funcionando perfeitamente segundo o corretor).
 * 2) 1ª MENSAGEM -> responde SOMENTE quem nunca falou com você. Regras (todas precisam passar):
 *    - não é mensagem sua, nem antiga (histórico/offline), nem de status/canal
 *    - o contato não está na memória (telefone OU LID) e não está salvo na sua agenda
 *    - não é uma resposta a uma mensagem anterior (citação)
 *    - fora do período de aquecimento quando a memória ainda está vazia
 * 3) RESPOSTAS RÁPIDAS -> gatilho exato configurado no painel.
 * ============================================================================
 */
const { loadSettings } = require('./settings');
const contacts = require('./contacts');
const { getGreetingByTime } = require('./matcher');

const dailyActivityLogs = [];

function addDailyLog(type, message) {
  const entry = { time: new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }), ts: Date.now(), type, message };
  dailyActivityLogs.unshift(entry);
  if (dailyActivityLogs.length > 200) dailyActivityLogs.pop();
  console.log(`[DIA-A-DIA] [${entry.time}] [${type}] ${message}`);
}

const getPeriodGreeting = () => getGreetingByTime();

function extractText(msg) {
  const m = msg.message || {};
  const inner = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message || m;
  return (
    inner.conversation ||
    inner.extendedTextMessage?.text ||
    inner.imageMessage?.caption ||
    inner.videoMessage?.caption ||
    inner.documentMessage?.caption ||
    ''
  );
}

function quotedSomething(msg) {
  const m = msg.message || {};
  const ctx = m.extendedTextMessage?.contextInfo || m.imageMessage?.contextInfo || m.videoMessage?.contextInfo;
  return Boolean(ctx && (ctx.quotedMessage || ctx.stanzaId));
}

function messageAgeSeconds(msg) {
  const ts = Number(msg.messageTimestamp?.low ?? msg.messageTimestamp ?? 0);
  if (!ts) return 0;
  return Math.max(0, Date.now() / 1000 - ts);
}

async function humanSend(sock, jid, text, delayMs = 1500) {
  await new Promise(r => setTimeout(r, delayMs));
  try {
    await sock.sendPresenceUpdate('composing', jid);
    await new Promise(r => setTimeout(r, 1800 + Math.random() * 1200));
  } catch {}
  const sent = await sock.sendMessage(jid, { text });
  try {
    await sock.sendPresenceUpdate('paused', jid);
    await sock.chatModify({ markRead: false }, jid); // mantém a conversa como "não lida" para você ver
  } catch {}
  return sent;
}

// ============================================================================
// BLOCO 1: LIGAÇÕES NÃO ATENDIDAS
// ============================================================================
const activeCalls = new Map();
const repliedMissedCalls = new Set();

async function handleIncomingCalls(sock, calls, addMainLog, ctx = {}) {
  if (!Array.isArray(calls)) return;
  for (const call of calls) {
    try {
      const callId = call.id;
      const callerJid = call.from || call.chatId;
      if (!callId || !callerJid || callerJid.endsWith('@g.us') || call.isGroup) continue;

      if (call.status === 'offer') {
        activeCalls.set(callId, { from: callerJid, answered: false });
      } else if (call.status === 'accept') {
        const info = activeCalls.get(callId) || { from: callerJid };
        info.answered = true;
        activeCalls.set(callId, info);
      } else if (['timeout', 'reject', 'terminate'].includes(call.status)) {
        const info = activeCalls.get(callId);
        const wasAnswered = info ? info.answered : false;
        activeCalls.delete(callId);
        if (wasAnswered || repliedMissedCalls.has(callId)) continue;
        repliedMissedCalls.add(callId);
        if (repliedMissedCalls.size > 2000) repliedMissedCalls.clear();

        const settings = loadSettings();
        if (settings.pausado || settings.missedCallEnabled === false) continue;

        const replyText = String(settings.missedCallMessage || '{saudacao}, já te retorno!').replace(/\{saudacao\}/gi, getPeriodGreeting());
        contacts.markKnown(callerJid, call.callerPn);
        await humanSend(sock, callerJid, replyText, 2000);

        const phone = (ctx.resolvePhone ? await ctx.resolvePhone(callerJid) : '') || contacts.keyOf(callerJid);
        const logText = `📞 Ligação não atendida de ${phone} -> Enviado: "${replyText}"`;
        addDailyLog('LIGACAO_PERDIDA', logText);
        if (addMainLog) addMainLog('LIGACAO_PERDIDA', logText);
        if (ctx.onEvent) ctx.onEvent('ligacao_perdida', { phone });
      }
    } catch (callErr) {
      addDailyLog('ERRO', `Erro ao responder ligação: ${callErr.message}`);
    }
  }
}

// ============================================================================
// BLOCO 2: 1ª MENSAGEM + RESPOSTAS RÁPIDAS
// ============================================================================
/**
 * Decide se esta mensagem privada é a PRIMEIRA de alguém que nunca falou com você.
 * Retorna { reply: boolean, reason: string }
 */
function shouldSendFirstContact(msg, settings, ctx = {}) {
  const jid = msg.key.remoteJid;
  const alt = msg.key.remoteJidAlt || msg.key.senderPn || null;
  if (settings.pausado) return { reply: false, reason: 'secretária pausada' };
  if (settings.firstContactEnabled === false) return { reply: false, reason: '1ª mensagem desativada' };
  if (messageAgeSeconds(msg) > 180) return { reply: false, reason: 'mensagem antiga (histórico/offline)' };
  if (contacts.isKnown(jid, alt)) return { reply: false, reason: 'contato já conhecido' };
  if (settings.firstContactIgnorarAgenda !== false && contacts.isInAddressBook(jid, alt)) return { reply: false, reason: 'contato salvo na agenda' };
  if (quotedSomething(msg)) return { reply: false, reason: 'responde uma mensagem anterior (conversa existente)' };

  const warmupMin = Number(settings.firstContactAquecimentoMin ?? 20);
  const connectedAt = ctx.connectedAt || 0;
  const memoryWasEmpty = contacts.stats().conhecidos < 30;
  if (memoryWasEmpty && connectedAt && Date.now() - connectedAt < warmupMin * 60 * 1000) {
    return { reply: false, reason: `aquecimento (${warmupMin} min) — aprendendo seus contatos` };
  }
  return { reply: true, reason: 'contato novo' };
}

async function handlePrivateDailyMessage(sock, msg, addMainLog, ctx = {}) {
  const remoteJid = msg.key.remoteJid || '';
  if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast' || remoteJid.endsWith('@newsletter')) return;
  let alt = msg.key.remoteJidAlt || msg.key.senderPn || null;
  // Só veio o ID novo (LID)? Descobre o telefone para não confundir contato antigo com novo
  if (!alt && contacts.isLid(remoteJid) && ctx.resolvePhone) {
    const pn = await ctx.resolvePhone(remoteJid).catch(() => '');
    if (pn) alt = `${pn}@s.whatsapp.net`;
  }
  if (alt && !msg.key.remoteJidAlt) msg.key.remoteJidAlt = alt;

  // Mensagem sua no privado -> esse contato é conhecido
  if (msg.key.fromMe) {
    contacts.markKnown(remoteJid, alt);
    return;
  }

  const text = extractText(msg);
  const settings = loadSettings();
  const senderName = msg.pushName || 'Contato';
  const firstName = senderName.split(' ')[0];
  const saudacao = getPeriodGreeting();
  contacts.touch(alt || remoteJid, { apelido: senderName });

  // Descadastro de prospecção ("SAIR", "PARAR")
  if (ctx.onPrivateText) {
    const handled = await ctx.onPrivateText(remoteJid, alt, text, senderName);
    if (handled) {
      contacts.markKnown(remoteJid, alt);
      return;
    }
  }

  const decision = shouldSendFirstContact(msg, settings, ctx);
  // A partir de agora esse contato é conhecido (nunca recebe a 1ª mensagem duas vezes)
  contacts.markKnown(remoteJid, alt);

  if (decision.reply) {
    const replyText = String(settings.firstContactMessage || '{saudacao}, tudo bem? Como posso te ajudar?')
      .replace(/\{saudacao\}/gi, saudacao)
      .replace(/\{nome\}/gi, firstName);
    await humanSend(sock, remoteJid, replyText, 1500);
    const phone = (ctx.resolvePhone ? await ctx.resolvePhone(alt || remoteJid) : '') || contacts.keyOf(alt || remoteJid);
    const logText = `🟢 Nova conversa: ${senderName} (${phone}) -> "${replyText}"`;
    addDailyLog('NOVA_CONVERSA', logText);
    if (addMainLog) addMainLog('NOVA_CONVERSA', logText);
    if (ctx.onEvent) ctx.onEvent('nova_conversa', { phone, nome: senderName });
    return;
  }
  if (decision.reason.startsWith('aquecimento')) {
    addDailyLog('APRENDENDO', `${senderName}: não respondi (${decision.reason}).`);
  }

  // Respostas rápidas (gatilho exato)
  const rules = Array.isArray(settings.dailySimpleReplies) ? settings.dailySimpleReplies : [];
  if (!text || !rules.length || settings.pausado) return;
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[!?.]+$/, '').trim();
  const nt = norm(text);
  for (const rule of rules) {
    if (!rule || rule.active === false || !rule.trigger || !rule.response) continue;
    if (nt === norm(rule.trigger)) {
      const replyText = String(rule.response).replace(/\{saudacao\}/gi, saudacao).replace(/\{nome\}/gi, firstName);
      await humanSend(sock, remoteJid, replyText, 1200);
      addDailyLog('RESPOSTA_RAPIDA', `💬 "${rule.trigger}" para ${senderName} -> "${replyText}"`);
      break;
    }
  }
}

function getDailyState() {
  const s = contacts.stats();
  return {
    knownContactsCount: s.conhecidos,
    agendaCount: s.agenda,
    currentPeriodGreeting: getPeriodGreeting(),
    dailyActivityLogs
  };
}

module.exports = {
  markContactAsKnown: (...j) => contacts.markKnown(...j),
  isContactKnown: (...j) => contacts.isKnown(...j),
  removeKnownContact: j => contacts.forget(j),
  getPeriodGreeting,
  handleIncomingCalls,
  handlePrivateDailyMessage,
  shouldSendFirstContact,
  extractText,
  humanSend,
  getDailyState,
  addDailyLog
};
