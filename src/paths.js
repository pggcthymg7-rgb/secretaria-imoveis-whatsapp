/**
 * Caminhos de dados persistentes.
 * DATA_DIR permite apontar para um disco persistente (Render Disk, VM, volume Docker)
 * sem mudar o código. Padrão: raiz do projeto (compatível com as versões anteriores).
 */
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : ROOT_DIR;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function dataPath(...parts) {
  return path.join(DATA_DIR, ...parts);
}

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  dataPath,
  FOTOS_DIR: dataPath('fotos'),
  AUTH_DIR: dataPath('auth_info_baileys'),
  SETTINGS_PATH: dataPath('settings.json'),
  CSV_PATH: dataPath('imoveis.csv'),
  KNOWN_CONTACTS_PATH: dataPath('known_contacts.json')
};
