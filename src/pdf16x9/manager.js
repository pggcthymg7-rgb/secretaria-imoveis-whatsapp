'use strict';
/**
 * Gerenciador central do motor de PDF 16:9.
 * Controla a fila serial, a trava atômica PID via kernel, o despacho para
 * Worker Threads efêmeras (kill-on-complete), o cache de PDFs compilados
 * e o fallback transparente para a ficha A4 em caso de erro.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { Worker } = require('node:worker_threads');

const { DATA_DIR, FOTOS_DIR } = require('../paths');
const { adquirirTrava } = require('./lock');
const { readJson, writeJson } = require('../store');

const CACHE_PDF_DIR = path.join(DATA_DIR, 'cache_pdf_16x9');
const CACHE_FOTOS_DIR = path.join(DATA_DIR, 'cache_fotos_16x9');
const ARQUIVO_KIT = 'kit_marca.json';
const ARQUIVO_FICHAS_16X9 = 'fichas_16x9.json';
const TETO_CACHE_PDF_BYTES = 100 * 1024 * 1024; // 100 MB
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const TIPOS_PAGINA_VALIDOS = new Set(['capa', 'resumo', 'foto', 'galeria', 'texto', 'contato']);

// Fila serial local para garantir concurrency = 1 por processo
let filaPromise = Promise.resolve();
const debounceTimers = new Map();

function isForbiddenKey(k) {
  return FORBIDDEN_KEYS.has(String(k));
}

function sanitizePlain(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const k of Object.keys(obj)) {
    if (!isForbiddenKey(k)) out[k] = obj[k];
  }
  return out;
}

function sanitizeId(id) {
  const s = String(id ?? '').replace(/[^\w-]/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
  return s || 'sem_id';
}

function isSafePathInside(baseDir, candidate) {
  if (!baseDir || !candidate || typeof candidate !== 'string') return false;
  const baseResolved = path.resolve(baseDir);
  const candResolved = path.resolve(candidate);
  if (candResolved !== baseResolved && !candResolved.startsWith(baseResolved + path.sep)) return false;
  try {
    if (fs.existsSync(candResolved)) {
      const realBase = fs.realpathSync(baseResolved);
      const realCand = fs.realpathSync(candResolved);
      return realCand === realBase || realCand.startsWith(realBase + path.sep);
    }
  } catch {
    return false;
  }
  return true;
}

function validarLogoPath(logoPath) {
  if (!logoPath || typeof logoPath !== 'string') return null;
  const trimmed = logoPath.trim();
  if (!trimmed) return null;
  if (isSafePathInside(DATA_DIR, trimmed) || isSafePathInside(FOTOS_DIR, trimmed)) return path.resolve(trimmed);
  return null;
}

function limparCachePdfSeNecessario(dirCache = CACHE_PDF_DIR, tetoBytes = TETO_CACHE_PDF_BYTES) {
  if (!fs.existsSync(dirCache)) return;
  try {
    const agora = Date.now();
    const arquivos = [];
    for (const nome of fs.readdirSync(dirCache)) {
      const p = path.join(dirCache, nome);
      try {
        const stat = fs.statSync(p);
        if (!stat.isFile()) continue;
        if (nome.endsWith('.tmp')) {
          if (agora - stat.mtimeMs > 5 * 60 * 1000) fs.unlinkSync(p);
          continue;
        }
        if (nome.endsWith('.pdf')) arquivos.push({ path: p, size: stat.size, mtime: stat.mtimeMs });
      } catch {}
    }
    let total = arquivos.reduce((s, a) => s + a.size, 0);
    if (total <= tetoBytes) return;
    arquivos.sort((a, b) => a.mtime - b.mtime);
    for (const a of arquivos) {
      if (total <= tetoBytes * 0.75) break;
      try {
        fs.unlinkSync(a.path);
        total -= a.size;
      } catch {}
    }
  } catch {}
}

function calcularHashInsumos(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
}

function carregarKit() {
  const padrao = {
    marca: 'BIGA',
    logo: null,
    cores1: { fundo: '#0E0E0F', texto: '#ECE9E2', principal: '#2A2A2D', secundaria: '#8C8A84', destaque: '#C8A15A' },
    cores2: { fundo: '#F2F0EB', texto: '#131314', principal: '#DAD6CC', secundaria: '#7A776F', destaque: '#8C6420' },
    fonte: 'Jost',
    modelo: 'A',
    paletaPadrao: 'principal',
    corretor: '',
    creci: '',
    telefone: '',
    email: '',
    rodape: ''
  };
  return { ...padrao, ...readJson(ARQUIVO_KIT, {}) };
}

function salvarKit(dados) {
  const kitAtual = carregarKit();
  const limpos = sanitizePlain(dados);
  if ('logoPath' in limpos) limpos.logoPath = validarLogoPath(limpos.logoPath);
  const novoKit = { ...kitAtual, ...limpos };
  writeJson(ARQUIVO_KIT, novoKit);
  return novoKit;
}

function carregarFichas16x9() {
  const raw = readJson(ARQUIVO_FICHAS_16X9, {});
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

function salvarFicha16x9(idImovel, dados) {
  const id = String(idImovel ?? '');
  if (!id || isForbiddenKey(id)) throw Object.assign(new Error('Imóvel inválido.'), { status: 400 });
  const limpos = sanitizePlain(dados);
  if ('paginas' in limpos) {
    const pags = sanitizarPaginas(limpos.paginas);
    if (pags) limpos.paginas = pags;
    else delete limpos.paginas;
  }
  const todas = carregarFichas16x9();
  const atual = Object.prototype.hasOwnProperty.call(todas, id) && todas[id] && typeof todas[id] === 'object' ? todas[id] : {};
  todas[id] = { ...atual, ...limpos };
  writeJson(ARQUIVO_FICHAS_16X9, todas);
  return todas[id];
}

function restaurarFicha16x9(idImovel) {
  const id = String(idImovel ?? '');
  if (!id || isForbiddenKey(id)) throw Object.assign(new Error('Imóvel inválido.'), { status: 400 });
  const todas = carregarFichas16x9();
  if (Object.prototype.hasOwnProperty.call(todas, id)) {
    delete todas[id];
    writeJson(ARQUIVO_FICHAS_16X9, todas);
  }
  return {};
}

function sanitizarPaginas(pags) {
  if (!Array.isArray(pags) || !pags.length) return null;
  const out = [];
  for (const pg of pags.slice(0, 14)) {
    if (!pg || typeof pg !== 'object' || Array.isArray(pg)) continue;
    const tipo = String(pg.tipo || '');
    if (!TIPOS_PAGINA_VALIDOS.has(tipo)) continue;
    const item = { tipo };
    if (tipo === 'foto') {
      item.foto = Math.max(0, Math.min(30, parseInt(pg.foto, 10) || 0));
    } else if (tipo === 'galeria') {
      item.fotos = (Array.isArray(pg.fotos) ? pg.fotos : []).slice(0, 10).map(n => Math.max(0, Math.min(30, parseInt(n, 10) || 0)));
    } else if (tipo === 'texto') {
      if (typeof pg.titulo === 'string') item.titulo = pg.titulo.replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, 120);
      if (typeof pg.texto === 'string') item.texto = pg.texto.slice(0, 20000);
    }
    out.push(item);
  }
  return out.length ? out : null;
}

/**
 * Converte um imóvel da carteira + edições para os dados consumidos pelo gerador 16:9
 */
