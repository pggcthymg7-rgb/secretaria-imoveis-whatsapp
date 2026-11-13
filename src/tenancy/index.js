/**
 * Multi-tenant em camada de aplicação: monta Store + SessionManager + Router.
 * Ativado com MULTI_TENANT=1 (ver index.js). Sem a flag, nada aqui é carregado.
 */
const { TenantStore } = require('./tenant-store');
const { WhatsAppSessionManager } = require('./session-manager');
const { WhatsAppRouter } = require('./router');

function createTenancy({ baseDir, baileys, startScheduler = true }) {
  const tenantStore = new TenantStore(baseDir);
  const sessionManager = new WhatsAppSessionManager({ storageDir: tenantStore.sessionsDir, ...(baileys ? { baileys } : {}) });
  const router = new WhatsAppRouter({ sessionManager, tenantStore, startScheduler }).attach();

  /** Religa todos os corretores já cadastrados (partida do processo) */
  async function restoreAll() {
    const ids = tenantStore.list();
    for (const id of ids) {
      try {
        const cfg = tenantStore.get(id);
        router.prepareTenant(id);
        await sessionManager.initializeTenant(id, { nome: cfg.nome });
      } catch (err) {
        console.error(`[tenant:${id}] Falha ao religar: ${err.message}`);
      }
    }
    return ids;
  }

  async function shutdown() {
    await sessionManager.stopAll();
    for (const id of [...router.domains.keys()]) router.stopTenant(id);
  }

  return { tenantStore, sessionManager, router, restoreAll, shutdown };
}

module.exports = { createTenancy };
