'use strict';
require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { LOCK_FILE, adquirirTrava } = require('../src/pdf16x9/lock');
const { hashArquivo, obterFotoReduzida, limparCacheSeNecessario } = require('../src/pdf16x9/cache-fotos');
const { gerarPdfComFallback, invalidarCache, carregarKit, salvarKit, salvarFicha16x9, validarLogoPath, limparCachePdfSeNecessario, shutdown, CACHE_PDF_DIR } = require('../src/pdf16x9/manager');
const { FOTOS_DIR, DATA_DIR } = require('../src/paths');

test('PDF 16:9 Manager: Trava atômica via PID e recuperação de trava órfã', async () => {
  // Limpa trava se houver
  try { fs.unlinkSync(LOCK_FILE); } catch {}

  // 1. Aquisição normal
  const liberar = await adquirirTrava({ timeoutMs: 1000 });
  assert.ok(fs.existsSync(LOCK_FILE), 'arquivo de trava deve existir');
  const conteudo = fs.readFileSync(LOCK_FILE, 'utf8').trim();
  assert.equal(conteudo, String(process.pid), 'trava contém o PID do processo atual');
  await liberar();
  assert.ok(!fs.existsSync(LOCK_FILE), 'arquivo de trava removido após liberar');

  // 2. Trava órfã: simulando um PID inexistente (ex: 9999999)
  fs.writeFileSync(LOCK_FILE, '9999999', 'utf8');
  // Deve detectar ESRCH, limpar a trava velha e adquirir com sucesso
  const liberarOrfa = await adquirirTrava({ timeoutMs: 2000 });
  assert.ok(fs.existsSync(LOCK_FILE));
  assert.equal(fs.readFileSync(LOCK_FILE, 'utf8').trim(), String(process.pid));
  await liberarOrfa();
});

test('PDF 16:9 Manager: Cache de fotos reduzidas e cálculo de SHA-256', async () => {
  const dirCache = path.join(os.tmpdir(), 'teste-cache-fotos-' + Date.now());
  const fotoTemp = path.join(dirCache, 'foto-teste.jpg');
  fs.mkdirSync(dirCache, { recursive: true });

  // Cria JPEG 100x100 válido
  const JPG_VALIDO = Buffer.from('/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCABkAGQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAYI/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AnQCOaRAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf/2Q==', 'base64');
  fs.writeFileSync(fotoTemp, JPG_VALIDO);

  const hash1 = hashArquivo(fotoTemp);
  assert.ok(hash1 && hash1.length === 64, 'calcula SHA-256 de 64 hexchars');

  const res1 = await obterFotoReduzida(fotoTemp, dirCache);
  assert.ok(res1 && res1.buf, 'foto reduzida gerada');
  assert.ok(res1.w > 0 && res1.h > 0);

  // Segunda chamada deve usar o cache
  const res2 = await obterFotoReduzida(fotoTemp, dirCache);
  assert.equal(res2.w, res1.w);
  assert.equal(res2.h, res1.h);

  // Foto corrompida não estoura exceção, retorna null
  const fotoCorrompida = path.join(dirCache, 'corrompida.jpg');
  fs.writeFileSync(fotoCorrompida, Buffer.from('lixo-nao-jpeg'));
  const resErro = await obterFotoReduzida(fotoCorrompida, dirCache);
  assert.equal(resErro, null, 'foto corrompida retorna null com segurança');

  // Limpeza de cache
  limparCacheSeNecessario(dirCache, 10); // força limpeza com teto baixo
});

