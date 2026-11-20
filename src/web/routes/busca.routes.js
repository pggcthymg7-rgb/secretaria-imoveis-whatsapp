/**
 * Rotas de Busca Inteligente (portais + grupos + importação) e Garimpo de clientes.
 */
const express = require('express');
const multer = require('multer');

const { ah, str } = require('../helpers');
const { updateEnvFile } = require('../../config/envfile');
const { loadSettings } = require('../../config/settings');
const sheets = require('../../domain/sheets');
const anunciosMem = require('../../domain/anuncios');
const garimpo = require('../../domain/garimpo');
const scheduler = require('../../domain/scheduler');
const wa = require('../../whatsapp/client');
const { countCriteria } = require('../../brain/engine');
const buscaInt = require('../../integrations/busca/inteligente');
const bf = require('../../integrations/busca/filtros');
const geminiChave = require('../../integrations/gemini/chave');

const router = express.Router();
const conversaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024, files: 1 } });

function estadoBusca() {
  const imp = wa.estadoImportacao();
  return {
    config: buscaInt.getConfig(),
    memoria: anunciosMem.resumo(),
    importacao: imp ? { rodando: imp.rodando, anuncios: imp.anuncios, grupos: imp.grupos, comHistorico: imp.comHistorico, total: imp.total || 0, vistos: imp.vistos || 0, atual: imp.atual || '', semAncora: imp.semAncora.slice(0, 20), inicio: imp.inicio, fim: imp.fim || null } : null,
    historico: buscaInt.resumoHistorico(),
    grupos: (wa.getAgentState().connectedGroups || []).map(g => ({ id: g.id, subject: g.subject, participantsCount: g.participantsCount || 0, naBusca: buscaInt.grupoNaBusca(g.id) }))
  };
}

async function relatorioNoWhatsApp(r) {
  for (const parte of buscaInt.formatarRelatorio(r)) {
    const ok = await wa.sendOwnerWhatsAppAlert(`🤖 ${parte}`);
    if (ok && ok.ok === false) throw Object.assign(new Error(ok.error || 'WhatsApp desconectado.'), { status: 409 });
  }
}

router.get('/api/busca', (req, res) => res.json(estadoBusca()));

router.post('/api/busca', ah(async (req, res) => {
  const texto = str(req.body?.texto, 500).trim();
  // Filtros (campos iguais aos dos portais). Se vierem preenchidos, valem eles; o texto livre, se houver, entra como "mais detalhes".
  const bruto = {};
  for (const k of ['tipo', 'negocio', 'cidade', 'bairro', 'local', 'valorMin', 'valorMax', 'quartos', 'suites', 'vagas', 'areaMin', 'areaMax', 'extras']) {
    const v = req.body?.filtros?.[k];
    if (typeof v === 'string' || typeof v === 'number') bruto[k] = String(v);
  }
  const { filtros: normalizados, erros: errosFiltros } = bf.normalizarFiltros(bruto);
  if (errosFiltros.length) return res.status(400).json({ error: errosFiltros.join(' ') });
  let r;
  if (bf.preenchidos(normalizados)) {
    if (texto) bruto.extras = [bruto.extras, texto].filter(Boolean).join(', ').slice(0, 200);
    r = await buscaInt.buscarComFiltros(bruto);
  } else {
    if (texto.length < 8) return res.status(400).json({ error: 'Preencha os filtros (cidade, bairro, valor…) ou escreva o pedido do cliente (ex.: apto 800 mil a 1 milhão no Setor Marista).' });
    if (countCriteria(buscaInt.entenderPedido(texto).criterios) < 2) return res.status(400).json({ error: 'Preciso de mais detalhes: tipo, bairro, preço ou metragem.' });
    r = await buscaInt.buscar(texto);
  }
  wa.addLog('BUSCA', `🔎 Busca nº ${r.id} (painel): ${r.descricao} — ${r.grupos.length} nos grupos, ${r.portais.itens.length} nos portais.`);
  if (req.body?.whatsapp) await relatorioNoWhatsApp(r).catch(() => {});
  res.json({ ok: true, busca: r, estado: estadoBusca() });
}));

router.get('/api/busca/item/:id', (req, res) => {
  const r = buscaInt.getBusca(req.params.id);
  if (!r) return res.status(404).json({ error: 'Busca não encontrada.' });
  res.json(r);
});

