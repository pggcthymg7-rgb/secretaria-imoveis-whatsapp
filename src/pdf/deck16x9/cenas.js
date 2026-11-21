'use strict';
/**
 * Cenas editáveis JSON v1 (1152 × 648 pt) para os 5 modelos (A, B, D, E, F) × 2 paletas.
 * Traduz fielmente cores, tipografia e composições de `modelos.js` para o formato
 * consumido pelo `studio-core.js` (Konva) e por `gerarDeCena()` (pdfkit).
 */
const crypto = require('crypto');
const { derivar } = require('./kit');
const { MODELOS, W, H } = require('./modelos');

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
  const k = String(modeloId || 'A').trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(MODELOS, k) ? k : 'A';
}

function resolverPaleta(M, paletaId, kit, opts = {}) {
  const pid = String(paletaId || 'principal').toLowerCase() === 'segunda' ? 'segunda' : 'principal';
  let base = pid === 'segunda' ? M.pal2 : M.pal1;
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

function resolverFontesModelo(M, kit) {
  const tOrig = nomeFonteGoogle(M.fontes.t);
  const bOrig = nomeFonteGoogle(M.fontes.b);
  const sOrig = M.fontes.s ? nomeFonteGoogle(M.fontes.s) : tOrig;
  let t = tOrig;
  if (kit && kit.fonte) {
    const kitFam = nomeFonteGoogle(kit.fonte);
    if ((COMPATIVEIS_MODELO[M.id] || []).includes(kitFam)) t = kitFam;
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
    ...extra
  };
}

function mkLogo(x, y, s, forma, raio, corFundo, corTexto) {
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
    corTexto
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

// ------------------------------------------------------------------ Builders por Modelo (A, B, D, E, F)

function slideA(tipo, pal, fnt) {
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
          mkFoto('Galeria 1', 36, 36, 672, 576, 2),
          mkFoto('Galeria 2', 716, 36, 400, 284, 3),
          mkFoto('Galeria 3', 716, 328, 400, 284, 4)
        ]
      };
    case 'texto':
      return {
        id: uid('sl'),
        nome: 'Descrição',
        tipo: 'texto',
        fundo: pal.fundo,
        camadas: [
          mkTxt('Título seção', 'Descrição', 48, 72, 340, 56, fnt.t, 300, 44, pal.texto),
          mkLinha('Filete destaque', 48, 146, 48, pal.destaque, 2),
          mkTxt('Nome rodapé', '{nome}', 48, 540, 340, 26, fnt.b, 500, 15, pal.texto),
          mkTxt('Localização rodapé', '{localizacao}', 48, 568, 340, 22, fnt.b, 300, 13, pal.texto, { opacidade: 0.62 }),
          mkTxt('Descrição', '{descricao}', 468, 72, 600, 504, fnt.b, 300, 16, pal.texto, { entrelinha: 1.65, autoFit: true })
        ]
      };
    case 'contato':
      return {
        id: uid('sl'),
        nome: 'Contato',
        tipo: 'contato',
        fundo: pal.fundo,
        camadas: [
          mkRect('Painel direito', 700, 0, 452, 648, pal.principal),
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

function slideB(tipo, pal, fnt) {
  switch (tipo) {
    case 'capa':
      return {
        id: uid('sl'),
        nome: 'Capa',
        tipo: 'capa',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Foto capa', 624, 72, 456, 504, 0),
          ...mkMarca(72, 72, { s: 24, forma: 'circle', fill: 'principal', nm: 12, wt: 400, c: 'texto', gap: 10 }, pal, fnt),
          mkRect('Filete destaque', 72, 168, 40, 3, pal.destaque),
          mkTxt('Tipo', '{tipo} · {negociacao}', 72, 192, 500, 22, fnt.b, 400, 12, pal.texto, { opacidade: 0.62 }),
          mkTxt('Título', '{nome}', 72, 222, 500, 164, fnt.t, 400, 70, pal.texto, { entrelinha: 0.98, autoFit: true }),
          mkLinha('Hairline', 72, 402, 480, pal.secundaria, 1),
          mkTxt('Localização', '{localizacao}', 72, 418, 500, 24, fnt.b, 400, 13, pal.texto),
          mkTxt('Rótulo preço', '{precoRotulo}', 72, 494, 500, 20, fnt.b, 400, 12, pal.texto, { opacidade: 0.62 }),
          mkTxt('Preço', '{preco}', 72, 518, 500, 58, fnt.t, 600, 44, pal.texto, { autoFit: true })
        ]
      };
    case 'resumo':
      return {
        id: uid('sl'),
        nome: 'Resumo',
        tipo: 'resumo',
        fundo: pal.fundo,
        camadas: [
          ...mkMarca(72, 72, { s: 24, forma: 'circle', fill: 'principal', nm: 12, wt: 400, c: 'texto', gap: 10 }, pal, fnt),
          mkTxt('Rótulo preço', '{precoRotulo}', 72, 146, 400, 20, fnt.b, 400, 12, pal.texto, { opacidade: 0.62 }),
          mkTxt('Preço', '{preco}', 72, 170, 400, 76, fnt.t, 600, 60, pal.texto, { autoFit: true }),
          mkTxt('Tipo', '{tipo} · {negociacao}', 72, 268, 400, 20, fnt.b, 400, 12, pal.texto, { opacidade: 0.62 }),
          mkTxt('Nome', '{nome}', 72, 292, 400, 52, fnt.t, 400, 22, pal.texto, { autoFit: true }),
          mkTxt('Localização', '{localizacao}', 72, 348, 400, 22, fnt.b, 400, 13, pal.texto),
          mkTxt('Destaques título', 'Destaques', 72, 408, 400, 20, fnt.b, 400, 12, pal.texto, { opacidade: 0.62 }),
          mkTxt('Destaques', '{destaques}', 72, 434, 400, 150, fnt.b, 400, 14, pal.texto, { entrelinha: 1.65, autoFit: true }),
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
          mkFoto('Foto destaque', 72, 48, 1008, 480, 1),
          mkLinha('Hairline legenda', 72, 548, 1008, pal.secundaria, 1),
          mkTxt('Nome', '{nome}', 72, 562, 640, 30, fnt.t, 400, 22, pal.texto),
          mkTxt('Localização', '{localizacao}', 732, 566, 348, 22, fnt.b, 400, 12, pal.texto, { alinhamento: 'right', opacidade: 0.62 })
        ]
      };
    case 'galeria':
      return {
        id: uid('sl'),
        nome: 'Galeria',
        tipo: 'galeria',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Galeria 1', 72, 72, 600, 504, 2),
          mkFoto('Galeria 2', 696, 72, 384, 240, 3),
          mkFoto('Galeria 3', 696, 336, 384, 240, 4)
        ]
      };
    case 'texto':
      return {
        id: uid('sl'),
        nome: 'Descrição',
        tipo: 'texto',
        fundo: pal.fundo,
        camadas: [
          mkTxt('Título seção', 'Descrição', 72, 72, 600, 50, fnt.t, 600, 40, pal.texto),
          mkLinha('Hairline', 72, 152, 1008, pal.secundaria, 1),
          mkTxt('Descrição', '{descricao}', 72, 176, 1008, 404, fnt.b, 400, 14, pal.texto, { entrelinha: 1.7, autoFit: true })
        ]
      };
    case 'contato':
      return {
        id: uid('sl'),
        nome: 'Contato',
        tipo: 'contato',
        fundo: pal.fundo,
        camadas: [
          mkRect('Painel direito', 828, 0, 324, 648, pal.principal),
          ...mkMarca(72, 72, { s: 24, forma: 'circle', fill: 'principal', nm: 12, wt: 400, c: 'texto', gap: 10 }, pal, fnt),
          mkQr(885, 190, 210, pal, 0),
          mkTxt('Legenda QR', LEG_QR, 864, 418, 252, 24, fnt.b, 400, 12, pal['sobre-principal'], { alinhamento: 'center' }),
          mkTxt('Corretor', '{corretor}', 72, 190, 680, 134, fnt.t, 600, 64, pal.texto, { entrelinha: 1.0, autoFit: true }),
          mkLinha('Hairline', 72, 344, 360, pal.secundaria, 1),
          mkTxt('CRECI', '{creci}', 72, 362, 680, 22, fnt.b, 400, 12, pal.texto, { opacidade: 0.62 }),
          mkTxt('Telefone', '{telefone}', 72, 404, 680, 40, fnt.t, 400, 32, pal.texto),
          mkTxt('E-mail', '{email}', 72, 456, 680, 24, fnt.b, 400, 14, pal.texto, { autoFit: true }),
          mkTxt('Rodapé', '{rodape}', 72, 576, 680, 20, fnt.b, 400, 11, pal.texto, { opacidade: 0.55 })
        ]
      };
    default:
      return { id: uid('sl'), nome: 'Página em branco', tipo: 'livre', fundo: pal.fundo, camadas: [] };
  }
}

function slideD(tipo, pal, fnt) {
  switch (tipo) {
    case 'capa':
      return {
        id: uid('sl'),
        nome: 'Capa',
        tipo: 'capa',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Foto capa', 680, 0, 472, 648, 0),
          ...mkMarca(36, 36, { s: 28, forma: 'rect', r: 0, fill: 'destaque', nm: 14, wt: 700, c: 'texto', gap: 10 }, pal, fnt),
          mkTxt('Tipo', '{tipo} · {negociacao}', 36, 98, 620, 24, fnt.b, 700, 15, pal.texto, { opacidade: 0.62 }),
          mkTxt('Título', '{nome}', 36, 134, 620, 230, fnt.t, 400, 82, pal.texto, { entrelinha: 0.92, autoFit: true }),
          mkTxt('Localização', '{localizacao}', 36, 384, 620, 28, fnt.b, 400, 18, pal.texto),
          mkRect('Faixa inferior', 0, 452, 680, 196, pal.principal),
          mkRect('Detalhe destaque', 36, 452, 120, 12, pal.destaque),
          mkTxt('Rótulo preço', '{precoRotulo}', 36, 480, 620, 22, fnt.b, 700, 15, pal['sobre-principal']),
          mkTxt('Preço', '{preco}', 36, 506, 620, 110, fnt.t, 400, 72, pal['sobre-principal'], { entrelinha: 1.0, autoFit: true })
        ]
      };
    case 'resumo':
      return {
        id: uid('sl'),
        nome: 'Resumo',
        tipo: 'resumo',
        fundo: pal.fundo,
        camadas: [
          mkRect('Painel direito', 772, 0, 380, 648, pal.principal),
          mkTxt('Tipo', '{tipo} · {negociacao}', 36, 36, 712, 22, fnt.b, 700, 15, pal.texto, { opacidade: 0.62 }),
          mkTxt('Nome', '{nome}', 36, 60, 712, 54, fnt.b, 700, 22, pal.texto, { autoFit: true }),
          mkTxt('Rótulo preço', '{precoRotulo}', 36, 134, 712, 22, fnt.b, 700, 15, pal.destaque),
          mkTxt('Preço', '{preco}', 36, 160, 712, 114, fnt.t, 400, 92, pal.texto, { entrelinha: 0.95, autoFit: true }),
          mkTxt('Área val', '{area}', 36, 330, 160, 50, fnt.t, 400, 40, pal.texto, { autoFit: true }),
          mkTxt('Área lbl', 'Área', 36, 386, 160, 20, fnt.b, 700, 13, pal.texto, { opacidade: 0.62 }),
          mkTxt('Quartos val', '{quartos}', 220, 330, 160, 50, fnt.t, 400, 40, pal.texto, { autoFit: true }),
          mkTxt('Quartos lbl', 'Quartos', 220, 386, 160, 20, fnt.b, 700, 13, pal.texto, { opacidade: 0.62 }),
          mkTxt('Suítes val', '{suites}', 404, 330, 160, 50, fnt.t, 400, 40, pal.texto, { autoFit: true }),
          mkTxt('Suítes lbl', 'Suítes', 404, 386, 160, 20, fnt.b, 700, 13, pal.texto, { opacidade: 0.62 }),
          mkTxt('Vagas val', '{vagas}', 588, 330, 160, 50, fnt.t, 400, 40, pal.texto, { autoFit: true }),
          mkTxt('Vagas lbl', 'Vagas', 588, 386, 160, 20, fnt.b, 700, 13, pal.texto, { opacidade: 0.62 }),
          mkTxt('Destaques título', 'Destaques', 804, 36, 312, 22, fnt.b, 700, 13, pal['sobre-principal'], { opacidade: 0.68 }),
          mkLinha('Divisor', 804, 68, 312, pal['sobre-principal'], 1, { opacidade: 0.35 }),
          mkTxt('Destaques', '{destaques}', 804, 86, 312, 510, fnt.b, 700, 20, pal['sobre-principal'], { entrelinha: 1.55, autoFit: true })
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
          mkTxt('Tipo', '{tipo} · {negociacao}', 836, 36, 280, 22, fnt.b, 700, 14, pal.texto, { opacidade: 0.62 }),
          mkTxt('Nome', '{nome}', 836, 72, 280, 110, fnt.t, 400, 34, pal.texto, { entrelinha: 1.05, autoFit: true }),
          mkTxt('Localização', '{localizacao}', 836, 194, 280, 28, fnt.b, 400, 15, pal.texto),
          mkTxt('Área lbl', 'Área', 836, 506, 280, 20, fnt.b, 700, 13, pal.texto, { opacidade: 0.62 }),
          mkTxt('Área val', '{area}', 836, 532, 280, 72, fnt.t, 400, 56, pal.texto, { autoFit: true })
        ]
      };
    case 'galeria':
      return {
        id: uid('sl'),
        nome: 'Galeria',
        tipo: 'galeria',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Galeria 1', 36, 36, 620, 576, 2),
          mkFoto('Galeria 2', 680, 36, 436, 276, 3),
          mkFoto('Galeria 3', 680, 336, 436, 276, 4)
        ]
      };
    case 'texto':
      return {
        id: uid('sl'),
        nome: 'Descrição',
        tipo: 'texto',
        fundo: pal.fundo,
        camadas: [
          mkTxt('Título seção', 'Descrição', 36, 36, 344, 62, fnt.t, 400, 52, pal.texto),
          mkRect('Barra destaque', 36, 112, 80, 10, pal.destaque),
          mkTxt('Nome rodapé', '{nome}', 36, 540, 344, 48, fnt.t, 400, 20, pal.texto, { entrelinha: 1.1, autoFit: true }),
          mkTxt('Localização rodapé', '{localizacao}', 36, 594, 344, 22, fnt.b, 400, 14, pal.texto, { opacidade: 0.62 }),
          mkTxt('Descrição', '{descricao}', 404, 40, 680, 568, fnt.b, 400, 15, pal.texto, { entrelinha: 1.65, autoFit: true })
        ]
      };
    case 'contato':
      return {
        id: uid('sl'),
        nome: 'Contato',
        tipo: 'contato',
        fundo: pal.fundo,
        camadas: [
          mkRect('Painel direito', 680, 0, 472, 648, pal.principal),
          ...mkMarca(36, 36, { s: 28, forma: 'rect', r: 0, fill: 'destaque', nm: 14, wt: 700, c: 'texto', gap: 10 }, pal, fnt),
          mkQr(788, 144, 256, pal, 0),
          mkTxt('Legenda QR', LEG_QR, 716, 420, 400, 28, fnt.b, 700, 16, pal['sobre-principal'], { alinhamento: 'center' }),
          mkTxt('Corretor', '{corretor}', 36, 108, 620, 150, fnt.t, 400, 68, pal.texto, { entrelinha: 0.96, autoFit: true }),
          mkTxt('CRECI', '{creci}', 36, 272, 620, 24, fnt.b, 700, 15, pal.texto, { opacidade: 0.62 }),
          mkTxt('Telefone', '{telefone}', 36, 504, 620, 50, fnt.t, 400, 42, pal.texto),
          mkTxt('E-mail', '{email}', 36, 562, 620, 30, fnt.b, 700, 22, pal.texto, { autoFit: true }),
          mkTxt('Rodapé', '{rodape}', 36, 604, 620, 20, fnt.b, 400, 11, pal.texto, { opacidade: 0.55 })
        ]
      };
    default:
      return { id: uid('sl'), nome: 'Página em branco', tipo: 'livre', fundo: pal.fundo, camadas: [] };
  }
}

