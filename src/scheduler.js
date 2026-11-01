/**
 * AGENDADOR: roda a cada 15 s e cuida da Vitrine, da fila de Prospecção e do
 * Resumo diário enviado no seu WhatsApp. Fuso: America/Sao_Paulo.
 */
const { loadSettings } = require('./settings');
const { loadInventory } = require('./sheets');
const { nowParts, hhmmToMinutes } = require('./timeutil');
const vitrine = require('./vitrine');
const prospeccao = require('./prospeccao');
const radar = require('./radar');
const metrics = require('./metrics');
const { readJson, writeJson } = require('./store');
const garimpo = require('./garimpo');

let timer = null;
let ticking = false;

function buildDailySummary() {
  const now = nowParts();
  const startOfDay = Date.now() - now.minutes * 60000;
  const hoje = radar.since(startOfDay);
  const m = metrics.getDay();
  const aviso = hoje.filter(h => h.decision === 'AVISAR');
  const d = radar.demand(7);
  const lines = [
    `📊 *RESUMO DO DIA — BIGA* (${now.date.split('-').reverse().join('/')})`,
    '',
    `🔎 Pedidos lidos nos grupos: *${hoje.length}*`,
    `✅ Imóveis enviados a parceiros: *${m.ofertas_enviadas || 0}*`,
    `🤔 Para você conferir: *${aviso.length}*${aviso.length ? ` (${aviso.slice(0, 8).map(a => a.code).join(', ')})` : ''}`,
    `🟢 Novas conversas atendidas: *${m.novas_conversas || 0}*`,
    `📞 Ligações não atendidas respondidas: *${m.ligacoes_perdidas || 0}*`,
    `📣 Prospecção enviada hoje: *${prospeccao.getState().enviadosHoje}*`,
    `⛏️ Leads do Garimpo hoje: *${m.garimpo_leads || 0}*`
  ];
  if (d.locais.length) lines.push('', `📍 Mais pedidos na semana: ${d.locais.slice(0, 5).map(x => `${x.nome} (${x.qtd})`).join(', ')}`);
  if (d.tipos.length) lines.push(`🏠 Tipos: ${d.tipos.slice(0, 4).map(x => `${x.nome} (${x.qtd})`).join(', ')}`);
  lines.push('', 'Responda *buscas* para ver os pedidos ou *ajuda* para os comandos.');
  return lines.join('\n');
}

async function dailySummaryTick(wa) {
  const s = loadSettings();
  if (!s.resumoDiarioAtivo || !wa.isConnected()) return;
  const target = hhmmToMinutes(s.resumoDiarioHorario || '19:00');
  const now = nowParts();
  const st = readJson('agendador.json', {});
  if (target === null || st.resumoEnviadoEm === now.date || now.minutes < target || now.minutes > target + 15) return;
  writeJson('agendador.json', { ...st, resumoEnviadoEm: now.date });
  await wa.sendOwnerWhatsAppAlert(buildDailySummary());
}

/** Domingo, a partir das 07:00: manda o backup da memória para o seu WhatsApp */
async function weeklyBackupTick(wa, log) {
  const s = loadSettings();
  if (s.backupSemanalAtivo === false || !wa.isConnected() || !wa.sendBackup) return;
  const now = nowParts();
  const st = readJson('agendador.json', {});
  if (now.weekday !== 0 || now.minutes < 7 * 60 || st.backupEnviadoEm === now.date) return;
  writeJson('agendador.json', { ...st, backupEnviadoEm: now.date });
  const r = await wa.sendBackup();
  log('BACKUP', r.ok ? '💾 Backup semanal enviado para o seu WhatsApp.' : `Backup semanal não enviado: ${r.error}`);
}

/** Alerta no seu WhatsApp quando o Garimpo acha leads novos */
function alertLeads(wa) {
  return async leads => {
    metrics.inc('garimpo_leads', leads.length);
    if (!garimpo.getState().config.alertarNoWhatsApp || !wa.isConnected()) return;
    const top = [...leads].sort((a, b) => b.score - a.score).slice(0, 5);
    const lines = top.map(l => `• *${l.score}* ${l.fonte === 'web' ? '🌐' : l.fonte === 'instagram' ? '📸' : '📘'} ${l.resumo || l.titulo}${l.matches && l.matches.length ? ` → você tem #${l.matches.join(', #')}` : ''}\n  ${l.link}`);
    await wa.sendOwnerWhatsAppAlert(`⛏️ *GARIMPO DA BIGA* — ${leads.length} novo(s) lead(s)\n\n${lines.join('\n\n')}\n\nVeja todos no painel › Garimpo.`);
  };
}

function start(wa, log) {
  if (timer) return;
  timer = setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try {
      if (!loadSettings().pausado) {
        await vitrine.tick(wa, () => loadInventory(), log).catch(e => log('VITRINE', `erro: ${e.message}`));
        await prospeccao.tick(wa, log).catch(e => log('PROSPECCAO', `erro: ${e.message}`));
        await garimpo
          .tick({ inventory: await loadInventory(), extraPlaces: loadSettings().extraPlaces, onLeads: alertLeads(wa) })
          .then(r => r && log('GARIMPO', `⛏️ Varredura: ${r.novos || 0} lead(s) novo(s)${r.semChave && r.semChave.length ? ` · falta configurar: ${r.semChave.join(', ')}` : ''}`))
          .catch(e => log('GARIMPO', `erro: ${e.message}`));
      }
      await dailySummaryTick(wa).catch(e => log('RESUMO', `erro: ${e.message}`));
      await weeklyBackupTick(wa, log).catch(e => log('BACKUP', `erro: ${e.message}`));
    } finally {
      ticking = false;
    }
  }, 15000);
  if (timer.unref) timer.unref();
}

function stop() {
  clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, buildDailySummary, weeklyBackupTick, alertLeads };
