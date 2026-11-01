const { tmp } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const backup = require('../src/backup');
const { app } = require('../index');

const FOTOS = path.join(tmp, 'fotos');

test('Backup leva carteira, configurações, memória e fotos — e restaura igual', () => {
  fs.mkdirSync(FOTOS, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'imoveis.csv'), 'id,tipo,setor\n1,Casa,Setor Bueno\n');
  fs.writeFileSync(path.join(tmp, 'known_contacts.json'), JSON.stringify(['5562999990000']));
  fs.writeFileSync(path.join(tmp, 'settings.json'), JSON.stringify({ gruposMonitoradosIds: ['g1@g.us'] }));
  fs.writeFileSync(path.join(FOTOS, 'casa.jpg'), Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]));
  fs.writeFileSync(path.join(tmp, 'auth.json'), JSON.stringify({ hash: 'segredo' }));

  const buf = backup.createBackup();
  const s = backup.summary(buf);
  assert.ok(s.arquivos.includes('imoveis.csv'));
  assert.ok(s.arquivos.includes('known_contacts.json'));
  assert.ok(!s.arquivos.includes('auth.json'), 'senha/segredo do painel não vão no backup');
  assert.equal(s.fotos, 1);

  // apaga e restaura
  fs.rmSync(path.join(tmp, 'imoveis.csv'));
  fs.rmSync(path.join(FOTOS, 'casa.jpg'));
  const r = backup.restoreBackup(buf);
  assert.equal(r.fotos, 1);
  assert.match(fs.readFileSync(path.join(tmp, 'imoveis.csv'), 'utf-8'), /Setor Bueno/);
  assert.deepEqual([...fs.readFileSync(path.join(FOTOS, 'casa.jpg'))], [0xff, 0xd8, 0xff, 1, 2, 3]);
});

test('Backup malicioso não grava fora da pasta nem arquivos desconhecidos', () => {
  const evil = zlib.gzipSync(Buffer.from(JSON.stringify({
    formato: 'secretaria-backup', versao: 1, criadoEm: 'x',
    arquivos: { '../../evil.json': Buffer.from('{}').toString('base64'), 'auth.json': Buffer.from('{}').toString('base64'), '.env': 'QQ==' },
    fotos: { '../x.jpg': 'QQ==', 'ok.jpg': 'QQ==', 'script.html': 'QQ==' }
  })));
  const r = backup.restoreBackup(evil);
  assert.deepEqual(r.arquivos, []);
  assert.equal(r.fotos, 1);
  assert.ok(!fs.existsSync(path.join(tmp, '..', '..', 'evil.json')));
  assert.ok(!fs.existsSync(path.join(FOTOS, 'script.html')));
});

test('Arquivo que não é backup é recusado', () => {
  assert.throws(() => backup.restoreBackup(Buffer.from('não sou backup nenhum aqui')), /backup/);
  assert.throws(() => backup.restoreBackup(zlib.gzipSync(Buffer.from('{"formato":"outro"}'))), /backup/);
});

test('API: baixar e restaurar backup exige login', async () => {
  const server = await new Promise(r => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let r = await fetch(`${base}/api/backup`);
    assert.equal(r.status, 401);
    r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-secretaria': '1' }, body: JSON.stringify({ senha: process.env.PAINEL_SENHA }) });
    const cookie = r.headers.get('set-cookie').split(';')[0];
    r = await fetch(`${base}/api/backup`, { headers: { cookie } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-disposition'), /secretaria-backup-\d{4}-\d{2}-\d{2}\.json\.gz/);
    const buf = Buffer.from(await r.arrayBuffer());
    assert.ok(backup.summary(buf).arquivos.length > 0);

    const fd = new FormData();
    fd.append('backup', new Blob([buf]), 'b.json.gz');
    r = await fetch(`${base}/api/restore`, { method: 'POST', headers: { cookie, 'x-secretaria': '1' }, body: fd });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ok, true);
  } finally {
    server.close();
  }
});
