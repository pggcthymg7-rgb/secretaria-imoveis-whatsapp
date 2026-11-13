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
const scheduler = require('./src/scheduler');
const auth = require('./src/auth');

// ---------------------------------------------------------------------------
// Partida
// ---------------------------------------------------------------------------
async function shutdown() {
  try {
    contacts.flush();
    radar.flush();
    if (tenancy) await tenancy.shutdown();
  } catch {}
  process.exit(0);
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const HOST = process.env.HOST || '0.0.0.0';
  app.listen(PORT, HOST, async () => {
    console.log(`\n🚀 BIGA — SECRETÁRIA IMOBILIÁRIA ATIVA EM: http://${HOST}:${PORT}${process.env.PUBLIC_URL ? ` (público: ${process.env.PUBLIC_URL})` : ''}`);
    console.log(`📂 Dados em: ${DATA_DIR}${process.env.DATA_DIR ? '' : ' (defina DATA_DIR para um disco persistente na nuvem)'}`);
    console.log(`🏠 ${(await sheets.loadInventory()).length} imóveis ativos.`);
    if (!auth.isConfigured()) auth.getSetupCode();
    wa.startWhatsAppAgent().catch(err => console.error('Erro ao iniciar WhatsApp:', err));
    scheduler.start(wa.api, wa.addLog);
    if (tenancy) tenancy.restoreAll().then(ids => console.log(`👥 Multi-tenant: ${ids.length} corretor(es) religado(s).`));

    const externalUrl = process.env.RENDER_EXTERNAL_URL;
    if (externalUrl) {
      setInterval(() => fetch(`${externalUrl.replace(/\/$/, '')}/ping`).catch(() => {}), 10 * 60 * 1000);
    }
  });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { app, tenancy };
