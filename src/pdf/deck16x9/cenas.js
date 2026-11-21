'use strict';
/**
 * Cenas editáveis JSON v1 (1152 × 648 pt) para os 12 modelos canônicos × 2 paletas
 * e aliases legados ('A', 'B', 'D', 'E', 'F').
 * Cada modelo possui composição geométrica e editorial própria em todos os
 * 6 slides padrão (capa, resumo, foto, galeria, texto, contato).
 */
const crypto = require('crypto');
const { derivar } = require('./kit');
const { W, H, CATALOGO_12, resolverCatalogoModelo } = require('./modelos');

const NOMES_FONTES_GOOGLE = {
  Jost: 'Jost',
  Montserrat: 'Montserrat',
  Outfit: 'Outfit',
  CormorantGaramond: 'Cormorant Garamond',
  WorkSans: 'Work Sans',
  PlayfairDisplay: 'Playfair Display',
  EBGaramond: 'EB Garamond',
  ArchivoBlack: 'Archivo Black',
  Archivo: 'Archivo',
  Anton: 'Anton',
  AlfaSlabOne: 'Alfa Slab One',
  Lora: 'Lora',
  SourceSans3: 'Source Sans 3',
  Merriweather: 'Merriweather',
  LibreBaskerville: 'Libre Baskerville',
  BodoniModa: 'Bodoni Moda',
  PinyonScript: 'Pinyon Script',
  LibreBodoni: 'Libre Bodoni'
};

const COMPATIVEIS_MODELO = {
  'assinatura-classica': ['Jost', 'Montserrat', 'Outfit'],
  'revista-atelier': ['Playfair Display', 'Cormorant Garamond', 'EB Garamond'],
  'faixa-imperial': ['Playfair Display', 'Archivo Black', 'Montserrat'],
  'essencia-moderna': ['Outfit', 'Lora', 'Merriweather'],
  'galeria-prive': ['Bodoni Moda', 'Libre Bodoni', 'Playfair Display'],
  'arquitetura-suica': ['Archivo Black', 'Archivo', 'Jost'],
  'vitrine-fosca': ['Playfair Display', 'Work Sans', 'Montserrat'],
  'traco-fino': ['Cormorant Garamond', 'Work Sans', 'Montserrat'],
  'noite-dourada': ['Cormorant Garamond', 'Playfair Display', 'Montserrat'],
  'visao-glass': ['Outfit', 'Work Sans', 'Montserrat'],
  'manchete-nobre': ['Playfair Display', 'Cormorant Garamond', 'Montserrat'],
  'moldura-serena': ['Cormorant Garamond', 'Jost', 'Libre Baskerville'],
  A: ['Jost', 'Montserrat', 'Outfit'],
  B: ['Cormorant Garamond', 'Playfair Display', 'EB Garamond'],
  D: ['Archivo Black', 'Anton', 'Alfa Slab One'],
  E: ['Lora', 'Merriweather', 'Libre Baskerville'],
  F: ['Bodoni Moda', 'Libre Bodoni', 'Playfair Display']
};

const LEG_QR = 'Abrir conversa no WhatsApp';
const PAGINAS_PADRAO = ['capa', 'resumo', 'foto', 'galeria', 'texto', 'contato'];

function uid(prefix = 'c') {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

function nomeFonteGoogle(raw) {
  if (!raw || typeof raw !== 'string') return 'Jost';
  const semEsp = raw.replace(/\s+/g, '');
  if (Object.prototype.hasOwnProperty.call(NOMES_FONTES_GOOGLE, semEsp)) {
    return NOMES_FONTES_GOOGLE[semEsp];
  }
  return raw.trim();
}

function resolverModeloId(modeloId) {
  return resolverCatalogoModelo(modeloId).id;
}

function resolverPaleta(M, paletaId, kit, opts = {}) {
  const pid = String(paletaId || 'principal').toLowerCase() === 'segunda' ? 'segunda' : 'principal';
  const base = pid === 'segunda' ? M.pal2 : M.pal1;
  if (opts.paletaCores) {
    try {
      return { pid, pal: derivar(opts.paletaCores) };
    } catch {}
  }
  if (opts.usarCoresKit && kit) {
    const cand = pid === 'segunda' ? kit.cores2 : kit.cores1;
    if (cand) {
      try {
        return { pid, pal: derivar(cand) };
      } catch {}
    }
  }
  return { pid, pal: derivar(base) };
}

function compativeisPorModelo(id) {
  switch (id) {
    case 'arquitetura-suica': return COMPATIVEIS_MODELO['arquitetura-suica'];
    case 'revista-atelier': return COMPATIVEIS_MODELO['revista-atelier'];
    case 'vitrine-fosca': return COMPATIVEIS_MODELO['vitrine-fosca'];
    case 'traco-fino': return COMPATIVEIS_MODELO['traco-fino'];
    case 'noite-dourada': return COMPATIVEIS_MODELO['noite-dourada'];
    case 'essencia-moderna': return COMPATIVEIS_MODELO['essencia-moderna'];
    case 'visao-glass': return COMPATIVEIS_MODELO['visao-glass'];
    case 'galeria-prive': return COMPATIVEIS_MODELO['galeria-prive'];
    case 'manchete-nobre': return COMPATIVEIS_MODELO['manchete-nobre'];
    case 'faixa-imperial': return COMPATIVEIS_MODELO['faixa-imperial'];
    case 'moldura-serena': return COMPATIVEIS_MODELO['moldura-serena'];
    case 'assinatura-classica':
    default:
      return COMPATIVEIS_MODELO['assinatura-classica'];
  }
}

function resolverFontesModelo(M, kit) {
  const tOrig = nomeFonteGoogle(M.fontes.t);
  const bOrig = nomeFonteGoogle(M.fontes.b);
  const sOrig = M.fontes.s ? nomeFonteGoogle(M.fontes.s) : tOrig;
  let t = tOrig;
  if (kit && kit.fonte) {
    const kitFam = nomeFonteGoogle(kit.fonte);
    if (compativeisPorModelo(M.id).includes(kitFam)) t = kitFam;
  }
  return { t, b: bOrig, s: sOrig };
}

// ------------------------------------------------------------------ Fábrica de Camadas Schema v1
function mkFoto(nome, x, y, w, h, indiceFoto = 0, extra = {}) {
  return {
    id: uid('ft'),
    tipo: 'foto',
    nome,
    x,
    y,
    w,
    h,
    rot: 0,
    skewX: 0,
    skewY: 0,
    opacidade: 1,
    visivel: true,
    travada: false,
    indiceFoto,
    zoom: 1,
    offX: 0,
    offY: 0,
    brilho: 100,
    contraste: 100,
    saturacao: 100,
    desfoque: 0,
    raio: 0,
    borda: 0,
    corBorda: '#ffffff',
    ...extra
  };
}

function mkRect(nome, x, y, w, h, cor, extra = {}) {
  return {
    id: uid('rc'),
    tipo: 'retangulo',
    nome,
    x,
    y,
    w,
    h,
    rot: 0,
    skewX: 0,
    skewY: 0,
    opacidade: 1,
    visivel: true,
    travada: false,
    cor,
    raio: 0,
    borda: 0,
    corBorda: '#ffffff',
    blurFundo: 0,
    ...extra
  };
}

function mkCirc(nome, x, y, w, h, cor, extra = {}) {
  return {
    id: uid('cr'),
    tipo: 'circulo',
    nome,
    x,
    y,
    w,
    h,
    rot: 0,
    skewX: 0,
    skewY: 0,
    opacidade: 1,
    visivel: true,
    travada: false,
    cor,
    borda: 0,
    corBorda: '#ffffff',
    ...extra
  };
}

function mkPoly(nome, x, y, w, h, vertices, cor, extra = {}) {
  return {
    id: uid('pg'),
    tipo: 'poligono',
    nome,
    x,
    y,
    w,
    h,
    rot: 0,
    skewX: 0,
    skewY: 0,
    opacidade: 1,
    visivel: true,
    travada: false,
    vertices,
    cor,
    borda: 0,
    corBorda: '#ffffff',
    ...extra
  };
}

function mkDeg(nome, x, y, w, h, cor1, cor2, angulo = 180, extra = {}) {
  return {
    id: uid('dg'),
    tipo: 'degrade',
    nome,
    x,
    y,
    w,
    h,
    rot: 0,
    skewX: 0,
    skewY: 0,
    opacidade: 1,
    visivel: true,
    travada: false,
    cor1,
    cor2,
    angulo,
    raio: 0,
    ...extra
  };
}

function mkLinha(nome, x, y, w, cor, espessura = 1, extra = {}) {
  const h = Math.max(4, espessura);
  return {
    id: uid('ln'),
    tipo: 'linha',
    nome,
    x,
    y: Math.round(y - h / 2),
    w,
    h,
    rot: 0,
    skewX: 0,
    skewY: 0,
    opacidade: 1,
    visivel: true,
    travada: false,
    pontos: [0, Math.round(h / 2), w, Math.round(h / 2)],
    cor,
    espessura,
    ponta: 'butt',
    ...extra
  };
}

function mkLinhaV(nome, x, y, h, cor, espessura = 1, extra = {}) {
  const w = Math.max(4, espessura);
  return {
    id: uid('lnv'),
    tipo: 'linha',
    nome,
    x: Math.round(x - w / 2),
    y,
    w,
    h,
    rot: 0,
    skewX: 0,
    skewY: 0,
    opacidade: 1,
    visivel: true,
    travada: false,
    pontos: [Math.round(w / 2), 0, Math.round(w / 2), h],
    cor,
    espessura,
    ponta: 'butt',
    ...extra
  };
}

function mkTxt(nome, texto, x, y, w, h, fonte, peso, tamanho, cor, extra = {}) {
  return {
    id: uid('tx'),
    tipo: 'texto',
    nome,
    texto,
    x,
    y,
    w,
    h: Math.max(16, h),
    rot: 0,
    skewX: 0,
    skewY: 0,
    opacidade: 1,
    visivel: true,
    travada: false,
    fonte,
    peso,
    italico: false,
    tamanho,
    cor,
    alinhamento: 'left',
    entrelinha: 1.15,
    espacamento: 0,
    escalaX: 1,
    escalaY: 1,
    maiusculas: false,
    autoFit: false,
    ancora: 'topo',
    sombra: 0,
    corSombra: '#000000',
    contorno: 0,
    corContorno: '#000000',
    fundo: false,
    corFundo: '#5266eb',
    raioFundo: 0,
    folga: 0,
    bordaFundo: 0,
    corBordaFundo: '#ffffff',
    ...extra
  };
}

function mkIcone(iconeId, x, y, size, cor, extra = {}) {
  return {
    id: uid('ic'),
    tipo: 'icone',
    nome: `Ícone ${iconeId}`,
    iconeId,
    x,
    y,
    w: size,
    h: size,
    rot: 0,
    skewX: 0,
    skewY: 0,
    opacidade: 1,
    visivel: true,
    travada: false,
    cor,
    corFundo: '#5266eb',
    formaFundo: 'nenhum',
    folga: Math.round(size * 0.22),
    bordaFundo: 0,
    corBordaFundo: '#ffffff',
    ...extra
  };
}

function mkLogo(x, y, s, forma, raio, corFundo, corTexto, extra = {}) {
  return {
    id: uid('lg'),
    tipo: 'logo',
    nome: 'Logo da Marca',
    origem: 'kit',
    x,
    y,
    w: s,
    h: s,
    rot: 0,
    skewX: 0,
    skewY: 0,
    opacidade: 1,
    visivel: true,
    travada: false,
    forma: forma === 'circle' ? 'circulo' : 'quadrado',
    raio: raio || 0,
    corFundo,
    corTexto,
    ...extra
  };
}

function mkMarca(x, y, opts, pal, fnt, wNome = 320) {
  const s = opts.s || 28;
  const nm = opts.nm || 14;
  const gap = opts.gap || 10;
  return [
    mkLogo(x, y, s, opts.forma, opts.r || 0, pal[opts.fill] || pal.destaque, pal['sobre-' + (opts.fill || 'destaque')] || pal.texto),
    mkTxt('Marca', '{marca}', x + s + gap, Math.round(y + (s - nm * 1.2) / 2), wNome, Math.round(nm * 1.5), fnt.b, opts.wt || 500, nm, pal[opts.c] || pal.texto)
  ];
}

function mkQr(x, y, size, pal, raio = 0) {
  return {
    id: uid('qr'),
    tipo: 'qrcode',
    nome: 'QR WhatsApp',
    origem: 'whatsapp',
    url: '',
    x,
    y,
    w: size,
    h: size,
    rot: 0,
    skewX: 0,
    skewY: 0,
    opacidade: 1,
    visivel: true,
    travada: false,
    corEscuro: pal['qr-escuro'],
    corClaro: pal['qr-claro'],
    raio,
    margem: 4
  };
}

// ============================================================================
// 1. ARQUITETURA SUÍÇA (Grid Técnico + Monumental Archivo Black)
// ============================================================================
function slideArquiteturaSuica(tipo, pal, fnt) {
  switch (tipo) {
    case 'capa':
      return {
        id: uid('sl'),
        nome: 'Capa',
        tipo: 'capa',
        fundo: '#101116',
        camadas: [
          mkFoto('Foto capa full-bleed', 0, 0, W, H, 0),
          mkDeg('Véu topo', 0, 0, W, 190, '#101116cc', '#10111600', 180),
          mkDeg('Véu base', 0, 290, W, 358, '#10111600', '#101116f0', 180),
          mkTxt('Marca topo', '{marca}', 44, 34, 320, 28, fnt.b, 700, 15, '#ffffff', { espacamento: 4, maiusculas: true }),
          mkTxt('Micro-specs', '{area} · {quartos} qts · {suites} suítes · {vagas} vagas', 360, 36, 440, 24, fnt.b, 400, 13, '#e4e6ef', { alinhamento: 'center', autoFit: true }),
          mkTxt('Preço topo', '{preco}', 820, 30, 288, 34, fnt.b, 700, 24, '#ffffff', { alinhamento: 'right', autoFit: true }),
          mkLinha('Divisor suíço 1', 44, 80, 1064, '#ffffff66', 1.5),
          mkLinha('Divisor suíço 2', 44, 412, 1064, '#ffffff66', 1.5),
          mkTxt('Metadados', '{tipo} · {localizacao}', 44, 426, 1064, 24, fnt.b, 700, 14, '#d4d6e0', { espacamento: 3, maiusculas: true }),
          mkTxt('Nome kicker', '{nomeKicker}', 44, 458, 1064, 36, fnt.b, 700, 24, '#e4e6ef', { espacamento: 4, maiusculas: true, autoFit: true }),
          mkTxt('Nome destaque', '{nomeDestaque}', 44, 494, 1064, 128, fnt.t, 400, 104, '#ffffff', { maiusculas: true, entrelinha: 0.94, autoFit: true })
        ]
      };
    case 'resumo':
      return {
        id: uid('sl'),
        nome: 'Resumo',
        tipo: 'resumo',
        fundo: pal.fundo,
        camadas: [
          mkTxt('Índice técnico', '01 / FICHA TÉCNICA', 44, 36, 320, 24, fnt.b, 700, 13, pal.destaque, { espacamento: 3 }),
          mkTxt('Nome resumo', '{nome}', 380, 32, 728, 34, fnt.b, 700, 22, pal.texto, { alinhamento: 'right', autoFit: true }),
          mkLinha('Grid H1', 44, 82, 1064, pal.texto, 1.5, { opacidade: 0.25 }),
          mkLinhaV('Grid V1', 398, 82, 340, pal.texto, 1.5, { opacidade: 0.2 }),
          mkLinhaV('Grid V2', 754, 82, 340, pal.texto, 1.5, { opacidade: 0.2 }),
          mkTxt('Área', '{area}', 44, 118, 330, 88, fnt.t, 400, 68, pal.texto, { autoFit: true }),
          mkTxt('Área lbl', 'ÁREA PRIVATIVA', 44, 214, 330, 20, fnt.b, 700, 12, pal.secundaria, { espacamento: 2 }),
          mkTxt('Quartos', '{quartos} QUARTOS', 424, 118, 300, 48, fnt.b, 700, 34, pal.texto, { autoFit: true }),
          mkTxt('Suítes', '{suites} SUÍTES', 424, 180, 300, 44, fnt.b, 400, 28, pal.texto, { opacidade: 0.8 }),
          mkTxt('Vagas', '{vagas} VAGAS', 424, 236, 300, 44, fnt.b, 400, 28, pal.texto, { opacidade: 0.8 }),
          mkTxt('Rótulo valor', '{precoRotulo}', 780, 118, 328, 22, fnt.b, 700, 12, pal.destaque, { espacamento: 2, maiusculas: true }),
          mkTxt('Preço grid', '{preco}', 780, 148, 328, 96, fnt.t, 400, 56, pal.texto, { autoFit: true }),
          mkTxt('Localização', '{localizacao}', 780, 260, 328, 28, fnt.b, 400, 15, pal.secundaria),
          mkLinha('Grid H2', 44, 422, 1064, pal.texto, 1.5, { opacidade: 0.25 }),
          mkTxt('Destaques lbl', 'ESPECIFICAÇÕES', 44, 444, 240, 22, fnt.b, 700, 12, pal.secundaria, { espacamento: 2 }),
          mkTxt('Destaques', '{destaques}', 44, 476, 1064, 134, fnt.b, 400, 20, pal.texto, { entrelinha: 1.5, autoFit: true })
        ]
      };
    case 'foto':
      return {
        id: uid('sl'),
        nome: 'Foto grande',
        tipo: 'foto',
        fundo: pal.fundo,
        camadas: [
          mkRect('Faixa técnica esquerda', 0, 0, 316, 648, pal.principal),
          mkLinhaV('Divisor suíço foto', 316, 0, 648, pal.destaque, 2),
          mkTxt('Tag arquivo', 'VISTA PRINCIPAL · {codigo}', 36, 44, 244, 24, fnt.b, 700, 12, pal.destaque, { espacamento: 2 }),
          mkTxt('Título lateral', '{nome}', 36, 220, 244, 150, fnt.t, 400, 34, pal.texto, { entrelinha: 1.05, autoFit: true }),
          mkTxt('Localização lateral', '{localizacao}', 36, 400, 244, 40, fnt.b, 400, 14, pal.secundaria),
          mkTxt('Specs base lateral', '{area}\n{quartos} quartos · {vagas} vagas', 36, 540, 244, 58, fnt.b, 700, 14, pal.texto, { entrelinha: 1.4 }),
          mkFoto('Foto suíça direita', 318, 0, 834, 648, 1)
        ]
      };
    case 'galeria':
      return {
        id: uid('sl'),
        nome: 'Galeria',
        tipo: 'galeria',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Suíça topo ampla', 36, 36, 1080, 282, 2),
          mkFoto('Suíça inf 1', 36, 338, 346, 274, 3),
          mkFoto('Suíça inf 2', 402, 338, 346, 274, 4),
          mkFoto('Suíça inf 3', 768, 338, 348, 274, 5)
        ]
      };
    case 'texto':
      return {
        id: uid('sl'),
        nome: 'Descrição',
        tipo: 'texto',
        fundo: pal.fundo,
        camadas: [
          mkLinha('Régua topo texto', 44, 44, 1064, pal.texto, 2, { opacidade: 0.4 }),
          mkTxt('Cabeçalho memorial', 'MEMORIAL DESCRITIVO', 44, 64, 520, 44, fnt.t, 400, 34, pal.texto, { maiusculas: true }),
          mkTxt('Tag bairro', '{tipo} · {localizacao}', 620, 72, 488, 28, fnt.b, 700, 14, pal.destaque, { alinhamento: 'right' }),
          mkLinha('Régua mid', 44, 128, 1064, pal.texto, 1, { opacidade: 0.2 }),
          mkTxt('Descrição corpo', '{descricao}', 44, 160, 1064, 430, fnt.b, 400, 19, pal.texto, { entrelinha: 1.68, autoFit: true })
        ]
      };
    case 'contato':
      return {
        id: uid('sl'),
        nome: 'Contato',
        tipo: 'contato',
        fundo: pal.fundo,
        camadas: [
          mkRect('Bloco técnico esq', 0, 0, 380, 648, pal.principal),
          ...mkMarca(44, 44, { s: 32, forma: 'rect', r: 0, fill: 'destaque', nm: 15, wt: 700, c: 'texto', gap: 12 }, pal, fnt, 280),
          mkQr(76, 210, 228, pal, 0),
          mkTxt('Legenda QR', LEG_QR, 44, 464, 292, 24, fnt.b, 700, 12, pal.secundaria, { alinhamento: 'center', espacamento: 1 }),
          mkTxt('Corretor', '{corretor}', 440, 110, 668, 120, fnt.t, 400, 64, pal.texto, { maiusculas: true, autoFit: true }),
          mkLinha('Grid contato 1', 440, 260, 668, pal.texto, 1.5, { opacidade: 0.25 }),
          mkTxt('Telefone', '{telefone}', 440, 296, 668, 52, fnt.b, 700, 38, pal.texto),
          mkTxt('E-mail', '{email}', 440, 360, 668, 30, fnt.b, 400, 20, pal.secundaria),
          mkLinha('Grid contato 2', 440, 420, 668, pal.texto, 1.5, { opacidade: 0.25 }),
          mkTxt('CRECI', '{creci}', 440, 456, 668, 28, fnt.b, 700, 16, pal.destaque),
          mkTxt('Rodapé', '{rodape}', 440, 586, 668, 22, fnt.b, 400, 12, pal.secundaria)
        ]
      };
    default:
      return { id: uid('sl'), nome: 'Página em branco', tipo: 'livre', fundo: pal.fundo, camadas: [] };
  }
}

