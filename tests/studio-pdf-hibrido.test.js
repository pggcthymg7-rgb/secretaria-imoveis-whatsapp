'use strict';
require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const sharp = require('sharp');

const { FOTOS_DIR } = require('../src/config/paths');
const cacheFontes = require('../src/pdf/deck16x9/cache-fontes');
const { criarCenaModelo } = require('../src/pdf/deck16x9/cenas');
const { gerarDeCena } = require('../src/pdf/deck16x9/gerar');
const { executarTarefa } = require('../src/pdf/deck16x9/worker');
const pdf16x9 = require('../src/pdf/deck16x9/manager');
const pdfModelos = require('../src/domain/pdf-modelos');
const sheets = require('../src/domain/sheets');
const { app, shutdown } = require('../src/web/app');

test.after(() => {
  try { shutdown(); } catch {}
});

function coletarPdf(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function carregarFontesLocais() {
  const out = {};
  for (const f of fs.readdirSync(cacheFontes.DIR_FONTES)) {
    if (f.endsWith('.ttf')) {
      out[f.replace(/\.ttf$/, '')] = fs.readFileSync(path.join(cacheFontes.DIR_FONTES, f));
    }
  }
  return out;
}

function criarTtfSintetico({ comFvar = false } = {}) {
  const buf = Buffer.alloc(128, 0);
  buf.writeUInt32BE(0x00010000, 0);
  buf.writeUInt16BE(2, 4);
  buf.write('head', 12, 4, 'ascii');
  buf.write(comFvar ? 'fvar' : 'name', 28, 4, 'ascii');
  return buf;
}

function decodificarHexUtf16(hex) {
  let out = '';
  for (let i = 0; i < hex.length; i += 4) {
    const code = parseInt(hex.slice(i, i + 4), 16);
    if (Number.isFinite(code) && code > 0) out += String.fromCharCode(code);
  }
  return out;
}

function inspecionarPdfBinario(buf, tmpDir = null, nome = 'inspecao.pdf') {
  if (tmpDir) fs.writeFileSync(path.join(tmpDir, nome), buf);
  const s = buf.toString('latin1');
  const pages = (s.match(/\/Type\s*\/Page\b(?!s)/g) || []).length;
  const mb = s.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
  const width = mb ? Number(mb[3]) - Number(mb[1]) : 0;
  const height = mb ? Number(mb[4]) - Number(mb[2]) : 0;
  const info = `Pages: ${pages}\nPage size: ${width} x ${height} pts\n`;

  const objs = new Map();
  const streams = new Map();
  const objRx = /(\d+)\s+0\s+obj\b([\s\S]*?)endobj/g;
  let m;
  while ((m = objRx.exec(s)) !== null) {
    const id = m[1];
    const body = m[2];
    objs.set(id, body);
    const sm = body.match(/stream\r?\n([\s\S]*?)\r?\nendstream/);
    if (sm) {
      const startOff = m.index + m[0].indexOf(sm[1]);
      const raw = buf.subarray(startOff, startOff + sm[1].length);
      let dec = raw;
      if (/\/FlateDecode\b/.test(body)) {
        try { dec = zlib.inflateSync(raw); } catch {}
      }
      streams.set(id, dec.toString('latin1'));
    }
  }

  const fontObjToCmap = new Map();
  for (const [id, body] of objs) {
    const tu = body.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
    if (!tu || !streams.has(tu[1])) continue;
    const cm = new Map();
    const cs = streams.get(tu[1]);
    for (const blk of cs.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const p of blk[1].matchAll(/^\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/gm)) {
        cm.set(p[1].toUpperCase(), decodificarHexUtf16(p[2]));
      }
    }
    for (const blk of cs.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const r of blk[1].matchAll(/^\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([^\]]+)\]/gm)) {
        const start = parseInt(r[1], 16);
        const pad = r[1].length;
        const arr = [...r[3].matchAll(/<([0-9a-fA-F]+)>/g)].map(x => decodificarHexUtf16(x[1]));
        arr.forEach((ch, idx) => cm.set((start + idx).toString(16).toUpperCase().padStart(pad, '0'), ch));
      }
      for (const r of blk[1].matchAll(/^\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/gm)) {
        const a = parseInt(r[1], 16);
        const b = parseInt(r[2], 16);
        const u0 = parseInt(r[3], 16);
        const pad = r[1].length;
        for (let c = a; c <= b; c++) {
          cm.set(c.toString(16).toUpperCase().padStart(pad, '0'), String.fromCharCode(u0 + (c - a)));
        }
      }
    }
    fontObjToCmap.set(id, cm);
  }

  const fontNameToCmap = new Map();
  for (const [, body] of objs) {
    for (const fm of body.matchAll(/\/(F\d+)\s+(\d+)\s+0\s+R/g)) {
      if (fontObjToCmap.has(fm[2])) fontNameToCmap.set(fm[1], fontObjToCmap.get(fm[2]));
    }
  }

  const partes = [];
  for (const [, st] of streams) {
    if (!/\bBT\b/.test(st)) continue;
    let curMap = null;
    const tokRx = /\/(F\d+)\s+[\d.]+\s+Tf|<([0-9a-fA-F]+)>\s*Tj|\[([^\]]+)\]\s*TJ|\(([^)]*)\)\s*Tj/g;
    let tm;
    while ((tm = tokRx.exec(st)) !== null) {
      if (tm[1]) {
        curMap = fontNameToCmap.get(tm[1]) || null;
      } else if (tm[2]) {
        const hex = tm[2].toUpperCase();
        if (curMap) {
          let line = '';
          for (let i = 0; i < hex.length; i += 4) line += curMap.get(hex.slice(i, i + 4)) || '';
          partes.push(line);
        }
      } else if (tm[3]) {
        let line = '';
        for (const hm of tm[3].matchAll(/<([0-9a-fA-F]+)>|\(([^)]*)\)/g)) {
          if (hm[1] && curMap) {
            const hex = hm[1].toUpperCase();
            for (let i = 0; i < hex.length; i += 4) line += curMap.get(hex.slice(i, i + 4)) || '';
          } else if (hm[2]) {
            line += hm[2];
          }
        }
        partes.push(line);
      } else if (tm[4]) {
        partes.push(tm[4]);
      }
    }
  }
  return { info, text: partes.join('\n') };
}

