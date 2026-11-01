#!/usr/bin/env node
/**
 * Roda sozinho depois do "npm ci" (inclusive na atualização automática da VM).
 * Na máquina virtual (root + /etc/secretaria.env) garante o gatilho "atualizar agora"
 * usado pelo botão do painel e pelo comando "atualizar" no WhatsApp.
 * Em qualquer outro lugar (seu computador, Render) não faz nada. Nunca quebra a instalação.
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

try {
  const ENV = '/etc/secretaria.env';
  const UNIT = '/etc/systemd/system/secretaria-update-now.path';
  if (process.getuid && process.getuid() === 0 && fs.existsSync(ENV) && fs.existsSync('/etc/systemd/system') && !fs.existsSync(UNIT)) {
    const m = fs.readFileSync(ENV, 'utf-8').match(/^DATA_DIR=(\/[\w./-]+)$/m);
    const dataDir = m ? m[1] : '/var/lib/secretaria';
    fs.writeFileSync(UNIT, ['[Unit]', 'Description=Atualizar a BIGA quando pedido pelo painel ou WhatsApp', '[Path]', `PathExists=${dataDir}/atualizar-agora`, 'Unit=secretaria-update.service', '[Install]', 'WantedBy=multi-user.target', ''].join('\n'));
    execFileSync('systemctl', ['daemon-reload'], { stdio: 'ignore' });
    execFileSync('systemctl', ['enable', '--now', 'secretaria-update-now.path'], { stdio: 'ignore' });
    console.log('BIGA: gatilho "atualizar agora" instalado.');
  }
} catch (err) {
  console.log(`BIGA: gatilho de atualização não instalado (${err.message}).`);
}