// ============================================================================
// 2. REVISTA ATELIER (alias B — Editorial Claro + Serif + 4 Colunas)
// ============================================================================
function slideRevistaAtelier(tipo, pal, fnt) {
  switch (tipo) {
    case 'capa':
      return {
        id: uid('sl'),
        nome: 'Capa',
        tipo: 'capa',
        fundo: '#15161B',
        camadas: [
          mkFoto('Foto capa full-bleed', 0, 0, W, H, 0),
          mkDeg('Véu editorial claro', 0, 0, W, 280, '#E8EBEEF0', '#E8EBEE00', 180),
          mkDeg('Base escura full-bleed', 0, 360, W, 288, '#0F101400', '#0F1014F2', 180),
          mkTxt('Título serifado', '{nome}', 72, 34, 1008, 76, fnt.t, 600, 56, '#15161B', { alinhamento: 'center', autoFit: true }),
          mkTxt('Subtítulo itálico', '{tipo} · {bairro}', 72, 114, 1008, 34, fnt.s, 400, 24, '#2F323B', { alinhamento: 'center', italico: true }),
          mkLinha('Filete central', 520, 158, 112, '#15161B99', 2),
          mkLinhaV('Col div 1', 324, 488, 66, '#ffffff4d', 1.5),
          mkLinhaV('Col div 2', 576, 488, 66, '#ffffff4d', 1.5),
          mkLinhaV('Col div 3', 828, 488, 66, '#ffffff4d', 1.5),
          mkIcone('quarto', 184, 488, 24, '#ffffff'),
          mkTxt('Col Qts', '{quartos} qts', 88, 520, 216, 26, 'Montserrat', 700, 16, '#ffffff', { alinhamento: 'center' }),
          mkIcone('suite', 436, 488, 24, '#ffffff'),
          mkTxt('Col Suites', '{suites} suítes', 340, 520, 216, 26, 'Montserrat', 700, 16, '#ffffff', { alinhamento: 'center' }),
          mkIcone('vaga', 688, 488, 24, '#ffffff'),
          mkTxt('Col Vagas', '{vagas} vagas', 592, 520, 216, 26, 'Montserrat', 700, 16, '#ffffff', { alinhamento: 'center' }),
          mkIcone('area', 940, 488, 24, '#ffffff'),
          mkTxt('Col Area', '{area}', 844, 520, 216, 26, 'Montserrat', 700, 16, '#ffffff', { alinhamento: 'center' }),
          mkTxt('Botão Preço', '{preco} →', 396, 574, 360, 46, 'Montserrat', 700, 22, '#ffffff', {
            alinhamento: 'center', autoFit: true, fundo: true, corFundo: '#0F101466', raioFundo: 4, folga: 10, bordaFundo: 1.5, corBordaFundo: '#ffffff'
          })
        ]
      };
    case 'resumo':
      return {
        id: uid('sl'),
        nome: 'Resumo',
        tipo: 'resumo',
        fundo: pal.fundo,
        camadas: [
          ...mkMarca(72, 56, { s: 24, forma: 'circle', fill: 'principal', nm: 12, wt: 400, c: 'texto', gap: 10 }, pal, fnt),
          mkTxt('Rótulo preço', '{precoRotulo}', 72, 146, 400, 20, fnt.b, 400, 12, pal.texto, { opacidade: 0.62 }),
          mkTxt('Preço', '{preco}', 72, 170, 400, 76, fnt.t, 600, 58, pal.texto, { autoFit: true }),
          mkTxt('Tipo', '{tipo} · {negociacao}', 72, 268, 400, 20, fnt.b, 400, 12, pal.texto, { opacidade: 0.62 }),
          mkTxt('Nome', '{nome}', 72, 292, 400, 52, fnt.t, 400, 22, pal.texto, { autoFit: true }),
          mkTxt('Localização', '{localizacao}', 72, 348, 400, 22, fnt.b, 400, 13, pal.texto),
          mkTxt('Destaques título', 'Destaques', 72, 408, 400, 20, fnt.b, 400, 12, pal.texto, { opacidade: 0.62 }),
          mkTxt('Destaques', '{destaques}', 72, 434, 400, 150, fnt.b, 400, 15, pal.texto, { entrelinha: 1.65, autoFit: true }),
          mkLinha('Linha 1', 560, 150, 520, pal.secundaria, 1),
          mkTxt('Área lbl', 'Área', 560, 166, 200, 22, fnt.b, 400, 12, pal.texto, { opacidade: 0.62 }),
          mkTxt('Área val', '{area}', 760, 160, 320, 34, fnt.t, 600, 28, pal.texto, { alinhamento: 'right' }),
          mkLinha('Linha 2', 560, 212, 520, pal.secundaria, 1),
          mkTxt('Terreno lbl', 'Área total', 560, 228, 200, 22, fnt.b, 400, 12, pal.texto, { opacidade: 0.62 }),
          mkTxt('Terreno val', '{areaTotal}', 760, 222, 320, 34, fnt.t, 600, 28, pal.texto, { alinhamento: 'right' }),
          mkLinha('Linha 3', 560, 274, 520, pal.secundaria, 1),
          mkTxt('Quartos lbl', 'Quartos', 560, 290, 200, 22, fnt.b, 400, 12, pal.texto, { opacidade: 0.62 }),
          mkTxt('Quartos val', '{quartos}', 760, 284, 320, 34, fnt.t, 600, 28, pal.texto, { alinhamento: 'right' }),
          mkLinha('Linha 4', 560, 336, 520, pal.secundaria, 1),
          mkTxt('Suítes lbl', 'Suítes', 560, 352, 200, 22, fnt.b, 400, 12, pal.texto, { opacidade: 0.62 }),
          mkTxt('Suítes val', '{suites}', 760, 346, 320, 34, fnt.t, 600, 28, pal.texto, { alinhamento: 'right' }),
          mkLinha('Linha 5', 560, 398, 520, pal.secundaria, 1),
          mkTxt('Vagas lbl', 'Vagas', 560, 414, 200, 22, fnt.b, 400, 12, pal.texto, { opacidade: 0.62 }),
          mkTxt('Vagas val', '{vagas}', 760, 408, 320, 34, fnt.t, 600, 28, pal.texto, { alinhamento: 'right' })
        ]
      };
    case 'foto':
      return {
        id: uid('sl'),
        nome: 'Foto grande',
        tipo: 'foto',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Foto editorial ampla', 72, 44, 1008, 492, 1),
          mkLinha('Hairline legenda', 72, 554, 1008, pal.secundaria, 1),
          mkTxt('Nome', '{nome}', 72, 570, 620, 32, fnt.t, 600, 24, pal.texto),
          mkTxt('Localização itálica', '{localizacao}', 708, 574, 372, 26, fnt.s, 400, 18, pal.secundaria, { alinhamento: 'right', italico: true })
        ]
      };
    case 'galeria':
      return {
        id: uid('sl'),
        nome: 'Galeria',
        tipo: 'galeria',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Editorial retrato 1', 72, 56, 320, 504, 2),
          mkFoto('Editorial retrato 2', 416, 56, 320, 504, 3),
          mkFoto('Editorial retrato 3', 760, 56, 320, 504, 4),
          mkTxt('Rodapé editorial', '{nome} · {bairro}', 72, 578, 1008, 26, fnt.s, 400, 18, pal.secundaria, { alinhamento: 'center', italico: true })
        ]
      };
    case 'texto':
      return {
        id: uid('sl'),
        nome: 'Descrição',
        tipo: 'texto',
        fundo: pal.fundo,
        camadas: [
          mkTxt('Título seção', 'Sobre o Imóvel', 72, 58, 1008, 52, fnt.t, 600, 40, pal.texto, { alinhamento: 'center' }),
          mkLinha('Hairline texto', 506, 128, 140, pal.destaque, 2),
          mkTxt('Descrição', '{descricao}', 146, 160, 860, 376, fnt.b, 400, 17, pal.texto, { entrelinha: 1.75, alinhamento: 'center', autoFit: true }),
          mkLinha('Hairline base', 72, 556, 1008, pal.secundaria, 1),
          mkTxt('Nome rodapé', '{nome} · {localizacao}', 72, 574, 1008, 24, fnt.s, 400, 16, pal.secundaria, { alinhamento: 'center', italico: true })
        ]
      };
    case 'contato':
      return {
        id: uid('sl'),
        nome: 'Contato',
        tipo: 'contato',
        fundo: pal.fundo,
        camadas: [
          ...mkMarca(72, 64, { s: 26, forma: 'circle', fill: 'principal', nm: 13, wt: 400, c: 'texto', gap: 10 }, pal, fnt),
          mkLinha('Divisor contato', 72, 128, 1008, pal.secundaria, 1),
          mkTxt('Corretor', '{corretor}', 72, 224, 580, 96, fnt.t, 600, 52, pal.texto, { autoFit: true }),
          mkTxt('CRECI', '{creci}', 72, 326, 580, 24, fnt.b, 400, 14, pal.secundaria),
          mkTxt('Telefone', '{telefone}', 72, 396, 580, 42, fnt.t, 600, 32, pal.texto),
          mkTxt('E-mail', '{email}', 72, 446, 580, 26, fnt.b, 400, 16, pal.secundaria),
          mkTxt('Rodapé', '{rodape}', 72, 572, 580, 20, fnt.b, 400, 12, pal.secundaria),
          mkQr(776, 198, 250, pal, 6),
          mkTxt('Legenda QR', LEG_QR, 720, 466, 362, 24, fnt.b, 400, 12, pal.secundaria, { alinhamento: 'center' })
        ]
      };
    default:
      return { id: uid('sl'), nome: 'Página em branco', tipo: 'livre', fundo: pal.fundo, camadas: [] };
  }
}

