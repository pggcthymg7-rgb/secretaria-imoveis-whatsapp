/**
 * ============================================================================
 * PROSPECÇÃO AUTOMÁTICA
 * ============================================================================
 * Você escolhe os contatos e a mensagem (com ou sem imagem); a secretária envia
 * um por vez, com intervalo aleatório, dentro do horário comercial e com limite
 * diário — o ritmo de uma pessoa, para proteger seu número de bloqueio.
 * Quem responder SAIR / PARAR nunca mais recebe prospecção.
 *
 * Variáveis na mensagem: {nome}, {saudacao}. Variações: {Olá|Oi|Tudo bem} (sorteia uma).
 * ============================================================================
 */
const crypto = require('crypto');
const { readJson, writeJson } = require('./store');
const { nowParts, hhmmToMinutes } = require('./timeutil');
const { getGreetingByTime } = require('./matcher');

const FILE = 'prospeccao.json';
const DEFAULT_CONFIG = {
  intervaloMinSeg: 60,
  intervaloMaxSeg: 180,
  limiteDiario: 40,
  horaInicio: '08:30',
  horaFim: '19:30',
  diasSemana: [1, 2, 3, 4, 5, 6],
  rodapeSair: true
};

let state = readJson(FILE, () => ({ campanhas: [], optout: [], enviosPorDia: {}, proximoEnvioEm: 0, config: DEFAULT_CONFIG }));
state.campanhas = Array.isArray(state.campanhas) ? state.campanhas : [];
state.optout = Array.isArray(state.optout) ? state.optout : [];
state.enviosPorDia = state.enviosPorDia || {};
state.config = { ...DEFAULT_CONFIG, ...(state.config || {}) };
let busy = false;

function save() {
  const days = Object.keys(state.enviosPorDia).sort();
  while (days.length > 30) delete state.enviosPorDia[days.shift()];
  writeJson(FILE, state);
}

function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d.length >= 12 && d.length <= 13 ? d : '';
}