test('1. cache-fontes: UA Safari 5, validarBufferFonte, parseCssFontFaces, batch/fallback, single-flight, LRU e offline', async t => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biga-fontes-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  // 1a. UA Safari 5 / 10_6_8
  assert.ok(cacheFontes.UA_SAFARI_TTF.includes('Safari/5'), 'UA deve identificar Safari 5 para receber TTF/OTF');
  assert.ok(cacheFontes.UA_SAFARI_TTF.includes('10_6_8'), 'UA deve incluir Mac OS X 10_6_8');

  // 1b. validarBufferFonte
  const jostBuf = fs.readFileSync(path.join(cacheFontes.DIR_FONTES, 'Jost-500.ttf'));
  const archivoBuf = fs.readFileSync(path.join(cacheFontes.DIR_FONTES, 'Archivo-400.ttf'));
  assert.equal(cacheFontes.validarBufferFonte(jostBuf), true);
  assert.equal(cacheFontes.validarBufferFonte(archivoBuf), true);
  assert.equal(cacheFontes.validarBufferFonte(Buffer.concat([Buffer.from('wOFF'), Buffer.alloc(80)])), false);
  assert.equal(cacheFontes.validarBufferFonte(Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(80)])), false);
  assert.equal(cacheFontes.validarBufferFonte(Buffer.concat([Buffer.from('MZ'), Buffer.alloc(80)])), false);
  assert.equal(cacheFontes.validarBufferFonte(Buffer.from('<html><body>Erro</body></html>' + ' '.repeat(64))), false);
  assert.equal(cacheFontes.validarBufferFonte(Buffer.from('   \n\t<html>' + ' '.repeat(64))), false);
  assert.equal(cacheFontes.validarBufferFonte(jostBuf.subarray(0, 48)), false, 'arquivo truncado < 64 bytes deve falhar');
  assert.equal(cacheFontes.validarBufferFonte(criarTtfSintetico({ comFvar: true })), false, 'fonte variável com tabela fvar deve ser rejeitada');
  assert.equal(cacheFontes.validarBufferFonte(criarTtfSintetico({ comFvar: false })), true);

  // 1c. parseCssFontFaces
  const cssMulti = `
    @font-face {
      font-family: 'Roboto';
      font-style: normal;
      font-weight: 400;
      unicode-range: U+0000-00FF, U+0131;
      src: url(https://fonts.gstatic.com/s/roboto/v30/reg.woff2) format('woff2'),
           url(https://fonts.gstatic.com/s/roboto/v30/reg.ttf) format('truetype');
    }
    @font-face {
      font-family: 'Roboto';
      font-style: italic;
      font-weight: 700;
      unicode-range: U+0000-00FF;
      src: url(https://fonts.gstatic.com/s/roboto/v30/bi.otf) format('opentype');
    }
    @font-face {
      font-family: 'Roboto';
      font-style: normal;
      font-weight: 700;
      src: url(https://fonts.gstatic.com/s/roboto/v30/b.woff2) format('woff2');
    }
  `;
  const faces = cacheFontes.parseCssFontFaces(cssMulti);
  assert.equal(faces.length, 3);
  assert.equal(faces[0].weight, 400);
  assert.equal(faces[0].italico, false);
  assert.equal(faces[0].includesBasicLatin, true);
  assert.equal(faces[0].url, 'https://fonts.gstatic.com/s/roboto/v30/reg.ttf');
  assert.equal(faces[0].format, 'truetype');
  assert.equal(faces[1].weight, 700);
  assert.equal(faces[1].italico, true);
  assert.equal(faces[1].format, 'opentype');

  // 1d. resolverFontesCena em batch: URL deve conter ital,wght@0,400;0,700;1,400;1,700 ordenado
  const cacheBatch = path.join(tmpDir, 'batch');
  const urlsVistas = [];
  const fetcherBatch = async url => {
    urlsVistas.push(url);
    if (url.includes('fonts.googleapis.com/css2')) {
      return {
        ok: true,
        status: 200,
        text: async () => `
          @font-face { font-family: 'Roboto'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/r400.ttf) format('truetype'); }
          @font-face { font-family: 'Roboto'; font-style: normal; font-weight: 700; src: url(https://fonts.gstatic.com/r700.ttf) format('truetype'); }
          @font-face { font-family: 'Roboto'; font-style: italic; font-weight: 400; src: url(https://fonts.gstatic.com/r400i.ttf) format('truetype'); }
          @font-face { font-family: 'Roboto'; font-style: italic; font-weight: 700; src: url(https://fonts.gstatic.com/r700i.ttf) format('truetype'); }
        `
      };
    }
    return { ok: true, status: 200, arrayBuffer: async () => archivoBuf };
  };
  const cenaBatch = {
    slides: [{
      camadas: [
        { tipo: 'texto', fonte: 'Roboto', peso: 700, italico: true },
        { tipo: 'texto', fonte: 'Roboto', peso: 400, italico: false },
        { tipo: 'texto', fonte: 'Roboto', peso: 400, italico: true },
        { tipo: 'texto', fonte: 'Roboto', peso: 700, italico: false }
      ]
    }]
  };
  const resBatch = await cacheFontes.resolverFontesCena(cenaBatch, { cacheDir: cacheBatch, fetcher: fetcherBatch });
  assert.ok(urlsVistas.some(u => u.includes('family=Roboto:ital,wght@0,400;0,700;1,400;1,700&display=swap')));
  for (const al of ['Roboto-400', 'Roboto-700', 'Roboto-400-italic', 'Roboto-700-italic']) {
    assert.ok(Buffer.isBuffer(resBatch[al]), `alias ${al} deve ser resolvido`);
  }

  // 1e. Fallback individual por peso quando lote com ital,wght retorna HTTP 400
  const cacheFb = path.join(tmpDir, 'fb400');
  const urlsFb = [];
  const fetcher400 = async url => {
    urlsFb.push(url);
    if (url.includes('fonts.googleapis.com/css2')) {
      if (url.includes('ital,wght')) return { ok: false, status: 400, text: async () => 'Bad Request' };
      const m = url.match(/wght@(\d+)/);
      const w = m ? m[1] : '400';
      return {
        ok: true,
        status: 200,
        text: async () => `@font-face { font-family: 'Oswald'; font-style: normal; font-weight: ${w}; src: url(https://fonts.gstatic.com/oswald-${w}.ttf) format('truetype'); }`
      };
    }
    return { ok: true, status: 200, arrayBuffer: async () => jostBuf };
  };
  const cenaFb = {
    slides: [{
      camadas: [
        { tipo: 'texto', fonte: 'Oswald', peso: 400, italico: true },
        { tipo: 'texto', fonte: 'Oswald', peso: 700, italico: true }
      ]
    }]
  };
  const resFb = await cacheFontes.resolverFontesCena(cenaFb, { cacheDir: cacheFb, fetcher: fetcher400 });
  assert.ok(urlsFb.some(u => u.includes('Oswald:ital,wght@0,400;0,700;1,400;1,700')));
  assert.ok(urlsFb.some(u => u.includes('Oswald:wght@400')));
  assert.ok(urlsFb.some(u => u.includes('Oswald:wght@700')));
  assert.ok(Buffer.isBuffer(resFb['Oswald-400-italic']));
  assert.ok(Buffer.isBuffer(resFb['Oswald-700-italic']));

  // 1f. Deduplicação single-flight (duas chamadas simultâneas disparam apenas 1 fetch CSS e 1 TTF)
  const cacheSf = path.join(tmpDir, 'singleflight');
  let sfCssCount = 0;
  let sfTtfCount = 0;
  const fetcherSf = async url => {
    await new Promise(r => setTimeout(r, 25));
    if (url.includes('fonts.googleapis.com/css2')) {
      sfCssCount++;
      return {
        ok: true,
        status: 200,
        text: async () => "@font-face { font-family: 'Lato'; font-style: normal; font-weight: 600; src: url(https://fonts.gstatic.com/lato600.ttf) format('truetype'); }"
      };
    }
    sfTtfCount++;
    return { ok: true, status: 200, arrayBuffer: async () => jostBuf };
  };
  const [sf1, sf2] = await Promise.all([
    cacheFontes.obterFonte('Lato', 600, false, { cacheDir: cacheSf, fetcher: fetcherSf }),
    cacheFontes.obterFonte('Lato', 600, false, { cacheDir: cacheSf, fetcher: fetcherSf })
  ]);
  assert.equal(sfCssCount, 1, 'single-flight deve disparar apenas 1 fetch de CSS');
  assert.equal(sfTtfCount, 1, 'single-flight deve disparar apenas 1 download de TTF');
  assert.equal(sf1.buffer.equals(sf2.buffer), true);

  // 1g. Gravação atômica, atualização de mtime via utimesSync no hit e limpeza LRU
  const lruDir = path.join(tmpDir, 'lru');
  const fetcherLru = async url => {
    if (url.includes('fonts.googleapis.com/css2')) {
      const fam = url.includes('Poppins') ? 'Poppins' : 'Nunito';
      return {
        ok: true,
        status: 200,
        text: async () => `@font-face { font-family: '${fam}'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/${fam}.ttf) format('truetype'); }`
      };
    }
    return { ok: true, status: 200, arrayBuffer: async () => (url.includes('Poppins') ? archivoBuf : jostBuf) };
  };
  await cacheFontes.obterFonte('Nunito', 400, false, { cacheDir: lruDir, fetcher: fetcherLru });
  await cacheFontes.obterFonte('Poppins', 400, false, { cacheDir: lruDir, fetcher: fetcherLru });
  const nunitoFile = path.join(lruDir, 'Nunito-400.ttf');
  const poppinsFile = path.join(lruDir, 'Poppins-400.ttf');
  assert.equal(fs.existsSync(nunitoFile), true);
  assert.equal(fs.existsSync(poppinsFile), true);
  assert.equal(fs.readdirSync(lruDir).some(n => n.endsWith('.tmp')), false, 'gravação atômica não deve deixar .tmp');

  // Coloca ambos no passado, depois toca Nunito no cache hit
  const antigo1 = new Date(Date.now() - 180_000);
  const antigo2 = new Date(Date.now() - 120_000);
  fs.utimesSync(nunitoFile, antigo1, antigo1);
  fs.utimesSync(poppinsFile, antigo2, antigo2);

  const hitNunito = await cacheFontes.obterFonte('Nunito', 400, false, { cacheDir: lruDir });
  assert.equal(hitNunito.origem, 'cache');
  const mtimeNunitoDepois = fs.statSync(nunitoFile).mtimeMs;
  assert.ok(mtimeNunitoDepois > Date.now() - 15_000, 'hit em cache deve renovar mtime via utimesSync');

  // Teto 50000: total ~66KB -> 75% de 50000 = 37500 -> remove Poppins (~40.5KB) e mantém Nunito (~25.5KB)
  cacheFontes.limparCacheFontes(lruDir, 50_000);
  assert.equal(fs.existsSync(poppinsFile), false, 'arquivo menos recente (Poppins) deve ser removido na limpeza LRU');
  assert.equal(fs.existsSync(nunitoFile), true, 'arquivo tocado por último (Nunito) deve permanecer');

  // 1h. Degradação offline e erro de rede sem lançar exceção
  const off1 = await cacheFontes.obterFonte('FonteDesconhecidaX', 400, false, { cacheDir: lruDir, offline: true });
  assert.equal(off1.fallbackUsado, true);
  assert.equal(off1.origem, 'fallback-local');
  assert.equal(cacheFontes.validarBufferFonte(off1.buffer), true);

  const off2 = await cacheFontes.obterFonte('FonteDesconhecidaY', 700, true, {
    cacheDir: lruDir,
    fetcher: async () => { throw new Error('ECONNRESET'); }
  });
  assert.equal(off2.fallbackUsado, true);
  assert.equal(off2.origem, 'fallback-local');
  assert.equal(cacheFontes.validarBufferFonte(off2.buffer), true);
});