// ============================================================================
// 3. VITRINE FOSCA (Split 49% Fosco + Pílula Contorno Dourado)
// ============================================================================
function slideVitrineFosca(tipo, pal, fnt) {
  switch (tipo) {
    case 'capa':
      return {
        id: uid('sl'),
        nome: 'Capa',
        tipo: 'capa',
        fundo: '#0D1018',
        camadas: [
          mkFoto('Foto capa nítida', 0, 0, W, H, 0),
          mkRect('Painel esquerdo fosco', 0, 0, 564, H, '#0D1018A6', { blurFundo: 22 }),
          mkLinhaV('Filete divisório', 564, 0, H, '#ffffff66', 2),
          mkTxt('Tipo neg', '{tipo} · {negociacao}', 48, 84, 468, 24, fnt.b, 400, 13, '#D4AF37', { alinhamento: 'center', espacamento: 3, maiusculas: true }),
          mkTxt('Nome vitrine', '{nome}', 48, 136, 468, 144, fnt.t, 600, 50, '#ffffff', { alinhamento: 'center', entrelinha: 1.05, autoFit: true }),
          mkTxt('Bairro', '{bairro}', 48, 294, 468, 28, fnt.b, 400, 16, '#E2E5F0', { alinhamento: 'center' }),
          mkLinha('Traço dourado', 214, 344, 136, '#D4AF37', 2),
          mkTxt('Specs vitrine', '{area} · {quartos} qts\n{suites} suítes · {vagas} vagas', 48, 376, 468, 72, fnt.b, 400, 16, '#ededf3', { alinhamento: 'center', entrelinha: 1.55 }),
          mkTxt('Pílula Dourada', '{preco}', 96, 496, 372, 58, 'Montserrat', 700, 26, '#ffffff', {
            alinhamento: 'center', autoFit: true, fundo: true, corFundo: '#0D1018EB', raioFundo: 999, folga: 14, bordaFundo: 2, corBordaFundo: '#D4AF37'
          })
        ]
      };
    case 'resumo':
      return {
        id: uid('sl'),
        nome: 'Resumo',
        tipo: 'resumo',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Foto fundo sutil', 0, 0, W, H, 1, { brilho: 55 }),
          mkRect('Cartão vidro resumo', 56, 56, 610, 536, '#0D1018B3', { blurFundo: 22, raio: 24, borda: 1.5, corBorda: '#D4AF3766' }),
          mkTxt('Nome', '{nome}', 96, 92, 530, 54, fnt.t, 600, 34, '#ffffff', { autoFit: true }),
          mkTxt('Localização', '{localizacao}', 96, 150, 530, 24, fnt.b, 400, 14, '#D4AF37'),
          mkTxt('Specs coluna 1', 'Área: {area}\nQuartos: {quartos}\nSuítes: {suites}\nVagas: {vagas}', 96, 208, 530, 140, fnt.b, 400, 18, '#ffffff', { entrelinha: 1.68 }),
          mkTxt('Destaques vitrine', '{destaques}', 96, 372, 530, 178, fnt.b, 400, 15, '#DCDCE8', { entrelinha: 1.5, autoFit: true }),
          mkRect('Cartão vidro preço', 704, 180, 392, 260, '#0D1018BF', { blurFundo: 22, raio: 24, borda: 2, corBorda: '#D4AF37' }),
          mkTxt('Rótulo', '{precoRotulo}', 728, 230, 344, 24, fnt.b, 400, 13, '#D4AF37', { alinhamento: 'center', espacamento: 3, maiusculas: true }),
          mkTxt('Preço bento', '{preco}', 728, 272, 344, 88, 'Montserrat', 700, 42, '#ffffff', { alinhamento: 'center', autoFit: true })
        ]
      };
    case 'foto':
      return {
        id: uid('sl'),
        nome: 'Foto grande',
        tipo: 'foto',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Foto vitrine nítida', 0, 0, W, H, 1),
          mkRect('Badge vidro flutuante', 48, 434, 460, 166, '#0D1018B3', { blurFundo: 22, raio: 20, borda: 1.5, corBorda: '#D4AF3799' }),
          mkTxt('Nome card', '{nome}', 76, 464, 404, 48, fnt.t, 600, 28, '#ffffff', { autoFit: true }),
          mkTxt('Loc card', '{localizacao}', 76, 518, 404, 24, fnt.b, 400, 14, '#D4AF37'),
          mkTxt('Specs card', '{area} · {quartos} qts', 76, 550, 404, 24, fnt.b, 400, 14, '#ededf3')
        ]
      };
    case 'galeria':
      return {
        id: uid('sl'),
        nome: 'Galeria',
        tipo: 'galeria',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Vitrine gal 1', 44, 56, 336, 444, 2, { raio: 16 }),
          mkFoto('Vitrine gal 2', 408, 56, 336, 444, 3, { raio: 16 }),
          mkFoto('Vitrine gal 3', 772, 56, 336, 444, 4, { raio: 16 }),
          mkRect('Tarja vidro rodapé', 44, 520, 1064, 80, '#0D1018CC', { blurFundo: 16, raio: 16, borda: 1, corBorda: '#ffffff33' }),
          mkTxt('Título galeria', '{nome} · {localizacao}', 72, 544, 1008, 32, fnt.t, 500, 22, '#ffffff', { alinhamento: 'center' })
        ]
      };
    case 'texto':
      return {
        id: uid('sl'),
        nome: 'Descrição',
        tipo: 'texto',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Fundo texto suave', 0, 0, W, H, 2, { brilho: 50 }),
          mkRect('Cartão leitura vidro', 112, 68, 928, 512, '#0D1018CC', { blurFundo: 24, raio: 24, borda: 1.5, corBorda: '#D4AF3766' }),
          mkTxt('Título', 'Detalhes & Conceito', 156, 106, 840, 44, fnt.t, 600, 34, '#D4AF37', { alinhamento: 'center' }),
          mkTxt('Descrição', '{descricao}', 156, 174, 840, 366, fnt.b, 400, 17, '#ffffff', { entrelinha: 1.65, alinhamento: 'center', autoFit: true })
        ]
      };
    case 'contato':
      return {
        id: uid('sl'),
        nome: 'Contato',
        tipo: 'contato',
        fundo: '#0D1018',
        camadas: [
          mkRect('Lado esq vitrine', 0, 0, 564, 648, '#141926', { borda: 0 }),
          mkLinhaV('Divisor vitrine contato', 564, 0, 648, '#D4AF3766', 2),
          ...mkMarca(64, 64, { s: 32, forma: 'circle', fill: 'destaque', nm: 15, wt: 400, c: 'texto', gap: 12 }, pal, fnt),
          mkTxt('Corretor', '{corretor}', 64, 240, 440, 100, fnt.t, 600, 48, '#ffffff', { autoFit: true }),
          mkTxt('CRECI', '{creci}', 64, 346, 440, 24, fnt.b, 400, 14, '#D4AF37'),
          mkTxt('Telefone', '{telefone}', 64, 420, 440, 40, 'Montserrat', 700, 30, '#ffffff'),
          mkTxt('E-mail', '{email}', 64, 470, 440, 28, fnt.b, 400, 16, '#dcdce6'),
          mkQr(732, 164, 256, pal, 16),
          mkTxt('Legenda QR', LEG_QR, 660, 444, 400, 26, fnt.b, 400, 14, '#D4AF37', { alinhamento: 'center' })
        ]
      };
    default:
      return { id: uid('sl'), nome: 'Página em branco', tipo: 'livre', fundo: pal.fundo, camadas: [] };
  }
}

