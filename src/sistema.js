/**
 * Versão em execução e pedido de "atualizar agora" (painel e WhatsApp).
 * O app só cria o arquivo DATA_DIR/atualizar-agora; quem atualiza é o systemd da VM
 * (secretaria-update-now.path -> deploy/atualizar.sh, como root), que baixa SOMENTE a main
 * do repositório oficial, verifica e volta para a versão anterior se algo falhar.
 */
const fs = require('fs');
const path = require('path');
const { ROOT_DIR, dataPath } = require('./paths');

function version() {
  try {
    const gitDir = path.join(ROOT_DIR, '.git');
    let head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf-8').trim();
    if (head.startsWith('ref:')) {
      const ref = head.slice(5).trim();
      const refFile = path.join(gitDir, ref);
      if (fs.existsSync(refFile)) head = fs.readFileSync(refFile, 'utf-8').trim();
      else {
        const packed = fs.readFileSync(path.join(gitDir, 'packed-refs'), 'utf-8');
        const line = packed.split('\n').find(l => l.endsWith(' ' + ref));
        head = line ? line.split(' ')[0] : '';
      }
    }
    return /^[0-9a-f]{7,40}$/.test(head) ? head.slice(0, 7) : null;
  } catch {
    return null;
  }
}

function requestUpdate() {
  if (!process.env.DATA_DIR) {
    const e = new Error('Atualização pelo painel só funciona na máquina virtual (DATA_DIR).');
    e.status = 400;
    throw e;
  }
  fs.writeFileSync(dataPath('atualizar-agora'), new Date().toISOString());
  return { ok: true, versao: version() };
}

function lastResults(n = 5) {
  try {
    return fs.readFileSync(dataPath('atualizacao.log'), 'utf-8').trim().split('\n').filter(Boolean).slice(-n).reverse();
  } catch {
    return [];
  }
}

/** BIGAs dos corretores extras (a VM grava DATA_DIR/corretores.json na BIGA principal) */
function corretores() {
  try {
    const lista = JSON.parse(fs.readFileSync(dataPath('corretores.json'), 'utf-8'));
    return Array.isArray(lista) ? lista.filter(c => c && typeof c.nome === 'string' && typeof c.url === 'string') : [];
  } catch {
    return [];
  }
}

module.exports = { version, requestUpdate, lastResults, corretores };
