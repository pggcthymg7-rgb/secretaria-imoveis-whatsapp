#!/usr/bin/env bash
# Prepara a VM para o repositório PRIVADO (GitHub Pro): a atualização automática passa a baixar o código
# com uma chave SÓ DE LEITURA (Deploy key) em vez do link público. Roda como root na VM.
#
#   1) sudo bash /opt/secretaria/deploy/chave-deploy.sh
#        -> cria a chave e mostra a parte pública. Cole em: GitHub › repositório › Settings ›
#           Deploy keys › Add deploy key (NÃO marque "Allow write access").
#   2) sudo bash /opt/secretaria/deploy/chave-deploy.sh --ativar
#        -> testa a chave e só então troca o endereço do repositório na VM. Se falhar, nada muda.
#   3) Só depois do passo 2 dar ✅, torne o repositório privado (Settings › General › Danger Zone).
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/secretaria}"
REPO="${REPO:-pggcthymg7-rgb/secretaria-imoveis-whatsapp}"
KEY="${KEY:-/root/.ssh/biga_deploy}"
KNOWN="/root/.ssh/known_hosts_github"
[ "$(id -u)" = "0" ] || { echo "Rode como root (sudo)." >&2; exit 1; }
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "REPO inválido" >&2; exit 1; }
command -v ssh-keygen >/dev/null 2>&1 || { echo "Falta o ssh: rode  sudo apt-get install -y openssh-client" >&2; exit 1; }
mkdir -p /root/.ssh && chmod 700 /root/.ssh

# Chave pública oficial do GitHub (fixa: não confia no primeiro contato com o servidor)
echo 'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl' > "$KNOWN"
chmod 644 "$KNOWN"
SSH_CMD="ssh -i $KEY -o IdentitiesOnly=yes -o UserKnownHostsFile=$KNOWN -o StrictHostKeyChecking=yes"

if [ ! -f "$KEY" ]; then
  ssh-keygen -q -t ed25519 -N '' -C "biga-vm-deploy-$(hostname)" -f "$KEY"
  chmod 600 "$KEY"
fi

if [ "${1:-}" != "--ativar" ]; then
  echo
  echo "Chave pública (cole em GitHub › $REPO › Settings › Deploy keys › Add deploy key, SEM acesso de escrita):"
  echo
  cat "$KEY.pub"
  echo
  echo "Depois rode: sudo bash $APP_DIR/deploy/chave-deploy.sh --ativar"
  exit 0
fi

URL="git@github.com:$REPO.git"
echo "Testando a chave..."
if ! GIT_SSH_COMMAND="$SSH_CMD" git ls-remote "$URL" HEAD >/dev/null 2>&1; then
  echo "❌ A chave ainda não tem acesso. Confira se ela foi adicionada em Deploy keys de $REPO." >&2
  exit 1
fi
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
git -C "$APP_DIR" config core.sshCommand "$SSH_CMD"
git -C "$APP_DIR" remote set-url origin "$URL"
git -C "$APP_DIR" fetch -q origin main
echo "✅ VM pronta: a atualização automática agora usa a chave de leitura. Já pode tornar o repositório privado."
