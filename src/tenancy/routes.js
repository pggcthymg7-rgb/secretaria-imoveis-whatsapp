/**
 * Rotas HTTP do multi-tenant. A administração da equipe é SÓ do dono da BIGA principal (João):
 *  - Painel (/api/equipe...): atrás do login do painel (auth.requireAuth + cabeçalho anti-CSRF).
 *  - API servidor-a-servidor (/api/conectar-corretor, /api/corretores...): opcional, só com
 *    ADMIN_TOKEN ≥ 32 caracteres (Bearer, comparação em tempo constante) e limite próprio.
 * Corretores da equipe não têm painel: usam a BIGA pelo WhatsApp ("Mensagem para mim").
 */
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');
const { TenantStore, validateTenantId } = require('./tenant-store');

const MIN_ADMIN_TOKEN = 32;
const digest = v => crypto.createHash('sha256').update(String(v)).digest();
const ah = fn => (req, res) => Promise.resolve(fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.status ? err.message : 'Erro interno' }));
const notFound = () => Object.assign(new Error('Corretor não encontrado.'), { status: 404 });

function requireAdmin(adminToken) {
  const expected = digest(adminToken);
  return (req, res, next) => {
    const m = /^Bearer (.+)$/i.exec(String(req.headers.authorization || ''));
    if (m && crypto.timingSafeEqual(digest(m[1].trim()), expected)) return next();
    return res.status(401).json({ error: 'Não autorizado.' });
  };
}

// ---------------------------------------------------------------------------------------------
// Casos de uso (compartilhados pelo painel e pela API)
// ---------------------------------------------------------------------------------------------
/** Cadastra/atualiza o corretor e sobe a sessão de WhatsApp dele */
async function conectarCorretor(deps, { corretorId, nome, configIA } = {}) {
  const { tenantStore, sessionManager, router } = deps;
  validateTenantId(corretorId);
  const prev = tenantStore.get(corretorId);
  const patch = configIA && typeof configIA === 'object' && !Array.isArray(configIA) ? { ...configIA } : configIA ?? {};
  if (patch && typeof patch === 'object') {
    if (prev && patch.geminiApiKey === '') delete patch.geminiApiKey; // campo vazio no painel = manter a chave atual
    if (typeof patch.meuWhatsappAlerta === 'string') patch.meuWhatsappAlerta = patch.meuWhatsappAlerta.replace(/\D/g, '');
  }
  const record = tenantStore.save(corretorId, { nome, configIA: patch });
  if (record.ativo === false) return { isNew: !prev, record, status: { status: 'PAUSADO' } };
  router.prepareTenant(corretorId);
  router.applyConfig(corretorId, patch && typeof patch === 'object' ? patch : {});
  if (!prev && typeof deps.pedirEndereco === 'function') deps.pedirEndereco(corretorId);
  const status = await sessionManager.initializeTenant(corretorId, { nome: record.nome });
  return { isNew: !prev, record, status };
}

/** Visão de um corretor para o painel (sem segredos) */
async function resumoCorretor({ tenantStore, sessionManager, router }, id) {
  const record = tenantStore.get(id);
  if (!record) return null;
  const st = record.ativo === false ? { status: 'PAUSADO', qr: null } : sessionManager.getStatus(id);
  const ag = record.ativo === false ? null : router.getAgentState(id);
  const grupos = ag?.connectedGroups || [];
  const pub = TenantStore.publicView(record);
  const painel = { url: null, codigoConvite: null };
  const d = record.ativo === false ? null : router.domains.get(id);
  if (d) {
    painel.url = d.container.env.PUBLIC_URL || null;
    const auth = d.container.require('auth');
    if (!auth.isConfigured()) painel.codigoConvite = auth.getSetupCode();
  }
  return {
    ...pub,
    painel,
    // O que está valendo de fato (inclui o que o corretor ajustou pelo WhatsApp); pausado = só o cadastro
    efetivo: (record.ativo !== false && router.efetivo(id)) || { ...pub.configIA, hasGeminiApiKey: Boolean(pub.configIA.hasGeminiApiKey) },
    whatsapp: {
      status: st.status,
      erro: st.erro || null,
      telefone: ag?.self?.phone || '',
      nomeWhatsapp: ag?.self?.name || '',
      grupos: grupos.length,
      gruposMonitorados: grupos.filter(g => g.monitored).length,
      qrSvg: st.qr ? await QRCode.toString(st.qr, { type: 'svg', margin: 1 }) : null
    }
  };
}

async function pausarCorretor({ tenantStore, sessionManager, router }, id) {
  if (!tenantStore.setAtivo(id, false)) throw notFound();
  await sessionManager.stopTenant(id);
  router.stopTenant(id);
}

