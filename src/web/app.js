/**
 * APP WEB DA BIGA (painel + API). Usado de dois jeitos:
 *  - BIGA do administrador do SaaS: carregado normalmente por index.js (BIGA_PAPEL vazio = admin).
 *  - BIGA de cada corretor: carregado dentro do contêiner do tenant (src/tenancy/container.js),
 *    com process.env.BIGA_PAPEL = 'corretor' e todos os módulos (dados, WhatsApp, login) dele.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');

const { FOTOS_DIR, DATA_DIR } = require('../config/paths');
const wa = require('../whatsapp/client');
const auth = require('../config/auth');
const sistema = require('../config/sistema');
const pdf16x9 = require('../pdf/deck16x9/manager');
const anunciosMem = require('../domain/anuncios');
const { createStatusRoutes } = require('./routes/status.routes');

const PAPEL = process.env.BIGA_PAPEL === 'corretor' ? 'corretor' : 'admin';
const IS_ADMIN = PAPEL === 'admin';
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Modo equipe: o endereço <corretor>.<DOMINIO> abre a BIGA completa daquele corretor (antes de tudo)
app.use((req, res, next) => (tenancy ? tenancy.dispatchHost(req, res, next) : next()));

// Limite geral por IP (o login tem o seu, mais rígido, em auth.js). /ping e /health ficam de fora: são para monitor.
// RATE_LIMIT_MAX muda o teto por minuto (o painel faz poucas chamadas; 600/min é bem folgado).
const rateLimitStore = new rateLimit.MemoryStore();
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_MAX) || 600,
    store: rateLimitStore,
    // o app da BIGA de cada corretor é criado sob demanda (1º acesso ao endereço dele): é intencional
    validate: { creationStack: false },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: req => req.path === '/ping' || req.path === '/health',
    message: { error: 'Muitas requisições. Aguarde um minuto.' }
  })
);
app.use(express.json({ limit: '1mb' }));

// Cabeçalhos de segurança
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  if (req.secure || proto === 'https') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
  next();
});

if (!fs.existsSync(FOTOS_DIR)) fs.mkdirSync(FOTOS_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Rotas públicas
// ---------------------------------------------------------------------------
app.get('/ping', (req, res) => res.json({ ok: true, status: 'awake', time: new Date().toISOString() }));
app.get('/health', (req, res) => res.json({ ok: true, whatsapp: wa.getAgentState().connectionStatus }));
app.use('/assets', express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h', index: false }));

// O painel pede app.js/app.css com ?v=<versão>: depois de "atualizar", o celular já carrega o
// painel novo (antes o navegador podia usar a versão antiga por até 1 hora).
const INDEX_HTML = path.join(__dirname, '..', 'public', 'index.html');
app.get(['/', '/dia-a-dia'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const v = sistema.version() || String(fs.statSync(INDEX_HTML).mtimeMs | 0);
  res.type('html').send(fs.readFileSync(INDEX_HTML, 'utf-8').replace(/(\/assets\/[\w/-]+\.(?:js|css))"/g, `$1?v=${v}"`));
});

// Modo equipe (MULTI_TENANT=1): só a BIGA do administrador do SaaS cria e administra os corretores.
// Cada corretor roda ESTE MESMO app numa instância isolada (src/tenancy/container.js) com
// BIGA_PAPEL=corretor: painel e funcionalidades completos dele, sem a estrutura do SaaS.
const tenancy = IS_ADMIN && process.env.MULTI_TENANT === '1' ? require('../tenancy').createTenancy({ baseDir: DATA_DIR }) : null;
const tenancyRoutes = require('../tenancy/routes');
if (tenancy) tenancyRoutes.mountTenantRoutes(app, { ...tenancy, adminToken: process.env.ADMIN_TOKEN });

app.use('/api', auth.requireAppHeader);
auth.routes(app);

// Tudo abaixo exige login
app.use('/api', auth.requireAuth);
if (IS_ADMIN) tenancyRoutes.mountPanelRoutes(app, tenancy); // /api/equipe — cadastro dos corretores (só o administrador)
// Estrutura do SaaS: corretor não atualiza o sistema (rotas recusadas no servidor, não só escondidas)
if (!IS_ADMIN) app.use(['/api/sistema/atualizar', '/api/equipe'], (req, res) => res.status(403).json({ error: 'Só o administrador da BIGA pode fazer isso.' }));
app.use('/fotos', auth.requireAuth, express.static(FOTOS_DIR, {
  index: false,
  dotfiles: 'deny',
  setHeaders: res => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));

// Rotas autenticadas da API agrupadas por domínio
app.use(createStatusRoutes({ papel: PAPEL }));
app.use(require('./routes/carteira.routes'));
app.use(require('./routes/config.routes'));
app.use(require('./routes/radar.routes'));
app.use(require('./routes/pdf.routes'));
app.use(require('./routes/vitrine.routes'));
app.use(require('./routes/prospeccao.routes'));
app.use(require('./routes/busca.routes'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error('[http]', err?.message || err);
  res.status(status).json({ error: status < 500 && err?.message ? err.message : 'Erro interno' });
});

function shutdown() {
  try { rateLimitStore.shutdown(); } catch {}
  try { pdf16x9.shutdown(); } catch {}
  try { if (typeof anunciosMem.persist === 'function') anunciosMem.persist(true); } catch {}
}

module.exports = { app, tenancy, PAPEL, shutdown };
