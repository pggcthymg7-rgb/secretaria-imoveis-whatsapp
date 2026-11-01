// Verificação estática: sintaxe de todos os .js do projeto (equivalente a um "build" em JS puro)
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    if (['node_modules', '.git', 'auth_info_baileys', 'fotos'].includes(f)) continue;
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.js')) files.push(p);
  }
})(root);

let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (err) {
    failed++;
    console.error(`❌ ${path.relative(root, f)}\n${err.stderr.toString()}`);
  }
}
// Os módulos principais precisam carregar sem erro
process.env.DATA_DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'check-'));
for (const m of ['./src/matcher', './src/sheets', './src/settings']) {
  try {
    require(path.join(root, m));
  } catch (err) {
    failed++;
    console.error(`❌ Falha ao carregar ${m}: ${err.message}`);
  }
}
console.log(failed ? `\n${failed} erro(s).` : `✅ ${files.length} arquivos verificados, 0 erros.`);
process.exit(failed ? 1 : 0);
