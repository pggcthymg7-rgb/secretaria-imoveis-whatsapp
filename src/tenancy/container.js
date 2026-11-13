/**
 * CONTÊINER POR TENANT — isola o domínio da BIGA por corretor dentro do MESMO processo.
 *
 * O domínio (radar, contatos, settings, carteira, vitrine, prospecção, garimpo...) guarda estado
 * em variáveis de módulo e lê `process.env`/DATA_DIR. Em vez de reescrever essa lógica, cada
 * tenant recebe a SUA instância dos módulos de `src/`, compilados com:
 *   - um `process` próprio, cujo `env` é do tenant (DATA_DIR, chaves de IA, planilha, alerta);
 *   - um `require` que instancia de novo só arquivos de `src/` (bibliotecas de node_modules,
 *     Baileys, Gemini, sharp etc. continuam compartilhadas — é aí que está o ganho de memória).
 * Resultado: estado e arquivos de um corretor nunca enxergam os de outro, e a regra de negócio
 * continua byte a byte a mesma.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');
const dotenv = require('dotenv');
const { ENV_ALLOWED } = require('../envfile');

const SRC_DIR = path.join(__dirname, '..');
const TENANCY_DIR = __dirname;

// Variáveis que são de UM corretor (ou do processo hospedeiro) e nunca vazam para outro tenant
const TENANT_PRIVATE_ENV = new Set([
  ...ENV_ALLOWED,
  'DATA_DIR',
  'PAINEL_SENHA',
  'API_TOKEN',
  'SESSION_SECRET',
  'SETUP_CODE',
  'ADMIN_TOKEN',
  'PORT',
  'HOST',
  'DOMINIO',
  'PUBLIC_URL',
  'RENDER_EXTERNAL_URL',
  'GRUPOS_MONITORADOS',
  'MODO_APENAS_AVISAR',
  'GOOGLE_SHEETS_TOKEN',
  'GEMINI_MODEL',
  'GEMINI_BUSCA_MODEL',
  'MULTI_TENANT'
]);

/** Campos do configIA que viram variáveis de ambiente do tenant */
const CONFIG_TO_ENV = {
  geminiApiKey: 'GEMINI_API_KEY',
  geminiModel: 'GEMINI_MODEL',
  googleSheetsCsvUrl: 'GOOGLE_SHEETS_CSV_URL',
  googleSheetsWebhookUrl: 'GOOGLE_SHEETS_WEBHOOK_URL',
  meuWhatsappAlerta: 'MEU_WHATSAPP_ALERTA'
};

/** Ambiente do tenant: infraestrutura do hospedeiro (PATH, TZ, proxy...) + só o que é dele */
function buildTenantEnv({ baseEnv = process.env, dataDir, configIA = {} }) {
  const env = {};
  for (const [k, v] of Object.entries(baseEnv)) if (!TENANT_PRIVATE_ENV.has(k) && v !== undefined) env[k] = String(v);
  // Chaves salvas pelo próprio tenant (painel/assistente gravam em <dataDir>/.env)
  const envFile = path.join(dataDir, '.env');
  if (fs.existsSync(envFile)) {
    const parsed = dotenv.parse(fs.readFileSync(envFile, 'utf-8'));
    for (const [k, v] of Object.entries(parsed)) if (ENV_ALLOWED.has(k)) env[k] = v;
  }
  for (const [field, key] of Object.entries(CONFIG_TO_ENV)) {
    if (typeof configIA[field] === 'string' && configIA[field]) env[key] = configIA[field];
  }
  env.DATA_DIR = dataDir;
  return env;
}

/** `process` do tenant: igual ao real, exceto `env` */
function tenantProcess(env) {
  return new Proxy(process, {
    get(target, key) {
      if (key === 'env') return env;
      return Reflect.get(target, key, target);
    },
    set(target, key, value) {
      if (key === 'env') return false;
      return Reflect.set(target, key, value, target);
    }
  });
}

function isTenantScoped(file) {
  return file.startsWith(SRC_DIR + path.sep) && !file.startsWith(TENANCY_DIR + path.sep) && file.endsWith('.js');
}

/**
 * Cria o contêiner de um tenant.
 * @param {{ tenantId: string, dataDir: string, env: Record<string,string> }} opts
 * @returns {{ tenantId: string, dataDir: string, env: object, require: (rel: string) => any }}
 */
function createTenantContainer({ tenantId, dataDir, env }) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const proc = tenantProcess(env);
  const cache = new Map();

  function load(filename) {
    const cached = cache.get(filename);
    if (cached) return cached.exports;
    const mod = new Module(filename, null);
    mod.filename = filename;
    mod.paths = Module._nodeModulePaths(path.dirname(filename));
    cache.set(filename, mod);
    const hostRequire = Module.createRequire(filename);
    const req = id => {
      const resolved = hostRequire.resolve(id);
      return isTenantScoped(resolved) ? load(resolved) : hostRequire(id);
    };
    req.resolve = hostRequire.resolve;
    req.cache = hostRequire.cache;
    req.main = require.main;
    try {
      const fn = vm.compileFunction(fs.readFileSync(filename, 'utf-8'), ['exports', 'require', 'module', '__filename', '__dirname', 'process'], { filename });
      fn.call(mod.exports, mod.exports, req, mod, filename, path.dirname(filename), proc);
    } catch (err) {
      cache.delete(filename);
      throw err;
    }
    mod.loaded = true;
    return mod.exports;
  }

  return {
    tenantId,
    dataDir,
    env,
    require: rel => load(require.resolve(path.join(SRC_DIR, rel)))
  };
}

module.exports = { createTenantContainer, buildTenantEnv, TENANT_PRIVATE_ENV, CONFIG_TO_ENV };