function slideE(tipo, pal, fnt) {
  switch (tipo) {
    case 'capa':
      return {
        id: uid('sl'),
        nome: 'Capa',
        tipo: 'capa',
        fundo: pal.fundo,
        camadas: [
          mkRect('Moldura', 560, 48, 544, 552, pal.secundaria, { raio: 28 }),
          mkFoto('Foto capa', 572, 60, 520, 528, 0, { raio: 20 }),
          ...mkMarca(60, 60, { s: 36, forma: 'circle', fill: 'destaque', nm: 17, wt: 600, c: 'texto', gap: 12 }, pal, fnt),
          mkTxt('Tipo', '{tipo} · {negociacao}', 60, 198, 470, 26, fnt.b, 600, 17, pal.principal),
          mkTxt('Título', '{nome}', 60, 232, 470, 180, fnt.t, 700, 52, pal.texto, { entrelinha: 1.08, autoFit: true }),
          mkTxt('Localização', '{localizacao}', 60, 424, 470, 28, fnt.b, 400, 19, pal.texto),
          mkRect('Painel preço', 60, 478, 410, 110, pal.principal, { raio: 14 }),
          mkTxt('Rótulo preço', '{precoRotulo}', 86, 492, 358, 22, fnt.b, 600, 15, pal['sobre-principal']),
          mkTxt('Preço', '{preco}', 86, 516, 358, 56, fnt.t, 700, 38, pal['sobre-principal'], { autoFit: true })
        ]
      };
    case 'resumo':
      return {
        id: uid('sl'),
        nome: 'Resumo',
        tipo: 'resumo',
        fundo: pal.fundo,
        camadas: [
          mkRect('Cartão principal', 48, 48, 424, 552, pal.principal, { raio: 28 }),
          mkTxt('Rótulo preço', '{precoRotulo}', 84, 84, 352, 24, fnt.b, 600, 17, pal['sobre-principal']),
          mkTxt('Preço', '{preco}', 84, 112, 352, 68, fnt.t, 700, 50, pal['sobre-principal'], { autoFit: true }),
          mkTxt('Tipo', '{tipo} · {negociacao}', 84, 206, 352, 24, fnt.b, 600, 17, pal['sobre-principal'], { opacidade: 0.72 }),
          mkTxt('Nome', '{nome}', 84, 236, 352, 66, fnt.t, 700, 26, pal['sobre-principal'], { entrelinha: 1.15, autoFit: true }),
          mkTxt('Localização', '{localizacao}', 84, 310, 352, 26, fnt.b, 400, 17, pal['sobre-principal']),
          mkTxt('Área lbl', 'Área', 520, 68, 240, 26, fnt.b, 400, 18, pal.texto),
          mkTxt('Área val', '{area}', 760, 62, 344, 34, fnt.t, 700, 26, pal.texto, { alinhamento: 'right' }),
          mkLinha('Div 1', 520, 110, 584, pal.secundaria, 1),
          mkTxt('Terreno lbl', 'Área total', 520, 122, 240, 26, fnt.b, 400, 18, pal.texto),
          mkTxt('Terreno val', '{areaTotal}', 760, 116, 344, 34, fnt.t, 700, 26, pal.texto, { alinhamento: 'right' }),
          mkLinha('Div 2', 520, 164, 584, pal.secundaria, 1),
          mkTxt('Quartos lbl', 'Quartos', 520, 176, 240, 26, fnt.b, 400, 18, pal.texto),
          mkTxt('Quartos val', '{quartos}', 760, 170, 344, 34, fnt.t, 700, 26, pal.texto, { alinhamento: 'right' }),
          mkLinha('Div 3', 520, 218, 584, pal.secundaria, 1),
          mkTxt('Suítes lbl', 'Suítes', 520, 230, 240, 26, fnt.b, 400, 18, pal.texto),
          mkTxt('Suítes val', '{suites}', 760, 224, 344, 34, fnt.t, 700, 26, pal.texto, { alinhamento: 'right' }),
          mkLinha('Div 4', 520, 272, 584, pal.secundaria, 1),
          mkTxt('Vagas lbl', 'Vagas', 520, 284, 240, 26, fnt.b, 400, 18, pal.texto),
          mkTxt('Vagas val', '{vagas}', 760, 278, 344, 34, fnt.t, 700, 26, pal.texto, { alinhamento: 'right' }),
          mkLinha('Div 5', 520, 326, 584, pal.secundaria, 1),
          mkRect('Fundo destaques', 520, 356, 584, 244, pal.secundaria, { raio: 20, opacidade: 0.45 }),
          mkTxt('Destaques', '{destaques}', 544, 380, 536, 196, fnt.b, 600, 17, pal.texto, { entrelinha: 1.5, autoFit: true })
        ]
      };
    case 'foto':
      return {
        id: uid('sl'),
        nome: 'Foto grande',
        tipo: 'foto',
        fundo: pal.fundo,
        camadas: [
          mkRect('Moldura', 48, 48, 1056, 500, pal.secundaria, { raio: 28 }),
          mkFoto('Foto destaque', 60, 60, 1032, 476, 1, { raio: 18 }),
          mkTxt('Nome', '{nome}', 48, 566, 680, 32, fnt.t, 700, 22, pal.texto),
          mkTxt('Localização', '{localizacao}', 740, 568, 364, 26, fnt.b, 400, 17, pal.texto, { alinhamento: 'right' })
        ]
      };
    case 'galeria':
      return {
        id: uid('sl'),
        nome: 'Galeria',
        tipo: 'galeria',
        fundo: pal.fundo,
        camadas: [
          mkRect('Moldura 1', 48, 48, 600, 552, pal.secundaria, { raio: 26 }),
          mkFoto('Galeria 1', 58, 58, 580, 532, 2, { raio: 18 }),
          mkRect('Moldura 2', 664, 48, 440, 268, pal.secundaria, { raio: 26 }),
          mkFoto('Galeria 2', 674, 58, 420, 248, 3, { raio: 18 }),
          mkRect('Moldura 3', 664, 332, 440, 268, pal.secundaria, { raio: 26 }),
          mkFoto('Galeria 3', 674, 342, 420, 248, 4, { raio: 18 })
        ]
      };
    case 'texto':
      return {
        id: uid('sl'),
        nome: 'Descrição',
        tipo: 'texto',
        fundo: pal.fundo,
        camadas: [
          mkRect('Moldura', 48, 48, 312, 552, pal.secundaria, { raio: 28 }),
          mkFoto('Foto lateral', 58, 58, 292, 532, 2, { raio: 20 }),
          mkTxt('Título seção', 'Descrição', 408, 56, 640, 44, fnt.t, 700, 34, pal.texto),
          mkRect('Barra destaque', 408, 112, 56, 4, pal.destaque, { raio: 2 }),
          mkTxt('Descrição', '{descricao}', 408, 140, 680, 460, fnt.t, 400, 17, pal.texto, { entrelinha: 1.6, autoFit: true })
        ]
      };
    case 'contato':
      return {
        id: uid('sl'),
        nome: 'Contato',
        tipo: 'contato',
        fundo: pal.fundo,
        camadas: [
          mkRect('Cartão contato', 48, 48, 528, 552, pal.principal, { raio: 28 }),
          ...mkMarca(84, 84, { s: 32, forma: 'circle', fill: 'destaque', nm: 16, wt: 600, c: 'sobre-principal', gap: 10 }, pal, fnt),
          mkTxt('Corretor', '{corretor}', 84, 316, 456, 108, fnt.t, 700, 44, pal['sobre-principal'], { entrelinha: 1.1, autoFit: true }),
          mkTxt('CRECI', '{creci}', 84, 430, 456, 24, fnt.b, 600, 16, pal['sobre-principal'], { opacidade: 0.72 }),
          mkTxt('Telefone', '{telefone}', 84, 474, 456, 38, fnt.t, 700, 28, pal['sobre-principal']),
          mkTxt('E-mail', '{email}', 84, 520, 456, 28, fnt.b, 400, 19, pal['sobre-principal'], { autoFit: true }),
          mkTxt('Rodapé', '{rodape}', 84, 558, 456, 20, fnt.b, 400, 11, pal['sobre-principal'], { opacidade: 0.65 }),
          mkQr(712, 120, 256, pal, 14),
          mkTxt('Legenda QR', LEG_QR, 612, 400, 456, 34, fnt.t, 700, 22, pal.texto, { alinhamento: 'center' })
        ]
      };
    default:
      return { id: uid('sl'), nome: 'Página em branco', tipo: 'livre', fundo: pal.fundo, camadas: [] };
  }
}

