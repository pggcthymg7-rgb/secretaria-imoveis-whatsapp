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

// Fila serial local para garantir concurrency = 1 por processo
let filaPromise = Promise.resolve();
const debounceTimers = new Map();

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
  const novoKit = { ...kitAtual, ...dados };
  writeJson(ARQUIVO_KIT, novoKit);
  return novoKit;
}

function carregarFichas16x9() {
  return readJson(ARQUIVO_FICHAS_16X9, {});
}

function salvarFicha16x9(idImovel, dados) {
  const todas = carregarFichas16x9();
  todas[String(idImovel)] = { ...(todas[String(idImovel)] || {}), ...dados };
  writeJson(ARQUIVO_FICHAS_16X9, todas);
  return todas[String(idImovel)];
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
  const fotosLista = fichaEditada.fotos && fichaEditada.fotos.length
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

    worker.on('exit', (code) => {
      if (!finalizado && code !== 0) {
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
  const id = String(propriedade.id);
  const kit = carregarKit();
  const fichasNovas = carregarFichas16x9();
  const fichaEditada = { ...(fichasNovas[id] || {}), ...(opcoes.ficha || {}) };

  const modelo = opcoes.modelo || fichaEditada.modelo || kit.modelo || 'A';
  const paleta = opcoes.paleta || fichaEditada.paleta || kit.paletaPadrao || 'principal';
  const dados = comporDadosImovel(propriedade, fichaEditada, kit);
  const fotosCaminhos = resolverFotosLocais(propriedade, fichaEditada);

  // Chave de cache do PDF pronto
  const hashInsumos = calcularHashInsumos({ id, dados, fotosCaminhos, modelo, paleta, kitCores: kit.cores1, kitFonte: kit.fonte });
  fs.mkdirSync(CACHE_PDF_DIR, { recursive: true });
  const pdfCachePath = path.join(CACHE_PDF_DIR, `ficha_${id}_${hashInsumos}.pdf`);

  const nomePdf = `${(dados.edificio || `Imovel_${id}`).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_').slice(0, 50)}_${id}.pdf`;

  // Se o PDF em cache já existir, entrega imediatamente
  if (!opcoes.forcar && fs.existsSync(pdfCachePath)) {
    try {
      const bufferCache = fs.readFileSync(pdfCachePath);
      if (bufferCache.length > 500 && bufferCache.slice(0, 4).toString() === '%PDF') {
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
          logoPath: kit.logoPath,
          cores: paleta === 'segunda' ? kit.cores2 : kit.cores1,
          fonte: kit.fonte
        },
        dados,
        fotosCaminhos,
        paginas: opcoes.paginas || null,
        destinoPath: pdfCachePath,
        cacheFotosDir: CACHE_FOTOS_DIR
      };

      const resultado = await despacharParaWorker(payload, 15000);
      const bufferGerado = fs.readFileSync(pdfCachePath);
      return { buffer: bufferGerado, nomeArquivo: nomePdf, isFallback: false, avisos: resultado.avisos };
    } catch (errWorker) {
      // FALLBACK AUTOMÁTICO PARA A FICHA A4 CLÁSSICA
      console.warn(`[AVISO] [PDF-16:9-FALLBACK] Falha ao gerar PDF 16:9 para o imóvel #${id}: ${errWorker.message}. Revertendo para ficha A4 clássica.`);
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
    const prefixo = `ficha_${idImovel}_`;
    for (const f of fs.readdirSync(CACHE_PDF_DIR)) {
      if (f.startsWith(prefixo)) {
        try { fs.unlinkSync(path.join(CACHE_PDF_DIR, f)); } catch {}
      }
    }
  } catch {}
}

/** Agenda pré-geração em background com debounce */
function agendarPreGeracao(propriedade, delayMs = 2000) {
  const id = String(propriedade.id);
  if (debounceTimers.has(id)) clearTimeout(debounceTimers.get(id));
  const t = setTimeout(() => {
    debounceTimers.delete(id);
    gerarPdfComFallback(propriedade, { forcar: true }).catch(() => {});
  }, delayMs);
  debounceTimers.set(id, t);
}

module.exports = {
  carregarKit,
  salvarKit,
  carregarFichas16x9,
  salvarFicha16x9,
  comporDadosImovel,
  resolverFotosLocais,
  gerarPdfComFallback,
  invalidarCache,
  agendarPreGeracao,
  CACHE_PDF_DIR,
  CACHE_FOTOS_DIR,
  ARQUIVO_KIT,
  ARQUIVO_FICHAS_16X9
};
