#!/usr/bin/env bash
# Traz um corretor extra (BIGA própria, outro processo/porta) para DENTRO da BIGA principal
# (modo equipe / multi-tenant). Roda como root; chamado pelo deploy/corretores.sh para cada nome
# em deploy/migrar.conf. Pode rodar quantas vezes quiser: depois de migrado, só garante a antiga desligada.
#   bash deploy/migrar-corretor.sh laura
# Ela continua com TUDO dela: painel no mesmo endereço e com a mesma senha, WhatsApp, dados e chaves.
# Segurança: para a BIGA antiga antes de copiar (a mesma sessão de WhatsApp em 2 processos derruba
# as duas), faz backup, e se a principal não subir volta tudo como estava.
# A pasta antiga (/var/lib/secretaria-<nome>) NÃO é apagada: fica como garantia.
set -euo pipefail
nome="${1:-}"
[[ "$nome" =~ ^[a-z][a-z0-9]{1,19}$ ]] || { echo "uso: migrar-corretor.sh <nome>" >&2; exit 1; }
[ "$(id -u)" = "0" ] || { echo "Rode como root." >&2; exit 1; }

APP_DIR="${APP_DIR:-/opt/secretaria}"
MAIN_DATA="${DATA_DIR:-/var/lib/secretaria}"
MAIN_ENV="${MAIN_ENV:-/etc/secretaria.env}"
APP_USER="${APP_USER:-secretaria}"
svc="secretaria-$nome"
old_data="/var/lib/secretaria-$nome"
old_env="/etc/secretaria-$nome.env"
bkp="/var/backups/secretaria-$nome"
tenant="$MAIN_DATA/tenants/$nome"
sess="$MAIN_DATA/sessions_storage/$nome"
porta=$(grep -E '^PORT=' "$MAIN_ENV" 2>/dev/null | tail -1 | cut -d= -f2 || true)
porta="${porta:-3000}"

endereco_na_principal() {
  # mesmo endereço de sempre (<nome>.<DOMINIO>), agora apontando para a BIGA principal
  DATA_DIR="$MAIN_DATA" MAIN_ENV="$MAIN_ENV" bash "$APP_DIR/deploy/caddy-corretores.sh" || true
}
desligar_antiga() {
  systemctl disable --now "$svc.service" "$svc-update-now.path" "$svc-backup.timer" >/dev/null 2>&1 || true
  endereco_na_principal
}

if [ -f "$tenant/config.json" ]; then
  desligar_antiga
  echo "$nome: já está na BIGA principal."
  exit 0
fi
if [ ! -d "$old_data" ]; then
  echo "$nome: nada a migrar ($old_data não existe)."
  exit 0
fi

echo "Migrando a BIGA de $nome para a BIGA principal..."
# Modo equipe ligado na principal
if grep -q '^MULTI_TENANT=' "$MAIN_ENV"; then sed -i 's/^MULTI_TENANT=.*/MULTI_TENANT=1/' "$MAIN_ENV"; else echo 'MULTI_TENANT=1' >> "$MAIN_ENV"; fi

voltar() {
  trap - ERR
  echo "❌ Migração de $nome falhou — voltando como estava" >&2
  rm -rf "$tenant" "$sess"
  systemctl restart secretaria || true
  systemctl start "$svc.service" || true
  exit 1
}

# 1) para a antiga (libera a sessão do WhatsApp) e faz backup
systemctl stop "$svc.service" 2>/dev/null || true
mkdir -p "$bkp"
tar -czf "$bkp/pre-migracao-$(date +%Y%m%d-%H%M%S).tar.gz" -C "$old_data" .
chmod 600 "$bkp"/*.tar.gz
trap voltar ERR

# 2) copia dados, sessão e chaves (config.json por último = concluído)
(cd "$APP_DIR" && node scripts/migrar-corretor.js --nome "$nome" --dados "$old_data" --env "$old_env" --destino "$MAIN_DATA")
chown -R "$APP_USER:$APP_USER" "$MAIN_DATA/tenants" "$MAIN_DATA/sessions_storage"
chmod 700 "$MAIN_DATA/tenants" "$MAIN_DATA/sessions_storage" "$tenant" "$sess" 2>/dev/null || chmod 700 "$MAIN_DATA/tenants" "$tenant"

# 3) reinicia a principal (ela religa o corretor sozinha) e confere
systemctl restart secretaria
ok=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 3 "http://127.0.0.1:$porta/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
[ "$ok" = 1 ] || voltar
sleep 5
if command -v journalctl >/dev/null 2>&1 && journalctl -u secretaria --since "-3min" --no-pager 2>/dev/null | grep -q "\[tenant:$nome\] Falha ao religar"; then voltar; fi
trap - ERR

# 4) antiga desligada de vez (serviço, atualização e backup próprios); o endereço e a senha do painel
#    continuam os mesmos, agora servidos pela principal
desligar_antiga
echo "✅ $nome agora roda dentro da BIGA principal (dados antigos preservados em $old_data, backup em $bkp)."