function comporDadosImovel(propriedade, fichaEditada = {}, kit = carregarKit()) {
  const p = propriedade || {};
  const f = fichaEditada || {};

  const valorFormatado = f.preco || (p.valor ? `R$ ${Number(p.valor).toLocaleString('pt-BR')}` : '');
  const agioFormatado = p.valor_agio ? `R$ ${Number(p.valor_agio).toLocaleString('pt-BR')}` : '';

  const feats = [];
  if (f.destaques) {
    f.destaques.split('\n').map(s => s.trim()).filter(Boolean).forEach(d => feats.push(d));
  }

  return {
    tipo: p.tipo || 'Imóvel',
    neg: p.negociacao || 'VENDA',
    edificio: f.titulo || p.edificio || '',
    setor: p.setor || '',
    regiao: p.regiao || '',
    cidade: p.cidade || 'Goiânia',
    mobiliado: p.mobiliado === 'SIM' ? 'Mobiliado' : p.mobiliado === 'SEMI' ? 'Armários' : '',
    quartos: p.quartos ? String(p.quartos) : '',
    suites: p.suites ? String(p.suites) : '',
    vagas: p.vagas ? String(p.vagas) : '',
    area: p.tamanho_m2 ? `${p.tamanho_m2} m²` : '',
    terreno: p.area_terreno ? `${p.area_terreno} m²` : '',
    valor: valorFormatado,
    agio: agioFormatado,
    idade: p.idade_anos ? `${p.idade_anos} anos` : '',
    permuta: String(p.aceita_permuta).toUpperCase() === 'SIM',
    financ: String(p.aceita_financiamento).toUpperCase() === 'SIM',
    lazer: String(p.lazer).toUpperCase() === 'SIM',
    feats,
    desc: f.descricao !== undefined ? f.descricao : (p.descricao || ''),
    corretor: f.corretor || kit.corretor || '',
    fone: f.telefone || kit.telefone || '',
    creci: f.creci || kit.creci || '',
    email: f.email || kit.email || ''
  };
}

