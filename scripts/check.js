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
for (const m of ['./src/matcher', './src/sheets', './src/settings', './src/pdf16x9/manager']) {
  try {
    require(path.join(root, m));
  } catch (err) {
    failed++;
    console.error(`❌ Falha ao carregar ${m}: ${err.message}`);
  }
}

// Trava de segurança do deploy: sharp carregado e geração de PDF mínimo válido (%PDF)
(async () => {
  try {
    const sharp = require('sharp');
    if (typeof sharp !== 'function') throw new Error('sharp não exporta função');
  } catch (err) {
    failed++;
    console.error(`❌ Falha ao carregar sharp: ${err.message}`);
  }

  try {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: [1152, 648], margin: 0 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    await new Promise((resolve, reject) => {
      doc.on('end', resolve);
      doc.on('error', reject);
      doc.fontSize(12).text('BIGA Check');
      doc.end();
    });
    const buf = Buffer.concat(chunks);
    if (buf.slice(0, 4).toString() !== '%PDF') {
      throw new Error(`PDF gerado não inicia com %PDF (inicia com "${buf.slice(0, 4).toString()}")`);
    }
  } catch (err) {
    failed++;
    console.error(`❌ Falha na geração mínima de PDF: ${err.message}`);
  }

  console.log(failed ? `\n${failed} erro(s).` : `✅ ${files.length} arquivos verificados, 0 erros.`);
  process.exit(failed ? 1 : 0);
})();
