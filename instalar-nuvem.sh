#!/usr/bin/env bash
# Mantido por compatibilidade: o instalador oficial agora é deploy/instalar-vm.sh
exec bash "$(dirname "$0")/deploy/instalar-vm.sh" "$@"
