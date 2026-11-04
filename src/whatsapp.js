/**
 * ============================================================================
 * CONEXÃO COM O WHATSAPP (Baileys) + ROTEAMENTO DAS MENSAGENS
 * ============================================================================
 *  - Grupos monitorados  -> cérebro (pedidos de imóveis) -> envio ao parceiro / alerta
 *  - Seu chat "Mensagem para mim" (ou número de alerta) -> Assistente pessoal
 *  - Privado de terceiros -> 1ª mensagem / respostas rápidas / descadastro de prospecção
 *  - Ligações -> resposta de ligação não atendida
 * ============================================================================
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');

const { AUTH_DIR, FOTOS_DIR } = require('./paths');
const { readJson, writeJson } = require('./store');
const { loadInventory } = require('./sheets');
const { analyzeMessageAndMatch, formatOutreachMessage } = require('./matcher');
const { loadSettings } = require('./settings');
const contacts = require('./contacts');
const radar = require('./radar');
const metrics = require('./metrics');
const prospeccao = require('./prospeccao');
const assistant = require('./assistant');
const { handleIncomingCalls, handlePrivateDailyMessage, extractText } = require('./atendimento-diario');

const logger = pino({ level: 'silent' });

let sock = null;
let connectionStatus = 'DESCONECTADO';
let latestQrCode = null;
let connectedAt = 0;
let connectedGroups = [];
let reconnectAttempts = 0;
let reconnectTimer = null;
const activityLogs = [];

const sentByBot = new Set(); // ids das mensagens que a própria secretária enviou
const processedIds = new Set(); // evita processar a mesma mensagem 2x
const OFFERS_FILE = 'ofertas_enviadas.json';
let sentOffers = readJson(OFFERS_FILE, {});
const OFFER_TTL_MS = 15 * 24 * 3600 * 1000;
const offersPerHour = [];

function addLog(type, message, details = null) {
  const entry = { time: new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }), ts: Date.now(), type, message, details };
  activityLogs.unshift(entry);
  if (activityLogs.length > 300) activityLogs.pop();
  console.log(`[${entry.time}] [${type}] ${message}`);
}

function remember(set, id, max = 3000) {
  if (!id) return;
  set.add(id);
  if (set.size > max) set.delete(set.values().next().value);
}

function isConnected() {
  return Boolean(sock && connectionStatus === 'CONECTADO');
}

function selfKeys() {
  if (!sock || !sock.user) return [];
  return [contacts.keyOf(sock.user.id), contacts.keyOf(sock.user.lid)].filter(Boolean);
}

function selfPhone() {
  return sock && sock.user ? contacts.keyOf(sock.user.id) : '';
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------
async function rawSend(jid, content) {
  if (!isConnected()) throw new Error('WhatsApp não está conectado.');
  const sent = await sock.sendMessage(jid, content);
  if (sent && sent.key && sent.key.id) remember(sentByBot, sent.key.id);
  return sent;
}

function resolveImage(ref) {
  if (!ref) return null;
  if (/^https?:\/\//i.test(ref)) return { url: ref };
  const local = path.join(FOTOS_DIR, path.basename(String(ref))); // nunca sai da pasta de fotos
  return fs.existsSync(local) ? fs.readFileSync(local) : null;
}

const sendText = (jid, text) => rawSend(jid, { text });

async function sendImage(jid, ref, caption) {
  const img = resolveImage(ref);
  if (!img) return sendText(jid, caption);
  return rawSend(jid, { image: img, caption });
}

/** Ficha em PDF (modelo novo, com as edições salvas no painel › Fichas PDF) */
async function sendPdf(jid, property) {
  const fichaPdf = require('./pdf-ficha');
  const f = fichaPdf.ficha(property);
  if (!f.telefone) f.telefone = loadSettings().meuWhatsappAlerta || selfPhone();
  const buf = await fichaPdf.gerar(property, f);
  return rawSend(jid, { document: buf, mimetype: 'application/pdf', fileName: fichaPdf.nomeArquivo(property, f) });
}

/** Documento qualquer (ex.: ficha em PDF montada no painel) para um contato */
const sendDocument = (jid, buffer, fileName, caption = '', mimetype = 'application/pdf') => rawSend(jid, { document: buffer, mimetype, fileName, caption });

async function typing(jid, ms = 2500) {
  try {
    await sock.sendPresenceUpdate('composing', jid);
    await new Promise(r => setTimeout(r, ms));
    await sock.sendPresenceUpdate('paused', jid);
  } catch {}
}

/** Telefone real de um JID (resolve LID -> telefone quando possível) */
async function resolvePhone(jid, alt = null) {
  if (alt && !contacts.isLid(alt)) return contacts.keyOf(alt);
  if (!jid) return '';
  if (!contacts.isLid(jid)) return contacts.keyOf(jid);
  try {
    const pn = await sock?.signalRepository?.lidMapping?.getPNForLID(jid);
    if (pn) return contacts.keyOf(pn);
  } catch {}
  return '';
}