test('2. pdf-modelos: lista branca 10 tipos, truncamento, bloqueio protótipo/traversal e CRUD completo', () => {
  const criados = [];
  const limparCriados = () => {
    while (criados.length) pdfModelos.apagar(criados.pop());
  };

  try {
    // 2a. Lista branca dos 10 tipos + rejeição de tipo inválido + descarte de traversal em fotoCustom
    const dezTipos = [
      { tipo: 'foto', x: 0, y: 0, w: 400, h: 300, fotoCustom: '../../etc/passwd' },
      { tipo: 'foto', x: 10, y: 10, w: 200, h: 200, fotoCustom: '/fotos/sala-vip.jpg' },
      { tipo: 'texto', texto: '{nome}', fonte: 'Jost', peso: 500, tamanho: 36 },
      { tipo: 'retangulo', x: 10, y: 10, w: 100, h: 50, raios: [24, 0, 24, 0] },
      { tipo: 'circulo', x: 20, y: 20, w: 80, h: 80 },
      { tipo: 'linha', x: 0, y: 10, w: 200, h: 10, pontos: [0, 5, 200, 5] },
      { tipo: 'degrade', x: 0, y: 0, w: 200, h: 200, cor1: '#00000000', cor2: '#000000cc' },
      { tipo: 'poligono', x: 30, y: 30, w: 100, h: 100, vertices: [{ x: 0, y: 0 }, { x: 90, y: 10 }, { x: 100, y: 100 }, { x: 10, y: 90 }] },
      { tipo: 'icone', iconeId: 'selo-exclusivo', formaFundo: 'circulo' },
      { tipo: 'logo', origem: 'kit', forma: 'quadrado' },
      { tipo: 'qrcode', origem: 'custom', url: 'https://wa.me/5562999998888' },
      { tipo: 'script_malicioso', x: 0, y: 0 }
    ];
    const cenaLimpa = pdfModelos.limparCena({ slides: [{ id: 's1', nome: 'Capa', tipo: 'capa', fundo: '#111111', camadas: dezTipos }] });
    assert.equal(cenaLimpa.slides[0].camadas.length, 11, '10 tipos válidos (2 fotos) mantidos, script rejeitado');
    assert.equal(cenaLimpa.slides[0].camadas[0].fotoCustom, undefined, 'path traversal ../../etc/passwd descartado');
    assert.equal(cenaLimpa.slides[0].camadas[1].fotoCustom, '/fotos/sala-vip.jpg');

    for (const badTrav of ['../segredo.png', '%2e%2e%2fetc%2fpasswd.png', '/etc/passwd', '.env.png']) {
      const cTrav = pdfModelos.limparCamada({ tipo: 'foto', fotoCustom: badTrav });
      assert.equal(cTrav.fotoCustom, undefined, `traversal ${badTrav} deve ser descartado`);
    }

    // 2b. Truncamento de 14 slides e 60 camadas
    const muitosSlides = Array.from({ length: 16 }, (_, si) => ({
      id: `sl_${si}`,
      nome: `Pág ${si + 1}`,
      camadas: Array.from({ length: 70 }, (__, ci) => ({ tipo: 'retangulo', id: `c_${si}_${ci}`, w: 10, h: 10 }))
    }));
    const cenaTrunc = pdfModelos.limparCena({ slides: muitosSlides });
    assert.equal(cenaTrunc.slides.length, 14, 'slides devem truncar em 14');
    assert.equal(cenaTrunc.slides[0].camadas.length, 60, 'camadas devem truncar em 60');

    // 2c. Rejeição de prototype pollution em IDs
    for (const badId of ['__proto__', 'constructor', 'prototype']) {
      assert.throws(() => pdfModelos.salvar({ id: badId, nome: 'Hack', slides: [{ camadas: [{ tipo: 'retangulo' }] }] }), /inválido/i);
      assert.equal(pdfModelos.obter(badId), null);
      assert.equal(pdfModelos.apagar(badId), false);
    }

    // 2d. CRUD completo: salvar, listar, obter, obterPadrao, favoritar, renomear, duplicar, apagar
    const m1 = pdfModelos.salvar({
      nome: 'Modelo Teste CRUD',
      cena: { slides: [{ nome: 'Capa', camadas: [{ tipo: 'texto', texto: '{nome}' }] }] }
    });
    criados.push(m1.id);
    assert.equal(pdfModelos.obter(m1.id).nome, 'Modelo Teste CRUD');
    assert.ok(pdfModelos.listar().modelos.some(m => m.id === m1.id));

    pdfModelos.salvar({ id: m1.id, padrao: true });
    assert.equal(pdfModelos.obterPadrao().id, m1.id);

    const ren = pdfModelos.salvar({ id: m1.id, nome: 'Modelo Renomeado ★' });
    assert.equal(ren.nome, 'Modelo Renomeado ★');
    assert.equal(pdfModelos.obter(m1.id).nome, 'Modelo Renomeado ★');

    const dup = pdfModelos.salvar({ comoNovo: true, nome: 'Modelo Duplicado', cena: m1.cena });
    criados.push(dup.id);
    assert.notEqual(dup.id, m1.id);

    assert.equal(pdfModelos.apagar(m1.id), true);
    assert.equal(pdfModelos.obterPadrao(), null);
    assert.equal(pdfModelos.apagar(dup.id), true);
    criados.length = 0;

    // 2e. Máximo de 40 modelos
    const existentes = pdfModelos.listar().modelos.length;
    const faltam = pdfModelos.MAX_MODELOS - existentes;
    for (let i = 0; i < faltam; i++) {
      const m = pdfModelos.salvar({ nome: `Cap_${i}`, slides: [{ camadas: [{ tipo: 'retangulo' }] }] });
      criados.push(m.id);
    }
    assert.equal(pdfModelos.listar().modelos.length, 40);
    assert.throws(
      () => pdfModelos.salvar({ nome: 'Cap_41', slides: [{ camadas: [{ tipo: 'retangulo' }] }] }),
      /Limite de 40/
    );
  } finally {
    limparCriados();
  }
});