// ============================================================================
// 4. TRAÇO FINO (Degradê Taupe + Slot Dinâmico + 2 Linhas Paralelas)
// ============================================================================
function slideTracoFino(tipo, pal, fnt) {
  switch (tipo) {
    case 'capa':
      return {
        id: uid('sl'),
        nome: 'Capa',
        tipo: 'capa',
        fundo: '#161514',
        camadas: [
          mkFoto('Foto capa full-bleed', 0, 0, W, H, 0),
          mkDeg('Véu taupe superior', 0, 0, W, 220, '#7A6F64E0', '#7A6F6400', 180),
          mkDeg('Véu base escuro', 0, 270, W, 378, '#16151400', '#161514F2', 180),
          mkTxt('Pílula topo', '{negociacao} – {bairro}', 56, 44, 390, 40, fnt.b, 400, 14, '#ffffff', {
            alinhamento: 'center', espacamento: 2, maiusculas: true, fundo: true, corFundo: '#16151459', raioFundo: 999, folga: 10, bordaFundo: 1.5, corBordaFundo: '#ffffff99'
          }),
          mkLogo(1024, 36, 72, 'circle', 36, '#161514cc', '#ffffff', { ocultarSemLogo: true }),
          mkTxt('Título Cormorant', '{nome}', 56, 366, 1040, 82, fnt.t, 400, 62, '#ffffff', { autoFit: true }),
          mkTxt('Localização', '{localizacao}', 56, 452, 1040, 24, fnt.b, 400, 15, '#E5DDD1'),
          mkLinha('Paralela 1', 56, 494, 1040, '#ffffff80', 1.5),
          mkTxt('Preço', '{preco}', 56, 510, 620, 48, fnt.t, 600, 40, '#ffffff', { autoFit: true }),
          mkTxt('Área dir', '{area}', 700, 516, 396, 38, fnt.b, 400, 26, '#E5DDD1', { alinhamento: 'right', autoFit: true }),
          mkLinha('Paralela 2', 56, 574, 1040, '#ffffff80', 1.5),
          mkTxt('4 specs base', '{quartos} Quartos   ·   {suites} Suítes   ·   {vagas} Vagas   ·   {codigo}', 56, 590, 1040, 26, fnt.b, 400, 14, '#E5DDD1')
        ]
      };
    case 'resumo':
      return {
        id: uid('sl'),
        nome: 'Resumo',
        tipo: 'resumo',
        fundo: pal.fundo,
        camadas: [
          mkTxt('Kicker topo', '{tipo} · {localizacao}', 64, 56, 620, 24, fnt.b, 400, 14, pal.destaque, { espacamento: 2, maiusculas: true }),
          mkTxt('Nome', '{nome}', 64, 88, 620, 58, fnt.t, 400, 44, pal.texto, { autoFit: true }),
          mkTxt('Preço', '{preco}', 720, 86, 368, 56, fnt.t, 600, 40, pal.texto, { alinhamento: 'right', autoFit: true }),
          mkLinha('Paralela sup resumo', 64, 198, 1024, pal.secundaria, 1.5),
          mkTxt('Qts', '{quartos} Quartos', 64, 224, 240, 40, fnt.t, 400, 26, pal.texto),
          mkTxt('Sts', '{suites} Suítes', 324, 224, 240, 40, fnt.t, 400, 26, pal.texto, { alinhamento: 'center' }),
          mkTxt('Vg', '{vagas} Vagas', 584, 224, 240, 40, fnt.t, 400, 26, pal.texto, { alinhamento: 'center' }),
          mkTxt('Ar', '{area}', 844, 224, 244, 40, fnt.t, 400, 26, pal.texto, { alinhamento: 'right' }),
          mkLinha('Paralela inf resumo', 64, 284, 1024, pal.secundaria, 1.5),
          mkTxt('Destaques', '{destaques}', 64, 336, 1024, 240, fnt.b, 400, 18, pal.texto, { entrelinha: 1.65, autoFit: true })
        ]
      };
    case 'foto':
      return {
        id: uid('sl'),
        nome: 'Foto grande',
        tipo: 'foto',
        fundo: pal.fundo,
        camadas: [
          mkLinha('Paralela sup foto', 64, 52, 1024, pal.secundaria, 1),
          mkTxt('Nome', '{nome}', 64, 66, 680, 32, fnt.t, 400, 24, pal.texto),
          mkTxt('Bairro', '{localizacao}', 756, 70, 332, 24, fnt.b, 400, 14, pal.secundaria, { alinhamento: 'right' }),
          mkLinha('Paralela inf foto', 64, 110, 1024, pal.secundaria, 1),
          mkFoto('Foto ampla', 64, 134, 1024, 464, 1)
        ]
      };
    case 'galeria':
      return {
        id: uid('sl'),
        nome: 'Galeria',
        tipo: 'galeria',
        fundo: pal.fundo,
        camadas: [
          mkLinha('Paralela sup gal', 64, 88, 1024, pal.secundaria, 1),
          mkFoto('Faixa gal 1', 64, 118, 324, 412, 2),
          mkFoto('Faixa gal 2', 414, 118, 324, 412, 3),
          mkFoto('Faixa gal 3', 764, 118, 324, 412, 4),
          mkLinha('Paralela inf gal', 64, 560, 1024, pal.secundaria, 1)
        ]
      };
    case 'texto':
      return {
        id: uid('sl'),
        nome: 'Descrição',
        tipo: 'texto',
        fundo: pal.fundo,
        camadas: [
          mkLinha('Paralela sup txt', 196, 94, 760, pal.destaque, 1.5),
          mkTxt('Título minimal', '{nome}', 196, 116, 760, 48, fnt.t, 400, 36, pal.texto, { alinhamento: 'center', autoFit: true }),
          mkTxt('Corpo minimal', '{descricao}', 196, 194, 760, 320, fnt.b, 400, 17, pal.texto, { entrelinha: 1.72, alinhamento: 'center', autoFit: true }),
          mkLinha('Paralela inf txt', 196, 548, 760, pal.destaque, 1.5)
        ]
      };
    case 'contato':
      return {
        id: uid('sl'),
        nome: 'Contato',
        tipo: 'contato',
        fundo: pal.fundo,
        camadas: [
          mkLogo(64, 64, 64, 'circle', 32, pal.principal, pal.texto, { ocultarSemLogo: true }),
          mkLinha('Paralela sup cont', 64, 340, 1024, pal.secundaria, 1.5),
          mkTxt('Corretor', '{corretor}', 64, 196, 700, 90, fnt.t, 400, 56, pal.texto, { autoFit: true }),
          mkTxt('CRECI', '{creci}', 64, 292, 700, 24, fnt.b, 400, 14, pal.destaque),
          mkTxt('Telefone', '{telefone}', 64, 372, 420, 40, fnt.t, 600, 32, pal.texto),
          mkTxt('E-mail', '{email}', 64, 422, 420, 26, fnt.b, 400, 16, pal.secundaria),
          mkLinha('Paralela inf cont', 64, 474, 680, pal.secundaria, 1.5),
          mkTxt('Rodapé', '{rodape}', 64, 540, 680, 22, fnt.b, 400, 12, pal.secundaria),
          mkQr(826, 212, 236, pal, 4),
          mkTxt('Legenda QR', LEG_QR, 790, 464, 308, 22, fnt.b, 400, 12, pal.secundaria, { alinhamento: 'center' })
        ]
      };
    default:
      return { id: uid('sl'), nome: 'Página em branco', tipo: 'livre', fundo: pal.fundo, camadas: [] };
  }
}

// ============================================================================
// 5. NOITE DOURADA (#0B2242 + Ouro Metálico + 3 Círculos + Caixa Pin)
// ============================================================================
function slideNoiteDourada(tipo, pal, fnt) {
  switch (tipo) {
    case 'capa':
      return {
        id: uid('sl'),
        nome: 'Capa',
        tipo: 'capa',
        fundo: '#0B2242',
        camadas: [
          mkFoto('Foto capa noite', 0, 0, W, H, 0),
          mkDeg('Degradê azul-noite topo', 0, 0, W, 190, '#0B2242EB', '#0B224200', 180),
          mkDeg('Vinheta azul-noite base', 0, 210, W, 438, '#0B224200', '#0B2242F5', 180),
          mkTxt('Exclusividade', 'EXCLUSIVIDADE', 72, 34, 1008, 24, 'Montserrat', 700, 13, '#E4C472', { alinhamento: 'center', espacamento: 6 }),
          mkLinha('Filete topo dourado', 528, 66, 96, '#E4C472', 2),
          mkTxt('Título Dourado', '{nome}', 72, 262, 1008, 96, fnt.t, 600, 68, '#E4C472', { alinhamento: 'center', autoFit: true }),
          mkIcone('quarto', 378, 376, 48, '#E4C472', { formaFundo: 'circulo', corFundo: '#0B2242E6', bordaFundo: 2, corBordaFundo: '#E4C472', folga: 12 }),
          mkTxt('Qts circ', '{quartos} qts', 332, 432, 140, 22, 'Montserrat', 700, 13, '#F5EFE0', { alinhamento: 'center' }),
          mkIcone('suite', 552, 376, 48, '#E4C472', { formaFundo: 'circulo', corFundo: '#0B2242E6', bordaFundo: 2, corBordaFundo: '#E4C472', folga: 12 }),
          mkTxt('Sts circ', '{suites} suítes', 506, 432, 140, 22, 'Montserrat', 700, 13, '#F5EFE0', { alinhamento: 'center' }),
          mkIcone('area', 726, 376, 48, '#E4C472', { formaFundo: 'circulo', corFundo: '#0B2242E6', bordaFundo: 2, corBordaFundo: '#E4C472', folga: 12 }),
          mkTxt('Area circ', '{area}', 680, 432, 140, 22, 'Montserrat', 700, 13, '#F5EFE0', { alinhamento: 'center' }),
          mkRect('Caixa localização dourada', 286, 472, 580, 46, '#0B2242D9', { raio: 10, borda: 1.5, corBorda: '#E4C472' }),
          mkIcone('local', 306, 483, 24, '#E4C472'),
          mkTxt('Loc dourada', '{localizacao}', 340, 484, 496, 26, 'Montserrat', 700, 16, '#ffffff', { alinhamento: 'center', autoFit: true }),
          mkTxt('Preço branco', '{preco}', 72, 540, 1008, 60, 'Montserrat', 700, 44, '#ffffff', { alinhamento: 'center', autoFit: true })
        ]
      };
    case 'resumo':
      return {
        id: uid('sl'),
        nome: 'Resumo',
        tipo: 'resumo',
        fundo: '#0B2242',
        camadas: [
          mkTxt('Nome', '{nome}', 72, 48, 1008, 56, fnt.t, 600, 42, '#E4C472', { alinhamento: 'center', autoFit: true }),
          mkTxt('Loc', '{tipo} · {localizacao} · {preco}', 72, 112, 1008, 28, 'Montserrat', 700, 16, '#ffffff', { alinhamento: 'center' }),
          mkIcone('area', 194, 198, 64, '#E4C472', { formaFundo: 'circulo', corFundo: '#13305A', bordaFundo: 2, corBordaFundo: '#E4C472', folga: 16 }),
          mkTxt('M1', '{area}', 126, 276, 200, 32, 'Montserrat', 700, 20, '#ffffff', { alinhamento: 'center' }),
          mkIcone('quarto', 430, 198, 64, '#E4C472', { formaFundo: 'circulo', corFundo: '#13305A', bordaFundo: 2, corBordaFundo: '#E4C472', folga: 16 }),
          mkTxt('M2', '{quartos} quartos', 362, 276, 200, 32, 'Montserrat', 700, 20, '#ffffff', { alinhamento: 'center' }),
          mkIcone('suite', 666, 198, 64, '#E4C472', { formaFundo: 'circulo', corFundo: '#13305A', bordaFundo: 2, corBordaFundo: '#E4C472', folga: 16 }),
          mkTxt('M3', '{suites} suítes', 598, 276, 200, 32, 'Montserrat', 700, 20, '#ffffff', { alinhamento: 'center' }),
          mkIcone('vaga', 902, 198, 64, '#E4C472', { formaFundo: 'circulo', corFundo: '#13305A', bordaFundo: 2, corBordaFundo: '#E4C472', folga: 16 }),
          mkTxt('M4', '{vagas} vagas', 834, 276, 200, 32, 'Montserrat', 700, 20, '#ffffff', { alinhamento: 'center' }),
          mkLinha('Divisor noite', 176, 344, 800, '#E4C47280', 1),
          mkTxt('Destaques', '{destaques}', 126, 382, 900, 210, 'Montserrat', 300, 18, '#F5EFE0', { alinhamento: 'center', entrelinha: 1.65, autoFit: true })
        ]
      };
    case 'foto':
      return {
        id: uid('sl'),
        nome: 'Foto grande',
        tipo: 'foto',
        fundo: '#0B2242',
        camadas: [
          mkFoto('Foto noite', 0, 0, W, H, 1),
          mkDeg('Vinheta foto', 0, 380, W, 268, '#0B224200', '#0B2242EB', 180),
          mkLinha('Ouro barra', 72, 514, 100, '#E4C472', 3),
          mkTxt('Título ouro', '{nome}', 72, 532, 680, 44, fnt.t, 600, 34, '#E4C472'),
          mkTxt('Loc', '{localizacao}', 72, 582, 680, 24, 'Montserrat', 400, 14, '#ffffff')
        ]
      };
    case 'galeria':
      return {
        id: uid('sl'),
        nome: 'Galeria',
        tipo: 'galeria',
        fundo: '#0B2242',
        camadas: [
          mkFoto('Noite 1', 72, 56, 492, 256, 2, { borda: 1.5, corBorda: '#E4C472' }),
          mkFoto('Noite 2', 588, 56, 492, 256, 3, { borda: 1.5, corBorda: '#E4C472' }),
          mkFoto('Noite 3', 72, 336, 492, 256, 4, { borda: 1.5, corBorda: '#E4C472' }),
          mkFoto('Noite 4', 588, 336, 492, 256, 5, { borda: 1.5, corBorda: '#E4C472' })
        ]
      };
    case 'texto':
      return {
        id: uid('sl'),
        nome: 'Descrição',
        tipo: 'texto',
        fundo: '#0B2242',
        camadas: [
          mkTxt('Kicker noite', 'CONCEITO DE MORAR', 126, 56, 900, 24, 'Montserrat', 700, 13, '#E4C472', { alinhamento: 'center', espacamento: 5 }),
          mkTxt('Título', '{nome}', 126, 92, 900, 56, fnt.t, 600, 42, '#ffffff', { alinhamento: 'center', autoFit: true }),
          mkLinha('Filete ouro', 506, 168, 140, '#E4C472', 2),
          mkTxt('Corpo noite', '{descricao}', 156, 204, 840, 380, 'Montserrat', 300, 17, '#F5EFE0', { entrelinha: 1.72, alinhamento: 'center', autoFit: true })
        ]
      };
    case 'contato':
      return {
        id: uid('sl'),
        nome: 'Contato',
        tipo: 'contato',
        fundo: '#0B2242',
        camadas: [
          mkRect('Moldura ouro card', 56, 56, 1040, 536, '#13305A', { raio: 18, borda: 1.5, corBorda: '#E4C472' }),
          ...mkMarca(104, 96, { s: 32, forma: 'circle', fill: 'destaque', nm: 16, wt: 700, c: 'texto', gap: 12 }, pal, fnt),
          mkTxt('Corretor', '{corretor}', 104, 234, 580, 96, fnt.t, 600, 52, '#E4C472', { autoFit: true }),
          mkTxt('CRECI', '{creci}', 104, 336, 580, 24, 'Montserrat', 400, 14, '#9DB0CC'),
          mkTxt('Telefone', '{telefone}', 104, 396, 580, 42, 'Montserrat', 700, 32, '#ffffff'),
          mkTxt('E-mail', '{email}', 104, 446, 580, 26, 'Montserrat', 400, 16, '#F5EFE0'),
          mkQr(756, 176, 248, pal, 8),
          mkTxt('Legenda QR', LEG_QR, 720, 442, 320, 24, 'Montserrat', 400, 13, '#E4C472', { alinhamento: 'center' })
        ]
      };
    default:
      return { id: uid('sl'), nome: 'Página em branco', tipo: 'livre', fundo: pal.fundo, camadas: [] };
  }
}

