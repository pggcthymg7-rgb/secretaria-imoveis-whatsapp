#!/bin/bash
set -e

echo "==================================================="
echo "🚀 INSTALADOR AUTOMÁTICO - SECRETÁRIA IMOBILIÁRIA"
echo "==================================================="

# 1. Instalar Node.js 20 LTS se não estiver instalado
if ! command -v node &> /dev/null; then
  echo "📦 Instalando Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs git build-essential
fi

# 2. Instalar PM2 (gerenciador que mantém a secretária ligada 24h)
if ! command -v pm2 &> /dev/null; then
  echo "⚙️ Instalando PM2 (modo 24h)..."
  sudo npm install -g pm2
fi

# 3. Liberar porta 3000 no firewall interno do Ubuntu (se existir)
if command -v ufw &> /dev/null; then
  sudo ufw allow 3000/tcp || true
fi
sudo iptables -I INPUT -p tcp --dport 3000 -j ACCEPT 2>/dev/null || true

# 4. Instalar dependências do projeto
echo "📚 Instalando pacotes do projeto..."
npm install --omit=dev

# 5. Iniciar a Secretária no PM2 e configurar início automático se o servidor reiniciar
echo "▶️ Iniciando Secretária em modo 24/7..."
pm2 delete secretaria-imoveis 2>/dev/null || true
pm2 start index.js --name "secretaria-imoveis"
pm2 save
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME || true

IP_PUBLICO=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')
echo ""
echo "==================================================="
echo "✅ TUDO PRONTO! A SECRETÁRIA ESTÁ RODANDO 24 HORAS!"
echo "🌐 Acesse seu Painel Mini-CRM em: http://${IP_PUBLICO}:3000"
echo "==================================================="