router.post('/api/busca/item/:id/whatsapp', ah(async (req, res) => {
  const r = buscaInt.getBusca(req.params.id);
  if (!r) return res.status(404).json({ error: 'Busca não encontrada.' });
  await relatorioNoWhatsApp(r);
  res.json({ ok: true });
}));

router.post('/api/busca/config', ah(async (req, res) => {
  const b = req.body || {};
  let chaveMsg = null;
  if (typeof b.geminiApiKey === 'string' && b.geminiApiKey.trim()) {
    const v = await geminiChave.validarChave(b.geminiApiKey);
    if (!v.ok) return res.status(400).json({ error: v.mensagem });
    updateEnvFile({ GEMINI_API_KEY: v.chave });
    chaveMsg = v.mensagem;
  }
  res.json({ ok: true, chaveMsg, config: buscaInt.atualizarConfig(b), estado: estadoBusca() });
}));

router.post('/api/busca/testar-chave', ah(async (req, res) => {
  res.json(await geminiChave.testarChaveSalva());
}));

router.post('/api/busca/diagnostico', ah(async (req, res) => {
  res.json(await geminiChave.diagnosticarSalva());
}));

router.post('/api/busca/importar-historico', ah(async (req, res) => {
  await wa.importarHistoricoGrupos({
    onFim: e => wa.sendOwnerWhatsAppAlert(`🤖 📥 *Histórico importado*\n${e.anuncios} anúncios de ${e.comHistorico} de ${e.grupos} grupos.`).catch(() => {})
  });
  res.json({ ok: true, estado: estadoBusca() });
}));

router.post('/api/busca/importar-conversa', (req, res) => {
  conversaUpload.single('arquivo')(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo grande demais (máximo 40 MB).' : 'Envio inválido.' });
    if (!req.file || !/\.(txt|zip)$/i.test(req.file.originalname || '')) return res.status(400).json({ error: 'Envie a conversa exportada (.txt ou .zip).' });
    try {
      // o navegador manda o nome em UTF-8, mas o multer lê como latin1 ("PadrÃ£o")
      let nome = String(req.file.originalname || '');
      const utf8 = Buffer.from(nome, 'latin1').toString('utf8');
      if (!utf8.includes('\uFFFD')) nome = utf8;
      const r = anunciosMem.importarExportacao(req.file.buffer, nome);
      wa.addLog('BUSCA', `📥 Conversa exportada "${r.grupo}" (painel): ${r.anuncios} anúncios de ${r.lidas} mensagens.`);
      res.json({ ok: true, ...r, estado: estadoBusca() });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
});

router.get('/api/garimpo', (req, res) => res.json(garimpo.getState()));
router.post('/api/garimpo/config', (req, res) => res.json({ ok: true, config: garimpo.updateConfig(req.body || {}) }));

router.post('/api/garimpo/chaves', (req, res) => {
  const b = req.body || {};
  const map = { braveKey: 'BRAVE_API_KEY', googleKey: 'GOOGLE_CSE_KEY', googleCx: 'GOOGLE_CSE_CX', metaToken: 'META_PAGE_TOKEN', metaPageId: 'META_PAGE_ID', igUserId: 'META_IG_USER_ID' };
  const upd = {};
  for (const [k, env] of Object.entries(map)) if (typeof b[k] === 'string' && b[k].trim()) upd[env] = b[k].trim().slice(0, 400);
  for (const k of ['META_PAGE_ID', 'META_IG_USER_ID', 'GOOGLE_CSE_CX']) if (upd[k] && !/^[\w:-]+$/.test(upd[k])) return res.status(400).json({ error: `Valor inválido para ${k}.` });
  updateEnvFile(upd);
  res.json({ ok: true, state: garimpo.getState() });
});

router.post('/api/garimpo/rodar', ah(async (req, res) => {
  const r = await garimpo.run({ inventory: await sheets.loadInventory(), extraPlaces: loadSettings().extraPlaces, onLeads: scheduler.alertLeads(wa.api) });
  res.json({ ...r, state: garimpo.getState() });
}));

router.post('/api/garimpo/lead/:id', (req, res) => {
  garimpo.setLeadStatus(String(req.params.id), String(req.body?.status || ''));
  res.json({ ok: true, state: garimpo.getState() });
});

module.exports = router;
