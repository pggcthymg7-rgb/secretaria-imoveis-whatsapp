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
cd "$APP_DIR"
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

OLD=$(git rev-parse HEAD)
git fetch -q origin "$BRANCH"
NEW=$(git rev-parse "origin/$BRANCH")
if [ "$OLD" = "$NEW" ]; then
  echo "Já está na versão mais nova ($OLD)."
  exit 0
fi

echo "Atualizando $OLD -> $NEW"
rollback() {
  echo "❌ Falhou — voltando para $OLD"
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
    exit 0
  fi
  sleep 2
done
rollback
