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
registrar() { # resultado para o painel e o WhatsApp mostrarem (BIGA principal e as dos corretores extras)
  local d l
  for d in "$DATA_DIR" /var/lib/secretaria-*; do
    [ -d "$d" ] || continue
    l="$d/atualizacao.log"
    printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M')" "$*" >> "$l" 2>/dev/null || true
    tail -n 30 "$l" > "$l.tmp" 2>/dev/null && mv "$l.tmp" "$l" 2>/dev/null || true
    chmod 644 "$l" 2>/dev/null || true
  done
}
corretores() { # BIGAs dos corretores extras (deploy/corretores.conf); nunca derruba a atualização
  [ "$(id -u)" = "0" ] && [ -f "$APP_DIR/deploy/corretores.sh" ] || return 0
  APP_DIR="$APP_DIR" DATA_DIR="$DATA_DIR" bash "$APP_DIR/deploy/corretores.sh" "$@" || registrar "AVISO falha ao preparar as BIGAs dos corretores extras"
}
rm -f "$FLAG" /var/lib/secretaria-*/atualizar-agora 2>/dev/null || true

# Mapa aberto (OSM): se ainda não existe em DATA_DIR, gera agora (não trava a atualização se a internet falhar)
garantir_mapa() {
  [ -f "$DATA_DIR/mapa-osm.json" ] && return 0
  [ -f "$APP_DIR/scripts/atualizar-mapa.js" ] || return 0
  echo "Gerando o mapa aberto (OSM)..."
  local cmd=(env DATA_DIR="$DATA_DIR" timeout 900 node "$APP_DIR/scripts/atualizar-mapa.js")
  if [ "$(id -u)" = "0" ] && id -u secretaria >/dev/null 2>&1; then cmd=(runuser -u secretaria -- "${cmd[@]}"); fi
  if (cd "$APP_DIR" && "${cmd[@]}" >/dev/null 2>&1); then registrar "OK mapa aberto gerado"; else registrar "AVISO mapa aberto não gerado (tenta de novo amanhã)"; fi
}

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
  garantir_mapa || true
  corretores
  exit 0
fi

echo "Atualizando $OLD -> $NEW"
rollback() {
  echo "❌ Falhou — voltando para $OLD"
  registrar "ERRO a versão ${NEW:0:7} falhou na verificação; mantida a ${OLD:0:7}"
  git reset -q --hard "$OLD"
  npm ci --omit=dev --no-audit --no-fund --loglevel=error || true
  systemctl restart secretaria || true
  corretores --reiniciar
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
    garantir_mapa || true
    corretores --reiniciar
    exit 0
  fi
  sleep 2
done
rollback
