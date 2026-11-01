/**
 * ============================================================================
 * LOGIN DO PAINEL
 * ============================================================================
 * Antes: qualquer pessoa com o link do Render via o QR Code (podia sequestrar o
 * WhatsApp), a carteira e mudava as configurações. Agora o painel exige senha.
 *
 * - Senha: variável PAINEL_SENHA, ou criada no 1º acesso usando o CÓDIGO DE
 *   CONFIGURAÇÃO que aparece no log do servidor (impede que um estranho crie antes).
 * - Sessão: cookie HttpOnly + SameSite=Strict assinado com HMAC (expira em 30 dias).
 * - Tentativas de login limitadas por IP.
 * - API_TOKEN (opcional): acesso por cabeçalho Authorization: Bearer <token>
 *   para scripts (ex: sync-from-cloud.js).
 * ============================================================================
 */
const crypto = require('crypto');
const { readJson, writeJson } = require('./store');

const FILE = 'auth.json';
const COOKIE = 'sec_sid';
const SESSION_DAYS = 30;

let data = readJson(FILE, {});
if (!data.secret) {
  data.secret = crypto.randomBytes(32).toString('hex');
  writeJson(FILE, data);
}
let setupCode = null;

function secret() {
  return process.env.SESSION_SECRET || data.secret;
}

function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return { salt, hash };
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function isConfigured() {
  return Boolean(process.env.PAINEL_SENHA || data.hash);
}

function getSetupCode() {
  if (isConfigured()) return null;
  if (!setupCode) {
    // SETUP_CODE: código fixo criado pela VM para a BIGA de um corretor extra (o João passa para ela)
    const fixo = String(process.env.SETUP_CODE || '').trim().toUpperCase();
    setupCode = /^[0-9A-F]{8,}$/.test(fixo) ? fixo : crypto.randomBytes(4).toString('hex').toUpperCase();
    console.log('\n======================================================');
    console.log(`🔐 CÓDIGO PARA CRIAR A SENHA DO PAINEL: ${setupCode}`);
    console.log('   (ou defina a variável de ambiente PAINEL_SENHA)');
    console.log('======================================================\n');
  }
  return setupCode;
}

function checkPassword(pw) {
  if (process.env.PAINEL_SENHA) return safeEqual(pw, process.env.PAINEL_SENHA);
  if (!data.hash) return false;
  return safeEqual(hashPassword(pw, data.salt).hash, data.hash);
}

function validateNewPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (pw.length > 200) return 'Senha muito longa.';
  return null;
}

function setPassword(pw) {
  const err = validateNewPassword(pw);
  if (err) throw Object.assign(new Error(err), { status: 400 });
  const { salt, hash } = hashPassword(pw);
  data = { ...data, salt, hash, version: (data.version || 0) + 1 }; // nova versão invalida sessões antigas
  writeJson(FILE, data);
  setupCode = null;
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (!safeEqual(mac, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!p.exp || p.exp < Date.now()) return null;
    if ((p.v || 0) !== (data.version || 0)) return null;
    return p;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isHttps(req) {
  return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https';
}

function issueSession(req, res) {
  const token = sign({ exp: Date.now() + SESSION_DAYS * 86400000, v: data.version || 0, n: crypto.randomBytes(6).toString('hex') });
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${SESSION_DAYS * 86400}`];
  if (isHttps(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

function isAuthenticated(req) {
  const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (bearer && process.env.API_TOKEN && process.env.API_TOKEN.length >= 16 && safeEqual(bearer[1], process.env.API_TOKEN)) return true;
  return Boolean(verify(parseCookies(req)[COOKIE]));
}

// Limite de tentativas: 8 por IP a cada 15 minutos
const attempts = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter(t => now - t < 15 * 60 * 1000);
  attempts.set(ip, list);
  if (attempts.size > 5000) attempts.clear();
  return list.length >= 8;
}
function registerFailure(ip) {
  const list = attempts.get(ip) || [];
  list.push(Date.now());
  attempts.set(ip, list);
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  return res.status(401).json({ error: 'Faça login no painel.' });
}

/** Proteção extra contra CSRF: requisições que alteram dados precisam do cabeçalho do painel */
function requireAppHeader(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers['x-secretaria'] === '1' || /^Bearer /i.test(String(req.headers.authorization || ''))) return next();
  return res.status(403).json({ error: 'Requisição bloqueada.' });
}

function routes(app) {
  app.get('/api/session', (req, res) => {
    res.json({ authenticated: isAuthenticated(req), configured: isConfigured(), needsSetupCode: !isConfigured() });
    if (!isConfigured()) getSetupCode();
  });

  app.post('/api/login', (req, res) => {
    const ip = clientIp(req);
    if (rateLimited(ip)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos.' });
    const { senha } = req.body || {};
    if (!isConfigured()) return res.status(400).json({ error: 'Crie a senha primeiro.' });
    if (!checkPassword(senha)) {
      registerFailure(ip);
      return res.status(401).json({ error: 'Senha incorreta.' });
    }
    attempts.delete(ip);
    issueSession(req, res);
    res.json({ ok: true });
  });

  app.post('/api/setup', (req, res) => {
    const ip = clientIp(req);
    if (rateLimited(ip)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos.' });
    if (isConfigured()) return res.status(400).json({ error: 'A senha já foi criada.' });
    const { codigo, senha } = req.body || {};
    const code = getSetupCode();
    if (!codigo || !safeEqual(String(codigo).trim().toUpperCase(), code)) {
      registerFailure(ip);
      return res.status(401).json({ error: 'Código de configuração incorreto (peça a quem instalou a BIGA ou veja o log do servidor).' });
    }
    try {
      setPassword(senha);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    issueSession(req, res);
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    clearSession(res);
    res.json({ ok: true });
  });

  app.post('/api/change-password', requireAuth, (req, res) => {
    if (process.env.PAINEL_SENHA) return res.status(400).json({ error: 'A senha está definida pela variável PAINEL_SENHA no servidor.' });
    const { atual, nova } = req.body || {};
    if (!checkPassword(atual)) return res.status(401).json({ error: 'Senha atual incorreta.' });
    try {
      setPassword(nova);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    issueSession(req, res);
    res.json({ ok: true });
  });
}

module.exports = { routes, requireAuth, requireAppHeader, isAuthenticated, isConfigured, getSetupCode, _test: { sign, verify, checkPassword } };