function brazilVariants(rawPhone) {
  let digits = String(rawPhone || '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
  const out = new Set([digits]);
  if (digits.startsWith('55') && digits.length === 13 && digits[4] === '9') out.add(digits.slice(0, 4) + digits.slice(5));
  else if (digits.startsWith('55') && digits.length === 12) out.add(digits.slice(0, 4) + '9' + digits.slice(4));
  return [...out].filter(d => d.length >= 12);
}

/** Retorna o JID do número no WhatsApp (ou null se não existir). Trata o 9º dígito. */
async function checkNumber(phone) {
  const candidates = brazilVariants(phone);
  if (!candidates.length || !sock) return null;
  try {
    const res = await sock.onWhatsApp(...candidates);
    const hit = Array.isArray(res) ? res.find(r => r && r.exists && r.jid) : null;
    return hit ? hit.jid.replace(/:\d+@/, '@') : null;
  } catch {
    return null;
  }
}

function ownerNumbers() {
  const s = loadSettings();
  const list = [s.meuWhatsappAlerta, ...String(s.assistenteNumerosExtras || '').split(',')].map(x => String(x || '').replace(/\D/g, '')).filter(x => x.length >= 10);
  return [...new Set(list.flatMap(brazilVariants))];
}

/** Alerta no SEU WhatsApp (número de alerta; se vazio, o próprio chat "Mensagem para mim") */
async function ownerTargetJid() {
  const nums = ownerNumbers();
  if (!nums.length || nums.includes(selfPhone())) return `${selfPhone()}@s.whatsapp.net`;
  return checkNumber(nums[0]);
}

async function sendOwnerContent(content, label) {
  if (!isConnected()) {
    addLog('AVISO_ALERTA', `${label} não enviado: WhatsApp desconectado.`);
    return { ok: false, error: 'WhatsApp desconectado' };
  }
  const target = await ownerTargetJid();
  if (!target) return { ok: false, error: 'Número de alerta não encontrado no WhatsApp' };
  try {
    contacts.markKnown(target);
    await rawSend(target, content);
    addLog('ALERTA_ENVIADO', `📲 ${label} enviado para ${target.split('@')[0]}.`);
    return { ok: true, targetJids: [target] };
  } catch (err) {
    addLog('ERRO_ALERTA', `Falha ao enviar ${label.toLowerCase()}: ${err.message}`);
    return { ok: false, targetJids: [target], error: 'falha no envio' };
  }
}

/** Alerta no SEU WhatsApp (número de alerta; se vazio, o próprio chat "Mensagem para mim") */
function sendOwnerWhatsAppAlert(alertMsg) {
  return sendOwnerContent({ text: alertMsg }, 'Alerta');
}

/** Envia um arquivo (ex: backup) para o SEU WhatsApp */
function sendOwnerDocument(buffer, fileName, caption = '', mimetype = 'application/gzip') {
  return sendOwnerContent({ document: buffer, fileName, mimetype, caption }, 'Arquivo');
}

/** Gera o backup e manda para o chat informado (ou para o dono) */
async function sendBackup(chatJid = null) {
  const backup = require('./backup');
  try {
    contacts.flush();
    radar.flush();
  } catch {}
  const buf = backup.createBackup();
  const caption = `${assistant.BOT} Backup da BIGA (${(buf.length / 1024 / 1024).toFixed(1)} MB). Guarde este arquivo: com ele você restaura tudo em Ajustes › Backup.`;
  const name = backup.backupFileName();
  if (chatJid) {
    await rawSend(chatJid, { document: buf, fileName: name, mimetype: 'application/gzip', caption });
    return { ok: true };
  }
  return sendOwnerDocument(buf, name, caption);
}

// ---------------------------------------------------------------------------
// Grupos
// ---------------------------------------------------------------------------
function shouldMonitorGroup(groupJid, groupSubject) {
  const s = loadSettings();
  const ids = Array.isArray(s.gruposMonitoradosIds) ? s.gruposMonitoradosIds : [];
  if (ids.length) return ids.includes(groupJid);
  const filterStr = String(s.gruposMonitorados || '').trim();
  if (!filterStr) return false; // nada configurado = não monitora (mais seguro)
  if (filterStr === '*') return true;
  const subject = String(groupSubject || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return filterStr
    .split(',')
    .map(x => x.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
    .filter(Boolean)
    .some(f => subject.includes(f) || groupJid.toLowerCase().includes(f));
}

async function refreshGroups() {
  if (!sock) return connectedGroups;
  try {
    const groupsObj = await sock.groupFetchAllParticipating();
    connectedGroups = Object.values(groupsObj).map(g => ({ id: g.id, subject: g.subject, participantsCount: g.participants?.length || 0 }));
  } catch (err) {
    addLog('GRUPOS', `Não consegui listar os grupos: ${err.message}`);
  }
  return connectedGroups;
}

function offerAlreadySent(phoneKey, propId) {
  const k = `${phoneKey}:${propId}`;
  const ts = sentOffers[k];
  return ts && Date.now() - ts < OFFER_TTL_MS;
}

function markOfferSent(phoneKey, propId) {
  sentOffers[`${phoneKey}:${propId}`] = Date.now();
  for (const [k, ts] of Object.entries(sentOffers)) if (Date.now() - ts > OFFER_TTL_MS) delete sentOffers[k];
  try {
    writeJson(OFFERS_FILE, sentOffers);
  } catch {}
}

function canSendOfferNow() {
  const hourAgo = Date.now() - 3600 * 1000;
  while (offersPerHour.length && offersPerHour[0] < hourAgo) offersPerHour.shift();
  return offersPerHour.length < 30; // proteção anti-bloqueio
}

/** Envia 1 ou mais imóveis no privado de quem pediu */
async function sendOffers(targetJid, phoneKey, senderName, originalText, properties, analysis) {
  const settings = loadSettings();
  const maxPhotos = Number(settings.maxPhotosPerMatch ?? 5);
  const sentIds = [];
  contacts.markKnown(targetJid, phoneKey);
  for (let i = 0; i < properties.length; i++) {
    const prop = properties[i];
    if (offerAlreadySent(phoneKey, prop.id) || !canSendOfferNow()) continue;
    const ctx = i === 0 || !sentIds.length ? analysis : { ...analysis, customOpening: 'Tenho também essa outra opção no perfil:', customClosing: '' };
    const text = formatOutreachMessage(senderName, originalText, prop, ctx);
    await typing(targetJid, 2000 + Math.random() * 1500);
    const fotos = (prop.fotos || []).slice(0, maxPhotos);
    let textSent = false;
    for (let f = 0; f < fotos.length; f++) {
      const img = resolveImage(fotos[f]);
      if (!img) continue;
      try {
        await rawSend(targetJid, { image: img, caption: textSent ? '' : text });
        textSent = true;
        await new Promise(r => setTimeout(r, 700 + Math.random() * 800));
      } catch (err) {
        addLog('AVISO', `Foto ${fotos[f]} não enviada: ${err.message}`);
      }
    }
    if (!textSent) await rawSend(targetJid, { text });
    if (analysis.wantsPdf && settings.enviarPdfQuandoPedir !== false) {
      try {
        await sendPdf(targetJid, prop);
      } catch (err) {
        addLog('AVISO', `PDF do #${prop.id} não enviado: ${err.message}`);
      }
    }
    markOfferSent(phoneKey, prop.id);
    offersPerHour.push(Date.now());
    sentIds.push(prop.id);
    metrics.inc('ofertas_enviadas');
    await new Promise(r => setTimeout(r, 2500 + Math.random() * 2000));
  }
  return sentIds;
}

async function handleGroupMessage(msg, remoteJid) {
  const text = extractText(msg);
  if (!text || text.trim().length < 8) return;

  let groupInfo = connectedGroups.find(g => g.id === remoteJid);
  if (!groupInfo) {
    try {
      const meta = await sock.groupMetadata(remoteJid);
      groupInfo = { id: remoteJid, subject: meta.subject, participantsCount: meta.participants?.length || 0 };
      connectedGroups.push(groupInfo);
    } catch {
      groupInfo = { id: remoteJid, subject: remoteJid };
    }
  }
  if (!shouldMonitorGroup(remoteJid, groupInfo.subject)) return;

  const participantJid = msg.key.participant || msg.participant || '';
  const participantAlt = msg.key.participantAlt || null;
  const senderName = msg.pushName || 'Corretor(a)';
  const phone = await resolvePhone(participantJid, participantAlt);
  const phoneKey = phone || contacts.keyOf(participantJid);

  const inventory = await loadInventory();
  const analysis = await analyzeMessageAndMatch(text, senderName, inventory);
  if (!analysis.isLookingForProperty) return;

  metrics.inc('pedidos_lidos');
  const settings = loadSettings();
  const loc = analysis.criteria.local;
  const item = radar.add({
    grupo: groupInfo.subject,
    grupoId: remoteJid,
    sender: senderName,
    phone,
    jid: participantAlt && !contacts.isLid(participantAlt) ? participantAlt : participantJid,
    texto: text.slice(0, 1500),
    resumo: analysis.resumo,
    decision: analysis.decision,
    motivo: analysis.reason,
    tipos: analysis.criteria.tipos,
    locais: [...loc.bairros, ...loc.regioes.map(r => `Região ${r}`), ...loc.condominios.map(c => c.name), ...loc.cidades].slice(0, 6),
    valorMax: analysis.criteria.valor_max || null,
    candidatos: [...analysis.matches.map(m => m.id), ...analysis.quase.map(q => q.property.id)],
    duvidas: analysis.doubtReasons,
    wantsPdf: analysis.wantsPdf
  });
  addLog('BUSCA_DETECTADA', `[${groupInfo.subject}] ${senderName}: ${analysis.resumo} → ${analysis.decision}`);

  const link = phone ? `wa.me/${phone}` : 'número oculto (LID)';

  if (analysis.decision === 'ENVIAR') {
    if (settings.modoApenasAvisar || settings.pausado) {
      radar.update(item.code, { decision: 'AVISAR', motivo: settings.pausado ? 'BIGA pausada' : 'Modo apenas avisar' });
      await sendOwnerWhatsAppAlert(
        `🚨 *PEDIDO COMPATÍVEL* (${item.code})\n👥 ${groupInfo.subject}\n👤 ${senderName} (${link})\n💬 "${text.slice(0, 600)}"\n\n🏠 ${analysis.matches.map(m => `#${m.id} ${m.tipo} · ${m.setor}`).join('\n🏠 ')}\n\nResponda *enviar ${item.code}* para eu mandar agora.`
      );
      return;
    }
    const target = item.jid;
    const sent = await sendOffers(target, phoneKey, senderName, text, analysis.matches, analysis);
    radar.update(item.code, { enviados: sent });
    if (sent.length) {
      addLog('OPORTUNIDADE_ENVIADA', `✅ #${sent.join(', #')} enviado(s) para ${senderName} (${analysis.detectedTone}).`);
      await sendOwnerWhatsAppAlert(
        `✅ *ENVIEI IMÓVEL PARA UM PARCEIRO* (${item.code})\n👥 ${groupInfo.subject}\n👤 ${senderName} (${link})\n💬 "${text.slice(0, 400)}"\n🧠 Entendi: ${analysis.resumo}\n🏠 Enviado: #${sent.join(', #')}`
      );
    } else {
      addLog('IGNORADO', `${senderName} já recebeu esses imóveis recentemente (ou limite por hora atingido).`);
    }
    return;
  }

  if (analysis.decision === 'AVISAR') {
    metrics.inc('duvidas');
    const candidato = item.candidatos[0];
    await sendOwnerWhatsAppAlert(
      `🤔 *CONFIRA ANTES DE EU ENVIAR* (${item.code})\n👥 ${groupInfo.subject}\n👤 ${senderName} (${link})\n💬 "${text.slice(0, 700)}"\n\n🧠 Entendi: ${analysis.resumo}\n❓ ${analysis.doubtReasons.join('\n❓ ')}\n\n` +
        (candidato ? `Se estiver ok, responda *enviar ${item.code}* (manda o #${candidato}) ou *enviar ${item.code} <id>* para outro imóvel.` : 'Nada foi enviado.')
    );
  }
}

/** Dono aprovou um alerta pelo WhatsApp: "enviar A12" ou "enviar A12 30" */
async function approveAlert(chatJid, code, propId) {
  const done = async (ok, message) => {
    if (chatJid) await sendText(chatJid, `${assistant.BOT} ${message}`).catch(() => {});
    return { ok, message };
  };
  if (!isConnected()) return done(false, 'WhatsApp desconectado.');
  const it = radar.get(code);
  if (!it) return done(false, `Não encontrei o pedido ${code} (vale por 48h).`);
  const id = propId || (it.candidatos || [])[0];
  if (!id) return done(false, `O pedido ${code} não tem imóvel sugerido. Use *enviar ${code} <id>*.`);
  const inventory = await loadInventory();
  const prop = inventory.find(p => String(p.id) === String(id));
  if (!prop) return done(false, `Imóvel #${id} não está ativo.`);
  const analysis = await analyzeMessageAndMatch(it.texto, it.sender, inventory, { useAi: false });
  const phoneKey = it.phone || contacts.keyOf(it.jid);
  delete sentOffers[`${phoneKey}:${prop.id}`]; // aprovação manual libera reenvio
  const sent = await sendOffers(it.jid, phoneKey, it.sender, it.texto, [prop], { ...analysis, wantsPdf: it.wantsPdf });
  radar.update(code, { decision: 'ENVIAR', aprovadoManual: true, enviados: [...(it.enviados || []), ...sent] });
  if (sent.length) addLog('OPORTUNIDADE_ENVIADA', `✅ #${prop.id} enviado para ${it.sender} (aprovado por você, ${code}).`);
  return done(Boolean(sent.length), sent.length ? `Pronto! Enviei o #${prop.id} para ${it.sender}.` : 'Não consegui enviar agora (limite por hora). Tente em alguns minutos.');
}

/**
 * 🎯 Oferece um imóvel para quem pediu algo assim nos grupos (match reverso).
 * Só para quem bate em TUDO e ainda não recebeu; um por vez, com pausa de 25–45 s
 * e as mesmas travas de envio dos grupos (limite por hora, não repetir oferta).
 * `codes` (opcional) restringe aos pedidos escolhidos no painel.
 */
let oferecendo = false;
async function oferecerImovel(chatJid, propId, codes = null) {
  const avisar = async m => (chatJid ? sendText(chatJid, `${assistant.BOT} ${m}`) : sendOwnerWhatsAppAlert(`${assistant.BOT} ${m}`)).catch(() => {});
  if (!isConnected()) return { ok: false, message: 'WhatsApp desconectado.' };
  if (oferecendo) return { ok: false, message: 'Já estou oferecendo um imóvel agora. Espere terminar.' };
  const inventory = await loadInventory();
  const prop = inventory.find(p => String(p.id) === String(propId));
  if (!prop) return { ok: false, message: `Imóvel #${propId} não está ativo.` };
  const lista = await require('./quem-procura').quemProcura(prop);
  const alvos = lista.filter(l => l.jid && !l.jaRecebeu && (codes ? codes.includes(l.code) : l.nivel === 'MATCH'));
  if (!alvos.length) {
    const m = lista.length ? `Ninguém novo para receber o #${prop.id} (quem bate em tudo já recebeu; os "quase" eu só mando se você escolher no painel).` : `Ninguém pediu algo como o #${prop.id} nos últimos 60 dias.`;
    await avisar(m);
    return { ok: false, message: m };
  }
  oferecendo = true;
  await avisar(`🎯 Vou oferecer o #${prop.id} para ${alvos.length} corretor(es), um por vez (leva uns ${Math.ceil((alvos.length * 35) / 60)} min).`);
  (async () => {
    const enviados = [];
    try {
      for (let i = 0; i < alvos.length; i++) {
        const l = alvos[i];
        const analysis = await analyzeMessageAndMatch(l.texto, l.sender, inventory, { useAi: false });
        const phoneKey = l.phone || contacts.keyOf(l.jid);
        const sent = await sendOffers(l.jid, phoneKey, l.sender, l.texto, [prop], { ...analysis, wantsPdf: false });
        if (sent.length) {
          enviados.push(l.sender);
          radar.update(l.code, { enviados: [...new Set([...(radar.list({ limit: 800 }).find(x => x.code === l.code)?.enviados || []), String(prop.id)])] });
          addLog('OPORTUNIDADE_ENVIADA', `🎯 #${prop.id} oferecido para ${l.sender} (pedido ${l.code}, match reverso).`);
        }
        if (i < alvos.length - 1) await new Promise(r => setTimeout(r, 25000 + Math.random() * 20000));
      }
    } catch (err) {
      addLog('AVISO', `Oferta do #${prop.id} interrompida: ${err.message}`);
    } finally {
      oferecendo = false;
      await avisar(enviados.length ? `✅ #${prop.id} oferecido para: ${enviados.join(', ')}.` : `Não consegui enviar o #${prop.id} agora (limite por hora ou já ofertado). Tente mais tarde.`);
    }
  })();
  return { ok: true, message: `Oferecendo para ${alvos.length} corretor(es).`, alvos: alvos.length };
}

// ---------------------------------------------------------------------------
// Chat do dono (assistente)
// ---------------------------------------------------------------------------
function isOwnerChat(msg) {
  const keys = [contacts.keyOf(msg.key.remoteJid), contacts.keyOf(msg.key.remoteJidAlt)].filter(Boolean);
  if (msg.key.fromMe) return keys.some(k => selfKeys().includes(k));
  const owners = ownerNumbers().filter(n => n !== selfPhone());
  return keys.some(k => owners.includes(k));
}

/**
 * Igual ao isOwnerChat, mas também reconhece o "Mensagem para mim" quando o WhatsApp manda o chat
 * só pelo código interno (LID) e a BIGA ainda não sabe que esse LID é o próprio número
 * (comum logo depois de conectar um aparelho novo).
 */
async function isOwnerChatAsync(msg) {
  if (isOwnerChat(msg)) return true;
  if (!msg.key.fromMe) return false;
  const jid = msg.key.remoteJid;
  if (!contacts.isLid(jid) || !selfPhone()) return false;
  const pn = await resolvePhone(jid, msg.key.remoteJidAlt);
  return Boolean(pn) && brazilVariants(pn).some(v => brazilVariants(selfPhone()).includes(v));
}

const COMANDO_DIAG = /^(ajuda|menu|comandos|help|status|lista|versao|versão|atualizar|backup|corretores)$/i;

async function downloadImageToFotos(msg) {
  try {
    const buf = await downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
    if (!buf || buf.length > 12 * 1024 * 1024) return null;
    const name = `${Date.now()}_wa_${crypto.randomBytes(3).toString('hex')}.jpg`;
    fs.writeFileSync(path.join(FOTOS_DIR, name), buf);
    return name;
  } catch (err) {
    addLog('AVISO', `Não consegui baixar a foto: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Busca inteligente: memória de anúncios dos grupos + importar histórico do celular
// ---------------------------------------------------------------------------
const anuncios = require('./anuncios');
const ANCORAS_FILE = 'ancoras_grupos.json';
let ancoras = readJson(ANCORAS_FILE, {});
let ancorasTimer = null;
let importacao = null;
const esperasHistorico = new Set();

function salvarAncoras() {
  if (ancorasTimer) return;
  ancorasTimer = setTimeout(() => {
    ancorasTimer = null;
    try {
      writeJson(ANCORAS_FILE, ancoras);
    } catch {}
  }, 3000);
  if (ancorasTimer.unref) ancorasTimer.unref();
}

function tsDaMensagem(msg) {
  const t = Number(msg.messageTimestamp || 0);
  return t > 0 ? t * 1000 : Date.now();
}

/** Guarda a mensagem mais antiga que a BIGA conhece de cada grupo (ponto de partida para pedir o histórico) */
function anotarAncora(msg) {
  const g = msg.key.remoteJid;
  if (!g || !g.endsWith('@g.us') || !msg.key.id) return;
  const ts = tsDaMensagem(msg);
  const a = ancoras[g];
  if (!a || ts < a.ts) {
    ancoras[g] = { key: { remoteJid: g, id: msg.key.id, fromMe: Boolean(msg.key.fromMe), participant: msg.key.participant || undefined }, ts };
    salvarAncoras();
  }
}

/** Se a mensagem do grupo é anúncio de imóvel, guarda na memória (90 dias) */
async function guardarAnuncioDoGrupo(msg, origem = 'ao vivo') {
  if (msg.key.fromMe) return null;
  if (origem === 'ao vivo' && loadSettings().buscaMemoriaAtiva === false) return null; // desligado em Busca › Configurações
  if (!require('./busca-inteligente').grupoNaBusca(msg.key.remoteJid)) return null; // grupo fora da lista da busca
  const texto = extractText(msg);
  if (!texto || texto.trim().length < 20 || !anuncios.pareceAnuncio(texto)) return null;
  const g = msg.key.remoteJid;
  const grupo = (connectedGroups.find(x => x.id === g) || {}).subject || 'Grupo';
  const participante = msg.key.participant || msg.participant || '';
  const telefone = await resolvePhone(participante, msg.key.participantAlt || null);
  return anuncios.registrar({ id: `${g}:${msg.key.id}`, ts: tsDaMensagem(msg), texto, grupo, grupoId: g, autor: msg.pushName || (telefone ? `+${telefone}` : 'Corretor(a)'), telefone, origem });
}

function esperarHistorico(grupoId, tsAntes, ms) {
  return new Promise(resolve => {
    const w = { grupoId, tsAntes, resolve };
    esperasHistorico.add(w);
    setTimeout(() => {
      esperasHistorico.delete(w);
      resolve(false);
    }, ms);
  });
}

/** Mensagens antigas que o celular mandou (histórico) -> anúncios */
async function processarHistorico(messages) {
  let novos = 0;
  for (const m of messages || []) {
    try {
      if (!m || !m.key || !String(m.key.remoteJid || '').endsWith('@g.us') || !m.message) continue;
      anotarAncora(m);
      if (await guardarAnuncioDoGrupo(m, 'histórico')) novos++;
    } catch {}
  }
  if (importacao && importacao.rodando) importacao.anuncios += novos;
  for (const w of [...esperasHistorico]) {
    const a = ancoras[w.grupoId];
    if (a && a.ts < w.tsAntes) {
      esperasHistorico.delete(w);
      w.resolve(true);
    }
  }
  if (novos) anuncios.persist(true);
  return novos;
}

/**
 * Pede ao celular, grupo por grupo, as mensagens anteriores (50 por vez) até 90 dias atrás.
 * O celular precisa estar ligado e com internet. Quanto vem é decisão do WhatsApp.
 */
async function importarHistoricoGrupos({ onFim, pausaMs = 1500, esperaMs = 25000, maxRodadas = 80 } = {}) {
  if (importacao && importacao.rodando) return { jaRodando: true, ...importacao };
  if (!isConnected()) throw new Error('WhatsApp não está conectado.');
  if (typeof sock.fetchMessageHistory !== 'function') throw new Error('Esta versão do WhatsApp não permite pedir o histórico.');
  if (!connectedGroups.length) await refreshGroups();
  const limite = Date.now() - anuncios.DIAS * 86400000;
  importacao = { rodando: true, inicio: Date.now(), grupos: 0, comHistorico: 0, anuncios: 0, semAncora: [], pedidos: 0 };
  const estado = importacao;
  (async () => {
    const naBusca = require('./busca-inteligente').grupoNaBusca;
    const lista = connectedGroups.filter(g => naBusca(g.id));
    for (const id of Object.keys(ancoras)) if (naBusca(id) && !lista.some(g => g.id === id)) lista.push({ id, subject: id });
    estado.total = lista.length;
    estado.vistos = 0;
    for (const g of lista) {
      if (!isConnected()) break;
      estado.vistos++;
      estado.atual = g.subject;
      if (!ancoras[g.id]) {
        estado.semAncora.push(g.subject);
        continue;
      }
      let rodadas = 0;
      let parado = 0;
      let andou = false;
      while (ancoras[g.id].ts > limite && rodadas < maxRodadas && parado < 2 && isConnected()) {
        const antes = ancoras[g.id].ts;
        try {
          await sock.fetchMessageHistory(50, ancoras[g.id].key, antes);
          estado.pedidos++;
        } catch (err) {
          addLog('BUSCA', `Histórico de "${g.subject}": ${err.message}`);
          break;
        }
        const veio = await esperarHistorico(g.id, antes, esperaMs);
        if (veio) {
          andou = true;
          parado = 0;
        } else parado++;
        rodadas++;
        if (pausaMs) await new Promise(r => setTimeout(r, pausaMs));
      }
      estado.grupos++;
      if (andou) estado.comHistorico++;
    }
    estado.rodando = false;
    estado.fim = Date.now();
    anuncios.persist(true);
    addLog('BUSCA', `📥 Histórico importado: ${estado.anuncios} anúncios de ${estado.comHistorico}/${estado.grupos} grupos.`);
    if (onFim) await onFim(estado);
  })().catch(err => {
    estado.rodando = false;
    addLog('ERRO', `Importação do histórico: ${err.message}`);
  });
  return estado;
}

function estadoImportacao() {
  return importacao;
}

/** Conversa exportada (.txt/.zip) mandada no "Mensagem para mim" */
async function importarConversaExportada(msg) {
  const doc = msg.message.documentMessage || msg.message.documentWithCaptionMessage?.message?.documentMessage;
  const nome = String(doc?.fileName || '');
  if (!doc || !/\.(txt|zip)$/i.test(nome)) return null;
  if (Number(doc.fileLength || 0) > 40 * 1024 * 1024) throw new Error('Arquivo grande demais (máximo 40 MB).');
  const buf = await downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
  const r = anuncios.importarExportacao(buf, nome);
  addLog('BUSCA', `📥 Conversa exportada "${r.grupo}": ${r.anuncios} anúncios de ${r.lidas} mensagens.`);
  return r;
}

// ---------------------------------------------------------------------------
// Conexão
// ---------------------------------------------------------------------------
/**
 * Espera antes de reconectar.
 * - 515 (restartRequired): vem logo depois de ler o QR Code — o WhatsApp pede para reconectar
 *   para terminar o pareamento. Precisa ser quase na hora (1 s), senão o celular desiste do aparelho.
 * - 408 (QR Code venceu sem ser lido) e aguardando QR: espera curta, para o QR novo aparecer logo.
 * - Demais quedas: espera crescente (3 s, 6 s, 12 s… até 60 s) para não martelar o servidor.
 */
function reconnectDelay(statusCode, attempts, semSessao = false) {
  if (statusCode === DisconnectReason.restartRequired) return 1000; // 1 s: só o tempo de gravar a sessão nova no disco
  if (semSessao || statusCode === DisconnectReason.timedOut) return 3000;
  return Math.min(60000, 3000 * 2 ** Math.min(attempts, 5));
}

function scheduleReconnect(statusCode) {
  if (reconnectTimer) return;
  reconnectAttempts++;
  const semSessao = !sock?.authState?.creds?.me; // ainda sem aparelho pareado (esperando QR Code)
  const delay = reconnectDelay(statusCode, reconnectAttempts, semSessao);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startWhatsAppAgent().catch(err => addLog('CONEXAO', `Erro ao reconectar: ${err.message}`));
  }, delay);
}

async function startWhatsAppAgent() {
  if (!fs.existsSync(FOTOS_DIR)) fs.mkdirSync(FOTOS_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {}

  sock = makeWASocket({ ...(version ? { version } : {}), auth: state, logger, printQRInTerminal: false, syncFullHistory: false, markOnlineOnConnect: false });
  const current = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async update => {
    if (current !== sock) return;
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      latestQrCode = qr;
      connectionStatus = 'AGUARDANDO_QR_CODE';
      console.log('\n📱 ESCANEIE O QR CODE (ou abra o painel e faça login):');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'close') {
      latestQrCode = null;
      connectionStatus = 'DESCONECTADO';
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      addLog('CONEXAO', `Conexão encerrada (código ${statusCode}).${loggedOut ? ' Sessão encerrada no celular.' : ' Reconectando...'}`);
      if (loggedOut) {
        try {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        } catch {}
        addLog('CONEXAO', 'Sessão apagada. Um novo QR Code será gerado.');
        reconnectAttempts = 0;
      }
      if (statusCode === DisconnectReason.restartRequired) addLog('CONEXAO', 'QR Code lido! Terminando de conectar...');
      scheduleReconnect(statusCode);
    } else if (connection === 'open') {
      latestQrCode = null;
      connectionStatus = 'CONECTADO';
      connectedAt = Date.now();
      reconnectAttempts = 0;
      addLog('CONEXAO', '✅ Conectada ao WhatsApp.');
      contacts.markKnown(sock.user?.id, sock.user?.lid);
      await refreshGroups();
      addLog('GRUPOS', `${connectedGroups.length} grupos na conta.`);
    }
  });

  // Histórico e agenda -> todos viram contatos conhecidos
  // Busca inteligente: anúncios do histórico (pareamento e pedidos de histórico)
  sock.ev.on('messaging-history.set', ({ messages }) => {
    processarHistorico(messages).catch(err => addLog('ERRO', `Histórico: ${err.message}`));
  });

  sock.ev.on('messaging-history.set', ({ chats, contacts: cts, messages }) => {
    for (const c of chats || []) if (c.id && !c.id.endsWith('@g.us') && c.id !== 'status@broadcast') contacts.markKnown(c.id, c.pnJid, c.lidJid);
    for (const c of cts || []) {
      contacts.upsertContact({ ...c, agenda: Boolean(c.name) });
      contacts.markKnown(c.id, c.lid, c.phoneNumber);
    }
    for (const m of messages || []) {
      const j = m.key?.remoteJid;
      if (j && !j.endsWith('@g.us') && j !== 'status@broadcast') contacts.markKnown(j, m.key.remoteJidAlt);
    }
  });
  sock.ev.on('chats.upsert', chats => {
    for (const c of chats || []) if (c.id && !c.id.endsWith('@g.us') && c.id !== 'status@broadcast' && c.conversationTimestamp) contacts.markKnown(c.id);
  });
  const onContacts = list => {
    for (const c of list || []) {
      contacts.upsertContact({ ...c, agenda: Boolean(c.name) });
      if (c.name) contacts.markKnown(c.id, c.lid, c.phoneNumber); // salvo na agenda = conhecido
    }
  };
  sock.ev.on('contacts.upsert', onContacts);
  sock.ev.on('contacts.update', onContacts);
  sock.ev.on('groups.upsert', () => refreshGroups());

  sock.ev.on('call', async calls => {
    await handleIncomingCalls(sock, calls, addLog, { resolvePhone: j => resolvePhone(j), onEvent: () => metrics.inc('ligacoes_perdidas') });
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const msg of messages) {
      try {
        if (msg.key && !msg.message && msg.key.fromMe && !String(msg.key.remoteJid || '').endsWith('@g.us') && msg.messageStubType === 2) {
          addLog('ASSISTENTE', 'Recebi uma mensagem sua que ainda não consegui ler (aparelho recém-conectado). Se for comando, mande de novo em 1 minuto.');
        }
        if (!msg.message || !msg.key) continue;
        const remoteJid = msg.key.remoteJid || '';
        if (!remoteJid || remoteJid === 'status@broadcast' || remoteJid.endsWith('@newsletter') || remoteJid.endsWith('@broadcast')) continue;
        if (msg.key.id && sentByBot.has(msg.key.id)) continue;
        const isGroup = remoteJid.endsWith('@g.us');

        // Mensagens suas (de qualquer aparelho) ensinam quem você já conhece
        if (msg.key.fromMe && !isGroup) contacts.markKnown(remoteJid, msg.key.remoteJidAlt);
        // Comando seu no "Mensagem para mim" que chega marcado como "append" (entregue com atraso) ainda vale se for recente
        const recente = Number(msg.messageTimestamp || 0) * 1000 > Date.now() - 120000;
        const comandoAtrasado = type === 'append' && msg.key.fromMe && !isGroup && recente;
        if (type !== 'notify' && !comandoAtrasado) {
          if (msg.key.fromMe && !isGroup && COMANDO_DIAG.test(extractText(msg).trim())) addLog('ASSISTENTE', `Comando "${extractText(msg).trim()}" chegou como mensagem antiga (${type}) e foi ignorado. Mande de novo.`);
          continue;
        }
        if (msg.key.id) {
          if (processedIds.has(msg.key.id)) continue;
          remember(processedIds, msg.key.id);
        }

        const ownerChat = !isGroup && (await isOwnerChatAsync(msg));
        if (ownerChat && loadSettings().assistenteAtivo === false && COMANDO_DIAG.test(extractText(msg).trim())) addLog('ASSISTENTE', 'Comando recebido, mas a assistente está DESLIGADA em Ajustes.');
        if (!ownerChat && msg.key.fromMe && !isGroup && COMANDO_DIAG.test(extractText(msg).trim())) {
          addLog('ASSISTENTE', `Comando "${extractText(msg).trim()}" num chat que não reconheci como "Mensagem para mim" (${contacts.isLid(remoteJid) ? 'código interno' : 'número ' + contacts.keyOf(remoteJid)}; eu sou ${selfPhone() || '?'}).`);
        }
        if (comandoAtrasado && !ownerChat) continue;
        if (ownerChat && loadSettings().assistenteAtivo !== false) {
          if (msg.message.documentMessage || msg.message.documentWithCaptionMessage) {
            try {
              const r = await importarConversaExportada(msg);
              if (r) {
                await sendText(remoteJid, `${assistant.BOT} 📥 Conversa "${r.grupo}" lida: ${r.lidas} mensagens, *${r.anuncios} anúncios* guardados para a *busca*.`);
                continue;
              }
            } catch (err) {
              await sendText(remoteJid, `${assistant.BOT} Não consegui ler o arquivo: ${err.message}`);
              continue;
            }
          }
          const text = extractText(msg);
          if (text.startsWith(assistant.BOT) || /^(🚨|✅ \*ENVIEI|🤔 \*CONFIRA|📊 \*RESUMO|🔔|💾|⛏️|🎯 \*QUEM PROCURA)/.test(text)) continue;
          const hasImage = Boolean(msg.message.imageMessage || msg.message.ephemeralMessage?.message?.imageMessage);
          await assistant.handleOwnerMessage(
            { sendText, sendImage, sendPdf },
            { chatJid: remoteJid, text, hasImage, downloadImage: () => downloadImageToFotos(msg) },
            { approveAlert, oferecerImovel, log: addLog, sendBackup, importarHistorico: onFim => importarHistoricoGrupos({ onFim }), estadoImportacao, listarGrupos: () => connectedGroups }
          );
          continue;
        }

        if (!isGroup) {
          await handlePrivateDailyMessage(sock, msg, addLog, {
            connectedAt,
            resolvePhone: j => resolvePhone(j),
            onEvent: () => metrics.inc('novas_conversas'),
            onPrivateText: async (jid, alt, text) => {
              const tel = await resolvePhone(jid, alt);
              if (!tel || !prospeccao.handleReply(tel, text)) return false;
              await sendText(jid, 'Tudo certo, não envio mais mensagens desse tipo. Obrigado!');
              addLog('PROSPECCAO', `🚫 ${tel} pediu para sair da prospecção.`);
              return true;
            }
          });
          continue;
        }

        anotarAncora(msg);
        guardarAnuncioDoGrupo(msg).catch(err => addLog('ERRO', `Memória de anúncios: ${err.message}`));
        if (msg.key.fromMe) continue;
        await handleGroupMessage(msg, remoteJid);
      } catch (err) {
        addLog('ERRO', `Erro ao processar mensagem: ${err.message}`);
      }
    }
  });
}

/** Desconecta e apaga a sessão (gera novo QR Code) */
async function resetSession() {
  try {
    if (sock) await sock.logout();
  } catch {}
  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  } catch {}
  connectionStatus = 'DESCONECTADO';
  scheduleReconnect();
}

function getAgentState() {
  const s = loadSettings();
  const vit = require('./vitrine').getState().config.grupos;
  return {
    connectionStatus,
    latestQrCode,
    connectedSince: connectedAt || null,
    self: sock && sock.user ? { phone: selfPhone(), name: sock.user.name || '' } : null,
    connectedGroups: connectedGroups.map(g => ({ ...g, monitored: shouldMonitorGroup(g.id, g.subject), vitrine: vit.includes(g.id) })),
    gruposMonitoradosIds: s.gruposMonitoradosIds || [],
    activityLogs
  };
}

const api = { isConnected, sendText, sendImage, sendPdf, sendDocument, checkNumber, sendOwnerWhatsAppAlert, sendOwnerDocument, sendBackup };

module.exports = {
  startWhatsAppAgent,
  getAgentState,
  addLog,
  sendOwnerWhatsAppAlert,
  shouldMonitorGroup,
  refreshGroups,
  resetSession,
  approveAlert,
  oferecerImovel,
  api,
  importarHistoricoGrupos,
  estadoImportacao,
  _test: { brazilVariants, isOwnerChat, isOwnerChatAsync, reconnectDelay, processarHistorico, guardarAnuncioDoGrupo }
};
