#!/usr/bin/env bash
# Cria/atualiza as BIGAs dos corretores extras listados em deploy/corretores.conf.
# Roda como root, chamado pelo deploy/atualizar.sh. Pode rodar quantas vezes quiser.
#   bash deploy/corretores.sh            -> garante que cada BIGA existe e está ligada
#   bash deploy/corretores.sh --reiniciar -> idem e reinicia todas (código novo)
#   bash deploy/corretores.sh --checar    -> só confere o arquivo (usado nos testes)
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/secretaria}"
CONF="${CORRETORES_CONF:-$APP_DIR/deploy/corretores.conf}"
MAIN_DATA="${DATA_DIR:-/var/lib/secretaria}"
MODO="${1:-}"

rand() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }

# Lê e valida o arquivo (roda como root: nada fora do formato passa)
ENTRADAS=()
VISTO_NOMES=" "
VISTO_PORTAS=" "
VISTO_DOMS=" "
while IFS= read -r linha || [ -n "$linha" ]; do
  linha="${linha%%#*}"
  read -r nome dominio porta extra <<<"$linha" || true
  [ -z "${nome:-}" ] && continue
  if [ -n "${extra:-}" ] || ! [[ "$nome" =~ ^[a-z][a-z0-9]{1,19}$ ]] || ! [[ "${dominio:-}" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || ! [[ "${porta:-}" =~ ^3[0-9]{3}$ ]] || [ "$porta" -lt 3001 ]; then
    echo "ERRO: linha inválida em corretores.conf: '$linha'" >&2
    exit 1
  fi
  case "$VISTO_NOMES" in *" $nome "*)
    echo "ERRO: nome, porta ou endereço repetido em corretores.conf: '$linha'" >&2
    exit 1 ;;
  esac
  case "$VISTO_PORTAS" in *" $porta "*)
    echo "ERRO: nome, porta ou endereço repetido em corretores.conf: '$linha'" >&2
    exit 1 ;;
  esac
  case "$VISTO_DOMS" in *" $dominio "*)
    echo "ERRO: nome, porta ou endereço repetido em corretores.conf: '$linha'" >&2
    exit 1 ;;
  esac
  VISTO_NOMES="${VISTO_NOMES}${nome} "
  VISTO_PORTAS="${VISTO_PORTAS}${porta} "
  VISTO_DOMS="${VISTO_DOMS}${dominio} "
  ENTRADAS+=("$nome $dominio $porta")
done < "$CONF"

if [ "$MODO" = "--checar" ]; then
  printf '%s\n' "${ENTRADAS[@]}"
  exit 0
fi
if [ "$(id -u)" != "0" ]; then
  echo "Rode como root." >&2
  exit 1
fi

# HTTPS do painel de cada corretor da equipe (<id>.<DOMINIO>): agora e sempre que o app pedir
if [ -f "$APP_DIR/deploy/caddy-corretores.sh" ] && [ -d /etc/systemd/system ]; then
  printf '%s\n' "[Unit]" "Description=Endereço HTTPS de corretor novo da BIGA" "[Path]" "PathExists=$MAIN_DATA/caddy-sincronizar" "Unit=secretaria-caddy-sync.service" "[Install]" "WantedBy=multi-user.target" > /etc/systemd/system/secretaria-caddy-sync.path
  printf '%s\n' "[Unit]" "Description=Publica os endereços HTTPS dos corretores da BIGA" "[Service]" "Type=oneshot" "Environment=DATA_DIR=$MAIN_DATA" "ExecStart=/usr/bin/env bash $APP_DIR/deploy/caddy-corretores.sh" > /etc/systemd/system/secretaria-caddy-sync.service
  systemctl daemon-reload || true
  systemctl enable --now secretaria-caddy-sync.path >/dev/null 2>&1 || true
  DATA_DIR="$MAIN_DATA" bash "$APP_DIR/deploy/caddy-corretores.sh" </dev/null || echo "AVISO: endereços HTTPS dos corretores não atualizados" >&2
fi
# Quem já roda dentro da principal nunca volta a ter processo próprio
FILTRADAS=()
for e in "${ENTRADAS[@]}"; do
  read -r enome _ <<<"$e"
  if [ -f "$MAIN_DATA/tenants/$enome/config.json" ]; then echo "$enome já está na BIGA principal: ignorado em corretores.conf" >&2; continue; fi
  FILTRADAS+=("$e")
done
ENTRADAS=("${FILTRADAS[@]}")

CADDY_MUDOU=0
LISTA_JSON="["
for e in "${ENTRADAS[@]}"; do
  read -r nome dominio porta <<<"$e"
  svc="secretaria-$nome"
  user="secretaria-$nome"
  data="/var/lib/secretaria-$nome"
  envf="/etc/secretaria-$nome.env"
  bkp="/var/backups/secretaria-$nome"

  id -u "$user" >/dev/null 2>&1 || useradd --system --home-dir "$data" --shell /usr/sbin/nologin "$user"
  mkdir -p "$data/fotos" "$bkp"
  chown -R "$user:$user" "$data"
  chmod 750 "$data"

  # Configuração própria (senha do painel é criada por ela no 1º acesso com o código abaixo)
  touch "$envf"; chown root:"$user" "$envf"; chmod 640 "$envf"
  setenv() { grep -q "^$1=" "$envf" || printf '%s=%s\n' "$1" "$2" >> "$envf"; }
  setenv NODE_ENV production
  setenv PORT "$porta"
  setenv DATA_DIR "$data"
  setenv HOST 127.0.0.1
  setenv DOMINIO "$dominio"
  setenv PUBLIC_URL "https://$dominio"
  setenv API_TOKEN "$(rand 32)"
  setenv SESSION_SECRET "$(rand 32)"
  setenv SETUP_CODE "$(rand 5 | tr 'a-f' 'A-F')"

  cat > "/etc/systemd/system/$svc.service" <<UNIT