function slideF(tipo, pal, fnt) {
  switch (tipo) {
    case 'capa':
      return {
        id: uid('sl'),
        nome: 'Capa',
        tipo: 'capa',
        fundo: pal.fundo,
        camadas: [
          mkTxt('Tipo script', '{tipo} · {negociacao}', 72, 66, 1008, 40, fnt.s, 400, 30, pal.texto, { alinhamento: 'center' }),
          mkTxt('Título', '{nome}', 72, 108, 1008, 92, fnt.t, 400, 56, pal.texto, { alinhamento: 'center', entrelinha: 1.02, autoFit: true }),
          mkTxt('Localização', '{localizacao}', 72, 206, 1008, 22, fnt.t, 400, 14, pal.texto, { alinhamento: 'center', opacidade: 0.65 }),
          mkFoto('Foto capa', 72, 250, 1008, 272, 0),
          ...mkMarca(72, 560, { s: 24, forma: 'rect', r: 0, fill: 'principal', nm: 12, wt: 400, c: 'texto', gap: 12 }, pal, fnt),
          mkTxt('Rótulo preço', '{precoRotulo}', 560, 546, 520, 18, fnt.t, 400, 12, pal.texto, { alinhamento: 'right', opacidade: 0.65 }),
          mkTxt('Preço', '{preco}', 560, 566, 520, 40, fnt.t, 400, 32, pal.texto, { alinhamento: 'right', autoFit: true })
        ]
      };
    case 'resumo':
      return {
        id: uid('sl'),
        nome: 'Resumo',
        tipo: 'resumo',
        fundo: pal.fundo,
        camadas: [
          ...mkMarca(480, 54, { s: 24, forma: 'rect', r: 0, fill: 'principal', nm: 12, wt: 400, c: 'texto', gap: 12 }, pal, fnt, 220),
          mkTxt('Tipo', '{tipo} · {negociacao}', 72, 114, 1008, 20, fnt.t, 400, 12, pal.texto, { alinhamento: 'center', opacidade: 0.62 }),
          mkTxt('Nome', '{nome}', 72, 138, 1008, 44, fnt.t, 400, 30, pal.texto, { alinhamento: 'center', autoFit: true }),
          mkTxt('Localização', '{localizacao}', 72, 184, 1008, 22, fnt.t, 400, 14, pal.texto, { alinhamento: 'center', opacidade: 0.62 }),
          mkTxt('Rótulo preço', '{precoRotulo}', 72, 232, 1008, 20, fnt.t, 400, 12, pal.destaque, { alinhamento: 'center' }),
          mkTxt('Preço', '{preco}', 72, 254, 1008, 84, fnt.t, 400, 68, pal.texto, { alinhamento: 'center', autoFit: true }),
          mkLinha('Linha sup', 72, 360, 1008, pal.secundaria, 1),
          mkTxt('Área val', '{area}', 80, 378, 220, 34, fnt.t, 400, 28, pal.texto, { alinhamento: 'center', autoFit: true }),
          mkTxt('Área lbl', 'Área', 80, 418, 220, 18, fnt.t, 400, 12, pal.texto, { alinhamento: 'center', opacidade: 0.62 }),
          mkRect('Sep 1', 316, 382, 1, 48, pal.secundaria),
          mkTxt('Quartos val', '{quartos}', 332, 378, 220, 34, fnt.t, 400, 28, pal.texto, { alinhamento: 'center', autoFit: true }),
          mkTxt('Quartos lbl', 'Quartos', 332, 418, 220, 18, fnt.t, 400, 12, pal.texto, { alinhamento: 'center', opacidade: 0.62 }),
          mkRect('Sep 2', 568, 382, 1, 48, pal.secundaria),
          mkTxt('Suítes val', '{suites}', 584, 378, 220, 34, fnt.t, 400, 28, pal.texto, { alinhamento: 'center', autoFit: true }),
          mkTxt('Suítes lbl', 'Suítes', 584, 418, 220, 18, fnt.t, 400, 12, pal.texto, { alinhamento: 'center', opacidade: 0.62 }),
          mkRect('Sep 3', 820, 382, 1, 48, pal.secundaria),
          mkTxt('Vagas val', '{vagas}', 836, 378, 220, 34, fnt.t, 400, 28, pal.texto, { alinhamento: 'center', autoFit: true }),
          mkTxt('Suítes lbl', 'Suítes', 584, 418, 220, 18, fnt.t, 400, 12, pal.texto, { alinhamento: 'center', opacidade: 0.62 }),
          mkTxt('Vagas val', '{vagas}', 836, 378, 220, 34, fnt.t, 400, 28, pal.texto, { alinhamento: 'center', autoFit: true }),
          mkTxt('Vagas lbl', 'Vagas', 836, 418, 220, 18, fnt.t, 400, 12, pal.texto, { alinhamento: 'center', opacidade: 0.62 }),
          mkLinha('Linha inf', 72, 456, 1008, pal.secundaria, 1),
          mkTxt('Destaques título', 'Destaques', 72, 480, 1008, 34, fnt.s, 400, 28, pal.destaque, { alinhamento: 'center' }),
          mkTxt('Destaques', '{destaques}', 256, 518, 640, 88, fnt.t, 400, 15, pal.texto, { alinhamento: 'center', entrelinha: 1.55, autoFit: true })
        ]
      };
    case 'foto':
      return {
        id: uid('sl'),
        nome: 'Foto grande',
        tipo: 'foto',
        fundo: pal.fundo,
        camadas: [
          mkFoto('Foto destaque', 72, 72, 1008, 432, 1),
          mkTxt('Nome', '{nome}', 72, 522, 1008, 40, fnt.s, 400, 32, pal.texto, { alinhamento: 'center' }),
          mkTxt('Localização', '{localizacao}', 72, 566, 1008, 22, fnt.t, 400, 13, pal.texto, { alinhamento: 'center', opacidade: 0.62 })
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
          mkTxt('Descrição', '{descricao}', 528, 72, 540, 504, fnt.b, 400, 14, pal.texto, { entrelinha: 1.75, autoFit: true })
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
          mkTxt('Legenda QR', LEG_QR, 36, 434, 348, 24, fnt.t, 400, 12, pal['sobre-principal'], { alinhamento: 'center' }),
          mkTxt('Corretor', '{corretor}', 492, 190, 588, 114, fnt.s, 400, 68, pal.texto, { autoFit: true }),
          mkLinha('Hairline', 492, 326, 280, pal.secundaria, 1),
          mkTxt('CRECI', '{creci}', 492, 348, 588, 22, fnt.t, 400, 12, pal.texto, { opacidade: 0.62 }),
          mkTxt('Telefone', '{telefone}', 492, 388, 588, 42, fnt.t, 400, 32, pal.texto),
          mkTxt('E-mail', '{email}', 492, 444, 588, 26, fnt.t, 400, 15, pal.texto, { autoFit: true }),
          mkTxt('Rodapé', '{rodape}', 492, 576, 588, 20, fnt.t, 400, 11, pal.texto, { opacidade: 0.55 })
        ]
      };
    default:
      return { id: uid('sl'), nome: 'Página em branco', tipo: 'livre', fundo: pal.fundo, camadas: [] };
  }
}

