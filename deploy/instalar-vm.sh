#!/usr/bin/env bash
# ============================================================================
# INSTALADOR DA SECRETÁRIA IMOBILIÁRIA EM MÁQUINA VIRTUAL (Ubuntu 22.04 / 24.04)
# ============================================================================
# Funciona em Oracle Cloud Always Free, Google Cloud e2-micro ou qualquer VPS Ubuntu.
# Pode ser rodado de novo quantas vezes quiser: atualiza sem perder nada.
#
# Uso (como root):
#   PAINEL_SENHA='sua-senha' MEU_WHATSAPP_ALERTA='5562999999999' bash instalar-vm.sh
#
# Variáveis opcionais:
#   GEMINI_API_KEY   chave grátis do Gemini
#   DOMINIO          seu domínio (padrão: <ip>.sslip.io, HTTPS grátis automático)
#   HTTPS=0          não instala o Caddy (painel em http://IP:3000 — não recomendado)
#   REPO_URL, BRANCH repositório/branch do código (padrão: GitHub oficial, main)
#
# O que ele faz:
#   1. Pacotes do sistema, swap (se pouca memória) e Node.js 22
#   2. Usuário "secretaria" sem login, código em /opt/secretaria
#   3. Memória PERMANENTE em /var/lib/secretaria (sessão do WhatsApp, carteira, fotos, contatos…)
#   4. Configuração secreta em /etc/secretaria.env (só root lê)
#   5. Serviço 24h (systemd): sobe no boot e reinicia sozinho se cair
#   6. HTTPS grátis com Caddy + Let's Encrypt
#   7. Firewall: libera só 22, 80 e 443
#   8. Backup diário local (14 dias) e atualização automática diária com rollback
# ============================================================================
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/pggcthymg7-rgb/secretaria-imoveis-whatsapp.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="/opt/secretaria"
DATA_DIR="/var/lib/secretaria"
ENV_FILE="/etc/secretaria.env"
BACKUP_DIR="/var/backups/secretaria"
APP_USER="secretaria"
HTTPS="${HTTPS:-1}"
PORT_APP=3000
export DEBIAN_FRONTEND=noninteractive

log() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[aviso] %s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode como root: sudo bash $0"
  exit 1
fi
if ! grep -qiE 'ubuntu|debian' /etc/os-release; then
  warn "Testado em Ubuntu 22.04/24.04. Continuando mesmo assim."
fi

# ---------------------------------------------------------------------------
log "1/8 Pacotes do sistema"
apt-get update -y -qq
apt-get install -y -qq curl git ca-certificates gnupg iptables debian-keyring debian-archive-keyring apt-transport-https >/dev/null