[Unit]
Description=BIGA de $nome (WhatsApp)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$user
Group=$user
WorkingDirectory=$APP_DIR
EnvironmentFile=$envf
ExecStart=/usr/bin/env node index.js
Restart=always
RestartSec=5
TimeoutStopSec=20
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$data
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictSUIDSGID=true

[Install]
WantedBy=multi-user.target
UNIT
  # Botão/comando "atualizar" da BIGA dela também atualiza
  cat > "/etc/systemd/system/$svc-update-now.path" <<UNIT
[Unit]
Description=Atualizar quando a BIGA de $nome pedir
[Path]
PathExists=$data/atualizar-agora
Unit=secretaria-update.service
[Install]
WantedBy=multi-user.target
UNIT
  # Backup diário próprio (14 dias)
  cat > "/etc/systemd/system/$svc-backup.service" <<UNIT
[Unit]
Description=Backup diario da BIGA de $nome
[Service]
Type=oneshot
ExecStart=/usr/bin/env bash -c 'mkdir -p $bkp && tar -czf $bkp/$svc-\$\$(date +%%Y%%m%%d-%%H%%M).tar.gz -C $data . && chmod 600 $bkp/*.tar.gz && ls -1t $bkp/*.tar.gz | tail -n +15 | xargs -r rm -f'
UNIT
  cat > "/etc/systemd/system/$svc-backup.timer" <<UNIT
[Unit]
Description=Backup diario da BIGA de $nome (03:40)
[Timer]
OnCalendar=*-*-* 03:40:00
Persistent=true
[Install]
WantedBy=timers.target
UNIT

  # Endereço HTTPS próprio (Caddy)
  if command -v caddy >/dev/null 2>&1; then
    mkdir -p /etc/caddy/corretores
    novo=$(printf '%s {\n\tencode gzip\n\treverse_proxy 127.0.0.1:%s\n\theader {\n\t\tStrict-Transport-Security "max-age=31536000"\n\t\t-Server\n\t}\n}\n' "$dominio" "$porta")
    if [ "$(cat "/etc/caddy/corretores/$nome.caddy" 2>/dev/null)" != "$novo" ]; then
      printf '%s' "$novo" > "/etc/caddy/corretores/$nome.caddy"
      CADDY_MUDOU=1
    fi
  fi

  # Convite para o João ver no WhatsApp dele (comando "corretores"); o código some quando ela cria a senha
  codigo=""
  grep -q '"hash"' "$data/auth.json" 2>/dev/null || codigo=$(grep '^SETUP_CODE=' "$envf" | cut -d= -f2)
  LISTA_JSON+="{\"nome\":\"$nome\",\"url\":\"https://$dominio\",\"codigo\":\"$codigo\"},"
done
LISTA_JSON="${LISTA_JSON%,}]"

systemctl daemon-reload
for e in "${ENTRADAS[@]}"; do
  read -r nome _ <<<"$e"
  systemctl enable --now "secretaria-$nome-update-now.path" "secretaria-$nome-backup.timer" >/dev/null 2>&1 || true
  systemctl enable "secretaria-$nome.service" >/dev/null 2>&1 || true
  if [ "$MODO" = "--reiniciar" ] || ! systemctl is-active --quiet "secretaria-$nome.service"; then
    systemctl restart "secretaria-$nome.service" || echo "AVISO: BIGA de $nome não iniciou (journalctl -u secretaria-$nome -n 50)" >&2
  fi
done

# (o instalar-vm.sh reescreve o Caddyfile: a linha de import é recolocada sempre que faltar)
if [ -f /etc/caddy/Caddyfile ] && [ "${#ENTRADAS[@]}" -gt 0 ] && ! grep -q '^import /etc/caddy/corretores/\*.caddy' /etc/caddy/Caddyfile; then
  printf '\nimport /etc/caddy/corretores/*.caddy\n' >> /etc/caddy/Caddyfile
  CADDY_MUDOU=1
fi
if [ "$CADDY_MUDOU" = 1 ] && command -v caddy >/dev/null 2>&1; then
  if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    systemctl reload caddy 2>/dev/null || systemctl restart caddy || true
  else
    # nunca deixa o Caddy quebrado (derrubaria o painel do João): tira os endereços extras
    sed -i '\#^import /etc/caddy/corretores/\*.caddy#d' /etc/caddy/Caddyfile
    echo "AVISO: configuração do Caddy inválida; endereços extras desativados" >&2
  fi
fi

if [ -d "$MAIN_DATA" ]; then
  printf '%s\n' "$LISTA_JSON" > "$MAIN_DATA/corretores.json.tmp"
  chown secretaria:secretaria "$MAIN_DATA/corretores.json.tmp" 2>/dev/null || true
  chmod 600 "$MAIN_DATA/corretores.json.tmp"
  mv "$MAIN_DATA/corretores.json.tmp" "$MAIN_DATA/corretores.json"
fi
echo "Corretores extras: ${#ENTRADAS[@]}"
