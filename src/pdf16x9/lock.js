'use strict';
/**
 * Trava atômica entre processos via kernel Linux (PID Fencing).
 * Não usa mtime/tempo de arquivo para definir trava velha.
 * Usa flag 'wx' (O_CREAT | O_EXCL) e process.kill(pid, 0).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const LOCK_FILE = path.join(os.tmpdir(), 'biga-pdf-generator.lock');

async function adquirirTrava({ timeoutMs = 15000, retryIntervalMs = 100 } = {}) {
  const t0 = Date.now();
  while (true) {
    try {
      const handle = await fs.promises.open(LOCK_FILE, 'wx');
      await handle.writeFile(String(process.pid), 'utf8');
      await handle.close();
      let liberado = false;
      return async function liberar() {
        if (liberado) return;
        liberado = true;
        try {
          const lido = await fs.promises.readFile(LOCK_FILE, 'utf8').catch(() => null);
          if (lido && parseInt(lido.trim(), 10) === process.pid) {
            await fs.promises.unlink(LOCK_FILE).catch(() => {});
          }
        } catch {}
      };
    } catch (err) {
      if (err.code === 'EEXIST') {
        try {
          const lido = await fs.promises.readFile(LOCK_FILE, 'utf8').catch(() => null);
          if (lido) {
            const lockPid = parseInt(lido.trim(), 10);
            if (!Number.isNaN(lockPid)) {
              let processoExiste = true;
              try {
                process.kill(lockPid, 0);
              } catch (killErr) {
                if (killErr.code === 'ESRCH') {
                  // O processo dono da trava morreu de forma abrupta
                  processoExiste = false;
                }
              }
              if (!processoExiste) {
                // Trava órfã descartada com segurança
                await fs.promises.unlink(LOCK_FILE).catch(() => {});
                continue;
              }
            }
          }
        } catch {}
      }

      if (Date.now() - t0 >= timeoutMs) {
        throw new Error(`Timeout de ${timeoutMs}ms aguardando trava do gerador de PDF (${LOCK_FILE})`);
      }
      const pausa = retryIntervalMs + Math.floor(Math.random() * 50);
      await new Promise(r => setTimeout(r, pausa));
    }
  }
}

module.exports = { LOCK_FILE, adquirirTrava };