/** Resolve caminhos locais das fotos do imóvel */
function resolverFotosLocais(propriedade, fichaEditada = {}) {
  const p = propriedade || {};
  const fotosLista = Array.isArray(fichaEditada.fotos)
    ? fichaEditada.fotos
    : (Array.isArray(p.fotos) ? p.fotos : String(p.fotos || '').split(/[,;\n]/));

  return fotosLista
    .map(x => String(x || '').trim())
    .filter(Boolean)
    .map(nome => {
      const b = path.basename(nome);
      if (!/^[\w.-]+\.(jpe?g|png|webp)$/i.test(b)) return null;
      const full = path.join(FOTOS_DIR, b);
      return fs.existsSync(full) ? full : null;
    })
    .filter(Boolean)
    .slice(0, 10);
}

/**
 * Executa a geração através de Worker Thread com timeout e fallback A4.
 */
async function despacharParaWorker(tarefaPayload, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let finalizado = false;
    const worker = new Worker(path.join(__dirname, 'worker.js'));

    const timer = setTimeout(() => {
      if (!finalizado) {
        finalizado = true;
        worker.terminate().catch(() => {});
        reject(new Error(`Timeout de ${timeoutMs}ms na geração do PDF via Worker Thread`));
      }
    }, timeoutMs);

    worker.on('message', (msg) => {
      if (!finalizado) {
        finalizado = true;
        clearTimeout(timer);
        worker.terminate().catch(() => {});
        if (msg.ok) resolve(msg);
        else reject(new Error(msg.erro || 'Erro desconhecido no worker'));
      }
    });

    worker.on('error', (err) => {
      if (!finalizado) {
        finalizado = true;
        clearTimeout(timer);
        worker.terminate().catch(() => {});
        reject(err);
      }
    });

    worker.on('messageerror', (err) => {
      if (!finalizado) {
        finalizado = true;
        clearTimeout(timer);
        worker.terminate().catch(() => {});
        reject(err);
      }
    });

    worker.on('exit', (code) => {
      if (!finalizado) {
        finalizado = true;
        clearTimeout(timer);
        reject(new Error(`Worker finalizou abruptamente com código ${code}`));
      }
    });

    worker.postMessage(tarefaPayload);
  });
}

/**
 * Gera o PDF 16:9 de um imóvel com cache em disco e Fallback automático para a ficha A4.
 * @returns {Promise<{buffer: Buffer, nomeArquivo: string, isFallback: boolean}>}
 */