test('3. Renderização Vetorial Híbrida: 5 modelos x 2 paletas, Modo A vs B, lineBreak:false, -kern, perspectiva/QR e Worker Sharp/WEBP', async t => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biga-render-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const fontesResolvidas = carregarFontesLocais();
  const fotosPng = await Promise.all(
    [[40, 60, 120], [180, 90, 50], [30, 120, 90], [130, 110, 40], [70, 50, 130]].map(async ([r, g, b], idx) => {
      const buf = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r, g, b } } }).png().toBuffer();
      return { buf, w: 800, h: 600, nome: `foto${idx + 1}.png` };
    })
  );
  const logoPng = await sharp({ create: { width: 120, height: 120, channels: 4, background: { r: 82, g: 102, b: 235, alpha: 1 } } }).png().toBuffer();
  const logoWebp = await sharp({ create: { width: 96, height: 96, channels: 4, background: { r: 200, g: 161, b: 90, alpha: 1 } } }).webp().toBuffer();
  const logoWebpDataUri = `data:image/webp;base64,${logoWebp.toString('base64')}`;

  const dadosImovel = {
    id: '404',
    tipo: 'Apartamento',
    neg: 'VENDA',
    edificio: 'Edifício Aurora Real',
    setor: 'Setor Bueno',
    cidade: 'Goiânia',
    valor: 1850000,
    quartos: 4,
    suites: 3,
    vagas: 3,
    area: '192 m²',
    terreno: '240 m²',
    feats: ['Varanda gourmet', 'Nascente', 'Lazer completo'],
    desc: 'Apartamento amplo com acabamento refinado no Setor Bueno.',
    corretor: 'Giovana Mendes',
    fone: '62999887766',
    creci: 'CRECI 12345-J',
    email: 'giovana@aurora.imb.br',
    rodape: 'Valores sujeitos a alteração.'
  };
  const kit = { marca: 'Aurora Imóveis', logo: logoPng, fonte: 'Jost', telefone: '62999887766' };

  // 3a. 5 modelos (A, B, D, E, F) x 2 paletas (principal, segunda)
  let pdfModeloA = null;
  for (const modelo of ['A', 'B', 'D', 'E', 'F']) {
    for (const paleta of ['principal', 'segunda']) {
      const cena = criarCenaModelo(modelo, paleta, kit, dadosImovel);
      const { doc, info } = gerarDeCena(PDFDocument, QRCode, {
        cena,
        dados: dadosImovel,
        kit,
        fotos: fotosPng,
        fontesResolvidas
      });
      const buf = await coletarPdf(doc);
      assert.equal(buf.subarray(0, 4).toString(), '%PDF', `Modelo ${modelo}/${paleta} deve gerar PDF válido`);
      assert.equal(info.paginas, 6, `Modelo ${modelo}/${paleta} deve gerar 6 páginas`);
      if (modelo === 'A' && paleta === 'principal') pdfModeloA = buf;
    }
  }

  // Validação em JS puro de páginas, dimensões e texto decodificado no buffer PDF
  const inspA = inspecionarPdfBinario(pdfModeloA, tmpDir, 'modelo-A.pdf');
  assert.match(inspA.info, /Pages:\s+6/);
  assert.match(inspA.info, /Page size:\s+1152 x 648 pts/);
  assert.ok(inspA.text.includes('Edifício Aurora Real'), 'buffer PDF deve conter nome real do imóvel');
  assert.ok(inspA.text.includes('Setor Bueno'), 'buffer PDF deve conter bairro real');
  assert.ok(inspA.text.includes('1.850.000'), 'buffer PDF deve conter preço formatado');
  for (const tokenCru of ['{preco}', '{nome}', '{localizacao}', '{area}', '{quartos}']) {
    assert.equal(inspA.text.includes(tokenCru), false, `Token ${tokenCru} não pode vazar cru no PDF`);
  }

  // 3b. Modo A (com telemetria Konva) vs Modo B (headless) + lineBreak: false na margem inferior (y: 625)
  const cenaModoA = {
    largura: 1152,
    altura: 648,
    slides: [{
      id: 's1',
      nome: 'ModoA',
      fundo: '#171721',
      camadas: [{
        id: 'tx_a',
        tipo: 'texto',
        x: 48,
        y: 625,
        w: 500,
        h: 40,
        texto: 'Linha Um Telemetria Linha Dois Telemetria',
        fonte: 'Jost',
        peso: 500,
        tamanho: 24,
        cor: '#ffffff',
        telemetria: {
          lines: ['Linha Um Telemetria', 'Linha Dois Telemetria'],
          baselineShift: 8,
          tamanhoEfetivo: 24,
          textoResolvido: 'Linha Um Telemetria Linha Dois Telemetria',
          textMatrix: [1, 0, 0, 1, 48, 625]
        }
      }]
    }]
  };
  const rA = gerarDeCena(PDFDocument, QRCode, { cena: cenaModoA, dados: dadosImovel, kit, fontesResolvidas });
  assert.equal(rA.info.telemetriaStats.modoA, 1);
  assert.equal(rA.info.telemetriaStats.modoB, 0);
  const bufA = await coletarPdf(rA.doc);
  assert.equal(bufA.subarray(0, 4).toString(), '%PDF');
  const inspModoA = inspecionarPdfBinario(bufA, tmpDir, 'modo-a-rodape.pdf');
  assert.match(inspModoA.info, /Pages:\s+1/, 'lineBreak:false não pode quebrar texto em y:625 para página 2');
  assert.ok(inspModoA.text.includes('Linha Um Telemetria'));

  const cenaModoB = {
    largura: 1152,
    altura: 648,
    slides: [{
      id: 's1',
      nome: 'ModoB',
      fundo: '#171721',
      camadas: [{
        id: 'tx_b',
        tipo: 'texto',
        x: 48,
        y: 625,
        w: 500,
        h: 40,
        texto: 'Texto Modo B Rodapé com tracking',
        fonte: 'Jost',
        peso: 500,
        tamanho: 24,
        espacamento: 4, // exercita features: ['-kern']
        cor: '#ffffff'
      }]
    }]
  };
  const rB = gerarDeCena(PDFDocument, QRCode, { cena: cenaModoB, dados: dadosImovel, kit, fontesResolvidas });
  assert.equal(rB.info.telemetriaStats.modoB, 1);
  assert.equal(rB.info.telemetriaStats.modoA, 0);
  const bufB = await coletarPdf(rB.doc);
  const inspModoB = inspecionarPdfBinario(bufB, tmpDir, 'modo-b-kern.pdf');
  assert.match(inspModoB.info, /Pages:\s+1/);
  assert.ok(inspModoB.text.replace(/\s+/g, '').includes('TextoModoBRodapé'));

  // 3c. Perspectiva vetorial, polígono 4pt com skewX/skewY + strokeScaleEnabled:false, retângulo raios assimétricos, degrade, ícone e QR com link
  const cenaVetorial = {
    largura: 1152,
    altura: 648,
    slides: [{
      id: 's_vet',
      nome: 'Vetorial',
      fundo: '#0e0e0f',
      camadas: [
        { id: 'dg', tipo: 'degrade', x: 0, y: 0, w: 1152, h: 648, cor1: '#0e0e0f00', cor2: '#171721ee', angulo: 180 },
        { id: 'rc', tipo: 'retangulo', x: 40, y: 40, w: 320, h: 180, cor: '#5266eb', raios: [24, 0, 24, 0], borda: 2, corBorda: '#ffffff' },
        {
          id: 'pl',
          tipo: 'poligono',
          x: 420,
          y: 120,
          w: 300,
          h: 220,
          skewX: 20,
          skewY: -10,
          borda: 3,
          corBorda: '#d4af37',
          cor: '#2a2a38',
          strokeScaleEnabled: false,
          vertices: [{ x: 15, y: 0 }, { x: 280, y: 20 }, { x: 300, y: 210 }, { x: 0, y: 190 }]
        },
        { id: 'ic', tipo: 'icone', iconeId: 'selo-exclusivo', x: 80, y: 260, w: 72, h: 72, cor: '#ffffff', formaFundo: 'circulo', corFundo: '#d4af37' },
        { id: 'qr', tipo: 'qrcode', origem: 'custom', url: 'https://wa.me/5562999998888', x: 820, y: 180, w: 220, h: 220, corEscuro: '#171721', corClaro: '#ffffff', raio: 12, margem: 2 }
      ]
    }]
  };
  const rVet = gerarDeCena(PDFDocument, QRCode, { cena: cenaVetorial, dados: dadosImovel, kit, fontesResolvidas });
  const bufVet = await coletarPdf(rVet.doc);
  assert.equal(bufVet.subarray(0, 4).toString(), '%PDF');
  assert.ok(bufVet.toString('latin1').includes('wa.me/5562999998888'), 'PDF deve conter anotação/URI clicável do QR Code');

  // 3d. Worker Sharp (executarTarefa modo: 'cena') com foto panorâmica zoom 0.7 (ramo else), filtros, raios assimétricos e logo WEBP
  const panoPath = path.join(tmpDir, 'panoramica.png');
  await sharp({ create: { width: 1200, height: 400, channels: 3, background: { r: 60, g: 130, b: 190 } } }).png().toBuffer().then(b => fs.writeFileSync(panoPath, b));
  const outWorkerPdf = path.join(tmpDir, 'worker-cena.pdf');

  const resWorker = await executarTarefa({
    modo: 'cena',
    dados: dadosImovel,
    kit: { marca: 'Horizon WEBP', logo: logoWebpDataUri, fonte: 'Jost' },
    fotosCaminhos: [panoPath],
    destinoPath: outWorkerPdf,
    cacheFotosDir: path.join(tmpDir, 'cfotos'),
    cacheFontesDir: path.join(tmpDir, 'cfontes'),
    cena: {
      largura: 1152,
      altura: 648,
      slides: [{
        id: 'sw1',
        nome: 'Sharp',
        fundo: '#171721',
        camadas: [
          {
            id: 'ft_pano',
            tipo: 'foto',
            x: 60,
            y: 60,
            w: 400,
            h: 400,
            indiceFoto: 0,
            zoom: 0.7,
            offX: 0.3,
            offY: -0.2,
            brilho: 115,
            contraste: 110,
            saturacao: 90,
            desfoque: 2,
            raios: [20, 0, 20, 0]
          },
          { id: 'lg_kit', tipo: 'logo', origem: 'kit', x: 520, y: 60, w: 120, h: 120, forma: 'quadrado', raio: 12 },
          { id: 'lg_custom', tipo: 'logo', origem: 'custom', src: logoWebpDataUri, x: 680, y: 60, w: 120, h: 120, forma: 'circulo', raio: 60 },
          { id: 'tx_w', tipo: 'texto', x: 520, y: 240, w: 500, h: 60, texto: 'Worker Sharp WEBP OK', fonte: 'Jost', peso: 500, tamanho: 32, cor: '#ffffff' }
        ]
      }]
    }
  });
  assert.equal(resWorker.ok, true);
  assert.equal(resWorker.avisos.some(a => a.includes('logo')), false, 'Logo WEBP convertido para PNG não deve gerar aviso de erro');
  const bufWorker = fs.readFileSync(outWorkerPdf);
  assert.equal(bufWorker.subarray(0, 4).toString(), '%PDF');
  const inspWorker = inspecionarPdfBinario(bufWorker, tmpDir, 'worker-check.pdf');
  assert.ok(inspWorker.text.includes('Worker Sharp WEBP OK'));
});