async function retomarCorretor({ tenantStore, sessionManager, router }, id) {
  const rec = tenantStore.setAtivo(id, true);
  if (!rec) throw notFound();
  router.prepareTenant(id);
  await sessionManager.initializeTenant(id, { nome: rec.nome });
}

async function novoQrCorretor({ tenantStore, sessionManager, router }, id) {
  const rec = tenantStore.get(id);
  if (!rec) throw notFound();
  if (rec.ativo === false) throw Object.assign(new Error('Retome o corretor antes de gerar um novo QR Code.'), { status: 400 });
  router.prepareTenant(id);
  await sessionManager.resetTenant(id);
}

// ---------------------------------------------------------------------------------------------
// Painel do João (montar DEPOIS de auth.requireAuth)
// ---------------------------------------------------------------------------------------------
/** @param {import('express').Express} app @param {null | { tenantStore: TenantStore, sessionManager: any, router: any }} tenancy */
function mountPanelRoutes(app, tenancy) {
  const desligado = (req, res) => res.status(409).json({ error: 'Modo multi-corretor desligado neste servidor (MULTI_TENANT=1).' });
  app.get('/api/equipe', ah(async (req, res) => {
    if (!tenancy) return res.json({ multiTenant: false, corretores: [] });
    const corretores = [];
    for (const id of tenancy.tenantStore.list()) corretores.push(await resumoCorretor(tenancy, id));
    res.json({ multiTenant: true, corretores });
  }));
  if (!tenancy) {
    app.post('/api/equipe', desligado);
    app.post('/api/equipe/:id/:acao', desligado);
    return;
  }
  app.post('/api/equipe', ah(async (req, res) => {
    const { isNew, record } = await conectarCorretor(tenancy, req.body || {});
    res.status(isNew ? 201 : 200).json({ ok: true, corretor: await resumoCorretor(tenancy, record.corretorId) });
  }));
  const acoes = { pausar: pausarCorretor, retomar: retomarCorretor, 'novo-qr': novoQrCorretor };
  app.post('/api/equipe/:id/:acao', ah(async (req, res) => {
    const id = validateTenantId(req.params.id);
    const acao = Object.hasOwn(acoes, req.params.acao) ? acoes[req.params.acao] : null;
    if (!acao) return res.status(404).json({ error: 'Ação desconhecida.' });
    await acao(tenancy, id);
    res.json({ ok: true, corretor: await resumoCorretor(tenancy, id) });
  }));
}

// ---------------------------------------------------------------------------------------------
// API servidor-a-servidor (opcional, ADMIN_TOKEN) — montar ANTES do login do painel
// ---------------------------------------------------------------------------------------------
function mountTenantRoutes(app, tenancy) {
  const { tenantStore, sessionManager, adminToken } = tenancy;
  if (!adminToken) return false; // sem token: só o painel administra a equipe
  if (String(adminToken).length < MIN_ADMIN_TOKEN) {
    console.error(`⚠️ ADMIN_TOKEN com menos de ${MIN_ADMIN_TOKEN} caracteres: API de corretores DESLIGADA (o painel continua funcionando).`);
    return false;
  }
  const limiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Muitas requisições. Aguarde um minuto.' } });
  const admin = [limiter, requireAdmin(adminToken)];

  app.post('/api/conectar-corretor', ...admin, ah(async (req, res) => {
    const { isNew, record, status } = await conectarCorretor(tenancy, req.body || {});
    res.status(isNew ? 201 : 200).json({ ok: true, corretor: TenantStore.publicView(record), whatsapp: { status: status.status } });
  }));

  app.get('/api/corretores/:id/status', ...admin, ah(async (req, res) => {
    const id = validateTenantId(req.params.id);
    const record = tenantStore.get(id);
    if (!record) return res.status(404).json({ error: 'Corretor não encontrado.' });
    const st = sessionManager.getStatus(id);
    const qrDataUrl = st.qr ? await QRCode.toDataURL(st.qr, { margin: 1, width: 300 }) : null;
    res.json({ corretor: TenantStore.publicView(record), whatsapp: { status: st.status, qrDataUrl } });
  }));

  app.get('/api/corretores', ...admin, (req, res) => {
    res.json({ corretores: tenantStore.list().map(id => ({ corretorId: id, nome: tenantStore.get(id)?.nome || '', whatsapp: sessionManager.getStatus(id).status })) });
  });
  return true;
}

module.exports = { mountTenantRoutes, mountPanelRoutes, requireAdmin, conectarCorretor, resumoCorretor, MIN_ADMIN_TOKEN };
