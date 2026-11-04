/**
 * ============================================================================
 * VITRINE AGENDADA
 * ============================================================================
 * Em até 4 horários por dia a secretária publica imóveis da carteira em grupos de
 * divulgação escolhidos (diferentes dos grupos de busca). Cada imóvel tem um POST
 * (1 foto + texto) que você APROVA antes; só posts aprovados são enviados.
 * Rodízio: sempre sai o post aprovado que está há mais tempo sem ser enviado.
 * ============================================================================
 */
const { readJson, writeJson } = require('./store');
const { nowParts, hhmmToMinutes } = require('./timeutil');
const { describeProperty, formatPriceLabel } = require('./matcher');

const FILE = 'vitrine.json';
const DEFAULT = {
  config: {
    ativo: false,
    horarios: ['08:30', '11:30', '15:00', '18:30'],
    grupos: [],
    porHorario: 1,
    diasSemana: [1, 2, 3, 4, 5, 6],
    intervaloGruposSeg: [25, 70]
  },
  posts: {},
  historico: [],
  executados: {}
};

let state = { ...DEFAULT, ...readJson(FILE, {}) };
state.config = { ...DEFAULT.config, ...(state.config || {}) };
let running = false;

function save() {
  // mantém só os últimos 14 dias de execuções e 300 envios no histórico
  const keys = Object.keys(state.executados).sort();
  while (keys.length > 60) delete state.executados[keys.shift()];
  if (state.historico.length > 300) state.historico.length = 300;
  writeJson(FILE, state);
}

function getState() {
  return state;
}

function sanitizeConfig(input = {}) {
  const c = { ...state.config };
  if (input.ativo !== undefined) c.ativo = Boolean(input.ativo);
  if (Array.isArray(input.horarios)) {
    c.horarios = [...new Set(input.horarios.map(h => String(h).trim()).filter(h => hhmmToMinutes(h) !== null))].sort().slice(0, 6);
  }
  if (Array.isArray(input.grupos)) c.grupos = [...new Set(input.grupos.map(String).filter(g => /@g\.us$/.test(g)))].slice(0, 50);
  if (input.porHorario !== undefined) c.porHorario = Math.min(5, Math.max(1, parseInt(input.porHorario, 10) || 1));
  if (Array.isArray(input.diasSemana)) c.diasSemana = input.diasSemana.map(Number).filter(d => d >= 0 && d <= 6);
  return c;
}

function updateConfig(input) {
  state.config = sanitizeConfig(input);
  save();
  return state.config;
}

/** Texto de divulgação padrão (sem saudação pessoal — vai para grupo) */
function defaultPostText(prop) {
  const desc = String(prop.descricao || '').split(/(?<=[.!])\s/)[0].slice(0, 220);
  return [
    describeProperty(prop),
    desc ? `✨ ${desc}` : '',
    `💰 *${formatPriceLabel(prop)}*`,
    '',
    '📲 Interessados ou corretores parceiros, me chamem no privado!'
  ].filter((l, i) => l !== '' || i > 2).join('\n').trim();
}

// só vale post PRÓPRIO do objeto: com id "__proto__" ou "constructor" o código antigo mexia em Object.prototype
const temPost = id => Object.prototype.hasOwnProperty.call(state.posts, id);

function upsertPost(prop, { texto, foto, status } = {}) {
  const prev = (temPost(prop.id) && state.posts[prop.id]) || {};
  const fotoFinal = foto !== undefined ? foto : prev.foto || (prop.fotos || [])[0] || '';
  const changedContent = (texto !== undefined && texto !== prev.texto) || (foto !== undefined && foto !== prev.foto);
  state.posts[prop.id] = {
    texto: String(texto !== undefined ? texto : prev.texto || defaultPostText(prop)).slice(0, 3000),
    foto: String(fotoFinal || '').slice(0, 600),
    // conteúdo alterado volta para "pendente" até você aprovar de novo
    status: status || (changedContent && prev.status === 'APROVADO' ? 'PENDENTE' : prev.status || 'PENDENTE'),
    criadoEm: prev.criadoEm || new Date().toISOString(),
    aprovadoEm: status === 'APROVADO' ? new Date().toISOString() : prev.aprovadoEm || null,
    ultimoEnvio: prev.ultimoEnvio || null,
    envios: prev.envios || 0
  };
  save();
  return state.posts[prop.id];
}

