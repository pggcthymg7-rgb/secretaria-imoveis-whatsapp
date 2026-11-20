#!/bin/bash
# ============================================================================
# COLE ESTE TEXTO NO CAMPO "cloud-init" / "Script de inicialização" AO CRIAR A VM
# (Oracle: Mostrar opções avançadas > Gerenciamento > Colar script cloud-init)
# (Google: Gerenciamento > Automação > Script de inicialização)
#
# Troque os valores entre aspas abaixo. Só a senha é obrigatória.
# A instalação leva ~5 minutos depois que a máquina liga.
# ============================================================================
set -euo pipefail
export PAINEL_SENHA='TROQUE-POR-UMA-SENHA-FORTE'
export MEU_WHATSAPP_ALERTA=''
export GEMINI_API_KEY=''

curl -fsSL --max-time 60 https://raw.githubusercontent.com/pggcthymg7-rgb/secretaria-imoveis-whatsapp/main/deploy/instalar-vm.sh -o /root/instalar-vm.sh
chmod 700 /root/instalar-vm.sh
bash /root/instalar-vm.sh > /var/log/secretaria-instalacao.log 2>&1