# Swap para máquinas com pouca memória (ex: 1 GB)
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$MEM_MB" -lt 2000 ] && ! swapon --show | grep -q .; then
  log "Criando 2 GB de swap (memória: ${MEM_MB} MB)"
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
  fi
  swapon /swapfile 2>/dev/null || warn "não consegui ativar o swap (ambiente sem permissão?)"
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ---------------------------------------------------------------------------
log "2/8 Node.js 22"
NODE_MAJOR=$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0)
if [ "${NODE_MAJOR:-0}" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "Node $(node -v)"

# ---------------------------------------------------------------------------
log "3/8 Usuário e pastas"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$DATA_DIR/fotos" "$BACKUP_DIR"
chmod 750 "$DATA_DIR"
chmod 700 "$BACKUP_DIR"

# ---------------------------------------------------------------------------
log "4/8 Código ($REPO_URL @ $BRANCH)"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch -q origin "$BRANCH"
  git -C "$APP_DIR" reset -q --hard "origin/$BRANCH"
else
  git clone -q --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
(cd "$APP_DIR" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)

# Primeira instalação: a carteira, fotos e configurações que estão no repositório viram o ponto de partida
FIRST_INSTALL=0
if [ ! -f "$DATA_DIR/imoveis.csv" ] && [ ! -f "$DATA_DIR/settings.json" ]; then
  FIRST_INSTALL=1
  [ -f "$APP_DIR/imoveis.csv" ] && cp "$APP_DIR/imoveis.csv" "$DATA_DIR/"
  [ -f "$APP_DIR/settings.json" ] && cp "$APP_DIR/settings.json" "$DATA_DIR/"
  [ -d "$APP_DIR/fotos" ] && cp -n "$APP_DIR"/fotos/* "$DATA_DIR/fotos/" 2>/dev/null || true
fi
chown -R "$APP_USER:$APP_USER" "$DATA_DIR"
chmod -R u=rwX,g=rX,o= "$DATA_DIR"

# ---------------------------------------------------------------------------
log "5/8 Configuração secreta ($ENV_FILE)"
touch "$ENV_FILE"
chown root:"$APP_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"

set_env() { # set_env CHAVE VALOR  (só grava se VALOR não for vazio)
  local key="$1" val="$2"
  [ -z "$val" ] && return 0
  val=$(printf '%s' "$val" | tr -d '\r\n')
  if grep -q "^${key}=" "$ENV_FILE"; then
    local tmp
    tmp=$(mktemp)
    grep -v "^${key}=" "$ENV_FILE" > "$tmp"
    printf '%s=%s\n' "$key" "$val" >> "$tmp"
    cat "$tmp" > "$ENV_FILE"
    rm -f "$tmp"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}
get_env() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }

set_env NODE_ENV production
set_env PORT "$PORT_APP"
set_env DATA_DIR "$DATA_DIR"
set_env PAINEL_SENHA "${PAINEL_SENHA:-}"
set_env MEU_WHATSAPP_ALERTA "${MEU_WHATSAPP_ALERTA:-}"
set_env GEMINI_API_KEY "${GEMINI_API_KEY:-}"
[ -z "$(get_env API_TOKEN)" ] && set_env API_TOKEN "$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
[ -z "$(get_env SESSION_SECRET)" ] && set_env SESSION_SECRET "$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"

if [ -z "$(get_env PAINEL_SENHA)" ]; then
  warn "PAINEL_SENHA não definida: o painel vai pedir um código de configuração (veja: journalctl -u secretaria | grep CÓDIGO)."
fi

# ---------------------------------------------------------------------------
log "6/8 Serviço 24h (systemd)"
PUBLIC_IP=$(curl -fsS -4 --max-time 8 https://api.ipify.org 2>/dev/null || curl -fsS -4 --max-time 8 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
if [ "$HTTPS" = "1" ]; then
  DOMINIO="${DOMINIO:-$(get_env DOMINIO)}"
  DOMINIO="${DOMINIO:-$(echo "$PUBLIC_IP" | tr '.' '-').sslip.io}"
  set_env DOMINIO "$DOMINIO"
  set_env HOST 127.0.0.1
  set_env PUBLIC_URL "https://$DOMINIO"
else
  set_env HOST 0.0.0.0
  set_env PUBLIC_URL "http://$PUBLIC_IP:$PORT_APP"
fi

cat > /etc/systemd/system/secretaria.service <<EOF
[Unit]
Description=Secretaria Imobiliaria (WhatsApp)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/env node index.js
Restart=always
RestartSec=5
TimeoutStopSec=20
# Proteções: o processo só escreve na pasta de dados
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DATA_DIR
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictSUIDSGID=true

[Install]
WantedBy=multi-user.target
EOF

# Backup diário local (14 dias) — inclui a sessão do WhatsApp, fica só nesta máquina
cat > /usr/local/bin/secretaria-backup <<EOF
#!/usr/bin/env bash
set -e
mkdir -p $BACKUP_DIR
tar -czf $BACKUP_DIR/secretaria-\$(date +%Y%m%d-%H%M).tar.gz -C $DATA_DIR .
chmod 600 $BACKUP_DIR/*.tar.gz
ls -1t $BACKUP_DIR/secretaria-*.tar.gz | tail -n +15 | xargs -r rm -f
EOF
chmod 755 /usr/local/bin/secretaria-backup

cat > /etc/systemd/system/secretaria-backup.service <<EOF
[Unit]
Description=Backup diario da Secretaria
[Service]
Type=oneshot
ExecStart=/usr/local/bin/secretaria-backup
EOF
cat > /etc/systemd/system/secretaria-backup.timer <<EOF
[Unit]
Description=Backup diario da Secretaria (03:30)
[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
[Install]
WantedBy=timers.target
EOF

# Atualização automática diária (só reinicia se a verificação passar; senão volta à versão anterior)
cat > /etc/systemd/system/secretaria-update.service <<EOF
[Unit]
Description=Atualizacao automatica da Secretaria
[Service]
Type=oneshot
Environment=APP_DIR=$APP_DIR BRANCH=$BRANCH
ExecStart=/usr/bin/env bash $APP_DIR/deploy/atualizar.sh
EOF
cat > /etc/systemd/system/secretaria-update.timer <<EOF
[Unit]
Description=Atualizacao automatica da Secretaria (04:15)
[Timer]
OnCalendar=*-*-* 04:15:00
RandomizedDelaySec=900
Persistent=true
[Install]
WantedBy=timers.target
EOF

timedatectl set-timezone America/Sao_Paulo 2>/dev/null || true
systemctl daemon-reload || warn "systemd indisponível"
systemctl enable --now secretaria-backup.timer secretaria-update.timer >/dev/null 2>&1 || warn "timers não habilitados"
systemctl enable secretaria.service >/dev/null 2>&1 || true
systemctl restart secretaria.service || warn "não consegui iniciar o serviço (veja: journalctl -u secretaria -n 50)"

# ---------------------------------------------------------------------------
log "7/8 Firewall (22, 80, 443)"
open_port() {
  local p="$1"
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow "$p"/tcp >/dev/null
  fi
  # Imagens Ubuntu da Oracle têm regras iptables que bloqueiam tudo além do 22
  local n
  n=$(iptables -L INPUT --line-numbers -n 2>/dev/null | awk '$2=="REJECT" {print $1; exit}')
  if [ -n "$n" ]; then
    iptables -C INPUT -p tcp --dport "$p" -m state --state NEW -j ACCEPT 2>/dev/null ||
      iptables -I INPUT "$n" -p tcp --dport "$p" -m state --state NEW -j ACCEPT
  fi
}
if [ "$HTTPS" = "1" ]; then
  open_port 80
  open_port 443
else
  open_port "$PORT_APP"
fi
if command -v netfilter-persistent >/dev/null 2>&1; then
  netfilter-persistent save >/dev/null 2>&1 || true
elif [ -d /etc/iptables ]; then
  iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
if [ "$HTTPS" = "1" ]; then
  log "8/8 HTTPS grátis (Caddy) em https://$DOMINIO"
  if ! command -v caddy >/dev/null 2>&1; then
    curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y -qq
    apt-get install -y -qq caddy >/dev/null
  fi
  cat > /etc/caddy/Caddyfile <<EOF
$DOMINIO {
	encode gzip
	reverse_proxy 127.0.0.1:$PORT_APP
	header {
		Strict-Transport-Security "max-age=31536000"
		-Server
	}
}
EOF
  systemctl enable caddy >/dev/null 2>&1 || true
  systemctl reload caddy 2>/dev/null || systemctl restart caddy || warn "Caddy não iniciou (veja: journalctl -u caddy -n 50)"
else
  log "8/8 HTTPS desativado (HTTPS=0)"
fi

# ---------------------------------------------------------------------------
sleep 3
STATUS=$(curl -fsS --max-time 5 "http://127.0.0.1:$PORT_APP/health" 2>/dev/null || echo 'ainda iniciando')
URL=$(get_env PUBLIC_URL)
cat <<EOF

=====================================================================
✅ SECRETÁRIA INSTALADA E LIGADA 24 HORAS
=====================================================================
Painel:          $URL
Status local:    $STATUS
Memória:         $DATA_DIR  (permanente)
Configuração:    $ENV_FILE
Backups locais:  $BACKUP_DIR (diário às 03:30, guarda 14)
Atualização:     automática todo dia às ~04:15 (branch $BRANCH)
Primeira vez:    $([ "$FIRST_INSTALL" = 1 ] && echo 'sim — carteira e fotos do repositório copiadas' || echo 'não — memória preservada')

Comandos úteis:
  journalctl -u secretaria -f          (ver o que ela está fazendo)
  systemctl restart secretaria         (reiniciar)
  bash $APP_DIR/deploy/atualizar.sh    (atualizar agora)

Próximo passo: abra o painel, entre com a sua senha e escaneie o QR Code.
Se o HTTPS não abrir, libere as portas 80 e 443 na nuvem (veja GUIA_VM_GRATUITA.md).
=====================================================================
EOF