// ============================================================================
// 6. ESSÊNCIA MODERNA (alias E — Véu Claro + Logo Dinâmica + 3 Cards Chanfrados)
// ============================================================================
function slideEssenciaModerna(tipo, pal, fnt) {
  switch (tipo) {
    case 'capa':
      return {
        id: uid('sl'),
        nome: 'Capa',
        tipo: 'capa',
        fundo: '#231B14',
        camadas: [
          mkFoto('Foto essência full', 0, 0, W, H, 0),
          mkDeg('Véu topo claro', 0, 0, W, 240, '#F3EFE9EB', '#F3EFE900', 180),
          mkDeg('Degradê base terroso', 0, 330, W, 318, '#231B1400', '#231B14EB', 180),
          mkLogo(544, 24, 64, 'square', 14, '#3D2F24', '#ffffff', { ocultarSemLogo: true }),
          mkTxt('Headline peso 1', '{tipo} · {bairro}', 72, 96, 1008, 28, fnt.t, 300, 18, '#594433', { alinhamento: 'center', espacamento: 3, maiusculas: true }),
          mkTxt('Headline peso 2', '{nome}', 72, 128, 1008, 70, fnt.t, 700, 50, '#2C241D', { alinhamento: 'center', autoFit: true }),
          mkPoly('Card chanfrado 1', 120, 422, 286, 108, [{ x: 24, y: 0 }, { x: 286, y: 0 }, { x: 262, y: 108 }, { x: 0, y: 108 }], '#3D2F24D4', { borda: 1.5, corBorda: '#ffffffa6' }),
          mkIcone('quarto', 245, 438, 36, '#ffffff'),
          mkTxt('Card 1 txt', '{quartos} Quartos', 148, 482, 230, 32, fnt.t, 700, 19, '#ffffff', { alinhamento: 'center' }),
          mkPoly('Card chanfrado 2', 433, 422, 286, 108, [{ x: 24, y: 0 }, { x: 286, y: 0 }, { x: 262, y: 108 }, { x: 0, y: 108 }], '#3D2F24D4', { borda: 1.5, corBorda: '#ffffffa6' }),
          mkIcone('area', 558, 438, 36, '#ffffff'),
          mkTxt('Card 2 txt', '{area}', 461, 482, 230, 32, fnt.t, 700, 19, '#ffffff', { alinhamento: 'center' }),
          mkPoly('Card chanfrado 3', 746, 422, 286, 108, [{ x: 24, y: 0 }, { x: 286, y: 0 }, { x: 262, y: 108 }, { x: 0, y: 108 }], '#3D2F24D4', { borda: 1.5, corBorda: '#ffffffa6' }),
          mkIcone('vaga', 871, 438, 36, '#ffffff'),
          mkTxt('Card 3 txt', '{vagas} Vagas', 774, 482, 230, 32, fnt.t, 700, 19, '#ffffff', { alinhamento: 'center' }),
          mkTxt('Rodapé pílula', '{preco} · {corretor}', 286, 554, 580, 48, fnt.t, 700, 22, '#ffffff', {
            alinhamento: 'center', autoFit: true, fundo: true, corFundo: '#3D2F24EB', raioFundo: 999, folga: 12, bordaFundo: 1.5, corBordaFundo: '#ffffff66'
          })
        ]
      };
    case 'resumo':
      return {
        id: uid('sl'),
        nome: 'Resumo',
        tipo: 'resumo',
        fundo: pal.fundo,
        camadas: [
          mkTxt('Nome', '{nome}', 56, 48, 700, 48, fnt.t, 700, 34, pal.texto, { autoFit: true }),
          mkTxt('Preço', '{preco}', 780, 48, 316, 48, fnt.t, 700, 34, pal.destaque, { alinhamento: 'right', autoFit: true }),
          mkPoly('Metric 1', 56, 126, 244, 110, [{ x: 20, y: 0 }, { x: 244, y: 0 }, { x: 224, y: 110 }, { x: 0, y: 110 }], pal.principal),
          mkTxt('M1 val', '{area}', 76, 152, 204, 40, fnt.t, 700, 28, pal['sobre-principal'], { alinhamento: 'center', autoFit: true }),
          mkTxt('M1 lbl', 'Área', 76, 198, 204, 20, fnt.b, 400, 13, pal.destaque, { alinhamento: 'center' }),
          mkPoly('Metric 2', 322, 126, 244, 110, [{ x: 20, y: 0 }, { x: 244, y: 0 }, { x: 224, y: 110 }, { x: 0, y: 110 }], pal.principal),
          mkTxt('M2 val', '{quartos}', 342, 152, 204, 40, fnt.t, 700, 28, pal['sobre-principal'], { alinhamento: 'center' }),
          mkTxt('M2 lbl', 'Quartos', 342, 198, 204, 20, fnt.b, 400, 13, pal.destaque, { alinhamento: 'center' }),
          mkPoly('Metric 3', 588, 126, 244, 110, [{ x: 20, y: 0 }, { x: 244, y: 0 }, { x: 224, y: 110 }, { x: 0, y: 110 }], pal.principal),
          mkTxt('M3 val', '{suites}', 608, 152, 204, 40, fnt.t, 700, 28, pal['sobre-principal'], { alinhamento: 'center' }),
          mkTxt('M3 lbl', 'Suítes', 608, 198, 204, 20, fnt.b, 400, 13, pal.destaque, { alinhamento: 'center' }),
          mkPoly('Metric 4', 854, 126, 242, 110, [{ x: 20, y: 0 }, { x: 242, y: 0 }, { x: 222, y: 110 }, { x: 0, y: 110 }], pal.principal),
          mkTxt('M4 val', '{vagas}', 874, 152, 202, 40, fnt.t, 700, 28, pal['sobre-principal'], { alinhamento: 'center' }),
          mkTxt('M4 lbl', 'Vagas', 874, 198, 202, 20, fnt.b, 400, 13, pal.destaque, { alinhamento: 'center' }),
          mkRect('Bloco destaques', 56, 272, 640, 320, pal.principal, { raio: 24 }),
          mkTxt('Destaques', '{destaques}', 88, 308, 576, 248, fnt.b, 400, 17, pal['sobre-principal'], { entrelinha: 1.65, autoFit: true }),
          mkFoto('Preview foto resumo', 724, 272, 372, 320, 1, { raio: 24 })
        ]
      };
    case 'foto':
      return {
        id: uid('sl'),
        nome: 'Foto grande',
        tipo: 'foto',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Foto destaque essência', 48, 48, 1056, 552, 1, { raio: 26 }),
          mkPoly('Tag chanfrada legenda', 72, 476, 520, 96, [{ x: 22, y: 0 }, { x: 520, y: 0 }, { x: 498, y: 96 }, { x: 0, y: 96 }], '#3D2F24E6', { borda: 1.5, corBorda: '#D9AE73' }),
          mkTxt('Nome tag', '{nome}', 104, 496, 444, 34, fnt.t, 700, 24, '#ffffff', { autoFit: true }),
          mkTxt('Loc tag', '{localizacao}', 104, 534, 444, 22, fnt.b, 400, 14, '#D9AE73')
        ]
      };
    case 'galeria':
      return {
        id: uid('sl'),
        nome: 'Galeria',
        tipo: 'galeria',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Galeria esq hero', 48, 48, 592, 552, 2, { raio: 24 }),
          mkFoto('Galeria dir 1', 664, 48, 440, 264, 3, { raio: 24 }),
          mkFoto('Galeria dir 2', 664, 336, 440, 264, 4, { raio: 24 })
        ]
      };
    case 'texto':
      return {
        id: uid('sl'),
        nome: 'Descrição',
        tipo: 'texto',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Foto vertical lateral', 48, 48, 340, 552, 2, { raio: 24 }),
          mkTxt('Título seção', 'Descrição', 428, 60, 660, 46, fnt.t, 700, 36, pal.destaque),
          mkRect('Barra terrosa', 428, 118, 64, 4, pal.destaque, { raio: 2 }),
          mkTxt('Corpo descrição', '{descricao}', 428, 148, 660, 444, fnt.b, 400, 17, pal.texto, { entrelinha: 1.65, autoFit: true })
        ]
      };
    case 'contato':
      return {
        id: uid('sl'),
        nome: 'Contato',
        tipo: 'contato',
        fundo: pal.fundo,
        camadas: [
          mkRect('Cartão essência', 48, 48, 540, 552, pal.principal, { raio: 28 }),
          mkLogo(84, 84, 52, 'square', 12, pal.destaque, '#ffffff', { ocultarSemLogo: true }),
          mkTxt('Corretor', '{corretor}', 84, 286, 468, 108, fnt.t, 700, 44, pal['sobre-principal'], { autoFit: true }),
          mkTxt('CRECI', '{creci}', 84, 398, 468, 24, fnt.b, 400, 15, pal.destaque),
          mkTxt('Telefone', '{telefone}', 84, 446, 468, 38, fnt.t, 700, 28, pal['sobre-principal']),
          mkTxt('E-mail', '{email}', 84, 494, 468, 28, fnt.b, 400, 18, pal['sobre-principal']),
          mkQr(722, 146, 256, pal, 16),
          mkTxt('Legenda QR', LEG_QR, 622, 424, 456, 32, fnt.t, 700, 20, pal.texto, { alinhamento: 'center' })
        ]
      };
    default:
      return { id: uid('sl'), nome: 'Página em branco', tipo: 'livre', fundo: pal.fundo, camadas: [] };
  }
}

// ============================================================================
// 7. VISÃO GLASS (Vidro Fosco + 4 Linhas Full-Width + Switches #3AA832)
// ============================================================================
function slideVisaoGlass(tipo, pal, fnt) {
  switch (tipo) {
    case 'capa':
      return {
        id: uid('sl'),
        nome: 'Capa',
        tipo: 'capa',
        fundo: '#0C101A',
        camadas: [
          mkFoto('Foto capa glass', 0, 0, W, H, 0),
          mkDeg('Véu escuro suave', 0, 0, W, H, '#0C101A70', '#0C101AEB', 180),
          mkTxt('Marca topo', '{marca}', 56, 38, 320, 28, fnt.t, 700, 16, '#E4E7F2', { espacamento: 3, maiusculas: true }),
          mkTxt('Bairro topo', '{bairro}', 56, 70, 520, 24, fnt.b, 400, 15, '#D0D5E6'),
          mkTxt('Preço direita', '{preco}', 660, 36, 436, 48, 'Montserrat', 700, 34, '#ffffff', { alinhamento: 'right', autoFit: true }),
          mkRect('Cartão vidro central', 56, 134, 1040, 424, '#1419268C', { blurFundo: 22, raio: 24, borda: 1.5, corBorda: '#ffffff52' }),
          mkTxt('Nome no cartão', '{nome}', 96, 162, 960, 58, fnt.t, 700, 42, '#ffffff', { autoFit: true }),
          mkLinha('Sep row 1', 96, 242, 960, '#ffffff33', 1),
          mkTxt('Row 1 lbl', '{quartos} Quartos', 96, 256, 860, 30, fnt.b, 400, 20, '#ffffff'),
          mkIcone('switch-on', 1010, 254, 34, '#3AA832'),
          mkLinha('Sep row 2', 96, 306, 960, '#ffffff33', 1),
          mkTxt('Row 2 lbl', '{suites} Suítes', 96, 320, 860, 30, fnt.b, 400, 20, '#ffffff'),
          mkIcone('switch-on', 1010, 318, 34, '#3AA832'),
          mkLinha('Sep row 3', 96, 370, 960, '#ffffff33', 1),
          mkTxt('Row 3 lbl', '{area}', 96, 384, 860, 30, fnt.b, 400, 20, '#ffffff'),
          mkIcone('switch-on', 1010, 382, 34, '#3AA832'),
          mkLinha('Sep row 4', 96, 434, 960, '#ffffff33', 1),
          mkTxt('Row 4 lbl', '{vagas} Vagas', 96, 448, 860, 30, fnt.b, 400, 20, '#ffffff'),
          mkIcone('switch-on', 1010, 446, 34, '#3AA832'),
          mkTxt('Rodapé glass', '{localizacao} · {corretor} · {telefone}', 56, 584, 1040, 26, fnt.b, 400, 14, '#D0D5E6', { alinhamento: 'center' })
        ]
      };
    case 'resumo':
      return {
        id: uid('sl'),
        nome: 'Resumo',
        tipo: 'resumo',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Fundo bento glass', 0, 0, W, H, 1, { brilho: 50 }),
          mkRect('Pílula specs topo', 56, 44, 1040, 76, '#141926A6', { blurFundo: 20, raio: 999, borda: 1.5, corBorda: '#3AA83299' }),
          mkTxt('Specs topo', '{area}   ·   {quartos} qts   ·   {suites} suítes   ·   {vagas} vagas', 96, 68, 960, 28, fnt.t, 700, 20, '#ffffff', { alinhamento: 'center', autoFit: true }),
          mkRect('Bento esq', 56, 152, 496, 448, '#14192699', { blurFundo: 22, raio: 24, borda: 1.5, corBorda: '#ffffff40' }),
          mkTxt('Nome bento', '{nome}', 92, 192, 424, 62, fnt.t, 700, 34, '#ffffff', { autoFit: true }),
          mkTxt('Preço bento', '{preco}', 92, 282, 424, 56, 'Montserrat', 700, 40, '#3AA832', { autoFit: true }),
          mkTxt('Loc bento', '{localizacao}', 92, 366, 424, 28, fnt.b, 400, 15, '#D0D5E6'),
          mkRect('Bento dir', 580, 152, 516, 448, '#14192699', { blurFundo: 22, raio: 24, borda: 1.5, corBorda: '#ffffff40' }),
          mkTxt('Checklist lbl', 'DIFERENCIAIS ATIVOS', 616, 192, 444, 24, fnt.t, 700, 14, '#3AA832', { espacamento: 2 }),
          mkTxt('Destaques', '{destaques}', 616, 236, 444, 320, fnt.b, 400, 18, '#ffffff', { entrelinha: 1.65, autoFit: true })
        ]
      };
    case 'foto':
      return {
        id: uid('sl'),
        nome: 'Foto grande',
        tipo: 'foto',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Foto card glass', 44, 44, 1064, 560, 1, { raio: 24 }),
          mkRect('Badge vidro topo', 76, 76, 420, 68, '#141926BF', { blurFundo: 20, raio: 999, borda: 1, corBorda: '#3AA832' }),
          mkIcone('switch-on', 100, 94, 30, '#3AA832'),
          mkTxt('Badge txt', '{nome}', 144, 96, 330, 28, fnt.t, 700, 18, '#ffffff', { autoFit: true })
        ]
      };
    case 'galeria':
      return {
        id: uid('sl'),
        nome: 'Galeria',
        tipo: 'galeria',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Bento foto 1', 48, 48, 340, 552, 2, { raio: 20 }),
          mkFoto('Bento foto 2', 408, 48, 340, 552, 3, { raio: 20 }),
          mkFoto('Bento foto 3', 768, 48, 336, 552, 4, { raio: 20 })
        ]
      };
    case 'texto':
      return {
        id: uid('sl'),
        nome: 'Descrição',
        tipo: 'texto',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Fundo texto glass', 0, 0, W, H, 2, { brilho: 45 }),
          mkRect('Cartão glass texto', 84, 56, 984, 536, '#141926BF', { blurFundo: 22, raio: 26, borda: 1.5, corBorda: '#ffffff44' }),
          mkTxt('Título', '{nome} — Descrição', 124, 94, 904, 44, fnt.t, 700, 32, '#3AA832'),
          mkTxt('Descrição', '{descricao}', 124, 162, 904, 390, fnt.b, 400, 17, '#ffffff', { entrelinha: 1.68, autoFit: true })
        ]
      };
    case 'contato':
      return {
        id: uid('sl'),
        nome: 'Contato',
        tipo: 'contato',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Fundo contato glass', 0, 0, W, H, 0, { brilho: 40 }),
          mkRect('Glass contato', 96, 84, 960, 480, '#141926BF', { blurFundo: 24, raio: 28, borda: 1.5, corBorda: '#ffffff52' }),
          mkTxt('Corretor', '{corretor}', 144, 152, 520, 88, fnt.t, 700, 46, '#ffffff', { autoFit: true }),
          mkTxt('CRECI', '{creci}', 144, 246, 520, 24, fnt.b, 400, 14, '#3AA832'),
          mkTxt('Telefone', '{telefone}', 144, 324, 520, 44, 'Montserrat', 700, 32, '#ffffff'),
          mkTxt('E-mail', '{email}', 144, 376, 520, 28, fnt.b, 400, 16, '#D0D5E6'),
          mkQr(744, 172, 238, pal, 16),
          mkTxt('Legenda QR', LEG_QR, 704, 428, 318, 22, fnt.b, 400, 13, '#D0D5E6', { alinhamento: 'center' })
        ]
      };
    default:
      return { id: uid('sl'), nome: 'Página em branco', tipo: 'livre', fundo: pal.fundo, camadas: [] };
  }
}