test('4. Precedência WhatsApp (gerarPdfComFallback) e Segurança de Upload POST /api/pdf/kit/logo', async t => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biga-prec-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  fs.mkdirSync(FOTOS_DIR, { recursive: true });
  const fotoBuf = await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 75, g: 95, b: 140 } } }).jpeg().toBuffer();
  fs.writeFileSync(path.join(FOTOS_DIR, 'prec_foto_1.jpg'), fotoBuf);

  const prop = await sheets.createProperty({
    tipo: 'Apartamento',
    edificio: 'Residencial Precedência',
    setor: 'Setor Marista',
    valor: 1100000,
    quartos: 3,
    vagas: 2,
    tamanho_m2: 120,
    fotos: ['prec_foto_1.jpg']
  });

  const makeCenaMarcador = marcador => ({
    versao: 1,
    modo: 'pdf',
    formato: '16:9',
    largura: 1152,
    altura: 648,
    slides: [{
      id: 'sl1',
      nome: 'Capa',
      tipo: 'capa',
      fundo: '#171721',
      camadas: [{
        id: 'tx1',
        tipo: 'texto',
        x: 60,
        y: 120,
        w: 900,
        h: 80,
        texto: `${marcador} · {nome}`,
        fonte: 'Jost',
        peso: 700,
        tamanho: 36,
        cor: '#ffffff'
      }]
    }]
  });

  const modPadrao = pdfModelos.salvar({
    nome: 'Modelo Padrão Estrela',
    padrao: true,
    cena: makeCenaMarcador('MARCADOR_MODELO_PADRAO')
  });
  let logoCriadoArquivo = null;
  const kitAnterior = pdf16x9.carregarKit();

  t.after(() => {
    try { pdf16x9.restaurarFicha16x9(prop.id); } catch {}
    try { pdfModelos.apagar(modPadrao.id); } catch {}
    try { pdf16x9.salvarKit({ ...kitAnterior }); } catch {}
    try { fs.rmSync(path.join(FOTOS_DIR, 'prec_foto_1.jpg'), { force: true }); } catch {}
    if (logoCriadoArquivo) {
      try { fs.rmSync(path.join(FOTOS_DIR, logoCriadoArquivo), { force: true }); } catch {}
    }
  });

  pdf16x9.salvarKit({ marca: 'MARCA_KIT_PRECEDENCIA', modelo: 'B', paletaPadrao: 'principal', logoPath: null, logoFile: null });
  pdf16x9.salvarFicha16x9(prop.id, { cena: makeCenaMarcador('MARCADOR_CENA_IMOVEL') });

  // 4a. Cena salva no imóvel vence modelo padrão ★
  const r1 = await pdf16x9.gerarPdfComFallback(prop, { forcar: true });
  assert.equal(r1.isFallback, false);
  const t1 = inspecionarPdfBinario(r1.buffer, tmpDir, 'prec1.pdf');
  assert.ok(t1.text.includes('MARCADOR_CENA_IMOVEL'));
  assert.equal(t1.text.includes('MARCADOR_MODELO_PADRAO'), false);

  // 4b. Sem cena no imóvel, modelo padrão ★ vence modelo pronto do Kit
  pdf16x9.restaurarFicha16x9(prop.id);
  const r2 = await pdf16x9.gerarPdfComFallback(prop, { forcar: true });
  assert.equal(r2.isFallback, false);
  const t2 = inspecionarPdfBinario(r2.buffer, tmpDir, 'prec2.pdf');
  assert.ok(t2.text.includes('MARCADOR_MODELO_PADRAO'));
  assert.equal(t2.text.includes('MARCADOR_CENA_IMOVEL'), false);

  // 4c. Sem cena no imóvel e sem modelo padrão ★, usa modelo pronto do Kit
  pdfModelos.apagar(modPadrao.id);
  const r3 = await pdf16x9.gerarPdfComFallback(prop, { forcar: true });
  assert.equal(r3.isFallback, false);
  const t3 = inspecionarPdfBinario(r3.buffer, tmpDir, 'prec3.pdf');
  assert.match(t3.info, /Page size:\s+1152 x 648 pts/);
  assert.ok(t3.text.includes('MARCA_KIT_PRECEDENCIA'));
  assert.equal(t3.text.includes('MARCADOR_MODELO_PADRAO'), false);

  // 4d. Modelo inválido aciona fallback para ficha A4 clássica
  const r4 = await pdf16x9.gerarPdfComFallback(prop, { modelo: 'INEXISTENTE', forcar: true });
  assert.equal(r4.isFallback, true);
  assert.equal(r4.buffer.subarray(0, 4).toString(), '%PDF');

  // 4e. Segurança de upload POST /api/pdf/kit/logo via servidor HTTP real
  const srv = http.createServer(app);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => srv.close(r)));
  const base = `http://127.0.0.1:${srv.address().port}`;

  const loginRes = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-secretaria': '1' },
    body: JSON.stringify({ senha: process.env.PAINEL_SENHA })
  });
  assert.equal(loginRes.status, 200);
  const cookie = loginRes.headers.get('set-cookie').split(';')[0];

  const antesFotos = new Set(fs.readdirSync(FOTOS_DIR));
  const fdFake = new FormData();
  fdFake.append('logo', new Blob([Buffer.from('<html>malicioso</html>')], { type: 'image/png' }), 'evil.png');
  const fakeRes = await fetch(`${base}/api/pdf/kit/logo`, {
    method: 'POST',
    headers: { 'x-secretaria': '1', cookie },
    body: fdFake
  });
  assert.equal(fakeRes.status, 400, 'PNG falso com HTML deve retornar 400');
  const depoisFake = fs.readdirSync(FOTOS_DIR);
  assert.deepEqual(
    depoisFake.filter(f => !antesFotos.has(f)),
    [],
    'arquivo falso deve ser removido de FOTOS_DIR após rejeição por magic bytes'
  );

  const validPng = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 82, g: 102, b: 235, alpha: 1 } } }).png().toBuffer();
  const fdOk = new FormData();
  fdOk.append('logo', new Blob([validPng], { type: 'image/png' }), 'logo-horizonte.png');
  const okRes = await fetch(`${base}/api/pdf/kit/logo`, {
    method: 'POST',
    headers: { 'x-secretaria': '1', cookie },
    body: fdOk
  });
  assert.equal(okRes.status, 200);
  const okJson = await okRes.json();
  assert.equal(okJson.ok, true);
  assert.match(okJson.kit.logoUrl, /^\/fotos\/logo_/);
  logoCriadoArquivo = okJson.kit.logoFile;
  assert.equal(fs.existsSync(path.join(FOTOS_DIR, logoCriadoArquivo)), true);
});