function setStatus(propId, status) {
  const id = String(propId);
  // guarda inline (é o formato que o CodeQL reconhece): nunca nomes do protótipo e só post PRÓPRIO do objeto
  if (id === '__proto__' || id === 'constructor' || id === 'prototype' || !Object.prototype.hasOwnProperty.call(state.posts, id)) return null;
  const p = state.posts[id];
  if (!p) return null;
  p.status = status;
  if (status === 'APROVADO') p.aprovadoEm = new Date().toISOString();
  save();
  return p;
}

function removePost(propId) {
  if (temPost(propId)) delete state.posts[propId];
  save();
}

function nextPosts(inventory, n) {
  const active = new Map(inventory.filter(p => p.ativo).map(p => [String(p.id), p]));
  return Object.entries(state.posts)
    .filter(([id, p]) => p.status === 'APROVADO' && active.has(String(id)))
    .sort((a, b) => String(a[1].ultimoEnvio || '').localeCompare(String(b[1].ultimoEnvio || '')))
    .slice(0, n)
    .map(([id, post]) => ({ id, post, property: active.get(String(id)) }));
}

/**
 * Executa um horário da vitrine. `wa` = { isConnected, sendImage, sendText }
 */
async function runSlot(wa, inventory, slotLabel, log = console.log) {
  if (running) return { ok: false, error: 'já existe um envio em andamento' };
  const cfg = state.config;
  if (!cfg.grupos.length) return { ok: false, error: 'nenhum grupo de vitrine selecionado' };
  if (!wa.isConnected()) return { ok: false, error: 'WhatsApp desconectado' };
  const items = nextPosts(inventory, cfg.porHorario);
  if (!items.length) return { ok: false, error: 'nenhum post aprovado' };

  running = true;
  const result = { ok: true, enviados: 0, erros: 0, posts: items.map(i => i.id) };
  try {
    for (const { id, post } of items) {
      let okGroups = 0;
      for (let gi = 0; gi < cfg.grupos.length; gi++) {
        const gid = cfg.grupos[gi];
        try {
          if (post.foto) await wa.sendImage(gid, post.foto, post.texto);
          else await wa.sendText(gid, post.texto);
          okGroups++;
          result.enviados++;
        } catch (err) {
          result.erros++;
          log('VITRINE_ERRO', `Falha ao publicar #${id} no grupo ${gid}: ${err.message}`);
        }
        if (gi < cfg.grupos.length - 1) {
          const [a, b] = cfg.intervaloGruposSeg;
          await new Promise(r => setTimeout(r, (a + Math.random() * (b - a)) * 1000));
        }
      }
      post.ultimoEnvio = new Date().toISOString();
      post.envios = (post.envios || 0) + 1;
      state.historico.unshift({ ts: Date.now(), slot: slotLabel, propId: id, grupos: okGroups });
      log('VITRINE', `🪟 Imóvel #${id} publicado em ${okGroups}/${cfg.grupos.length} grupo(s) (${slotLabel}).`);
    }
  } finally {
    running = false;
    save();
  }
  return result;
}

/** Chamado pelo agendador a cada ~30s */
async function tick(wa, getInventory, log) {
  const cfg = state.config;
  if (!cfg.ativo || !cfg.grupos.length) return;
  const now = nowParts();
  if (!cfg.diasSemana.includes(now.weekday)) return;
  for (const h of cfg.horarios) {
    const m = hhmmToMinutes(h);
    const key = `${now.date} ${h}`;
    // janela de 10 min após o horário (se o servidor reiniciou, ainda envia)
    if (m === null || state.executados[key] || now.minutes < m || now.minutes > m + 10) continue;
    state.executados[key] = true;
    save();
    const inv = await getInventory();
    const r = await runSlot(wa, inv, h, log);
    if (!r.ok) log('VITRINE', `Horário ${h} não enviado: ${r.error}`);
  }
}

module.exports = { getState, updateConfig, upsertPost, setStatus, removePost, defaultPostText, nextPosts, runSlot, tick };