// ============================================================================
// 8. GALERIA PRIVÊ (alias F — Degradê Esquerdo Suave + Bodoni Moda + Pinyon Script)
// ============================================================================
function slideGaleriaPrive(tipo, pal, fnt) {
  switch (tipo) {
    case 'capa':
      return {
        id: uid('sl'),
        nome: 'Capa',
        tipo: 'capa',
        fundo: '#0E1015',
        camadas: [
          mkFoto('Foto capa full-bleed', 0, 0, W, H, 0),
          mkDeg('Degradê lateral esquerdo suave', 0, 0, 820, H, '#0E1015EB', '#0E101500', 90),
          mkTxt('Categoria dourada', '{tipo} · {localizacao}', 64, 56, 540, 24, 'Montserrat', 700, 13, '#D4AF37', { espacamento: 4, maiusculas: true }),
          mkTxt('Título Bodoni', '{nome}', 64, 102, 540, 134, fnt.t, 500, 56, '#ffffff', { entrelinha: 1.02, autoFit: true }),
          mkLinha('Traço dourado', 64, 256, 96, '#D4AF37', 2),
          mkTxt('Specs verticais', '{area}\n{quartos} Quartos\n{suites} Suítes\n{vagas} Vagas', 64, 286, 540, 146, 'Montserrat', 300, 20, '#DCDCE6', { entrelinha: 1.62 }),
          mkTxt('Preço privê', '{preco}', 64, 502, 500, 56, 'Montserrat', 700, 40, '#D4AF37', { autoFit: true }),
          mkTxt('Assinatura corretor', '{corretor}', 640, 540, 448, 56, 'Pinyon Script', 400, 44, '#ffffff', { alinhamento: 'right', sombra: 10, autoFit: true })
        ]
      };
    case 'resumo':
      return {
        id: uid('sl'),
        nome: 'Resumo',
        tipo: 'resumo',
        fundo: pal.fundo,
        camadas: [
          ...mkMarca(466, 48, { s: 24, forma: 'rect', r: 0, fill: 'principal', nm: 12, wt: 400, c: 'texto', gap: 12 }, pal, fnt, 220),
          mkTxt('Tipo', '{tipo} · {negociacao}', 72, 106, 1008, 20, fnt.b, 400, 12, pal.texto, { alinhamento: 'center', opacidade: 0.62 }),
          mkTxt('Nome', '{nome}', 72, 132, 1008, 44, fnt.t, 500, 32, pal.texto, { alinhamento: 'center', autoFit: true }),
          mkTxt('Localização', '{localizacao}', 72, 180, 1008, 22, fnt.b, 400, 14, pal.texto, { alinhamento: 'center', opacidade: 0.62 }),
          mkTxt('Rótulo preço', '{precoRotulo}', 72, 228, 1008, 20, fnt.b, 400, 12, pal.destaque, { alinhamento: 'center' }),
          mkTxt('Preço', '{preco}', 72, 252, 1008, 80, fnt.t, 500, 62, pal.texto, { alinhamento: 'center', autoFit: true }),
          mkLinha('Linha sup', 72, 356, 1008, pal.secundaria, 1),
          mkTxt('Área val', '{area}', 80, 376, 220, 34, fnt.t, 500, 28, pal.texto, { alinhamento: 'center', autoFit: true }),
          mkTxt('Área lbl', 'Área', 80, 416, 220, 18, fnt.b, 400, 12, pal.texto, { alinhamento: 'center', opacidade: 0.62 }),
          mkRect('Sep 1', 316, 380, 1, 48, pal.secundaria),
          mkTxt('Quartos val', '{quartos}', 332, 376, 220, 34, fnt.t, 500, 28, pal.texto, { alinhamento: 'center', autoFit: true }),
          mkTxt('Quartos lbl', 'Quartos', 332, 416, 220, 18, fnt.b, 400, 12, pal.texto, { alinhamento: 'center', opacidade: 0.62 }),
          mkRect('Sep 2', 568, 380, 1, 48, pal.secundaria),
          mkTxt('Suítes val', '{suites}', 584, 376, 220, 34, fnt.t, 500, 28, pal.texto, { alinhamento: 'center', autoFit: true }),
          mkTxt('Suítes lbl', 'Suítes', 584, 416, 220, 18, fnt.b, 400, 12, pal.texto, { alinhamento: 'center', opacidade: 0.62 }),
          mkRect('Sep 3', 820, 380, 1, 48, pal.secundaria),
          mkTxt('Vagas val', '{vagas}', 836, 376, 220, 34, fnt.t, 500, 28, pal.texto, { alinhamento: 'center', autoFit: true }),
          mkTxt('Vagas lbl', 'Vagas', 836, 416, 220, 18, fnt.b, 400, 12, pal.texto, { alinhamento: 'center', opacidade: 0.62 }),
          mkLinha('Linha inf', 72, 456, 1008, pal.secundaria, 1),
          mkTxt('Destaques título', 'Destaques', 72, 480, 1008, 34, fnt.s, 400, 28, pal.destaque, { alinhamento: 'center' }),
          mkTxt('Destaques', '{destaques}', 256, 518, 640, 88, fnt.b, 400, 15, pal.texto, { alinhamento: 'center', entrelinha: 1.55, autoFit: true })
        ]
      };
    case 'foto':
      return {
        id: uid('sl'),
        nome: 'Foto grande',
        tipo: 'foto',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Foto passe-partout', 96, 56, 960, 444, 1),
          mkTxt('Nome', '{nome}', 96, 520, 620, 36, fnt.t, 500, 28, pal.texto),
          mkTxt('Localização', '{localizacao}', 96, 560, 620, 22, fnt.b, 400, 13, pal.secundaria),
          mkTxt('Assinatura', '{corretor}', 720, 530, 336, 48, fnt.s, 400, 36, pal.destaque, { alinhamento: 'right', autoFit: true })
        ]
      };
    case 'galeria':
      return {
        id: uid('sl'),
        nome: 'Galeria',
        tipo: 'galeria',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Galeria 1', 72, 72, 384, 244, 2),
          mkFoto('Galeria 2', 72, 332, 384, 244, 3),
          mkFoto('Galeria 3', 480, 72, 600, 504, 4)
        ]
      };
    case 'texto':
      return {
        id: uid('sl'),
        nome: 'Descrição',
        tipo: 'texto',
        fundo: pal.fundo,
        camadas: [
          mkTxt('Título seção', 'Descrição', 72, 72, 380, 68, fnt.s, 400, 52, pal.texto),
          mkRect('Divisor vertical', 464, 72, 1, 504, pal.secundaria, { opacidade: 0.5 }),
          mkTxt('Nome rodapé', '{nome}', 72, 534, 360, 24, fnt.t, 500, 14, pal.texto),
          mkTxt('Localização rodapé', '{localizacao}', 72, 558, 360, 20, fnt.t, 400, 12, pal.texto, { opacidade: 0.62 }),
          mkTxt('Descrição', '{descricao}', 528, 72, 540, 504, fnt.b, 400, 15, pal.texto, { entrelinha: 1.75, autoFit: true })
        ]
      };
    case 'contato':
      return {
        id: uid('sl'),
        nome: 'Contato',
        tipo: 'contato',
        fundo: pal.fundo,
        camadas: [
          mkRect('Painel esquerdo', 0, 0, 420, 648, pal.principal),
          ...mkMarca(72, 72, { s: 24, forma: 'rect', r: 0, fill: 'destaque', nm: 12, wt: 400, c: 'sobre-principal', gap: 12 }, pal, fnt),
          mkQr(98, 190, 224, pal, 0),
          mkTxt('Legenda QR', LEG_QR, 36, 434, 348, 24, fnt.b, 400, 12, pal['sobre-principal'], { alinhamento: 'center' }),
          mkTxt('Corretor', '{corretor}', 492, 190, 588, 114, fnt.s, 400, 68, pal.texto, { autoFit: true }),
          mkLinha('Hairline', 492, 326, 280, pal.secundaria, 1),
          mkTxt('CRECI', '{creci}', 492, 348, 588, 22, fnt.b, 400, 12, pal.texto, { opacidade: 0.62 }),
          mkTxt('Telefone', '{telefone}', 492, 388, 588, 42, fnt.t, 500, 32, pal.texto),
          mkTxt('E-mail', '{email}', 492, 444, 588, 26, fnt.b, 400, 15, pal.texto, { autoFit: true }),
          mkTxt('Rodapé', '{rodape}', 492, 576, 588, 20, fnt.b, 400, 11, pal.texto, { opacidade: 0.55 })
        ]
      };
    default:
      return { id: uid('sl'), nome: 'Página em branco', tipo: 'livre', fundo: pal.fundo, camadas: [] };
  }
}

