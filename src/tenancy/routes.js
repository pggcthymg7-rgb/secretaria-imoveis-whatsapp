/**
 * Rotas HTTP do multi-tenant (administração, servidor-a-servidor).
 * Protegidas por ADMIN_TOKEN (Authorization: Bearer <token>, comparação em tempo constante)
 * e limite próprio de requisições. Montadas ANTES do login do painel (que é por corretor).
 */
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');
const { TenantStore, validateTenantId } = require('./tenant-store');

const MIN_ADMIN_TOKEN = 32;
const digest = v => crypto.createHash('sha256').update(String(v)).digest();

function requireAdmin(adminToken) {
  const expected = digest(adminToken);
  return (req, res, next) => {
    const m = /^Bearer (.+)$/i.exec(String(req.headers.authorization || ''));
    if (m && crypto.timingSafeEqual(digest(m[1].trim()), expected)) return next();
    return res.status(401).json({ error: 'Não autorizado.' });
  };
}

/**
 * @param {import('express').Express} app
 * @param {{ tenantStore: TenantStore, sessionManager: any, router: any, adminToken: string }} deps
 */
function mountTenantRoutes(app, { tenantStore, sessionManager, router, adminToken }) {
  if (!adminToken || String(adminToken).length < MIN_ADMIN_TOKEN) {
    console.error(`⚠️ MULTI_TENANT ativo sem ADMIN_TOKEN (mín. ${MIN_ADMIN_TOKEN} caracteres): rotas de corretores DESLIGADAS.`);
    return false;
  }
  const limiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Muitas requisições. Aguarde um minuto.' } });
  const admin = [limiter, requireAdmin(adminToken)];
  const ah = fn => (req, res) => Promise.resolve(fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.status ? err.message : 'Erro interno' }));

  // Cadastra/atualiza o corretor e sobe a sessão de WhatsApp dele
  app.post('/api/conectar-corretor', ...admin, ah(async (req, res) => {
    const { corretorId, nome, configIA } = req.body || {};
    validateTenantId(corretorId);
    const isNew = !tenantStore.get(corretorId);
    const record = tenantStore.save(corretorId, { nome, configIA: configIA ?? {} });
    router.prepareTenant(corretorId);
    const status = await sessionManager.initializeTenant(corretorId, { nome: record.nome });
    res.status(isNew ? 201 : 200).json({ ok: true, corretor: TenantStore.publicView(record), whatsapp: { status: status.status } });
  }));

  // Status da conexão + QR Code (data URL) para o corretor escanear
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

module.exports = { mountTenantRoutes, requireAdmin, MIN_ADMIN_TOKEN };
