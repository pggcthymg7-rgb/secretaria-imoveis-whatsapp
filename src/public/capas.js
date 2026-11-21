/* ==========================================================================
 * BIGA — Capas, Carrossel & 12 Modelos Prontos (sobre window.BIGA_STUDIO)
 * Compatível com CSP script-src 'self', Node vm.runInNewContext({ window, Set, Map })
 * Sem inline scripts/atributos, sem blob: em <img src>, sem escrita dinâmica em estado.
 * ========================================================================== */
(function (globalScope) {
  'use strict';

  const TAM = {
    feed: [1080, 1350, 'Feed 4:5'],
    quadrado: [1080, 1080, 'Quadrado 1:1'],
    story: [1080, 1920, 'Story 9:16']
  };

  const MAX_SLIDES = 10;
  const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const ALIASES = {
    classico: 'assinatura-classica',
    faixa: 'faixa-imperial',
    minimal: 'moldura-serena'
  };

  const KIT_PADRAO = {
    marca: 'BIGA',
    cores1: { fundo: '#0E0E0F', texto: '#ECE9E2', principal: '#2A2A2D', secundaria: '#8C8A84', destaque: '#5266eb' },
    cores2: { fundo: '#F2F0EB', texto: '#131314', principal: '#DAD6CC', secundaria: '#7A776F', destaque: '#8C6420' },
    fonte: 'Inter',
    corretor: '',
    creci: '',
    telefone: '',
    email: '',
    rodape: ''
  };

  const esc = s =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const safeFont = f => (/^[A-Za-z0-9 ]{1,60}$/.test(String(f || '')) ? String(f) : 'Inter');
  const clamp = (v, a, b) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : a;
  };
  const uid = () => Math.random().toString(36).slice(2, 10);
  const copia = o => JSON.parse(JSON.stringify(o));
  const getStudio = () => (globalScope && globalScope.BIGA_STUDIO) || null;
  const brl = v => (Number(v) ? `R$ ${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : 'Consulte');

  const fotosDe = p =>
    (Array.isArray(p?.fotos) ? p.fotos : String(p?.fotos || '').split(/[,;\n]/))
      .map(x => String(x || '').trim())
      .filter(Boolean);

  function formatarFone(fone) {
    const n = String(fone || '').replace(/\D/g, '');
    if (n.length === 13 && n.startsWith('55')) return `(${n.slice(2, 4)}) ${n.slice(4, 9)}-${n.slice(9)}`;
    if (n.length === 12 && n.startsWith('55')) return `(${n.slice(2, 4)}) ${n.slice(4, 8)}-${n.slice(8)}`;
    if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
    if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
    return String(fone || '').trim();
  }

  // ------------------------------------------------------------------ Cores HSV
  function hexParaHsv(hex) {
    const st = getStudio();
    if (st && typeof st.hexParaHsv === 'function') return st.hexParaHsv(hex);
    const m = String(hex || '').match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i) || ['', 'ffffff', 'ff'];
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
    const st = getStudio();
    if (st && typeof st.hsvParaHex === 'function') return st.hsvParaHex(hsv);
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

  // ------------------------------------------------------------------ Variáveis & Tokens
  function variaveis(p, kit) {
    if (!p && !kit) return {};
    const st = getStudio();
    if (st && typeof st.resolverVariaveis === 'function') {
      return st.resolverVariaveis(p, kit);
    }
    if (!p) return {};
    const k = kit || {};
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
    const cidade = p.cidade ? String(p.cidade) : 'Goiânia';
    const localizacao = [bairro, cidade].filter(Boolean).join(', ');
    const nome = p.edificio ? String(p.edificio) : (bairro ? `${tipo} no ${bairro}` : tipo);
    let preco = 'Consulte';
    let precoRotulo = negociacao;
    if (negRaw === 'AGIO' && Number(p.valor_agio) > 0) {
      preco = brl(p.valor_agio);
      precoRotulo = 'Ágio';
    } else if (Number(p.valor) > 0) {
      preco = negRaw === 'ALUGUEL' ? `${brl(p.valor)}/mês` : brl(p.valor);
    }
    const areaNum = p.tamanho_m2 || p.area_terreno;
    const area = areaNum ? (String(areaNum).includes('m²') ? String(areaNum) : `${areaNum} m²`) : '';
    const areaTotal = p.area_terreno ? (String(p.area_terreno).includes('m²') ? String(p.area_terreno) : `${p.area_terreno} m²`) : area;
    const numStr = val => (val !== undefined && val !== null && String(val).trim() !== '' && Number(val) !== 0 ? String(val) : '');
    return {
      '{nome}': nome,
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
      '{destaques}': String(p.caracteristicas || ''),
      '{descricao}': String(p.descricao || ''),
      '{codigo}': p.id ? `#${p.id}` : '',
      '{marca}': k.marca ? String(k.marca) : 'BIGA',
      '{corretor}': k.corretor ? String(k.corretor) : '',
      '{creci}': k.creci ? String(k.creci) : '',
      '{telefone}': formatarFone(k.telefone || ''),
      '{email}': k.email ? String(k.email) : '',
      '{rodape}': k.rodape ? String(k.rodape) : ''
    };
  }

  function trocar(t, vars) {
    const st = getStudio();
    if (st && typeof st.substituirTokens === 'function') return st.substituirTokens(t, vars);
    const mapa = vars && typeof vars === 'object' ? vars : {};
    return String(t ?? '').replace(/\{[A-Za-z0-9_]+\}/g, k => (Object.prototype.hasOwnProperty.call(mapa, k) ? String(mapa[k] ?? '') : k));
  }

  // ------------------------------------------------------------------ Fontes Google (compatibilidade + fallback)
  let FONTES = null;
  const fontesCarregadas = new Set();
  const folhas = new Map();

  async function listaFontes() {
    const st = getStudio();
    if (st && typeof st.listaFontes === 'function') return st.listaFontes();
    if (FONTES) return FONTES;
    try {
      const r = await fetch('/assets/fontes-google.json', { credentials: 'same-origin' });
      if (!r.ok) throw new Error('erro fontes');
      const j = await r.json();
      if (!Array.isArray(j.familias)) throw new Error('formato inválido');
      FONTES = j.familias;
    } catch {
      FONTES = [['Inter', 's', [400, 700]], ['Playfair Display', 'r', [400, 700]], ['Montserrat', 's', [400, 700, 800]]];
    }
    return FONTES;
  }

  const pesosDe = fam => ((FONTES || []).find(f => f[0] === fam) || [fam, 's', [400, 700]])[2];
  const famUrl = fam => encodeURIComponent(fam).replace(/%20/g, '+');

  function linkFonte(href) {
    if (typeof document === 'undefined' || !document.head) return Promise.resolve(false);
    if (folhas.has(href)) return folhas.get(href);
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
          folhas.delete(href);
          l.remove();
        }
        res(ok);
      };
      const t = setTimeout(() => done(false), 8000);
      l.onload = () => done(true);
      l.onerror = () => done(false);
      document.head.appendChild(l);
    });
    folhas.set(href, p);
    return p;
  }

  async function carregarFonte(fam, peso = 400, italico = false) {
    const st = getStudio();
    if (st && typeof st.carregarFonte === 'function') return st.carregarFonte(fam, peso, italico);
    const safeFam = safeFont(fam);
    if (!safeFam || /^(sans-serif|serif)$/i.test(safeFam)) return false;
    await listaFontes();
    const ps = pesosDe(safeFam);
    const ok = italico
      ? await linkFonte(`https://fonts.googleapis.com/css2?family=${famUrl(safeFam)}:ital,wght@${[0, 1].flatMap(i => ps.map(w => `${i},${w}`)).join(';')}&display=swap`)
      : false;
    if (!ok) await linkFonte(`https://fonts.googleapis.com/css2?family=${famUrl(safeFam)}:wght@${ps.join(';')}&display=swap`);
    fontesCarregadas.add(safeFam);
    try {
      await document.fonts.load(`${italico ? 'italic ' : ''}${peso} 48px "${safeFam}"`);
    } catch {}
    return true;
  }

  const suportaContaGotas = () => typeof window !== 'undefined' && 'EyeDropper' in window;

  function duplicarCamadaComRecursos(c, E) {
    if (!c) return null;
    const dup = { ...copia(c), id: uid(), nome: `${c.nome || c.tipo} (cópia)`, x: (Number(c.x) || 0) + 28, y: (Number(c.y) || 0) + 28 };
    if (E && E.R && E.R.logos) {
      if (dup.tipo === 'logo' && E.R.logos[c.id]) E.R.logos[dup.id] = E.R.logos[c.id];
    }
    return dup;
  }

  // ------------------------------------------------------------------ Helpers de Construção Paramétrica dos 12 Modelos
  function resolveTamanho(tamanho) {
    const fmt = Object.prototype.hasOwnProperty.call(TAM, tamanho) ? tamanho : 'feed';
    const [W, H] = TAM[fmt];
    return { fmt, W, H };
  }

  function mkFoto(W, H, extra = {}) {
    return {
      id: uid(),
      tipo: 'foto',
      nome: 'Foto do imóvel',
      x: 0,
      y: 0,
      w: W,
      h: H,
      rot: 0,
      skewX: 0,
      skewY: 0,
      opacidade: 1,
      visivel: true,
      travada: false,
      zoom: 1,
      offX: 0,
      offY: 0,
      brilho: 100,
      contraste: 104,
      saturacao: 106,
      desfoque: 0,
      raio: 0,
      indiceFoto: 0,
      borda: 0,
      corBorda: '#ffffff',
      fotoCustom: '',
      ...extra
    };
  }

  function mkTexto(W, nome, txt, extra = {}) {
    return {
      id: uid(),
      tipo: 'texto',
      nome,
      texto: txt,
      x: Math.round(W * 0.055),
      y: 0,
      w: W - Math.round(W * 0.055) * 2,
      h: 80,
      rot: 0,
      skewX: 0,
      skewY: 0,
      opacidade: 1,
      visivel: true,
      travada: false,
      fonte: 'Inter',
      peso: 700,
      italico: false,
      tamanho: Math.round(W * 0.048),
      cor: '#ffffff',
      alinhamento: 'left',
      ancora: 'topo',
      espacamento: 0,
      entrelinha: 1.12,
      escalaX: 1,
      escalaY: 1,
      maiusculas: false,
      autoFit: false,
      sombra: 0,
      corSombra: '#000000',
      contorno: 0,
      corContorno: '#000000',
      fundo: false,
      corFundo: '#5266eb',
      raioFundo: 24,
      folga: 16,
      bordaFundo: 0,
      corBordaFundo: '#ffffff',
      ...extra
    };
  }

  function mkRet(extra = {}) {
    return {
      id: uid(),
      tipo: 'retangulo',
      nome: 'Retângulo',
      x: 0,
      y: 0,
      w: 200,
      h: 100,
      rot: 0,
      skewX: 0,
      skewY: 0,
      opacidade: 1,
      visivel: true,
      travada: false,
      cor: '#5266eb',
      raio: 0,
      borda: 0,
      corBorda: '#ffffff',
      blurFundo: 0,
      strokeScaleEnabled: false,
      ...extra
    };
  }

  function mkDeg(W, H, extra = {}) {
    return {
      id: uid(),
      tipo: 'degrade',
      nome: 'Degradê',
      x: 0,
      y: Math.round(H * 0.45),
      w: W,
      h: H - Math.round(H * 0.45) + 2,
      rot: 0,
      skewX: 0,
      skewY: 0,
      opacidade: 1,
      visivel: true,
      travada: false,
      cor1: '#00000000',
      cor2: '#000000e6',
      angulo: 180,
      raio: 0,
      ...extra
    };
  }

  function mkLinha(x, y, w, extra = {}) {
    return {
      id: uid(),
      tipo: 'linha',
      nome: 'Linha',
      x,
      y,
      w,
      h: 8,
      rot: 0,
      skewX: 0,
      skewY: 0,
      opacidade: 1,
      visivel: true,
      travada: false,
      pontos: [0, 4, w, 4],
      cor: '#ffffff',
      espessura: 2,
      tracejado: false,
      ponta: 'round',
      ...extra
    };
  }

  function mkCirc(x, y, w, h, extra = {}) {
    return {
      id: uid(),
      tipo: 'circulo',
      nome: 'Círculo',
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
      cor: '#5266eb',
      borda: 0,
      corBorda: '#ffffff',
      strokeScaleEnabled: false,
      ...extra
    };
  }

  function mkPoly(x, y, w, h, vertices, extra = {}) {
    return {
      id: uid(),
      tipo: 'poligono',
      nome: 'Card chanfrado',
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
      cor: '#1c2238e0',
      borda: 1.5,
      corBorda: '#5266eb99',
      strokeScaleEnabled: false,
      ...extra
    };
  }

  function mkIcone(iconeId, x, y, size, extra = {}) {
    return {
      id: uid(),
      tipo: 'icone',
      nome: iconeId,
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
      cor: '#ffffff',
      corFundo: '#5266eb',
      formaFundo: 'nenhum',
      folga: Math.round(size * 0.22),
      bordaFundo: 0,
      corBordaFundo: '#ffffff',
      ...extra
    };
  }

  function mkLogo(x, y, size, extra = {}) {
    return {
      id: uid(),
      tipo: 'logo',
      nome: 'Logo da Marca',
      origem: 'kit',
      forma: 'quadrado',
      raio: 16,
      corFundo: '#5266eb',
      corTexto: '#ffffff',
      src: '',
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
      ...extra
    };
  }

  // ------------------------------------------------------------------ Os 12 Modelos Sofisticados
  const DEFINICOES_MODELOS = [
    {
      id: 'arquitetura-suica',
      nome: 'Arquitetura Suíça',
      categoria: 'Editorial',
      paleta: ['#f4f3ef', '#141418', '#5266eb', '#3a3a44'],
      build(W, H) {
        const m = Math.round(W * 0.055);
        const cw = W - m * 2;
        const photoH = Math.round(H * 0.56);
        const bodyY = m + photoH + Math.round(H * 0.022);
        const rule2Y = H - m - Math.round(H * 0.088);
        const footY = rule2Y + Math.round(H * 0.016);
        const priceW = Math.round(cw * 0.42);
        const specsW = cw - priceW - 18;
        return {
          fundo: '#f4f3ef',
          camadas: [
            mkFoto(W, H, { nome: 'Foto principal', x: m, y: m, w: cw, h: photoH, raio: 6 }),
            mkTexto(W, 'Código', '{codigo}', {
              x: m + 20, y: m + 20, w: 150, h: 46,
              fonte: 'Inter', peso: 700, tamanho: 22, cor: '#ffffff',
              alinhamento: 'center', autoFit: true,
              fundo: true, corFundo: '#141418d9', raioFundo: 999, folga: 12
            }),
            mkLinha(m, bodyY, cw, { nome: 'Divisor topo', cor: '#141418', espessura: 2 }),
            mkTexto(W, 'Categoria (Nível 1)', '{tipo} · {negociacao}', {
              x: m, y: bodyY + Math.round(H * 0.014), w: cw, h: Math.round(H * 0.036),
              fonte: 'Inter', peso: 600, tamanho: Math.round(W * 0.021), espacamento: 4,
              maiusculas: true, cor: '#5266eb', autoFit: true
            }),
            mkTexto(W, 'Título (Nível 2)', '{nome}', {
              x: m, y: bodyY + Math.round(H * 0.052), w: cw, h: Math.round(H * 0.102),
              fonte: 'Inter', peso: 800, tamanho: Math.round(W * 0.062), entrelinha: 1.05,
              cor: '#141418', autoFit: true
            }),
            mkTexto(W, 'Bairro (Nível 2)', '{bairro} · {cidade}', {
              x: m, y: bodyY + Math.round(H * 0.158), w: cw, h: Math.round(H * 0.044),
              fonte: 'Inter', peso: 500, tamanho: Math.round(W * 0.030),
              cor: '#3a3a44', autoFit: true
            }),
            mkLinha(m, rule2Y, cw, { nome: 'Divisor base', cor: '#14141840', espessura: 1.5 }),
            mkTexto(W, 'Especificações', '{quartos} qts · {suites} suítes · {area} · {vagas} vagas', {
              x: m, y: footY, w: specsW, h: Math.round(H * 0.062),
              fonte: 'Inter', peso: 500, tamanho: Math.round(W * 0.026),
              cor: '#3a3a44', autoFit: true
            }),
            mkTexto(W, 'Preço', '{preco}', {
              x: W - m - priceW, y: footY - 4, w: priceW, h: Math.round(H * 0.068),
              fonte: 'Inter', peso: 800, tamanho: Math.round(W * 0.044),
              cor: '#141418', alinhamento: 'right', autoFit: true
            })
          ]
        };
      }
    },
    {
      id: 'revista-atelier',
      nome: 'Revista Atelier',
      categoria: 'Editorial',
      paleta: ['#faf8f4', '#171614', '#d4af37', '#ffffff'],
      build(W, H) {
        const m = Math.round(W * 0.055);
        const cw = W - m * 2;
        const barH = Math.round(H * 0.095);
        const pillH = Math.round(H * 0.064);
        const pillY = H - m - pillH;
        const barY = pillY - Math.round(H * 0.018) - barH;
        const colW = Math.floor(cw / 4);
        const cols = [
          ['quarto', '{quartos} qts'],
          ['suite', '{suites} suítes'],
          ['vaga', '{vagas} vagas'],
          ['area', '{area}']
        ];
        const colCamadas = [];
        cols.forEach(([icId, tk], i) => {
          const cx = m + i * colW;
          const icSz = 28;
          colCamadas.push(mkIcone(icId, cx + Math.round((colW - icSz) / 2), barY + Math.round(barH * 0.16), icSz, {
            nome: `Ícone ${icId}`, cor: '#e8cb88', formaFundo: 'nenhum'
          }));
          colCamadas.push(mkTexto(W, `Dado ${icId}`, tk, {
            x: cx + 8, y: barY + Math.round(barH * 0.52), w: colW - 16, h: Math.round(barH * 0.40),
            fonte: 'Montserrat', peso: 700, tamanho: Math.round(W * 0.025),
            cor: '#ffffff', alinhamento: 'center', autoFit: true
          }));
        });

        const pillW = Math.round(W * 0.46);
        return {
          fundo: '#171614',
          camadas: [
            mkFoto(W, H),
            mkDeg(W, H, {
              nome: 'Véu superior claro', x: 0, y: 0, w: W, h: Math.round(H * 0.44),
              cor1: '#faf8f4eb', cor2: '#faf8f400', angulo: 180
            }),
            mkDeg(W, H, {
              nome: 'Sombra inferior', x: 0, y: Math.round(H * 0.60), w: W, h: H - Math.round(H * 0.60) + 2,
              cor1: '#11100e00', cor2: '#11100eec', angulo: 180
            }),
            mkTexto(W, 'Bairro', '{tipo} · {bairro}', {
              x: m, y: Math.round(H * 0.044), w: cw, h: Math.round(H * 0.036),
              fonte: 'Montserrat', peso: 600, tamanho: Math.round(W * 0.021), espacamento: 5,
              maiusculas: true, cor: '#5a5042', autoFit: true
            }),
            mkTexto(W, 'Título Serifado', '{nome}', {
              x: m, y: Math.round(H * 0.088), w: cw, h: Math.round(H * 0.135),
              fonte: 'Playfair Display', peso: 700, tamanho: Math.round(W * 0.068), entrelinha: 1.04,
              cor: '#171614', autoFit: true
            }),
            mkLinha(m, Math.round(H * 0.232), 116, { nome: 'Filete dourado', cor: '#b48a46', espessura: 3 }),
            mkRet({
              nome: 'Barra 4 colunas', x: m, y: barY, w: cw, h: barH,
              cor: '#141312cc', blurFundo: 12, raio: 18, borda: 1.5, corBorda: '#ffffff33'
            }),
            ...colCamadas,
            mkTexto(W, 'Pílula Preço', '{preco}', {
              x: Math.round((W - pillW) / 2), y: pillY, w: pillW, h: pillH,
              fonte: 'Montserrat', peso: 800, tamanho: Math.round(W * 0.040),
              cor: '#141312', alinhamento: 'center', autoFit: true,
              fundo: true, corFundo: '#d4af37', raioFundo: 999, folga: 14
            })
          ]
        };
      }
    },
    {
      id: 'vitrine-fosca',
      nome: 'Vitrine Fosca',
      categoria: 'Moderno',
      paleta: ['#10121a', '#5266eb', '#ffffff', '#dcdce6'],
      build(W, H) {
        const halfW = Math.round(W / 2);
        const padX = 48;
        const colW = halfW - padX * 2;
        return {
          fundo: '#10121a',
          camadas: [
            mkFoto(W, H, {
              nome: 'Foto esquerda (fosca)', x: 0, y: 0, w: halfW, h: H,
              desfoque: 18, brilho: 92, contraste: 106, indiceFoto: 0
            }),
            mkFoto(W, H, {
              nome: 'Foto direita (nítida)', x: halfW, y: 0, w: W - halfW, h: H,
              desfoque: 0, brilho: 102, contraste: 106, indiceFoto: 0
            }),
            mkRet({
              nome: 'Véu translúcido', x: 0, y: 0, w: halfW, h: H,
              cor: '#10121ab3', blurFundo: 8
            }),
            mkLinha(halfW - 1, 0, 2, {
              nome: 'Divisor central', h: H, pontos: [1, 0, 1, H],
              cor: '#ffffff4d', espessura: 2
            }),
            mkTexto(W, 'Tipo', '{tipo} · {negociacao}', {
              x: padX, y: Math.round(H * 0.08), w: colW, h: Math.round(H * 0.04),
              fonte: 'Inter', peso: 600, tamanho: Math.round(W * 0.021), espacamento: 3,
              maiusculas: true, cor: '#a8b4ff', autoFit: true
            }),
            mkTexto(W, 'Nome', '{nome}', {
              x: padX, y: Math.round(H * 0.14), w: colW, h: Math.round(H * 0.21),
              fonte: 'Playfair Display', peso: 700, tamanho: Math.round(W * 0.052), entrelinha: 1.06,
              cor: '#ffffff', autoFit: true
            }),
            mkTexto(W, 'Localização', '{bairro}', {
              x: padX, y: Math.round(H * 0.37), w: colW, h: Math.round(H * 0.055),
              fonte: 'Inter', peso: 500, tamanho: Math.round(W * 0.028),
              cor: '#dcdce6', autoFit: true
            }),
            mkLinha(padX, Math.round(H * 0.445), Math.round(colW * 0.45), {
              nome: 'Traço', cor: '#5266eb', espessura: 3
            }),
            mkTexto(W, 'Specs', '{quartos} quartos\n{suites} suítes\n{area}\n{vagas} vagas', {
              x: padX, y: Math.round(H * 0.49), w: colW, h: Math.round(H * 0.22),
              fonte: 'Inter', peso: 500, tamanho: Math.round(W * 0.028), entrelinha: 1.48,
              cor: '#ededf3', autoFit: true
            }),
            mkTexto(W, 'Pílula Preço', '{preco}', {
              x: padX, y: Math.round(H * 0.77), w: colW, h: Math.round(H * 0.082),
              fonte: 'Montserrat', peso: 800, tamanho: Math.round(W * 0.036),
              cor: '#ffffff', alinhamento: 'center', autoFit: true,
              fundo: true, corFundo: '#5266eb', raioFundo: 999, folga: 16
            }),
            mkTexto(W, 'Marca', '{marca}', {
              x: padX, y: Math.round(H * 0.89), w: colW, h: Math.round(H * 0.04),
              fonte: 'Montserrat', peso: 600, tamanho: Math.round(W * 0.020), espacamento: 5,
              maiusculas: true, cor: '#c3c3cc', autoFit: true
            })
          ]
        };
      }
    },
    {
      id: 'traco-fino',
      nome: 'Traço Fino',
      categoria: 'Minimalista',
      paleta: ['#0d0e14', '#ffffff', '#e2c48d', '#c8cad6'],
      build(W, H) {
        const m = Math.round(W * 0.055);
        const cw = W - m * 2;
        const l1Y = Math.round(H * 0.735);
        const l2Y = Math.round(H * 0.845);
        const specY = l2Y + Math.round(H * 0.022);
        const specW = Math.floor(cw / 4);
        const specs = ['{quartos} Quartos', '{suites} Suítes', '{vagas} Vagas', '{codigo}'];
        const priceW = Math.round(cw * 0.62);
        const areaW = cw - priceW - 16;
        return {
          fundo: '#0d0e14',
          camadas: [
            mkFoto(W, H),
            mkDeg(W, H, {
              nome: 'Sombra topo', x: 0, y: 0, w: W, h: Math.round(H * 0.22),
              cor1: '#0d0e14a6', cor2: '#0d0e1400', angulo: 180
            }),
            mkDeg(W, H, {
              nome: 'Sombra base', x: 0, y: Math.round(H * 0.40), w: W, h: H - Math.round(H * 0.40) + 2,
              cor1: '#0d0e1400', cor2: '#0d0e14f2', angulo: 180
            }),
            mkTexto(W, 'Pílula topo', '{tipo} · {negociacao}', {
              x: m, y: m, w: Math.round(W * 0.42), h: 52,
              fonte: 'Inter', peso: 600, tamanho: Math.round(W * 0.021), espacamento: 3,
              maiusculas: true, cor: '#ffffff', alinhamento: 'center', autoFit: true,
              fundo: true, corFundo: '#ffffff1f', raioFundo: 999, folga: 14, bordaFundo: 1.5, corBordaFundo: '#ffffff8c'
            }),
            mkLogo(W - m - 88, m - 8, 88, {
              nome: 'Logo do Kit', origem: 'kit', forma: 'circulo', raio: 44,
              corFundo: '#171721cc', corTexto: '#ffffff'
            }),
            mkTexto(W, 'Nome', '{nome}', {
              x: m, y: Math.round(H * 0.56), w: cw, h: Math.round(H * 0.105),
              fonte: 'Plus Jakarta Sans', peso: 700, tamanho: Math.round(W * 0.058), entrelinha: 1.06,
              cor: '#ffffff', autoFit: true
            }),
            mkTexto(W, 'Localização', '{localizacao}', {
              x: m, y: Math.round(H * 0.672), w: cw, h: Math.round(H * 0.042),
              fonte: 'Inter', peso: 400, tamanho: Math.round(W * 0.028),
              cor: '#c8cad6', autoFit: true
            }),
            mkLinha(m, l1Y, cw, { nome: 'Linha paralela 1', cor: '#ffffff66', espessura: 1.5 }),
            mkTexto(W, 'Preço', '{preco}', {
              x: m, y: l1Y + Math.round(H * 0.018), w: priceW, h: Math.round(H * 0.068),
              fonte: 'Montserrat', peso: 800, tamanho: Math.round(W * 0.048),
              cor: '#ffffff', autoFit: true
            }),
            mkTexto(W, 'Área m²', '{area}', {
              x: W - m - areaW, y: l1Y + Math.round(H * 0.022), w: areaW, h: Math.round(H * 0.062),
              fonte: 'Montserrat', peso: 600, tamanho: Math.round(W * 0.036),
              cor: '#e2c48d', alinhamento: 'right', autoFit: true
            }),
            mkLinha(m, l2Y, cw, { nome: 'Linha paralela 2', cor: '#ffffff66', espessura: 1.5 }),
            ...specs.map((tk, i) =>
              mkTexto(W, `Spec ${i + 1}`, tk, {
                x: m + i * specW, y: specY, w: specW - 8, h: Math.round(H * 0.046),
                fonte: 'Inter', peso: 500, tamanho: Math.round(W * 0.024),
                cor: '#d6d8e2', alinhamento: i === 0 ? 'left' : i === 3 ? 'right' : 'center', autoFit: true
              })
            )
          ]
        };
      }
    },
    {
      id: 'noite-dourada',
      nome: 'Noite Dourada',
      categoria: 'Luxo',
      paleta: ['#091024', '#d4af37', '#ffffff', '#121d38'],
      build(W, H) {
        const m = Math.round(W * 0.055);
        const cw = W - m * 2;
        const icY = Math.round(H * 0.625);
        const icSz = 60;
        const icSpan = Math.round(W * 0.25);
        const icStart = Math.round((W - (icSpan * 2 + icSz)) / 2);
        const itens = [
          ['quarto', '{quartos} qts'],
          ['suite', '{suites} suítes'],
          ['area', '{area}']
        ];
        const icCamadas = [];
        itens.forEach(([icId, tk], idx) => {
          const cx = icStart + idx * icSpan;
          icCamadas.push(mkIcone(icId, cx, icY, icSz, {
            nome: `Ícone ${icId}`, formaFundo: 'circulo',
            corFundo: '#121d38', bordaFundo: 2, corBordaFundo: '#d4af37',
            cor: '#d4af37', folga: 15
          }));
          icCamadas.push(mkTexto(W, `Rótulo ${icId}`, tk, {
            x: cx - 34, y: icY + icSz + 8, w: icSz + 68, h: Math.round(H * 0.036),
            fonte: 'Montserrat', peso: 600, tamanho: Math.round(W * 0.022),
            cor: '#f5efe0', alinhamento: 'center', autoFit: true
          }));
        });

        const boxW = cw - 64;
        const boxX = Math.round((W - boxW) / 2);
        const boxY = Math.round(H * 0.76);
        const boxH = Math.round(H * 0.064);

        return {
          fundo: '#091024',
          camadas: [
            mkFoto(W, H),
            mkDeg(W, H, {
              nome: 'Degradê azul-noite', x: 0, y: Math.round(H * 0.28), w: W, h: H - Math.round(H * 0.28) + 2,
              cor1: '#09102400', cor2: '#091024f5', angulo: 180
            }),
            mkRet({
              nome: 'Filete moldura', x: 32, y: 32, w: W - 64, h: H - 64,
              cor: '#00000000', borda: 2, corBorda: '#d4af3766'
            }),
            mkTexto(W, 'Título Dourado', '{nome}', {
              x: m, y: Math.round(H * 0.465), w: cw, h: Math.round(H * 0.13),
              fonte: 'Cormorant Garamond', peso: 700, tamanho: Math.round(W * 0.074), entrelinha: 1.03,
              cor: '#d4af37', alinhamento: 'center', autoFit: true
            }),
            ...icCamadas,
            mkRet({
              nome: 'Caixa localização', x: boxX, y: boxY, w: boxW, h: boxH,
              cor: '#121d38d9', raio: 12, borda: 1.5, corBorda: '#d4af378c'
            }),
            mkTexto(W, 'Localização', '{localizacao}', {
              x: boxX + 20, y: boxY + Math.round(boxH * 0.22), w: boxW - 40, h: Math.round(boxH * 0.58),
              fonte: 'Montserrat', peso: 600, tamanho: Math.round(W * 0.028),
              cor: '#f5efe0', alinhamento: 'center', autoFit: true
            }),
            mkTexto(W, 'Preço', '{preco}', {
              x: m, y: Math.round(H * 0.855), w: cw, h: Math.round(H * 0.076),
              fonte: 'Montserrat', peso: 700, tamanho: Math.round(W * 0.050),
              cor: '#ffffff', alinhamento: 'center', autoFit: true
            })
          ]
        };
      }
    },
    {
      id: 'essencia-moderna',
      nome: 'Essência Moderna',
      categoria: 'Moderno',
      paleta: ['#0f1118', '#5266eb', '#ffffff', '#7fd1b2'],
      build(W, H) {
        const m = Math.round(W * 0.055);
        const cw = W - m * 2;
        const cardY = Math.round(H * 0.695);
        const gap = 20;
        const cardW = Math.floor((cw - gap * 2) / 3);
        const cardH = Math.round(H * 0.125);
        const cut = 22;

        const cardsSpec = [
          ['quarto', '{quartos} Quartos'],
          ['area', '{area}'],
          ['vaga', '{vagas} Vagas']
        ];
        const cardCamadas = [];
        cardsSpec.forEach(([icId, tk], i) => {
          const cx = m + i * (cardW + gap);
          cardCamadas.push(mkPoly(cx, cardY, cardW, cardH, [
            { x: cut, y: 0 },
            { x: cardW, y: 0 },
            { x: cardW - cut, y: cardH },
            { x: 0, y: cardH }
          ], {
            nome: `Card chanfrado ${i + 1}`,
            cor: '#1a2036e6',
            borda: 1.5,
            corBorda: '#5266ebb3'
          }));
          cardCamadas.push(mkIcone(icId, cx + Math.round((cardW - 34) / 2), cardY + Math.round(cardH * 0.16), 34, {
            nome: `Ícone ${icId}`, cor: '#8ea0ff', formaFundo: 'nenhum'
          }));
          cardCamadas.push(mkTexto(W, `Card texto ${i + 1}`, tk, {
            x: cx + 22, y: cardY + Math.round(cardH * 0.56), w: cardW - 44, h: Math.round(cardH * 0.34),
            fonte: 'Montserrat', peso: 700, tamanho: Math.round(W * 0.025),
            cor: '#ffffff', alinhamento: 'center', autoFit: true
          }));
        });

        const footY = H - m - Math.round(H * 0.068);
        return {
          fundo: '#0f1118',
          camadas: [
            mkFoto(W, H),
            mkDeg(W, H, {
              nome: 'Sombra topo', x: 0, y: 0, w: W, h: Math.round(H * 0.24),
              cor1: '#0f1118bf', cor2: '#0f111800', angulo: 180
            }),
            mkDeg(W, H, {
              nome: 'Sombra base', x: 0, y: Math.round(H * 0.38), w: W, h: H - Math.round(H * 0.38) + 2,
              cor1: '#0f111800', cor2: '#0f1118f5', angulo: 180
            }),
            mkLogo(m, m, 88, {
              nome: 'Logo do Kit', origem: 'kit', forma: 'quadrado', raio: 18,
              corFundo: '#5266eb', corTexto: '#ffffff'
            }),
            mkTexto(W, 'Negociação', '{negociacao}', {
              x: W - m - 200, y: m + 16, w: 200, h: 48,
              fonte: 'Montserrat', peso: 700, tamanho: 22, espacamento: 3,
              maiusculas: true, cor: '#ffffff', alinhamento: 'center', autoFit: true,
              fundo: true, corFundo: '#5266eb', raioFundo: 999, folga: 12
            }),
            mkTexto(W, 'Headline Peso 1', '{tipo} · {bairro}', {
              x: m, y: Math.round(H * 0.505), w: cw, h: Math.round(H * 0.042),
              fonte: 'Montserrat', peso: 400, tamanho: Math.round(W * 0.028), espacamento: 4,
              maiusculas: true, cor: '#b9c2ff', autoFit: true
            }),
            mkTexto(W, 'Headline Peso 2', '{nome}', {
              x: m, y: Math.round(H * 0.555), w: cw, h: Math.round(H * 0.115),
              fonte: 'Montserrat', peso: 800, tamanho: Math.round(W * 0.064), entrelinha: 1.05,
              cor: '#ffffff', autoFit: true
            }),
            ...cardCamadas,
            mkTexto(W, 'Preço', '{preco}', {
              x: m, y: footY, w: Math.round(cw * 0.48), h: Math.round(H * 0.064),
              fonte: 'Montserrat', peso: 800, tamanho: Math.round(W * 0.046),
              cor: '#7fd1b2', autoFit: true
            }),
            mkTexto(W, 'Rodapé', '{corretor} · {telefone}', {
              x: m + Math.round(cw * 0.50), y: footY + 12, w: Math.round(cw * 0.50), h: Math.round(H * 0.044),
              fonte: 'Inter', peso: 500, tamanho: Math.round(W * 0.023),
              cor: '#c3c3cc', alinhamento: 'right', autoFit: true
            })
          ]
        };
      }
    },
    {
      id: 'visao-glass',
      nome: 'Visão Glass',
      categoria: 'Moderno',
      paleta: ['#0c101a', '#7fd1b2', '#ffffff', '#141926'],
      build(W, H) {
        const m = Math.round(W * 0.055);
        const cw = W - m * 2;
        const precoW = Math.round(W * 0.43);
        const precoX = W - m - precoW; // x + w === W - Math.round(W * 0.055) rigorosamente
        const cardY = Math.round(H * 0.34);
        const cardH = Math.round(H * 0.45);
        const halfCol = Math.floor((cw - 72) / 2);
        const swY1 = cardY + Math.round(cardH * 0.42);
        const swY2 = cardY + Math.round(cardH * 0.68);
        const switches = [
          [m + 36, swY1, '{quartos} Quartos'],
          [m + 36 + halfCol, swY1, '{suites} Suítes'],
          [m + 36, swY2, '{area}'],
          [m + 36 + halfCol, swY2, '{vagas} Vagas']
        ];
        const swCamadas = [];
        switches.forEach(([sx, sy, tk], idx) => {
          swCamadas.push(mkIcone('switch-on', sx, sy, 44, {
            nome: `Switch ${idx + 1}`, cor: '#7fd1b2', formaFundo: 'nenhum'
          }));
          swCamadas.push(mkTexto(W, `Item ${idx + 1}`, tk, {
            x: sx + 56, y: sy + 4, w: halfCol - 64, h: 40,
            fonte: 'Plus Jakarta Sans', peso: 600, tamanho: Math.round(W * 0.028),
            cor: '#ffffff', autoFit: true
          }));
        });

        return {
          fundo: '#0c101a',
          camadas: [
            mkFoto(W, H),
            mkDeg(W, H, {
              nome: 'Véu escuro', x: 0, y: 0, w: W, h: H,
              cor1: '#0c101a66', cor2: '#0c101ae6', angulo: 180
            }),
            mkTexto(W, 'Tipo', '{tipo} · {bairro}', {
              x: m, y: Math.round(H * 0.055), w: cw - precoW - 16, h: Math.round(H * 0.058),
              fonte: 'Plus Jakarta Sans', peso: 600, tamanho: Math.round(W * 0.026),
              cor: '#e4e7f2', autoFit: true
            }),
            mkTexto(W, 'Preço', '{preco}', {
              x: precoX, y: Math.round(H * 0.048), w: precoW, h: Math.round(H * 0.072),
              fonte: 'Montserrat', peso: 800, tamanho: Math.round(W * 0.048),
              cor: '#ffffff', alinhamento: 'right', autoFit: true
            }),
            mkRet({
              nome: 'Cartão Glass Central', x: m, y: cardY, w: cw, h: cardH,
              cor: '#1419268c', blurFundo: 20, raio: 28, borda: 2, corBorda: '#ffffff4d'
            }),
            mkTexto(W, 'Nome', '{nome}', {
              x: m + 36, y: cardY + Math.round(cardH * 0.10), w: cw - 72, h: Math.round(cardH * 0.25),
              fonte: 'Plus Jakarta Sans', peso: 700, tamanho: Math.round(W * 0.054), entrelinha: 1.06,
              cor: '#ffffff', autoFit: true
            }),
            ...swCamadas,
            mkTexto(W, 'Rodapé', '{localizacao} · {corretor} {telefone}', {
              x: m, y: H - m - Math.round(H * 0.052), w: cw, h: Math.round(H * 0.046),
              fonte: 'Inter', peso: 500, tamanho: Math.round(W * 0.024),
              cor: '#d0d5e6', alinhamento: 'center', autoFit: true
            })
          ]
        };
      }
    },
    {
      id: 'galeria-prive',
      nome: 'Galeria Privê',
      categoria: 'Luxo',
      paleta: ['#0e1015', '#d4af37', '#ffffff', '#dcdce6'],
      build(W, H) {
        const m = Math.round(W * 0.055);
        const leftW = Math.round(W * 0.56);
        const sigW = Math.round(W * 0.36);
        return {
          fundo: '#0e1015',
          camadas: [
            mkFoto(W, H),
            mkDeg(W, H, {
              nome: 'Degradê lateral esquerdo', x: 0, y: 0, w: Math.round(W * 0.75), h: H,
              cor1: '#0e1015f2', cor2: '#0e101500', angulo: 90
            }),
            mkTexto(W, 'Categoria', '{tipo} · {bairro}', {
              x: m, y: Math.round(H * 0.085), w: leftW, h: Math.round(H * 0.040),
              fonte: 'Montserrat', peso: 600, tamanho: Math.round(W * 0.021), espacamento: 4,
              maiusculas: true, cor: '#d4af37', autoFit: true
            }),
            mkTexto(W, 'Título Serifado', '{nome}', {
              x: m, y: Math.round(H * 0.145), w: leftW, h: Math.round(H * 0.24),
              fonte: 'Playfair Display', peso: 700, tamanho: Math.round(W * 0.074), entrelinha: 1.03,
              cor: '#ffffff', autoFit: true
            }),
            mkLinha(m, Math.round(H * 0.415), 96, { nome: 'Traço dourado', cor: '#d4af37', espessura: 2.5 }),
            mkTexto(W, 'Specs Verticais', '{area}\n{quartos} Quartos\n{suites} Suítes\n{vagas} Vagas', {
              x: m, y: Math.round(H * 0.455), w: leftW, h: Math.round(H * 0.23),
              fonte: 'Montserrat', peso: 500, tamanho: Math.round(W * 0.032), entrelinha: 1.55,
              cor: '#dcdce6', autoFit: true
            }),
            mkTexto(W, 'Preço', '{preco}', {
              x: m, y: Math.round(H * 0.775), w: Math.round(W * 0.50), h: Math.round(H * 0.084),
              fonte: 'Playfair Display', peso: 700, tamanho: Math.round(W * 0.056),
              cor: '#d4af37', autoFit: true
            }),
            mkTexto(W, 'Assinatura Corretor', '{corretor}', {
              x: W - m - sigW, y: H - m - Math.round(H * 0.078), w: sigW, h: Math.round(H * 0.072),
              fonte: 'Pinyon Script', peso: 400, tamanho: Math.round(W * 0.052),
              cor: '#ffffff', alinhamento: 'right', sombra: 12, corSombra: '#000000', autoFit: true
            })
          ]
        };
      }
    },
    {
      id: 'manchete-nobre',
      nome: 'Manchete Nobre',
      categoria: 'Luxo',
      paleta: ['#12131a', '#d4af37', '#ffffff', '#f0d791'],
      build(W, H) {
        const m = Math.round(W * 0.055);
        const cw = W - m * 2; // centro exato = W / 2
        const seloSz = 116;
        const seloY = Math.round(H * 0.06);
        return {
          fundo: '#12131a',
          camadas: [
            mkFoto(W, H),
            mkDeg(W, H, {
              nome: 'Sombra topo', x: 0, y: 0, w: W, h: Math.round(H * 0.24),
              cor1: '#12131a99', cor2: '#12131a00', angulo: 180
            }),
            mkDeg(W, H, {
              nome: 'Sombra base', x: 0, y: Math.round(H * 0.44), w: W, h: H - Math.round(H * 0.44) + 2,
              cor1: '#12131a00', cor2: '#12131af2', angulo: 180
            }),
            mkCirc(Math.round(W / 2 - seloSz / 2), seloY, seloSz, seloSz, {
              nome: 'Selo circular', cor: '#14151cd9', borda: 2, corBorda: '#d4af37'
            }),
            mkTexto(W, 'Texto selo', '{negociacao}', {
              x: Math.round(W / 2 - (seloSz - 12) / 2), y: seloY + Math.round(seloSz * 0.34), w: seloSz - 12, h: 42,
              fonte: 'Montserrat', peso: 700, tamanho: 20, espacamento: 2, maiusculas: true,
              cor: '#d4af37', alinhamento: 'center', autoFit: true
            }),
            mkTexto(W, 'Manchete Monumental', '{nome}', {
              x: m, y: Math.round(H * 0.61), w: cw, h: Math.round(H * 0.145),
              fonte: 'Playfair Display', peso: 700, tamanho: Math.round(W * 0.080), entrelinha: 1.02,
              cor: '#ffffff', alinhamento: 'center', autoFit: true
            }),
            mkLinha(Math.round(W * 0.25), Math.round(H * 0.772), Math.round(W * 0.50), {
              nome: 'Linha central', cor: '#d4af3799', espessura: 1.5
            }),
            mkTexto(W, 'Bairro e Preço', '{bairro} · {preco}', {
              x: m, y: Math.round(H * 0.792), w: cw, h: Math.round(H * 0.068),
              fonte: 'Montserrat', peso: 700, tamanho: Math.round(W * 0.040),
              cor: '#f0d791', alinhamento: 'center', autoFit: true
            }),
            mkTexto(W, 'Detalhes', '{quartos} quartos · {suites} suítes · {area} · {vagas} vagas', {
              x: m, y: Math.round(H * 0.878), w: cw, h: Math.round(H * 0.044),
              fonte: 'Inter', peso: 500, tamanho: Math.round(W * 0.025),
              cor: '#dcdce6', alinhamento: 'center', autoFit: true
            })
          ]
        };
      }
    },
    {
      id: 'assinatura-classica',
      nome: 'Assinatura Clássica',
      categoria: 'Clássico',
      paleta: ['#171721', '#5266eb', '#ffffff', '#ededf3'],
      build(W, H) {
        const m = Math.round(W * 0.055);
        const cw = W - m * 2;
        const degY = Math.round(H * 0.36);
        return {
          fundo: '#171721',
          camadas: [
            mkFoto(W, H),
            mkDeg(W, H, {
              nome: 'Degradê', x: 0, y: degY, w: W, h: H - degY + 2,
              cor1: '#00000000', cor2: '#000000eb', angulo: 180
            }),
            mkTexto(W, 'Selo', '{precoRotulo}', {
              x: W - m - 220, y: Math.round(H * 0.048), w: 220, h: 52,
              fonte: 'Inter', peso: 700, tamanho: Math.round(W * 0.024), espacamento: 3,
              maiusculas: true, alinhamento: 'center', autoFit: true,
              fundo: true, corFundo: '#5266eb', raioFundo: 26, folga: 14
            }),
            mkTexto(W, 'Bairro', '{tipo} · {bairro}', {
              x: m, y: Math.round(H * 0.648), w: cw, h: Math.round(H * 0.038),
              fonte: 'Inter', peso: 600, tamanho: Math.round(W * 0.025), espacamento: 3,
              maiusculas: true, cor: '#ededf3', autoFit: true
            }),
            mkTexto(W, 'Nome', '{nome}', {
              x: m, y: Math.round(H * 0.695), w: cw, h: Math.round(H * 0.112),
              fonte: 'Playfair Display', peso: 700, tamanho: Math.round(W * 0.068), entrelinha: 1.05,
              cor: '#ffffff', autoFit: true
            }),
            mkTexto(W, 'Detalhes', '{quartos} quartos · {suites} suítes · {area} · {vagas} vagas', {
              x: m, y: Math.round(H * 0.816), w: cw, h: Math.round(H * 0.038),
              fonte: 'Inter', peso: 500, tamanho: Math.round(W * 0.026),
              cor: '#ededf3', autoFit: true
            }),
            mkTexto(W, 'Preço', '{preco}', {
              x: m, y: Math.round(H * 0.872), w: Math.min(500, Math.round(W * 0.54)), h: Math.round(H * 0.074),
              fonte: 'Montserrat', peso: 800, tamanho: Math.round(W * 0.044),
              cor: '#ffffff', autoFit: true,
              fundo: true, corFundo: '#5266eb', raioFundo: 24, folga: 16
            })
          ]
        };
      }
    },
    {
      id: 'faixa-imperial',
      nome: 'Faixa Imperial',
      categoria: 'Clássico',
      paleta: ['#171721', '#c9a227', '#ffffff', '#c3c3cc'],
      build(W, H) {
        const m = Math.round(W * 0.055);
        const cw = W - m * 2;
        const fy = Math.round(H * 0.64);
        const transH = Math.round(H * 0.14);
        return {
          fundo: '#171721',
          camadas: [
            mkFoto(W, H, { h: fy + 2 }),
            mkDeg(W, H, {
              nome: 'Transição sombra adaptativa', x: 0, y: fy - transH, w: W, h: transH + 2,
              cor1: '#17172100', cor2: '#171721ff', angulo: 180
            }),
            mkRet({
              nome: 'Faixa inferior', x: 0, y: fy, w: W, h: H - fy,
              cor: '#171721', raio: 0
            }),
            mkRet({
              nome: 'Linha dourada', x: m, y: fy + Math.round(H * 0.028), w: 112, h: 5,
              cor: '#c9a227', raio: 3
            }),
            mkTexto(W, 'Nome', '{nome}', {
              x: m, y: fy + Math.round(H * 0.048), w: cw, h: Math.round(H * 0.115),
              fonte: 'Playfair Display', peso: 700, tamanho: Math.round(W * 0.064), entrelinha: 1.05,
              cor: '#ffffff', autoFit: true
            }),
            mkTexto(W, 'Detalhes', '{bairro} · {quartos} quartos · {area}', {
              x: m, y: fy + Math.round(H * 0.184), w: cw, h: Math.round(H * 0.044),
              fonte: 'Montserrat', peso: 500, tamanho: Math.round(W * 0.028),
              cor: '#c3c3cc', autoFit: true
            }),
            mkTexto(W, 'Preço', '{preco}', {
              x: m, y: fy + Math.round(H * 0.244), w: cw, h: Math.round(H * 0.074),
              fonte: 'Montserrat', peso: 800, tamanho: Math.round(W * 0.048),
              cor: '#c9a227', autoFit: true
            })
          ]
        };
      }
    },
    {
      id: 'moldura-serena',
      nome: 'Moldura Serena',
      categoria: 'Minimalista',
      paleta: ['#ffffff', '#171721', '#e4e4ee', '#000000b3'],
      build(W, H) {
        const m = Math.round(W * 0.055) + 16;
        const cw = W - m * 2;
        const degY = Math.round(H * 0.48);
        return {
          fundo: '#ffffff',
          camadas: [
            mkFoto(W, H),
            mkDeg(W, H, {
              nome: 'Sombra', x: 0, y: degY, w: W, h: H - degY + 2,
              cor1: '#00000000', cor2: '#000000c4', angulo: 180
            }),
            mkRet({
              nome: 'Moldura', x: 36, y: 36, w: W - 72, h: H - 72,
              cor: '#00000000', borda: 5, corBorda: '#ffffffcc'
            }),
            mkTexto(W, 'Nome', '{nome}', {
              x: m, y: Math.round(H * 0.665), w: cw, h: Math.round(H * 0.12),
              fonte: 'Cormorant Garamond', peso: 600, italico: true, tamanho: Math.round(W * 0.076), entrelinha: 1.04,
              cor: '#ffffff', alinhamento: 'center', autoFit: true
            }),
            mkTexto(W, 'Subtítulo', '{bairro} · {area}', {
              x: m, y: Math.round(H * 0.798), w: cw, h: Math.round(H * 0.038),
              fonte: 'Inter', peso: 400, tamanho: Math.round(W * 0.025), espacamento: 3,
              cor: '#e4e4ee', alinhamento: 'center', autoFit: true
            }),
            mkTexto(W, 'Preço', '{preco}', {
              x: m, y: Math.round(H * 0.852), w: cw, h: Math.round(H * 0.066),
              fonte: 'Inter', peso: 300, tamanho: Math.round(W * 0.040), espacamento: 6,
              maiusculas: true, cor: '#ffffff', alinhamento: 'center', autoFit: true
            })
          ]
        };
      }
    }
  ];

  const resolveModeloId = tipo => (Object.prototype.hasOwnProperty.call(ALIASES, tipo) ? ALIASES[tipo] : tipo);

  function modeloPronto(tipo, tamanho = 'feed') {
    const { fmt, W, H } = resolveTamanho(tamanho);
    const idAlvo = resolveModeloId(String(tipo || 'assinatura-classica'));
    const def = DEFINICOES_MODELOS.find(d => d.id === idAlvo) || DEFINICOES_MODELOS.find(d => d.id === 'assinatura-classica');
    const built = def.build(W, H);
    return {
      id: def.id,
      nome: def.nome,
      tamanho: fmt,
      formato: fmt,
      largura: W,
      altura: H,
      fundo: built.fundo,
      camadas: built.camadas,
      slides: [{
        id: 's1',
        nome: 'Capa',
        tipo: 'capa',
        fundo: built.fundo,
        camadas: copia(built.camadas)
      }],
      modeloBase: def.id,
      paleta: copia(def.paleta || [])
    };
  }

  const MODELOS_CAPA = DEFINICOES_MODELOS.map(d => ({
    id: d.id,
    nome: d.nome,
    categoria: d.categoria,
    paleta: d.paleta,
    criar: tamanho => modeloPronto(d.id, tamanho)
  }));

  // ------------------------------------------------------------------ Slides Adicionais para Carrossel (até 10 slides)
  function criarSlideCarrossel(idx, W, H, fundoBase, kit) {
    const m = Math.round(W * 0.055);
    const cw = W - m * 2;
    const escuro = /^#0|^#1|^#2/i.test(String(fundoBase || '#171721'));
    const fg = escuro ? '#ffffff' : '#171721';
    const sub = escuro ? '#c3c3cc' : '#4a4a55';
    const dest = kit?.cores1?.destaque || '#5266eb';
    const tipoIdx = (idx - 1) % 3;

    if (tipoIdx === 0) {
      // Slide Galeria + Destaques
      const fH = Math.round(H * 0.62);
      return {
        id: uid(),
        nome: `Galeria ${idx + 1}`,
        tipo: 'galeria',
        fundo: fundoBase,
        camadas: [
          mkFoto(W, H, { x: m, y: m, w: cw, h: fH, raio: 16, indiceFoto: Math.min(idx, 6) }),
          mkTexto(W, 'Subtítulo', '{tipo} · {bairro}', {
            x: m, y: m + fH + Math.round(H * 0.03), w: cw, h: Math.round(H * 0.04),
            fonte: 'Montserrat', peso: 600, tamanho: Math.round(W * 0.022), espacamento: 3, maiusculas: true, cor: dest, autoFit: true
          }),
          mkTexto(W, 'Destaques', '{destaques}', {
            x: m, y: m + fH + Math.round(H * 0.085), w: cw, h: Math.round(H * 0.14),
            fonte: 'Inter', peso: 500, tamanho: Math.round(W * 0.032), entrelinha: 1.35, cor: fg, autoFit: true
          })
        ]
      };
    }

    if (tipoIdx === 1) {
      // Slide Ficha Técnica
      return {
        id: uid(),
        nome: `Detalhes ${idx + 1}`,
        tipo: 'conteudo',
        fundo: fundoBase,
        camadas: [
          mkFoto(W, H, { indiceFoto: Math.min(idx, 6), opacidade: 0.22, desfoque: 10 }),
          mkTexto(W, 'Título', '{nome}', {
            x: m, y: Math.round(H * 0.09), w: cw, h: Math.round(H * 0.11),
            fonte: 'Playfair Display', peso: 700, tamanho: Math.round(W * 0.058), cor: fg, autoFit: true
          }),
          mkLinha(m, Math.round(H * 0.22), 110, { cor: dest, espessura: 4 }),
          mkTexto(W, 'Descrição', '{descricao}', {
            x: m, y: Math.round(H * 0.27), w: cw, h: Math.round(H * 0.48),
            fonte: 'Inter', peso: 400, tamanho: Math.round(W * 0.030), entrelinha: 1.45, cor: sub, autoFit: true
          }),
          mkTexto(W, 'Preço', '{preco}', {
            x: m, y: H - m - Math.round(H * 0.08), w: Math.round(cw * 0.55), h: Math.round(H * 0.072),
            fonte: 'Montserrat', peso: 800, tamanho: Math.round(W * 0.042), cor: '#ffffff', autoFit: true,
            fundo: true, corFundo: dest, raioFundo: 24, folga: 14
          })
        ]
      };
    }

    // Slide Contato + QR Code WhatsApp + Logo
    const qrSz = Math.round(Math.min(W, H) * 0.24);
    return {
      id: uid(),
      nome: 'Contato',
      tipo: 'contato',
      fundo: fundoBase,
      camadas: [
        mkFoto(W, H, { indiceFoto: 0, opacidade: 0.18, desfoque: 14 }),
        mkLogo(Math.round((W - 110) / 2), Math.round(H * 0.12), 110, {
          origem: 'kit', forma: 'circulo', raio: 55, corFundo: dest, corTexto: '#ffffff'
        }),
        mkTexto(W, 'Chamada', 'Agende uma visita', {
          x: m, y: Math.round(H * 0.28), w: cw, h: Math.round(H * 0.09),
          fonte: 'Playfair Display', peso: 700, tamanho: Math.round(W * 0.062),
          cor: fg, alinhamento: 'center', autoFit: true
        }),
        mkTexto(W, 'Imóvel', '{nome} · {preco}', {
          x: m, y: Math.round(H * 0.39), w: cw, h: Math.round(H * 0.055),
          fonte: 'Inter', peso: 500, tamanho: Math.round(W * 0.030),
          cor: sub, alinhamento: 'center', autoFit: true
        }),
        {
          id: uid(), tipo: 'qrcode', nome: 'QR WhatsApp', origem: 'whatsapp', url: '',
          x: Math.round((W - qrSz) / 2), y: Math.round(H * 0.49), w: qrSz, h: qrSz,
          rot: 0, skewX: 0, skewY: 0, opacidade: 1, visivel: true, travada: false,
          corEscuro: '#171721', corClaro: '#ffffff', raio: 16, margem: 2
        },
        mkTexto(W, 'Corretor', '{corretor} · {creci}\n{telefone}', {
          x: m, y: Math.round(H * 0.78), w: cw, h: Math.round(H * 0.10),
          fonte: 'Montserrat', peso: 600, tamanho: Math.round(W * 0.028), entrelinha: 1.4,
          cor: fg, alinhamento: 'center', autoFit: true
        })
      ]
    };
  }

  // ------------------------------------------------------------------ Adaptação Proporcional de Formato
  function adaptarDocFormato(docAtual, novoFormato) {
    const [W0, H0] = TAM[docAtual?.formato || docAtual?.tamanho] || [Number(docAtual?.largura) || 1080, Number(docAtual?.altura) || 1350];
    const { fmt, W: W1, H: H1 } = resolveTamanho(novoFormato);
    const rx = W1 / W0;
    const ry = H1 / H0;
    const out = copia(docAtual);
    out.formato = fmt;
    out.tamanho = fmt;
    out.largura = W1;
    out.altura = H1;
    for (const sl of out.slides || []) {
      for (const c of sl.camadas || []) {
        const eraFullH = (Number(c.y) || 0) + (Number(c.h) || 0) >= H0 - 4 && (Number(c.y) || 0) > 10;
        const eraFullTop = (Number(c.y) || 0) <= 2 && (Number(c.h) || 0) >= H0 - 4;
        c.x = Math.round((Number(c.x) || 0) * rx);
        c.y = Math.round((Number(c.y) || 0) * ry);
        c.w = Math.max(8, Math.round((Number(c.w) || 100) * rx));
        if (eraFullTop) {
          c.y = 0;
          c.h = H1;
        } else if (eraFullH) {
          c.h = Math.max(8, H1 - c.y + 2);
        } else {
          c.h = Math.max(8, Math.round((Number(c.h) || 40) * ry));
        }
        if (c.tipo === 'poligono' && Array.isArray(c.vertices)) {
          c.vertices = c.vertices.map(v => ({
            x: Math.round((Number(v.x) || 0) * rx),
            y: Math.round((Number(v.y) || 0) * ry)
          }));
        } else if (c.tipo === 'linha' && Array.isArray(c.pontos)) {
          c.pontos = c.pontos.map((p, i) => Math.round((Number(p) || 0) * (i % 2 === 0 ? rx : ry)));
        }
      }
    }
    return out;
  }

  function aplicarPaletaEmDoc(doc, kit, palKey) {
    const pal = palKey === 'segunda' ? kit?.cores2 : kit?.cores1;
    if (!pal || !doc) return doc;
    const out = copia(doc);
    for (const sl of out.slides || []) {
      if (pal.fundo) sl.fundo = pal.fundo;
      for (const c of sl.camadas || []) {
        if (c.tipo === 'texto') {
          if (c.fundo && pal.destaque) c.corFundo = pal.destaque;
          else if (!c.fundo && pal.texto && c.cor !== '#d4af37' && c.cor !== '#c9a227') c.cor = pal.texto;
        } else if (c.tipo === 'retangulo' && !c.blurFundo && c.cor && !/#00000000$/i.test(c.cor) && pal.principal) {
          c.cor = pal.principal;
        } else if (c.tipo === 'icone' && c.formaFundo && c.formaFundo !== 'nenhum' && pal.destaque) {
          c.corFundo = pal.destaque;
        }
      }
    }
    out.paleta = [pal.fundo, pal.principal, pal.destaque, pal.texto].filter(Boolean);
    return out;
  }

  // ------------------------------------------------------------------ Montagem do Editor sobre BIGA_STUDIO
  function montar(el, ctx) {
    if (!el || typeof document === 'undefined') return null;
    const ST = getStudio();
    if (!ST || typeof ST.montar !== 'function') {
      el.innerHTML = '<div class="card"><p class="body muted">Motor BIGA Studio não carregado. Recarregue a página.</p></div>';
      return null;
    }

    const { api, toast = () => {}, fotoUrl } = ctx;
    const inventario = () => (typeof ctx.inventario === 'function' ? ctx.inventario() : ctx.inventario) || [];
    const comFoto = () => inventario().filter(p => p.ativo !== false && fotosDe(p).length);
    const getModelosInfo = () => (typeof ctx.modelos === 'function' ? ctx.modelos() : ctx.modelos) || { modelos: [], padrao: null };
    const getKit = () => (typeof ctx.kit === 'function' ? ctx.kit() : ctx.kit) || copia(KIT_PADRAO);

    el.innerHTML = '<div id="cpStudioHost"></div><div id="cpLote"></div><div id="cpModal"></div>';
    const studioHost = el.querySelector('#cpStudioHost');
    const loteBox = el.querySelector('#cpLote');
    const modalBox = el.querySelector('#cpModal');

    const modelosInfo = getModelosInfo();
    const modeloPadraoSalvo = modelosInfo.padrao
      ? (modelosInfo.modelos || []).find(x => x.id === modelosInfo.padrao)
      : null;

    const docInicial = modeloPadraoSalvo
      ? { ...copia(modeloPadraoSalvo), modo: 'capas', formato: modeloPadraoSalvo.tamanho || 'feed' }
      : { ...modeloPronto('arquitetura-suica', 'feed'), modo: 'capas' };

    const estado = {
      modeloId: modeloPadraoSalvo ? modeloPadraoSalvo.id : null,
      nomeModelo: modeloPadraoSalvo ? modeloPadraoSalvo.nome : docInicial.nome,
      modeloBase: modeloPadraoSalvo ? (modeloPadraoSalvo.modeloBase || null) : 'arquitetura-suica',
      formato: docInicial.formato || 'feed',
      sujo: false,
      R: { logos: {} },
      lote: { itens: [] },
      loteGerando: false
    };

    const propInicial = comFoto()[0] || inventario()[0] || null;
    let studioApi = null;

    const nomeArquivo = (p, ext = 'jpg', slideIdx = null) => {
      const base = `capa-${p ? String(p.id).replace(/[^\w-]/g, '') : 'biga'}`;
      return slideIdx !== null ? `${base}-slide-${slideIdx + 1}.${ext}` : `${base}.${ext}`;
    };

    function dispararDownloadDataUrl(dataUrl, nome) {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    async function renderizarSlideDataUrl(sl, doc, p, ext = 'png') {
      const [W, H] = ST.TAM[doc.formato || doc.tamanho] || [doc.largura || 1080, doc.altura || 1350];
      const vars = variaveis(p, getKit());
      const pngUrl = await ST.renderizarMiniaturaCanvas(sl, vars, getKit(), W, H, {
        docW: W, docH: H, prop: p, fotoUrl, carregarFontes: true
      });
      if (!pngUrl) throw new Error('Não consegui gerar a imagem.');
      if (ext === 'png') return pngUrl;
      const img = await new Promise(res => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => res(null);
        im.src = pngUrl;
      });
      if (!img) return pngUrl;
      const cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      const c2d = cv.getContext('2d');
      c2d.fillStyle = '#171721';
      c2d.fillRect(0, 0, W, H);
      c2d.drawImage(img, 0, 0, W, H);
      return cv.toDataURL('image/jpeg', 0.92);
    }

    function dataUrlParaBlob(dataUrl) {
      const parts = String(dataUrl || '').split(',');
      const mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
      const bin = atob(parts[1] || '');
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return new Blob([u8], { type: mime });
    }

    async function enviarParaVitrine(dataUrl, p) {
      if (!p) return toast('Escolha um imóvel primeiro.', true);
      const blob = dataUrlParaBlob(dataUrl);
      const fd = new FormData();
      fd.append('photos', blob, nomeArquivo(p, 'jpg'));
      const up = await api('POST', '/api/upload-photos', fd, true);
      await api('POST', `/api/vitrine/post/${encodeURIComponent(p.id)}`, { foto: up.files[0] });
      toast(`Capa do #${p.id} virou a foto do post da Vitrine (aprove o post para ele sair).`);
    }

    function pedirNomeModeloModal(sugestao) {
      return new Promise(resolve => {
        modalBox.innerHTML = `
          <div class="studio-modal-backdrop" data-cp="fecharModalNome">
            <div class="studio-modal">
              <div class="studio-modal-head">
                <h3>Salvar modelo</h3>
                <button type="button" class="studio-icon-btn" data-cp="fecharModalNome">✕</button>
              </div>
              <div class="studio-stack">
                <label class="studio-field">
                  <span>Nome do modelo</span>
                  <input type="text" name="cpNomeModelo" value="${esc(sugestao)}" maxlength="60">
                </label>
                <div class="studio-row-tight">
                  <button type="button" class="studio-primary-btn" data-cp="confirmarNomeModelo">Salvar</button>
                  <button type="button" class="studio-pill-btn" data-cp="fecharModalNome">Cancelar</button>
                </div>
              </div>
            </div>
          </div>`;
        const inp = modalBox.querySelector('input[name="cpNomeModelo"]');
        if (inp) {
          inp.focus();
          inp.select();
        }
        const concluir = val => {
          modalBox.innerHTML = '';
          modalBox.removeEventListener('click', onClick);
          resolve(val);
        };
        const onClick = ev => {
          if (ev.target === modalBox.firstElementChild) return concluir(null);
          const btn = ev.target.closest('[data-cp]');
          if (!btn) return;
          if (btn.dataset.cp === 'confirmarNomeModelo') {
            const v = String(inp?.value || '').trim();
            if (!v) return toast('Digite um nome para o modelo.', true);
            concluir(v);
          } else if (btn.dataset.cp === 'fecharModalNome') {
            concluir(null);
          }
        };
        modalBox.addEventListener('click', onClick);
      });
    }

    function abrirModalExportarCarrossel(tipo, doc) {
      const total = (doc.slides || []).length;
      const ext = tipo === 'png' ? 'png' : 'jpg';
      const live = studioApi ? studioApi.getLiveContext() : { slideIdx: 0, prop: propInicial };
      const p = live.prop || propInicial;
      const idxAtual = live.slideIdx || 0;

      modalBox.innerHTML = `
        <div class="studio-modal-backdrop">
          <div class="studio-modal">
            <div class="studio-modal-head">
              <h3>Exportar Carrossel (${esc(ext.toUpperCase())})</h3>
              <button type="button" class="studio-icon-btn" data-cp="fecharExportModal">✕</button>
            </div>
            <div class="studio-stack">
              <p class="studio-hint">Este carrossel tem ${total} slides. Deseja baixar apenas o slide visível ou todos os slides?</p>
              <div class="studio-row-tight">
                <button type="button" class="studio-primary-btn" data-cp="expAtual">Slide atual (${idxAtual + 1}/${total})</button>
                <button type="button" class="studio-pill-btn accent" data-cp="expTodos">Todos os ${total} slides</button>
              </div>
            </div>
          </div>
        </div>`;

      const onClick = async ev => {
        if (ev.target === modalBox.firstElementChild) {
          modalBox.innerHTML = '';
          modalBox.removeEventListener('click', onClick);
          return;
        }
        const btn = ev.target.closest('[data-cp]');
        if (!btn) return;
        const ac = btn.dataset.cp;
        if (ac === 'fecharExportModal') {
          modalBox.innerHTML = '';
          modalBox.removeEventListener('click', onClick);
          return;
        }
        if (ac === 'expAtual') {
          modalBox.innerHTML = '';
          modalBox.removeEventListener('click', onClick);
          const url = await renderizarSlideDataUrl(doc.slides[idxAtual] || doc.slides[0], doc, p, ext);
          dispararDownloadDataUrl(url, nomeArquivo(p, ext, idxAtual));
          toast(`Slide ${idxAtual + 1} baixado!`);
        } else if (ac === 'expTodos') {
          modalBox.innerHTML = '';
          modalBox.removeEventListener('click', onClick);
          toast(`Gerando ${total} slides…`);
          for (let i = 0; i < doc.slides.length; i++) {
            const url = await renderizarSlideDataUrl(doc.slides[i], doc, p, ext);
            dispararDownloadDataUrl(url, nomeArquivo(p, ext, i));
            await new Promise(r => setTimeout(r, 250));
          }
          toast(`${total} slides baixados!`);
        }
      };
      modalBox.addEventListener('click', onClick);
    }

    // ------------------------------------------------------------------ Aplicar em Lote
    function abrirLote(doc) {
      const lista = comFoto();
      estado.lote = { itens: [], doc: copia(doc || studioApi.getDoc()) };
      loteBox.innerHTML = `
        <div class="studio-modal-backdrop">
          <div class="studio-modal cp-lote" data-allow-scroll="1">
            <div class="studio-modal-head">
              <h3>Aplicar "${esc(estado.nomeModelo || 'este modelo')}" em lote</h3>
              <button type="button" class="studio-icon-btn" data-cp="loteFechar">✕</button>
            </div>
            <div class="studio-stack">
              <p class="studio-hint">A BIGA troca automaticamente as fotos e os dados de cada imóvel mantendo o design.</p>
              ${lista.length ? `
                <div class="chips scroll" data-allow-scroll="1">
                  ${lista.map(p => `
                    <label class="cp-chk">
                      <input type="checkbox" name="loteImovel" value="${esc(p.id)}" ${propInicial && String(propInicial.id) === String(p.id) ? '' : 'checked'}>
                      #${esc(p.id)} ${esc(p.tipo)} · ${esc(p.setor || '')}
                    </label>`).join('')}
                </div>
                <div class="row tight">
                  <button type="button" class="studio-pill-btn" data-cp="loteTodos">Marcar todos</button>
                  <button type="button" class="studio-primary-btn" data-cp="loteGerar">Gerar capas</button>
                </div>` : '<p class="body ash">Nenhum imóvel ativo com foto na Carteira.</p>'}
              <div class="cp-lote-grade" id="cpLoteGrade"></div>
            </div>
          </div>
        </div>`;
    }

    async function loteGerar() {
      if (estado.loteGerando) return;
      const docBase = estado.lote?.doc || (studioApi ? studioApi.getDoc() : null);
      if (!docBase) return;
      const ids = [...loteBox.querySelectorAll('input[name="loteImovel"]:checked')].map(i => i.value);
      if (!ids.length) return toast('Marque pelo menos um imóvel.', true);
      const grade = loteBox.querySelector('#cpLoteGrade');
      if (grade) grade.innerHTML = '<p class="caption">Gerando artes…</p>';
      estado.lote.itens = [];
      estado.loteGerando = true;
      try {
        for (const idp of ids) {
          const p = inventario().find(x => String(x.id) === String(idp));
          if (!p) continue;
          const docProp = copia(docBase);
          const nFotos = fotosDe(p).length;
          for (const sl of docProp.slides || []) {
            for (const c of sl.camadas || []) {
              if (c.tipo === 'foto' && c.indiceFoto >= nFotos) c.indiceFoto = 0;
            }
          }
          const sl0 = (docProp.slides && docProp.slides[0]) || { fundo: docProp.fundo, camadas: docProp.camadas };
          let jpgUrl = '';
          let pngUrl = '';
          try {
            pngUrl = await renderizarSlideDataUrl(sl0, docProp, p, 'png');
            jpgUrl = await renderizarSlideDataUrl(sl0, docProp, p, 'jpg');
          } catch {
            jpgUrl = '';
          }
          estado.lote.itens.push({ id: p.id, p, pngUrl, jpgUrl });
        }
        if (grade) {
          grade.innerHTML = estado.lote.itens.map(it => `
            <figure class="cp-lote-item">
              <img alt="Capa do imóvel #${esc(it.id)}" data-lote-img="${esc(it.id)}"${it.jpgUrl ? ` src="${esc(it.jpgUrl)}"` : ''}>
              <figcaption>
                #${esc(it.id)} ${esc(it.p.setor || '')}
                <span class="row tight">
                  <button type="button" class="btn-ghost" data-cp="loteBaixar" data-id="${esc(it.id)}">Baixar</button>
                  <button type="button" class="btn-ghost accent" data-cp="loteVitrine" data-id="${esc(it.id)}">Vitrine</button>
                </span>
              </figcaption>
            </figure>`).join('') + (estado.lote.itens.length > 1 ? `
            <div class="row tight cp-lote-todas">
              <button type="button" class="btn-ghost" data-cp="loteBaixarTodas">Baixar todas</button>
              <button type="button" class="btn-primary" data-cp="loteVitrineTodas">Usar todas na Vitrine</button>
            </div>` : '');
        }
      } finally {
        estado.loteGerando = false;
      }
    }

    const itemLote = idp => (estado.lote?.itens || []).find(x => String(x.id) === String(idp));

    loteBox.addEventListener('click', ev => {
      if (ev.target === loteBox.firstElementChild) {
        estado.lote = null;
        loteBox.innerHTML = '';
        return;
      }
      const btn = ev.target.closest('[data-cp]');
      if (!btn) return;
      ev.preventDefault();
      const ac = btn.dataset.cp;
      const idp = btn.dataset.id;
      (async () => {
        if (ac === 'loteFechar') {
          estado.lote = null;
          loteBox.innerHTML = '';
        } else if (ac === 'loteTodos') {
          loteBox.querySelectorAll('input[name="loteImovel"]').forEach(i => (i.checked = true));
        } else if (ac === 'loteGerar') {
          await loteGerar();
        } else if (ac === 'loteBaixar') {
          const it = itemLote(idp);
          if (it && (it.jpgUrl || it.pngUrl)) dispararDownloadDataUrl(it.jpgUrl || it.pngUrl, nomeArquivo(it.p, 'jpg'));
        } else if (ac === 'loteVitrine') {
          const it = itemLote(idp);
          if (it && (it.jpgUrl || it.pngUrl)) await enviarParaVitrine(it.jpgUrl || it.pngUrl, it.p);
        } else if (ac === 'loteBaixarTodas') {
          for (const it of estado.lote?.itens || []) {
            if (it.jpgUrl || it.pngUrl) {
              dispararDownloadDataUrl(it.jpgUrl || it.pngUrl, nomeArquivo(it.p, 'jpg'));
              await new Promise(r => setTimeout(r, 300));
            }
          }
        } else if (ac === 'loteVitrineTodas') {
          for (const it of estado.lote?.itens || []) {
            if (it.jpgUrl || it.pngUrl) await enviarParaVitrine(it.jpgUrl || it.pngUrl, it.p);
          }
          toast('Capas enviadas para a Vitrine (cada post volta para "pendente" até você aprovar).');
        }
      })().catch(err => toast(err.message || 'Erro no lote', true));
    });

    // ------------------------------------------------------------------ Instância BIGA_STUDIO
    studioApi = ST.montar(studioHost, {
      modo: 'capas',
      doc: docInicial,
      prop: propInicial,
      kit: getKit(),
      inventario,
      fotoUrl,
      toast,
      modelosProntos: MODELOS_CAPA,
      meusModelos: () => getModelosInfo(),
      opcoesTopbar: { apresentacao: true, lote: true, vitrine: true, whatsapp: false },

      onChangeDoc(doc) {
        estado.sujo = true;
        if (doc && Array.isArray(doc.slides) && doc.slides.length > MAX_SLIDES) {
          doc.slides = doc.slides.slice(0, MAX_SLIDES);
          toast(`Limite de ${MAX_SLIDES} slides no carrossel.`, true);
          if (studioApi) studioApi.setDoc(doc);
        }
      },

      onSelectModeloPronto(mod) {
        const curDoc = studioApi ? studioApi.getDoc() : docInicial;
        const fmt = curDoc.formato || curDoc.tamanho || 'feed';
        const novo = modeloPronto(mod.id, fmt);
        estado.modeloId = null;
        estado.nomeModelo = novo.nome;
        estado.modeloBase = novo.modeloBase;
        estado.formato = fmt;
        estado.sujo = false;
        return novo;
      },

      onSelectMeuModelo(mod) {
        estado.modeloId = mod.id;
        estado.nomeModelo = mod.nome;
        estado.modeloBase = mod.modeloBase || null;
        estado.formato = mod.tamanho || 'feed';
        estado.sujo = false;
        return { ...copia(mod), modo: 'capas', formato: mod.tamanho || 'feed' };
      },

      onSelectFormato(fmt) {
        const curDoc = studioApi ? studioApi.getDoc() : docInicial;
        estado.formato = fmt;
        if (!estado.sujo && estado.modeloBase && (curDoc.slides || []).length === 1) {
          return { ...modeloPronto(estado.modeloBase, fmt), modo: 'capas' };
        }
        return adaptarDocFormato(curDoc, fmt);
      },

      onSelectPaleta(palKey) {
        const curDoc = studioApi ? studioApi.getDoc() : docInicial;
        estado.sujo = true;
        return aplicarPaletaEmDoc(curDoc, getKit(), palKey);
      },

      onAddPagina({ doc }) {
        if ((doc.slides || []).length >= MAX_SLIDES) {
          toast(`O carrossel suporta no máximo ${MAX_SLIDES} slides.`, true);
          return null;
        }
        const [W, H] = ST.TAM[doc.formato || doc.tamanho] || [doc.largura || 1080, doc.altura || 1350];
        const idx = (doc.slides || []).length;
        const fundoBase = doc.slides?.[0]?.fundo || '#171721';
        return criarSlideCarrossel(idx, W, H, fundoBase, getKit());
      },

      async onSalvarModelo({ id, doc, comoNovo, nome }) {
        let nomeFinal = String(nome || '').trim();
        if (comoNovo || (!id && !estado.modeloId)) {
          const sugestao = estado.nomeModelo && !estado.modeloId ? `${estado.nomeModelo} (meu)` : (estado.nomeModelo || 'Meu modelo');
          const digitado = await pedirNomeModeloModal(sugestao);
          if (!digitado) return;
          nomeFinal = digitado;
        } else if (!nomeFinal) {
          nomeFinal = estado.nomeModelo || 'Meu modelo';
        }
        const slides = (doc.slides || []).slice(0, MAX_SLIDES);
        const payload = {
          id: comoNovo ? undefined : (id || estado.modeloId || undefined),
          nome: nomeFinal,
          tamanho: doc.formato || doc.tamanho || 'feed',
          fundo: slides[0]?.fundo || doc.fundo || '#171721',
          camadas: slides[0]?.camadas || [],
          slides,
          paleta: doc.paleta || [],
          modeloBase: estado.modeloBase || undefined
        };
        const r = await api('POST', '/api/capas/modelos', payload);
        if (typeof ctx.setModelos === 'function') ctx.setModelos(r);
        estado.modeloId = r.modelo.id;
        estado.nomeModelo = r.modelo.nome;
        if (studioApi) studioApi.setMeusModelos(r);
        toast(`Modelo "${r.modelo.nome}" salvo!`);
      },

      async onFavoritarModelo(modeloId) {
        if (!modeloId || FORBIDDEN_KEYS.has(String(modeloId))) return;
        const info = getModelosInfo();
        const eraPadrao = info.padrao === modeloId;
        const r = await api('POST', '/api/capas/modelos', { id: modeloId, padrao: !eraPadrao });
        if (typeof ctx.setModelos === 'function') ctx.setModelos(r);
        if (studioApi) studioApi.setMeusModelos(r);
        toast(!eraPadrao ? 'Modelo definido como padrão ★' : 'Removido dos favoritos.');
      },

      async onRenomearModelo(modeloId, novoNome) {
        if (!modeloId || FORBIDDEN_KEYS.has(String(modeloId))) return;
        const r = await api('POST', '/api/capas/modelos', { id: modeloId, renomear: novoNome });
        if (typeof ctx.setModelos === 'function') ctx.setModelos(r);
        if (estado.modeloId === modeloId) estado.nomeModelo = r.modelo.nome;
        if (studioApi) studioApi.setMeusModelos(r);
      },

      async onDuplicarModelo(modeloId) {
        const m = (getModelosInfo().modelos || []).find(x => x.id === modeloId);
        if (!m) return;
        const r = await api('POST', '/api/capas/modelos', {
          nome: `${m.nome} (cópia)`,
          tamanho: m.tamanho || 'feed',
          fundo: m.fundo,
          camadas: copia(m.camadas || []),
          slides: copia(m.slides || []),
          paleta: copia(m.paleta || []),
          modeloBase: m.modeloBase || undefined
        });
        if (typeof ctx.setModelos === 'function') ctx.setModelos(r);
        if (studioApi) studioApi.setMeusModelos(r);
      },

      async onExcluirModelo(modeloId) {
        if (!modeloId || FORBIDDEN_KEYS.has(String(modeloId))) return;
        const r = await api('DELETE', `/api/capas/modelos/${encodeURIComponent(modeloId)}`);
        if (typeof ctx.setModelos === 'function') ctx.setModelos(r);
        if (estado.modeloId === modeloId) estado.modeloId = null;
        if (studioApi) studioApi.setMeusModelos(r);
        toast('Modelo excluído.');
      },

      async onSalvarKit(kitOut) {
        const r = await api('POST', '/api/pdf/kit', kitOut);
        const kitSalvo = (r && r.kit) || kitOut;
        if (typeof ctx.setKit === 'function') ctx.setKit(kitSalvo);
        return kitSalvo;
      },

      async onUploadLogoKit(file, dataUrl) {
        if (file) {
          const fd = new FormData();
          fd.append('logo', file);
          const r = await api('POST', '/api/pdf/kit/logo', fd, true);
          const kitResp = (r && r.kit) || { ...getKit(), logoUrl: (r && r.logoUrl) || dataUrl };
          if (typeof ctx.setKit === 'function') ctx.setKit(kitResp);
          return r || { ok: true, kit: kitResp, logoUrl: kitResp.logoUrl || dataUrl };
        }
        const atual = getKit();
        const r = await api('POST', '/api/pdf/kit', { ...atual, logo: dataUrl, logoUrl: dataUrl });
        const kitSalvo = (r && r.kit) || { ...atual, logo: dataUrl, logoUrl: dataUrl };
        if (typeof ctx.setKit === 'function') ctx.setKit(kitSalvo);
        return { ok: true, kit: kitSalvo, logoUrl: kitSalvo.logoUrl || dataUrl };
      },

      async onExportar({ tipo, doc }) {
        const ext = tipo === 'png' ? 'png' : 'jpg';
        if ((doc.slides || []).length > 1) {
          abrirModalExportarCarrossel(ext, doc);
          return;
        }
        const live = studioApi ? studioApi.getLiveContext() : { prop: propInicial };
        const p = live.prop || propInicial;
        const url = await renderizarSlideDataUrl(doc.slides[0], doc, p, ext);
        dispararDownloadDataUrl(url, nomeArquivo(p, ext));
        toast('Imagem baixada!');
      },

      async onVitrine({ prop, dataUrl, doc }) {
        const p = prop || propInicial;
        if (!p) return toast('Escolha um imóvel primeiro.', true);
        const live = studioApi ? studioApi.getLiveContext() : { slideIdx: 0 };
        const sl = doc.slides[live.slideIdx || 0] || doc.slides[0];
        const jpgUrl = await renderizarSlideDataUrl(sl, doc, p, 'jpg').catch(() => dataUrl);
        await enviarParaVitrine(jpgUrl, p);
      },

      onLote({ doc }) {
        abrirLote(doc);
      },

      onRestaurar() {
        estado.sujo = false;
        estado.modeloId = null;
        const base = estado.modeloBase || 'arquitetura-suica';
        const novo = modeloPronto(base, estado.formato || 'feed');
        estado.nomeModelo = novo.nome;
        return novo;
      }
    });

    if (!fontesCarregadas.size && suportaContaGotas()) {
      // mantém lista de fontes pronta para lote/fallback
    }

    return { studio: studioApi, duplicarCamadaComRecursos, carregarFonte };
  }

  globalScope.BIGA_CAPAS = {
    montar,
    modeloPronto,
    MODELOS_CAPA,
    variaveis,
    trocar,
    hexParaHsv,
    hsvParaHex,
    TAM
  };
})(typeof window !== 'undefined' ? window : globalThis);