function construirSlideDoModelo(modeloId, tipoSlide, pal, fnt) {
  switch (modeloId) {
    case 'B':
      return slideB(tipoSlide, pal, fnt);
    case 'D':
      return slideD(tipoSlide, pal, fnt);
    case 'E':
      return slideE(tipoSlide, pal, fnt);
    case 'F':
      return slideF(tipoSlide, pal, fnt);
    case 'A':
    default:
      return slideA(tipoSlide, pal, fnt);
  }
}

/**
 * Cria um único slide pronto para o modelo/tipo especificado (`capa`, `resumo`, `foto`, `galeria`, `texto`, `contato`, `livre`).
 */
function criarSlideModelo(modeloId = 'A', tipoSlide = 'capa', paletaId = 'principal', kit = {}, opts = {}) {
  const mid = resolverModeloId(modeloId);
  const M = MODELOS[mid];
  const { pal } = resolverPaleta(M, paletaId, kit, opts);
  const fnt = resolverFontesModelo(M, kit);
  return construirSlideDoModelo(mid, String(tipoSlide || 'capa').toLowerCase(), pal, fnt);
}

/**
 * Gera cena editável JSON v1 completa para um modelo (A, B, D, E, F) e paleta (`principal` | `segunda`).
 */
function criarCenaModelo(modeloId = 'A', paletaId = 'principal', kit = {}, dados = null, opts = {}) {
  const mid = resolverModeloId(modeloId);
  const M = MODELOS[mid];
  const { pid, pal } = resolverPaleta(M, paletaId, kit, opts);
  const fnt = resolverFontesModelo(M, kit);

  const tipos = Array.isArray(opts.paginas) && opts.paginas.length
    ? opts.paginas.map(p => (typeof p === 'string' ? p : p?.tipo)).filter(Boolean).slice(0, 14)
    : PAGINAS_PADRAO;

  const slides = tipos.map(tp => construirSlideDoModelo(mid, String(tp).toLowerCase(), pal, fnt));

  return {
    versao: 1,
    modo: 'pdf',
    formato: '16:9',
    largura: W,
    altura: H,
    nome: M.nome,
    modeloBase: mid,
    paletaId: pid,
    paleta: [pal.fundo, pal.texto, pal.principal, pal.secundaria, pal.destaque],
    slides
  };
}

module.exports = {
  criarCenaModelo,
  criarSlideModelo,
  PAGINAS_PADRAO,
  COMPATIVEIS_MODELO
};