// ============================================================================
// 9. MANCHETE NOBRE (Selo Circular Branco Sup-Esq + "À VENDA" Centralizado W/2)
// ============================================================================
function slideMancheteNobre(tipo, pal, fnt) {
  switch (tipo) {
    case 'capa':
      return {
        id: uid('sl'),
        nome: 'Capa',
        tipo: 'capa',
        fundo: '#12131A',
        camadas: [
          mkFoto('Foto manchete full', 0, 0, W, H, 0),
          mkDeg('Véu topo manchete', 0, 0, W, 170, '#12131AB3', '#12131A00', 180),
          mkDeg('Véu base manchete', 0, 260, W, 388, '#12131A00', '#12131AF2', 180),
          mkCirc('Selo branco', 48, 44, 102, 102, '#ffffff'),
          mkTxt('Negociação selo', '{negociacao}', 54, 82, 90, 28, fnt.b, 700, 14, '#12131A', { alinhamento: 'center', espacamento: 1, maiusculas: true, autoFit: true }),
          mkTxt('Linha loc preco', '{bairro}, {cidade} | {preco}', 72, 344, 1008, 28, fnt.b, 700, 18, '#F5EFE0', { alinhamento: 'center', espacamento: 2, maiusculas: true }),
          mkTxt('Manchete À VENDA', 'À VENDA', 72, 382, 1008, 108, fnt.t, 600, 96, '#ffffff', { alinhamento: 'center', entrelinha: 0.96, autoFit: true }),
          mkTxt('Nome subtítulo', '{nome}', 72, 498, 1008, 42, fnt.s, 600, 32, '#E8D49C', { alinhamento: 'center', italico: true, autoFit: true }),
          mkLinha('Divisor nobre', 316, 556, 520, '#ffffff66', 1.5),
          mkTxt('Rodapé sutil specs', '{area} · {quartos} quartos · {suites} suítes · {vagas} vagas', 72, 576, 1008, 26, fnt.b, 400, 15, '#DCDCE6', { alinhamento: 'center' })
        ]
      };
    case 'resumo':
      return {
        id: uid('sl'),
        nome: 'Resumo',
        tipo: 'resumo',
        fundo: pal.fundo,
        camadas: [
          mkTxt('Manchete resumo', '{nome}', 72, 48, 1008, 60, fnt.t, 600, 48, pal.texto, { alinhamento: 'center', autoFit: true }),
          mkTxt('Subhead resumo', '{bairro}, {cidade} | {preco}', 72, 114, 1008, 26, fnt.b, 700, 16, pal.destaque, { alinhamento: 'center' }),
          mkLinha('Regra dupla 1', 72, 158, 1008, pal.texto, 2),
          mkLinha('Regra dupla 2', 72, 164, 1008, pal.texto, 1),
          mkTxt('Col esq resumo', 'Área privativa: {area}\nQuartos: {quartos}\nSuítes: {suites}\nVagas: {vagas}', 96, 208, 440, 260, fnt.t, 400, 24, pal.texto, { entrelinha: 1.8 }),
          mkLinhaV('Col div resumo', 576, 198, 360, pal.secundaria, 1),
          mkTxt('Col dir destaques', '{destaques}', 616, 208, 440, 340, fnt.b, 400, 18, pal.texto, { entrelinha: 1.68, autoFit: true })
        ]
      };
    case 'foto':
      return {
        id: uid('sl'),
        nome: 'Foto grande',
        tipo: 'foto',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Foto nobre', 72, 44, 1008, 466, 1),
          mkCirc('Selo foto', 96, 68, 72, 72, '#ffffff'),
          mkTxt('Codigo selo', '{codigo}', 100, 92, 64, 24, fnt.b, 700, 13, '#12131A', { alinhamento: 'center' }),
          mkTxt('Legenda central', '{nome} · {localizacao}', 72, 534, 1008, 44, fnt.t, 600, 28, pal.texto, { alinhamento: 'center' })
        ]
      };
    case 'galeria':
      return {
        id: uid('sl'),
        nome: 'Galeria',
        tipo: 'galeria',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Quadro 01', 64, 72, 324, 460, 2),
          mkCirc('Badge 01', 84, 92, 42, 42, '#ffffff'),
          mkTxt('Num 01', '01', 84, 102, 42, 22, fnt.b, 700, 13, '#12131A', { alinhamento: 'center' }),
          mkFoto('Quadro 02', 414, 72, 324, 460, 3),
          mkCirc('Badge 02', 434, 92, 42, 42, '#ffffff'),
          mkTxt('Num 02', '02', 434, 102, 42, 22, fnt.b, 700, 13, '#12131A', { alinhamento: 'center' }),
          mkFoto('Quadro 03', 764, 72, 324, 460, 4),
          mkCirc('Badge 03', 784, 92, 42, 42, '#ffffff'),
          mkTxt('Num 03', '03', 784, 102, 42, 22, fnt.b, 700, 13, '#12131A', { alinhamento: 'center' })
        ]
      };
    case 'texto':
      return {
        id: uid('sl'),
        nome: 'Descrição',
        tipo: 'texto',
        fundo: pal.fundo,
        camadas: [
          mkTxt('Headline txt', 'CONCEITO & DETALHES', 72, 56, 1008, 52, fnt.t, 600, 44, pal.texto, { alinhamento: 'center' }),
          mkLinha('Filete central', 496, 126, 160, pal.destaque, 2),
          mkTxt('Corpo manchete', '{descricao}', 176, 168, 800, 404, fnt.b, 400, 18, pal.texto, { entrelinha: 1.72, alinhamento: 'center', autoFit: true })
        ]
      };
    case 'contato':
      return {
        id: uid('sl'),
        nome: 'Contato',
        tipo: 'contato',
        fundo: pal.fundo,
        camadas: [
          mkCirc('Selo branco cont', 536, 48, 80, 80, '#ffffff'),
          mkTxt('Marca selo', '{negociacao}', 542, 78, 68, 22, fnt.b, 700, 11, '#12131A', { alinhamento: 'center' }),
          mkTxt('Corretor', '{corretor}', 72, 152, 1008, 68, fnt.t, 600, 52, pal.texto, { alinhamento: 'center', autoFit: true }),
          mkTxt('CRECI', '{creci}', 72, 224, 1008, 24, fnt.b, 400, 14, pal.destaque, { alinhamento: 'center' }),
          mkTxt('Contato info', '{telefone}   ·   {email}', 72, 268, 1008, 36, fnt.b, 700, 22, pal.texto, { alinhamento: 'center' }),
          mkQr(486, 336, 180, pal, 8),
          mkTxt('Legenda QR', LEG_QR, 72, 536, 1008, 24, fnt.b, 400, 13, pal.secundaria, { alinhamento: 'center' })
        ]
      };
    default:
      return { id: uid('sl'), nome: 'Página em branco', tipo: 'livre', fundo: pal.fundo, camadas: [] };
  }
}

// ============================================================================
// 10. ASSINATURA CLÁSSICA (alias A — Clássico Sofisticado BIGA)
// ============================================================================
function slideAssinaturaClassica(tipo, pal, fnt) {
  switch (tipo) {
    case 'capa':
      return {
        id: uid('sl'),
        nome: 'Capa',
        tipo: 'capa',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Foto capa', 468, 0, 684, 648, 0),
          ...mkMarca(48, 48, { s: 32, forma: 'rect', r: 2, fill: 'destaque', nm: 15, wt: 500, c: 'texto', gap: 12 }, pal, fnt),
          mkTxt('Tipo e negociação', '{tipo} · {negociacao}', 48, 250, 372, 22, fnt.b, 500, 14, pal.texto, { opacidade: 0.65 }),
          mkTxt('Título', '{nome}', 48, 280, 372, 168, fnt.t, 300, 52, pal.texto, { entrelinha: 1.05, autoFit: true }),
          mkTxt('Localização', '{localizacao}', 48, 462, 372, 26, fnt.b, 500, 16, pal.texto),
          mkLinha('Filete destaque', 48, 512, 48, pal.destaque, 2),
          mkTxt('Rótulo preço', '{precoRotulo}', 48, 526, 372, 20, fnt.b, 500, 13, pal.destaque),
          mkTxt('Preço', '{preco}', 48, 548, 372, 54, fnt.b, 700, 40, pal.destaque, { autoFit: true })
        ]
      };
    case 'resumo':
      return {
        id: uid('sl'),
        nome: 'Resumo',
        tipo: 'resumo',
        fundo: pal.fundo,
        camadas: [
          mkRect('Painel esquerdo', 0, 0, 520, 648, pal.principal),
          ...mkMarca(48, 48, { s: 32, forma: 'rect', r: 2, fill: 'destaque', nm: 15, wt: 500, c: 'sobre-principal', gap: 12 }, pal, fnt),
          mkTxt('Tipo', '{tipo} · {negociacao}', 48, 340, 424, 22, fnt.b, 500, 13, pal['sobre-principal'], { opacidade: 0.68 }),
          mkTxt('Nome', '{nome}', 48, 366, 424, 62, fnt.b, 500, 24, pal['sobre-principal'], { entrelinha: 1.15, autoFit: true }),
          mkTxt('Localização', '{localizacao}', 48, 434, 424, 24, fnt.b, 300, 14, pal['sobre-principal'], { opacidade: 0.68 }),
          mkTxt('Rótulo preço', '{precoRotulo}', 48, 494, 424, 20, fnt.b, 500, 13, pal.destaque),
          mkTxt('Preço', '{preco}', 48, 518, 424, 82, fnt.t, 300, 64, pal['sobre-principal'], { autoFit: true }),
          mkTxt('Área rótulo', 'Área', 596, 82, 220, 24, fnt.b, 500, 14, pal.texto, { opacidade: 0.62 }),
          mkTxt('Área valor', '{area}', 820, 76, 284, 34, fnt.b, 500, 24, pal.texto, { alinhamento: 'right' }),
          mkLinha('Divisor 1', 596, 120, 508, pal.principal, 1),
          mkTxt('Terreno rótulo', 'Área total', 596, 132, 220, 24, fnt.b, 500, 14, pal.texto, { opacidade: 0.62 }),
          mkTxt('Terreno valor', '{areaTotal}', 820, 126, 284, 34, fnt.b, 500, 24, pal.texto, { alinhamento: 'right' }),
          mkLinha('Divisor 2', 596, 170, 508, pal.principal, 1),
          mkTxt('Quartos rótulo', 'Quartos', 596, 182, 220, 24, fnt.b, 500, 14, pal.texto, { opacidade: 0.62 }),
          mkTxt('Quartos valor', '{quartos}', 820, 176, 284, 34, fnt.b, 500, 24, pal.texto, { alinhamento: 'right' }),
          mkLinha('Divisor 3', 596, 220, 508, pal.principal, 1),
          mkTxt('Suítes rótulo', 'Suítes', 596, 232, 220, 24, fnt.b, 500, 14, pal.texto, { opacidade: 0.62 }),
          mkTxt('Suítes valor', '{suites}', 820, 226, 284, 34, fnt.b, 500, 24, pal.texto, { alinhamento: 'right' }),
          mkLinha('Divisor 4', 596, 270, 508, pal.principal, 1),
          mkTxt('Vagas rótulo', 'Vagas', 596, 282, 220, 24, fnt.b, 500, 14, pal.texto, { opacidade: 0.62 }),
          mkTxt('Vagas valor', '{vagas}', 820, 276, 284, 34, fnt.b, 500, 24, pal.texto, { alinhamento: 'right' }),
          mkLinha('Divisor 5', 596, 320, 508, pal.principal, 1),
          mkTxt('Título destaques', 'Destaques', 596, 352, 508, 24, fnt.b, 500, 13, pal.texto, { opacidade: 0.62 }),
          mkTxt('Destaques', '{destaques}', 596, 384, 508, 190, fnt.b, 500, 16, pal.texto, { entrelinha: 1.55, autoFit: true })
        ]
      };
    case 'foto':
      return {
        id: uid('sl'),
        nome: 'Foto grande',
        tipo: 'foto',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Foto destaque', 0, 0, 1152, 528, 1),
          mkRect('Barra legenda', 0, 528, 1152, 120, pal.fundo),
          mkTxt('Nome', '{nome}', 48, 548, 700, 34, fnt.b, 500, 24, pal.texto),
          mkTxt('Localização', '{localizacao}', 48, 586, 700, 24, fnt.b, 300, 14, pal.texto, { opacidade: 0.65 }),
          mkTxt('Tipo', '{tipo} · {negociacao}', 780, 554, 324, 28, fnt.b, 500, 14, pal.texto, { alinhamento: 'right', opacidade: 0.65 })
        ]
      };
    case 'galeria':
      return {
        id: uid('sl'),
        nome: 'Galeria',
        tipo: 'galeria',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Galeria 1', 48, 48, 740, 552, 2),
          mkFoto('Galeria 2', 804, 48, 300, 268, 3),
          mkFoto('Galeria 3', 804, 332, 300, 268, 4)
        ]
      };
    case 'texto':
      return {
        id: uid('sl'),
        nome: 'Descrição',
        tipo: 'texto',
        fundo: pal.fundo,
        camadas: [
          mkRect('Painel esquerdo', 0, 0, 420, 648, pal.principal),
          ...mkMarca(48, 48, { s: 32, forma: 'rect', r: 2, fill: 'destaque', nm: 15, wt: 500, c: 'sobre-principal', gap: 12 }, pal, fnt),
          mkTxt('Título seção', 'Descrição', 48, 456, 324, 52, fnt.t, 300, 42, pal['sobre-principal']),
          mkTxt('Localização', '{localizacao}', 48, 524, 324, 48, fnt.b, 300, 14, pal['sobre-principal'], { opacidade: 0.68 }),
          mkTxt('Corpo descrição', '{descricao}', 468, 72, 620, 504, fnt.b, 300, 16, pal.texto, { entrelinha: 1.7, autoFit: true })
        ]
      };
    case 'contato':
      return {
        id: uid('sl'),
        nome: 'Contato',
        tipo: 'contato',
        fundo: pal.fundo,
        camadas: [
          mkRect('Painel QR', 704, 0, 448, 648, pal.principal),
          ...mkMarca(48, 48, { s: 32, forma: 'rect', r: 2, fill: 'destaque', nm: 15, wt: 500, c: 'texto', gap: 12 }, pal, fnt),
          mkQr(796, 144, 260, pal, 2),
          mkTxt('Legenda QR', LEG_QR, 736, 424, 380, 28, fnt.b, 500, 15, pal['sobre-principal'], { alinhamento: 'center' }),
          mkTxt('Corretor', '{corretor}', 48, 350, 600, 118, fnt.t, 300, 54, pal.texto, { entrelinha: 1.05, autoFit: true }),
          mkTxt('CRECI', '{creci}', 48, 474, 600, 24, fnt.b, 500, 14, pal.texto, { opacidade: 0.65 }),
          mkTxt('Telefone', '{telefone}', 48, 520, 600, 38, fnt.b, 500, 28, pal.texto),
          mkTxt('E-mail', '{email}', 48, 564, 600, 28, fnt.b, 300, 18, pal.texto, { autoFit: true }),
          mkTxt('Rodapé', '{rodape}', 48, 608, 600, 20, fnt.b, 300, 11, pal.texto, { opacidade: 0.55 })
        ]
      };
    default:
      return { id: uid('sl'), nome: 'Página em branco', tipo: 'livre', fundo: pal.fundo, camadas: [] };
  }
}

