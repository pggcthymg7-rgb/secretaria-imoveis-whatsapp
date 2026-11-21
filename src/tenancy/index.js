/**
 * Multi-tenant em camada de aplicação: monta Store + SessionManager + Router.
 * Ativado com MULTI_TENANT=1 (ver src/web/app.js e index.js). Sem a flag, nada aqui é carregado.
 */
const fs = require('fs');
const path = require('path');
const { TenantStore, isValidTenantId } = require('./tenant-store');
const { WhatsAppSessionManager } = require('./session-manager');
const { WhatsAppRouter } = require('./router');

function createTenancy({ baseDir, baileys, startScheduler = true }) {
  const tenantStore = new TenantStore(baseDir);
  const sessionManager = new WhatsAppSessionManager({ storageDir: tenantStore.sessionsDir, ...(baileys ? { baileys } : {}) });
  const router = new WhatsAppRouter({ sessionManager, tenantStore, startScheduler }).attach();

  /** Religa todos os corretores já cadastrados (partida do processo, em lotes controlados) */
  async function restoreAll({ concurrency = 5 } = {}) {
    const ids = tenantStore.list();
    const religados = new Array(ids.length).fill(null);
    let idx = 0;
    const worker = async () => {
      while (idx < ids.length) {
        const cur = idx++;
        const id = ids[cur];
        try {
          const cfg = tenantStore.get(id);
          if (!cfg || cfg.ativo === false) continue; // pausado pelo João no painel
          router.prepareTenant(id);
          await sessionManager.initializeTenant(id, { nome: cfg.nome });
          religados[cur] = id;
        } catch (err) {
          console.error(`[tenant:${id}] Falha ao religar: ${err.message}`);
        }
      }
    };
    const poolSize = Math.min(Math.max(1, concurrency), Math.max(1, ids.length));
    await Promise.all(Array.from({ length: poolSize }, worker));
    return religados.filter(Boolean);
  }

  /**
   * Endereço do corretor: <id>.<DOMINIO> (VM) ou <id>.localhost (teste local).
   * @returns {string|null} tenantId
   */
  function tenantFromHost(host) {
    const h = String(host || '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
    for (const base of [String(process.env.DOMINIO || '').trim().toLowerCase().replace(/\.$/, ''), 'localhost'].filter(Boolean)) {
      if (!h.endsWith(`.${base}`)) continue;
      const id = h.slice(0, -(base.length + 1));
      return isValidTenantId(id) ? id : null;
    }
    return null;
  }

  /** Middleware (antes de tudo no app do admin): endereço de corretor -> app da BIGA dele */
  function dispatchHost(req, res, next) {
    const id = tenantFromHost(req.headers.host);
    if (!id) return next();
    const rec = tenantStore.get(id);
    if (!rec) return res.status(404).type('text').send('BIGA não encontrada.');
    if (rec.ativo === false) return res.status(503).type('text').send('Esta BIGA está pausada pelo administrador.');
    try {
      return router.tenantApp(id)(req, res, next);
    } catch (err) {
      console.error(`[tenant:${id}] painel: ${err.message}`);
      return res.status(503).type('text').send('BIGA indisponível no momento. Tente de novo em instantes.');
    }
  }

  /** Pede ao root (systemd path -> deploy/caddy-corretores.sh) o HTTPS do endereço novo */
  function pedirEndereco() {
    try {
      fs.writeFileSync(path.join(tenantStore.baseDir, 'caddy-sincronizar'), new Date().toISOString());
    } catch (err) {
      console.error(`Aviso: não consegui pedir o endereço HTTPS: ${err.message}`);
    }
  }

  async function shutdown() {
    await sessionManager.stopAll();
    for (const id of [...router.domains.keys()]) router.stopTenant(id);
  }

  return { tenantStore, sessionManager, router, restoreAll, shutdown, dispatchHost, tenantFromHost, pedirEndereco };
}

module.exports = { createTenancy };
