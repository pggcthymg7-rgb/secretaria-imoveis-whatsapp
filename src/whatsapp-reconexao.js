/**
 * Espera antes de reconectar ao WhatsApp. Compartilhado pelo modo clássico (src/whatsapp.js)
 * e pelo WhatsAppSessionManager (src/tenancy/session-manager.js).
 * - 515 (restartRequired): vem logo depois de ler o QR Code — o WhatsApp pede para reconectar
 *   para terminar o pareamento. Precisa ser quase na hora (1 s), senão o celular desiste do aparelho.
 * - 408 (QR Code venceu sem ser lido) e aguardando QR: espera curta, para o QR novo aparecer logo.
 * - Demais quedas: espera crescente (3 s, 6 s, 12 s… até 60 s) para não martelar o servidor.
 */
const { DisconnectReason } = require('@whiskeysockets/baileys');

function reconnectDelay(statusCode, attempts, semSessao = false) {
  if (statusCode === DisconnectReason.restartRequired) return 1000; // 1 s: só o tempo de gravar a sessão nova no disco
  if (semSessao || statusCode === DisconnectReason.timedOut) return 3000;
  return Math.min(60000, 3000 * 2 ** Math.min(attempts, 5));
}

module.exports = { reconnectDelay };
