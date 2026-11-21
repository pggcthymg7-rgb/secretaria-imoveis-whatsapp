/* ==========================================================================
 * BIGA STUDIO — Motor Visual Universal Konva.js (Schema JSON v1)
 * Compatível com CSP script-src 'self', Node vm sandbox, iOS Safari & Android.
 * Sem atributos inline em HTML, sem URLs temporárias em <img src>, sem escrita dinâmica em estado.
 * ========================================================================== */
(function (globalScope) {
  'use strict';

  // ------------------------------------------------------------------ Constantes & Utilidades Puras
  const TAM = {
    '16:9': [1152, 648, 'Apresentação 16:9'],
    feed: [1080, 1350, 'Feed 4:5'],
    quadrado: [1080, 1080, 'Quadrado 1:1'],
    story: [1080, 1920, 'Story 9:16']
  };

  const CAT_FONTES = {
    s: 'Sem serifa',
    r: 'Serifada',
    d: 'Display',
    h: 'Manuscrita',
    m: 'Monoespaçada'
  };

  const PALETA_PADRAO = [
    '#ffffff', '#171721', '#5266eb', '#ededf3',
    '#d4af37', '#0d0d0d', '#0f3d2e', '#b8452e'
  ];

  const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

  const CAMPOS_EDITAVEIS = new Set([
    'nome', 'x', 'y', 'w', 'h', 'rot', 'skewX', 'skewY', 'opacidade',
    'visivel', 'travada', 'texto', 'campoVinculadoAnterior',
    'fonte', 'peso', 'italico', 'tamanho', 'cor', 'alinhamento',
    'entrelinha', 'espacamento', 'escalaX', 'escalaY', 'maiusculas',
    'autoFit', 'ancora', 'sombra', 'corSombra', 'contorno', 'corContorno',
    'fundo', 'corFundo', 'raioFundo', 'folga', 'bordaFundo', 'corBordaFundo',
    'indiceFoto', 'fotoCustom', 'zoom', 'offX', 'offY',
    'brilho', 'contraste', 'saturacao', 'desfoque', 'raio', 'raios',
    'borda', 'corBorda', 'blurFundo',
    'pontos', 'espessura', 'tracejado', 'ponta',
    'cor1', 'cor2', 'angulo',
    'vertices', 'iconeId', 'formaFundo', 'origem', 'src', 'forma', 'corTexto', 'ocultarSemLogo',
    'url', 'corEscuro', 'corClaro', 'margem'
  ]);

  const uid = () => Math.random().toString(36).slice(2, 10);

  const copia = o => JSON.parse(JSON.stringify(o));

  const clamp = (v, a, b) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return a;
    return Math.min(b, Math.max(a, n));
  };

  const esc = s =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const safeFont = f => (/^[A-Za-z0-9 ]{1,60}$/.test(String(f || '')) ? String(f) : 'Inter');

  const safeHex = (h, fallback = '#ffffff') => (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(String(h || '').trim()) ? String(h).trim().toLowerCase() : fallback);

  function safeImgSrc(src) {
    const s = String(src || '').trim();
    if (!s) return '';
    if (/^\/fotos\/[^"'<>\\]+$/i.test(s)) return s;
    if (/^\/assets\/[^"'<>\\]+$/i.test(s)) return s;
    if (/^https?:\/\/[^"'<>\\\s]+$/i.test(s)) return s;
    if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(s)) return s;
    return '';
  }

  function hexRgba(h) {
    const m = String(h || '').trim().match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (!m) return 'rgba(0,0,0,0)';
    const n = parseInt(m[1], 16);
    const a = m[2] ? parseInt(m[2], 16) / 255 : 1;
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
  }

  function hexAlpha(h) {
    const m = String(h || '').trim().match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (!m) return 0;
    return m[2] ? parseInt(m[2], 16) / 255 : 1;
  }

  function hexRgb(h) {
    const m = String(h || '').trim().match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (!m) return { r: 0, g: 0, b: 0, a: 0 };
    const n = parseInt(m[1], 16);
    return {
      r: (n >> 16) & 255,
      g: (n >> 8) & 255,
      b: n & 255,
      a: m[2] ? parseInt(m[2], 16) / 255 : 1
    };
  }

  function construirParadasDegrade(cor1Hex, cor2Hex) {
    const p1 = hexRgb(cor1Hex || '#00000000');
    const p2 = hexRgb(cor2Hex || '#000000cc');
    let r1 = p1.r, g1 = p1.g, b1 = p1.b, a1 = p1.a;
    let r2 = p2.r, g2 = p2.g, b2 = p2.b, a2 = p2.a;
    if (a1 <= 0.001 && a2 > 0.001) { r1 = r2; g1 = g2; b1 = b2; }
    else if (a2 <= 0.001 && a1 > 0.001) { r2 = r1; g2 = g1; b2 = b1; }
    const rgba = (r, g, b, a) => `rgba(${r},${g},${b},${clamp(a, 0, 1).toFixed(3)})`;
    if (a1 <= 0.001 && a2 > 0.001) {
      return [
        0, rgba(r1, g1, b1, 0),
        0.25, rgba(r2, g2, b2, a2 * 0.14),
        0.5, rgba(r2, g2, b2, a2 * 0.44),
        0.75, rgba(r2, g2, b2, a2 * 0.78),
        1, rgba(r2, g2, b2, a2)
      ];
    }
    if (a2 <= 0.001 && a1 > 0.001) {
      return [
        0, rgba(r1, g1, b1, a1),
        0.25, rgba(r1, g1, b1, a1 * 0.78),
        0.5, rgba(r1, g1, b1, a1 * 0.44),
        0.75, rgba(r1, g1, b1, a1 * 0.14),
        1, rgba(r2, g2, b2, 0)
      ];
    }
    return [0, rgba(r1, g1, b1, a1), 1, rgba(r2, g2, b2, a2)];
  }

  function hexParaHsv(hex) {
    const m = String(hex || '').trim().match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i) || ['', 'ffffff', 'ff'];
    const n = parseInt(m[1], 16);
    const r = (n >> 16) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const d = mx - mn;
    let h = 0;
    if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: ((h * 60) + 360) % 360, s: mx ? d / mx : 0, v: mx, a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
  }

  function hsvParaHex(hsv) {
    const h = Number(hsv && hsv.h) || 0;
    const s = clamp(hsv && hsv.s, 0, 1);
    const v = clamp(hsv && hsv.v, 0, 1);
    const a = hsv && hsv.a !== undefined ? clamp(hsv.a, 0, 1) : 1;
    const f = n => {
      const k = (n + h / 60) % 6;
      return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
    };
    const hx = n => n.toString(16).padStart(2, '0');
    return `#${hx(f(5))}${hx(f(3))}${hx(f(1))}${a < 0.999 ? hx(Math.round(a * 255)) : ''}`;
  }

  const brl = v => (Number(v) ? `R$ ${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : 'Consulte');

  function formatarFone(fone) {
    const n = String(fone || '').replace(/\D/g, '');
    if (n.length === 13 && n.startsWith('55')) return `(${n.slice(2, 4)}) ${n.slice(4, 9)}-${n.slice(9)}`;
    if (n.length === 12 && n.startsWith('55')) return `(${n.slice(2, 4)}) ${n.slice(4, 8)}-${n.slice(8)}`;
    if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
    if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
    return String(fone || '').trim();
  }

  function waLink(fone) {
    let n = String(fone || '').replace(/\D/g, '');
    if (n.length < 10) return '';
    if (!n.startsWith('55') || n.length <= 11) n = '55' + n;
    return `https://wa.me/${n}`;
  }

  function fotosDe(p) {
    if (!p) return [];
    const list = Array.isArray(p.fotos) ? p.fotos : String(p.fotos || '').split(/[,;\n]/);
    return list.map(x => String(x || '').trim()).filter(Boolean);
  }

  function rad(deg) {
    return (Number(deg) || 0) * Math.PI / 180;
  }

  // ------------------------------------------------------------------ Catálogo ICONES_SVG (viewBox 0 0 24 24)
  const ICONES_SVG = {
    quarto: {
      label: 'Quarto',
      path: 'M3 7v11h2v-3h14v3h2V11a3 3 0 0 0-3-3H10v5H5V7H3zm4.5 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'
    },
    banheiro: {
      label: 'Banheiro',
      path: 'M7 7a2 2 0 0 1 4 0v1h2v1H3v4a5 5 0 0 0 4 4.9V20h2v-2h6v2h2v-2.1A5 5 0 0 0 21 13v-2H9V7a1 1 0 0 1 2 0h2a3 3 0 0 0-6 0z'
    },
    suite: {
      label: 'Suíte',
      path: 'M12 2l2.2 4.4 4.8.7-3.5 3.4.8 4.8-4.3-2.3-4.3 2.3.8-4.8L5 7.1l4.8-.7L12 2zM3 16h18v4h-2v-2H5v2H3v-4z'
    },
    vaga: {
      label: 'Vaga',
      path: 'M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11v7h-2v-2H7v2H5v-7zm2.8-4l-.9 2.8h10.2L16.2 7H7.8zM7.5 14a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4zm9 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z'
    },
    area: {
      label: 'Área m²',
      path: 'M3 3h8v2H5v6H3V3zm10 0h8v8h-2V5h-6V3zM3 13h2v6h6v2H3v-8zm16 0h2v8h-8v-2h6v-6zM8 8h8v8H8V8zm2 2v4h4v-4h-4z'
    },
    terreno: {
      label: 'Terreno',
      path: 'M4 5l8-3 8 3v14l-8 3-8-3V5zm2 1.4v11.2l6 2.2 6-2.2V6.4l-6-2.2-6 2.2zM8 10h8v2H8v-2zm0 4h5v2H8v-2z'
    },
    pin: {
      label: 'Localização',
      path: 'M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z'
    },
    casa: {
      label: 'Casa',
      path: 'M12 3l9 7.5V21h-6v-6H9v6H3V10.5L12 3z'
    },
    predio: {
      label: 'Edifício',
      path: 'M4 21V5l8-3 8 3v16h-6v-4h-4v4H4zm4-13v2h2V8H8zm6 0v2h2V8h-2zm-6 4v2h2v-2H8zm6 0v2h2v-2h-2z'
    },
    chave: {
      label: 'Chave',
      path: 'M12.6 10A5.5 5.5 0 1 0 7 15.5c2.4 0 4.4-1.5 5.2-3.5H16v3h3v-3h2v-2h-8.4zM7 13.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4z'
    },
    sol: {
      label: 'Sol / Nascente',
      path: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm-1-5h2v3h-2V2zm0 17h2v3h-2v-3zM2 11h3v2H2v-2zm17 0h3v2h-3v-2zM4.9 5.6l1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1zm10.6 10.6l1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1zm2.1-10.6l-2.1 2.1-1.4-1.4 2.1-2.1 1.4 1.4zM7 16.2l-2.1 2.1-1.4-1.4 2.1-2.1 1.4 1.4z'
    },
    piscina: {
      label: 'Piscina / Lazer',
      path: 'M7 14v-2h10v2h2V7a3 3 0 0 0-3-3h-1v2h1a1 1 0 0 1 1 1v3H7V7a1 1 0 0 1 1-1h1V4H8a3 3 0 0 0-3 3v7h2zm-4 4c1.3 0 2-.7 3-.7s1.7.7 3 .7 2-.7 3-.7 1.7.7 3 .7 2-.7 3-.7 1.7.7 3 .7v-2c-1.3 0-2-.7-3-.7s-1.7.7-3 .7-2-.7-3-.7-1.7.7-3 .7-2-.7-3-.7-1.7.7-3 .7v2z'
    },
    estrela: {
      label: 'Destaque',
      path: 'M12 2l2.9 6.1 6.7.9-4.9 4.7 1.2 6.7L12 17.2 6.1 20.4l1.2-6.7L2.4 9l6.7-.9L12 2z'
    },
    check: {
      label: 'Confirmado',
      path: 'M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z'
    },
    whatsapp: {
      label: 'WhatsApp',
      path: 'M12 2a9.9 9.9 0 0 0-8.6 14.9L2 22l5.3-1.4A10 10 0 1 0 12 2zm5.2 14.1c-.2.6-1.3 1.2-1.8 1.3-.5.1-1.1.1-1.8-.1-.4-.1-1-.3-1.7-.6-3-1.3-5-4.3-5.1-4.5-.2-.2-1.2-1.6-1.2-3 0-1.5.7-2.2 1-2.5.3-.3.6-.4.8-.4h.6c.2 0 .4-.1.7.5.2.6.8 2 .9 2.1.1.2.1.3 0 .5-.1.2-.2.3-.3.5-.2.2-.3.4-.5.5-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1.1 2.2 1.4 2.5 1.6.3.1.5.1.7-.1.2-.2.8-.9 1-1.2.2-.3.4-.3.7-.2.3.1 1.8.8 2.1 1 .3.2.5.2.6.4.1.2.1.9-.1 1.5z'
    },
    telefone: {
      label: 'Telefone',
      path: 'M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1l-2.2 1.9z'
    },
    seta: {
      label: 'Seta',
      path: 'M4 11h12.2l-4.6-4.6L13 5l7 7-7 7-1.4-1.4 4.6-4.6H4v-2z'
    },
    'selo-exclusivo': {
      label: 'Selo Exclusivo',
      path: 'M12 2l2.4 2.3 3.3-.5 1 3.2 3.1 1.3-.9 3.2 1.7 2.9-2.5 2.2.1 3.3-3.2.7-1.5 3-3.1-1.1-3.1 1.1-1.5-3-3.2-.7.1-3.3-2.5-2.2 1.7-2.9-.9-3.2L6.3 7l1-3.2 3.3.5L12 2zm0 5.5L10.6 10.4 7.4 10.9l2.3 2.2-.5 3.2 2.8-1.5 2.8 1.5-.5-3.2 2.3-2.2-3.2-.5L12 7.5z'
    },
    'selo-novo': {
      label: 'Selo Novo',
      path: 'M12 2l3 5.5 6 1-4.2 4.5.9 6L12 16.5 6.3 19l.9-6L3 8.5l6-1L12 2zm-3 8.5v4h1.3v-2.2l1.8 2.2h1.2v-4H12v2.2l-1.8-2.2H9z'
    },
    'selo-vendido': {
      label: 'Selo Vendido',
      path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.2 14.2L6.5 12l1.4-1.4 2.9 2.9 5.3-5.3 1.4 1.4-6.7 6.6z'
    },
    'selo-oportunidade': {
      label: 'Selo Oportunidade',
      path: 'M13 2L4 14h7l-1 8 10-12h-7l0-8z'
    },
    'switch-on': {
      label: 'Ligado',
      path: 'M7 7h10a5 5 0 0 1 0 10H7A5 5 0 0 1 7 7zm10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'
    },
    'switch-off': {
      label: 'Desligado',
      path: 'M7 7h10a5 5 0 0 1 0 10H7A5 5 0 0 1 7 7zm0 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'
    }
  };

  function svgIconeHtml(id, size = 18, cls = '') {
    const ic = Object.prototype.hasOwnProperty.call(ICONES_SVG, id) ? ICONES_SVG[id] : ICONES_SVG.estrela;
    return `<svg class="${esc(cls)}" viewBox="0 0 24 24" width="${Number(size) || 18}" height="${Number(size) || 18}" fill="currentColor" aria-hidden="true"><path d="${esc(ic.path)}"/></svg>`;
  }

  // ------------------------------------------------------------------ Campos Inteligentes & Tokens
  const CAMPOS_INTELIGENTES = [
    { token: '{nome}', label: 'Nome/Edifício', icone: 'predio', cat: 'Imóvel', exemplo: 'Residencial Metropolitan' },
    { token: '{nomeKicker}', label: 'Prefixo do nome', icone: 'predio', cat: 'Imóvel', exemplo: 'Jardim' },
    { token: '{nomeDestaque}', label: 'Destaque do nome', icone: 'predio', cat: 'Imóvel', exemplo: 'Veneza' },
    { token: '{tipo}', label: 'Tipo', icone: 'casa', cat: 'Imóvel', exemplo: 'Apartamento' },
    { token: '{negociacao}', label: 'Negociação', icone: 'chave', cat: 'Imóvel', exemplo: 'Venda' },
    { token: '{preco}', label: 'Preço', icone: 'estrela', cat: 'Valores', exemplo: 'R$ 890.000' },
    { token: '{precoRotulo}', label: 'Rótulo preço/Ágio', icone: 'selo-oportunidade', cat: 'Valores', exemplo: 'Venda' },
    { token: '{bairro}', label: 'Bairro', icone: 'pin', cat: 'Localização', exemplo: 'Setor Bueno' },
    { token: '{cidade}', label: 'Cidade', icone: 'pin', cat: 'Localização', exemplo: 'Goiânia' },
    { token: '{localizacao}', label: 'Bairro, Cidade', icone: 'pin', cat: 'Localização', exemplo: 'Setor Bueno, Goiânia' },
    { token: '{area}', label: 'Área construída', icone: 'area', cat: 'Medidas', exemplo: '112 m²' },
    { token: '{areaTotal}', label: 'Área total/Terreno', icone: 'terreno', cat: 'Medidas', exemplo: '360 m²' },
    { token: '{quartos}', label: 'Quartos', icone: 'quarto', cat: 'Medidas', exemplo: '3' },
    { token: '{suites}', label: 'Suítes', icone: 'suite', cat: 'Medidas', exemplo: '2' },
    { token: '{vagas}', label: 'Vagas', icone: 'vaga', cat: 'Medidas', exemplo: '2' },
    { token: '{destaques}', label: 'Destaques', icone: 'check', cat: 'Detalhes', exemplo: 'Varanda gourmet · Lazer completo' },
    { token: '{descricao}', label: 'Descrição', icone: 'selo-novo', cat: 'Detalhes', exemplo: 'Apartamento nascente com vista livre...' },
    { token: '{codigo}', label: 'Código', icone: 'selo-exclusivo', cat: 'Imóvel', exemplo: '#104' },
    { token: '{marca}', label: 'Nome da Marca', icone: 'estrela', cat: 'Marca & Contato', exemplo: 'BIGA' },
    { token: '{corretor}', label: 'Corretor', icone: 'chave', cat: 'Marca & Contato', exemplo: 'João Gabriel' },
    { token: '{creci}', label: 'CRECI', icone: 'check', cat: 'Marca & Contato', exemplo: 'CRECI 32410' },
    { token: '{telefone}', label: 'Telefone/WhatsApp', icone: 'whatsapp', cat: 'Marca & Contato', exemplo: '(62) 99999-0000' },
    { token: '{email}', label: 'E-mail', icone: 'telefone', cat: 'Marca & Contato', exemplo: 'contato@biga.com.br' },
    { token: '{rodape}', label: 'Rodapé', icone: 'selo-vendido', cat: 'Marca & Contato', exemplo: 'Valores sujeitos a alteração.' }
  ];

  const TOKENS_CONHECIDOS = new Map(CAMPOS_INTELIGENTES.map(c => [c.token, c]));

  function separarNomeKickerDestaque(nome) {
    const s = String(nome || '').trim();
    if (!s) return { kicker: '', destaque: '' };
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length <= 1) return { kicker: '', destaque: s };
    const last = words[words.length - 1];
    if (last.length <= 2 && words.length >= 3) {
      return {
        kicker: words.slice(0, -2).join(' '),
        destaque: words.slice(-2).join(' ')
      };
    }
    return {
      kicker: words.slice(0, -1).join(' '),
      destaque: last
    };
  }

  function resolverVariaveis(prop, kit, fichaOverride) {
    const p = prop || {};
    const k = kit || {};
    const f = fichaOverride || {};

    const negRaw = String(p.negociacao || 'VENDA').trim().toUpperCase();
    const negLabels = new Map([
      ['VENDA', 'Venda'],
      ['AGIO', 'Ágio'],
      ['ALUGUEL', 'Aluguel'],
      ['VENDA_ALUGUEL', 'Venda ou aluguel']
    ]);
    const negociacao = negLabels.get(negRaw) || (p.negociacao ? String(p.negociacao) : 'Venda');
    const tipo = p.tipo ? String(p.tipo) : 'Imóvel';
    const bairro = p.setor ? String(p.setor) : '';
    const cidade = p.cidade ? String(p.cidade) : (prop ? 'Goiânia' : '');
    const localizacao = [bairro, cidade].filter(Boolean).join(', ');

    const nome = f.titulo
      ? String(f.titulo)
      : (p.edificio ? String(p.edificio) : (bairro ? `${tipo} no ${bairro}` : tipo));
    const { kicker: nomeKicker, destaque: nomeDestaque } = separarNomeKickerDestaque(nome);

    let preco = '';
    let precoRotulo = negociacao;
    if (f.preco !== undefined && f.preco !== null && String(f.preco).trim() !== '') {
      preco = String(f.preco).trim();
      if (negRaw === 'AGIO' || /agio|ágio/i.test(preco)) precoRotulo = 'Ágio';
    } else if (negRaw === 'AGIO' && Number(p.valor_agio) > 0) {
      preco = brl(p.valor_agio);
      precoRotulo = 'Ágio';
    } else if (Number(p.valor) > 0) {
      preco = negRaw === 'ALUGUEL' ? `${brl(p.valor)}/mês` : brl(p.valor);
    } else {
      preco = 'Consulte';
    }

    const areaNum = p.tamanho_m2;
    const area = areaNum !== undefined && areaNum !== null && String(areaNum).trim() !== '' && Number(areaNum) !== 0
      ? (String(areaNum).includes('m²') ? String(areaNum) : `${areaNum} m²`)
      : '';
    const areaTotNum = p.area_terreno || p.tamanho_m2;
    const areaTotal = areaTotNum !== undefined && areaTotNum !== null && String(areaTotNum).trim() !== '' && Number(areaTotNum) !== 0
      ? (String(areaTotNum).includes('m²') ? String(areaTotNum) : `${areaTotNum} m²`)
      : '';

    const numStr = val => (val !== undefined && val !== null && String(val).trim() !== '' && Number(val) !== 0 ? String(val) : '');

    let destaques = '';
    if (f.destaques !== undefined && f.destaques !== null && String(f.destaques).trim() !== '') {
      destaques = String(f.destaques).trim();
    } else {
      const lista = [];
      if (String(p.aceita_permuta).toUpperCase() === 'SIM') lista.push('Aceita permuta');
      if (String(p.aceita_financiamento).toUpperCase() === 'SIM') lista.push('Aceita financiamento');
      if (String(p.lazer).toUpperCase() === 'SIM') lista.push('Área de lazer');
      if (p.mobiliado === 'SIM') lista.push('Mobiliado');
      else if (p.mobiliado === 'SEMI') lista.push('Com armários');
      if (p.caracteristicas) {
        String(p.caracteristicas).split(/[,;\n]/).map(s => s.trim()).filter(Boolean).forEach(s => lista.push(s));
      }
      destaques = lista.slice(0, 6).join(' · ');
    }

    const descricao = f.descricao !== undefined && f.descricao !== null
      ? String(f.descricao)
      : String(p.descricao || '');

    const codigo = p.id !== undefined && p.id !== null && String(p.id).trim() !== '' ? `#${p.id}` : '';
    const marca = k.marca ? String(k.marca) : 'BIGA';
    const corretor = f.corretor ? String(f.corretor) : (k.corretor ? String(k.corretor) : '');
    const creci = f.creci ? String(f.creci) : (k.creci ? String(k.creci) : '');
    const rawFone = f.telefone ? String(f.telefone) : (k.telefone ? String(k.telefone) : '');
    const telefone = formatarFone(rawFone);
    const email = f.email ? String(f.email) : (k.email ? String(k.email) : '');
    const rodape = f.rodape ? String(f.rodape) : (k.rodape ? String(k.rodape) : '');

    return {
      '{nome}': nome,
      '{nomeKicker}': nomeKicker,
      '{nomeDestaque}': nomeDestaque,
      '{tipo}': tipo,
      '{negociacao}': negociacao,
      '{preco}': preco,
      '{precoRotulo}': precoRotulo,
      '{bairro}': bairro,
      '{cidade}': cidade,
      '{localizacao}': localizacao,
      '{area}': area,
      '{areaTotal}': areaTotal,
      '{quartos}': numStr(p.quartos),
      '{suites}': numStr(p.suites),
      '{vagas}': numStr(p.vagas),
      '{destaques}': destaques,
      '{descricao}': descricao,
      '{codigo}': codigo,
      '{marca}': marca,
      '{corretor}': corretor,
      '{creci}': creci,
      '{telefone}': telefone,
      '{email}': email,
      '{rodape}': rodape
    };
  }

  function substituirTokens(texto, vars) {
    const mapa = vars && typeof vars === 'object' ? vars : {};
    const temToken = s => /\{[A-Za-z0-9_]+\}/.test(s);
    const resolverUm = s => String(s ?? '').replace(/\{[A-Za-z0-9_]+\}/g, token => {
      if (Object.prototype.hasOwnProperty.call(mapa, token)) return String(mapa[token] ?? '');
      if (TOKENS_CONHECIDOS.has(token)) return '';
      return token;
    });
    const limparVirgulas = s => s
      .replace(/\s*,\s*,\s*/g, ', ')
      .replace(/^\s*,\s*/, '')
      .replace(/\s*,\s*$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const linhas = String(texto ?? '').split('\n');
    const outLinhas = [];
    for (const linha of linhas) {
      if (!temToken(linha)) {
        outLinhas.push(linha);
        continue;
      }
      const parts = linha.split(/(\s+[·|•–—-]\s+|\s*[·|•]\s*)/);
      if (parts.length > 1) {
        const keptSegs = [];
        const seps = [];
        for (let i = 0; i < parts.length; i += 2) {
          const seg = parts[i];
          const sep = parts[i + 1] || '';
          if (!temToken(seg)) {
            const clean = limparVirgulas(seg);
            if (clean) {
              keptSegs.push(clean);
              seps.push(sep);
            }
          } else {
            const tks = seg.match(/\{[A-Za-z0-9_]+\}/g) || [];
            const algumPreenchido = tks.some(tk => resolverUm(tk).trim() !== '');
            if (algumPreenchido) {
              const resolvedSeg = limparVirgulas(resolverUm(seg));
              if (resolvedSeg) {
                keptSegs.push(resolvedSeg);
                seps.push(sep);
              }
            }
          }
        }
        if (keptSegs.length) {
          let joined = keptSegs[0];
          for (let j = 1; j < keptSegs.length; j++) {
            const rawSep = seps[j - 1] || ' · ';
            const sepNorm = /^\s+$/.test(rawSep) ? ' · ' : ` ${rawSep.trim()} `;
            joined += sepNorm + keptSegs[j];
          }
          outLinhas.push(joined);
        }
      } else {
        const tks = linha.match(/\{[A-Za-z0-9_]+\}/g) || [];
        const algumPreenchido = tks.some(tk => resolverUm(tk).trim() !== '');
        if (algumPreenchido) {
          const resolved = limparVirgulas(resolverUm(linha));
          if (resolved) outLinhas.push(resolved);
        }
      }
    }
    return outLinhas.join('\n');
  }

  function detectarCampoVinculado(texto) {
    const s = String(texto || '');
    const matches = s.match(/\{[A-Za-z0-9_]+\}/g);
    if (!matches || !matches.length) return null;
    const labels = [];
    for (const tk of matches) {
      const info = TOKENS_CONHECIDOS.get(tk);
      if (info && !labels.includes(info.label)) labels.push(info.label);
    }
    if (!labels.length) return null;
    return labels.length === 1 ? labels[0] : labels.join(' · ');
  }

  // ------------------------------------------------------------------ Fontes Google (1.800+)
  let FONTES_CACHE = null;
  const fontesCarregadas = new Set();
  const folhasFontes = new Map();

  async function listaFontes() {
    if (FONTES_CACHE) return FONTES_CACHE;
    try {
      if (typeof fetch !== 'function') throw new Error('no-fetch');
      const r = await fetch('/assets/fontes-google.json', { credentials: 'same-origin' });
      if (!r.ok) throw new Error('erro fontes');
      const j = await r.json();
      if (!Array.isArray(j.familias)) throw new Error('formato invalido');
      FONTES_CACHE = j.familias;
    } catch {
      FONTES_CACHE = [
        ['Inter', 's', [300, 400, 500, 600, 700, 800]],
        ['Plus Jakarta Sans', 's', [400, 500, 600, 700, 800]],
        ['Playfair Display', 'r', [400, 500, 600, 700, 800]],
        ['Montserrat', 's', [300, 400, 500, 600, 700, 800]],
        ['Jost', 's', [300, 400, 500, 600, 700]],
        ['Cormorant Garamond', 'r', [400, 500, 600, 700]],
        ['Lora', 'r', [400, 500, 600, 700]],
        ['Bodoni Moda', 'r', [400, 500, 600, 700]]
      ];
    }
    return FONTES_CACHE;
  }

  function pesosDe(fam) {
    const lista = FONTES_CACHE || [];
    const hit = lista.find(f => f[0] === fam);
    return hit && Array.isArray(hit[2]) && hit[2].length ? hit[2] : [400, 700];
  }

  function linkFonte(href) {
    if (typeof document === 'undefined' || !document.head) return Promise.resolve(false);
    if (folhasFontes.has(href)) return folhasFontes.get(href);
    const p = new Promise(res => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      let settled = false;
      const done = ok => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        if (!ok) {
          folhasFontes.delete(href);
          l.remove();
        }
        res(ok);
      };
      const t = setTimeout(() => done(false), 8000);
      l.onload = () => done(true);
      l.onerror = () => done(false);
      document.head.appendChild(l);
    });
    folhasFontes.set(href, p);
    return p;
  }

  const famUrl = fam => encodeURIComponent(fam).replace(/%20/g, '+');

  async function carregarFonte(fam, peso = 400, italico = false) {
    const safeFam = safeFont(fam);
    if (!safeFam || /^(sans-serif|serif|monospace)$/i.test(safeFam)) return false;
    if (typeof document === 'undefined') return false;
    await listaFontes();
    const ps = pesosDe(safeFam).filter(w => w >= 100 && w <= 1000);
    const pesosStr = ps.length ? ps.join(';') : '400;700';
    // Só pede ital,wght quando itálico está ativo (evita HTTP 400 em famílias sem itálico)
    let ok = false;
    if (italico) {
      const combos = [0, 1].flatMap(i => (ps.length ? ps : [400, 700]).map(w => `${i},${w}`)).join(';');
      ok = await linkFonte(`https://fonts.googleapis.com/css2?family=${famUrl(safeFam)}:ital,wght@${combos}&display=swap`);
    }
    if (!ok) {
      ok = await linkFonte(`https://fonts.googleapis.com/css2?family=${famUrl(safeFam)}:wght@${pesosStr}&display=swap`);
    }
    fontesCarregadas.add(safeFam);
    try {
      if (document.fonts && typeof document.fonts.load === 'function') {
        await document.fonts.load(`${italico ? 'italic ' : ''}${peso || 400} 48px "${safeFam}"`);
      }
    } catch {}
    return ok;
  }

  function previaFonte(fam) {
    const safeFam = safeFont(fam);
    return linkFonte(`https://fonts.googleapis.com/css2?family=${famUrl(safeFam)}&text=${encodeURIComponent(safeFam)}&display=swap`);
  }

  // ------------------------------------------------------------------ Cache de Imagens, QR & Filtros Cross-browser
  const MAX_CACHE_IMG = 100;
  const cacheImg = new Map();

  function carregarImagem(src) {
    const safe = safeImgSrc(src);
    if (!safe || typeof Image === 'undefined') return Promise.resolve(null);
    if (cacheImg.has(safe)) return cacheImg.get(safe);
    if (cacheImg.size >= MAX_CACHE_IMG) {
      const oldest = cacheImg.keys().next().value;
      if (oldest !== undefined) cacheImg.delete(oldest);
    }
    const p = new Promise(res => {
      const img = new Image();
      if (/^https?:/i.test(safe) && typeof location !== 'undefined' && !safe.startsWith(location.origin)) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => res(img);
      img.onerror = () => {
        cacheImg.delete(safe);
        res(null);
      };
      img.src = safe;
    });
    cacheImg.set(safe, p);
    return p;
  }

  const cacheQr = new Map();

  function gerarMatrizQrFallback(texto) {
    const size = 25;
    const mat = Array.from({ length: size }, () => new Uint8Array(size));
    const drawFinder = (ox, oy) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const border = r === 0 || r === 6 || c === 0 || c === 6;
          const center = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          mat[oy + r][ox + c] = border || center ? 1 : 0;
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(size - 7, 0);
    drawFinder(0, size - 7);
    for (let i = 8; i < size - 8; i++) {
      mat[6][i] = i % 2 === 0 ? 1 : 0;
      mat[i][6] = i % 2 === 0 ? 1 : 0;
    }
    let h = 2166136261;
    const s = String(texto || 'https://wa.me/');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const inFinder = (r < 8 && c < 8) || (r < 8 && c >= size - 8) || (r >= size - 8 && c < 8);
        if (inFinder || r === 6 || c === 6) continue;
        h ^= (r * 31 + c * 17);
        h = Math.imul(h, 16777619);
        mat[r][c] = (h >>> 31) & 1;
      }
    }
    return mat;
  }

  function normalizarMatrizQr(payload) {
    if (!payload) return null;
    if (Array.isArray(payload.matrix) && payload.matrix.length) return payload.matrix;
    const mod = payload.modules || payload.modulos || payload;
    if (mod && Number(mod.size) > 0 && mod.data) {
      const n = Number(mod.size);
      const out = [];
      for (let r = 0; r < n; r++) {
        const row = [];
        for (let c = 0; c < n; c++) row.push(mod.data[r * n + c] ? 1 : 0);
        out.push(row);
      }
      return out;
    }
    return null;
  }

  async function obterMatrizQr(url) {
    const key = String(url || '').trim() || 'https://wa.me/';
    if (cacheQr.has(key)) return cacheQr.get(key);
    const p = (async () => {
      try {
        if (typeof fetch === 'function') {
          const r = await fetch(`/api/pdf/qr?url=${encodeURIComponent(key)}`, {
            credentials: 'same-origin',
            headers: { 'x-secretaria': '1' }
          });
          if (r.ok) {
            const j = await r.json();
            const mat = normalizarMatrizQr(j);
            if (mat) return mat;
          }
        }
      } catch {}
      return gerarMatrizQrFallback(key);
    })();
    if (cacheQr.size > 60) {
      const oldest = cacheQr.keys().next().value;
      if (oldest !== undefined) cacheQr.delete(oldest);
    }
    cacheQr.set(key, p);
    return p;
  }

  // Blur rápido cross-browser via box blur 3 passagens em ImageData
  function aplicarBoxBlur(data, w, h, radius) {
    const r = Math.min(24, Math.max(1, Math.round(radius)));
    const temp = new Uint8ClampedArray(data.length);
    const div = r * 2 + 1;
    for (let pass = 0; pass < 2; pass++) {
      // Horizontal
      for (let y = 0; y < h; y++) {
        let sr = 0, sg = 0, sb = 0, sa = 0;
        const row = y * w * 4;
        for (let ix = -r; ix <= r; ix++) {
          const cx = clamp(ix, 0, w - 1) * 4;
          sr += data[row + cx];
          sg += data[row + cx + 1];
          sb += data[row + cx + 2];
          sa += data[row + cx + 3];
        }
        for (let x = 0; x < w; x++) {
          const idx = row + x * 4;
          temp[idx] = sr / div;
          temp[idx + 1] = sg / div;
          temp[idx + 2] = sb / div;
          temp[idx + 3] = sa / div;
          const prevX = clamp(x - r, 0, w - 1) * 4;
          const nextX = clamp(x + r + 1, 0, w - 1) * 4;
          sr += data[row + nextX] - data[row + prevX];
          sg += data[row + nextX + 1] - data[row + prevX + 1];
          sb += data[row + nextX + 2] - data[row + prevX + 2];
          sa += data[row + nextX + 3] - data[row + prevX + 3];
        }
      }
      // Vertical
      for (let x = 0; x < w; x++) {
        let sr = 0, sg = 0, sb = 0, sa = 0;
        for (let iy = -r; iy <= r; iy++) {
          const cy = clamp(iy, 0, h - 1) * w * 4 + x * 4;
          sr += temp[cy];
          sg += temp[cy + 1];
          sb += temp[cy + 2];
          sa += temp[cy + 3];
        }
        for (let y = 0; y < h; y++) {
          const idx = y * w * 4 + x * 4;
          data[idx] = sr / div;
          data[idx + 1] = sg / div;
          data[idx + 2] = sb / div;
          data[idx + 3] = sa / div;
          const prevY = clamp(y - r, 0, h - 1) * w * 4 + x * 4;
          const nextY = clamp(y + r + 1, 0, h - 1) * w * 4 + x * 4;
          sr += temp[nextY] - temp[prevY];
          sg += temp[nextY + 1] - temp[prevY + 1];
          sb += temp[nextY + 2] - temp[prevY + 2];
          sa += temp[nextY + 3] - temp[prevY + 3];
        }
      }
    }
  }

  function aplicarFiltrosPixels(canvas, brilho, contraste, saturacao, desfoque) {
    const b = (Number(brilho ?? 100)) / 100;
    const ct = (Number(contraste ?? 100)) / 100;
    const st = (Number(saturacao ?? 100)) / 100;
    const blur = Number(desfoque) || 0;
    if (Math.abs(b - 1) < 0.005 && Math.abs(ct - 1) < 0.005 && Math.abs(st - 1) < 0.005 && blur <= 0.1) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;
      if (Math.abs(b - 1) >= 0.005 || Math.abs(ct - 1) >= 0.005 || Math.abs(st - 1) >= 0.005) {
        for (let i = 0; i < d.length; i += 4) {
          let r = d[i] * b;
          let g = d[i + 1] * b;
          let bl = d[i + 2] * b;
          if (Math.abs(ct - 1) >= 0.005) {
            r = (r - 128) * ct + 128;
            g = (g - 128) * ct + 128;
            bl = (bl - 128) * ct + 128;
          }
          if (Math.abs(st - 1) >= 0.005) {
            const lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
            r = lum + (r - lum) * st;
            g = lum + (g - lum) * st;
            bl = lum + (bl - lum) * st;
          }
          d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
          d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
          d[i + 2] = bl < 0 ? 0 : bl > 255 ? 255 : bl;
        }
      }
      if (blur > 0.1) aplicarBoxBlur(d, canvas.width, canvas.height, blur);
      ctx.putImageData(imgData, 0, 0);
    } catch {
      // Se imagem externa estiver tainted sem CORS, mantém renderização sem crash
    }
  }

  function caminhoRaios(ctx, x, y, w, h, raios) {
    const arr = Array.isArray(raios) && raios.length === 4 ? raios : [raios || 0, raios || 0, raios || 0, raios || 0];
    const maxR = Math.min(w, h) / 2;
    const tl = clamp(arr[0], 0, maxR);
    const tr = clamp(arr[1], 0, maxR);
    const br = clamp(arr[2], 0, maxR);
    const bl = clamp(arr[3], 0, maxR);
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    if (tr) ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
    else ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - br);
    if (br) ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    else ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + bl, y + h);
    if (bl) ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
    else ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + tl);
    if (tl) ctx.quadraticCurveTo(x, y, x + tl, y);
    else ctx.lineTo(x, y);
    ctx.closePath();
  }

  const MAX_CACHE_FOTO_OFFSCREEN = 40;
  const cacheFotoOffscreen = new Map();

  function obterRaiosCamada(c) {
    if (Array.isArray(c.raios) && c.raios.length === 4) return c.raios.map(v => Number(v) || 0);
    const r = Number(c.raio) || 0;
    return [r, r, r, r];
  }

  function construirCanvasFotoOffscreen(c, img, avisoSemFoto) {
    if (typeof document === 'undefined') return null;
    const w = Math.max(8, Math.round(Number(c.w) || 200));
    const h = Math.max(8, Math.round(Number(c.h) || 200));
    const raios = obterRaiosCamada(c);
    const key = [
      img ? img.src : 'none',
      avisoSemFoto || '',
      w, h,
      Number(c.zoom ?? 1).toFixed(3),
      Number(c.offX ?? 0).toFixed(3),
      Number(c.offY ?? 0).toFixed(3),
      Math.round(c.brilho ?? 100),
      Math.round(c.contraste ?? 100),
      Math.round(c.saturacao ?? 100),
      Math.round(c.desfoque ?? 0),
      raios.join(',')
    ].join('|');

    if (cacheFotoOffscreen.has(key)) return cacheFotoOffscreen.get(key);

    const cv = document.createElement('canvas');
    // Limita resolução offscreen de processamento para preservar memória em telas gigantes
    const ratio = Math.min(1, 1600 / Math.max(w, h));
    cv.width = Math.max(2, Math.round(w * ratio));
    cv.height = Math.max(2, Math.round(h * ratio));
    const ctx = cv.getContext('2d');
    const cw = cv.width;
    const ch = cv.height;

    if (img && img.complete && img.naturalWidth > 0) {
      const zoom = clamp(c.zoom ?? 1, 0.2, 6);
      const escCover = Math.max(cw / img.naturalWidth, ch / img.naturalHeight) * zoom;
      const iw = img.naturalWidth * escCover;
      const ih = img.naturalHeight * escCover;
      const sobraX = iw - cw;
      const sobraY = ih - ch;
      const dx = -sobraX / 2 + (clamp(c.offX ?? 0, -1, 1) * sobraX) / 2;
      const dy = -sobraY / 2 + (clamp(c.offY ?? 0, -1, 1) * sobraY) / 2;
      ctx.drawImage(img, dx, dy, iw, ih);
      aplicarFiltrosPixels(cv, c.brilho, c.contraste, c.saturacao, (Number(c.desfoque) || 0) * ratio);
    } else {
      const grad = ctx.createLinearGradient(0, 0, cw, ch);
      grad.addColorStop(0, '#272736');
      grad.addColorStop(1, '#1b1b26');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = 'rgba(237, 237, 243, 0.14)';
      ctx.lineWidth = Math.max(2, 2 * ratio);
      ctx.setLineDash([8 * ratio, 6 * ratio]);
      ctx.strokeRect(12 * ratio, 12 * ratio, cw - 24 * ratio, ch - 24 * ratio);
      ctx.setLineDash([]);
      ctx.fillStyle = '#c3c3cc';
      ctx.font = `600 ${Math.max(14, Math.round(Math.min(cw, ch) * 0.055))}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(avisoSemFoto || 'Sem foto do imóvel', cw / 2, ch / 2);
    }

    if (raios.some(v => v > 0)) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      caminhoRaios(ctx, 0, 0, cw, ch, raios.map(v => v * ratio));
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.restore();
    }

    if (cacheFotoOffscreen.size >= MAX_CACHE_FOTO_OFFSCREEN) {
      const oldest = cacheFotoOffscreen.keys().next().value;
      if (oldest !== undefined) cacheFotoOffscreen.delete(oldest);
    }
    cacheFotoOffscreen.set(key, cv);
    return cv;
  }

  // ------------------------------------------------------------------ Normalização Schema JSON v1
  function dimensoesDoc(doc) {
    if (!doc) return [1152, 648];
    if (Number(doc.largura) > 0 && Number(doc.altura) > 0) return [Number(doc.largura), Number(doc.altura)];
    const fmt = doc.formato || doc.tamanho || (doc.modo === 'pdf' ? '16:9' : 'feed');
    const hit = Object.prototype.hasOwnProperty.call(TAM, fmt) ? TAM[fmt] : null;
    return hit ? [hit[0], hit[1]] : [1152, 648];
  }

  function normalizarVerticesPoligono(vertices, w = 240, h = 180) {
    if (Array.isArray(vertices) && vertices.length === 4) {
      return vertices.map(v => {
        if (Array.isArray(v)) return { x: Number(v[0]) || 0, y: Number(v[1]) || 0 };
        if (v && typeof v === 'object') return { x: Number(v.x) || 0, y: Number(v.y) || 0 };
        return { x: 0, y: 0 };
      });
    }
    return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  }

  function normalizarCamada(c) {
    const out = copia(c || {});
    if (!out.id) out.id = uid();
    if (out.visivel === undefined) out.visivel = true;
    if (out.travada === undefined) out.travada = false;
    if (out.opacidade === undefined) out.opacidade = 1;
    if (out.rot === undefined) out.rot = 0;
    if (out.skewX === undefined) out.skewX = 0;
    if (out.skewY === undefined) out.skewY = 0;
    if (out.tipo === 'poligono') {
      out.vertices = normalizarVerticesPoligono(out.vertices, Number(out.w) || 240, Number(out.h) || 180);
    }
    return out;
  }

  function normalizarDoc(rawDoc, modoPadrao = 'capas') {
    const d = rawDoc ? copia(rawDoc) : {};
    const modo = d.modo || modoPadrao || (d.formato === '16:9' ? 'pdf' : 'capas');
    const formato = d.formato || d.tamanho || (modo === 'pdf' ? '16:9' : 'feed');
    const [W, H] = dimensoesDoc({ ...d, modo, formato });
    let slides = Array.isArray(d.slides) && d.slides.length
      ? d.slides
      : Array.isArray(d.paginas) && d.paginas.length && Array.isArray(d.paginas[0]?.camadas)
        ? d.paginas
        : [{
          id: d.id || 'slide-1',
          nome: d.nome || 'Capa',
          tipo: 'capa',
          fundo: d.fundo || '#171721',
          camadas: Array.isArray(d.camadas) ? d.camadas : []
        }];

    slides = slides.map((s, idx) => ({
      id: s.id || `slide-${idx + 1}`,
      nome: s.nome || `Página ${idx + 1}`,
      tipo: s.tipo || 'capa',
      fundo: s.fundo || d.fundo || '#171721',
      camadas: (Array.isArray(s.camadas) ? s.camadas : []).map(normalizarCamada)
    }));

    return {
      ...d,
      versao: 1,
      modo,
      formato,
      tamanho: d.tamanho || formato,
      largura: W,
      altura: H,
      paleta: Array.isArray(d.paleta) ? d.paleta : [],
      slides
    };
  }

  function criarSlideVazio(W, H, nome = 'Nova página', fundo = '#171721') {
    return {
      id: uid(),
      nome,
      tipo: 'custom',
      fundo,
      camadas: []
    };
  }

  function criarModeloPadrao(tipo, formato = 'feed') {
    const [W, H] = TAM[formato] || TAM.feed;
    const fotoBase = {
      id: uid(), tipo: 'foto', nome: 'Foto do imóvel', x: 0, y: 0, w: W, h: H,
      rot: 0, skewX: 0, skewY: 0, opacidade: 1, visivel: true, travada: false,
      zoom: 1, offX: 0, offY: 0, brilho: 100, contraste: 104, saturacao: 106, desfoque: 0, raio: 0, indiceFoto: 0
    };
    const mkTexto = (nome, texto, extra) => ({
      id: uid(), tipo: 'texto', nome, texto, x: Math.round(W * 0.066), y: 100, w: Math.round(W * 0.868), h: 90,
      rot: 0, skewX: 0, skewY: 0, opacidade: 1, visivel: true, travada: false,
      fonte: 'Inter', peso: 700, italico: false, tamanho: Math.round(W * 0.052),
      cor: '#ffffff', alinhamento: 'left', espacamento: 0, entrelinha: 1.1,
      escalaX: 1, escalaY: 1, maiusculas: false, autoFit: false, ancora: 'topo',
      sombra: 0, corSombra: '#000000', contorno: 0, corContorno: '#000000',
      fundo: false, corFundo: '#5266eb', raioFundo: 28, folga: 18,
      ...extra
    });

    if (tipo === 'faixa') {
      const fy = Math.round(H * 0.65);
      return {
        id: 'pronto-faixa',
        nome: 'Faixa elegante',
        doc: normalizarDoc({
          modo: formato === '16:9' ? 'pdf' : 'capas',
          formato,
          slides: [{
            id: uid(),
            nome: 'Capa',
            fundo: '#171721',
            camadas: [
              { ...fotoBase, h: fy },
              { id: uid(), tipo: 'retangulo', nome: 'Faixa', x: 0, y: fy, w: W, h: H - fy, rot: 0, skewX: 0, skewY: 0, opacidade: 1, visivel: true, travada: false, cor: '#171721', raio: 0, borda: 0, corBorda: '#ffffff' },
              { id: uid(), tipo: 'retangulo', nome: 'Filete', x: Math.round(W * 0.066), y: fy + Math.round(H * 0.03), w: 96, h: 5, rot: 0, skewX: 0, skewY: 0, opacidade: 1, visivel: true, travada: false, cor: '#d4af37', raio: 3, borda: 0, corBorda: '#ffffff' },
              mkTexto('Nome', '{nome}', { y: fy + Math.round(H * 0.055), fonte: 'Playfair Display', peso: 700, tamanho: Math.round(W * 0.062) }),
              mkTexto('Detalhes', '{bairro} · {quartos} qts · {area}', { y: H - Math.round(H * 0.145), fonte: 'Montserrat', peso: 500, tamanho: Math.round(W * 0.028), cor: '#c3c3cc' }),
              mkTexto('Preço', '{preco}', { y: H - Math.round(H * 0.095), fonte: 'Montserrat', peso: 800, tamanho: Math.round(W * 0.046), cor: '#d4af37' })
            ]
          }]
        })
      };
    }

    if (tipo === 'minimal') {
      return {
        id: 'pronto-minimal',
        nome: 'Minimalista',
        doc: normalizarDoc({
          modo: formato === '16:9' ? 'pdf' : 'capas',
          formato,
          slides: [{
            id: uid(),
            nome: 'Capa',
            fundo: '#ffffff',
            camadas: [
              fotoBase,
              { id: uid(), tipo: 'retangulo', nome: 'Moldura', x: 32, y: 32, w: W - 64, h: H - 64, rot: 0, skewX: 0, skewY: 0, opacidade: 1, visivel: true, travada: false, cor: '#00000000', raio: 0, borda: 4, corBorda: '#ffffff' },
              { id: uid(), tipo: 'degrade', nome: 'Sombra suave', x: 0, y: Math.round(H * 0.52), w: W, h: Math.round(H * 0.48), rot: 0, skewX: 0, skewY: 0, opacidade: 1, visivel: true, travada: false, cor1: '#00000000', cor2: '#000000bd', angulo: 180 },
              mkTexto('Nome', '{nome}', { y: Math.round(H * 0.72), h: 90, ancora: 'base', alinhamento: 'center', fonte: 'Cormorant Garamond', peso: 600, tamanho: Math.round(W * 0.074), italico: true }),
              mkTexto('Preço', '{preco}', { y: Math.round(H * 0.85), alinhamento: 'center', fonte: 'Inter', peso: 400, tamanho: Math.round(W * 0.036), espacamento: 5, maiusculas: true })
            ]
          }]
        })
      };
    }

    return {
      id: 'pronto-classico',
      nome: 'Clássico BIGA',
      doc: normalizarDoc({
        modo: formato === '16:9' ? 'pdf' : 'capas',
        formato,
        slides: [{
          id: uid(),
          nome: 'Capa',
          fundo: '#171721',
          camadas: [
            fotoBase,
            { id: uid(), tipo: 'degrade', nome: 'Degradê', x: 0, y: Math.round(H * 0.38), w: W, h: Math.round(H * 0.62) + 2, rot: 0, skewX: 0, skewY: 0, opacidade: 1, visivel: true, travada: false, cor1: '#00000000', cor2: '#000000e6', angulo: 180 },
            mkTexto('Selo', '{precoRotulo}', { x: W - Math.round(W * 0.066) - 210, y: Math.round(H * 0.05), w: 210, alinhamento: 'center', peso: 700, tamanho: Math.round(W * 0.024), espacamento: 3, maiusculas: true, fundo: true, corFundo: '#5266eb', folga: 14, raioFundo: 24 }),
            mkTexto('Local', '{tipo} · {bairro}', { y: Math.round(H * 0.68), peso: 600, tamanho: Math.round(W * 0.026), espacamento: 3, maiusculas: true, cor: '#ededf3' }),
            mkTexto('Nome', '{nome}', { y: Math.round(H * 0.74), h: 86, ancora: 'base', fonte: 'Playfair Display', peso: 700, tamanho: Math.round(W * 0.068), entrelinha: 1.06 }),
            mkTexto('Detalhes', '{quartos} quartos · {suites} suítes · {area} · {vagas} vagas', { y: Math.round(H * 0.81), peso: 500, tamanho: Math.round(W * 0.026), cor: '#ededf3' }),
            mkTexto('Preço', '{preco}', { y: Math.round(H * 0.87), w: Math.min(480, Math.round(W * 0.55)), peso: 800, tamanho: Math.round(W * 0.042), fundo: true, corFundo: '#5266eb', folga: 18, raioFundo: 24 })
          ]
        }]
      })
    };
  }

  // ------------------------------------------------------------------ Cálculo de Texto & AutoFit (compartilhado 2D + Konva)
  function textoResolvidoDe(c, vars) {
    let s = substituirTokens(c.texto || '', vars);
    if (c.maiusculas) s = s.toLocaleUpperCase('pt-BR');
    return s;
  }

  function calcularTamanhoAutoFit(c, texto, ctx2d) {
    const baseSize = Number(c.tamanho) || 40;
    if (!c.autoFit || !ctx2d) return baseSize;
    const pad = c.fundo ? (Number(c.folga) || 0) : 0;
    const maxW = Math.max(12, ((Number(c.w) || 200) - pad * 2) / (Number(c.escalaX) || 1));
    const maxH = Math.max(12, ((Number(c.h) || 80) - pad * 2) / (Number(c.escalaY) || 1));
    const lh = Number(c.entrelinha) || 1.15;
    const esp = Number(c.espacamento) || 0;
    const fam = safeFont(c.fonte);
    const peso = Number(c.peso) || 400;
    const ital = c.italico ? 'italic ' : '';

    let sz = baseSize;
    while (sz > 8) {
      ctx2d.font = `${ital}${peso} ${sz}px "${fam}", sans-serif`;
      const words = texto.split(/\s+/).filter(Boolean);
      let wordTooWide = false;
      for (const w of words) {
        const ww = ctx2d.measureText(w).width + Math.max(0, w.length - 1) * esp;
        if (ww > maxW) {
          wordTooWide = true;
          break;
        }
      }
      if (!wordTooWide) {
        // Simula quebra de linhas
        let linesCount = 0;
        for (const par of texto.split('\n')) {
          const ws = par.split(/\s+/).filter(Boolean);
          if (!ws.length) {
            linesCount++;
            continue;
          }
          let cur = ws[0];
          for (let i = 1; i < ws.length; i++) {
            const tent = `${cur} ${ws[i]}`;
            const tw = ctx2d.measureText(tent).width + Math.max(0, tent.length - 1) * esp;
            if (tw <= maxW) cur = tent;
            else {
              linesCount++;
              cur = ws[i];
            }
          }
          linesCount++;
        }
        if (linesCount * sz * lh <= maxH + 1) break;
      }
      sz = Math.max(8, sz - 2);
    }
    return sz;
  }

  // ------------------------------------------------------------------ Renderização Miniatura Canvas 2D (data:image/png)
  async function renderizarMiniaturaCanvas(slide, vars, kit, w = 240, h = 135, opts = {}) {
    if (typeof document === 'undefined') return '';
    const docW = Number(opts.docW || slide?.largura) || (slide?.tamanho && TAM[slide.tamanho]?.[0]) || 1152;
    const docH = Number(opts.docH || slide?.altura) || (slide?.tamanho && TAM[slide.tamanho]?.[1]) || 648;
    const cw = Math.max(16, Math.round(Number(w) || 240));
    const ch = Math.max(16, Math.round(Number(h) || 135));

    const cv = document.createElement('canvas');
    cv.width = cw;
    cv.height = ch;
    const ctx = cv.getContext('2d');
    if (!ctx) return '';

    const s = slide;
    const v = vars || {};
    const k = kit || {};
    const prop = opts.prop || null;
    const fotoUrlFn = typeof opts.fotoUrl === 'function' ? opts.fotoUrl : (f => (/^https?:\/\//i.test(String(f || '')) ? f : `/fotos/${encodeURIComponent(String(f || ''))}`));
    const listaFotos = fotosDe(prop);

    // Pré-carrega recursos necessários do slide em paralelo
    const camadas = Array.isArray(s?.camadas) ? s.camadas : [];
    const imgsFotos = new Map();
    const imgsLogos = new Map();
    const qrsMap = new Map();

    const fontProms = [];
    await Promise.all(camadas.map(async c => {
      if (!c || c.visivel === false) return;
      if (c.tipo === 'foto') {
        const src = c.fotoCustom || (listaFotos[c.indiceFoto] || listaFotos[0] ? fotoUrlFn(listaFotos[c.indiceFoto] || listaFotos[0]) : '');
        if (src) imgsFotos.set(c.id, await carregarImagem(src));
      } else if (c.tipo === 'logo') {
        const src = (c.origem === 'kit' || !c.src) ? (k.logoUrl || k.logo || c.src) : c.src;
        if (src) imgsLogos.set(c.id, await carregarImagem(src));
      } else if (c.tipo === 'qrcode') {
        const url = c.url || waLink(v['{telefone}'] || k.telefone || prop?.telefone || '') || 'https://wa.me/';
        qrsMap.set(c.id, await obterMatrizQr(url));
      } else if (c.tipo === 'texto' && opts.carregarFontes) {
        fontProms.push(carregarFonte(c.fonte, c.peso, c.italico));
      }
    }));
    if (fontProms.length) {
      await Promise.race([
        Promise.all(fontProms),
        new Promise(r => setTimeout(r, 1500))
      ]);
    }

    ctx.save();
    ctx.scale(cw / docW, ch / docH);

    // Fundo do slide
    ctx.fillStyle = hexRgba(s?.fundo || '#171721');
    ctx.fillRect(0, 0, docW, docH);

    for (const raw of camadas) {
      if (!raw || raw.visivel === false) continue;
      const c = normalizarCamada(raw);
      ctx.save();
      ctx.globalAlpha = clamp(c.opacidade ?? 1, 0, 1);
      ctx.translate(Number(c.x) || 0, Number(c.y) || 0);
      if (c.rot) ctx.rotate(rad(c.rot));
      if (c.skewX || c.skewY) ctx.transform(1, Math.tan(rad(c.skewY)), Math.tan(rad(c.skewX)), 1, 0, 0);

      const lw = Number(c.w) || 100;
      const lh = Number(c.h) || 100;

      if (c.tipo === 'foto') {
        const img = imgsFotos.get(c.id) || null;
        const offCv = construirCanvasFotoOffscreen(c, img, 'Sem foto');
        if (offCv) ctx.drawImage(offCv, 0, 0, lw, lh);
        if (Number(c.borda) > 0) {
          caminhoRaios(ctx, 0, 0, lw, lh, obterRaiosCamada(c));
          ctx.lineWidth = Number(c.borda);
          ctx.strokeStyle = hexRgba(c.corBorda || '#ffffff');
          ctx.stroke();
        }
      } else if (c.tipo === 'retangulo') {
        const raios = obterRaiosCamada(c);
        if (Number(c.blurFundo) > 0) {
          const sxScale = cw / docW;
          const syScale = ch / docH;
          const cx0 = clamp(Math.floor((Number(c.x) || 0) * sxScale), 0, cw - 1);
          const cy0 = clamp(Math.floor((Number(c.y) || 0) * syScale), 0, ch - 1);
          const cwBox = Math.max(2, Math.round(lw * sxScale));
          const chBox = Math.max(2, Math.round(lh * syScale));
          const gw = Math.max(1, Math.min(cw - cx0, cwBox));
          const gh = Math.max(1, Math.min(ch - cy0, chBox));
          const glassCv = document.createElement('canvas');
          glassCv.width = cwBox;
          glassCv.height = chBox;
          const gctx = glassCv.getContext('2d');
          if (gctx) {
            gctx.fillStyle = hexRgba(s?.fundo || '#171721');
            gctx.fillRect(0, 0, cwBox, chBox);
            gctx.drawImage(cv, cx0, cy0, gw, gh, 0, 0, cwBox, chBox);
            aplicarFiltrosPixels(glassCv, 102, 102, 105, Math.max(2, Math.min(20, Number(c.blurFundo) * sxScale * 0.65)));
            ctx.save();
            caminhoRaios(ctx, 0, 0, lw, lh, raios);
            ctx.clip();
            ctx.drawImage(glassCv, 0, 0, lw, lh);
            ctx.fillStyle = hexAlpha(c.cor) > 0 ? hexRgba(c.cor) : 'rgba(255,255,255,0.16)';
            ctx.fillRect(0, 0, lw, lh);
            ctx.restore();
          }
          caminhoRaios(ctx, 0, 0, lw, lh, raios);
          ctx.strokeStyle = Number(c.borda) > 0 ? hexRgba(c.corBorda || '#ffffff') : 'rgba(255,255,255,0.22)';
          ctx.lineWidth = Number(c.borda) > 0 ? Number(c.borda) : 1.5;
          ctx.stroke();
        } else {
          caminhoRaios(ctx, 0, 0, lw, lh, raios);
          ctx.fillStyle = hexRgba(c.cor || '#5266eb');
          ctx.fill();
          if (Number(c.borda) > 0) {
            ctx.lineWidth = Number(c.borda);
            ctx.strokeStyle = hexRgba(c.corBorda || '#ffffff');
            ctx.stroke();
          }
        }
      } else if (c.tipo === 'circulo') {
        ctx.beginPath();
        ctx.ellipse(lw / 2, lh / 2, Math.max(1, lw / 2), Math.max(1, lh / 2), 0, 0, Math.PI * 2);
        ctx.fillStyle = hexRgba(c.cor || '#5266eb');
        ctx.fill();
        if (Number(c.borda) > 0) {
          ctx.lineWidth = Number(c.borda);
          ctx.strokeStyle = hexRgba(c.corBorda || '#ffffff');
          ctx.stroke();
        }
      } else if (c.tipo === 'linha') {
        const pts = Array.isArray(c.pontos) && c.pontos.length >= 4 ? c.pontos : [0, lh / 2, lw, lh / 2];
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
        ctx.strokeStyle = hexRgba(c.cor || '#ffffff');
        ctx.lineWidth = Number(c.espessura) || 4;
        ctx.lineCap = c.ponta || 'round';
        if (c.tracejado) ctx.setLineDash(Array.isArray(c.tracejado) ? c.tracejado : [12, 8]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (c.tipo === 'degrade') {
        const ptsDeg = calcularPontosDegrade(lw, lh, c.angulo);
        const g = ctx.createLinearGradient(ptsDeg.start.x, ptsDeg.start.y, ptsDeg.end.x, ptsDeg.end.y);
        const stops = construirParadasDegrade(c.cor1 || '#00000000', c.cor2 || '#000000cc');
        for (let si = 0; si < stops.length; si += 2) g.addColorStop(stops[si], stops[si + 1]);
        caminhoRaios(ctx, 0, 0, lw, lh, obterRaiosCamada(c));
        ctx.fillStyle = g;
        ctx.fill();
      } else if (c.tipo === 'poligono') {
        const vs = normalizarVerticesPoligono(c.vertices, lw, lh);
        ctx.beginPath();
        ctx.moveTo(vs[0].x, vs[0].y);
        for (let i = 1; i < vs.length; i++) ctx.lineTo(vs[i].x, vs[i].y);
        ctx.closePath();
        ctx.fillStyle = hexRgba(c.cor || '#5266eb');
        ctx.fill();
        if (Number(c.borda) > 0) {
          ctx.lineWidth = Number(c.borda);
          ctx.strokeStyle = hexRgba(c.corBorda || '#ffffff');
          ctx.stroke();
        }
      } else if (c.tipo === 'icone') {
        const forma = c.formaFundo || 'nenhum';
        const pad = forma === 'nenhum' ? 0 : (c.folga !== undefined ? Number(c.folga) : Math.round(Math.min(lw, lh) * 0.22));
        if (forma !== 'nenhum') {
          if (forma === 'circulo') {
            ctx.beginPath();
            ctx.ellipse(lw / 2, lh / 2, lw / 2, lh / 2, 0, 0, Math.PI * 2);
          } else {
            const rf = forma === 'pilula' ? Math.min(lw, lh) / 2 : Math.min(18, Math.min(lw, lh) * 0.22);
            caminhoRaios(ctx, 0, 0, lw, lh, rf);
          }
          ctx.fillStyle = hexRgba(c.corFundo || '#5266eb');
          ctx.fill();
        }
        const ic = Object.prototype.hasOwnProperty.call(ICONES_SVG, c.iconeId) ? ICONES_SVG[c.iconeId] : ICONES_SVG.estrela;
        if (typeof Path2D !== 'undefined') {
          ctx.save();
          ctx.translate(pad, pad);
          ctx.scale(Math.max(1, lw - pad * 2) / 24, Math.max(1, lh - pad * 2) / 24);
          ctx.fillStyle = hexRgba(c.cor || '#ffffff');
          ctx.fill(new Path2D(ic.path));
          ctx.restore();
        }
      } else if (c.tipo === 'logo') {
        const img = imgsLogos.get(c.id);
        if (img && img.complete && img.naturalWidth > 0) {
          const escL = Math.min(lw / img.naturalWidth, lh / img.naturalHeight);
          const dw = img.naturalWidth * escL;
          const dh = img.naturalHeight * escL;
          ctx.drawImage(img, (lw - dw) / 2, (lh - dh) / 2, dw, dh);
        } else if (!c.ocultarSemLogo) {
          const forma = c.forma || 'quadrado';
          const corBg = c.corFundo || k.cores1?.destaque || '#5266eb';
          const corTx = c.corTexto || '#ffffff';
          if (forma === 'circulo') {
            ctx.beginPath();
            ctx.ellipse(lw / 2, lh / 2, lw / 2, lh / 2, 0, 0, Math.PI * 2);
          } else {
            caminhoRaios(ctx, 0, 0, lw, lh, Number(c.raio ?? 16));
          }
          ctx.fillStyle = hexRgba(corBg);
          ctx.fill();
          const inicial = String(k.marca || 'B').trim().charAt(0).toUpperCase() || 'B';
          ctx.fillStyle = hexRgba(corTx);
          ctx.font = `700 ${Math.round(Math.min(lw, lh) * 0.52)}px "${safeFont(k.fonte || 'Inter')}", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(inicial, lw / 2, lh / 2 + 1);
        }
      } else if (c.tipo === 'qrcode') {
        const mat = qrsMap.get(c.id);
        caminhoRaios(ctx, 0, 0, lw, lh, Number(c.raio ?? 12));
        ctx.fillStyle = hexRgba(c.corClaro || '#ffffff');
        ctx.fill();
        if (mat && mat.length) {
          const n = mat.length;
          const mrg = Number(c.margem ?? 2);
          const mod = Math.min(lw, lh) / (n + mrg * 2);
          const ox = (lw - n * mod) / 2;
          const oy = (lh - n * mod) / 2;
          ctx.fillStyle = hexRgba(c.corEscuro || '#171721');
          for (let r = 0; r < n; r++) {
            for (let col = 0; col < n; col++) {
              if (mat[r][col]) ctx.fillRect(ox + col * mod, oy + r * mod, mod + 0.3, mod + 0.3);
            }
          }
        }
      } else if (c.tipo === 'texto') {
        const txt = textoResolvidoDe(c, v);
        const pad = c.fundo ? (Number(c.folga) || 0) : 0;
        const sz = calcularTamanhoAutoFit(c, txt, ctx);
        const lineH = sz * (Number(c.entrelinha) || 1.15);
        const sx = Number(c.escalaX) || 1;
        const sy = Number(c.escalaY) || 1;
        const maxW = Math.max(10, (lw - pad * 2) / sx);
        ctx.font = `${c.italico ? 'italic ' : ''}${Number(c.peso) || 400} ${sz}px "${safeFont(c.fonte)}", sans-serif`;
        const lines = [];
        for (const par of txt.split('\n')) {
          const ws = par.split(/\s+/).filter(Boolean);
          if (!ws.length) {
            lines.push('');
            continue;
          }
          let cur = ws[0];
          for (let i = 1; i < ws.length; i++) {
            const tent = `${cur} ${ws[i]}`;
            if (ctx.measureText(tent).width <= maxW) cur = tent;
            else {
              lines.push(cur);
              cur = ws[i];
            }
          }
          lines.push(cur);
        }
        const totalH = Math.max(lh, lines.length * lineH * sy + pad * 2);
        if (c.fundo) {
          caminhoRaios(ctx, 0, 0, lw, totalH, Number(c.raioFundo) || 0);
          ctx.fillStyle = hexRgba(c.corFundo || '#5266eb');
          ctx.fill();
          if (Number(c.bordaFundo) > 0) {
            ctx.lineWidth = Number(c.bordaFundo);
            ctx.strokeStyle = hexRgba(c.corBordaFundo || '#ffffff');
            ctx.stroke();
          }
        }
        ctx.save();
        ctx.translate(pad, pad);
        ctx.scale(sx, sy);
        ctx.font = `${c.italico ? 'italic ' : ''}${Number(c.peso) || 400} ${sz}px "${safeFont(c.fonte)}", sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillStyle = hexRgba(c.cor || '#ffffff');
        lines.forEach((ln, idx) => {
          const lwLine = ctx.measureText(ln).width;
          const tx = c.alinhamento === 'center' ? (maxW - lwLine) / 2 : c.alinhamento === 'right' ? maxW - lwLine : 0;
          const ty = idx * lineH + (lineH - sz) / 2;
          if (Number(c.contorno) > 0) {
            ctx.lineWidth = Number(c.contorno);
            ctx.strokeStyle = hexRgba(c.corContorno || '#000000');
            ctx.strokeText(ln, tx, ty);
          }
          ctx.fillText(ln, tx, ty);
        });
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.restore();

    try {
      return cv.toDataURL('image/png');
    } catch {
      return '';
    }
  }

  // ------------------------------------------------------------------ Motor Konva (Construção de Nó + Telemetria 1:1)
  let _instanciaAtiva = null;

  function calcularPontosDegrade(w, h, anguloDeg = 180) {
    const deg = Number.isFinite(Number(anguloDeg)) ? Number(anguloDeg) : 180;
    const a = rad(deg - 90);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const r = (Math.abs(cos) * w + Math.abs(sin) * h) / 2;
    return {
      start: { x: w / 2 - cos * r, y: h / 2 - sin * r },
      end: { x: w / 2 + cos * r, y: h / 2 + sin * r }
    };
  }

  function construirCanvasVidroKonva(c, slide, ctxRender) {
    if (typeof document === 'undefined') return null;
    const w = Math.max(4, Number(c.w) || 100);
    const h = Math.max(4, Number(c.h) || 100);
    const raios = obterRaiosCamada(c);
    const blur = Number(c.blurFundo) || 0;
    const scale = Math.min(1, 640 / Math.max(w, h));
    const cw = Math.max(4, Math.round(w * scale));
    const ch = Math.max(4, Math.round(h * scale));
    const frostedCv = document.createElement('canvas');
    frostedCv.width = cw;
    frostedCv.height = ch;
    const fctx = frostedCv.getContext('2d');
    if (!fctx) return frostedCv;

    caminhoRaios(fctx, 0, 0, cw, ch, raios.map(r => r * scale));
    fctx.clip();
    fctx.fillStyle = hexRgba(slide?.fundo || '#171721');
    fctx.fillRect(0, 0, cw, ch);

    const camadas = Array.isArray(slide?.camadas) ? slide.camadas : [];
    const idxAtual = camadas.findIndex(x => x && x.id === c.id);
    const abaixo = idxAtual > 0 ? camadas.slice(0, idxAtual) : [];
    const loadedImgs = ctxRender && ctxRender.loadedImgs;

    fctx.save();
    fctx.scale(scale, scale);
    fctx.translate(-(Number(c.x) || 0), -(Number(c.y) || 0));
    for (const bg of abaixo) {
      if (!bg || bg.visivel === false) continue;
      if (bg.tipo === 'foto') {
        const img = loadedImgs && loadedImgs.get(bg.id);
        if (img && img.complete && img.naturalWidth > 0) {
          const off = construirCanvasFotoOffscreen(bg, img, '');
          if (off) {
            fctx.save();
            fctx.globalAlpha = clamp(bg.opacidade ?? 1, 0, 1);
            fctx.translate(Number(bg.x) || 0, Number(bg.y) || 0);
            if (bg.rot) fctx.rotate(rad(bg.rot));
            fctx.drawImage(off, 0, 0, Number(bg.w) || 100, Number(bg.h) || 100);
            fctx.restore();
          }
        }
      } else if (bg.tipo === 'degrade') {
        const ptsD = calcularPontosDegrade(Number(bg.w) || 100, Number(bg.h) || 100, bg.angulo);
        fctx.save();
        fctx.globalAlpha = clamp(bg.opacidade ?? 1, 0, 1);
        fctx.translate(Number(bg.x) || 0, Number(bg.y) || 0);
        const g = fctx.createLinearGradient(ptsD.start.x, ptsD.start.y, ptsD.end.x, ptsD.end.y);
        const stops = construirParadasDegrade(bg.cor1 || '#00000000', bg.cor2 || '#000000cc');
        for (let si = 0; si < stops.length; si += 2) g.addColorStop(stops[si], stops[si + 1]);
        fctx.fillStyle = g;
        fctx.fillRect(0, 0, Number(bg.w) || 100, Number(bg.h) || 100);
        fctx.restore();
      }
    }
    fctx.restore();

    aplicarFiltrosPixels(frostedCv, 102, 102, 105, Math.max(2, Math.min(20, blur * scale * 0.65)));
    fctx.fillStyle = hexAlpha(c.cor) > 0 ? hexRgba(c.cor) : 'rgba(255,255,255,0.18)';
    fctx.fillRect(0, 0, cw, ch);
    return frostedCv;
  }

  function construirGrupoCamadaKonva(c, slide, ctxRender) {
    const K = globalScope.Konva;
    if (!K) return null;
    const { vars, kit, prop, fotoUrlFn, selecionada, onPolyVertexDrag, onPolyVertexEnd, onFotoPronta } = ctxRender;
    const w = Math.max(4, Number(c.w) || 100);
    const h = Math.max(4, Number(c.h) || 100);

    const group = new K.Group({
      id: String(c.id),
      name: 'biga-camada',
      x: Number(c.x) || 0,
      y: Number(c.y) || 0,
      width: w,
      height: h,
      rotation: Number(c.rot) || 0,
      skewX: Math.tan(rad(clamp(c.skewX || 0, -60, 60))),
      skewY: Math.tan(rad(clamp(c.skewY || 0, -60, 60))),
      opacity: clamp(c.opacidade ?? 1, 0, 1),
      visible: c.visivel !== false,
      draggable: !c.travada
    });
    group.setAttr('bigaId', c.id);
    group.setAttr('bigaTipo', c.tipo);

    if (c.tipo === 'foto') {
      const listaFotos = fotosDe(prop);
      const nomeFoto = listaFotos[c.indiceFoto] || listaFotos[0];
      const src = c.fotoCustom || (nomeFoto ? fotoUrlFn(nomeFoto) : '');
      const kImg = new K.Image({
        x: 0, y: 0, width: w, height: h,
        image: construirCanvasFotoOffscreen(c, null, prop ? 'Carregando foto…' : 'Escolha um imóvel')
      });
      group.add(kImg);
      group.setAttr('bigaKImg', kImg);
      if (src) {
        carregarImagem(src).then(img => {
          if (!kImg.getLayer()) return;
          group.setAttr('bigaLoadedImg', img);
          if (ctxRender.loadedImgs && img) ctxRender.loadedImgs.set(c.id, img);
          kImg.image(construirCanvasFotoOffscreen(c, img, 'Sem foto do imóvel'));
          kImg.getLayer().batchDraw();
          if (img && typeof onFotoPronta === 'function') onFotoPronta(c.id, img);
        });
      } else {
        kImg.image(construirCanvasFotoOffscreen(c, null, prop ? 'Sem foto do imóvel' : 'Escolha um imóvel'));
      }
      if (Number(c.borda) > 0) {
        group.add(new K.Rect({
          x: 0, y: 0, width: w, height: h,
          cornerRadius: obterRaiosCamada(c),
          stroke: hexRgba(c.corBorda || '#ffffff'),
          strokeWidth: Number(c.borda),
          strokeScaleEnabled: false,
          listening: false
        }));
      }
    } else if (c.tipo === 'retangulo') {
      const raios = obterRaiosCamada(c);
      const blur = Number(c.blurFundo) || 0;
      if (blur > 0 && typeof document !== 'undefined') {
        const frostedCv = construirCanvasVidroKonva(c, slide, ctxRender);
        const kGlass = new K.Image({ x: 0, y: 0, width: w, height: h, image: frostedCv });
        group.add(kGlass);
        group.setAttr('bigaGlassImg', kGlass);
        group.setAttr('bigaGlassCam', c);
        group.add(new K.Rect({
          x: 0, y: 0, width: w, height: h, cornerRadius: raios,
          stroke: Number(c.borda) > 0 ? hexRgba(c.corBorda || '#ffffff') : 'rgba(255,255,255,0.25)',
          strokeWidth: Number(c.borda) > 0 ? Number(c.borda) : 1.5,
          strokeScaleEnabled: false,
          listening: false
        }));
      } else {
        group.add(new K.Rect({
          x: 0, y: 0, width: w, height: h,
          fill: hexRgba(c.cor || '#5266eb'),
          cornerRadius: raios,
          stroke: Number(c.borda) > 0 ? hexRgba(c.corBorda || '#ffffff') : undefined,
          strokeWidth: Number(c.borda) || 0,
          strokeScaleEnabled: false
        }));
      }
    } else if (c.tipo === 'circulo') {
      group.add(new K.Ellipse({
        x: w / 2, y: h / 2,
        radiusX: Math.max(2, w / 2),
        radiusY: Math.max(2, h / 2),
        fill: hexRgba(c.cor || '#5266eb'),
        stroke: Number(c.borda) > 0 ? hexRgba(c.corBorda || '#ffffff') : undefined,
        strokeWidth: Number(c.borda) || 0,
        strokeScaleEnabled: false
      }));
    } else if (c.tipo === 'linha') {
      const pts = Array.isArray(c.pontos) && c.pontos.length >= 4 ? c.pontos : [0, h / 2, w, h / 2];
      group.add(new K.Rect({ x: 0, y: 0, width: w, height: Math.max(24, h), fill: 'rgba(0,0,0,0)' }));
      group.add(new K.Line({
        points: pts,
        stroke: hexRgba(c.cor || '#ffffff'),
        strokeWidth: Number(c.espessura) || 4,
        lineCap: c.ponta || 'round',
        lineJoin: 'round',
        dash: c.tracejado ? (Array.isArray(c.tracejado) ? c.tracejado : [12, 8]) : [],
        strokeScaleEnabled: false,
        hitStrokeWidth: 24
      }));
    } else if (c.tipo === 'degrade') {
      const pts = calcularPontosDegrade(w, h, c.angulo);
      group.add(new K.Rect({
        x: 0, y: 0, width: w, height: h,
        cornerRadius: obterRaiosCamada(c),
        fillLinearGradientStartPoint: pts.start,
        fillLinearGradientEndPoint: pts.end,
        fillLinearGradientColorStops: construirParadasDegrade(c.cor1 || '#00000000', c.cor2 || '#000000cc')
      }));
    } else if (c.tipo === 'poligono') {
      const vs = normalizarVerticesPoligono(c.vertices, w, h);
      c.vertices = vs;
      const flat = vs.flatMap(v => [v.x, v.y]);
      const polyLine = new K.Line({
        points: flat,
        closed: true,
        fill: hexRgba(c.cor || '#5266eb'),
        stroke: Number(c.borda) > 0 ? hexRgba(c.corBorda || '#ffffff') : undefined,
        strokeWidth: Number(c.borda) || 0,
        strokeScaleEnabled: false
      });
      group.add(polyLine);

      if (selecionada && !c.travada) {
        vs.forEach((v, idx) => {
          const handle = new K.Circle({
            x: Number(v.x) || 0,
            y: Number(v.y) || 0,
            radius: 7,
            fill: '#ffffff',
            stroke: '#5266eb',
            strokeWidth: 2.5,
            strokeScaleEnabled: false,
            draggable: true,
            dragDistance: 0,
            name: 'biga-poly-handle',
            hitFunc: function (context, shape) {
              const absScale = Math.max(0.05, Math.abs((shape.getAbsoluteScale && shape.getAbsoluteScale().x) || 1));
              const r = Math.max(24, 24 / absScale);
              context.beginPath();
              context.arc(0, 0, r, 0, Math.PI * 2, true);
              context.closePath();
              context.fillStrokeShape(shape);
            }
          });
          handle.on('pointerdown touchstart mousedown', ev => {
            ev.cancelBubble = true;
          });
          handle.on('dragstart', ev => {
            ev.cancelBubble = true;
            if (typeof onPolyVertexDrag === 'function') onPolyVertexDrag('start', c, idx, handle);
          });
          handle.on('dragmove', ev => {
            ev.cancelBubble = true;
            c.vertices[idx] = { x: Math.round(handle.x()), y: Math.round(handle.y()) };
            polyLine.points(c.vertices.flatMap(pt => [pt.x, pt.y]));
            if (typeof onPolyVertexDrag === 'function') onPolyVertexDrag('move', c, idx, handle);
          });
          handle.on('dragend', ev => {
            ev.cancelBubble = true;
            if (typeof onPolyVertexEnd === 'function') onPolyVertexEnd(c, idx);
          });
          group.add(handle);
        });
      }
    } else if (c.tipo === 'icone') {
      const forma = c.formaFundo || 'nenhum';
      const pad = forma === 'nenhum' ? 0 : (c.folga !== undefined ? Number(c.folga) : Math.round(Math.min(w, h) * 0.22));
      if (forma === 'circulo') {
        group.add(new K.Ellipse({
          x: w / 2, y: h / 2, radiusX: w / 2, radiusY: h / 2,
          fill: hexRgba(c.corFundo || '#5266eb'),
          stroke: Number(c.bordaFundo) > 0 ? hexRgba(c.corBordaFundo || '#ffffff') : undefined,
          strokeWidth: Number(c.bordaFundo) || 0,
          strokeScaleEnabled: false
        }));
      } else if (forma !== 'nenhum') {
        group.add(new K.Rect({
          x: 0, y: 0, width: w, height: h,
          fill: hexRgba(c.corFundo || '#5266eb'),
          cornerRadius: forma === 'pilula' ? Math.min(w, h) / 2 : Math.min(18, Math.min(w, h) * 0.22),
          stroke: Number(c.bordaFundo) > 0 ? hexRgba(c.corBordaFundo || '#ffffff') : undefined,
          strokeWidth: Number(c.bordaFundo) || 0,
          strokeScaleEnabled: false
        }));
      } else {
        group.add(new K.Rect({ x: 0, y: 0, width: w, height: h, fill: 'rgba(0,0,0,0)' }));
      }
      const ic = Object.prototype.hasOwnProperty.call(ICONES_SVG, c.iconeId) ? ICONES_SVG[c.iconeId] : ICONES_SVG.estrela;
      group.add(new K.Path({
        x: pad, y: pad,
        data: ic.path,
        fill: hexRgba(c.cor || '#ffffff'),
        scaleX: Math.max(1, w - pad * 2) / 24,
        scaleY: Math.max(1, h - pad * 2) / 24
      }));
    } else if (c.tipo === 'logo') {
      const src = (c.origem === 'kit' || !c.src) ? (kit?.logoUrl || kit?.logo || c.src) : c.src;
      const forma = c.forma || 'quadrado';
      const corBg = c.corFundo || kit?.cores1?.destaque || '#5266eb';
      const corTx = c.corTexto || '#ffffff';
      const bgShape = forma === 'circulo'
        ? new K.Ellipse({ x: w / 2, y: h / 2, radiusX: w / 2, radiusY: h / 2, fill: hexRgba(corBg) })
        : new K.Rect({ x: 0, y: 0, width: w, height: h, cornerRadius: Number(c.raio ?? 16), fill: forma === 'nenhum' ? 'rgba(0,0,0,0)' : hexRgba(corBg) });
      const inicial = String(kit?.marca || 'B').trim().charAt(0).toUpperCase() || 'B';
      const monoTxt = new K.Text({
        x: 0, y: 0, width: w, height: h,
        text: inicial,
        fontFamily: `"${safeFont(kit?.fonte || 'Inter')}", sans-serif`,
        fontStyle: '700',
        fontSize: Math.round(Math.min(w, h) * 0.52),
        fill: hexRgba(corTx),
        align: 'center',
        verticalAlign: 'middle'
      });
      if (c.ocultarSemLogo && !src) {
        bgShape.visible(false);
        monoTxt.visible(false);
        group.add(new K.Rect({ x: 0, y: 0, width: w, height: h, fill: 'rgba(0,0,0,0)' }));
      }
      group.add(bgShape, monoTxt);
      if (src) {
        carregarImagem(src).then(img => {
          if (!img || !group.getLayer()) return;
          bgShape.visible(false);
          monoTxt.visible(false);
          const escL = Math.min(w / img.naturalWidth, h / img.naturalHeight);
          const dw = img.naturalWidth * escL;
          const dh = img.naturalHeight * escL;
          group.add(new K.Image({
            x: (w - dw) / 2,
            y: (h - dh) / 2,
            width: dw,
            height: dh,
            image: img
          }));
          group.getLayer().batchDraw();
        });
      }
    } else if (c.tipo === 'qrcode') {
      const urlAlvo = c.url || waLink(vars['{telefone}'] || kit?.telefone || prop?.telefone || '') || 'https://wa.me/';
      const bgRect = new K.Rect({
        x: 0, y: 0, width: w, height: h,
        fill: hexRgba(c.corClaro || '#ffffff'),
        cornerRadius: Number(c.raio ?? 12)
      });
      let matQr = gerarMatrizQrFallback(urlAlvo);
      const qrShape = new K.Shape({
        x: 0, y: 0, width: w, height: h,
        listening: false,
        sceneFunc: function (context) {
          if (!matQr || !matQr.length) return;
          const n = matQr.length;
          const mrg = Number(c.margem ?? 2);
          const mod = Math.min(w, h) / (n + mrg * 2);
          const ox = (w - n * mod) / 2;
          const oy = (h - n * mod) / 2;
          context.fillStyle = hexRgba(c.corEscuro || '#171721');
          for (let r = 0; r < n; r++) {
            for (let col = 0; col < n; col++) {
              if (matQr[r][col]) context.fillRect(ox + col * mod, oy + r * mod, mod + 0.35, mod + 0.35);
            }
          }
        }
      });
      group.add(bgRect, qrShape);
      obterMatrizQr(urlAlvo).then(mat => {
        if (!mat || !qrShape.getLayer()) return;
        matQr = mat;
        qrShape.getLayer().batchDraw();
      });
    } else if (c.tipo === 'texto') {
      const textoResolvido = textoResolvidoDe(c, vars);
      const pad = c.fundo ? (Number(c.folga) || 0) : 0;
      const sx = Number(c.escalaX) || 1;
      const sy = Number(c.escalaY) || 1;
      const measureCv = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
      const tamanhoEfetivo = calcularTamanhoAutoFit(c, textoResolvido, measureCv);
      const textWidth = Math.max(12, (w - pad * 2) / sx);
      const fontStyle = `${c.italico ? 'italic ' : ''}${Number(c.peso) || 400}`;

      const textNode = new K.Text({
        x: pad,
        y: pad,
        width: textWidth,
        text: textoResolvido,
        fontFamily: `"${safeFont(c.fonte)}", sans-serif`,
        fontSize: tamanhoEfetivo,
        fontStyle,
        fill: hexRgba(c.cor || '#ffffff'),
        align: c.alinhamento || 'left',
        lineHeight: Number(c.entrelinha) || 1.15,
        letterSpacing: Number(c.espacamento) || 0,
        scaleX: sx,
        scaleY: sy,
        wrap: 'word',
        stroke: Number(c.contorno) > 0 ? hexRgba(c.corContorno || '#000000') : undefined,
        strokeWidth: Number(c.contorno) > 0 ? Number(c.contorno) : 0,
        fillAfterStrokeEnabled: true,
        shadowColor: Number(c.sombra) > 0 ? hexRgba(c.corSombra || '#000000') : undefined,
        shadowBlur: Number(c.sombra) || 0,
        shadowOffsetY: Number(c.sombra) > 0 ? (Number(c.sombra) / 3) : 0
      });

      const realH = Math.max(Math.round(tamanhoEfetivo * (Number(c.entrelinha) || 1.15) * sy + pad * 2), Math.round(textNode.height() * sy + pad * 2));
      if (!c.autoFit) {
        const prevH = Number(c.h) || realH;
        c.h = realH;
        if (c.ancora === 'base' && prevH !== realH) {
          c.y = (Number(c.y) || 0) + (prevH - realH);
          group.y(c.y);
        }
      }
      const boxH = c.autoFit ? h : realH;
      group.height(boxH);

      if (c.fundo) {
        const bgRect = new K.Rect({
          x: 0, y: 0, width: w, height: boxH,
          fill: hexRgba(c.corFundo || '#5266eb'),
          cornerRadius: Number(c.raioFundo) || 0,
          stroke: Number(c.bordaFundo) > 0 ? hexRgba(c.corBordaFundo || '#ffffff') : undefined,
          strokeWidth: Number(c.bordaFundo) || 0,
          strokeScaleEnabled: false
        });
        group.add(bgRect);
      } else {
        // Hit box transparente para facilitar clique/toque no texto
        group.add(new K.Rect({ x: 0, y: 0, width: w, height: boxH, fill: 'rgba(0,0,0,0)' }));
      }
      group.add(textNode);
      group.setAttr('bigaTextNode', textNode);
      group.setAttr('bigaTextoResolvido', textoResolvido);
      group.setAttr('bigaTamanhoEfetivo', tamanhoEfetivo);
    }

    return group;
  }

  function serializarCenaComTelemetria(docOuOpts, extraOpts = {}) {
    // Suporta ser chamada sem parâmetros (usa instância montada) ou com (doc, { prop, kit, fichaOverride })
    let doc = null;
    let prop = extraOpts.prop || null;
    let kit = extraOpts.kit || {};
    let fichaOverride = extraOpts.fichaOverride || null;
    let liveStageCtx = null;

    if (!docOuOpts && _instanciaAtiva) {
      liveStageCtx = _instanciaAtiva.getLiveContext();
      doc = liveStageCtx.doc;
      prop = liveStageCtx.prop;
      kit = liveStageCtx.kit;
      fichaOverride = liveStageCtx.fichaOverride;
    } else if (docOuOpts && docOuOpts.stage && docOuOpts.contentLayer && docOuOpts.doc) {
      liveStageCtx = docOuOpts;
      doc = docOuOpts.doc;
      prop = docOuOpts.prop || prop;
      kit = docOuOpts.kit || kit;
      fichaOverride = docOuOpts.fichaOverride || fichaOverride;
    } else {
      doc = normalizarDoc(docOuOpts || (_instanciaAtiva ? _instanciaAtiva.getDoc() : null));
    }

    const vars = resolverVariaveis(prop, kit, fichaOverride);
    const [W, H] = dimensoesDoc(doc);
    const K = globalScope.Konva;

    const serializarSlide = (slide, sIdx) => {
      const canUseLive = liveStageCtx && liveStageCtx.slideIdx === sIdx && liveStageCtx.contentLayer;
      let tempDiv = null;
      let tempStage = null;
      let layer = canUseLive ? liveStageCtx.contentLayer : null;

      if (!layer && K && typeof document !== 'undefined') {
        tempDiv = document.createElement('div');
        tempStage = new K.Stage({ container: tempDiv, width: W, height: H });
        layer = new K.Layer();
        tempStage.add(layer);
        for (const c of slide.camadas) {
          const node = construirGrupoCamadaKonva(copia(c), slide, {
            vars, kit, prop, fotoUrlFn: extraOpts.fotoUrl || (f => f), selecionada: false
          });
          if (node) layer.add(node);
        }
      }

      const camadasOut = slide.camadas.map(c => {
        const out = copia(c);
        const node = layer ? layer.findOne(n => n.getAttr && n.getAttr('bigaId') === c.id) : null;
        if (node && layer) {
          out.matrix = node.getAbsoluteTransform(layer).getMatrix().map(v => Math.round(v * 100000) / 100000);
          if (c.tipo === 'texto') {
            const textNode = node.getAttr('bigaTextNode');
            const textoResolvido = node.getAttr('bigaTextoResolvido') ?? textoResolvidoDe(c, vars);
            const tamanhoEfetivo = node.getAttr('bigaTamanhoEfetivo') ?? c.tamanho;
            const lines = textNode && textNode.textArr ? textNode.textArr.map(i => i.text) : [textoResolvido];
            const ms = textNode && textNode.measureSize ? textNode.measureSize('M') : {};
            const baselineShift = (ms.fontBoundingBoxAscent != null && ms.fontBoundingBoxDescent != null)
              ? (ms.fontBoundingBoxAscent - ms.fontBoundingBoxDescent) / 2
              : null;
            const textTop = c.fundo ? (Number(c.folga) || 0) : 0;
            const textLeft = c.fundo ? (Number(c.folga) || 0) : 0;
            const textMatrix = textNode
              ? textNode.getAbsoluteTransform(layer).getMatrix().map(v => Math.round(v * 100000) / 100000)
              : out.matrix;
            out.textoResolvido = textoResolvido;
            out.tamanhoEfetivo = tamanhoEfetivo;
            out.lines = lines;
            out.baselineShift = baselineShift;
            out.textTop = textTop;
            out.telemetria = {
              lines,
              baselineShift,
              textTop,
              textLeft,
              tamanhoEfetivo,
              textoResolvido,
              textMatrix
            };
          }
        } else {
          // Fallback matemático puro caso chamado fora do browser (ex. Node sandbox)
          const r = rad(c.rot || 0);
          const cos = Math.cos(r);
          const sin = Math.sin(r);
          const kx = Math.tan(rad(clamp(c.skewX || 0, -60, 60)));
          const ky = Math.tan(rad(clamp(c.skewY || 0, -60, 60)));
          out.matrix = [
            cos - sin * ky,
            sin + cos * ky,
            cos * kx - sin,
            sin * kx + cos,
            Number(c.x) || 0,
            Number(c.y) || 0
          ].map(v => Math.round(v * 100000) / 100000);
          if (c.tipo === 'texto') {
            const textoResolvido = textoResolvidoDe(c, vars);
            const tamanhoEfetivo = Number(c.tamanho) || 40;
            const lines = textoResolvido.split('\n');
            const textTop = c.fundo ? (Number(c.folga) || 0) : 0;
            const textLeft = c.fundo ? (Number(c.folga) || 0) : 0;
            const [ma, mb, mc, md, me, mf] = out.matrix;
            const textMatrix = [
              ma, mb, mc, md,
              Math.round((me + ma * textLeft + mc * textTop) * 100000) / 100000,
              Math.round((mf + mb * textLeft + md * textTop) * 100000) / 100000
            ];
            out.textoResolvido = textoResolvido;
            out.tamanhoEfetivo = tamanhoEfetivo;
            out.lines = lines;
            out.baselineShift = null;
            out.textTop = textTop;
            out.telemetria = {
              lines,
              baselineShift: null,
              textTop,
              textLeft,
              tamanhoEfetivo,
              textoResolvido,
              textMatrix
            };
          }
        }
        return out;
      });

      if (tempStage) tempStage.destroy();
      return {
        id: slide.id,
        nome: slide.nome,
        tipo: slide.tipo,
        fundo: slide.fundo,
        camadas: camadasOut
      };
    };

    return {
      versao: 1,
      modo: doc.modo,
      formato: doc.formato,
      largura: W,
      altura: H,
      paleta: copia(doc.paleta || []),
      slides: doc.slides.map((s, idx) => serializarSlide(s, idx))
    };
  }

  // ------------------------------------------------------------------ UI & Orquestração do Editor (`montar`)
  function montar(el, ctx = {}) {
    if (!el || typeof document === 'undefined') return null;

    const K = globalScope.Konva;
    if (!K) {
      el.innerHTML = '<div class="card"><p class="body muted">Motor gráfico Konva não carregado. Recarregue a página.</p></div>';
      return null;
    }

    const toast = typeof ctx.toast === 'function' ? ctx.toast : (() => {});
    const fotoUrlFn = typeof ctx.fotoUrl === 'function'
      ? ctx.fotoUrl
      : (f => (/^https?:\/\//i.test(String(f || '')) ? String(f) : `/fotos/${encodeURIComponent(String(f || ''))}`));
    const getInventario = () => (typeof ctx.inventario === 'function' ? ctx.inventario() : ctx.inventario) || [];
    const getMeusModelosInfo = () => {
      const m = typeof ctx.meusModelos === 'function' ? ctx.meusModelos() : ctx.meusModelos;
      if (Array.isArray(m)) return { modelos: m, padrao: null };
      if (m && Array.isArray(m.modelos)) return { modelos: m.modelos, padrao: m.padrao || null };
      return { modelos: [], padrao: null };
    };
    const getMeusModelos = () => getMeusModelosInfo().modelos;

    const modo = ctx.modo || (ctx.doc && ctx.doc.modo) || 'capas';

    const E = {
      doc: normalizarDoc(ctx.doc || criarModeloPadrao('classico', modo === 'pdf' ? '16:9' : 'feed').doc, modo),
      prop: ctx.prop || getInventario()[0] || null,
      kit: ctx.kit || { marca: 'BIGA', cores1: { fundo: '#0E0E0F', texto: '#ECE9E2', principal: '#2A2A2D', secundaria: '#8C8A84', destaque: '#5266eb' }, cores2: { fundo: '#F2F0EB', texto: '#131314', principal: '#DAD6CC', secundaria: '#7A776F', destaque: '#8C6420' }, fonte: 'Inter' },
      fichaOverride: ctx.fichaOverride || null,
      slideIdx: 0,
      sel: null,
      hist: [],
      fut: [],
      uniforme: true,
      enquadrar: false,
      abaAtiva: 'modelos',
      propPainel: null,
      sheetModo: 'aba',
      camadasTab: 'tudo',
      sheetAberta: false,
      menuAberto: false,
      chipsDadoAberto: false,
      rodaPara: null,
      recentes: [],
      fonteBusca: '',
      fonteCat: '',
      zoomModo: 'fit', // 'fit' ou número 0.5..2
      stageScale: 1,
      shiftDown: false,
      inlineEdit: null,
      thumbsCache: new Map(),
      modeloThumbs: new Map(),
      destroyed: false
    };

    const slideAtual = () => E.doc.slides[E.slideIdx] || E.doc.slides[0];
    const camada = idc => (slideAtual()?.camadas || []).find(c => c.id === idc) || null;
    const varsAtuais = () => resolverVariaveis(E.prop, E.kit, E.fichaOverride);

    function notificarMudancaDoc() {
      if (typeof ctx.onChangeDoc === 'function') {
        const out = copia(E.doc);
        if (out.slides.length === 1) {
          out.camadas = out.slides[0].camadas;
          out.fundo = out.slides[0].fundo;
        }
        ctx.onChangeDoc(out);
      }
    }

    function marcar() {
      E.hist.push(JSON.stringify({ doc: E.doc, slideIdx: E.slideIdx }));
      if (E.hist.length > 85) E.hist.shift();
      E.fut = [];
      atualizarBotoesHist();
    }

    function desfazer() {
      if (!E.hist.length) return;
      E.fut.push(JSON.stringify({ doc: E.doc, slideIdx: E.slideIdx }));
      const snap = JSON.parse(E.hist.pop());
      E.doc = normalizarDoc(snap.doc, modo);
      E.slideIdx = clamp(snap.slideIdx || 0, 0, E.doc.slides.length - 1);
      if (!camada(E.sel)) E.sel = null;
      reconstruirTudo();
      notificarMudancaDoc();
    }

    function refazer() {
      if (!E.fut.length) return;
      E.hist.push(JSON.stringify({ doc: E.doc, slideIdx: E.slideIdx }));
      const snap = JSON.parse(E.fut.pop());
      E.doc = normalizarDoc(snap.doc, modo);
      E.slideIdx = clamp(snap.slideIdx || 0, 0, E.doc.slides.length - 1);
      if (!camada(E.sel)) E.sel = null;
      reconstruirTudo();
      notificarMudancaDoc();
    }

    // ---------------- Estrutura HTML Base
    const op = ctx.opcoesTopbar || {};
    const podeApresentar = op.apresentacao !== false;
    const podeLote = op.lote !== false && (typeof ctx.onLote === 'function' || modo === 'capas');
    const podeVitrine = op.vitrine !== false && typeof ctx.onVitrine === 'function';
    const podeWhatsapp = op.whatsapp !== false && (typeof ctx.onWhatsapp === 'function' || modo === 'pdf');

    el.innerHTML = `
      <div class="studio-root" data-modo="${esc(modo)}">
        <header class="studio-topbar">
          <div class="studio-top-left">
            ${ctx.onVoltar ? `<button type="button" class="studio-pill-btn" data-st="voltar" title="Voltar">${svgIconeHtml('seta', 16, 'studio-flip-x')}<span>Voltar</span></button>` : ''}
            <select class="studio-select-imovel" name="stImovel" aria-label="Selecionar imóvel"></select>
            <div class="studio-menu-wrap">
              <button type="button" class="studio-icon-btn" data-st="toggleMenu" aria-label="Mais ações" title="Mais opções">⋯</button>
              <div class="studio-dropdown hide" id="stTopMenu"></div>
            </div>
          </div>

          <div class="studio-top-center">
            <button type="button" class="studio-icon-btn" data-st="desfazer" title="Desfazer (Ctrl+Z)" disabled>↶</button>
            <button type="button" class="studio-icon-btn" data-st="refazer" title="Refazer (Ctrl+Shift+Z)" disabled>↷</button>
            ${modo === 'capas' ? `
              <select class="studio-select-formato" name="stFormato" aria-label="Formato">
                <option value="feed">Feed 4:5</option>
                <option value="quadrado">Quadrado 1:1</option>
                <option value="story">Story 9:16</option>
              </select>` : ''}
            <div class="studio-page-counter">
              <button type="button" class="studio-mini-nav" data-st="pagAnt" title="Página anterior">‹</button>
              <span id="stPageCounter">1 / 1</span>
              <button type="button" class="studio-mini-nav" data-st="pagProx" title="Próxima página">›</button>
            </div>
          </div>

          <div class="studio-top-right">
            ${podeApresentar ? `<button type="button" class="studio-pill-btn" data-st="apresentar" title="Modo Apresentação"><span>Apresentar</span></button>` : ''}
            <button type="button" class="studio-primary-btn" data-st="abrirExportar">${modo === 'pdf' ? 'Exportar<span class="studio-hide-mob"> / Enviar</span>' : 'Exportar'}</button>
          </div>
        </header>

        <div class="studio-workspace">
          <nav class="studio-rail" aria-label="Ferramentas do Studio">
            ${[
              ['modelos', 'estrela', 'Modelos'],
              ['elementos', 'selo-exclusivo', 'Elementos'],
              ['texto', 'selo-novo', 'Texto'],
              ['galeria', 'casa', 'Galeria'],
              ['marca', 'chave', 'Marca'],
              ['ajustar', 'switch-on', 'Ajustar'],
              ['camadas', 'area', 'Camadas']
            ].map(([id, ic, lbl]) => `
              <button type="button" class="studio-rail-btn ${id === E.abaAtiva ? 'active' : ''}" data-st="aba" data-aba="${id}">
                ${svgIconeHtml(ic, 20)}
                <span>${esc(lbl)}</span>
              </button>
            `).join('')}
          </nav>

          <aside class="studio-panel" id="stDesktopPanel">
            <div class="studio-panel-head">
              <h3 id="stPanelTitle">Modelos</h3>
              <button type="button" class="studio-icon-btn studio-sheet-close" data-st="fecharSheet" aria-label="Fechar">✕</button>
            </div>
            <div class="studio-panel-scroll" id="stPanelBody" data-allow-scroll="1"></div>
          </aside>

          <main class="studio-stage-area">
            <div class="studio-stage-viewport" id="stViewport">
              <div id="stage-container" tabindex="0" aria-label="Área de edição visual"></div>
            </div>
            <div class="studio-floating-ui hide" id="stFloatingUi">
              <div class="studio-context-bar studio-quick-bar hide" id="stContextBar"></div>
              <div class="studio-ext-handles hide" id="stExtHandles">
                <button type="button" class="studio-ext-btn" data-st-ext="girar" aria-label="Girar elemento" title="Girar">↻</button>
                <button type="button" class="studio-ext-btn" data-st-ext="mover" aria-label="Mover com precisão" title="Mover">✥</button>
                <span class="studio-ext-deg hide" id="stExtDeg">0°</span>
              </div>
            </div>
            <div class="studio-page-dots" id="stMobileDots"></div>
            <div class="studio-zoom-bar" id="stZoomBar">
              <button type="button" class="studio-zoom-btn" data-st="zoomMenos" title="Diminuir zoom">−</button>
              <select class="studio-zoom-select" name="stZoom" aria-label="Zoom">
                <option value="fit">Ajustar</option>
                <option value="0.5">50%</option>
                <option value="0.75">75%</option>
                <option value="1">100%</option>
                <option value="1.25">125%</option>
                <option value="1.5">150%</option>
                <option value="2">200%</option>
              </select>
              <button type="button" class="studio-zoom-btn" data-st="zoomMais" title="Aumentar zoom">+</button>
            </div>
          </main>
        </div>

        <footer class="studio-filmstrip" id="stFilmstrip" data-allow-scroll="1"></footer>

        <nav class="studio-bottom-bar" id="stBottomBar" aria-label="Menu inferior do Studio"></nav>

        <div class="studio-sheet-backdrop hide" id="stSheetBackdrop" data-st="fecharSheet"></div>
        <div class="studio-sheet hide" id="stMobileSheet" role="dialog" aria-modal="true">
          <div class="studio-sheet-handle"><span></span></div>
          <div class="studio-sheet-head">
            <h3 id="stSheetTitle">Modelos</h3>
            <button type="button" class="studio-icon-btn" data-st="fecharSheet" aria-label="Fechar">✕</button>
          </div>
          <div class="studio-sheet-body" id="stSheetBody" data-allow-scroll="1"></div>
        </div>

        <div class="studio-action-backdrop hide" id="stActionBackdrop" data-st="fecharMenu"></div>
        <div class="studio-action-sheet hide" id="stActionSheet" role="dialog" aria-modal="true" aria-label="Mais ações"></div>

        <div class="studio-modal-backdrop hide" id="stModalBackdrop">
          <div class="studio-modal" id="stModalBox" data-allow-scroll="1"></div>
        </div>
      </div>`;

    const qs = s => el.querySelector(s);
    const stageContainer = qs('#stage-container');
    const viewport = qs('#stViewport');

    // ---------------- Konva Stage Setup
    const stage = new K.Stage({
      container: stageContainer,
      width: 600,
      height: 338
    });
    const bgLayer = new K.Layer({ listening: false });
    const contentLayer = new K.Layer();
    const overlayLayer = new K.Layer();
    stage.add(bgLayer, contentLayer, overlayLayer);

    const bgRect = new K.Rect({ x: 0, y: 0, width: E.doc.largura, height: E.doc.altura, fill: hexRgba(slideAtual().fundo) });
    bgLayer.add(bgRect);

    const transformer = new K.Transformer({
      borderStroke: '#5266eb',
      borderStrokeWidth: 1.5,
      anchorStroke: '#5266eb',
      anchorFill: '#ffffff',
      anchorStrokeWidth: 1.5,
      anchorSize: 11,
      anchorCornerRadius: 5,
      padding: 3,
      rotateEnabled: false,
      keepRatio: true,
      ignoreStroke: true
    });
    overlayLayer.add(transformer);

    const guidesGroup = new K.Group({ listening: false });
    overlayLayer.add(guidesGroup);

    const stageArea = qs('.studio-stage-area');
    const floatingUi = qs('#stFloatingUi');
    const extHandles = qs('#stExtHandles');
    const extDegEl = qs('#stExtDeg');

    // ---------------- Blindagem Touch Mobile (confinada apenas a #stage-container)
    const bloquearTouchPalco = ev => {
      if (ev.target && ev.target.closest && ev.target.closest('input, textarea, [data-allow-scroll]')) return;
      if (ev.cancelable) ev.preventDefault();
    };
    stageContainer.addEventListener('touchmove', bloquearTouchPalco, { passive: false });
    stageContainer.addEventListener('gesturestart', bloquearTouchPalco, { passive: false });
    stageContainer.addEventListener('gesturechange', bloquearTouchPalco, { passive: false });

    const cancelarArrasteSeguro = () => {
      guidesGroup.destroyChildren();
      overlayLayer.batchDraw();
    };
    stageContainer.addEventListener('pointercancel', cancelarArrasteSeguro);
    stageContainer.addEventListener('touchcancel', cancelarArrasteSeguro);

    // ---------------- Redimensionamento Responsivo do Palco
    function ajustarEscalaPalco() {
      if (E.destroyed) return;
      const [W, H] = dimensoesDoc(E.doc);
      const rect = viewport.getBoundingClientRect();
      const availW = Math.max(200, (rect.width || 360) - 24);
      const availH = Math.max(180, (rect.height || 360) - 24);
      let scale = E.zoomModo === 'fit'
        ? Math.min(availW / W, availH / H)
        : Number(E.zoomModo) || 1;
      scale = clamp(scale, 0.15, 2.5);
      E.stageScale = scale;

      const sw = Math.max(50, Math.round(W * scale));
      const sh = Math.max(50, Math.round(H * scale));
      stage.width(sw);
      stage.height(sh);
      stageContainer.style.width = `${sw}px`;
      stageContainer.style.height = `${sh}px`;

      bgLayer.scale({ x: scale, y: scale });
      contentLayer.scale({ x: scale, y: scale });
      overlayLayer.scale({ x: scale, y: scale });

      const isMob = typeof window !== 'undefined' && window.innerWidth < 900;
      const pxVis = isMob ? 11 : 10;
      transformer.anchorSize(pxVis);
      transformer.anchorCornerRadius(Math.round(pxVis / 2));
      transformer.anchorStrokeWidth(1.5);
      transformer.borderStrokeWidth(1.5);
      transformer.padding(3);

      stage.batchDraw();
      posicionarControlesFlutuantes();
    }

    let resizeObs = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObs = new ResizeObserver(() => ajustarEscalaPalco());
      resizeObs.observe(viewport);
    }

    // ---------------- Guias Magnéticas Inteligentes
    function limparGuias() {
      guidesGroup.destroyChildren();
      overlayLayer.batchDraw();
    }

    function calcularAlvosSnap(nodeAtivo) {
      const [W, H] = dimensoesDoc(E.doc);
      const xs = [0, W / 2, W];
      const ys = [0, H / 2, H];
      contentLayer.getChildren().forEach(n => {
        if (n === nodeAtivo || !n.visible()) return;
        const box = n.getClientRect({ relativeTo: contentLayer });
        xs.push(box.x, box.x + box.width / 2, box.x + box.width);
        ys.push(box.y, box.y + box.height / 2, box.y + box.height);
      });
      return { xs, ys };
    }

    function aplicarSnap(nodeAtivo) {
      const [W, H] = dimensoesDoc(E.doc);
      const { xs, ys } = calcularAlvosSnap(nodeAtivo);
      const box = nodeAtivo.getClientRect({ relativeTo: contentLayer });
      const snapTol = Math.max(5, 8 / (E.stageScale || 1));

      let dxSnap = null;
      let gxLine = null;
      const candX = [box.x, box.x + box.width / 2, box.x + box.width];
      for (const cx of candX) {
        for (const tx of xs) {
          const diff = tx - cx;
          if (Math.abs(diff) <= snapTol && (dxSnap === null || Math.abs(diff) < Math.abs(dxSnap))) {
            dxSnap = diff;
            gxLine = tx;
          }
        }
      }
      if (dxSnap !== null) nodeAtivo.x(nodeAtivo.x() + dxSnap);

      let dySnap = null;
      let gyLine = null;
      const candY = [box.y, box.y + box.height / 2, box.y + box.height];
      for (const cy of candY) {
        for (const ty of ys) {
          const diff = ty - cy;
          if (Math.abs(diff) <= snapTol && (dySnap === null || Math.abs(diff) < Math.abs(dySnap))) {
            dySnap = diff;
            gyLine = ty;
          }
        }
      }
      if (dySnap !== null) nodeAtivo.y(nodeAtivo.y() + dySnap);

      guidesGroup.destroyChildren();
      if (gxLine !== null) {
        guidesGroup.add(new K.Line({
          points: [gxLine, 0, gxLine, H],
          stroke: '#ff4fa3',
          strokeWidth: 1.5 / (E.stageScale || 1),
          dash: [6 / (E.stageScale || 1), 5 / (E.stageScale || 1)]
        }));
      }
      if (gyLine !== null) {
        guidesGroup.add(new K.Line({
          points: [0, gyLine, W, gyLine],
          stroke: '#ff4fa3',
          strokeWidth: 1.5 / (E.stageScale || 1),
          dash: [6 / (E.stageScale || 1), 5 / (E.stageScale || 1)]
        }));
      }
      overlayLayer.batchDraw();
    }

    // ---------------- Controles Flutuantes (Quick Bar + Alças ↻ e ✥)
    function posicionarControlesFlutuantes() {
      const c = camada(E.sel);
      const bar = qs('#stContextBar');
      if (!floatingUi || !bar || !extHandles || !stageArea) return;
      if (!c || c.visivel === false) {
        floatingUi.classList.add('hide');
        bar.classList.add('hide');
        extHandles.classList.add('hide');
        return;
      }
      const node = contentLayer.findOne(n => n.getAttr && n.getAttr('bigaId') === c.id);
      if (!node) {
        floatingUi.classList.add('hide');
        return;
      }
      floatingUi.classList.remove('hide');
      bar.classList.remove('hide');
      extHandles.classList.toggle('hide', Boolean(c.travada));

      const areaRect = stageArea.getBoundingClientRect();
      const stageRect = stageContainer.getBoundingClientRect();
      const box = node.getClientRect({ relativeTo: stage });
      const left = (stageRect.left - areaRect.left) + box.x;
      const top = (stageRect.top - areaRect.top) + box.y;
      const right = left + box.width;
      const bottom = top + box.height;
      const cx = (left + right) / 2;

      const barW = bar.offsetWidth || 210;
      const barH = bar.offsetHeight || 34;
      const maxX = Math.max(8, areaRect.width - barW - 8);
      const maxY = Math.max(6, areaRect.height - barH - 6);
      const barX = clamp(Math.round(cx - barW / 2), 8, maxX);
      let barY = Math.round(top - barH - 10);
      if (barY < 6) {
        barY = Math.round(bottom + 54);
        if (barY > maxY) barY = 6;
      }
      bar.style.left = `${barX}px`;
      bar.style.top = `${clamp(barY, 6, maxY)}px`;

      if (!c.travada) {
        const hw = extHandles.offsetWidth || 84;
        const hh = extHandles.offsetHeight || 36;
        const hx = clamp(Math.round(cx - hw / 2), 8, Math.max(8, areaRect.width - hw - 8));
        let hy = Math.round(bottom + 10);
        if (hy + hh > areaRect.height - 6) {
          hy = Math.max(6, Math.round(top - hh - 10));
        }
        extHandles.style.left = `${hx}px`;
        extHandles.style.top = `${clamp(hy, 6, Math.max(6, areaRect.height - hh - 6))}px`;
      }
    }

    function atualizarVidrosDoSlide(renderCtx) {
      const sl = slideAtual();
      if (!sl) return;
      contentLayer.getChildren().forEach(grp => {
        const kGlass = grp.getAttr && grp.getAttr('bigaGlassImg');
        const camVidro = grp.getAttr && grp.getAttr('bigaGlassCam');
        if (kGlass && camVidro && Number(camVidro.blurFundo) > 0) {
          kGlass.image(construirCanvasVidroKonva(camVidro, sl, renderCtx));
        }
      });
      contentLayer.batchDraw();
    }

    // ---------------- Renderização do Palco Konva
    function atualizarSelecaoKonva() {
      const c = camada(E.sel);
      if (!c || !c.visivel || c.travada) {
        transformer.nodes([]);
        overlayLayer.batchDraw();
        posicionarControlesFlutuantes();
        return;
      }
      const node = contentLayer.findOne(n => n.getAttr && n.getAttr('bigaId') === c.id);
      if (!node) {
        transformer.nodes([]);
        overlayLayer.batchDraw();
        posicionarControlesFlutuantes();
        return;
      }
      const box = node.getClientRect({ relativeTo: stage });
      const pequeno = Math.min(box.width, box.height) < 90;
      transformer.nodes([node]);
      transformer.rotateEnabled(false);
      if (c.tipo === 'poligono') {
        transformer.resizeEnabled(false);
        transformer.enabledAnchors([]);
      } else {
        transformer.resizeEnabled(true);
        const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
        if (pequeno || c.tipo === 'icone' || c.tipo === 'circulo') {
          transformer.enabledAnchors(corners);
        } else {
          transformer.enabledAnchors([
            'top-left', 'top-center', 'top-right',
            'middle-right', 'middle-left',
            'bottom-left', 'bottom-center', 'bottom-right'
          ]);
        }
      }
      overlayLayer.batchDraw();
      posicionarControlesFlutuantes();
    }

    function desenharPalco() {
      const sl = slideAtual();
      if (!sl) return;
      const [W, H] = dimensoesDoc(E.doc);
      bgRect.width(W);
      bgRect.height(H);
      bgRect.fill(hexRgba(sl.fundo || '#171721'));
      bgLayer.batchDraw();

      contentLayer.destroyChildren();
      const vars = varsAtuais();
      const renderCtx = {
        vars,
        kit: E.kit,
        prop: E.prop,
        fotoUrlFn,
        loadedImgs: new Map(),
        onFotoPronta: () => atualizarVidrosDoSlide(renderCtx)
      };

      for (const c of sl.camadas) {
        const group = construirGrupoCamadaKonva(c, sl, {
          ...renderCtx,
          selecionada: c.id === E.sel,
          onPolyVertexDrag: (fase, cam) => {
            if (fase === 'start') marcar();
            if (fase === 'move') {
              transformer.forceUpdate();
              overlayLayer.batchDraw();
            }
          },
          onPolyVertexEnd: cam => {
            // Atualiza w/h da bounding box dos vértices
            const xs = cam.vertices.map(v => v.x);
            const ys = cam.vertices.map(v => v.y);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            const maxX = Math.max(...xs);
            const maxY = Math.max(...ys);
            if (!cam.rot && !cam.skewX && !cam.skewY && (minX !== 0 || minY !== 0)) {
              cam.x = Math.round((cam.x || 0) + minX);
              cam.y = Math.round((cam.y || 0) + minY);
              cam.vertices = cam.vertices.map(v => ({ x: Math.round(v.x - minX), y: Math.round(v.y - minY) }));
            }
            cam.w = Math.max(8, Math.round(maxX - minX));
            cam.h = Math.max(8, Math.round(maxY - minY));
            desenharPalco();
            renderContextBar();
            renderPainelPropriedadesValores();
            notificarMudancaDoc();
          }
        });
        if (!group) continue;

        group.on('pointerdown touchstart mousedown', ev => {
          ev.cancelBubble = true;
          if (E.sel !== c.id) {
            E.sel = c.id;
            E.propPainel = null;
            if (E.sheetAberta && E.sheetModo === 'prop') fecharSheetUi();
            if (c.tipo === 'poligono') desenharPalco();
            else atualizarSelecaoKonva();
            renderContextBar();
            renderBottomBar();
            renderPainel();
          } else {
            posicionarControlesFlutuantes();
          }
        });

        group.on('dblclick dbltap', ev => {
          ev.cancelBubble = true;
          if (c.tipo === 'texto' && !c.travada) abrirEdicaoInlineTexto(c, group);
        });

        let dragEnq = null;
        group.on('dragstart', () => {
          if (c.travada) return;
          marcar();
          if (c.tipo === 'foto' && E.enquadrar) {
            dragEnq = { x: group.x(), y: group.y(), offX: Number(c.offX ?? 0), offY: Number(c.offY ?? 0) };
          } else {
            dragEnq = null;
          }
        });

        group.on('dragmove', () => {
          if (c.travada) return;
          if (dragEnq) {
            const dx = group.x() - dragEnq.x;
            const dy = group.y() - dragEnq.y;
            group.x(dragEnq.x);
            group.y(dragEnq.y);
            c.offX = clamp(Math.round((dragEnq.offX - (dx / (c.w || 200)) * 2) * 100) / 100, -1, 1);
            c.offY = clamp(Math.round((dragEnq.offY - (dy / (c.h || 200)) * 2) * 100) / 100, -1, 1);
            const kImg = group.getAttr('bigaKImg');
            const img = group.getAttr('bigaLoadedImg');
            if (kImg && img) {
              kImg.image(construirCanvasFotoOffscreen(c, img, 'Sem foto do imóvel'));
              contentLayer.batchDraw();
            }
            renderPainelPropriedadesValores();
            return;
          }
          aplicarSnap(group);
          c.x = Math.round(group.x());
          c.y = Math.round(group.y());
          atualizarVidrosDoSlide(renderCtx);
          posicionarControlesFlutuantes();
          renderPainelPropriedadesValores();
        });

        group.on('dragend', () => {
          limparGuias();
          if (dragEnq) {
            group.x(dragEnq.x);
            group.y(dragEnq.y);
            dragEnq = null;
          } else {
            c.x = Math.round(group.x());
            c.y = Math.round(group.y());
          }
          atualizarVidrosDoSlide(renderCtx);
          posicionarControlesFlutuantes();
          atualizarMiniaturaSlideAtual();
          notificarMudancaDoc();
        });

        group.on('transform', () => {
          transformer.keepRatio(E.uniforme !== E.shiftDown);
          posicionarControlesFlutuantes();
        });

        group.on('transformstart', () => {
          marcar();
        });

        group.on('transformend', () => {
          const sx = group.scaleX();
          const sy = group.scaleY();
          c.x = Math.round(group.x());
          c.y = Math.round(group.y());
          c.rot = Math.round(group.rotation());
          if (c.rot > 180) c.rot -= 360;
          if (c.rot < -180) c.rot += 360;

          if (c.tipo === 'texto') {
            const activeAnchor = transformer.getActiveAnchor();
            if (activeAnchor === 'middle-left' || activeAnchor === 'middle-right') {
              c.w = Math.max(40, Math.round((c.w || 200) * sx));
            } else if (activeAnchor === 'top-center' || activeAnchor === 'bottom-center') {
              c.escalaY = clamp(Math.round((c.escalaY || 1) * sy * 100) / 100, 0.1, 5);
            } else if (E.uniforme !== E.shiftDown) {
              const fator = Math.abs(sx) > Math.abs(sy) ? sx : sy;
              c.tamanho = clamp(Math.round((c.tamanho || 40) * fator), 6, 600);
              c.w = Math.max(40, Math.round((c.w || 200) * fator));
            } else {
              c.escalaX = clamp(Math.round((c.escalaX || 1) * sx * 100) / 100, 0.1, 5);
              c.escalaY = clamp(Math.round((c.escalaY || 1) * sy * 100) / 100, 0.1, 5);
              c.w = Math.max(40, Math.round((c.w || 200) * sx));
            }
          } else if (c.tipo !== 'poligono') {
            c.w = Math.max(8, Math.round((c.w || 100) * sx));
            c.h = Math.max(8, Math.round((c.h || 100) * sy));
          }
          group.scaleX(1);
          group.scaleY(1);
          desenharPalco();
          renderContextBar();
          renderPainel();
          atualizarMiniaturaSlideAtual();
          notificarMudancaDoc();
        });

        contentLayer.add(group);
      }

      contentLayer.batchDraw();
      atualizarSelecaoKonva();
    }

    stage.on('pointerdown touchstart mousedown', ev => {
      if (ev.target === stage) {
        E.sel = null;
        E.propPainel = null;
        if (E.sheetAberta && E.sheetModo === 'prop') fecharSheetUi();
        desenharPalco();
        renderContextBar();
        renderBottomBar();
        renderPainel();
      }
    });

    // ---------------- Edição Inline de Texto sobre o Canvas
    function abrirEdicaoInlineTexto(c, group) {
      fecharEdicaoInline(false);
      const textoNode = group.getAttr('bigaTextNode');
      const resolvidoInicial = textoResolvidoDe(c, varsAtuais());
      const rectStage = stageContainer.getBoundingClientRect();
      const absPos = group.getAbsolutePosition();
      const sc = E.stageScale || 1;
      const pad = c.fundo ? (Number(c.folga) || 0) : 0;

      if (textoNode) textoNode.hide();
      contentLayer.batchDraw();

      const ta = document.createElement('textarea');
      ta.className = 'studio-inline-textarea';
      ta.value = resolvidoInicial;
      ta.style.left = `${rectStage.left + absPos.x + pad * sc}px`;
      ta.style.top = `${rectStage.top + absPos.y + pad * sc}px`;
      ta.style.width = `${Math.max(80, ((c.w || 200) - pad * 2) * sc)}px`;
      ta.style.minHeight = `${Math.max(40, ((c.h || 60) - pad * 2) * sc)}px`;
      ta.style.fontFamily = `"${safeFont(c.fonte)}", sans-serif`;
      ta.style.fontSize = `${Math.max(12, (c.tamanho || 36) * sc)}px`;
      ta.style.fontWeight = String(c.peso || 400);
      ta.style.fontStyle = c.italico ? 'italic' : 'normal';
      ta.style.lineHeight = String(c.entrelinha || 1.15);
      ta.style.textAlign = c.alinhamento || 'left';
      ta.style.color = hexRgba(c.cor || '#ffffff');
      if (c.rot) ta.style.transform = `rotate(${c.rot}deg)`;

      document.body.appendChild(ta);
      ta.focus();
      ta.select();

      E.inlineEdit = { ta, c, textoNode, resolvidoInicial };

      ta.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          fecharEdicaoInline(false);
        } else if (ev.key === 'Enter' && !ev.shiftKey) {
          ev.preventDefault();
          fecharEdicaoInline(true);
        }
      });
      ta.addEventListener('blur', () => fecharEdicaoInline(true));
    }

    function fecharEdicaoInline(salvar) {
      const ed = E.inlineEdit;
      if (!ed) return;
      E.inlineEdit = null;
      const { ta, c, textoNode, resolvidoInicial } = ed;
      const novoVal = ta.value;
      ta.remove();
      if (textoNode) textoNode.show();

      if (salvar && novoVal !== resolvidoInicial) {
        marcar();
        if (detectarCampoVinculado(c.texto)) {
          c.campoVinculadoAnterior = c.texto;
        }
        c.texto = novoVal;
        desenharPalco();
        renderContextBar();
        renderPainel();
        atualizarMiniaturaSlideAtual();
        notificarMudancaDoc();
      } else {
        contentLayer.batchDraw();
      }
    }

    // ---------------- Atualização de Controles & UI
    function atualizarBotoesHist() {
      const bUndo = qs('[data-st="desfazer"]');
      const bRedo = qs('[data-st="refazer"]');
      if (bUndo) bUndo.disabled = !E.hist.length;
      if (bRedo) bRedo.disabled = !E.fut.length;
    }

    function preencherSelectsTopbar() {
      const selIm = qs('select[name="stImovel"]');
      if (selIm) {
        const inv = getInventario();
        selIm.innerHTML = inv.length
          ? inv.map(p => `<option value="${esc(p.id)}" ${E.prop && String(E.prop.id) === String(p.id) ? 'selected' : ''}>#${esc(p.id)} · ${esc(p.tipo || 'Imóvel')}${p.setor ? ' · ' + esc(p.setor) : ''}</option>`).join('')
          : '<option value="">Sem imóvel na carteira</option>';
      }
      const selFmt = qs('select[name="stFormato"]');
      if (selFmt) selFmt.value = E.doc.formato || 'feed';
      const cnt = qs('#stPageCounter');
      if (cnt) cnt.textContent = `${E.slideIdx + 1} / ${E.doc.slides.length}`;
      const selZoom = qs('select[name="stZoom"]');
      if (selZoom) selZoom.value = String(E.zoomModo);
    }

    function fecharSheetUi() {
      E.sheetAberta = false;
      E.propPainel = null;
      const sheet = qs('#stMobileSheet');
      sheet?.classList.add('hide');
      sheet?.classList.remove('compact');
      qs('#stSheetBackdrop')?.classList.add('hide');
      renderBottomBar();
    }

    function renderContextBar() {
      const bar = qs('#stContextBar');
      if (!bar) return;
      const c = camada(E.sel);
      if (!c) {
        bar.classList.add('hide');
        bar.innerHTML = '';
        posicionarControlesFlutuantes();
        return;
      }
      const vinculo = c.tipo === 'texto' ? detectarCampoVinculado(c.texto) : null;
      const temReconectar = c.tipo === 'texto' && !vinculo && Boolean(c.campoVinculadoAnterior);

      bar.innerHTML = `
        ${vinculo ? `<span class="studio-badge-auto" title="Atualiza automaticamente conforme o imóvel">⚡ Automático</span>` : ''}
        ${temReconectar ? `<button type="button" class="studio-ctx-btn accent" data-st="reconectar" title="Reconectar ao imóvel">⚡ Reconectar</button>` : ''}
        <button type="button" class="studio-ctx-btn" data-st="duplicar" title="Duplicar (Ctrl+D)">Duplicar</button>
        <button type="button" class="studio-ctx-btn" data-st="abrirCamadasRapido" title="Camadas">Camadas</button>
        <button type="button" class="studio-ctx-btn danger" data-st="apagar" title="Apagar (Del)">Apagar</button>
      `;
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => posicionarControlesFlutuantes());
      } else {
        posicionarControlesFlutuantes();
      }
    }

    // Drag das 2 alças externas (↻ Girar e ✥ Mover com precisão)
    function bindControlesFlutuantes() {
      if (!extHandles) return;
      let dragState = null;

      extHandles.addEventListener('pointerdown', ev => {
        const btn = ev.target.closest('[data-st-ext]');
        if (!btn) return;
        const c = camada(E.sel);
        if (!c || c.travada) return;
        const node = contentLayer.findOne(n => n.getAttr && n.getAttr('bigaId') === c.id);
        if (!node) return;
        ev.preventDefault();
        ev.stopPropagation();

        const mode = btn.dataset.stExt;
        marcar();
        const sc = Math.max(0.15, E.stageScale || 1);

        if (mode === 'girar') {
          const sr = stageContainer.getBoundingClientRect();
          const box = node.getClientRect({ relativeTo: stage });
          const cxScreen = sr.left + box.x + box.width / 2;
          const cyScreen = sr.top + box.y + box.height / 2;
          const cxStage = box.x / sc + (box.width / sc) / 2;
          const cyStage = box.y / sc + (box.height / sc) / 2;
          const rot0 = Number(c.rot) || 0;
          const ang0 = Math.atan2(ev.clientY - cyScreen, ev.clientX - cxScreen);
          dragState = {
            mode: 'girar', btn, c, node, sc, cxScreen, cyScreen,
            cxStage, cyStage, p0x: node.x(), p0y: node.y(), rot0, ang0
          };
          if (extDegEl) {
            extDegEl.textContent = `${Math.round(rot0)}°`;
            extDegEl.classList.remove('hide');
          }
        } else {
          dragState = {
            mode: 'mover', btn, c, node, sc,
            startX: ev.clientX, startY: ev.clientY,
            origX: node.x(), origY: node.y()
          };
        }
        try { btn.setPointerCapture(ev.pointerId); } catch {}
      });

      extHandles.addEventListener('pointermove', ev => {
        if (!dragState) return;
        const { mode, c, node, sc } = dragState;
        if (mode === 'girar') {
          const ang = Math.atan2(ev.clientY - dragState.cyScreen, ev.clientX - dragState.cxScreen);
          let delta = ((ang - dragState.ang0) * 180) / Math.PI;
          let rot = dragState.rot0 + delta;
          if (ev.shiftKey) rot = Math.round(rot / 15) * 15;
          else {
            const snap45 = Math.round(rot / 45) * 45;
            if (Math.abs(rot - snap45) <= 3.5) rot = snap45;
          }
          rot = Math.round(rot);
          while (rot > 180) rot -= 360;
          while (rot < -180) rot += 360;
          const dRad = ((rot - dragState.rot0) * Math.PI) / 180;
          const vx = dragState.p0x - dragState.cxStage;
          const vy = dragState.p0y - dragState.cyStage;
          const nx = dragState.cxStage + vx * Math.cos(dRad) - vy * Math.sin(dRad);
          const ny = dragState.cyStage + vx * Math.sin(dRad) + vy * Math.cos(dRad);
          node.x(nx);
          node.y(ny);
          node.rotation(rot);
          c.x = Math.round(nx);
          c.y = Math.round(ny);
          c.rot = rot;
          if (extDegEl) extDegEl.textContent = `${rot}°`;
          transformer.forceUpdate();
          contentLayer.batchDraw();
          overlayLayer.batchDraw();
          posicionarControlesFlutuantes();
          renderPainelPropriedadesValores();
        } else {
          const dx = (ev.clientX - dragState.startX) / sc;
          const dy = (ev.clientY - dragState.startY) / sc;
          node.x(dragState.origX + dx);
          node.y(dragState.origY + dy);
          aplicarSnap(node);
          c.x = Math.round(node.x());
          c.y = Math.round(node.y());
          contentLayer.batchDraw();
          overlayLayer.batchDraw();
          posicionarControlesFlutuantes();
          renderPainelPropriedadesValores();
        }
      });

      const endExt = () => {
        if (!dragState) return;
        const mode = dragState.mode;
        try { dragState.btn.releasePointerCapture && dragState.btn.releasePointerCapture(); } catch {}
        dragState = null;
        if (extDegEl) extDegEl.classList.add('hide');
        if (mode === 'mover') limparGuias();
        desenharPalco();
        renderContextBar();
        renderPainelPropriedadesValores();
        atualizarMiniaturaSlideAtual();
        notificarMudancaDoc();
      };
      extHandles.addEventListener('pointerup', endExt);
      extHandles.addEventListener('pointercancel', endExt);
    }
    bindControlesFlutuantes();

    // ---------------- Filmstrip & Dots de Páginas
    async function gerarMiniaturaSlide(sIdx) {
      const sl = E.doc.slides[sIdx];
      if (!sl) return '';
      const [W, H] = dimensoesDoc(E.doc);
      const tw = 160;
      const th = Math.max(40, Math.round((H / W) * tw));
      const png = await renderizarMiniaturaCanvas(sl, varsAtuais(), E.kit, tw, th, { docW: W, docH: H, prop: E.prop, fotoUrl: fotoUrlFn });
      E.thumbsCache.set(sl.id, png);
      const img = el.querySelector(`[data-thumb-slide="${CSS.escape(sl.id)}"]`);
      if (img && png) img.src = png;
      return png;
    }

    function atualizarMiniaturaSlideAtual() {
      clearTimeout(E._thumbTimer);
      E._thumbTimer = setTimeout(() => gerarMiniaturaSlide(E.slideIdx), 180);
    }

    function renderFilmstrip() {
      const strip = qs('#stFilmstrip');
      const dots = qs('#stMobileDots');
      const [W, H] = dimensoesDoc(E.doc);

      if (strip) {
        strip.innerHTML = E.doc.slides.map((sl, idx) => {
          const cached = E.thumbsCache.get(sl.id);
          return `
            <div class="studio-thumb-card ${idx === E.slideIdx ? 'active' : ''}" data-st="irSlide" data-idx="${idx}">
              <div class="studio-thumb-frame" style="aspect-ratio:${W}/${H}">
                <img data-thumb-slide="${esc(sl.id)}" src="${cached ? esc(cached) : ''}" alt="Página ${idx + 1}">
                <span class="studio-thumb-num">${idx + 1}</span>
                ${E.doc.slides.length > 1 ? `<button type="button" class="studio-thumb-del" data-st="rmSlide" data-idx="${idx}" title="Remover página">×</button>` : ''}
              </div>
              <span class="studio-thumb-label">${esc(sl.nome || `Página ${idx + 1}`)}</span>
            </div>`;
        }).join('') + `
          <button type="button" class="studio-add-slide-btn" data-st="addSlide">
            <span>＋</span>
            <small>Página</small>
          </button>`;

        E.doc.slides.forEach((_, idx) => {
          if (!E.thumbsCache.has(E.doc.slides[idx].id)) gerarMiniaturaSlide(idx);
        });
      }

      if (dots) {
        dots.innerHTML = E.doc.slides.map((sl, idx) => `
          <button type="button" class="studio-dot-btn ${idx === E.slideIdx ? 'active' : ''}" data-st="irSlide" data-idx="${idx}">${idx + 1}</button>
        `).join('') + `<button type="button" class="studio-dot-btn add" data-st="addSlide" title="Nova página">＋</button>`;
      }
    }

    // ---------------- Barra Inferior Contextual em 2 Modos (Criação vs Edição)
    function toolIconHtml(id, c) {
      const svgs = {
        editar: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
        fonte: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
        tamanho: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17h4l-2-6z"/><path d="M13 19h8l-4-12z"/></svg>',
        formato: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>',
        espacamento: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5v14M20 5v14M8 12h8M10 10l-2 2 2 2M14 10l2 2-2 2"/></svg>',
        efeitos: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.9 4.5L18.5 9l-4.6 1.5L12 15l-1.9-4.5L5.5 9l4.6-1.5Z"/><path d="M19 15v5M16.5 17.5h5"/></svg>',
        transparencia: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 12h16M12 4v16" opacity=".5"/></svg>',
        camadas: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 12 12 17 22 12"/><polyline points="2 17 12 22 22 17"/></svg>',
        posicao: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3"/></svg>',
        substituir: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 15-5-5-11 9"/></svg>',
        enquadrar: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>',
        ajustarFoto: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="2" y1="14" x2="6" y2="14"/><line x1="10" y1="8" x2="14" y2="8"/><line x1="18" y1="16" x2="22" y2="16"/></svg>',
        cantos: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 11V7a3 3 0 0 1 3-3h4"/><rect x="8" y="8" width="12" height="12" rx="4" opacity=".55"/></svg>',
        estiloBorda: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="3"/><line x1="8" y1="12" x2="16" y2="12" stroke-width="3"/></svg>',
        perspectiva: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><polygon points="6 4 18 7 21 20 3 17 6 4"/></svg>',
        modelos: svgIconeHtml('estrela', 19),
        elementos: svgIconeHtml('selo-exclusivo', 19),
        texto: svgIconeHtml('selo-novo', 19),
        galeria: svgIconeHtml('casa', 19),
        marca: svgIconeHtml('chave', 19)
      };
      if (id === 'cor') {
        const tc = c ? (c.cor || c.cor2 || c.corFundo || c.corEscuro || '#5266eb') : '#5266eb';
        return `<span class="studio-tool-cdot" style="--tc:${esc(hexRgba(tc))}"></span>`;
      }
      return Object.prototype.hasOwnProperty.call(svgs, id) ? svgs[id] : svgIconeHtml('area', 18);
    }

    function renderBottomBar() {
      const bar = qs('#stBottomBar');
      if (!bar) return;
      const c = camada(E.sel);
      if (!c) {
        const itens = [
          ['modelos', 'Modelos'],
          ['elementos', 'Elementos'],
          ['texto', 'Texto'],
          ['galeria', 'Galeria'],
          ['marca', 'Marca'],
          ['camadas', 'Camadas']
        ];
        bar.classList.remove('edit-mode');
        bar.innerHTML = itens.map(([id, lbl]) => {
          const active = E.sheetAberta && E.sheetModo === 'aba' && E.abaAtiva === id;
          return `
            <button type="button" class="studio-bottom-btn ${active ? 'active' : ''}" data-st="sheet" data-aba="${id}">
              ${toolIconHtml(id, null)}
              <span>${esc(lbl)}</span>
            </button>`;
        }).join('');
        return;
      }

      let tools;
      if (c.tipo === 'texto') {
        tools = [
          ['editar', 'Editar'],
          ['fonte', 'Fonte'],
          ['tamanho', 'Tamanho'],
          ['cor', 'Cor'],
          ['formato', 'Formato'],
          ['espacamento', 'Espaçamento'],
          ['efeitos', 'Efeitos'],
          ['transparencia', 'Transparência'],
          ['camadas', 'Camadas'],
          ['posicao', 'Posição']
        ];
      } else if (c.tipo === 'foto') {
        tools = [
          ['substituir', 'Substituir'],
          ['enquadrar', 'Enquadrar'],
          ['ajustarFoto', 'Ajustar'],
          ['cantos', 'Cantos'],
          ['transparencia', 'Transparência'],
          ['camadas', 'Camadas'],
          ['posicao', 'Posição']
        ];
      } else {
        tools = [
          ['cor', 'Cor'],
          ['estiloBorda', 'Estilo/Borda'],
          ['perspectiva', 'Perspectiva'],
          ['cantos', 'Cantos'],
          ['transparencia', 'Transparência'],
          ['camadas', 'Camadas'],
          ['posicao', 'Posição']
        ];
      }

      bar.classList.add('edit-mode');
      bar.innerHTML = `
        <div class="studio-edit-tools" data-allow-scroll="1">
          ${tools.map(([id, lbl]) => {
            const active = E.sheetAberta && ((id === 'camadas' && E.sheetModo === 'aba' && E.abaAtiva === 'camadas') || (E.sheetModo === 'prop' && E.propPainel === id));
            return `
              <button type="button" class="studio-bottom-btn ${active ? 'active' : ''}" data-st="propTool" data-prop="${id}">
                ${toolIconHtml(id, c)}
                <span>${esc(lbl)}</span>
              </button>`;
          }).join('')}
        </div>
        <button type="button" class="studio-done-btn" data-st="concluirEdicao" aria-label="Concluir edição" title="Concluir">✓</button>`;
    }

    function titulosPropPainel(prop) {
      return new Map([
        ['editar', 'Editar Texto'],
        ['fonte', 'Fonte & Peso'],
        ['tamanho', 'Tamanho'],
        ['cor', 'Cor'],
        ['formato', 'Formato & Alinhamento'],
        ['espacamento', 'Espaçamento'],
        ['efeitos', 'Fundo, Sombra & Contorno'],
        ['transparencia', 'Transparência'],
        ['posicao', 'Posição & Alinhamento'],
        ['substituir', 'Substituir Foto'],
        ['enquadrar', 'Enquadramento'],
        ['ajustarFoto', 'Luz, Cor & Desfoque'],
        ['cantos', 'Arredondar Cantos'],
        ['estiloBorda', 'Estilo & Borda'],
        ['perspectiva', 'Perspectiva & Inclinação']
      ]).get(prop) || 'Propriedade';
    }

    function htmlMiniPainel(propKey, c) {
      if (!c) return htmlAbaAjustar();
      const wrap = body => `<div class="studio-stack studio-mini-panel">${body}</div>`;

      if (propKey === 'editar') {
        const vinculo = detectarCampoVinculado(c.texto);
        const temReconn = !vinculo && Boolean(c.campoVinculadoAnterior);
        const textoExibido = textoResolvidoDe({ ...c, maiusculas: false }, varsAtuais());
        const chipsRapidos = CAMPOS_INTELIGENTES.slice(0, 10).map(([tk, lbl]) => `
          <button type="button" class="studio-chip-btn ${c.texto === tk ? 'active' : ''}" data-st="inserirDado" data-token="${esc(tk)}" data-label="${esc(lbl)}">${esc(lbl)}</button>
        `).join('');
        return wrap(`
          <div class="studio-row-between">
            ${vinculo ? `<span class="studio-badge-auto">⚡ Automático: ${esc(vinculo)}</span>` : '<span></span>'}
            <button type="button" class="studio-pill-btn" data-st="editarInline">Editar na arte</button>
          </div>
          ${temReconn ? `<button type="button" class="studio-pill-btn full accent" data-st="reconectar">⚡ Reconectar ao imóvel</button>` : ''}
          <textarea data-k="texto_visual" rows="3" placeholder="Digite o texto…">${esc(textoExibido)}</textarea>
          <span class="studio-sec-label">Vincular dado do imóvel</span>
          <div class="studio-chips-wrap">${chipsRapidos}</div>
        `);
      }

      if (propKey === 'fonte') {
        return wrap(`
          <div class="studio-font-picker">
            <span class="studio-sec-label">Atual: <b style="font-family:'${esc(safeFont(c.fonte))}'">${esc(c.fonte)}</b></span>
            <div class="studio-row-tight">
              <input type="search" data-stf="busca" placeholder="Buscar fonte…" value="${esc(E.fonteBusca)}">
              <select data-stf="cat">
                <option value="">Todas</option>
                ${Object.entries(CAT_FONTES).map(([k, v]) => `<option value="${k}" ${E.fonteCat === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}
              </select>
            </div>
            <div class="studio-font-list" id="stFontList"></div>
          </div>
          <label class="studio-field"><span>Peso da fonte</span><select data-k="peso">${pesosDe(c.fonte).map(w => `<option value="${w}" ${Number(w) === Number(c.peso) ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
        `);
      }

      if (propKey === 'tamanho') {
        return wrap(`
          <div class="studio-row-tight">
            <button type="button" class="studio-pill-btn" data-st="tamMenos">A−</button>
            <strong class="studio-size-readout">${Math.round(c.tamanho || 40)} px</strong>
            <button type="button" class="studio-pill-btn" data-st="tamMais">A+</button>
          </div>
          ${numCampo('tamanho', 'Tamanho (px)', c.tamanho, 6, 400)}
          ${chkCampo('autoFit', 'Auto-ajuste na caixa', c.autoFit)}
        `);
      }

      if (propKey === 'cor') {
        if (c.tipo === 'degrade') {
          return wrap(`
            ${corCampo('cor1', 'Cor inicial', c.cor1 || '#00000000')}
            ${corCampo('cor2', 'Cor final', c.cor2 || '#000000cc')}
            ${numCampo('angulo', 'Direção (°)', c.angulo ?? 180, 0, 360)}
          `);
        }
        if (c.tipo === 'qrcode') {
          return wrap(`
            <label class="studio-field"><span>URL / WhatsApp</span><input type="text" data-k="url" value="${esc(c.url || '')}" placeholder="Automático do imóvel"></label>
            ${corCampo('corEscuro', 'Cor dos pontos', c.corEscuro || '#171721')}
            ${corCampo('corClaro', 'Cor do fundo', c.corClaro || '#ffffff')}
          `);
        }
        if (c.tipo === 'logo') {
          return wrap(`
            <label class="studio-field"><span>Origem</span><select data-k="origem"><option value="kit" ${c.origem !== 'custom' ? 'selected' : ''}>Logo do Kit de Marca</option><option value="custom" ${c.origem === 'custom' ? 'selected' : ''}>Customizada</option></select></label>
            ${corCampo('corFundo', 'Cor do monograma', c.corFundo || '#5266eb')}
            ${corCampo('corTexto', 'Cor da letra', c.corTexto || '#ffffff')}
          `);
        }
        return wrap(`
          ${corCampo('cor', c.tipo === 'texto' ? 'Cor do texto' : 'Cor principal', c.cor || '#ffffff')}
          ${c.tipo === 'icone' && c.formaFundo && c.formaFundo !== 'nenhum' ? corCampo('corFundo', 'Cor do fundo', c.corFundo || '#5266eb') : ''}
        `);
      }

      if (propKey === 'formato') {
        return wrap(`
          <div class="studio-seg-row">
            <button type="button" class="studio-seg-btn ${Number(c.peso) >= 600 ? 'active' : ''}" data-st="toggleBold"><b>B</b></button>
            <button type="button" class="studio-seg-btn ${c.italico ? 'active' : ''}" data-st="toggleItalico"><i>I</i></button>
            <button type="button" class="studio-seg-btn ${c.maiusculas ? 'active' : ''}" data-st="toggleCaps">AA</button>
            <button type="button" class="studio-seg-btn ${(!c.alinhamento || c.alinhamento === 'left') ? 'active' : ''}" data-st="setAlinhamento" data-val="left">Esq</button>
            <button type="button" class="studio-seg-btn ${c.alinhamento === 'center' ? 'active' : ''}" data-st="setAlinhamento" data-val="center">Centro</button>
            <button type="button" class="studio-seg-btn ${c.alinhamento === 'right' ? 'active' : ''}" data-st="setAlinhamento" data-val="right">Dir</button>
          </div>
          <label class="studio-field"><span>Quando cresce</span><select data-k="ancora"><option value="topo" ${c.ancora !== 'base' ? 'selected' : ''}>Para baixo</option><option value="base" ${c.ancora === 'base' ? 'selected' : ''}>Para cima (base fixa)</option></select></label>
        `);
      }

      if (propKey === 'espacamento') {
        return wrap(`
          ${numCampo('espacamento', 'Espaço entre letras', c.espacamento || 0, -10, 60, 0.5)}
          ${numCampo('entrelinha', 'Altura da linha', c.entrelinha || 1.15, 0.6, 2.5, 0.05)}
        `);
      }

      if (propKey === 'efeitos') {
        return wrap(`
          ${chkCampo('fundo', 'Fundo (etiqueta)', c.fundo)}
          ${c.fundo ? corCampo('corFundo', 'Cor do fundo', c.corFundo || '#5266eb') + numCampo('raioFundo', 'Arredondar fundo', c.raioFundo || 0, 0, 200) + numCampo('folga', 'Folga interna', c.folga || 0, 0, 120) : ''}
          ${numCampo('sombra', 'Sombra', c.sombra || 0, 0, 60)}
          ${c.sombra ? corCampo('corSombra', 'Cor da sombra', c.corSombra || '#000000') : ''}
          ${numCampo('contorno', 'Contorno', c.contorno || 0, 0, 30)}
          ${c.contorno ? corCampo('corContorno', 'Cor do contorno', c.corContorno || '#000000') : ''}
        `);
      }

      if (propKey === 'transparencia') {
        return wrap(numCampo('opacidade', 'Opacidade', c.opacidade ?? 1, 0, 1, 0.01));
      }

      if (propKey === 'posicao') {
        return wrap(`
          <div class="studio-align-row">
            ${[['esq', '⇤'], ['ch', '↔'], ['dir', '⇥'], ['topo', '⤒'], ['cv', '↕'], ['base', '⤓']].map(([k, ic]) => `<button type="button" class="studio-align-btn" data-st="alinhar" data-a="${k}" title="Alinhar">${ic}</button>`).join('')}
          </div>
          <div class="studio-grid-2">
            ${numCampo('x', 'X', c.x, -2000, 4000)}
            ${numCampo('y', 'Y', c.y, -2000, 4000)}
            ${numCampo('w', 'Largura', c.w, 8, 4000)}
            ${numCampo('h', 'Altura', c.h, 8, 4000)}
          </div>
          ${numCampo('rot', 'Girar (°)', c.rot, -180, 180)}
        `);
      }

      if (propKey === 'substituir') {
        const fotos = fotosDe(E.prop);
        return wrap(`
          <label class="studio-upload-btn">
            <input type="file" accept="image/*" name="stUploadFoto">
            <span>＋ Enviar foto do aparelho</span>
          </label>
          ${fotos.length ? `<div class="studio-photo-strip">${fotos.slice(0, 18).map((f, i) => `<button type="button" class="${i === c.indiceFoto ? 'sel' : ''}" data-st="trocarFotoCamada" data-i="${i}"><img src="${esc(fotoUrlFn(f))}" alt=""></button>`).join('')}</div>` : '<p class="studio-hint">Este imóvel não possui fotos cadastradas.</p>'}
        `);
      }

      if (propKey === 'enquadrar') {
        return wrap(`
          ${chkCampo('__enquadrar', 'Enquadrar foto ao arrastar', E.enquadrar)}
          ${numCampo('zoom', 'Zoom da foto', c.zoom ?? 1, 1, 4, 0.01)}
          <div class="studio-grid-2">${numCampo('offX', 'Enquadrar ↔', c.offX ?? 0, -1, 1, 0.01)}${numCampo('offY', 'Enquadrar ↕', c.offY ?? 0, -1, 1, 0.01)}</div>
        `);
      }

      if (propKey === 'ajustarFoto') {
        return wrap(`
          ${numCampo('brilho', 'Brilho', c.brilho ?? 100, 0, 200)}
          ${numCampo('contraste', 'Contraste', c.contraste ?? 100, 0, 200)}
          ${numCampo('saturacao', 'Saturação', c.saturacao ?? 100, 0, 200)}
          ${numCampo('desfoque', 'Desfoque', c.desfoque ?? 0, 0, 30)}
        `);
      }

      if (propKey === 'cantos') {
        if (c.tipo === 'icone' || c.tipo === 'logo') {
          const val = c.tipo === 'icone' ? c.formaFundo : c.forma;
          const kNome = c.tipo === 'icone' ? 'formaFundo' : 'forma';
          return wrap(`
            <label class="studio-field"><span>Formato do fundo</span><select data-k="${kNome}">${[['nenhum', 'Sem fundo'], ['circulo', 'Circular'], ['quadrado', 'Quadrado']].concat(c.tipo === 'icone' ? [['pilula', 'Pílula']] : []).map(([v, l]) => `<option value="${v}" ${val === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            ${numCampo('raio', 'Arredondar cantos', c.raio ?? 0, 0, 600)}
          `);
        }
        const rArr = obterRaiosCamada(c);
        return wrap(`
          ${numCampo('raio', 'Arredondar todos', c.raio ?? 0, 0, 600)}
          <div class="studio-cantos-box">
            <span class="studio-sec-label">Cantos individuais</span>
            <div class="studio-grid-4">
              ${['TL', 'TR', 'BR', 'BL'].map((lbl, idx) => `<label class="studio-canto-inp"><span>${lbl}</span><input type="number" data-raios="${idx}" min="0" max="600" value="${Math.round(rArr[idx] || 0)}"></label>`).join('')}
            </div>
          </div>
        `);
      }

      if (propKey === 'estiloBorda') {
        if (c.tipo === 'linha') {
          return wrap(`
            ${numCampo('espessura', 'Espessura', c.espessura ?? 4, 1, 60)}
            ${chkCampo('tracejado', 'Linha tracejada', Boolean(c.tracejado))}
          `);
        }
        if (c.tipo === 'icone') {
          return wrap(`
            <label class="studio-field"><span>Fundo do ícone</span><select data-k="formaFundo">${[['nenhum', 'Sem fundo'], ['circulo', 'Circular'], ['quadrado', 'Quadrado'], ['pilula', 'Pílula']].map(([v, l]) => `<option value="${v}" ${c.formaFundo === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            ${c.formaFundo && c.formaFundo !== 'nenhum' ? corCampo('corFundo', 'Cor do fundo', c.corFundo || '#5266eb') : ''}
          `);
        }
        return wrap(`
          ${c.tipo === 'retangulo' ? numCampo('blurFundo', 'Vidro fosco (Blur)', c.blurFundo ?? 0, 0, 40) : ''}
          ${numCampo('borda', 'Espessura da borda', c.borda ?? 0, 0, 60)}
          ${c.borda ? corCampo('corBorda', 'Cor da borda', c.corBorda || '#ffffff') : ''}
        `);
      }

      if (propKey === 'perspectiva') {
        return wrap(`
          <div class="studio-grid-2">
            ${numCampo('skewX', 'Inclinar X (°)', c.skewX || 0, -60, 60)}
            ${numCampo('skewY', 'Inclinar Y (°)', c.skewY || 0, -60, 60)}
          </div>
          ${c.tipo === 'retangulo' ? '<button type="button" class="studio-pill-btn full accent" data-st="converterPoligono">Editar 4 vértices livres</button>' : ''}
          ${c.tipo === 'poligono' ? '<p class="studio-hint">Arraste os 4 círculos brancos nos cantos da forma direto no palco para ajustar a perspectiva.</p>' : ''}
        `);
      }

      return htmlAbaAjustar();
    }

    // ---------------- Painéis (Desktop Panel & Mobile Bottom Sheet)
    function titulosAba(aba) {
      return new Map([
        ['modelos', 'Modelos'],
        ['elementos', 'Elementos & Ícones'],
        ['texto', 'Textos & Dados'],
        ['galeria', 'Galeria de Fotos'],
        ['marca', 'Kit de Marca'],
        ['ajustar', camada(E.sel) ? `Ajustar: ${camada(E.sel).nome || camada(E.sel).tipo}` : 'Fundo da Página'],
        ['camadas', 'Camadas']
      ]).get(aba) || 'Studio';
    }

    function renderPainel() {
      const desktopBox = qs('#stPanelBody');
      const desktopTitle = qs('#stPanelTitle');
      const mobileBox = qs('#stSheetBody');
      const mobileTitle = qs('#stSheetTitle');
      const mobileSheet = qs('#stMobileSheet');

      const titulo = titulosAba(E.abaAtiva);
      if (desktopTitle) desktopTitle.textContent = titulo;

      el.querySelectorAll('.studio-rail-btn').forEach(b => b.classList.toggle('active', b.dataset.aba === E.abaAtiva));

      const htmlDesktop = montarHtmlAba(E.abaAtiva);
      if (desktopBox) desktopBox.innerHTML = htmlDesktop;

      if (mobileBox && E.sheetAberta) {
        const emProp = E.sheetModo === 'prop' && E.propPainel && camada(E.sel);
        if (emProp) {
          if (mobileTitle) mobileTitle.textContent = titulosPropPainel(E.propPainel);
          mobileBox.innerHTML = htmlMiniPainel(E.propPainel, camada(E.sel));
          mobileSheet?.classList.add('compact');
        } else {
          if (mobileTitle) mobileTitle.textContent = titulo;
          mobileBox.innerHTML = htmlDesktop;
          mobileSheet?.classList.remove('compact');
        }
      }

      renderBottomBar();
      if (E.abaAtiva === 'modelos') hidratarMiniaturasModelos();
      if (E.abaAtiva === 'texto' || (E.sheetAberta && E.sheetModo === 'prop' && E.propPainel === 'fonte')) listarFontesPainel();
      if (E.abaAtiva === 'ajustar' || (E.sheetAberta && E.sheetModo === 'prop' && (E.propPainel === 'cor' || E.propPainel === 'efeitos' || E.propPainel === 'estiloBorda'))) {
        listarFontesPainel();
        desenharRoda();
      }
      if (E.abaAtiva === 'camadas') bindDragDropCamadas();
    }

    function montarHtmlAba(aba) {
      if (aba === 'modelos') return htmlAbaModelos();
      if (aba === 'elementos') return htmlAbaElementos();
      if (aba === 'texto') return htmlAbaTexto();
      if (aba === 'galeria') return htmlAbaGaleria();
      if (aba === 'marca') return htmlAbaMarca();
      if (aba === 'camadas') return htmlAbaCamadas();
      return htmlAbaAjustar();
    }

    function htmlAbaModelos() {
      const prontos = Array.isArray(ctx.modelosProntos) && ctx.modelosProntos.length
        ? ctx.modelosProntos
        : [
          criarModeloPadrao('classico', E.doc.formato),
          criarModeloPadrao('faixa', E.doc.formato),
          criarModeloPadrao('minimal', E.doc.formato)
        ];
      const { modelos: meus, padrao } = getMeusModelosInfo();
      const [W, H] = dimensoesDoc(E.doc);
      const pal1 = E.kit?.cores1 || { fundo: '#0E0E0F', texto: '#ECE9E2', principal: '#2A2A2D', destaque: '#5266eb' };
      const pal2 = E.kit?.cores2 || { fundo: '#F2F0EB', texto: '#131314', principal: '#DAD6CC', destaque: '#8C6420' };
      const formatosHtml = modo === 'capas' ? `
        <span class="studio-sec-label">Formato da arte</span>
        <div class="studio-fmt-row">
          ${[['feed', 'Feed 4:5'], ['quadrado', 'Quadrado 1:1'], ['story', 'Story 9:16']].map(([fmt, lbl]) => `
            <button type="button" class="studio-fmt-pill ${E.doc.formato === fmt ? 'active' : ''}" data-st="mudarFormato" data-fmt="${fmt}">${esc(lbl)}</button>
          `).join('')}
        </div>` : '';

      return `
        <div class="studio-stack">
          ${formatosHtml}
          <span class="studio-sec-label">Paletas do Kit</span>
          <div class="studio-pal-row">
            <button type="button" class="studio-pal-card" data-st="aplicarPaleta" data-pal="principal">
              <span class="studio-pal-dots">
                <i style="background:${esc(safeHex(pal1.fundo))}"></i>
                <i style="background:${esc(safeHex(pal1.principal))}"></i>
                <i style="background:${esc(safeHex(pal1.destaque))}"></i>
                <i style="background:${esc(safeHex(pal1.texto))}"></i>
              </span>
              <span>Principal</span>
            </button>
            <button type="button" class="studio-pal-card" data-st="aplicarPaleta" data-pal="segunda">
              <span class="studio-pal-dots">
                <i style="background:${esc(safeHex(pal2.fundo))}"></i>
                <i style="background:${esc(safeHex(pal2.principal))}"></i>
                <i style="background:${esc(safeHex(pal2.destaque))}"></i>
                <i style="background:${esc(safeHex(pal2.texto))}"></i>
              </span>
              <span>Alternativa</span>
            </button>
          </div>

          <span class="studio-sec-label">Modelos prontos</span>
          <div class="studio-model-grid">
            ${prontos.map((m, idx) => {
              const mid = esc(m.id || `pronto-${idx}`);
              const chaveThumb = `pronto:${m.id || idx}:${E.doc.formato || 'feed'}:${E.prop?.id || ''}:${Boolean(E.kit?.logoUrl || E.kit?.logo)}:${E.kit?.cores1?.fundo || ''}`;
              const cached = E.modeloThumbs.get(chaveThumb);
              return `
                <button type="button" class="studio-model-card" data-st="escolherPronto" data-id="${mid}">
                  <div class="studio-model-thumb" style="aspect-ratio:${W}/${H}">
                    <img data-model-thumb="pronto:${mid}" src="${cached ? esc(cached) : ''}" alt="${esc(m.nome || 'Modelo')}">
                  </div>
                  <span>${esc(m.nome || `Modelo ${idx + 1}`)}</span>
                </button>`;
            }).join('')}
          </div>

          <span class="studio-sec-label">Meus modelos (${meus.length})</span>
          ${meus.length ? `
            <div class="studio-model-grid">
              ${meus.map((m, idx) => {
                const mid = esc(m.id || `meu-${idx}`);
                const chaveThumb = `meu:${m.id || idx}:${E.doc.formato || 'feed'}:${E.prop?.id || ''}:${Boolean(E.kit?.logoUrl || E.kit?.logo)}:${E.kit?.cores1?.fundo || ''}`;
                const cached = E.modeloThumbs.get(chaveThumb);
                const isFav = Boolean(m.favorito || m.padrao || (padrao && m.id === padrao));
                return `
                  <div class="studio-model-wrap">
                    <button type="button" class="studio-model-card" data-st="escolherMeu" data-id="${mid}">
                      <div class="studio-model-thumb" style="aspect-ratio:${W}/${H}">
                        <img data-model-thumb="meu:${mid}" src="${cached ? esc(cached) : ''}" alt="${esc(m.nome || 'Meu modelo')}">
                      </div>
                      <span>${isFav ? '★ ' : ''}${esc(m.nome || 'Meu modelo')}</span>
                    </button>
                    <div class="studio-model-actions">
                      ${typeof ctx.onFavoritarModelo === 'function' ? `<button type="button" data-st="favModelo" data-id="${mid}" title="Favoritar">${isFav ? '★' : '☆'}</button>` : ''}
                      ${(typeof ctx.onRenomearModelo === 'function' || typeof ctx.onSalvarModelo === 'function') ? `<button type="button" data-st="renomearModelo" data-id="${mid}" title="Renomear">✎</button>` : ''}
                      ${(typeof ctx.onDuplicarModelo === 'function' || typeof ctx.onSalvarModelo === 'function') ? `<button type="button" data-st="duplicarModelo" data-id="${mid}" title="Duplicar">⧉</button>` : ''}
                      ${typeof ctx.onExcluirModelo === 'function' ? `<button type="button" data-st="delModelo" data-id="${mid}" title="Excluir">×</button>` : ''}
                    </div>
                  </div>`;
              }).join('')}
            </div>` : '<p class="studio-hint">Salve um modelo no menu ⋯ para reutilizar em toda sua carteira.</p>'}
        </div>`;
    }

    async function hidratarMiniaturasModelos() {
      const prontos = Array.isArray(ctx.modelosProntos) && ctx.modelosProntos.length
        ? ctx.modelosProntos
        : [
          criarModeloPadrao('classico', E.doc.formato),
          criarModeloPadrao('faixa', E.doc.formato),
          criarModeloPadrao('minimal', E.doc.formato)
        ];
      const meus = getMeusModelos();
      const vars = varsAtuais();
      const [W, H] = dimensoesDoc(E.doc);
      const tw = 240;
      const th = Math.max(56, Math.round((H / W) * tw));
      const ctxSig = `${E.doc.formato || 'feed'}:${E.prop?.id || ''}:${Boolean(E.kit?.logoUrl || E.kit?.logo)}:${E.kit?.cores1?.fundo || ''}`;

      const tarefas = [
        ...prontos.map((m, idx) => ({ key: `pronto:${m.id || idx}`, m })),
        ...meus.map((m, idx) => ({ key: `meu:${m.id || idx}`, m }))
      ];

      for (const item of tarefas) {
        if (E.destroyed || E.abaAtiva !== 'modelos') return;
        const cacheKey = `${item.key}:${ctxSig}`;
        let url = E.modeloThumbs.get(cacheKey);
        if (!url) {
          const docM = normalizarDoc(typeof item.m.criar === 'function' ? item.m.criar(E.doc.formato) : (item.m.doc || item.m), modo);
          const sl0 = docM.slides[0];
          if (sl0) {
            url = await renderizarMiniaturaCanvas(sl0, vars, E.kit, tw, th, { docW: docM.largura, docH: docM.altura, prop: E.prop, fotoUrl: fotoUrlFn, carregarFontes: true });
            if (url) E.modeloThumbs.set(cacheKey, url);
          }
        }
        if (url) {
          el.querySelectorAll(`[data-model-thumb="${CSS.escape(item.key)}"]`).forEach(img => { img.src = url; });
        }
      }
    }

    function htmlAbaElementos() {
      return `
        <div class="studio-stack">
          <span class="studio-sec-label">Formas & Componentes</span>
          <div class="studio-elem-grid">
            <button type="button" class="studio-elem-btn" data-st="addCamada" data-tipo="retangulo">▭ <span>Retângulo</span></button>
            <button type="button" class="studio-elem-btn" data-st="addCamada" data-tipo="circulo">◯ <span>Círculo</span></button>
            <button type="button" class="studio-elem-btn" data-st="addCamada" data-tipo="linha">― <span>Linha</span></button>
            <button type="button" class="studio-elem-btn" data-st="addCamada" data-tipo="degrade">🌗 <span>Degradê</span></button>
            <button type="button" class="studio-elem-btn" data-st="addCamada" data-tipo="poligono">⏢ <span>Perspectiva 4pt</span></button>
            <button type="button" class="studio-elem-btn" data-st="addCamada" data-tipo="retanguloVidro">🪟 <span>Vidro Fosco</span></button>
            <button type="button" class="studio-elem-btn" data-st="addCamada" data-tipo="qrcode">▦ <span>QR WhatsApp</span></button>
            <button type="button" class="studio-elem-btn" data-st="addCamada" data-tipo="logo">★ <span>Logo da Marca</span></button>
          </div>

          <span class="studio-sec-label">Ícones Imobiliários (${Object.keys(ICONES_SVG).length})</span>
          <div class="studio-icon-grid">
            ${Object.entries(ICONES_SVG).map(([id, info]) => `
              <button type="button" class="studio-icon-tile" data-st="addIcone" data-ic="${esc(id)}" title="${esc(info.label)}">
                ${svgIconeHtml(id, 22)}
                <span>${esc(info.label)}</span>
              </button>
            `).join('')}
          </div>
        </div>`;
    }

    function htmlAbaTexto() {
      const vars = varsAtuais();
      return `
        <div class="studio-stack">
          <span class="studio-sec-label">Adicionar texto</span>
          <div class="studio-text-presets">
            <button type="button" class="studio-preset-btn big" data-st="addTexto" data-estilo="titulo">Inserir título</button>
            <button type="button" class="studio-preset-btn mid" data-st="addTexto" data-estilo="subtitulo">Inserir subtítulo</button>
            <button type="button" class="studio-preset-btn sm" data-st="addTexto" data-estilo="corpo">Inserir texto de apoio</button>
          </div>

          <div class="studio-row-between">
            <span class="studio-sec-label">Dados automáticos do imóvel</span>
          </div>
          <button type="button" class="studio-pill-btn full" data-st="toggleChipsDado">
            <span>＋ Dado do imóvel</span>
          </button>
          <p class="studio-hint">Ao inserir um dado, ele mostra sempre o valor real e atualiza sozinho ao trocar de imóvel.</p>

          <div class="studio-chips-list ${E.chipsDadoAberto ? '' : 'hide'}" id="stChipsDados">
            ${CAMPOS_INTELIGENTES.map(c => {
              const valReal = vars[c.token] || c.exemplo;
              return `
                <button type="button" class="studio-chip-dado" data-st="inserirDado" data-token="${esc(c.token)}" data-label="${esc(c.label)}">
                  <span class="studio-chip-ic">${svgIconeHtml(c.icone, 16)}</span>
                  <span class="studio-chip-txt">
                    <b>${esc(c.label)}</b>
                    <small>${esc(String(valReal).slice(0, 36))}</small>
                  </span>
                </button>`;
            }).join('')}
            <button type="button" class="studio-chip-dado" data-st="addCamada" data-tipo="qrcode">
              <span class="studio-chip-ic">${svgIconeHtml('whatsapp', 16)}</span>
              <span class="studio-chip-txt"><b>QR Code WhatsApp</b><small>Link direto para conversa</small></span>
            </button>
            <button type="button" class="studio-chip-dado" data-st="addCamada" data-tipo="logo">
              <span class="studio-chip-ic">${svgIconeHtml('estrela', 16)}</span>
              <span class="studio-chip-txt"><b>Logo da Marca</b><small>${esc(E.kit?.marca || 'BIGA')}</small></span>
            </button>
          </div>
        </div>`;
    }

    function htmlAbaGaleria() {
      const fotos = fotosDe(E.prop);
      return `
        <div class="studio-stack">
          <span class="studio-sec-label">Fotos do imóvel (${fotos.length})</span>
          ${fotos.length ? `
            <div class="studio-photo-grid">
              ${fotos.map((f, i) => `
                <button type="button" class="studio-photo-tile" data-st="usarFoto" data-i="${i}" title="Clique para usar ou adicionar foto ${i + 1}">
                  <img src="${esc(fotoUrlFn(f))}" alt="Foto ${i + 1}">
                  <span>#${i + 1}</span>
                </button>
              `).join('')}
            </div>` : '<p class="studio-hint">Este imóvel não possui fotos na Carteira.</p>'}

          <span class="studio-sec-label">Enviar imagem própria</span>
          <label class="studio-pill-btn full">
            <span>＋ Subir foto do dispositivo</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" name="stUploadFoto" hidden>
          </label>
        </div>`;
    }

    function htmlAbaMarca() {
      const k = E.kit || {};
      const logoSrc = safeImgSrc(k.logoUrl || k.logo);
      return `
        <div class="studio-stack">
          <span class="studio-sec-label">Identidade da Marca</span>
          <div class="studio-kit-logo-row">
            ${logoSrc ? `<img class="studio-kit-logo-prev" src="${esc(logoSrc)}" alt="Logo">` : `<div class="studio-kit-logo-ph">${esc((k.marca || 'B').charAt(0).toUpperCase())}</div>`}
            <label class="studio-pill-btn">
              <span>Subir logo</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" name="stUploadLogoKit" hidden>
            </label>
          </div>
          <label class="studio-field"><span>Nome da Marca</span><input type="text" data-kit="marca" value="${esc(k.marca || '')}"></label>
          <label class="studio-field"><span>Corretor(a)</span><input type="text" data-kit="corretor" value="${esc(k.corretor || '')}"></label>
          <label class="studio-field"><span>CRECI</span><input type="text" data-kit="creci" value="${esc(k.creci || '')}"></label>
          <label class="studio-field"><span>WhatsApp</span><input type="text" data-kit="telefone" value="${esc(k.telefone || '')}"></label>
          <label class="studio-field"><span>E-mail</span><input type="text" data-kit="email" value="${esc(k.email || '')}"></label>
          <label class="studio-field"><span>Observação de rodapé</span><input type="text" data-kit="rodape" value="${esc(k.rodape || '')}"></label>
          <button type="button" class="studio-primary-btn full" data-st="salvarKit">Salvar Kit de Marca</button>
          <button type="button" class="studio-pill-btn full" data-st="abrirModalKit">Editor avançado de paletas</button>
        </div>`;
    }

    function camadaPreviewHtml(c, vars) {
      if (c.tipo === 'texto') {
        const ff = safeFont(c.fonte || 'Inter');
        const col = hexRgba(c.cor || '#ededf3');
        return `<span class="studio-layer-prev-txt" style="font-family:'${esc(ff)}',sans-serif;color:${esc(col)}">Aa</span>`;
      }
      if (c.tipo === 'foto') {
        const fotos = fotosDe(E.prop);
        const f = fotos[c.indiceFoto] || fotos[0];
        const src = c.fotoCustom || (f ? fotoUrlFn(f) : '');
        return src
          ? `<img class="studio-layer-prev-img" src="${esc(src)}" alt="">`
          : svgIconeHtml('casa', 18);
      }
      if (c.tipo === 'degrade') {
        return `<span class="studio-layer-prev-grad" style="background:linear-gradient(135deg, ${esc(hexRgba(c.cor1 || '#00000000'))}, ${esc(hexRgba(c.cor2 || '#000000cc'))})"></span>`;
      }
      if (c.tipo === 'circulo') {
        return `<span class="studio-layer-prev-dot" style="background:${esc(hexRgba(c.cor || '#5266eb'))}"></span>`;
      }
      if (c.tipo === 'icone') {
        return svgIconeHtml(c.iconeId || 'estrela', 18);
      }
      return `<span class="studio-layer-prev-box" style="background:${esc(hexRgba(c.cor || c.corFundo || '#5266eb'))}"></span>`;
    }

    function camadasSobrepostas(sl, alvo) {
      if (!sl || !alvo) return [];
      const ax1 = Number(alvo.x) || 0;
      const ay1 = Number(alvo.y) || 0;
      const ax2 = ax1 + (Number(alvo.w) || 40);
      const ay2 = ay1 + (Number(alvo.h) || 40);
      return [...sl.camadas].reverse().filter(c => {
        if (c.id === alvo.id) return true;
        const bx1 = Number(c.x) || 0;
        const by1 = Number(c.y) || 0;
        const bx2 = bx1 + (Number(c.w) || 40);
        const by2 = by1 + (Number(c.h) || 40);
        return bx1 < ax2 && bx2 > ax1 && by1 < ay2 && by2 > ay1;
      });
    }

    function htmlAbaCamadas() {
      const sl = slideAtual();
      const todas = sl ? [...sl.camadas].reverse() : [];
      if (!todas.length) return '<p class="studio-hint">Nenhuma camada nesta página ainda.</p>';
      const vars = varsAtuais();
      const selC = camada(E.sel);
      const sobrepostas = selC ? camadasSobrepostas(sl, selC) : [];
      const lista = E.camadasTab === 'sobreposicao' ? sobrepostas : todas;

      return `
        <div class="studio-stack">
          <div class="studio-layers-tabs">
            <button type="button" class="studio-layers-tab ${E.camadasTab !== 'sobreposicao' ? 'active' : ''}" data-st="tabCamadas" data-tab="tudo">Tudo (${todas.length})</button>
            <button type="button" class="studio-layers-tab ${E.camadasTab === 'sobreposicao' ? 'active' : ''}" data-st="tabCamadas" data-tab="sobreposicao">Em sobreposição (${sobrepostas.length})</button>
          </div>
          ${!lista.length ? '<p class="studio-hint">Toque em um elemento na arte para filtrar as camadas que estão em sobreposição.</p>' : `
            <div class="studio-layers-list" id="stLayersList">
              ${lista.map(c => {
                const previewTxt = c.tipo === 'texto' ? textoResolvidoDe(c, vars).slice(0, 26) : c.tipo;
                return `
                  <div class="studio-layer-card ${E.sel === c.id ? 'sel' : ''}" data-layer-id="${esc(c.id)}">
                    <span class="studio-layer-drag" data-layer-drag="${esc(c.id)}" title="Arrastar para reordenar" aria-label="Reordenar camada">⋮⋮</span>
                    <button type="button" class="studio-layer-sel" data-st="selCamada" data-id="${esc(c.id)}">
                      <span class="studio-layer-preview">${camadaPreviewHtml(c, vars)}</span>
                      <span class="studio-layer-meta">
                        <b>${esc(c.nome || c.tipo)}</b>
                        <small>${esc(previewTxt)}</small>
                      </span>
                    </button>
                    <div class="studio-layer-btns">
                      <button type="button" data-st="verCamada" data-id="${esc(c.id)}" title="Mostrar/ocultar">${c.visivel !== false ? '👁' : '◌'}</button>
                      <button type="button" data-st="travarCamada" data-id="${esc(c.id)}" title="Travar">${c.travada ? '🔒' : '🔓'}</button>
                    </div>
                  </div>`;
              }).join('')}
            </div>`}
        </div>`;
    }

    function bindDragDropCamadas() {
      el.querySelectorAll('.studio-layers-list').forEach(list => {
        if (list.dataset.dndBound) return;
        list.dataset.dndBound = '1';
        let draggingId = null;
        let lastTargetId = null;

        list.addEventListener('pointerdown', ev => {
          const handle = ev.target.closest('[data-layer-drag]');
          if (!handle) return;
          ev.preventDefault();
          ev.stopPropagation();
          draggingId = handle.dataset.layerDrag;
          lastTargetId = draggingId;
          const card = handle.closest('.studio-layer-card');
          card?.classList.add('dragging');
          try { handle.setPointerCapture(ev.pointerId); } catch {}
        });

        list.addEventListener('pointermove', ev => {
          if (!draggingId) return;
          const y = ev.clientY;
          let hovered = null;
          list.querySelectorAll('.studio-layer-card').forEach(card => {
            card.classList.remove('drop-target');
            const r = card.getBoundingClientRect();
            if (y >= r.top && y <= r.bottom) hovered = card;
          });
          if (hovered && hovered.dataset.layerId && hovered.dataset.layerId !== draggingId) {
            hovered.classList.add('drop-target');
            lastTargetId = hovered.dataset.layerId;
          }
        });

        const finalizar = () => {
          if (!draggingId) return;
          const srcId = draggingId;
          const dstId = lastTargetId;
          draggingId = null;
          lastTargetId = null;
          list.querySelectorAll('.studio-layer-card').forEach(c => c.classList.remove('dragging', 'drop-target'));
          if (dstId && dstId !== srcId) {
            const sl = slideAtual();
            if (sl) {
              const iSrc = sl.camadas.findIndex(x => x.id === srcId);
              const iDst = sl.camadas.findIndex(x => x.id === dstId);
              if (iSrc >= 0 && iDst >= 0 && iSrc !== iDst) {
                marcar();
                const [item] = sl.camadas.splice(iSrc, 1);
                sl.camadas.splice(iDst, 0, item);
                desenharPalco();
                renderPainel();
                atualizarMiniaturaSlideAtual();
                notificarMudancaDoc();
              }
            }
          }
        };
        list.addEventListener('pointerup', finalizar);
        list.addEventListener('pointercancel', finalizar);
      });
    }

    const numCampo = (k, rot, v, min, max, passo = 1) => {
      const n = Number(v) || 0;
      return `
        <label class="studio-num">
          <span>${esc(rot)}</span>
          <input type="range" data-k="${esc(k)}" min="${min}" max="${max}" step="${passo}" value="${n}">
          <input type="number" data-k="${esc(k)}" min="${min}" max="${max}" step="${passo}" value="${Math.round(n * 100) / 100}">
        </label>`;
    };

    const chkCampo = (k, rot, v) => `<label class="studio-chk"><input type="checkbox" data-k="${esc(k)}" ${v ? 'checked' : ''}><span>${esc(rot)}</span></label>`;

    function corCampo(k, rot, v) {
      const val = safeHex(v, '#ffffff');
      return `
        <div class="studio-cor">
          <span>${esc(rot)}</span>
          <button type="button" class="studio-amostra" data-st="roda" data-k="${esc(k)}" style="--c:${esc(hexRgba(val))}" title="${esc(val)}"></button>
          <input type="text" data-k="${esc(k)}" value="${esc(val)}" maxlength="9" spellcheck="false">
        </div>
        ${E.rodaPara === k ? rodaHtml(val) : ''}`;
    }

    function rodaHtml(v) {
      const palKit = E.kit?.cores1 ? Object.values(E.kit.cores1) : [];
      const paleta = [...new Set([...(E.doc.paleta || []), ...palKit, ...PALETA_PADRAO, ...E.recentes])].filter(x => /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(x)).slice(0, 18);
      const hsv = hexParaHsv(v);
      return `
        <div class="studio-roda">
          <canvas width="200" height="200" data-roda="hs"></canvas>
          <label class="studio-num"><span>Brilho</span><input type="range" data-roda="v" min="0" max="100" value="${Math.round(hsv.v * 100)}"></label>
          <label class="studio-num"><span>Transparência</span><input type="range" data-roda="a" min="0" max="100" value="${Math.round(hsv.a * 100)}"></label>
          <div class="studio-paleta-dots">
            ${paleta.map(p => `<button type="button" data-st="paletaCor" data-c="${esc(p)}" style="--c:${esc(hexRgba(p))}" title="${esc(p)}"></button>`).join('')}
          </div>
          <div class="studio-row-tight">
            ${typeof window !== 'undefined' && 'EyeDropper' in window ? '<button type="button" class="studio-pill-btn" data-st="contaGotas">Conta-gotas</button>' : ''}
            <button type="button" class="studio-pill-btn" data-st="addPaleta">Salvar cor</button>
            <button type="button" class="studio-pill-btn" data-st="fecharRoda">Pronto</button>
          </div>
        </div>`;
    }

    function htmlAbaAjustar() {
      const sl = slideAtual();
      const c = camada(E.sel);
      if (!c) {
        return `
          <div class="studio-stack">
            <span class="studio-sec-label">Fundo da página</span>
            ${corCampo('doc.fundo', 'Cor de fundo', sl?.fundo || '#171721')}
            <label class="studio-field"><span>Nome da página</span><input type="text" data-slide-nome="1" value="${esc(sl?.nome || '')}"></label>
            <p class="studio-hint">Toque em qualquer elemento do palco para editar posição, cor, fonte, perspectiva ou efeitos.</p>
          </div>`;
      }

      const comum = `
        <div class="studio-row-between">
          <span class="studio-sec-label">${esc(c.nome || c.tipo)}</span>
          <div class="studio-row-tight">
            <button type="button" class="studio-pill-btn" data-st="duplicar">Duplicar</button>
            <button type="button" class="studio-pill-btn danger" data-st="apagar">Apagar</button>
          </div>
        </div>
        <label class="studio-field"><span>Nome da camada</span><input type="text" data-k="nome" value="${esc(c.nome || '')}" maxlength="40"></label>
        <div class="studio-align-row">
          ${[['esq', '⇤'], ['ch', '↔'], ['dir', '⇥'], ['topo', '⤒'], ['cv', '↕'], ['base', '⤓']].map(([k, ic]) => `<button type="button" class="studio-align-btn" data-st="alinhar" data-a="${k}" title="Alinhar">${ic}</button>`).join('')}
        </div>
        <div class="studio-grid-2">
          ${numCampo('x', 'X', c.x, -2000, 4000)}
          ${numCampo('y', 'Y', c.y, -2000, 4000)}
          ${numCampo('w', 'Largura', c.w, 8, 4000)}
          ${c.tipo !== 'texto' ? numCampo('h', 'Altura', c.h, 8, 4000) : (c.autoFit ? numCampo('h', 'Altura máx', c.h, 16, 4000) : '')}
        </div>
        ${numCampo('rot', 'Girar (°)', c.rot, -180, 180)}
        <div class="studio-grid-2">
          ${numCampo('skewX', 'Inclinar X (°)', c.skewX || 0, -60, 60)}
          ${numCampo('skewY', 'Inclinar Y (°)', c.skewY || 0, -60, 60)}
        </div>
        ${numCampo('opacidade', 'Opacidade', c.opacidade ?? 1, 0, 1, 0.01)}`;

      let esp = '';
      if (c.tipo === 'texto') {
        const vinculo = detectarCampoVinculado(c.texto);
        const temReconn = !vinculo && Boolean(c.campoVinculadoAnterior);
        const textoExibido = textoResolvidoDe({ ...c, maiusculas: false }, varsAtuais());
        esp = `
          <div class="studio-text-box">
            <div class="studio-row-between">
              <span class="studio-sec-label">Conteúdo</span>
              ${vinculo ? `<span class="studio-badge-auto">⚡ Automático: ${esc(vinculo)}</span>` : ''}
            </div>
            ${temReconn ? `<button type="button" class="studio-pill-btn full accent" data-st="reconectar">⚡ Reconectar ao imóvel</button>` : ''}
            <textarea data-k="texto_visual" rows="3" placeholder="Digite o texto…">${esc(textoExibido)}</textarea>
            <button type="button" class="studio-pill-btn full" data-st="abrirDadoTexto">＋ Trocar / Inserir dado do imóvel</button>
          </div>
          <div class="studio-font-picker">
            <span class="studio-sec-label">Fonte: <b style="font-family:'${esc(safeFont(c.fonte))}'">${esc(c.fonte)}</b></span>
            <div class="studio-row-tight">
              <input type="search" data-stf="busca" placeholder="Buscar entre 1.800+ fontes…" value="${esc(E.fonteBusca)}">
              <select data-stf="cat">
                <option value="">Todas</option>
                ${Object.entries(CAT_FONTES).map(([k, v]) => `<option value="${k}" ${E.fonteCat === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}
              </select>
            </div>
            <div class="studio-font-list" id="stFontList"></div>
          </div>
          <div class="studio-grid-2">
            <label class="studio-field"><span>Peso</span><select data-k="peso">${pesosDe(c.fonte).map(w => `<option value="${w}" ${Number(w) === Number(c.peso) ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
            <label class="studio-field"><span>Alinhar</span><select data-k="alinhamento">${[['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita']].map(([val, lbl]) => `<option value="${val}" ${c.alinhamento === val ? 'selected' : ''}>${lbl}</option>`).join('')}</select></label>
          </div>
          ${numCampo('tamanho', 'Tamanho', c.tamanho, 6, 400)}
          ${corCampo('cor', 'Cor do texto', c.cor || '#ffffff')}
          <div class="studio-row-tight">
            ${chkCampo('italico', 'Itálico', c.italico)}
            ${chkCampo('maiusculas', 'MAIÚSCULAS', c.maiusculas)}
            ${chkCampo('autoFit', 'Auto-ajuste', c.autoFit)}
          </div>
          <div class="studio-grid-2">
            ${numCampo('espacamento', 'Espaço letras', c.espacamento || 0, -10, 60, 0.5)}
            ${numCampo('entrelinha', 'Entrelinha', c.entrelinha || 1.15, 0.6, 2.5, 0.05)}
          </div>
          <div class="studio-grid-2">
            ${numCampo('escalaX', 'Escala ↔', c.escalaX || 1, 0.2, 4, 0.01)}
            ${numCampo('escalaY', 'Escala ↕', c.escalaY || 1, 0.2, 4, 0.01)}
          </div>
          ${chkCampo('__uniforme', 'Escala uniforme no canto', E.uniforme)}
          <label class="studio-field"><span>Quando cresce</span><select data-k="ancora"><option value="topo" ${c.ancora !== 'base' ? 'selected' : ''}>Para baixo</option><option value="base" ${c.ancora === 'base' ? 'selected' : ''}>Para cima (base fixa)</option></select></label>
          ${chkCampo('fundo', 'Fundo (etiqueta)', c.fundo)}
          ${c.fundo ? corCampo('corFundo', 'Cor do fundo', c.corFundo || '#5266eb') + numCampo('raioFundo', 'Arredondar fundo', c.raioFundo || 0, 0, 200) + numCampo('folga', 'Folga interna', c.folga || 0, 0, 120) + numCampo('bordaFundo', 'Borda do fundo', c.bordaFundo || 0, 0, 20) + (c.bordaFundo ? corCampo('corBordaFundo', 'Cor borda fundo', c.corBordaFundo || '#ffffff') : '') : ''}
          ${numCampo('sombra', 'Sombra', c.sombra || 0, 0, 60)}${c.sombra ? corCampo('corSombra', 'Cor da sombra', c.corSombra || '#000000') : ''}
          ${numCampo('contorno', 'Contorno', c.contorno || 0, 0, 30)}${c.contorno ? corCampo('corContorno', 'Cor do contorno', c.corContorno || '#000000') : ''}`;
      } else if (c.tipo === 'foto') {
        const fotos = fotosDe(E.prop);
        const rArr = obterRaiosCamada(c);
        esp = `
          ${fotos.length > 1 ? `<span class="studio-sec-label">Foto do imóvel</span><div class="studio-photo-strip">${fotos.slice(0, 12).map((f, i) => `<button type="button" class="${i === c.indiceFoto ? 'sel' : ''}" data-st="trocarFotoCamada" data-i="${i}"><img src="${esc(fotoUrlFn(f))}" alt=""></button>`).join('')}</div>` : ''}
          ${chkCampo('__enquadrar', 'Enquadrar foto ao arrastar', E.enquadrar)}
          ${numCampo('zoom', 'Zoom da foto', c.zoom ?? 1, 1, 4, 0.01)}
          <div class="studio-grid-2">${numCampo('offX', 'Enquadrar ↔', c.offX ?? 0, -1, 1, 0.01)}${numCampo('offY', 'Enquadrar ↕', c.offY ?? 0, -1, 1, 0.01)}</div>
          ${numCampo('brilho', 'Brilho', c.brilho ?? 100, 0, 200)}
          ${numCampo('contraste', 'Contraste', c.contraste ?? 100, 0, 200)}
          ${numCampo('saturacao', 'Saturação', c.saturacao ?? 100, 0, 200)}
          ${numCampo('desfoque', 'Desfoque', c.desfoque ?? 0, 0, 30)}
          ${numCampo('raio', 'Arredondar cantos', c.raio ?? 0, 0, 600)}
          <div class="studio-cantos-box">
            <span class="studio-sec-label">Cantos individuais (TL / TR / BR / BL)</span>
            <div class="studio-grid-4">
              ${['TL', 'TR', 'BR', 'BL'].map((lbl, idx) => `<label class="studio-canto-inp"><span>${lbl}</span><input type="number" data-raios="${idx}" min="0" max="600" value="${Math.round(rArr[idx] || 0)}"></label>`).join('')}
            </div>
          </div>
          ${numCampo('borda', 'Borda', c.borda ?? 0, 0, 40)}${c.borda ? corCampo('corBorda', 'Cor da borda', c.corBorda || '#ffffff') : ''}`;
      } else if (c.tipo === 'retangulo') {
        const rArr = obterRaiosCamada(c);
        esp = `
          ${corCampo('cor', 'Cor', c.cor || '#5266eb')}
          ${numCampo('raio', 'Arredondar cantos', c.raio ?? 0, 0, 1000)}
          <div class="studio-cantos-box">
            <span class="studio-sec-label">Cantos individuais (TL / TR / BR / BL)</span>
            <div class="studio-grid-4">
              ${['TL', 'TR', 'BR', 'BL'].map((lbl, idx) => `<label class="studio-canto-inp"><span>${lbl}</span><input type="number" data-raios="${idx}" min="0" max="1000" value="${Math.round(rArr[idx] || 0)}"></label>`).join('')}
            </div>
          </div>
          ${numCampo('blurFundo', 'Vidro fosco (Blur)', c.blurFundo ?? 0, 0, 40)}
          ${numCampo('borda', 'Borda', c.borda ?? 0, 0, 60)}${c.borda ? corCampo('corBorda', 'Cor da borda', c.corBorda || '#ffffff') : ''}`;
      } else if (c.tipo === 'circulo' || c.tipo === 'poligono') {
        esp = `
          ${corCampo('cor', 'Cor', c.cor || '#5266eb')}
          ${numCampo('borda', 'Borda', c.borda ?? 0, 0, 60)}${c.borda ? corCampo('corBorda', 'Cor da borda', c.corBorda || '#ffffff') : ''}
          ${c.tipo === 'poligono' ? '<p class="studio-hint">Arraste qualquer uma das 4 bolinhas brancas nos cantos da forma direto na arte para ajustar a perspectiva.</p>' : ''}`;
      } else if (c.tipo === 'linha') {
        esp = `
          ${corCampo('cor', 'Cor da linha', c.cor || '#ffffff')}
          ${numCampo('espessura', 'Espessura', c.espessura ?? 4, 1, 60)}
          ${chkCampo('tracejado', 'Linha tracejada', Boolean(c.tracejado))}`;
      } else if (c.tipo === 'degrade') {
        esp = `
          ${corCampo('cor1', 'Cor inicial', c.cor1 || '#00000000')}
          ${corCampo('cor2', 'Cor final', c.cor2 || '#000000cc')}
          ${numCampo('angulo', 'Direção (°)', c.angulo ?? 180, 0, 360)}
          ${numCampo('raio', 'Arredondar', c.raio ?? 0, 0, 1000)}`;
      } else if (c.tipo === 'icone') {
        esp = `
          ${corCampo('cor', 'Cor do ícone', c.cor || '#ffffff')}
          <label class="studio-field"><span>Fundo do ícone</span><select data-k="formaFundo">${[['nenhum', 'Sem fundo'], ['circulo', 'Circular'], ['quadrado', 'Quadrado'], ['pilula', 'Pílula']].map(([val, lbl]) => `<option value="${val}" ${c.formaFundo === val ? 'selected' : ''}>${lbl}</option>`).join('')}</select></label>
          ${c.formaFundo && c.formaFundo !== 'nenhum' ? corCampo('corFundo', 'Cor do fundo', c.corFundo || '#5266eb') : ''}`;
      } else if (c.tipo === 'logo') {
        esp = `
          <label class="studio-field"><span>Origem</span><select data-k="origem"><option value="kit" ${c.origem !== 'custom' ? 'selected' : ''}>Logo do Kit de Marca</option><option value="custom" ${c.origem === 'custom' ? 'selected' : ''}>Customizada</option></select></label>
          <label class="studio-field"><span>Forma (monograma)</span><select data-k="forma">${[['quadrado', 'Quadrado'], ['circulo', 'Circular'], ['nenhum', 'Sem fundo']].map(([val, lbl]) => `<option value="${val}" ${c.forma === val ? 'selected' : ''}>${lbl}</option>`).join('')}</select></label>
          ${corCampo('corFundo', 'Cor do monograma', c.corFundo || '#5266eb')}
          ${corCampo('corTexto', 'Cor da letra', c.corTexto || '#ffffff')}`;
      } else if (c.tipo === 'qrcode') {
        esp = `
          <label class="studio-field"><span>URL / WhatsApp</span><input type="text" data-k="url" value="${esc(c.url || '')}" placeholder="Automático do telefone do imóvel"></label>
          ${corCampo('corEscuro', 'Cor dos pontos', c.corEscuro || '#171721')}
          ${corCampo('corClaro', 'Cor do fundo', c.corClaro || '#ffffff')}
          ${numCampo('raio', 'Arredondar', c.raio ?? 12, 0, 80)}`;
      }

      return `<div class="studio-stack">${comum}${esp}</div>`;
    }

    function renderPainelPropriedadesValores() {
      const c = camada(E.sel);
      if (!c) return;
      el.querySelectorAll('[data-k]').forEach(inp => {
        const k = inp.dataset.k;
        if (Object.prototype.hasOwnProperty.call(c, k) && (inp.type === 'range' || inp.type === 'number') && document.activeElement !== inp) {
          inp.value = inp.type === 'number' ? Math.round((Number(c[k]) || 0) * 100) / 100 : (Number(c[k]) || 0);
        }
      });
    }

    async function listarFontesPainel() {
      const boxes = el.querySelectorAll('#stFontList');
      if (!boxes.length) return;
      const todas = await listaFontes();
      const q = E.fonteBusca.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const achadas = todas.filter(f => (!E.fonteCat || f[1] === E.fonteCat) && (!q || f[0].toLowerCase().includes(q))).slice(0, 40);
      achadas.forEach(f => previaFonte(f[0]));
      const c = camada(E.sel);
      const html = achadas.length
        ? achadas.map(f => `<button type="button" data-st="escolherFonte" data-f="${esc(f[0])}" class="${c && c.fonte === f[0] ? 'sel' : ''}" style="font-family:'${esc(safeFont(f[0]))}',sans-serif">${esc(f[0])}</button>`).join('')
        : '<p class="studio-hint">Nenhuma fonte encontrada.</p>';
      boxes.forEach(b => { b.innerHTML = html; });
    }

    // ---------------- Roda de Cores HSV
    function valorCorDe(k) {
      if (!k) return '#ffffff';
      if (k === 'doc.fundo') return slideAtual()?.fundo || '#171721';
      const c = camada(E.sel);
      return c && Object.prototype.hasOwnProperty.call(c, k) ? (c[k] || '#ffffff') : '#ffffff';
    }

    function aplicarCor(k, hex, refazerPainel = true) {
      if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) return;
      if (k === 'doc.fundo') {
        const sl = slideAtual();
        if (sl) sl.fundo = hex;
      } else if (CAMPOS_EDITAVEIS.has(k) && !FORBIDDEN_KEYS.has(k)) {
        const c = camada(E.sel);
        if (c) {
          if (k === 'cor') c.cor = hex;
          else if (k === 'corFundo') c.corFundo = hex;
          else if (k === 'corSombra') c.corSombra = hex;
          else if (k === 'corContorno') c.corContorno = hex;
          else if (k === 'corBorda') c.corBorda = hex;
          else if (k === 'corBordaFundo') c.corBordaFundo = hex;
          else if (k === 'cor1') c.cor1 = hex;
          else if (k === 'cor2') c.cor2 = hex;
          else if (k === 'corTexto') c.corTexto = hex;
          else if (k === 'corEscuro') c.corEscuro = hex;
          else if (k === 'corClaro') c.corClaro = hex;
        }
      }
      E.recentes = [hex, ...E.recentes.filter(x => x !== hex)].slice(0, 8);
      desenharPalco();
      renderContextBar();
      atualizarMiniaturaSlideAtual();
      notificarMudancaDoc();
      if (refazerPainel) renderPainel();
      else {
        el.querySelectorAll(`.studio-amostra[data-k="${CSS.escape(k)}"]`).forEach(b => b.style.setProperty('--c', hexRgba(hex)));
        el.querySelectorAll('.studio-tool-cdot').forEach(d => d.style.setProperty('--tc', hexRgba(hex)));
        el.querySelectorAll(`.studio-cor input[data-k="${CSS.escape(k)}"]`).forEach(inp => { if (document.activeElement !== inp) inp.value = hex; });
        desenharRoda();
      }
    }

    function desenharRoda() {
      const canvases = el.querySelectorAll('canvas[data-roda="hs"]');
      canvases.forEach(rc => {
        const k = E.rodaPara;
        if (!k) return;
        const v = valorCorDe(k);
        const hsv = hexParaHsv(v);
        const cx = rc.getContext('2d');
        const R = rc.width / 2;
        const img = cx.createImageData(rc.width, rc.height);
        for (let py = 0; py < rc.height; py++) {
          for (let px = 0; px < rc.width; px++) {
            const dx = px - R;
            const dy = py - R;
            const dist = Math.hypot(dx, dy);
            const idx = (py * rc.width + px) * 4;
            if (dist > R) {
              img.data[idx + 3] = 0;
              continue;
            }
            const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
            const hx = hsvParaHex({ h, s: dist / R, v: hsv.v || 1, a: 1 });
            const n = parseInt(hx.slice(1, 7), 16);
            img.data[idx] = n >> 16;
            img.data[idx + 1] = (n >> 8) & 255;
            img.data[idx + 2] = n & 255;
            img.data[idx + 3] = 255;
          }
        }
        cx.putImageData(img, 0, 0);
        const ang = rad(hsv.h);
        cx.strokeStyle = hsv.v > 0.5 ? '#000' : '#fff';
        cx.lineWidth = 2;
        cx.beginPath();
        cx.arc(R + Math.cos(ang) * hsv.s * R, R + Math.sin(ang) * hsv.s * R, 7, 0, Math.PI * 2);
        cx.stroke();

        const escolher = ev => {
          const r = rc.getBoundingClientRect();
          const dx = ((ev.clientX - r.left) / r.width) * rc.width - R;
          const dy = ((ev.clientY - r.top) / r.height) * rc.height - R;
          const atual = hexParaHsv(valorCorDe(k));
          aplicarCor(k, hsvParaHex({
            h: ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360,
            s: clamp(Math.hypot(dx, dy) / R, 0, 1),
            v: atual.v || 1,
            a: atual.a
          }), false);
        };
        rc.onpointerdown = ev => {
          marcar();
          rc.setPointerCapture(ev.pointerId);
          escolher(ev);
          rc.onpointermove = escolher;
        };
        rc.onpointerup = rc.onpointercancel = () => {
          rc.onpointermove = null;
          renderPainel();
        };
      });
    }

    // ---------------- Modais: Apresentação, Exportar/WhatsApp, Kit, Lote
    let fecharPresAtiva = null;
    function abrirApresentacao() {
      if (typeof ctx.onApresentacao === 'function') {
        return ctx.onApresentacao({ doc: copia(E.doc), slideAtual: E.slideIdx });
      }
      if (typeof fecharPresAtiva === 'function') fecharPresAtiva();

      const overlay = document.createElement('div');
      overlay.className = 'studio-pres';
      overlay.id = 'stPresOverlay';
      document.body.appendChild(overlay);

      let idx = E.slideIdx;
      const total = E.doc.slides.length;
      const [W, H] = dimensoesDoc(E.doc);

      const ajustarImagemPres = () => {
        const img = overlay.querySelector('#stPresImg');
        const stg = overlay.querySelector('.studio-pres-stage');
        if (!img || !stg) return;
        const vv = window.visualViewport;
        const vw = vv ? vv.width : window.innerWidth;
        const vh = vv ? vv.height : window.innerHeight;
        const padH = vw < 700 ? 72 : 112;
        const padW = vw < 700 ? 16 : 96;
        const availW = Math.max(120, (stg.clientWidth || vw) - padW);
        const availH = Math.max(120, Math.min(vh, stg.clientHeight || vh) - padH);
        const escFit = Math.min(availW / W, availH / H);
        img.style.width = `${Math.round(W * escFit)}px`;
        img.style.height = `${Math.round(H * escFit)}px`;
      };

      const renderPres = async () => {
        overlay.innerHTML = `
          <div class="studio-pres-bar">
            <span>${esc(E.doc.slides[idx]?.nome || `Página ${idx + 1}`)} · ${idx + 1} / ${total}</span>
            <button type="button" class="studio-pill-btn" data-pres="fechar">Fechar (Esc)</button>
          </div>
          <div class="studio-pres-stage">
            <button type="button" class="studio-pres-nav prev" data-pres="ant" ${idx === 0 ? 'disabled' : ''}>‹</button>
            <img id="stPresImg" alt="Slide ${idx + 1}">
            <button type="button" class="studio-pres-nav next" data-pres="prox" ${idx >= total - 1 ? 'disabled' : ''}>›</button>
          </div>`;
        ajustarImagemPres();
        const png = await renderizarMiniaturaCanvas(E.doc.slides[idx], varsAtuais(), E.kit, W, H, {
          docW: W, docH: H, prop: E.prop, fotoUrl: fotoUrlFn, carregarFontes: true
        });
        const img = overlay.querySelector('#stPresImg');
        if (img && png) img.src = png;
        ajustarImagemPres();
      };

      const onPresClick = ev => {
        const b = ev.target.closest('[data-pres]');
        if (!b) return;
        const a = b.dataset.pres;
        if (a === 'fechar') fecharPres();
        else if (a === 'ant' && idx > 0) { idx--; renderPres(); }
        else if (a === 'prox' && idx < total - 1) { idx++; renderPres(); }
      };
      const onPresKey = ev => {
        if (ev.key === 'Escape') fecharPres();
        else if (ev.key === 'ArrowLeft' && idx > 0) { idx--; renderPres(); }
        else if (ev.key === 'ArrowRight' && idx < total - 1) { idx++; renderPres(); }
      };
      const onPresResize = () => ajustarImagemPres();

      function fecharPres() {
        overlay.removeEventListener('click', onPresClick);
        window.removeEventListener('keydown', onPresKey);
        window.removeEventListener('resize', onPresResize);
        window.removeEventListener('orientationchange', onPresResize);
        if (window.visualViewport) window.visualViewport.removeEventListener('resize', onPresResize);
        overlay.remove();
        if (fecharPresAtiva === fecharPres) fecharPresAtiva = null;
      }
      fecharPresAtiva = fecharPres;
      overlay.addEventListener('click', onPresClick);
      window.addEventListener('keydown', onPresKey);
      window.addEventListener('resize', onPresResize);
      window.addEventListener('orientationchange', onPresResize);
      if (window.visualViewport) window.visualViewport.addEventListener('resize', onPresResize);
      renderPres();
    }

    function abrirModal(html) {
      const back = qs('#stModalBackdrop');
      const box = qs('#stModalBox');
      if (!back || !box) return;
      box.innerHTML = html;
      back.classList.remove('hide');
    }

    function fecharModal() {
      const back = qs('#stModalBackdrop');
      if (back) back.classList.add('hide');
    }

    function abrirModalExportar() {
      const isPdf = modo === 'pdf';
      abrirModal(`
        <div class="studio-modal-head">
          <h3>${isPdf ? 'Exportar Apresentação' : 'Exportar Arte'}</h3>
          <button type="button" class="studio-icon-btn" data-st="fecharModal">✕</button>
        </div>
        <div class="studio-stack">
          <div class="studio-row-tight">
            ${isPdf
              ? `<button type="button" class="studio-primary-btn" data-st="execExportar" data-fmt="pdf">Baixar PDF 16:9</button>
                 <button type="button" class="studio-pill-btn" data-st="execExportar" data-fmt="preview">Prévia do PDF</button>`
              : `<button type="button" class="studio-primary-btn" data-st="execExportar" data-fmt="jpg">Baixar JPG</button>
                 <button type="button" class="studio-pill-btn" data-st="execExportar" data-fmt="png">Baixar PNG</button>`}
            ${podeVitrine ? `<button type="button" class="studio-pill-btn accent" data-st="enviarVitrine">Usar na Vitrine</button>` : ''}
          </div>
          ${podeWhatsapp ? `
            <div class="studio-modal-divider"></div>
            <span class="studio-sec-label">Enviar direto pelo WhatsApp</span>
            <label class="studio-field"><span>Telefone (com DDD)</span><input type="tel" name="stWaTel" placeholder="62 99999-9999"></label>
            <label class="studio-field"><span>Mensagem</span><textarea name="stWaMsg" rows="3">Olá! Segue a apresentação do imóvel ${esc(varsAtuais()['{nome}'] || '')}.</textarea></label>
            <button type="button" class="studio-primary-btn full" data-st="enviarWhatsapp">Enviar no WhatsApp</button>
          ` : ''}
        </div>
      `);
    }

    function abrirModalKit() {
      const k = E.kit || {};
      const c1 = k.cores1 || { fundo: '#0E0E0F', texto: '#ECE9E2', principal: '#2A2A2D', secundaria: '#8C8A84', destaque: '#C8A15A' };
      const c2 = k.cores2 || { fundo: '#F2F0EB', texto: '#131314', principal: '#DAD6CC', secundaria: '#7A776F', destaque: '#8C6420' };
      abrirModal(`
        <div class="studio-modal-head">
          <h3>Kit de Marca</h3>
          <button type="button" class="studio-icon-btn" data-st="fecharModal">✕</button>
        </div>
        <div class="studio-stack">
          <div class="studio-grid-2">
            <label class="studio-field"><span>Marca</span><input type="text" data-kit-m="marca" value="${esc(k.marca || '')}"></label>
            <label class="studio-field"><span>Corretor(a)</span><input type="text" data-kit-m="corretor" value="${esc(k.corretor || '')}"></label>
            <label class="studio-field"><span>CRECI</span><input type="text" data-kit-m="creci" value="${esc(k.creci || '')}"></label>
            <label class="studio-field"><span>WhatsApp</span><input type="text" data-kit-m="telefone" value="${esc(k.telefone || '')}"></label>
          </div>
          <span class="studio-sec-label">Paleta Principal</span>
          <div class="studio-kit-colors">
            ${['fundo', 'texto', 'principal', 'secundaria', 'destaque'].map(ch => `
              <label class="studio-kit-citem"><span>${esc(ch)}</span><input type="color" data-kit-c1="${esc(ch)}" value="${esc(safeHex(c1[ch] || '#5266eb'))}"></label>
            `).join('')}
          </div>
          <span class="studio-sec-label">Paleta Alternativa</span>
          <div class="studio-kit-colors">
            ${['fundo', 'texto', 'principal', 'secundaria', 'destaque'].map(ch => `
              <label class="studio-kit-citem"><span>${esc(ch)}</span><input type="color" data-kit-c2="${esc(ch)}" value="${esc(safeHex(c2[ch] || '#8c6420'))}"></label>
            `).join('')}
          </div>
          <button type="button" class="studio-primary-btn full" data-st="salvarModalKit">Salvar Kit</button>
        </div>
      `);
    }

    // ---------------- Dropdown Menu / Action Sheet (...)
    function renderTopMenu() {
      const menu = qs('#stTopMenu');
      const actionSheet = qs('#stActionSheet');
      const actionBack = qs('#stActionBackdrop');
      const isMob = typeof window !== 'undefined' && window.innerWidth < 900;
      const botoesHtml = `
        ${typeof ctx.onSalvarImovel === 'function' ? '<button type="button" class="accent" data-st="salvarImovel">Salvar alterações no imóvel</button>' : ''}
        <button type="button" data-st="salvarModelo" data-novo="0">Salvar modelo</button>
        <button type="button" data-st="salvarModelo" data-novo="1">Salvar como novo modelo</button>
        <button type="button" data-st="abrirModalKit">Kit de Marca</button>
        ${podeLote ? '<button type="button" data-st="abrirLote">Aplicar em outros imóveis</button>' : ''}
        ${typeof ctx.onEditarImovel === 'function' ? '<button type="button" data-st="editarImovel">Editar dados do imóvel</button>' : ''}
        <button type="button" class="danger" data-st="restaurarPadrao">Restaurar padrão</button>
      `;

      if (menu) {
        menu.classList.toggle('hide', !E.menuAberto || isMob);
        menu.innerHTML = E.menuAberto && !isMob ? botoesHtml : '';
      }

      if (actionSheet && actionBack) {
        const showSheet = Boolean(E.menuAberto && isMob);
        actionSheet.classList.toggle('hide', !showSheet);
        actionBack.classList.toggle('hide', !showSheet);
        if (showSheet) {
          const inv = getInventario();
          const selImovelHtml = `
            <label class="studio-field">
              <span>Imóvel ativo</span>
              <select name="stSheetImovel">
                ${inv.length
                  ? inv.map(p => `<option value="${esc(p.id)}" ${E.prop && String(E.prop.id) === String(p.id) ? 'selected' : ''}>#${esc(p.id)} · ${esc(p.tipo || 'Imóvel')}${p.setor ? ' · ' + esc(p.setor) : ''}</option>`).join('')
                  : '<option value="">Sem imóvel na carteira</option>'}
              </select>
            </label>`;
          const selFmtHtml = modo === 'capas' ? `
            <label class="studio-field">
              <span>Formato da capa</span>
              <select name="stSheetFormato">
                <option value="feed" ${E.doc.formato === 'feed' ? 'selected' : ''}>Feed 4:5</option>
                <option value="quadrado" ${E.doc.formato === 'quadrado' ? 'selected' : ''}>Quadrado 1:1</option>
                <option value="story" ${E.doc.formato === 'story' ? 'selected' : ''}>Story 9:16</option>
              </select>
            </label>` : '';
          actionSheet.innerHTML = `
            <div class="studio-sheet-handle"><span></span></div>
            <div class="studio-sheet-head">
              <h3>Mais opções</h3>
              <button type="button" class="studio-icon-btn" data-st="fecharMenu" aria-label="Fechar">✕</button>
            </div>
            <div class="studio-action-body">
              <div class="studio-stack" style="margin-bottom:8px;">
                ${selImovelHtml}
                ${selFmtHtml}
              </div>
              <div class="studio-action-list">${botoesHtml}</div>
            </div>`;
        } else {
          actionSheet.innerHTML = '';
        }
      }
    }

    // ---------------- Ações & Eventos
    function reconstruirTudo() {
      preencherSelectsTopbar();
      atualizarBotoesHist();
      desenharPalco();
      ajustarEscalaPalco();
      renderContextBar();
      renderBottomBar();
      renderPainel();
      renderFilmstrip();
    }

    async function exportarImagemLocal(formato = 'jpg') {
      const [W, H] = dimensoesDoc(E.doc);
      const mime = formato === 'png' ? 'image/png' : 'image/jpeg';
      const ext = formato === 'png' ? 'png' : 'jpg';
      const cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      const png = await renderizarMiniaturaCanvas(slideAtual(), varsAtuais(), E.kit, W, H, {
        docW: W, docH: H, prop: E.prop, fotoUrl: fotoUrlFn, carregarFontes: true
      });
      if (!png) throw new Error('Não foi possível exportar a imagem.');
      const img = await carregarImagem(png);
      let finalUrl = png;
      if (img && formato !== 'png') {
        cv.getContext('2d').drawImage(img, 0, 0, W, H);
        finalUrl = cv.toDataURL(mime, 0.92);
      }
      const a = document.createElement('a');
      a.href = finalUrl;
      a.download = `biga-${E.prop?.id || 'arte'}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('Imagem baixada!');
    }

    function alinharCamada(c, a) {
      const [W, H] = dimensoesDoc(E.doc);
      if (a === 'esq') c.x = 0;
      else if (a === 'ch') c.x = Math.round(W / 2 - (c.w || 0) / 2);
      else if (a === 'dir') c.x = W - (c.w || 0);
      else if (a === 'topo') c.y = 0;
      else if (a === 'cv') c.y = Math.round(H / 2 - (c.h || 0) / 2);
      else if (a === 'base') c.y = H - (c.h || 0);
    }

    async function aplicarMudancaFormato(fmt) {
      if (!fmt || !Object.prototype.hasOwnProperty.call(TAM, fmt)) return;
      if (typeof ctx.onSelectFormato === 'function') {
        const ret = await ctx.onSelectFormato(fmt);
        if (ret) E.doc = normalizarDoc(ret, modo);
      } else {
        marcar();
        const [W0, H0] = dimensoesDoc(E.doc);
        const [W1, H1] = TAM[fmt] || TAM.feed;
        for (const sl of E.doc.slides) {
          for (const c of sl.camadas) {
            c.x = Math.round((c.x / W0) * W1);
            c.y = Math.round((c.y / H0) * H1);
            c.w = Math.round((c.w / W0) * W1);
            if (c.tipo !== 'texto') c.h = Math.round((c.h / H0) * H1);
          }
        }
        E.doc.formato = fmt;
        E.doc.tamanho = fmt;
        E.doc.largura = W1;
        E.doc.altura = H1;
      }
      E.thumbsCache.clear();
      E.modeloThumbs.clear();
      reconstruirTudo();
      notificarMudancaDoc();
    }

    async function executarAcao(nome, data = {}) {
      const sl = slideAtual();
      const c = camada(E.sel);
      const [W, H] = dimensoesDoc(E.doc);

      const addNovaCamada = nova => {
        marcar();
        sl.camadas.push(normalizarCamada(nova));
        E.sel = nova.id;
        desenharPalco();
        renderContextBar();
        renderPainel();
        atualizarMiniaturaSlideAtual();
        notificarMudancaDoc();
      };

      switch (nome) {
        case 'voltar':
          if (typeof ctx.onVoltar === 'function') ctx.onVoltar();
          return;
        case 'toggleMenu':
          E.menuAberto = !E.menuAberto;
          renderTopMenu();
          return;
        case 'fecharMenu':
          E.menuAberto = false;
          renderTopMenu();
          return;
        case 'salvarImovel':
          E.menuAberto = false;
          renderTopMenu();
          if (typeof ctx.onSalvarImovel === 'function') {
            await ctx.onSalvarImovel({
              doc: copia(E.doc),
              prop: E.prop,
              serializar: () => serializarCenaComTelemetria(apiInstancia.getLiveContext())
            });
          }
          return;
        case 'desfazer':
          return desfazer();
        case 'refazer':
          return refazer();
        case 'pagAnt':
          if (E.slideIdx > 0) {
            E.slideIdx--;
            E.sel = null;
            reconstruirTudo();
          }
          return;
        case 'pagProx':
          if (E.slideIdx < E.doc.slides.length - 1) {
            E.slideIdx++;
            E.sel = null;
            reconstruirTudo();
          }
          return;
        case 'irSlide': {
          const idx = Number(data.idx);
          if (Number.isInteger(idx) && idx >= 0 && idx < E.doc.slides.length) {
            E.slideIdx = idx;
            E.sel = null;
            reconstruirTudo();
          }
          return;
        }
        case 'addSlide': {
          marcar();
          const novo = typeof ctx.onAddPagina === 'function'
            ? ctx.onAddPagina({ doc: E.doc })
            : criarSlideVazio(W, H, `Página ${E.doc.slides.length + 1}`, sl?.fundo || '#171721');
          const slideNorm = normalizarDoc({ slides: [novo || criarSlideVazio(W, H)] }, modo).slides[0];
          E.doc.slides.push(slideNorm);
          E.slideIdx = E.doc.slides.length - 1;
          E.sel = null;
          reconstruirTudo();
          notificarMudancaDoc();
          return;
        }
        case 'rmSlide': {
          const idx = Number(data.idx);
          if (E.doc.slides.length <= 1 || !Number.isInteger(idx)) return;
          marcar();
          E.doc.slides.splice(idx, 1);
          E.slideIdx = clamp(E.slideIdx, 0, E.doc.slides.length - 1);
          E.sel = null;
          reconstruirTudo();
          notificarMudancaDoc();
          return;
        }
        case 'aba':
          E.abaAtiva = data.aba || 'modelos';
          E.sheetModo = 'aba';
          E.propPainel = null;
          renderPainel();
          return;
        case 'sheet':
          E.abaAtiva = data.aba || 'modelos';
          E.sheetModo = 'aba';
          E.propPainel = null;
          E.sheetAberta = true;
          qs('#stMobileSheet')?.classList.remove('hide');
          qs('#stSheetBackdrop')?.classList.remove('hide');
          renderPainel();
          return;
        case 'propTool': {
          const pKey = data.prop;
          if (!pKey) return;
          if (pKey === 'camadas') {
            return executarAcao('sheet', { aba: 'camadas' });
          }
          E.sheetModo = 'prop';
          E.propPainel = pKey;
          E.rodaPara = pKey === 'cor' ? (c?.tipo === 'logo' ? 'corFundo' : c?.tipo === 'degrade' ? 'cor2' : 'cor') : null;
          E.sheetAberta = true;
          qs('#stMobileSheet')?.classList.remove('hide');
          qs('#stSheetBackdrop')?.classList.remove('hide');
          renderPainel();
          return;
        }
        case 'concluirEdicao':
          E.sel = null;
          fecharSheetUi();
          desenharPalco();
          renderContextBar();
          renderPainel();
          return;
        case 'abrirCamadasRapido':
          if (typeof window !== 'undefined' && window.innerWidth < 900) {
            return executarAcao('sheet', { aba: 'camadas' });
          }
          return executarAcao('aba', { aba: 'camadas' });
        case 'tabCamadas':
          E.camadasTab = data.tab === 'sobreposicao' ? 'sobreposicao' : 'tudo';
          renderPainel();
          return;
        case 'editarInline':
          if (c && c.tipo === 'texto' && !c.travada) {
            fecharSheetUi();
            const node = contentLayer.findOne(n => n.getAttr && n.getAttr('bigaId') === c.id);
            if (node) abrirEdicaoInlineTexto(c, node);
          }
          return;
        case 'toggleBold':
          if (c && c.tipo === 'texto') {
            marcar();
            c.peso = Number(c.peso) >= 600 ? 400 : 700;
            await carregarFonte(c.fonte, c.peso, c.italico);
            desenharPalco();
            renderPainel();
            atualizarMiniaturaSlideAtual();
            notificarMudancaDoc();
          }
          return;
        case 'toggleItalico':
          if (c && c.tipo === 'texto') {
            marcar();
            c.italico = !c.italico;
            await carregarFonte(c.fonte, c.peso, c.italico);
            desenharPalco();
            renderPainel();
            atualizarMiniaturaSlideAtual();
            notificarMudancaDoc();
          }
          return;
        case 'toggleCaps':
          if (c && c.tipo === 'texto') {
            marcar();
            c.maiusculas = !c.maiusculas;
            desenharPalco();
            renderPainel();
            atualizarMiniaturaSlideAtual();
            notificarMudancaDoc();
          }
          return;
        case 'setAlinhamento':
          if (c && c.tipo === 'texto' && ['left', 'center', 'right'].includes(data.val)) {
            marcar();
            c.alinhamento = data.val;
            desenharPalco();
            renderPainel();
            atualizarMiniaturaSlideAtual();
            notificarMudancaDoc();
          }
          return;
        case 'converterPoligono':
          if (c && c.tipo === 'retangulo') {
            marcar();
            const cw = Number(c.w) || 200;
            const ch = Number(c.h) || 140;
            c.tipo = 'poligono';
            c.blurFundo = 0;
            c.vertices = [{ x: 0, y: 0 }, { x: cw, y: 0 }, { x: cw, y: ch }, { x: 0, y: ch }];
            desenharPalco();
            renderPainel();
            atualizarMiniaturaSlideAtual();
            notificarMudancaDoc();
          }
          return;
        case 'fecharSheet':
          fecharSheetUi();
          return;
        case 'abrirAjustar':
          E.abaAtiva = 'ajustar';
          if (typeof window !== 'undefined' && window.innerWidth < 900) {
            return executarAcao('propTool', { prop: E.propPainel || (c?.tipo === 'foto' ? 'ajustarFoto' : c?.tipo === 'texto' ? 'editar' : 'estiloBorda') });
          }
          renderPainel();
          return;
        case 'abrirAjustarRoda':
          E.rodaPara = E.rodaPara === data.k ? null : data.k;
          return executarAcao('abrirAjustar');
        case 'zoomMenos':
        case 'zoomMais': {
          const atual = E.zoomModo === 'fit' ? E.stageScale : Number(E.zoomModo);
          const next = clamp(Math.round((atual + (nome === 'zoomMais' ? 0.15 : -0.15)) * 100) / 100, 0.5, 2);
          E.zoomModo = next;
          ajustarEscalaPalco();
          preencherSelectsTopbar();
          return;
        }
        case 'toggleChipsDado':
          E.chipsDadoAberto = !E.chipsDadoAberto;
          renderPainel();
          return;
        case 'abrirDadoTexto':
          E.abaAtiva = 'texto';
          E.chipsDadoAberto = true;
          renderPainel();
          return;
        case 'inserirDado': {
          const tk = data.token;
          const lbl = data.label || 'Dado';
          if (c && c.tipo === 'texto') {
            marcar();
            c.texto = tk;
            delete c.campoVinculadoAnterior;
            desenharPalco();
            renderContextBar();
            renderPainel();
            atualizarMiniaturaSlideAtual();
            notificarMudancaDoc();
          } else {
            await carregarFonte('Inter', 700);
            addNovaCamada({
              id: uid(), tipo: 'texto', nome: lbl, texto: tk,
              x: Math.round(W * 0.1), y: Math.round(H * 0.45), w: Math.round(W * 0.6), h: 80,
              fonte: 'Inter', peso: 700, tamanho: Math.round(W * 0.042), cor: '#ffffff', alinhamento: 'left'
            });
          }
          return;
        }
        case 'reconectar':
          if (c && c.tipo === 'texto' && c.campoVinculadoAnterior) {
            marcar();
            c.texto = c.campoVinculadoAnterior;
            delete c.campoVinculadoAnterior;
            desenharPalco();
            renderContextBar();
            renderPainel();
            atualizarMiniaturaSlideAtual();
            notificarMudancaDoc();
          }
          return;
        case 'addTexto': {
          await carregarFonte('Inter', 700);
          const estilo = data.estilo || 'titulo';
          const sz = estilo === 'titulo' ? Math.round(W * 0.06) : estilo === 'subtitulo' ? Math.round(W * 0.036) : Math.round(W * 0.024);
          const txt = estilo === 'titulo' ? 'Título em destaque' : estilo === 'subtitulo' ? 'Subtítulo elegante' : 'Descrição ou detalhe do imóvel';
          addNovaCamada({
            id: uid(), tipo: 'texto', nome: estilo === 'titulo' ? 'Título' : estilo === 'subtitulo' ? 'Subtítulo' : 'Texto',
            texto: txt, x: Math.round(W * 0.1), y: Math.round(H * 0.42), w: Math.round(W * 0.72), h: 80,
            fonte: 'Inter', peso: estilo === 'corpo' ? 400 : 700, tamanho: sz, cor: '#ffffff', alinhamento: 'left'
          });
          return;
        }
        case 'addCamada': {
          const tipo = data.tipo;
          if (tipo === 'retangulo' || tipo === 'retanguloVidro') {
            addNovaCamada({
              id: uid(), tipo: 'retangulo', nome: tipo === 'retanguloVidro' ? 'Vidro fosco' : 'Retângulo',
              x: Math.round(W * 0.25), y: Math.round(H * 0.25), w: Math.round(W * 0.4), h: Math.round(H * 0.3),
              cor: tipo === 'retanguloVidro' ? '#ffffff30' : '#5266eb', raio: 20,
              blurFundo: tipo === 'retanguloVidro' ? 18 : 0
            });
          } else if (tipo === 'circulo') {
            const s = Math.round(Math.min(W, H) * 0.28);
            addNovaCamada({ id: uid(), tipo: 'circulo', nome: 'Círculo', x: Math.round((W - s) / 2), y: Math.round((H - s) / 2), w: s, h: s, cor: '#5266eb' });
          } else if (tipo === 'linha') {
            addNovaCamada({ id: uid(), tipo: 'linha', nome: 'Linha', x: Math.round(W * 0.2), y: Math.round(H * 0.5), w: Math.round(W * 0.6), h: 24, pontos: [0, 12, Math.round(W * 0.6), 12], cor: '#d4af37', espessura: 4 });
          } else if (tipo === 'degrade') {
            addNovaCamada({ id: uid(), tipo: 'degrade', nome: 'Degradê', x: 0, y: Math.round(H * 0.5), w: W, h: Math.round(H * 0.5), cor1: '#00000000', cor2: '#000000cc', angulo: 180 });
          } else if (tipo === 'poligono') {
            const pw = Math.round(W * 0.35);
            const ph = Math.round(H * 0.32);
            addNovaCamada({
              id: uid(), tipo: 'poligono', nome: 'Perspectiva 4pt',
              x: Math.round((W - pw) / 2), y: Math.round((H - ph) / 2), w: pw, h: ph,
              cor: '#5266eb',
              vertices: [{ x: Math.round(pw * 0.12), y: 0 }, { x: Math.round(pw * 0.88), y: 0 }, { x: pw, y: ph }, { x: 0, y: ph }]
            });
          } else if (tipo === 'qrcode') {
            const qs2 = Math.round(Math.min(W, H) * 0.22);
            addNovaCamada({ id: uid(), tipo: 'qrcode', nome: 'QR WhatsApp', x: W - qs2 - 48, y: H - qs2 - 48, w: qs2, h: qs2, corEscuro: '#171721', corClaro: '#ffffff', raio: 12 });
          } else if (tipo === 'logo') {
            const ls = Math.round(Math.min(W, H) * 0.16);
            addNovaCamada({ id: uid(), tipo: 'logo', nome: 'Logo da Marca', origem: 'kit', x: 48, y: 48, w: ls, h: ls, forma: 'quadrado', raio: 16 });
          }
          return;
        }
        case 'addIcone': {
          const icId = data.ic || 'estrela';
          const info = Object.prototype.hasOwnProperty.call(ICONES_SVG, icId) ? ICONES_SVG[icId] : ICONES_SVG.estrela;
          const sz = Math.round(Math.min(W, H) * 0.11);
          addNovaCamada({ id: uid(), tipo: 'icone', nome: info.label, iconeId: icId, x: Math.round((W - sz) / 2), y: Math.round((H - sz) / 2), w: sz, h: sz, cor: '#ffffff', formaFundo: 'circulo', corFundo: '#5266eb' });
          return;
        }
        case 'usarFoto': {
          const idx = Number(data.i) || 0;
          if (c && c.tipo === 'foto') {
            marcar();
            c.indiceFoto = idx;
            delete c.fotoCustom;
            desenharPalco();
            renderPainel();
            atualizarMiniaturaSlideAtual();
            notificarMudancaDoc();
          } else {
            const fw = Math.round(W * 0.45);
            const fh = Math.round(H * 0.45);
            addNovaCamada({ id: uid(), tipo: 'foto', nome: `Foto ${idx + 1}`, x: Math.round((W - fw) / 2), y: Math.round((H - fh) / 2), w: fw, h: fh, indiceFoto: idx, raio: 16, zoom: 1, offX: 0, offY: 0, brilho: 100, contraste: 100, saturacao: 100, desfoque: 0 });
          }
          return;
        }
        case 'trocarFotoCamada':
          if (c && c.tipo === 'foto') {
            marcar();
            c.indiceFoto = Number(data.i) || 0;
            delete c.fotoCustom;
            desenharPalco();
            renderPainel();
            atualizarMiniaturaSlideAtual();
            notificarMudancaDoc();
          }
          return;
        case 'selCamada':
          E.sel = data.id;
          desenharPalco();
          renderContextBar();
          renderPainel();
          return;
        case 'duplicar':
          if (!c) return;
          addNovaCamada({ ...copia(c), id: uid(), nome: `${c.nome || c.tipo} (cópia)`, x: (c.x || 0) + 28, y: (c.y || 0) + 28 });
          return;
        case 'apagar':
          if (!c) return;
          marcar();
          sl.camadas = sl.camadas.filter(x => x.id !== c.id);
          E.sel = null;
          desenharPalco();
          renderContextBar();
          renderPainel();
          atualizarMiniaturaSlideAtual();
          notificarMudancaDoc();
          return;
        case 'subirCamada':
        case 'descerCamada': {
          const i = sl.camadas.findIndex(x => x.id === data.id);
          const j = nome === 'subirCamada' ? i + 1 : i - 1;
          if (i < 0 || j < 0 || j >= sl.camadas.length) return;
          marcar();
          [sl.camadas[i], sl.camadas[j]] = [sl.camadas[j], sl.camadas[i]];
          desenharPalco();
          renderPainel();
          atualizarMiniaturaSlideAtual();
          notificarMudancaDoc();
          return;
        }
        case 'verCamada':
        case 'travarCamada': {
          const x = sl.camadas.find(cam => cam.id === data.id);
          if (!x) return;
          marcar();
          if (nome === 'verCamada') x.visivel = x.visivel === false;
          else x.travada = !x.travada;
          desenharPalco();
          renderContextBar();
          renderPainel();
          atualizarMiniaturaSlideAtual();
          notificarMudancaDoc();
          return;
        }
        case 'alinhar':
          if (!c) return;
          marcar();
          alinharCamada(c, data.a);
          desenharPalco();
          renderPainelPropriedadesValores();
          atualizarMiniaturaSlideAtual();
          notificarMudancaDoc();
          return;
        case 'tamMenos':
        case 'tamMais':
          if (c && c.tipo === 'texto') {
            marcar();
            c.tamanho = clamp((Number(c.tamanho) || 40) + (nome === 'tamMais' ? 4 : -4), 6, 600);
            desenharPalco();
            renderContextBar();
            renderPainelPropriedadesValores();
            atualizarMiniaturaSlideAtual();
            notificarMudancaDoc();
          }
          return;
        case 'toggleEnquadrar':
          E.enquadrar = !E.enquadrar;
          renderContextBar();
          return;
        case 'escolherFonte':
          if (c && c.tipo === 'texto') {
            marcar();
            c.fonte = data.f;
            await listaFontes();
            const ws = pesosDe(c.fonte);
            if (!ws.includes(Number(c.peso))) c.peso = ws.reduce((a, b) => (Math.abs(b - (c.peso || 400)) < Math.abs(a - (c.peso || 400)) ? b : a), 400);
            await carregarFonte(c.fonte, c.peso, c.italico);
            desenharPalco();
            renderPainel();
            atualizarMiniaturaSlideAtual();
            notificarMudancaDoc();
          }
          return;
        case 'roda':
          E.rodaPara = E.rodaPara === data.k ? null : data.k;
          renderPainel();
          return;
        case 'fecharRoda':
          E.rodaPara = null;
          renderPainel();
          return;
        case 'paletaCor':
          marcar();
          aplicarCor(E.rodaPara, data.c, true);
          return;
        case 'addPaleta': {
          const hex = valorCorDe(E.rodaPara);
          E.doc.paleta = [...new Set([hex, ...(E.doc.paleta || [])])].slice(0, 12);
          toast('Cor salva na paleta.');
          renderPainel();
          return;
        }
        case 'contaGotas':
          try {
            const res = await new globalScope.EyeDropper().open();
            marcar();
            aplicarCor(E.rodaPara, res.sRGBHex.toLowerCase(), true);
          } catch {}
          return;
        case 'aplicarPaleta':
          if (typeof ctx.onSelectPaleta === 'function') {
            const ret = await ctx.onSelectPaleta(data.pal);
            if (ret) {
              E.doc = normalizarDoc(ret, modo);
              reconstruirTudo();
            }
          } else {
            const pal = data.pal === 'segunda' ? E.kit?.cores2 : E.kit?.cores1;
            if (pal && sl) {
              marcar();
              sl.fundo = pal.fundo || sl.fundo;
              desenharPalco();
              atualizarMiniaturaSlideAtual();
              notificarMudancaDoc();
            }
          }
          return;
        case 'escolherPronto': {
          const prontos = Array.isArray(ctx.modelosProntos) && ctx.modelosProntos.length
            ? ctx.modelosProntos
            : [criarModeloPadrao('classico', E.doc.formato), criarModeloPadrao('faixa', E.doc.formato), criarModeloPadrao('minimal', E.doc.formato)];
          const mod = prontos.find(m => String(m.id) === String(data.id));
          if (!mod) return;
          marcar();
          const novo = typeof ctx.onSelectModeloPronto === 'function'
            ? await ctx.onSelectModeloPronto(mod)
            : (typeof mod.criar === 'function' ? mod.criar(E.doc.formato) : (mod.doc || mod));
          if (novo) {
            E.doc = normalizarDoc(novo, modo);
            E.slideIdx = 0;
            E.sel = null;
            E.thumbsCache.clear();
            reconstruirTudo();
            notificarMudancaDoc();
          }
          return;
        }
        case 'escolherMeu': {
          const meus = getMeusModelos();
          const mod = meus.find(m => String(m.id) === String(data.id));
          if (!mod) return;
          marcar();
          const novo = typeof ctx.onSelectMeuModelo === 'function'
            ? await ctx.onSelectMeuModelo(mod)
            : (mod.doc || mod);
          if (novo) {
            E.doc = normalizarDoc(novo, modo);
            E.slideIdx = 0;
            E.sel = null;
            E.thumbsCache.clear();
            reconstruirTudo();
            notificarMudancaDoc();
          }
          return;
        }
        case 'favModelo':
          if (typeof ctx.onFavoritarModelo === 'function') {
            await ctx.onFavoritarModelo(data.id);
            renderPainel();
          }
          return;
        case 'renomearModelo': {
          const meus = getMeusModelos();
          const mod = meus.find(m => String(m.id) === String(data.id));
          if (!mod) return;
          abrirModal(`
            <div class="studio-modal-head">
              <h3>Renomear modelo</h3>
              <button type="button" class="studio-icon-btn" data-st="fecharModal">✕</button>
            </div>
            <div class="studio-stack">
              <label class="studio-field"><span>Novo nome</span><input type="text" name="stRenameModel" value="${esc(mod.nome || '')}" maxlength="60"></label>
              <button type="button" class="studio-primary-btn full" data-st="confirmarRenomearModelo" data-id="${esc(mod.id)}">Salvar nome</button>
            </div>
          `);
          return;
        }
        case 'confirmarRenomearModelo': {
          const novoNome = String(qs('input[name="stRenameModel"]')?.value || '').trim();
          if (!novoNome) return toast('Digite um nome válido.', true);
          const meus = getMeusModelos();
          const mod = meus.find(m => String(m.id) === String(data.id));
          if (!mod) return fecharModal();
          if (typeof ctx.onRenomearModelo === 'function') {
            await ctx.onRenomearModelo(mod.id, novoNome);
          } else if (typeof ctx.onSalvarModelo === 'function') {
            await ctx.onSalvarModelo({ id: mod.id, doc: copia(mod.doc || mod), comoNovo: false, nome: novoNome });
          } else {
            mod.nome = novoNome;
          }
          fecharModal();
          renderPainel();
          toast('Modelo renomeado.');
          return;
        }
        case 'duplicarModelo': {
          const meus = getMeusModelos();
          const mod = meus.find(m => String(m.id) === String(data.id));
          if (!mod) return;
          if (typeof ctx.onDuplicarModelo === 'function') {
            await ctx.onDuplicarModelo(mod.id);
          } else if (typeof ctx.onSalvarModelo === 'function') {
            await ctx.onSalvarModelo({ doc: copia(mod.doc || mod), comoNovo: true, nome: `${mod.nome || 'Modelo'} (cópia)` });
          }
          renderPainel();
          toast('Modelo duplicado.');
          return;
        }
        case 'mudarFormato':
          return aplicarMudancaFormato(data.fmt);
        case 'delModelo':
          if (typeof ctx.onExcluirModelo === 'function') {
            await ctx.onExcluirModelo(data.id);
            renderPainel();
          }
          return;
        case 'salvarModelo': {
          E.menuAberto = false;
          renderTopMenu();
          const comoNovo = data.novo === '1';
          if (typeof ctx.onSalvarModelo === 'function') {
            await ctx.onSalvarModelo({ doc: copia(E.doc), comoNovo, nome: E.doc.nome || 'Meu modelo' });
            renderPainel();
          } else {
            toast('Modelo atualizado localmente.');
          }
          return;
        }
        case 'restaurarPadrao':
          E.menuAberto = false;
          renderTopMenu();
          if (typeof ctx.onRestaurar === 'function') {
            const ret = await ctx.onRestaurar();
            if (ret) {
              E.doc = normalizarDoc(ret, modo);
              E.slideIdx = 0;
              E.sel = null;
              E.thumbsCache.clear();
              reconstruirTudo();
            }
          }
          return;
        case 'editarImovel':
          E.menuAberto = false;
          renderTopMenu();
          if (typeof ctx.onEditarImovel === 'function') ctx.onEditarImovel(E.prop);
          return;
        case 'abrirLote':
          E.menuAberto = false;
          renderTopMenu();
          if (typeof ctx.onLote === 'function') ctx.onLote({ doc: copia(E.doc), serializar: () => serializarCenaComTelemetria(apiInstancia.getLiveContext()) });
          return;
        case 'apresentar':
          return abrirApresentacao();
        case 'abrirExportar':
          return abrirModalExportar();
        case 'abrirModalKit':
          E.menuAberto = false;
          renderTopMenu();
          return abrirModalKit();
        case 'fecharModal':
          return fecharModal();
        case 'execExportar':
          fecharModal();
          if (typeof ctx.onExportar === 'function') {
            return ctx.onExportar({
              tipo: data.fmt,
              doc: copia(E.doc),
              stage,
              serializar: () => serializarCenaComTelemetria(apiInstancia.getLiveContext())
            });
          }
          return exportarImagemLocal(data.fmt);
        case 'enviarVitrine':
          fecharModal();
          if (typeof ctx.onVitrine === 'function') {
            const [W2, H2] = dimensoesDoc(E.doc);
            const png = await renderizarMiniaturaCanvas(slideAtual(), varsAtuais(), E.kit, W2, H2, { docW: W2, docH: H2, prop: E.prop, fotoUrl: fotoUrlFn });
            return ctx.onVitrine({ prop: E.prop, dataUrl: png, doc: copia(E.doc) });
          }
          return;
        case 'enviarWhatsapp': {
          const tel = qs('input[name="stWaTel"]')?.value || '';
          const msg = qs('textarea[name="stWaMsg"]')?.value || '';
          if (typeof ctx.onWhatsapp === 'function') {
            await ctx.onWhatsapp({ prop: E.prop, telefone: tel, mensagem: msg, doc: copia(E.doc), serializar: () => serializarCenaComTelemetria(apiInstancia.getLiveContext()) });
            fecharModal();
          }
          return;
        }
        case 'salvarKit': {
          const kOut = { ...E.kit };
          el.querySelectorAll('[data-kit]').forEach(inp => {
            const ch = inp.dataset.kit;
            if (!FORBIDDEN_KEYS.has(ch) && ['marca', 'corretor', 'creci', 'telefone', 'email', 'rodape'].includes(ch)) {
              if (ch === 'marca') kOut.marca = inp.value;
              else if (ch === 'corretor') kOut.corretor = inp.value;
              else if (ch === 'creci') kOut.creci = inp.value;
              else if (ch === 'telefone') kOut.telefone = inp.value;
              else if (ch === 'email') kOut.email = inp.value;
              else if (ch === 'rodape') kOut.rodape = inp.value;
            }
          });
          if (typeof ctx.onSalvarKit === 'function') E.kit = await ctx.onSalvarKit(kOut) || kOut;
          else E.kit = kOut;
          desenharPalco();
          atualizarMiniaturaSlideAtual();
          toast('Kit de Marca salvo.');
          return;
        }
        case 'salvarModalKit': {
          const kOut = copia(E.kit || {});
          kOut.cores1 = kOut.cores1 || {};
          kOut.cores2 = kOut.cores2 || {};
          el.querySelectorAll('[data-kit-m]').forEach(inp => {
            const ch = inp.dataset.kitM;
            if (ch === 'marca') kOut.marca = inp.value;
            else if (ch === 'corretor') kOut.corretor = inp.value;
            else if (ch === 'creci') kOut.creci = inp.value;
            else if (ch === 'telefone') kOut.telefone = inp.value;
          });
          el.querySelectorAll('[data-kit-c1]').forEach(inp => {
            const ch = inp.dataset.kitC1;
            if (['fundo', 'texto', 'principal', 'secundaria', 'destaque'].includes(ch)) kOut.cores1[ch] = inp.value;
          });
          el.querySelectorAll('[data-kit-c2]').forEach(inp => {
            const ch = inp.dataset.kitC2;
            if (['fundo', 'texto', 'principal', 'secundaria', 'destaque'].includes(ch)) kOut.cores2[ch] = inp.value;
          });
          if (typeof ctx.onSalvarKit === 'function') E.kit = await ctx.onSalvarKit(kOut) || kOut;
          else E.kit = kOut;
          fecharModal();
          reconstruirTudo();
          toast('Kit de Marca atualizado.');
          return;
        }
      }
    }

    const onElClick = ev => {
      const btn = ev.target.closest('[data-st]');
      if (!btn || !el.contains(btn)) return;
      ev.preventDefault();
      executarAcao(btn.dataset.st, { ...btn.dataset }).catch(err => toast(err.message || 'Erro no Studio', true));
    };
    el.addEventListener('click', onElClick);

    const onElInput = ev => {
      const t = ev.target;
      if (t.dataset.stf === 'busca') {
        E.fonteBusca = t.value;
        listarFontesPainel();
        return;
      }
      if (t.dataset.roda === 'v' || t.dataset.roda === 'a') {
        const hsv = hexParaHsv(valorCorDe(E.rodaPara));
        if (t.dataset.roda === 'v') hsv.v = Number(t.value) / 100;
        else hsv.a = Number(t.value) / 100;
        aplicarCor(E.rodaPara, hsvParaHex(hsv), false);
        return;
      }
      if (t.dataset.slideNome) {
        const sl = slideAtual();
        if (sl) {
          sl.nome = t.value;
          renderFilmstrip();
          notificarMudancaDoc();
        }
        return;
      }

      if (t.dataset.raios !== undefined) {
        const c = camada(E.sel);
        const rIdx = Number(t.dataset.raios);
        if (!c || !Number.isInteger(rIdx) || rIdx < 0 || rIdx > 3) return;
        if (!t._marcado) {
          marcar();
          t._marcado = true;
        }
        const rVal = clamp(Number(t.value) || 0, 0, 2000);
        const cur = obterRaiosCamada(c);
        cur[rIdx] = rVal;
        c.raios = cur;
        desenharPalco();
        renderContextBar();
        atualizarMiniaturaSlideAtual();
        notificarMudancaDoc();
        return;
      }

      const k = t.dataset.k;
      if (!k || t.type === 'checkbox' || t.tagName === 'SELECT') return;
      if (k === 'doc.fundo' || (t.closest('.studio-cor') && t.type === 'text')) {
        if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(t.value.trim())) {
          aplicarCor(k, t.value.trim().toLowerCase(), false);
        }
        return;
      }

      const c = camada(E.sel);
      if (!c) return;
      if (!t._marcado) {
        marcar();
        t._marcado = true;
      }

      if (k === 'texto_visual') {
        if (detectarCampoVinculado(c.texto)) c.campoVinculadoAnterior = c.texto;
        c.texto = t.value;
        desenharPalco();
        renderContextBar();
        atualizarMiniaturaSlideAtual();
        notificarMudancaDoc();
        return;
      }

      if (!CAMPOS_EDITAVEIS.has(k) || FORBIDDEN_KEYS.has(k)) return;
      if (k === 'nome' || k === 'url') {
        if (k === 'nome') c.nome = t.value;
        else c.url = t.value;
      } else {
        const numVal = Number(t.value);
        if (!Number.isFinite(numVal)) return;
        if (k === 'x') c.x = numVal;
        else if (k === 'y') c.y = numVal;
        else if (k === 'w') c.w = Math.max(4, numVal);
        else if (k === 'h') c.h = Math.max(4, numVal);
        else if (k === 'rot') c.rot = clamp(numVal, -180, 180);
        else if (k === 'skewX') c.skewX = clamp(numVal, -60, 60);
        else if (k === 'skewY') c.skewY = clamp(numVal, -60, 60);
        else if (k === 'opacidade') c.opacidade = clamp(numVal, 0, 1);
        else if (k === 'tamanho') c.tamanho = clamp(numVal, 6, 600);
        else if (k === 'espacamento') c.espacamento = clamp(numVal, -20, 100);
        else if (k === 'entrelinha') c.entrelinha = clamp(numVal, 0.6, 3);
        else if (k === 'escalaX') {
          c.escalaX = clamp(numVal, 0.1, 5);
          if (E.uniforme && c.tipo === 'texto') c.escalaY = c.escalaX;
        } else if (k === 'escalaY') {
          c.escalaY = clamp(numVal, 0.1, 5);
          if (E.uniforme && c.tipo === 'texto') c.escalaX = c.escalaY;
        } else if (k === 'raioFundo') c.raioFundo = clamp(numVal, 0, 300);
        else if (k === 'folga') c.folga = clamp(numVal, 0, 200);
        else if (k === 'bordaFundo') c.bordaFundo = clamp(numVal, 0, 40);
        else if (k === 'sombra') c.sombra = clamp(numVal, 0, 80);
        else if (k === 'contorno') c.contorno = clamp(numVal, 0, 40);
        else if (k === 'zoom') c.zoom = clamp(numVal, 0.2, 6);
        else if (k === 'offX') c.offX = clamp(numVal, -1, 1);
        else if (k === 'offY') c.offY = clamp(numVal, -1, 1);
        else if (k === 'brilho') c.brilho = clamp(numVal, 0, 300);
        else if (k === 'contraste') c.contraste = clamp(numVal, 0, 300);
        else if (k === 'saturacao') c.saturacao = clamp(numVal, 0, 300);
        else if (k === 'desfoque') c.desfoque = clamp(numVal, 0, 40);
        else if (k === 'raio') {
          c.raio = clamp(numVal, 0, 2000);
          delete c.raios;
          el.querySelectorAll('[data-raios]').forEach(inpR => { inpR.value = c.raio; });
        }
        else if (k === 'borda') c.borda = clamp(numVal, 0, 80);
        else if (k === 'blurFundo') c.blurFundo = clamp(numVal, 0, 40);
        else if (k === 'espessura') c.espessura = clamp(numVal, 1, 80);
        else if (k === 'angulo') c.angulo = clamp(numVal, 0, 360);

        el.querySelectorAll(`[data-k="${CSS.escape(k)}"]`).forEach(o => {
          if (o !== t) o.value = numVal;
        });
      }
      desenharPalco();
      renderContextBar();
      atualizarMiniaturaSlideAtual();
      notificarMudancaDoc();
    };
    el.addEventListener('input', onElInput);

    const onElChange = async ev => {
      const t = ev.target;
      if (t.name === 'stImovel' || t.name === 'stSheetImovel') {
        const p = getInventario().find(x => String(x.id) === String(t.value)) || null;
        E.prop = p;
        E.thumbsCache.clear();
        E.modeloThumbs.clear();
        if (typeof ctx.onSelectImovel === 'function') {
          const ret = await ctx.onSelectImovel(p);
          if (ret && ret.doc) E.doc = normalizarDoc(ret.doc, modo);
          if (ret && ret.fichaOverride !== undefined) E.fichaOverride = ret.fichaOverride;
        }
        reconstruirTudo();
        if (t.name === 'stSheetImovel') {
          E.menuAberto = false;
          renderTopMenu();
        }
        return;
      }
      if (t.name === 'stFormato' || t.name === 'stSheetFormato') {
        await aplicarMudancaFormato(t.value);
        if (t.name === 'stSheetFormato') {
          E.menuAberto = false;
          renderTopMenu();
        }
        return;
      }
      if (t.name === 'stZoom') {
        E.zoomModo = t.value === 'fit' ? 'fit' : Number(t.value) || 1;
        ajustarEscalaPalco();
        return;
      }
      if (t.name === 'stUploadFoto' && t.files && t.files[0]) {
        const f = t.files[0];
        t.value = '';
        if (f.size > 2 * 1024 * 1024) return toast('Escolha uma imagem de até 2 MB.', true);
        const dataUrl = await new Promise(res => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.onerror = () => res(null);
          fr.readAsDataURL(f);
        });
        if (!dataUrl) return toast('Falha ao ler imagem.', true);
        const [W, H] = dimensoesDoc(E.doc);
        const fw = Math.round(W * 0.5);
        const fh = Math.round(H * 0.5);
        marcar();
        const nova = normalizarCamada({
          id: uid(), tipo: 'foto', nome: 'Foto enviada', fotoCustom: dataUrl,
          x: Math.round((W - fw) / 2), y: Math.round((H - fh) / 2), w: fw, h: fh, raio: 16
        });
        slideAtual().camadas.push(nova);
        E.sel = nova.id;
        reconstruirTudo();
        notificarMudancaDoc();
        return;
      }
      if (t.name === 'stUploadLogoKit' && t.files && t.files[0]) {
        const f = t.files[0];
        t.value = '';
        const maxBytes = typeof ctx.onUploadLogoKit === 'function' ? 5 * 1024 * 1024 : 350 * 1024;
        if (f.size > maxBytes) {
          return toast(typeof ctx.onUploadLogoKit === 'function' ? 'Logo até 5 MB (PNG transparente fica ideal).' : 'Logo até 350 KB (PNG transparente fica ideal).', true);
        }
        const dataUrl = await new Promise(res => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.onerror = () => res(null);
          fr.readAsDataURL(f);
        });
        if (!dataUrl) return;
        if (typeof ctx.onUploadLogoKit === 'function') {
          const r = await ctx.onUploadLogoKit(f, dataUrl);
          const kitResp = (r && r.kit && typeof r.kit === 'object') ? r.kit : {};
          const urlFinal = (r && r.logoUrl) || kitResp.logoUrl || dataUrl;
          E.kit = { ...E.kit, ...kitResp, logoUrl: urlFinal, logo: urlFinal };
        } else {
          E.kit = { ...E.kit, logoUrl: dataUrl, logo: dataUrl };
        }
        reconstruirTudo();
        toast('Logo atualizada no Kit de Marca.');
        return;
      }
      if (t.dataset.stf === 'cat') {
        E.fonteCat = t.value;
        listarFontesPainel();
        return;
      }

      if (t.dataset.k) t._marcado = false;
      if (t.dataset.raios !== undefined) {
        const c = camada(E.sel);
        const rIdx = Number(t.dataset.raios);
        if (!c || !Number.isInteger(rIdx) || rIdx < 0 || rIdx > 3) return;
        if (!t._marcado) {
          marcar();
          t._marcado = true;
        }
        const rVal = clamp(Number(t.value) || 0, 0, 2000);
        const cur = obterRaiosCamada(c);
        cur[rIdx] = rVal;
        c.raios = cur;
        desenharPalco();
        renderContextBar();
        atualizarMiniaturaSlideAtual();
        notificarMudancaDoc();
        return;
      }

      const k = t.dataset.k;
      if (k === '__uniforme') { E.uniforme = t.checked; return; }
      if (k === '__enquadrar') { E.enquadrar = t.checked; return; }

      const c = camada(E.sel);
      if (!c || !k || !CAMPOS_EDITAVEIS.has(k) || FORBIDDEN_KEYS.has(k)) return;
      marcar();
      if (t.type === 'checkbox') {
        if (k === 'italico') c.italico = t.checked;
        else if (k === 'maiusculas') c.maiusculas = t.checked;
        else if (k === 'autoFit') c.autoFit = t.checked;
        else if (k === 'fundo') c.fundo = t.checked;
        else if (k === 'tracejado') c.tracejado = t.checked;
        if (k === 'italico') await carregarFonte(c.fonte, c.peso, c.italico);
        desenharPalco();
        renderPainel();
        atualizarMiniaturaSlideAtual();
        notificarMudancaDoc();
      } else if (t.tagName === 'SELECT') {
        if (k === 'peso') {
          c.peso = Number(t.value) || 400;
          await carregarFonte(c.fonte, c.peso, c.italico);
        } else if (k === 'alinhamento') c.alinhamento = t.value;
        else if (k === 'ancora') c.ancora = t.value;
        else if (k === 'formaFundo') c.formaFundo = t.value;
        else if (k === 'origem') c.origem = t.value;
        else if (k === 'forma') c.forma = t.value;
        desenharPalco();
        renderPainel();
        atualizarMiniaturaSlideAtual();
        notificarMudancaDoc();
      }
    };
    const onElChangeWrap = ev => {
      onElChange(ev).catch(err => toast(err.message || 'Erro ao aplicar alteração', true));
    };
    el.addEventListener('change', onElChangeWrap);

    // ---------------- Teclado Global do Studio
    const onKeyDown = ev => {
      E.shiftDown = ev.shiftKey;
      if (E.inlineEdit) return;
      const alvo = ev.target;
      if (alvo && ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName)) return;
      if (!el.isConnected) return;

      const ctrl = ev.ctrlKey || ev.metaKey;
      if (ctrl && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) refazer();
        else desfazer();
        return;
      }
      if (ctrl && ev.key.toLowerCase() === 'y') {
        ev.preventDefault();
        refazer();
        return;
      }
      const c = camada(E.sel);
      if (!c) return;
      if (ctrl && ev.key.toLowerCase() === 'd') {
        ev.preventDefault();
        executarAcao('duplicar');
        return;
      }
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        ev.preventDefault();
        executarAcao('apagar');
        return;
      }
      const passo = ev.shiftKey ? 10 : 1;
      const mov = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[ev.key];
      if (mov && !c.travada) {
        ev.preventDefault();
        marcar();
        c.x = (Number(c.x) || 0) + mov[0];
        c.y = (Number(c.y) || 0) + mov[1];
        desenharPalco();
        renderPainelPropriedadesValores();
        atualizarMiniaturaSlideAtual();
        notificarMudancaDoc();
      }
    };
    const onKeyUp = ev => { E.shiftDown = ev.shiftKey; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Fecha menu dropdown se clicar fora
    const onDocClick = ev => {
      if (E.menuAberto && !ev.target.closest('.studio-menu-wrap') && !ev.target.closest('#stActionSheet')) {
        E.menuAberto = false;
        renderTopMenu();
      }
    };
    document.addEventListener('click', onDocClick);

    // ---------------- Inicialização
    (async () => {
      await Promise.all([
        listaFontes(),
        carregarFonte('Inter', 700),
        carregarFonte('Playfair Display', 700),
        carregarFonte('Montserrat', 700),
        carregarFonte('Jost', 500)
      ]);
      // Pré-carrega fontes usadas no documento
      const fontesUsadas = new Set();
      for (const sl of E.doc.slides) {
        for (const c of sl.camadas) {
          if (c.tipo === 'texto' && c.fonte) fontesUsadas.add(`${c.fonte}|${c.peso || 400}|${Boolean(c.italico)}`);
        }
      }
      await Promise.all([...fontesUsadas].map(key => {
        const [f, p, i] = key.split('|');
        return carregarFonte(f, Number(p), i === 'true');
      }));
      if (!E.destroyed) {
        reconstruirTudo();
        stageContainer.focus({ preventScroll: true });
      }
    })().catch(err => toast(err.message || 'Erro ao iniciar Studio', true));

    const apiInstancia = {
      setDoc(novoDoc) {
        E.doc = normalizarDoc(novoDoc, modo);
        E.slideIdx = clamp(E.slideIdx, 0, E.doc.slides.length - 1);
        E.sel = null;
        E.thumbsCache.clear();
        reconstruirTudo();
      },
      setProp(novoProp, novaFichaOverride) {
        E.prop = novoProp;
        if (novaFichaOverride !== undefined) E.fichaOverride = novaFichaOverride;
        E.thumbsCache.clear();
        E.modeloThumbs.clear();
        reconstruirTudo();
      },
      setKit(novoKit) {
        E.kit = novoKit || E.kit;
        E.thumbsCache.clear();
        E.modeloThumbs.clear();
        reconstruirTudo();
      },
      setMeusModelos(lista) {
        ctx.meusModelos = lista;
        E.modeloThumbs.clear();
        renderPainel();
      },
      getDoc() {
        return copia(E.doc);
      },
      getLiveContext() {
        return {
          stage,
          contentLayer,
          doc: copia(E.doc),
          slideIdx: E.slideIdx,
          prop: E.prop,
          kit: E.kit,
          fichaOverride: E.fichaOverride,
          fotoUrl: fotoUrlFn
        };
      },
      serializarCenaComTelemetria() {
        return serializarCenaComTelemetria(apiInstancia.getLiveContext());
      },
      renderizarMiniatura(idx = E.slideIdx, w = 240, h = 135) {
        const sl = E.doc.slides[idx] || slideAtual();
        const [W, H] = dimensoesDoc(E.doc);
        return renderizarMiniaturaCanvas(sl, varsAtuais(), E.kit, w, h, { docW: W, docH: H, prop: E.prop, fotoUrl: fotoUrlFn });
      },
      irParaSlide(idx) {
        executarAcao('irSlide', { idx });
      },
      destruir() {
        E.destroyed = true;
        if (typeof fecharPresAtiva === 'function') fecharPresAtiva();
        fecharEdicaoInline(false);
        if (resizeObs) resizeObs.disconnect();
        stageContainer.removeEventListener('touchmove', bloquearTouchPalco);
        stageContainer.removeEventListener('gesturestart', bloquearTouchPalco);
        stageContainer.removeEventListener('gesturechange', bloquearTouchPalco);
        stageContainer.removeEventListener('pointercancel', cancelarArrasteSeguro);
        stageContainer.removeEventListener('touchcancel', cancelarArrasteSeguro);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        document.removeEventListener('click', onDocClick);
        el.removeEventListener('click', onElClick);
        el.removeEventListener('input', onElInput);
        el.removeEventListener('change', onElChangeWrap);
        stage.destroy();
        if (_instanciaAtiva === apiInstancia) _instanciaAtiva = null;
      }
    };

    _instanciaAtiva = apiInstancia;
    return apiInstancia;
  }

  // ------------------------------------------------------------------ Exportação Global
  globalScope.BIGA_STUDIO = {
    montar,
    ICONES_SVG,
    CAMPOS_INTELIGENTES,
    resolverVariaveis,
    substituirTokens,
    detectarCampoVinculado,
    listaFontes,
    pesosDe,
    carregarFonte,
    previaFonte,
    safeFont,
    hexParaHsv,
    hsvParaHex,
    hexRgba,
    serializarCenaComTelemetria,
    renderizarMiniaturaCanvas,
    uid,
    copia,
    clamp,
    TAM,
    criarModeloPadrao,
    normalizarDoc
  };
})(typeof window !== 'undefined' ? window : globalThis);
