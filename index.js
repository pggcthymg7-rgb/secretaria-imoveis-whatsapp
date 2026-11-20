require('dotenv').config({ quiet: true });
// Chaves salvas pelo painel ficam na pasta de dados persistente (na VM o código é somente leitura)
if (process.env.DATA_DIR) require('dotenv').config({ path: require('path').join(process.env.DATA_DIR, '.env'), override: true, quiet: true });
// O processo hospedeiro é sempre a BIGA do administrador do SaaS
delete process.env.BIGA_PAPEL;
const { app, tenancy } = require('./src/app');
const { DATA_DIR } = require('./src/paths');
const sheets = require('./src/sheets');
const wa = require('./src/whatsapp');
const contacts = require('./src/contacts');
const radar = require('./src/radar');
const metrics = require('./src/metrics');
const anuncios = require('./src/anuncios');
const scheduler = require('./src/scheduler');
const pdfManager = require('./src/pdf16x9/manager');
const auth = require('./src/auth');

let server = null;
let keepAliveTimer = null;
let shuttingDown = false;

// ---------------------------------------------------------------------------
// Partida
// ---------------------------------------------------------------------------
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const force = setTimeout(() => process.exit(1), 10000);
  if (force.unref) force.unref();
  try {
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    scheduler.stop();
    if (server) await new Promise(res => server.close(res));
    if (typeof wa.stopWhatsAppAgent === 'function') await wa.stopWhatsAppAgent();
    if (typeof wa.flushAncoras === 'function') wa.flushAncoras();
    contacts.flush();
    radar.flush();
    metrics.flush();
    anuncios.persist(true);
    pdfManager.shutdown();
    if (typeof app.shutdown === 'function') app.shutdown();
    if (tenancy) await tenancy.shutdown();
  } catch (err) {
    console.error('Erro no encerramento gracioso:', err);
  } finally {
    clearTimeout(force);
  }
  process.exit(0);
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const HOST = process.env.HOST || '0.0.0.0';
  server = app.listen(PORT, HOST, async () => {
    try {
      console.log(`\n🚀 BIGA — SECRETÁRIA IMOBILIÁRIA ATIVA EM: http://${HOST}:${PORT}${process.env.PUBLIC_URL ? ` (público: ${process.env.PUBLIC_URL})` : ''}`);
      console.log(`📂 Dados em: ${DATA_DIR}${process.env.DATA_DIR ? '' : ' (defina DATA_DIR para um disco persistente na nuvem)'}`);
      console.log(`🏠 ${(await sheets.loadInventory()).length} imóveis ativos.`);
      if (!auth.isConfigured()) auth.getSetupCode();
      wa.startWhatsAppAgent().catch(err => console.error('Erro ao iniciar WhatsApp:', err));
      scheduler.start(wa.api, wa.addLog);
      if (tenancy) tenancy.restoreAll().then(ids => console.log(`👥 Multi-tenant: ${ids.length} corretor(es) religado(s).`)).catch(err => console.error('Erro ao religar corretores:', err));

      const externalUrl = process.env.RENDER_EXTERNAL_URL;
      if (externalUrl) {
        keepAliveTimer = setInterval(() => fetch(`${externalUrl.replace(/\/$/, '')}/ping`).catch(() => {}), 10 * 60 * 1000);
        if (keepAliveTimer.unref) keepAliveTimer.unref();
      }
    } catch (err) {
      console.error('Erro ao inicializar servidor:', err);
    }
  });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('unhandledRejection', err => console.error('[UNHANDLED_REJECTION]', err));
}

module.exports = { app, tenancy };