test('PDF 16:9 Manager: Geração de PDF via Worker Thread e Fallback A4', async () => {
  const imovelTeste = {
    id: '991',
    tipo: 'Apartamento',
    edificio: 'Edifício Horizonte',
    setor: 'Setor Marista',
    cidade: 'Goiânia',
    valor: 1200000,
    quartos: 3,
    suites: 3,
    vagas: 2,
    tamanho_m2: 135,
    descricao: 'Lindo apartamento com varanda e vista aberta.'
  };

  // 1. Geração com sucesso via Worker Thread
  const res = await gerarPdfComFallback(imovelTeste, { forcar: true });
  assert.equal(res.buffer.slice(0, 4).toString(), '%PDF', 'PDF 16:9 gerado');
  assert.equal(res.isFallback, false, 'não deve ser fallback');
  assert.ok(res.nomeArquivo.endsWith('.pdf'));

  // 2. Segunda chamada (cache de PDF pronto)
  const resCache = await gerarPdfComFallback(imovelTeste, { forcar: false });
  assert.equal(resCache.isFallback, false);
  assert.equal(resCache.buffer.slice(0, 4).toString(), '%PDF');

  // 3. Invalidação de cache
  invalidarCache(imovelTeste.id);

  // 4. Teste de Fallback automático: passando modelo inválido que forza falha no gerador
  const resFallback = await gerarPdfComFallback(imovelTeste, { modelo: 'MODELO_INEXISTENTE', forcar: true });
  assert.equal(resFallback.isFallback, true, 'ativa fallback automaticamente');
  assert.equal(resFallback.buffer.slice(0, 4).toString(), '%PDF', 'entrega PDF A4');
  assert.ok(resFallback.erroOriginal, 'registra o motivo do erro original');
});

test('Agente 5: lock vazio/corrompido expira, id traversal fica preso no cache, logoPath externo é bloqueado, protótipo barrado e cache PDF tem LRU', async () => {
  try { fs.unlinkSync(LOCK_FILE); } catch {}

  // Lock vazio antigo (>5s) é recuperado com segurança
  fs.writeFileSync(LOCK_FILE, '', 'utf8');
  const antigo = new Date(Date.now() - 10000);
  fs.utimesSync(LOCK_FILE, antigo, antigo);
  const libVazio = await adquirirTrava({ timeoutMs: 2000 });
  assert.equal(fs.readFileSync(LOCK_FILE, 'utf8').trim(), String(process.pid));
  await libVazio();

  // Trava viva antiga (>maxAgeMs) é recuperada
  fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
  fs.utimesSync(LOCK_FILE, antigo, antigo);
  const libVelho = await adquirirTrava({ timeoutMs: 2000, maxAgeMs: 2000 });
  await libVelho();

  // logoPath fora de DATA_DIR/FOTOS_DIR é rejeitado; dentro de DATA_DIR é aceito
  assert.equal(validarLogoPath('/etc/passwd'), null);
  assert.equal(validarLogoPath('../.env'), null);
  const logoLocal = path.join(DATA_DIR, 'logo-teste.png');
  fs.writeFileSync(logoLocal, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  assert.equal(validarLogoPath(logoLocal), path.resolve(logoLocal));
  assert.equal(salvarKit({ logoPath: '/etc/passwd' }).logoPath, null);

  // Bloqueio de protótipo em salvarFicha16x9 e em MODELOS['constructor']
  assert.throws(() => salvarFicha16x9('__proto__', { titulo: 'x' }), /inválido/);
  const fbCtor = await gerarPdfComFallback({ id: '../../evil_id', tipo: 'Apartamento', setor: 'Setor Bueno', valor: 500000 }, { modelo: 'constructor', forcar: true });
  assert.equal(fbCtor.isFallback, true, 'chave de protótipo constructor não pode enganar MODELOS');
  assert.equal(fbCtor.buffer.slice(0, 4).toString(), '%PDF');
  assert.ok(!fs.existsSync(path.join(DATA_DIR, 'evil_id.pdf')));

  // Evicção LRU em CACHE_PDF_DIR
  const lruDir = path.join(DATA_DIR, 'lru_pdf_test');
  fs.mkdirSync(lruDir, { recursive: true });
  fs.writeFileSync(path.join(lruDir, 'a.pdf'), Buffer.alloc(600, 65));
  fs.writeFileSync(path.join(lruDir, 'b.pdf'), Buffer.alloc(600, 66));
  fs.utimesSync(path.join(lruDir, 'a.pdf'), antigo, antigo);
  limparCachePdfSeNecessario(lruDir, 800);
  assert.equal(fs.existsSync(path.join(lruDir, 'a.pdf')), false, 'PDF mais antigo deve sair na limpeza LRU');
  assert.equal(fs.existsSync(path.join(lruDir, 'b.pdf')), true);
  shutdown();
});