function parseContactsInput(text) {
  // aceita "Nome;telefone", "telefone,Nome", "telefone" — um por linha
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    if (!l) continue;
    const phoneMatch = l.match(/\+?\(?\d[\d\s().-]{8,}\d/);
    if (!phoneMatch) continue;
    const telefone = normalizePhone(phoneMatch[0]);
    if (!telefone) continue;
    const nome = l.replace(phoneMatch[0], '').replace(/[;,|\t()+]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    out.push({ telefone, nome });
  }
  return out;
}

function spin(text) {
  return String(text).replace(/\{([^{}]*\|[^{}]*)\}/g, (_, opts) => {
    const list = opts.split('|');
    return list[Math.floor(Math.random() * list.length)];
  });
}

function renderMessage(template, contato, withFooter) {
  const nome = (contato.nome || '').split(/\s+/)[0] || '';
  let msg = spin(template)
    .replace(/\{saudacao\}/gi, getGreetingByTime())
    .replace(/\{nome\}/gi, nome)
    .replace(/\s+,/g, ',')
    .replace(/ {2,}/g, ' ')
    .trim();
  if (withFooter) msg += '\n\n_Se não quiser receber mais mensagens como esta, responda SAIR._';
  return msg;
}

function createCampaign({ nome, mensagem, imagem, contatos }) {
  const msg = String(mensagem || '').trim();
  if (!msg) throw Object.assign(new Error('Escreva a mensagem da campanha.'), { status: 400 });
  const unique = new Map();
  for (const c of Array.isArray(contatos) ? contatos : []) {
    const tel = normalizePhone(c.telefone);
    if (tel && !unique.has(tel)) unique.set(tel, { telefone: tel, nome: String(c.nome || '').slice(0, 60) });
  }
  if (!unique.size) throw Object.assign(new Error('Selecione pelo menos um contato com telefone válido.'), { status: 400 });
  if (unique.size > 1000) throw Object.assign(new Error('Máximo de 1000 contatos por campanha.'), { status: 400 });
  const camp = {
    id: crypto.randomBytes(5).toString('hex'),
    nome: String(nome || 'Campanha').slice(0, 80),
    mensagem: msg.slice(0, 3000),
    imagem: imagem ? String(imagem).slice(0, 600) : '',
    status: 'RASCUNHO',
    criadaEm: new Date().toISOString(),
    contatos: [...unique.values()].map(c => ({ ...c, status: state.optout.includes(c.telefone) ? 'SAIU' : 'PENDENTE' }))
  };
  state.campanhas.unshift(camp);
  save();
  return camp;
}

function setCampaignStatus(id, status) {
  const c = state.campanhas.find(x => x.id === id);
  if (!c) throw Object.assign(new Error('Campanha não encontrada.'), { status: 404 });
  if (!['ATIVA', 'PAUSADA', 'CANCELADA'].includes(status)) throw Object.assign(new Error('Status inválido.'), { status: 400 });
  c.status = status;
  save();
  return c;
}

function deleteCampaign(id) {
  state.campanhas = state.campanhas.filter(c => c.id !== id);
  save();
}

function updateConfig(input = {}) {
  const c = { ...state.config };
  const num = (v, min, max, def) => Math.min(max, Math.max(min, parseInt(v, 10) || def));
  if (input.intervaloMinSeg !== undefined) c.intervaloMinSeg = num(input.intervaloMinSeg, 20, 3600, 60);
  if (input.intervaloMaxSeg !== undefined) c.intervaloMaxSeg = num(input.intervaloMaxSeg, c.intervaloMinSeg, 7200, 180);
  if (input.limiteDiario !== undefined) c.limiteDiario = num(input.limiteDiario, 1, 300, 40);
  if (input.horaInicio && hhmmToMinutes(input.horaInicio) !== null) c.horaInicio = input.horaInicio;
  if (input.horaFim && hhmmToMinutes(input.horaFim) !== null) c.horaFim = input.horaFim;
  if (Array.isArray(input.diasSemana)) c.diasSemana = input.diasSemana.map(Number).filter(d => d >= 0 && d <= 6);
  if (input.rodapeSair !== undefined) c.rodapeSair = Boolean(input.rodapeSair);
  state.config = c;
  save();
  return c;
}

/** Trata respostas "SAIR" no privado. Retorna true se era um descadastro. */
function handleReply(phone, text) {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (!/^(sair|parar|pare|stop|descadastrar|nao quero mais|remover)[.!]*$/.test(t)) return false;
  const tel = normalizePhone(phone);
  // só conta como descadastro se essa pessoa recebeu prospecção
  const received = tel && state.campanhas.some(c => c.contatos.some(x => x.telefone === tel && x.status === 'ENVIADO'));
  if (!received) return false;
  if (!state.optout.includes(tel)) state.optout.push(tel);
  for (const c of state.campanhas) for (const x of c.contatos) if (x.telefone === tel && x.status === 'PENDENTE') x.status = 'SAIU';
  save();
  return true;
}

function sentToday() {
  return state.enviosPorDia[nowParts().date] || 0;
}

function withinWindow() {
  const now = nowParts();
  const a = hhmmToMinutes(state.config.horaInicio);
  const b = hhmmToMinutes(state.config.horaFim);
  return state.config.diasSemana.includes(now.weekday) && now.minutes >= a && now.minutes <= b;
}

/**
 * Envia (no máximo) 1 mensagem por chamada, respeitando intervalo/limite/horário.
 * `wa` = { isConnected, checkNumber(tel)->jid|null, sendText(jid,text), sendImage(jid,ref,caption) }
 */
async function tick(wa, log = console.log) {
  if (busy) return;
  if (Date.now() < (state.proximoEnvioEm || 0)) return;
  const camp = state.campanhas.find(c => c.status === 'ATIVA' && c.contatos.some(x => x.status === 'PENDENTE'));
  if (!camp) return;
  if (!wa.isConnected() || !withinWindow() || sentToday() >= state.config.limiteDiario) return;

  busy = true;
  try {
    const contato = camp.contatos.find(x => x.status === 'PENDENTE');
    if (state.optout.includes(contato.telefone)) {
      contato.status = 'SAIU';
      return;
    }
    const jid = await wa.checkNumber(contato.telefone);
    if (!jid) {
      contato.status = 'FALHA';
      contato.erro = 'número sem WhatsApp';
    } else {
      const text = renderMessage(camp.mensagem, contato, state.config.rodapeSair);
      try {
        if (camp.imagem) await wa.sendImage(jid, camp.imagem, text);
        else await wa.sendText(jid, text);
        contato.status = 'ENVIADO';
        contato.ts = Date.now();
        const d = nowParts().date;
        state.enviosPorDia[d] = (state.enviosPorDia[d] || 0) + 1;
        log('PROSPECCAO', `📣 "${camp.nome}" enviada para ${contato.nome || contato.telefone}.`);
      } catch (err) {
        contato.status = 'FALHA';
        contato.erro = err.message;
      }
    }
    if (!camp.contatos.some(x => x.status === 'PENDENTE')) {
      camp.status = 'CONCLUIDA';
      log('PROSPECCAO', `✅ Campanha "${camp.nome}" concluída.`);
    }
    const { intervaloMinSeg: a, intervaloMaxSeg: b } = state.config;
    state.proximoEnvioEm = Date.now() + (a + Math.random() * (b - a)) * 1000;
  } finally {
    busy = false;
    save();
  }
}

function summary(c) {
  const count = s => c.contatos.filter(x => x.status === s).length;
  return { id: c.id, nome: c.nome, status: c.status, criadaEm: c.criadaEm, mensagem: c.mensagem, imagem: c.imagem, total: c.contatos.length, enviados: count('ENVIADO'), pendentes: count('PENDENTE'), falhas: count('FALHA'), sairam: count('SAIU') };
}

function getState() {
  return {
    config: state.config,
    campanhas: state.campanhas.map(summary),
    optoutCount: state.optout.length,
    enviadosHoje: sentToday(),
    proximoEnvioEm: state.proximoEnvioEm || 0,
    dentroDoHorario: withinWindow()
  };
}

function getCampaign(id) {
  return state.campanhas.find(c => c.id === id) || null;
}

module.exports = {
  normalizePhone,
  parseContactsInput,
  renderMessage,
  createCampaign,
  setCampaignStatus,
  deleteCampaign,
  updateConfig,
  handleReply,
  tick,
  getState,
  getCampaign
};
