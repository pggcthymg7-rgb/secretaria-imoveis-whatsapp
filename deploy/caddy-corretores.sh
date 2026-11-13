#!/usr/bin/env bash
# HTTPS do painel de cada corretor da equipe: <id>.<DOMINIO> -> BIGA principal (que abre a BIGA dele).
# Roda como root: pelo corretores.sh (toda atualização) e pelo systemd quando o app pede
# (arquivo DATA_DIR/caddy-sincronizar, criado ao cadastrar um corretor novo no painel do admin).
# Nunca deixa o Caddy inválido: se a configuração nova não validar, volta a anterior.
set -euo pipefail
MAIN_DATA="${DATA_DIR:-/var/lib/secretaria}"
MAIN_ENV="${MAIN_ENV:-/etc/secretaria.env}"
CADDY_DIR="${CADDY_DIR:-/etc/caddy/corretores}"
CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
rm -f "$MAIN_DATA/caddy-sincronizar" 2>/dev/null || true
command -v caddy >/dev/null 2>&1 || exit 0
[ -d "$MAIN_DATA/tenants" ] || exit 0
dominio=$(grep -E '^DOMINIO=' "$MAIN_ENV" 2>/dev/null | tail -1 | cut -d= -f2- || true)
porta=$(grep -E '^PORT=' "$MAIN_ENV" 2>/dev/null | tail -1 | cut -d= -f2 || true)
porta="${porta:-3000}"
[[ "$dominio" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || { echo "AVISO: DOMINIO ausente ou inválido em $MAIN_ENV" >&2; exit 0; }
[[ "$porta" =~ ^[0-9]{2,5}$ ]] || porta=3000

mkdir -p "$CADDY_DIR"
backup=$(mktemp -d)
cp -a "$CADDY_DIR/." "$backup/" 2>/dev/null || true
cp -a "$CADDYFILE" "$backup/Caddyfile.orig" 2>/dev/null || true
mudou=0
for d in "$MAIN_DATA"/tenants/*/; do
  [ -d "$d" ] || continue
  id=$(basename "$d")
  # o nome da pasta vem do app (usuário sem privilégio): só passa o formato exato
  [[ "$id" =~ ^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$ ]] || continue
  [ -f "$d/config.json" ] || continue
  novo=$(printf '%s.%s {\n\tencode gzip\n\treverse_proxy 127.0.0.1:%s\n\theader {\n\t\tStrict-Transport-Security "max-age=31536000"\n\t\t-Server\n\t}\n}\n' "$id" "$dominio" "$porta")
  if [ "$(cat "$CADDY_DIR/$id.caddy" 2>/dev/null)" != "$novo" ]; then
    printf '%s' "$novo" > "$CADDY_DIR/$id.caddy"
    mudou=1
  fi
done
if ls "$CADDY_DIR"/*.caddy >/dev/null 2>&1 && ! grep -q "^import $CADDY_DIR/\*.caddy" "$CADDYFILE"; then
  printf '\nimport %s/*.caddy\n' "$CADDY_DIR" >> "$CADDYFILE"
  mudou=1
fi
if [ "$mudou" = 1 ]; then
  if caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
    systemctl reload caddy 2>/dev/null || systemctl restart caddy || true
    echo "Endereços dos corretores atualizados no Caddy."
  else
    rm -f "$CADDY_DIR"/*.caddy
    cp -a "$backup/." "$CADDY_DIR/" 2>/dev/null || true
    rm -f "$CADDY_DIR/Caddyfile.orig"
    cp -a "$backup/Caddyfile.orig" "$CADDYFILE" 2>/dev/null || true
    echo "AVISO: configuração do Caddy inválida; mantida a anterior" >&2
  fi
fi
rm -rf "$backup"