async function gerarPdfComFallback(propriedade, opcoes = {}) {
  if (!propriedade || typeof propriedade !== 'object') throw new Error('Imóvel inválido');
  const idRaw = String(propriedade.id ?? '');
  if (!idRaw || isForbiddenKey(idRaw)) throw new Error('ID do imóvel inválido');
  const safeId = sanitizeId(idRaw);

  const kit = carregarKit();
  const fichasNovas = carregarFichas16x9();
  const fichaSalva = Object.prototype.hasOwnProperty.call(fichasNovas, idRaw) ? fichasNovas[idRaw] : {};
  const fichaEditada = { ...(fichaSalva || {}), ...(opcoes.ficha || {}) };

  const modelo = opcoes.modelo || fichaEditada.modelo || kit.modelo || 'A';
  const paleta = opcoes.paleta || fichaEditada.paleta || kit.paletaPadrao || 'principal';
  const dados = comporDadosImovel(propriedade, fichaEditada, kit);
  const fotosCaminhos = resolverFotosLocais(propriedade, fichaEditada);
  const logoSeguro = validarLogoPath(kit.logoPath);
  const coresAtivas = paleta === 'segunda' ? kit.cores2 : kit.cores1;
  const paginasEfetivas = sanitizarPaginas(opcoes.paginas) || sanitizarPaginas(fichaEditada.paginas) || null;

  // Chave de cache do PDF pronto (inclui marca, paleta efetiva, logo e páginas)
  const hashInsumos = calcularHashInsumos({
    id: safeId,
    dados,
    fotosCaminhos,
    modelo,
    paleta,
    kitMarca: kit.marca,
    kitCores: coresAtivas,
    kitFonte: kit.fonte,
    logoPath: logoSeguro,
    paginas: paginasEfetivas
  });
  fs.mkdirSync(CACHE_PDF_DIR, { recursive: true });
  const pdfCachePath = path.join(CACHE_PDF_DIR, `ficha_${safeId}_${hashInsumos}.pdf`);
  if (!isSafePathInside(CACHE_PDF_DIR, pdfCachePath)) throw new Error('Caminho de cache inválido');

  const nomePdf = `${(dados.edificio || `Imovel_${safeId}`).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_').slice(0, 50)}_${safeId}.pdf`;

  // Se o PDF em cache já existir, entrega imediatamente
  if (!opcoes.forcar && fs.existsSync(pdfCachePath)) {
    try {
      const bufferCache = fs.readFileSync(pdfCachePath);
      if (bufferCache.length > 500 && bufferCache.slice(0, 4).toString() === '%PDF') {
        try { const now = new Date(); fs.utimesSync(pdfCachePath, now, now); } catch {}
        return { buffer: bufferCache, nomeArquivo: nomePdf, isFallback: false };
      }
    } catch {}
  }

  // Enfileira na fila serial com trava atômica PID
  const tarefaExecucao = async () => {
    let liberarTravaGlobal = null;
    try {
      liberarTravaGlobal = await adquirirTrava({ timeoutMs: 12000 });

      const payload = {
        modelo,
        paleta,
        kit: {
          marca: kit.marca,
          logoPath: logoSeguro,
          cores: coresAtivas,
          fonte: kit.fonte
        },
        dados,
        fotosCaminhos,
        paginas: paginasEfetivas,
        destinoPath: pdfCachePath,
        cacheFotosDir: CACHE_FOTOS_DIR
      };

      const resultado = await despacharParaWorker(payload, 15000);
      const bufferGerado = fs.readFileSync(pdfCachePath);
      limparCachePdfSeNecessario(CACHE_PDF_DIR);
      return { buffer: bufferGerado, nomeArquivo: nomePdf, isFallback: false, avisos: resultado.avisos };
    } catch (errWorker) {
      // FALLBACK AUTOMÁTICO PARA A FICHA A4 CLÁSSICA
      console.warn(`[AVISO] [PDF-16:9-FALLBACK] Falha ao gerar PDF 16:9 para o imóvel #${safeId}: ${errWorker.message}. Revertendo para ficha A4 clássica.`);
      try {
        const fichaA4 = require('../pdf-ficha');
        const fA4 = fichaA4.ficha(propriedade);
        const bufA4 = await fichaA4.gerar(propriedade, fA4);
        return { buffer: bufA4, nomeArquivo: fichaA4.nomeArquivo(propriedade, fA4), isFallback: true, erroOriginal: errWorker.message };
      } catch (errA4) {
        throw new Error(`Falha total em PDF 16:9 e no fallback A4: ${errA4.message}`);
      }
    } finally {
      if (liberarTravaGlobal) await liberarTravaGlobal();
    }
  };

  // Encadeia na fila
  const resultado = filaPromise.then(tarefaExecucao, tarefaExecucao);
  filaPromise = resultado.catch(() => {});
  return resultado;
}

/** Invalida o cache de PDF de um imóvel */
function invalidarCache(idImovel) {
  if (!fs.existsSync(CACHE_PDF_DIR)) return;
  try {
    const safeId = sanitizeId(idImovel);
    const prefixo = `ficha_${safeId}_`;
    for (const f of fs.readdirSync(CACHE_PDF_DIR)) {
      if (f.startsWith(prefixo)) {
        const full = path.join(CACHE_PDF_DIR, f);
        if (isSafePathInside(CACHE_PDF_DIR, full)) {
          try { fs.unlinkSync(full); } catch {}
        }
      }
    }
  } catch {}
}

/** Agenda pré-geração em background com debounce */
function agendarPreGeracao(propriedade, delayMs = 2000) {
  if (!propriedade || typeof propriedade !== 'object') return;
  const id = sanitizeId(propriedade.id);
  if (debounceTimers.has(id)) clearTimeout(debounceTimers.get(id));
  const t = setTimeout(() => {
    debounceTimers.delete(id);
    gerarPdfComFallback(propriedade, { forcar: true }).catch(() => {});
  }, delayMs);
  if (typeof t.unref === 'function') t.unref();
  debounceTimers.set(id, t);
}

function shutdown() {
  for (const t of debounceTimers.values()) clearTimeout(t);
  debounceTimers.clear();
}

module.exports = {
  carregarKit,
  salvarKit,
  carregarFichas16x9,
  salvarFicha16x9,
  restaurarFicha16x9,
  sanitizarPaginas,
  comporDadosImovel,
  resolverFotosLocais,
  gerarPdfComFallback,
  invalidarCache,
  agendarPreGeracao,
  limparCachePdfSeNecessario,
  validarLogoPath,
  sanitizeId,
  shutdown,
  CACHE_PDF_DIR,
  CACHE_FOTOS_DIR,
  ARQUIVO_KIT,
  ARQUIVO_FICHAS_16X9
};
