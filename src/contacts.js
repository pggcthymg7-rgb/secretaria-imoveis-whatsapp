/**
 * ============================================================================
 * MEMÓRIA DE CONTATOS
 * ============================================================================
 * Por que a 1ª mensagem respondia todo mundo (causa raiz):
 *  1. O WhatsApp passou a identificar contatos por "LID" (ex: 206841397178375@lid)
 *     em vez do telefone. Quem já estava salvo como 5562...@s.whatsapp.net parecia
 *     "novo" quando voltava a escrever pelo LID.
 *  2. A memória só conhecia quem conversou DEPOIS que a secretária foi ligada, e no
 *     Render gratuito o disco é apagado a cada reinício — todos viravam "novos".
 *  3. A agenda do celular (contatos salvos) e o histórico de conversas não eram usados.
 *
 * Agora cada contato é guardado por TODAS as chaves conhecidas (telefone e LID),
 * contatos da agenda e do histórico sincronizado são marcados como conhecidos, e
 * existe um período de aquecimento quando a memória ainda está vazia.
 * ============================================================================
 */
const { readJson, writeJson } = require('./store');
const { KNOWN_CONTACTS_PATH } = require('./paths');

const BOOK_FILE = 'contatos.json';

const known = new Set();
const book = new Map(); // chave -> { nome, telefone, lid, agenda, visto }
let saveTimer = null;

function keyOf(jid) {
  if (!jid) return '';
  const s = String(jid);
  const user = s.split('@')[0].split(':')[0].replace(/\D/g, '');
  return user || '';
}

function isLid(jid) {
  return /@lid$/.test(String(jid || ''));
}

function phoneFromJid(jid) {
  if (!jid || isLid(jid)) return '';
  return keyOf(jid);
}

// Carrega do disco (compatível com o known_contacts.json antigo: lista de números)
(function load() {
  const saved = readJson(KNOWN_CONTACTS_PATH, []);
  if (Array.isArray(saved)) saved.forEach(k => k && known.add(String(k)));
  const savedBook = readJson(BOOK_FILE, {});
  for (const [k, v] of Object.entries(savedBook || {})) book.set(k, v);
})();

const bootKnownCount = known.size;

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      writeJson(KNOWN_CONTACTS_PATH, [...known]);
      writeJson(BOOK_FILE, Object.fromEntries(book));
    } catch (err) {
      console.error('[CONTATOS] Erro ao salvar:', err.message);
    }
  }, 1500);
  if (saveTimer.unref) saveTimer.unref();
}

function flush() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  writeJson(KNOWN_CONTACTS_PATH, [...known]);
  writeJson(BOOK_FILE, Object.fromEntries(book));
}

/** Marca como conhecido todas as chaves passadas (telefone, LID, jid alternativo) */
function markKnown(...jids) {
  let changed = false;
  for (const j of jids.flat()) {
    const k = keyOf(j);
    if (k && !known.has(k)) {
      known.add(k);
      changed = true;
    }
  }
  if (changed) scheduleSave();
}

function isKnown(...jids) {
  const keys = jids.flat().map(keyOf).filter(Boolean);
  if (!keys.length) return true; // sem identificação: trata como conhecido (não responde)
  return keys.some(k => known.has(k));
}

function forget(phoneOrJid) {
  const k = keyOf(phoneOrJid);
  if (!k) return false;
  let existed = known.delete(k);
  // remove também as chaves ligadas (LID <-> telefone)
  const entry = book.get(k);
  if (entry) {
    for (const alt of [entry.telefone, entry.lid]) if (alt && known.delete(keyOf(alt))) existed = true;
  }
  scheduleSave();
  return existed;
}

/**
 * Atualiza a agenda: contatos vindos do WhatsApp (contacts.upsert / histórico).
 * `agenda: true` quando é um contato salvo no seu celular.
 */
function upsertContact({ id, lid, phoneNumber, name, notify, agenda }) {
  const keys = [id, lid, phoneNumber].map(keyOf).filter(Boolean);
  if (!keys.length) return;
  const telefone = phoneFromJid(phoneNumber) || phoneFromJid(id);
  const lidKey = isLid(lid) ? keyOf(lid) : isLid(id) ? keyOf(id) : '';
  const main = telefone || keys[0];
  const prev = book.get(main) || {};
  const entry = {
    nome: name || prev.nome || '',
    apelido: notify || prev.apelido || '',
    telefone: telefone || prev.telefone || '',
    lid: lidKey || prev.lid || '',
    agenda: Boolean(agenda || prev.agenda || name),
    visto: prev.visto || null
  };
  book.set(main, entry);
  if (lidKey && lidKey !== main) book.set(lidKey, { ...entry, alias: main });
  scheduleSave();
}

function isInAddressBook(...jids) {
  return jids.flat().map(keyOf).filter(Boolean).some(k => {
    const e = book.get(k);
    return Boolean(e && (e.agenda || e.nome));
  });
}

function touch(jid, extra = {}) {
  const k = keyOf(jid);
  if (!k) return;
  const prev = book.get(k) || {};
  book.set(k, { ...prev, ...extra, visto: new Date().toISOString() });
  scheduleSave();
}

/** Lista para a tela de Prospecção (apenas contatos com telefone real) */
function listContacts() {
  const out = [];
  for (const [k, v] of book.entries()) {
    if (v.alias) continue;
    const tel = v.telefone || (k.length >= 10 && k.length <= 13 ? k : '');
    if (!tel) continue;
    out.push({ telefone: tel, nome: v.nome || v.apelido || '', agenda: Boolean(v.agenda), visto: v.visto || null });
  }
  return out.sort((a, b) => (a.nome || 'zzz').localeCompare(b.nome || 'zzz', 'pt-BR'));
}

function stats() {
  return { conhecidos: known.size, agenda: listContacts().filter(c => c.agenda).length, bootKnownCount };
}

module.exports = {
  keyOf,
  isLid,
  phoneFromJid,
  markKnown,
  isKnown,
  forget,
  upsertContact,
  isInAddressBook,
  touch,
  listContacts,
  stats,
  flush,
  bootKnownCount
};