// ============================================================================
// 11. FAIXA IMPERIAL (alias D — Faixa Sólida Limpa + Dourado #C9A227)
// ============================================================================
function slideFaixaImperial(tipo, pal, fnt) {
  switch (tipo) {
    case 'capa':
      return {
        id: uid('sl'),
        nome: 'Capa',
        tipo: 'capa',
        fundo: '#171721',
        camadas: [
          mkFoto('Foto capa', 0, 0, W, 412, 0),
          mkRect('Faixa imperial limpa', 0, 412, W, 236, '#171721'),
          mkRect('Divisor ouro limpo', 0, 410, W, 4, '#C9A227'),
          mkRect('Barra destaque', 48, 434, 88, 5, '#C9A227', { raio: 3 }),
          mkTxt('Nome', '{nome}', 48, 452, 660, 66, fnt.t, 600, 46, '#ffffff', { autoFit: true }),
          mkTxt('Detalhes', '{bairro} · {quartos} quartos · {area}', 48, 528, 660, 28, 'Montserrat', 300, 17, '#C3C3CC'),
          mkTxt('Rótulo', '{precoRotulo}', 740, 448, 364, 22, 'Montserrat', 700, 13, '#C9A227', { alinhamento: 'right', espacamento: 2 }),
          mkTxt('Preço', '{preco}', 740, 476, 364, 64, 'Montserrat', 700, 44, '#C9A227', { alinhamento: 'right', autoFit: true })
        ]
      };
    case 'resumo':
      return {
        id: uid('sl'),
        nome: 'Resumo',
        tipo: 'resumo',
        fundo: pal.fundo,
        camadas: [
          mkRect('Faixa sup dourada', 0, 0, W, 168, pal.principal),
          mkRect('Filete base faixa', 0, 168, W, 4, pal.destaque),
          mkTxt('Nome faixa', '{nome}', 48, 44, 660, 50, fnt.t, 600, 36, pal['sobre-principal'], { autoFit: true }),
          mkTxt('Loc faixa', '{localizacao}', 48, 102, 660, 24, fnt.b, 400, 14, pal.destaque),
          mkTxt('Preço faixa', '{preco}', 740, 56, 364, 52, fnt.b, 700, 38, pal.destaque, { alinhamento: 'right', autoFit: true }),
          mkRect('Tile 1', 48, 210, 250, 114, pal.principal, { raio: 8 }),
          mkTxt('T1 v', '{area}', 64, 232, 218, 44, fnt.t, 600, 32, pal['sobre-principal']),
          mkTxt('T1 l', 'ÁREA', 64, 282, 218, 20, fnt.b, 700, 12, pal.destaque),
          mkRect('Tile 2', 316, 210, 250, 114, pal.principal, { raio: 8 }),
          mkTxt('T2 v', '{quartos}', 332, 232, 218, 44, fnt.t, 600, 32, pal['sobre-principal']),
          mkTxt('T2 l', 'QUARTOS', 332, 282, 218, 20, fnt.b, 700, 12, pal.destaque),
          mkRect('Tile 3', 584, 210, 250, 114, pal.principal, { raio: 8 }),
          mkTxt('T3 v', '{suites}', 600, 232, 218, 44, fnt.t, 600, 32, pal['sobre-principal']),
          mkTxt('T3 l', 'SUÍTES', 600, 282, 218, 20, fnt.b, 700, 12, pal.destaque),
          mkRect('Tile 4', 852, 210, 252, 114, pal.principal, { raio: 8 }),
          mkTxt('T4 v', '{vagas}', 868, 232, 220, 44, fnt.t, 600, 32, pal['sobre-principal']),
          mkTxt('T4 l', 'VAGAS', 868, 282, 220, 20, fnt.b, 700, 12, pal.destaque),
          mkTxt('Destaques', '{destaques}', 48, 366, 1056, 220, fnt.b, 400, 18, pal.texto, { entrelinha: 1.65, autoFit: true })
        ]
      };
    case 'foto':
      return {
        id: uid('sl'),
        nome: 'Foto grande',
        tipo: 'foto',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Foto destaque', 0, 0, 812, 648, 1),
          mkRect('Faixa lateral dir', 812, 0, 340, 648, pal.principal),
          mkRect('Barra dir', 844, 48, 64, 4, pal.destaque),
          mkTxt('Nome', '{nome}', 844, 72, 276, 110, fnt.t, 600, 32, pal['sobre-principal'], { autoFit: true }),
          mkTxt('Loc', '{localizacao}', 844, 198, 276, 28, fnt.b, 400, 14, pal.destaque),
          mkTxt('Área val', '{area}', 844, 532, 276, 54, fnt.t, 600, 42, pal['sobre-principal'])
        ]
      };
    case 'galeria':
      return {
        id: uid('sl'),
        nome: 'Galeria',
        tipo: 'galeria',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Galeria pan topo', 36, 36, 1080, 276, 2),
          mkFoto('Galeria inf 1', 36, 336, 528, 276, 3),
          mkFoto('Galeria inf 2', 588, 336, 528, 276, 4)
        ]
      };
    case 'texto':
      return {
        id: uid('sl'),
        nome: 'Descrição',
        tipo: 'texto',
        fundo: pal.fundo,
        camadas: [
          mkRect('Faixa lateral esq', 0, 0, 360, 648, pal.principal),
          mkTxt('Título', 'Descrição', 44, 56, 272, 54, fnt.t, 600, 40, pal['sobre-principal']),
          mkRect('Barra ouro', 44, 122, 68, 6, pal.destaque),
          mkTxt('Nome rodapé', '{nome}', 44, 534, 272, 42, fnt.b, 700, 18, pal.destaque, { autoFit: true }),
          mkTxt('Descrição', '{descricao}', 408, 48, 696, 552, fnt.b, 400, 17, pal.texto, { entrelinha: 1.68, autoFit: true })
        ]
      };
    case 'contato':
      return {
        id: uid('sl'),
        nome: 'Contato',
        tipo: 'contato',
        fundo: pal.fundo,
        camadas: [
          mkRect('Faixa inf contato', 0, 412, W, 236, pal.principal),
          mkRect('Divisor faixa contato', 0, 410, W, 4, pal.destaque),
          ...mkMarca(48, 48, { s: 32, forma: 'rect', r: 0, fill: 'destaque', nm: 15, wt: 700, c: 'texto', gap: 12 }, pal, fnt),
          mkTxt('Corretor', '{corretor}', 48, 126, 700, 96, fnt.t, 600, 56, pal.texto, { autoFit: true }),
          mkTxt('CRECI', '{creci}', 48, 232, 700, 26, fnt.b, 700, 15, pal.destaque),
          mkTxt('Telefone', '{telefone}', 48, 456, 620, 44, fnt.b, 700, 34, pal['sobre-principal']),
          mkTxt('E-mail', '{email}', 48, 512, 620, 28, fnt.b, 400, 18, pal['sobre-principal']),
          mkQr(828, 434, 192, pal, 4),
          mkTxt('Rodapé', '{rodape}', 48, 588, 620, 20, fnt.b, 400, 12, pal.secundaria)
        ]
      };
    default:
      return { id: uid('sl'), nome: 'Página em branco', tipo: 'livre', fundo: pal.fundo, camadas: [] };
  }
}

// ============================================================================
// 12. MOLDURA SERENA (Moldura Fina Contínua + Cormorant Itálico)
// ============================================================================
function slideMolduraSerena(tipo, pal, fnt) {
  switch (tipo) {
    case 'capa':
      return {
        id: uid('sl'),
        nome: 'Capa',
        tipo: 'capa',
        fundo: '#171721',
        camadas: [
          mkFoto('Foto moldura full', 0, 0, W, H, 0),
          mkDeg('Sombra base suave', 0, 260, W, 388, '#17172100', '#171721D4', 180),
          mkRect('Moldura externa', 28, 28, W - 56, H - 56, '#00000000', { borda: 3, corBorda: '#ffffffcc' }),
          mkTxt('Nome itálico', '{nome}', 80, 412, 992, 74, fnt.t, 600, 58, '#ffffff', { alinhamento: 'center', italico: true, autoFit: true }),
          mkTxt('Subtítulo', '{bairro} · {area}', 80, 492, 992, 28, fnt.b, 400, 16, '#E4E4EE', { alinhamento: 'center', espacamento: 3 }),
          mkTxt('Preço', '{preco}', 80, 534, 992, 46, fnt.b, 300, 30, '#ffffff', { alinhamento: 'center', espacamento: 6, maiusculas: true, autoFit: true })
        ]
      };
    case 'resumo':
      return {
        id: uid('sl'),
        nome: 'Resumo',
        tipo: 'resumo',
        fundo: pal.fundo,
        camadas: [
          mkRect('Moldura externa resumo', 28, 28, W - 56, H - 56, '#00000000', { borda: 2, corBorda: pal.secundaria }),
          mkTxt('Nome', '{nome}', 96, 84, 960, 58, fnt.t, 600, 44, pal.texto, { alinhamento: 'center', italico: true, autoFit: true }),
          mkTxt('Preço', '{preco}', 96, 152, 960, 44, fnt.b, 300, 32, pal.destaque, { alinhamento: 'center', espacamento: 5 }),
          mkLinha('Hairline resumo', 296, 224, 560, pal.secundaria, 1),
          mkTxt('Specs em linha', '{area}   ·   {quartos} quartos   ·   {suites} suítes   ·   {vagas} vagas', 96, 256, 960, 34, fnt.b, 500, 20, pal.texto, { alinhamento: 'center' }),
          mkTxt('Destaques', '{destaques}', 164, 336, 824, 216, fnt.b, 400, 17, pal.secundaria, { alinhamento: 'center', entrelinha: 1.72, autoFit: true })
        ]
      };
    case 'foto':
      return {
        id: uid('sl'),
        nome: 'Foto grande',
        tipo: 'foto',
        fundo: pal.fundo,
        camadas: [
          mkRect('Moldura externa foto', 28, 28, W - 56, H - 56, '#00000000', { borda: 2, corBorda: pal.secundaria }),
          mkFoto('Foto interior serena', 56, 56, W - 112, 468, 1),
          mkTxt('Legenda serena', '{nome} · {localizacao}', 56, 548, W - 112, 34, fnt.t, 600, 26, pal.texto, { alinhamento: 'center', italico: true })
        ]
      };
    case 'galeria':
      return {
        id: uid('sl'),
        nome: 'Galeria',
        tipo: 'galeria',
        fundo: pal.fundo,
        camadas: [
          mkRect('Moldura galeria', 28, 28, W - 56, H - 56, '#00000000', { borda: 2, corBorda: pal.secundaria }),
          mkFoto('Quadro 1', 56, 56, 324, 536, 2),
          mkFoto('Quadro 2', 414, 56, 324, 536, 3),
          mkFoto('Quadro 3', 772, 56, 324, 536, 4)
        ]
      };
    case 'texto':
      return {
        id: uid('sl'),
        nome: 'Descrição',
        tipo: 'texto',
        fundo: pal.fundo,
        camadas: [
          mkRect('Moldura texto', 28, 28, W - 56, H - 56, '#00000000', { borda: 2, corBorda: pal.secundaria }),
          mkTxt('Título itálico', '{nome}', 140, 82, 872, 54, fnt.t, 600, 42, pal.texto, { alinhamento: 'center', italico: true, autoFit: true }),
          mkTxt('Corpo sereno', '{descricao}', 176, 178, 800, 376, fnt.b, 300, 18, pal.texto, { alinhamento: 'center', entrelinha: 1.75, autoFit: true })
        ]
      };
    case 'contato':
      return {
        id: uid('sl'),
        nome: 'Contato',
        tipo: 'contato',
        fundo: pal.fundo,
        camadas: [
          mkRect('Moldura contato', 28, 28, W - 56, H - 56, '#00000000', { borda: 2, corBorda: pal.secundaria }),
          mkTxt('Corretor', '{corretor}', 96, 112, 960, 68, fnt.t, 600, 52, pal.texto, { alinhamento: 'center', italico: true, autoFit: true }),
          mkTxt('CRECI', '{creci}', 96, 186, 960, 24, fnt.b, 400, 14, pal.destaque, { alinhamento: 'center', espacamento: 3 }),
          mkTxt('Telefone e e-mail', '{telefone}   ·   {email}', 96, 238, 960, 34, fnt.b, 500, 20, pal.texto, { alinhamento: 'center' }),
          mkQr(486, 316, 180, pal, 8),
          mkTxt('Legenda QR', LEG_QR, 96, 514, 960, 24, fnt.b, 400, 12, pal.secundaria, { alinhamento: 'center' })
        ]
      };
    default:
      return { id: uid('sl'), nome: 'Página em branco', tipo: 'livre', fundo: pal.fundo, camadas: [] };
  }
}

function construirSlideDoModelo(modeloId, tipoSlide, pal, fnt) {
  switch (modeloId) {
    case 'arquitetura-suica': return slideArquiteturaSuica(tipoSlide, pal, fnt);
    case 'revista-atelier': return slideRevistaAtelier(tipoSlide, pal, fnt);
    case 'vitrine-fosca': return slideVitrineFosca(tipoSlide, pal, fnt);
    case 'traco-fino': return slideTracoFino(tipoSlide, pal, fnt);
    case 'noite-dourada': return slideNoiteDourada(tipoSlide, pal, fnt);
    case 'essencia-moderna': return slideEssenciaModerna(tipoSlide, pal, fnt);
    case 'visao-glass': return slideVisaoGlass(tipoSlide, pal, fnt);
    case 'galeria-prive': return slideGaleriaPrive(tipoSlide, pal, fnt);
    case 'manchete-nobre': return slideMancheteNobre(tipoSlide, pal, fnt);
    case 'faixa-imperial': return slideFaixaImperial(tipoSlide, pal, fnt);
    case 'moldura-serena': return slideMolduraSerena(tipoSlide, pal, fnt);
    case 'assinatura-classica':
    default:
      return slideAssinaturaClassica(tipoSlide, pal, fnt);
  }
}

/**
 * Cria um único slide pronto para qualquer um dos 12 modelos ou aliases ('A'..'F').
 */
function criarSlideModelo(modeloId = 'assinatura-classica', tipoSlide = 'capa', paletaId = 'principal', kit = {}, opts = {}) {
  const M = resolverCatalogoModelo(modeloId);
  const { pal } = resolverPaleta(M, paletaId, kit, opts);
  const fnt = resolverFontesModelo(M, kit);
  return construirSlideDoModelo(M.id, String(tipoSlide || 'capa').toLowerCase(), pal, fnt);
}

/**
 * Gera cena editável JSON v1 completa para um dos 12 modelos (ou alias legado A..F) e paleta.
 */
function criarCenaModelo(modeloId = 'assinatura-classica', paletaId = 'principal', kit = {}, dados = null, opts = {}) {
  const M = resolverCatalogoModelo(modeloId);
  const { pid, pal } = resolverPaleta(M, paletaId, kit, opts);
  const fnt = resolverFontesModelo(M, kit);

  const tipos = Array.isArray(opts.paginas) && opts.paginas.length
    ? opts.paginas.map(p => (typeof p === 'string' ? p : p?.tipo)).filter(Boolean).slice(0, 14)
    : PAGINAS_PADRAO;

  const slides = tipos.map(tp => construirSlideDoModelo(M.id, String(tp).toLowerCase(), pal, fnt));

  return {
    versao: 1,
    modo: 'pdf',
    formato: '16:9',
    largura: W,
    altura: H,
    nome: M.nome,
    modeloBase: M.id,
    paletaId: pid,
    paleta: [pal.fundo, pal.texto, pal.principal, pal.secundaria, pal.destaque],
    slides
  };
}

module.exports = {
  criarCenaModelo,
  criarSlideModelo,
  PAGINAS_PADRAO,
  COMPATIVEIS_MODELO,
  CATALOGO_12,
  resolverModeloId
};
