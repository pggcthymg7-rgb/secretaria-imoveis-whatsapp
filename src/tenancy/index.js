/**
 * Multi-tenant em camada de aplicação: monta Store + SessionManager + Router.
 * Ativado com MULTI_TENANT=1 (ver index.js). Sem a flag, nada aqui é carregado.
 */
const fs = require('fs');
const path = require('path');
const { TenantStore, TENANT_ID_RE } = require('./tenant-store');
const { WhatsAppSessionManager } = require('./session-manager');
const { WhatsAppRouter } = require('./router');

function createTenancy({ baseDir, baileys, startScheduler = true }) {
  const tenantStore = new TenantStore(baseDir);
  let router = null;
  // Conexão do corretor: vai para o journal da VM e para a Atividade do painel dele(a)
  const log = (tenantId, msg) => {
    console.log(`[tenant:${tenantId}] ${msg}`);
    try {
      router?.domains.get(tenantId)?.wa.addLog('CONEXAO', msg);
    } catch {}
  };
  const sessionManager = new WhatsAppSessionManager({ storageDir: tenantStore.sessionsDir, log, ...(baileys ? { baileys } : {}) });
  router = new WhatsAppRouter({ sessionManager, tenantStore, startScheduler }).attach();

  /** Religa todos os corretores já cadastrados (partida do processo) */
  async function restoreAll() {
    const ids = tenantStore.list();
    const religados = [];
    for (const id of ids) {
      try {
        const cfg = tenantStore.get(id);
        if (cfg.ativo === false) continue; // pausado pelo João no painel
        router.prepareTenant(id);
        await sessionManager.initializeTenant(id, { nome: cfg.nome });
        religados.push(id);
      } catch (err) {
        console.error(`[tenant:${id}] Falha ao religar: ${err.message}`);
      }
    }
    return religados;
  }

  /**
   * Endereço do corretor: <id>.<DOMINIO> (VM) ou <id>.localhost (teste local).
   * @returns {string|null} tenantId
   */
  function tenantFromHost(host) {
    const h = String(host || '').toLowerCase().replace(/:\d+$/, '');
    for (const base of [String(process.env.DOMINIO || '').trim().toLowerCase(), 'localhost'].filter(Boolean)) {
      if (!h.endsWith(`.${base}`)) continue;
      const id = h.slice(0, -(base.length + 1));
      return TENANT_ID_RE.test(id) ? id : null;
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
      return router.tenantApp(id)(req, res);
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
