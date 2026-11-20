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

async function adquirirTrava({ timeoutMs = 15000, retryIntervalMs = 100, maxAgeMs = 120000 } = {}) {
  const t0 = Date.now();
  while (true) {
    try {
      const handle = await fs.promises.open(LOCK_FILE, 'wx', 0o600);
      try {
        await handle.writeFile(String(process.pid), 'utf8');
      } catch (writeErr) {
        await fs.promises.unlink(LOCK_FILE).catch(() => {});
        throw writeErr;
      } finally {
        await handle.close().catch(() => {});
      }
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
          const [lido, st] = await Promise.all([
            fs.promises.readFile(LOCK_FILE, 'utf8').catch(() => null),
            fs.promises.stat(LOCK_FILE).catch(() => null)
          ]);
          const idadeMs = st ? Math.max(0, Date.now() - st.mtimeMs) : 0;
          const lockPid = lido ? parseInt(lido.trim(), 10) : NaN;
          let removerOrfa = false;

          if (Number.isInteger(lockPid) && lockPid > 0) {
            let processoExiste = true;
            try {
              process.kill(lockPid, 0);
            } catch (killErr) {
              if (killErr.code === 'ESRCH') processoExiste = false;
            }
            if (!processoExiste || (st && idadeMs >= maxAgeMs)) removerOrfa = true;
          } else if (st && idadeMs >= 5000) {
            // Trava vazia ou corrompida deixada por crash entre open('wx') e writeFile
            removerOrfa = true;
          }

          if (removerOrfa) {
            await fs.promises.unlink(LOCK_FILE).catch(() => {});
            continue;
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
