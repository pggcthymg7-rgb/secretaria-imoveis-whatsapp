#!/usr/bin/env bash
# Atualiza a secretária na VM com segurança:
# baixa a versão nova, verifica, reinicia — e volta para a anterior se algo falhar.
set -euo pipefail
# Este arquivo muda durante a atualização: roda a partir de uma cópia
if [ -z "${ATUALIZAR_COPIA:-}" ]; then
  COPIA=$(mktemp /tmp/secretaria-atualizar.XXXXXX)
  cp "$0" "$COPIA"
  ATUALIZAR_COPIA=1 exec bash "$COPIA" "$@"
fi
APP_DIR="${APP_DIR:-/opt/secretaria}"
BRANCH="${BRANCH:-main}"
DATA_DIR="${DATA_DIR:-/var/lib/secretaria}"
FLAG="$DATA_DIR/atualizar-agora"
LOG="$DATA_DIR/atualizacao.log"
registrar() { # resultado para o painel e o WhatsApp mostrarem
  [ -d "$DATA_DIR" ] || return 0
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M')" "$*" >> "$LOG" 2>/dev/null || true
  tail -n 30 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" 2>/dev/null || true
  chmod 644 "$LOG" 2>/dev/null || true
}
rm -f "$FLAG" 2>/dev/null || true

# Gatilho "atualizar agora" (botão do painel / comando no WhatsApp): o app cria $FLAG e o systemd roda esta atualização
if [ "$(id -u)" = "0" ] && command -v systemctl >/dev/null 2>&1 && [ -d /etc/systemd/system ] && [ ! -f /etc/systemd/system/secretaria-update-now.path ]; then
  printf '%s\n' "[Unit]" "Description=Atualizar a BIGA quando pedido pelo painel ou WhatsApp" "[Path]" "PathExists=$FLAG" "Unit=secretaria-update.service" "[Install]" "WantedBy=multi-user.target" > /etc/systemd/system/secretaria-update-now.path
  systemctl daemon-reload || true
  systemctl enable --now secretaria-update-now.path >/dev/null 2>&1 || true
fi
cd "$APP_DIR"
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

OLD=$(git rev-parse HEAD)
git fetch -q origin "$BRANCH"
NEW=$(git rev-parse "origin/$BRANCH")
if [ "$OLD" = "$NEW" ]; then
  echo "Já está na versão mais nova ($OLD)."
  registrar "OK já estava na versão mais nova (${OLD:0:7})"
  exit 0
fi

echo "Atualizando $OLD -> $NEW"
rollback() {
  echo "❌ Falhou — voltando para $OLD"
  registrar "ERRO a versão ${NEW:0:7} falhou na verificação; mantida a ${OLD:0:7}"
  git reset -q --hard "$OLD"
  npm ci --omit=dev --no-audit --no-fund --loglevel=error || true
  systemctl restart secretaria || true
  for _ in $(seq 1 20); do curl -fsS --max-time 2 "http://127.0.0.1:${PORT:-3000}/health" >/dev/null 2>&1 && break; sleep 1; done
  exit 1
}
git reset -q --hard "$NEW"
npm ci --omit=dev --no-audit --no-fund --loglevel=error || rollback
node scripts/check.js || rollback
/usr/local/bin/secretaria-backup 2>/dev/null || true
systemctl restart secretaria || rollback

# confere se subiu
for _ in $(seq 1 20); do
  if curl -fsS --max-time 3 "http://127.0.0.1:${PORT:-3000}/health" >/dev/null 2>&1; then
    echo "✅ Atualizado para $NEW"
    registrar "OK atualizada de ${OLD:0:7} para ${NEW:0:7}"
    exit 0
  fi
  sleep 2
done
rollback
