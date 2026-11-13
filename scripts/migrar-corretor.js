#!/usr/bin/env node
/**
 * Copia a BIGA de um corretor extra (processo próprio, /var/lib/secretaria-<nome>) para dentro da
 * BIGA principal no modo equipe (multi-tenant). Chamado por deploy/migrar-corretor.sh (root), que
 * cuida do systemd, backup, permissões e da volta em caso de falha.
 *
 *   node scripts/migrar-corretor.js --nome laura --dados /var/lib/secretaria-laura \
 *        --env /etc/secretaria-laura.env --destino /var/lib/secretaria
 *
 * - Dados (carteira, fotos, radar, contatos, settings, vitrine...) -> <destino>/tenants/<nome>/data
 * - Sessão do WhatsApp (auth_info_baileys) -> <destino>/sessions_storage/<nome> (não precisa ler QR de novo)
 * - Chaves do corretor (.env do painel dele + /etc/secretaria-<nome>.env, só as permitidas) -> data/.env
 * - config.json é gravado POR ÚLTIMO: a presença dele marca a migração como concluída.
 * Fica de fora o que era do painel/processo antigo: auth.json (senha do painel), logs e gatilhos.
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { ENV_ALLOWED } = require('../src/envfile');
const { TenantStore, validateTenantId } = require('../src/tenancy/tenant-store');

const NAO_COPIAR = new Set(['auth_info_baileys', 'auth.json', 'atualizar-agora', 'atualizacao.log', 'corretores.json', '.env']);

function lerEnv(file) {
  try {
    return dotenv.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return {};
  }
}

function soPermitidas(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (ENV_ALLOWED.has(k) && String(v).trim()) out[k] = String(v).replace(/[\r\n]/g, '').trim();
  return out;
}

/**
 * @param {{ nome: string, dados: string, env?: string, destino: string, nomeExibicao?: string }} o
 */
function migrarCorretor({ nome, dados, env, destino, nomeExibicao }) {
  if (!/^[a-z][a-z0-9]{1,19}$/.test(String(nome))) throw new Error(`nome inválido: ${nome}`);
  validateTenantId(nome);
  const store = new TenantStore(destino);
  if (store.get(nome)) return { nome, resultado: 'ja-migrado' };
  if (!fs.existsSync(dados) || !fs.statSync(dados).isDirectory()) throw new Error(`pasta de dados não encontrada: ${dados}`);

  // 1) dados
  const dataDir = store.dataDir(nome);
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  let arquivos = 0;
  for (const item of fs.readdirSync(dados)) {
    if (NAO_COPIAR.has(item) || item.endsWith('.tmp')) continue;
    fs.cpSync(path.join(dados, item), path.join(dataDir, item), { recursive: true, force: true, preserveTimestamps: true });
    arquivos++;
  }

  // 2) sessão do WhatsApp
  const authOrigem = path.join(dados, 'auth_info_baileys');
  const sessao = store.sessionDir(nome);
  let sessaoCopiada = false;
  if (fs.existsSync(authOrigem) && fs.readdirSync(authOrigem).length) {
    fs.rmSync(sessao, { recursive: true, force: true });
    fs.cpSync(authOrigem, sessao, { recursive: true, preserveTimestamps: true });
    fs.chmodSync(sessao, 0o700);
    sessaoCopiada = true;
  }

  // 3) chaves: /etc/secretaria-<nome>.env < .env salvo pelo painel dela (o painel tinha a palavra final)
  const chaves = { ...soPermitidas(env ? lerEnv(env) : {}), ...soPermitidas(lerEnv(path.join(dados, '.env'))) };
  if (Object.keys(chaves).length) {
    const conteudo = Object.entries(chaves).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
    fs.writeFileSync(path.join(dataDir, '.env'), conteudo, { encoding: 'utf-8', mode: 0o600 });
  }

  // 4) cadastro (por último = migração concluída). Persona e regras continuam no settings.json dela.
  const exibicao = nomeExibicao || nome.charAt(0).toUpperCase() + nome.slice(1);
  store.save(nome, { nome: exibicao, configIA: {} });
  return { nome, resultado: 'migrado', arquivos, sessaoCopiada, chaves: Object.keys(chaves) };
}

if (require.main === module) {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) args[String(argv[i]).replace(/^--/, '')] = argv[i + 1];
  try {
    console.log(JSON.stringify(migrarCorretor(args)));
  } catch (err) {
    console.error(`ERRO: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { migrarCorretor };
