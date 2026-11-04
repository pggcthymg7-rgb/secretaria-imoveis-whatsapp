/* BIGA — Editor de capas (beta): "canvas imobiliário" para posts do Instagram.
 * Sem dependências (CSP: script-src 'self'). Desenha tudo num <canvas> e exporta JPG/PNG.
 * Camadas: foto do imóvel, texto (com variáveis {nome} {preco}…), retângulo, degradê e logo.
 * Comandos no estilo Canva: arrastar, redimensionar (escala uniforme OU separada na horizontal/vertical),
 * girar, alinhar, ordem das camadas, duplicar, travar, opacidade, desfazer/refazer, guias de centro,
 * filtros na foto, enquadramento da foto, todas as fontes do Google, roda de cores, modelos salvos
 * e aplicar o modelo em vários imóveis de uma vez.
 */
(() => {
  'use strict';

  const TAM = { feed: [1080, 1350, 'Feed 4:5'], quadrado: [1080, 1080, 'Quadrado 1:1'], story: [1080, 1920, 'Story 9:16'] };
  const VARS = [
    ['{nome}', 'Nome do imóvel'],
    ['{preco}', 'Preço'],
    ['{bairro}', 'Bairro'],
    ['{tipo}', 'Tipo'],
    ['{quartos}', 'Quartos'],
    ['{suites}', 'Suítes'],
    ['{vagas}', 'Vagas'],
    ['{area}', 'Área m²'],
    ['{cidade}', 'Cidade'],
    ['{codigo}', 'Código']
  ];
  const CAT = { s: 'Sem serifa', r: 'Serifada', d: 'Display', h: 'Manuscrita', m: 'Monoespaçada' };
  const PALETA_PADRAO = ['#ffffff', '#171721', '#5266eb', '#ededf3', '#c9a227', '#0f3d2e', '#b8452e', '#000000'];
  const HANDLE = 22;

  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const copia = o => JSON.parse(JSON.stringify(o));
  const brl = v => (Number(v) ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : 'Consulte');

  // ------------------------------------------------------------------ dados do imóvel -> variáveis
  function variaveis(p) {
    if (!p) return {};
    const nome = p.edificio ? `${p.edificio}` : `${p.tipo || 'Imóvel'}${p.setor ? ' no ' + p.setor : ''}`;
    const preco = p.negociacao === 'ALUGUEL' ? `${brl(p.valor)}/mês` : brl(p.valor);
    return {
      '{nome}': nome,
      '{preco}': preco,
      '{bairro}': p.setor || '',
      '{tipo}': p.tipo || 'Imóvel',
      '{quartos}': p.quartos || '–',
      '{suites}': p.suites || '–',
      '{vagas}': p.vagas || '–',
      '{area}': p.tamanho_m2 || p.area_terreno || '–',
      '{cidade}': p.cidade || 'Goiânia',
      '{codigo}': p.id ? `#${p.id}` : ''
    };
  }
  const trocar = (t, vars) => String(t || '').replace(/\{[a-z]+\}/g, k => (k in vars ? String(vars[k]) : k));
  const fotosDe = p => (Array.isArray(p?.fotos) ? p.fotos : String(p?.fotos || '').split(/[,;\n]/)).map(x => String(x).trim()).filter(Boolean);

  // ------------------------------------------------------------------ fontes do Google
  let FONTES = null;
  const fontesCarregadas = new Set();
  async function listaFontes() {
    if (FONTES) return FONTES;
    try {
      const r = await fetch('/assets/fontes-google.json', { credentials: 'same-origin' });
      FONTES = (await r.json()).familias;
    } catch {
      FONTES = [['Inter', 's', [400, 700]], ['Playfair Display', 'r', [400, 700]], ['Montserrat', 's', [400, 700, 800]]];
    }
    return FONTES;
  }
  const pesosDe = fam => ((FONTES || []).find(f => f[0] === fam) || [fam, 's', [400, 700]])[2];
  const folhas = new Map();
  /** injeta a folha do Google Fonts e devolve uma promessa que resolve quando ela carregou */
  function linkFonte(href) {
    if (folhas.has(href)) return folhas.get(href);
    const p = new Promise(res => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.onload = () => res(true);
      l.onerror = () => res(false);
      document.head.appendChild(l);
      setTimeout(() => res(false), 8000);
    });
    folhas.set(href, p);
    return p;
  }
  const famUrl = fam => encodeURIComponent(fam).replace(/%20/g, '+');
  /** carrega a família inteira (todos os pesos) e espera o navegador ter a fonte pronta para o canvas */
  async function carregarFonte(fam, peso = 400, italico = false) {
    if (!fam || /^(sans-serif|serif)$/.test(fam)) return;
    await listaFontes();
    const ps = pesosDe(fam);
    // ital,wght pede itálico e normal de todos os pesos (família sem itálico: o Google devolve erro 400 -> tenta sem)
    const ok = await linkFonte(`https://fonts.googleapis.com/css2?family=${famUrl(fam)}:ital,wght@${[0, 1].flatMap(i => ps.map(w => `${i},${w}`)).join(';')}&display=swap`);
    if (!ok) await linkFonte(`https://fonts.googleapis.com/css2?family=${famUrl(fam)}:wght@${ps.join(';')}&display=swap`);
    fontesCarregadas.add(fam);
    try {
      await document.fonts.load(`${italico ? 'italic ' : ''}${peso} 48px "${fam}"`);
    } catch {}
  }
  /** prévia barata: só as letras do nome da fonte (parâmetro text= do Google Fonts) */
  const previaFonte = fam => linkFonte(`https://fonts.googleapis.com/css2?family=${famUrl(fam)}&text=${encodeURIComponent(fam)}&display=swap`);

  // ------------------------------------------------------------------ modelos prontos
  function modeloPronto(tipo, tamanho) {
    const [W, H] = TAM[tamanho] || TAM.feed;
    const foto = { id: uid(), tipo: 'foto', nome: 'Foto do imóvel', x: 0, y: 0, w: W, h: H, rot: 0, opacidade: 1, visivel: true, travada: false, zoom: 1, offX: 0, offY: 0, brilho: 100, contraste: 105, saturacao: 108, desfoque: 0, raio: 0, indiceFoto: 0 };
    const t = (nome, texto, o) => ({ id: uid(), tipo: 'texto', nome, texto, x: 72, y: 0, w: W - 144, h: 100, rot: 0, opacidade: 1, visivel: true, travada: false, fonte: 'Inter', peso: 700, italico: false, tamanho: 64, cor: '#ffffff', alinhamento: 'left', espacamento: 0, entrelinha: 1.1, escalaX: 1, escalaY: 1, maiusculas: false, sombra: 0, corSombra: '#000000', contorno: 0, corContorno: '#000000', fundo: false, corFundo: '#5266eb', raioFundo: 40, folga: 22, ...o });
    if (tipo === 'faixa') {
      const fy = Math.round(H * 0.66);
      return {
        nome: 'Faixa elegante',
        fundo: '#171721',
        camadas: [
          { ...foto, h: fy },
          { id: uid(), tipo: 'retangulo', nome: 'Faixa', x: 0, y: fy, w: W, h: H - fy, rot: 0, opacidade: 1, visivel: true, travada: false, cor: '#171721', raio: 0, borda: 0, corBorda: '#ffffff' },
          { id: uid(), tipo: 'retangulo', nome: 'Linha dourada', x: 72, y: fy + 48, w: 120, h: 6, rot: 0, opacidade: 1, visivel: true, travada: false, cor: '#c9a227', raio: 3, borda: 0, corBorda: '#ffffff' },
          t('Nome', '{nome}', { y: fy + 80, fonte: 'Playfair Display', peso: 700, tamanho: 76 }),
          t('Detalhes', '{bairro} · {quartos} quartos · {area} m²', { y: H - 190, fonte: 'Montserrat', peso: 500, tamanho: 32, cor: '#c3c3cc' }),
          t('Preço', '{preco}', { y: H - 130, fonte: 'Montserrat', peso: 800, tamanho: 54, cor: '#c9a227' })
        ]
      };
    }
    if (tipo === 'minimal') {
      return {
        nome: 'Minimalista',
        fundo: '#ffffff',
        camadas: [
          foto,
          { id: uid(), tipo: 'retangulo', nome: 'Moldura', x: 36, y: 36, w: W - 72, h: H - 72, rot: 0, opacidade: 1, visivel: true, travada: false, cor: '#00000000', raio: 0, borda: 6, corBorda: '#ffffff' },
          { id: uid(), tipo: 'degrade', nome: 'Sombra', x: 0, y: Math.round(H * 0.55), w: W, h: Math.round(H * 0.45), rot: 0, opacidade: 1, visivel: true, travada: false, cor1: '#00000000', cor2: '#000000b3', angulo: 180 },
          t('Nome', '{nome}', { y: H - 300, h: 100, ancora: 'base', alinhamento: 'center', fonte: 'Cormorant Garamond', peso: 600, tamanho: 88, italico: true }),
          t('Preço', '{preco}', { y: H - 160, alinhamento: 'center', fonte: 'Inter', peso: 300, tamanho: 40, espacamento: 6, maiusculas: true })
        ]
      };
    }
    return {
      nome: 'Clássico BIGA',
      fundo: '#171721',
      camadas: [
        foto,
        { id: uid(), tipo: 'degrade', nome: 'Degradê', x: 0, y: Math.round(H * 0.4), w: W, h: Math.round(H * 0.6) + 2, rot: 0, opacidade: 1, visivel: true, travada: false, cor1: '#00000000', cor2: '#000000e6', angulo: 180 },
        t('Selo', 'à venda', { x: W - 72 - 220, y: 64, w: 220, alinhamento: 'center', peso: 700, tamanho: 26, espacamento: 4, maiusculas: true, fundo: true, corFundo: '#5266eb', folga: 18 }),
        t('Bairro', '{tipo} · {bairro}', { y: H - 292, peso: 600, tamanho: 30, espacamento: 4, maiusculas: true, cor: '#ededf3' }),
        t('Nome', '{nome}', { y: H - 400, h: 90, ancora: 'base', fonte: 'Playfair Display', peso: 700, tamanho: 86, entrelinha: 1.05 }),
        t('Detalhes', '{quartos} quartos · {suites} suítes · {area} m² · {vagas} vagas', { y: H - 236, peso: 500, tamanho: 30, cor: '#ededf3' }),
        t('Preço', '{preco}', { y: H - 160, w: 520, peso: 800, tamanho: 50, fundo: true, corFundo: '#5266eb', folga: 22 })
      ]
    };
  }

  // ------------------------------------------------------------------ desenho
  function hexRgba(h) {
    const m = String(h || '').match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (!m) return 'rgba(0,0,0,0)';
    const n = parseInt(m[1], 16);
    const a = m[2] ? parseInt(m[2], 16) / 255 : 1;
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
  }
  function caminhoArredondado(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  const fonteCss = c => `${c.italico ? 'italic ' : ''}${c.peso} ${c.tamanho}px "${c.fonte}", sans-serif`;
  function larguraTexto(ctx, s, esp) {
    return ctx.measureText(s).width + Math.max(0, [...s].length - 1) * esp;
  }
  /** quebra em linhas pela largura da caixa (em unidades antes da escala horizontal) */
  function linhasDo(ctx, c, texto) {
    ctx.font = fonteCss(c);
    const max = Math.max(10, (c.w - (c.fundo ? c.folga * 2 : 0)) / c.escalaX);
    const out = [];
    for (const par of texto.split('\n')) {
      const palavras = par.split(/\s+/).filter(Boolean);
      if (!palavras.length) {
        out.push('');
        continue;
      }
      let linha = palavras[0];
      for (const w of palavras.slice(1)) {
        const tenta = `${linha} ${w}`;
        if (larguraTexto(ctx, tenta, c.espacamento) <= max) linha = tenta;
        else {
          out.push(linha);
          linha = w;
        }
      }
      out.push(linha);
    }
    return out;
  }
  function escreverLinha(ctx, s, x, y, esp, modo) {
    if (!esp) return modo === 'stroke' ? ctx.strokeText(s, x, y) : ctx.fillText(s, x, y);
    let cx = x;
    for (const ch of s) {
      if (modo === 'stroke') ctx.strokeText(ch, cx, y);
      else ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + esp;
    }
  }
  /** mede e ajusta a altura da caixa de texto ao conteúdo */
  function medirTexto(ctx, c, vars) {
    let s = trocar(c.texto, vars);
    if (c.maiusculas) s = s.toLocaleUpperCase('pt-BR');
    const linhas = linhasDo(ctx, c, s);
    const lh = c.tamanho * c.entrelinha;
    const alturaTexto = (linhas.length * lh) * c.escalaY;
    const antes = c.h;
    c.h = Math.round(alturaTexto + (c.fundo ? c.folga * 2 : 0));
    // ancorado embaixo: o texto cresce para CIMA (nome comprido não cobre o que vem abaixo)
    if (c.ancora === 'base' && antes) c.y += antes - c.h;
    return { linhas, lh };
  }

  function desenharCamada(ctx, c, R) {
    if (!c.visivel) return;
    ctx.save();
    ctx.globalAlpha = c.opacidade;
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((c.rot * Math.PI) / 180);
    ctx.translate(-c.w / 2, -c.h / 2);
    if (c.tipo === 'foto') {
      const img = R.fotos[c.indiceFoto] || R.fotos[0];
      caminhoArredondado(ctx, 0, 0, c.w, c.h, c.raio);
      ctx.clip();
      if (img && img.complete && img.naturalWidth) {
        const esc2 = Math.max(c.w / img.naturalWidth, c.h / img.naturalHeight) * c.zoom;
        const iw = img.naturalWidth * esc2;
        const ih = img.naturalHeight * esc2;
        const sobraX = iw - c.w;
        const sobraY = ih - c.h;
        ctx.filter = `brightness(${c.brilho}%) contrast(${c.contraste}%) saturate(${c.saturacao}%)${c.desfoque ? ` blur(${c.desfoque}px)` : ''}`;
        ctx.drawImage(img, -sobraX / 2 + (c.offX * sobraX) / 2, -sobraY / 2 + (c.offY * sobraY) / 2, iw, ih);
        ctx.filter = 'none';
      } else {
        ctx.fillStyle = '#2a2a3a';
        ctx.fillRect(0, 0, c.w, c.h);
        ctx.fillStyle = '#8b8b99';
        ctx.font = '600 40px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(R.semFoto || 'Sem foto: escolha um imóvel com foto', c.w / 2, c.h / 2);
      }
    } else if (c.tipo === 'retangulo') {
      caminhoArredondado(ctx, 0, 0, c.w, c.h, c.raio);
      ctx.fillStyle = hexRgba(c.cor);
      ctx.fill();
      if (c.borda) {
        ctx.lineWidth = c.borda;
        ctx.strokeStyle = hexRgba(c.corBorda);
        caminhoArredondado(ctx, c.borda / 2, c.borda / 2, c.w - c.borda, c.h - c.borda, c.raio);
        ctx.stroke();
      }
    } else if (c.tipo === 'degrade') {
      const a = ((c.angulo - 90) * Math.PI) / 180;
      const r = Math.hypot(c.w, c.h) / 2;
      const g = ctx.createLinearGradient(c.w / 2 - Math.cos(a) * r, c.h / 2 - Math.sin(a) * r, c.w / 2 + Math.cos(a) * r, c.h / 2 + Math.sin(a) * r);
      g.addColorStop(0, hexRgba(c.cor1));
      g.addColorStop(1, hexRgba(c.cor2));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.w, c.h);
    } else if (c.tipo === 'logo') {
      const img = R.logos[c.id];
      if (img && img.complete) ctx.drawImage(img, 0, 0, c.w, c.h);
    } else if (c.tipo === 'texto') {
      const { linhas, lh } = medirTexto(ctx, c, R.vars);
      if (c.fundo) {
        caminhoArredondado(ctx, 0, 0, c.w, c.h, c.raioFundo);
        ctx.fillStyle = hexRgba(c.corFundo);
        ctx.fill();
      }
      const pad = c.fundo ? c.folga : 0;
      ctx.translate(pad, pad);
      ctx.scale(c.escalaX, c.escalaY);
      ctx.font = fonteCss(c);
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      const largura = (c.w - pad * 2) / c.escalaX;
      linhas.forEach((ln, i) => {
        const lw = larguraTexto(ctx, ln, c.espacamento);
        const x = c.alinhamento === 'center' ? (largura - lw) / 2 : c.alinhamento === 'right' ? largura - lw : 0;
        const y = i * lh + (lh - c.tamanho) / 2;
        if (c.sombra) {
          ctx.shadowColor = hexRgba(c.corSombra);
          ctx.shadowBlur = c.sombra;
          ctx.shadowOffsetY = c.sombra / 3;
        }
        if (c.contorno) {
          ctx.lineWidth = c.contorno;
          ctx.lineJoin = 'round';
          ctx.strokeStyle = hexRgba(c.corContorno);
          escreverLinha(ctx, ln, x, y, c.espacamento, 'stroke');
        }
        ctx.fillStyle = hexRgba(c.cor);
        escreverLinha(ctx, ln, x, y, c.espacamento, 'fill');
        ctx.shadowColor = 'transparent';
      });
    }
    ctx.restore();
  }

  function desenhar(ctx, doc, R, overlay) {
    const [W, H] = TAM[doc.tamanho] || TAM.feed;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = hexRgba(doc.fundo);
    ctx.fillRect(0, 0, W, H);
    // mede os textos ANTES de posicionar (a altura muda com o conteúdo; ancorado embaixo sobe)
    for (const c of doc.camadas) if (c.tipo === 'texto' && c.visivel) medirTexto(ctx, c, R.vars);
    for (const c of doc.camadas) desenharCamada(ctx, c, R);
    ctx.restore();
    if (overlay) overlay(ctx);
  }

  async function recursos(doc, prop, fotoUrl) {
    const vars = variaveis(prop);
    const lista = fotosDe(prop);
    const fotos = await Promise.all(lista.slice(0, 12).map(f => carregarImagem(fotoUrl(f))));
    const logos = {};
    await Promise.all(doc.camadas.filter(c => c.tipo === 'logo').map(async c => (logos[c.id] = await carregarImagem(c.src))));
    await Promise.all(doc.camadas.filter(c => c.tipo === 'texto').map(c => carregarFonte(c.fonte, c.peso, c.italico)));
    return { vars, fotos: fotos.filter(Boolean), logos, semFoto: prop ? 'Este imóvel não tem foto' : 'Escolha um imóvel' };
  }
  const cacheImg = new Map();
  function carregarImagem(src) {
    if (!src) return Promise.resolve(null);
    if (cacheImg.has(src)) return cacheImg.get(src);
    const p = new Promise(res => {
      const img = new Image();
      if (/^https?:/i.test(src) && !src.startsWith(location.origin)) img.crossOrigin = 'anonymous';
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = src;
    });
    cacheImg.set(src, p);
    return p;
  }

  // ------------------------------------------------------------------ roda de cores
  function hexParaHsv(hex) {
    const m = String(hex).match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i) || ['', 'ffffff', 'ff'];
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
  function hsvParaHex({ h, s, v, a }) {
    const f = n => {
      const k = (n + h / 60) % 6;
      return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
    };
    const hx = n => n.toString(16).padStart(2, '0');
    return `#${hx(f(5))}${hx(f(3))}${hx(f(1))}${a < 0.999 ? hx(Math.round(a * 255)) : ''}`;
  }

  // ------------------------------------------------------------------ o editor
  function montar(el, ctx) {
    const { api, toast, fotoUrl } = ctx;
    const E = {
      doc: null,
      prop: null,
      modeloId: null,
      sel: null,
      hist: [],
      fut: [],
      uniforme: true,
      R: { vars: {}, fotos: [], logos: {} },
      arraste: null,
      guias: [],
      enquadrar: false,
      fonteBusca: '',
      fonteCat: '',
      rodaPara: null,
      recentes: [],
      lote: null
    };
    const inventario = () => ctx.inventario() || [];
    const comFoto = () => inventario().filter(p => p.ativo !== false && fotosDe(p).length);

    el.innerHTML = `
      <div class="capas">
        <div class="cp-top card">
          <label class="field"><span>Imóvel</span><select name="cpImovel"></select></label>
          <label class="field"><span>Modelo</span><select name="cpModelo"></select></label>
          <label class="field"><span>Formato</span><select name="cpTam">${Object.entries(TAM).map(([k, v]) => `<option value="${k}">${v[2]}</option>`).join('')}</select></label>
          <div class="cp-acoes">
            <button class="btn-ghost" data-cp="desfazer" title="Desfazer (Ctrl+Z)">↶</button>
            <button class="btn-ghost" data-cp="refazer" title="Refazer (Ctrl+Shift+Z)">↷</button>
            <button class="btn-ghost" data-cp="salvarModelo">Salvar modelo</button>
            <button class="btn-ghost" data-cp="salvarComo">Salvar como novo</button>
            <button class="btn-ghost accent" data-cp="lote">Aplicar em outros imóveis</button>
            <button class="btn-ghost" data-cp="vitrine">Usar na vitrine</button>
            <button class="btn-primary" data-cp="baixar">Baixar imagem</button>
          </div>
        </div>
        <div class="cp-main">
          <div class="cp-palco card"><canvas id="cpCanvas" tabindex="0" aria-label="Capa em edição"></canvas>
            <p class="caption">Clique para escolher uma camada · arraste para mover · cantos redimensionam · bolinha de cima gira · <b>Del</b> apaga · setas ajustam · Ctrl+D duplica</p></div>
          <aside class="cp-lado">
            <div class="card stack-sm"><span class="label">Adicionar</span><div class="cp-add">
              <button class="btn-ghost" data-cp="addTexto">＋ Texto</button><button class="btn-ghost" data-cp="addRet">＋ Forma</button><button class="btn-ghost" data-cp="addDeg">＋ Degradê</button><button class="btn-ghost" data-cp="addFoto">＋ Foto</button><label class="btn-ghost cp-file">＋ Logo<input type="file" accept="image/png,image/jpeg,image/webp" name="cpLogo" hidden></label>
            </div></div>
            <div class="card stack-sm"><span class="label">Camadas</span><div id="cpCamadas"></div></div>
            <div class="card stack-sm" id="cpProps"></div>
          </aside>
        </div>
        <div id="cpLote"></div>
      </div>`;

    const canvas = el.querySelector('#cpCanvas');
    const g = canvas.getContext('2d');
    const $ = s => el.querySelector(s);

    // ---------------- seleção de imóvel / modelo
    function preencherSelects() {
      const inv = inventario();
      $('[name=cpImovel]').innerHTML = inv.length ? inv.map(p => `<option value="${esc(p.id)}" ${E.prop && String(E.prop.id) === String(p.id) ? 'selected' : ''}>#${esc(p.id)} · ${esc(p.tipo)} · ${esc(p.setor || '')} ${fotosDe(p).length ? '' : '(sem foto)'}</option>`).join('') : '<option value="">Cadastre um imóvel na Carteira</option>';
      const meus = ctx.modelos().modelos || [];
      $('[name=cpModelo]').innerHTML = `<optgroup label="Prontos da BIGA"><option value="pronto:classico">Clássico BIGA</option><option value="pronto:faixa">Faixa elegante</option><option value="pronto:minimal">Minimalista</option></optgroup>${meus.length ? `<optgroup label="Meus modelos">${meus.map(m => `<option value="meu:${esc(m.id)}">${esc(m.nome)}${ctx.modelos().padrao === m.id ? ' ★' : ''}</option>`).join('')}</optgroup>` : ''}`;
      $('[name=cpModelo]').value = E.modeloId ? `meu:${E.modeloId}` : E.prontoAtual || 'pronto:classico';
      $('[name=cpTam]').value = E.doc ? E.doc.tamanho : 'feed';
    }
    function docDoModelo(valor, tamanho) {
      const [tipo, idm] = String(valor).split(':');
      if (tipo === 'meu') {
        const m = (ctx.modelos().modelos || []).find(x => x.id === idm);
        if (m) return { doc: { tamanho: m.tamanho, fundo: m.fundo, camadas: copia(m.camadas), paleta: m.paleta || [] }, modeloId: m.id, nome: m.nome };
      }
      const p = modeloPronto(idm || 'classico', tamanho || 'feed');
      return { doc: { tamanho: tamanho || 'feed', fundo: p.fundo, camadas: p.camadas, paleta: [] }, modeloId: null, nome: p.nome, pronto: valor };
    }
    async function abrirModelo(valor, tamanho) {
      const r = docDoModelo(valor, tamanho);
      E.doc = r.doc;
      E.modeloId = r.modeloId;
      E.nomeModelo = r.nome;
      E.prontoAtual = r.pronto || null;
      E.sel = null;
      E.hist = [];
      E.fut = [];
      await atualizarRecursos();
    }
    async function atualizarRecursos() {
      const [W, H] = TAM[E.doc.tamanho];
      canvas.width = W;
      canvas.height = H;
      E.R = await recursos(E.doc, E.prop, fotoUrl);
      tudo();
    }

    // ---------------- histórico
    function marcar() {
      E.hist.push(JSON.stringify(E.doc));
      if (E.hist.length > 80) E.hist.shift();
      E.fut = [];
    }
    function desfazer() {
      if (!E.hist.length) return;
      E.fut.push(JSON.stringify(E.doc));
      E.doc = JSON.parse(E.hist.pop());
      if (!camada(E.sel)) E.sel = null;
      atualizarRecursos();
    }
    function refazer() {
      if (!E.fut.length) return;
      E.hist.push(JSON.stringify(E.doc));
      E.doc = JSON.parse(E.fut.pop());
      atualizarRecursos();
    }

    const camada = idc => E.doc && E.doc.camadas.find(c => c.id === idc);

    // ---------------- desenho com seleção e guias
    function overlay(cx) {
      const c = camada(E.sel);
      if (c) {
        cx.save();
        cx.translate(c.x + c.w / 2, c.y + c.h / 2);
        cx.rotate((c.rot * Math.PI) / 180);
        cx.strokeStyle = '#5266eb';
        cx.lineWidth = 3;
        cx.setLineDash(c.travada ? [10, 8] : []);
        cx.strokeRect(-c.w / 2, -c.h / 2, c.w, c.h);
        cx.setLineDash([]);
        if (!c.travada) {
          for (const [hx, hy] of alcas(c)) {
            cx.fillStyle = '#ffffff';
            cx.strokeStyle = '#5266eb';
            cx.beginPath();
            cx.arc(hx, hy, HANDLE / 2, 0, Math.PI * 2);
            cx.fill();
            cx.stroke();
          }
          cx.beginPath();
          cx.moveTo(0, -c.h / 2);
          cx.lineTo(0, -c.h / 2 - 60);
          cx.stroke();
          cx.fillStyle = '#5266eb';
          cx.beginPath();
          cx.arc(0, -c.h / 2 - 60, HANDLE / 2, 0, Math.PI * 2);
          cx.fill();
        }
        cx.restore();
      }
      cx.save();
      cx.strokeStyle = '#ff4fa3';
      cx.lineWidth = 2;
      cx.setLineDash([12, 10]);
      for (const gd of E.guias) {
        cx.beginPath();
        if (gd.x !== undefined) {
          cx.moveTo(gd.x, 0);
          cx.lineTo(gd.x, canvas.height);
        } else {
          cx.moveTo(0, gd.y);
          cx.lineTo(canvas.width, gd.y);
        }
        cx.stroke();
      }
      cx.restore();
    }
    // alças: 4 cantos + meio da direita + meio de baixo (local, relativo ao centro)
    const alcas = c => [[-c.w / 2, -c.h / 2, 'nw'], [c.w / 2, -c.h / 2, 'ne'], [c.w / 2, c.h / 2, 'se'], [-c.w / 2, c.h / 2, 'sw'], [c.w / 2, 0, 'e'], [0, c.h / 2, 's']];
    function redesenhar() {
      desenhar(g, E.doc, E.R, overlay);
    }
    function tudo() {
      redesenhar();
      listaCamadas();
      painel();
      preencherSelects();
    }

    // ---------------- interação no canvas
    function ponto(ev) {
      const r = canvas.getBoundingClientRect();
      return { x: ((ev.clientX - r.left) / r.width) * canvas.width, y: ((ev.clientY - r.top) / r.height) * canvas.height };
    }
    function local(c, p) {
      const a = (-c.rot * Math.PI) / 180;
      const dx = p.x - (c.x + c.w / 2);
      const dy = p.y - (c.y + c.h / 2);
      return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
    }
    function acertar(p) {
      for (let i = E.doc.camadas.length - 1; i >= 0; i--) {
        const c = E.doc.camadas[i];
        if (!c.visivel) continue;
        const l = local(c, p);
        if (Math.abs(l.x) <= c.w / 2 && Math.abs(l.y) <= c.h / 2) return c;
      }
      return null;
    }
    canvas.addEventListener('pointerdown', ev => {
      if (!E.doc) return;
      const p = ponto(ev);
      const atual = camada(E.sel);
      const tol = HANDLE * (canvas.width / canvas.getBoundingClientRect().width) * 0.9;
      if (atual && !atual.travada) {
        const l = local(atual, p);
        if (Math.hypot(l.x, l.y + atual.h / 2 + 60) < tol) return iniciar(ev, { modo: 'girar', c: atual, p });
        const al = alcas(atual).find(([hx, hy]) => Math.hypot(l.x - hx, l.y - hy) < tol);
        if (al) return iniciar(ev, { modo: 'redim', alca: al[2], c: atual, p, ini: copia(atual) });
      }
      const c = acertar(p);
      E.sel = c ? c.id : null;
      if (c && !c.travada) {
        if (c.tipo === 'foto' && (E.enquadrar || ev.altKey)) iniciar(ev, { modo: 'enquadrar', c, p, ini: copia(c) });
        else iniciar(ev, { modo: 'mover', c, p, ini: copia(c) });
      }
      tudo();
    });
    function iniciar(ev, a) {
      marcar();
      E.arraste = a;
      canvas.setPointerCapture(ev.pointerId);
    }
    canvas.addEventListener('pointermove', ev => {
      const a = E.arraste;
      if (!a) return;
      const p = ponto(ev);
      const c = a.c;
      const dx = p.x - a.p.x;
      const dy = p.y - a.p.y;
      E.guias = [];
      if (a.modo === 'mover') {
        c.x = Math.round(a.ini.x + dx);
        c.y = Math.round(a.ini.y + dy);
        // guias: centro da arte e bordas
        const W = canvas.width;
        const H = canvas.height;
        const snap = 12;
        if (Math.abs(c.x + c.w / 2 - W / 2) < snap) (c.x = Math.round(W / 2 - c.w / 2)), E.guias.push({ x: W / 2 });
        if (Math.abs(c.y + c.h / 2 - H / 2) < snap) (c.y = Math.round(H / 2 - c.h / 2)), E.guias.push({ y: H / 2 });
        if (Math.abs(c.x) < snap) (c.x = 0), E.guias.push({ x: 0 });
        if (Math.abs(c.x + c.w - W) < snap) (c.x = W - c.w), E.guias.push({ x: W });
      } else if (a.modo === 'enquadrar') {
        c.offX = clamp(a.ini.offX - (dx / c.w) * 2, -1, 1);
        c.offY = clamp(a.ini.offY - (dy / c.h) * 2, -1, 1);
      } else if (a.modo === 'girar') {
        const ang = (Math.atan2(p.y - (c.y + c.h / 2), p.x - (c.x + c.w / 2)) * 180) / Math.PI + 90;
        c.rot = ev.shiftKey ? Math.round(ang / 15) * 15 : Math.round(ang);
        if (c.rot > 180) c.rot -= 360;
      } else if (a.modo === 'redim') redimensionar(a, p, ev.shiftKey);
      redesenhar();
      painelValores();
    });
    const fim = () => {
      if (!E.arraste) return;
      E.arraste = null;
      E.guias = [];
      tudo();
    };
    canvas.addEventListener('pointerup', fim);
    canvas.addEventListener('pointercancel', fim);
    canvas.addEventListener('dblclick', () => {
      const c = camada(E.sel);
      if (c && c.tipo === 'texto') setTimeout(() => $('#cpProps textarea')?.focus(), 30);
    });

    /** redimensiona: texto escala (uniforme ou separada X/Y); demais mudam largura/altura */
    function redimensionar(a, p, shift) {
      const c = a.c;
      const i = a.ini;
      const l = local(i, p);
      const lp = local(i, a.p);
      const dxl = l.x - lp.x;
      const dyl = l.y - lp.y;
      const sx = a.alca.includes('w') ? -1 : 1;
      const sy = a.alca.includes('n') ? -1 : 1;
      const uniforme = E.uniforme !== shift; // Shift inverte a escolha
      if (c.tipo === 'texto') {
        if (a.alca === 'e') c.escalaX = clamp(i.escalaX * (1 + (dxl * sx) / i.w), 0.1, 5);
        else if (a.alca === 's') c.escalaY = clamp(i.escalaY * (1 + (dyl * sy) / i.h), 0.1, 5);
        else {
          const fx = 1 + (dxl * sx) / i.w;
          const fy = 1 + (dyl * sy) / i.h;
          if (uniforme) {
            const f = clamp(Math.abs(fx) > Math.abs(fy) ? fx : fy, 0.1, 10);
            c.tamanho = clamp(Math.round(i.tamanho * f), 6, 600);
            c.w = Math.round(i.w * f);
          } else {
            c.escalaX = clamp(i.escalaX * fx, 0.1, 5);
            c.escalaY = clamp(i.escalaY * fy, 0.1, 5);
            c.w = Math.round(i.w * fx);
          }
        }
        if (sx < 0) c.x = Math.round(i.x + i.w - c.w);
        if (sy < 0 && a.alca !== 'e') c.y = Math.round(i.y + i.h - c.h);
        return;
      }
      let w = i.w + (a.alca === 's' ? 0 : dxl * sx);
      let h = i.h + (a.alca === 'e' ? 0 : dyl * sy);
      if (uniforme && a.alca.length === 2) {
        const f = Math.max(w / i.w, h / i.h);
        w = i.w * f;
        h = i.h * f;
      }
      c.w = Math.max(8, Math.round(w));
      c.h = Math.max(8, Math.round(h));
      if (sx < 0 && a.alca !== 's') c.x = Math.round(i.x + i.w - c.w);
      if (sy < 0 && a.alca !== 'e') c.y = Math.round(i.y + i.h - c.h);
    }

    // ---------------- teclado
    el.addEventListener('keydown', ev => {
      const alvo = ev.target;
      if (alvo && ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName)) return;
      const ctrl = ev.ctrlKey || ev.metaKey;
      if (ctrl && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        return ev.shiftKey ? refazer() : desfazer();
      }
      if (ctrl && ev.key.toLowerCase() === 'y') {
        ev.preventDefault();
        return refazer();
      }
      const c = camada(E.sel);
      if (!c) return;
      if (ctrl && ev.key.toLowerCase() === 'd') {
        ev.preventDefault();
        return acao('duplicar');
      }
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        ev.preventDefault();
        return acao('apagar');
      }
      const passo = ev.shiftKey ? 10 : 1;
      const mov = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[ev.key];
      if (mov && !c.travada) {
        ev.preventDefault();
        marcar();
        c.x += mov[0];
        c.y += mov[1];
        redesenhar();
        painelValores();
      }
    });

    // ---------------- lista de camadas
    const icone = { foto: '🖼️', texto: '🔤', retangulo: '▭', degrade: '🌗', logo: '⭐' };
    function listaCamadas() {
      const box = $('#cpCamadas');
      if (!E.doc) return (box.innerHTML = '');
      box.innerHTML = [...E.doc.camadas].reverse().map(c => `
        <div class="cp-camada ${E.sel === c.id ? 'sel' : ''}" data-cam="${esc(c.id)}">
          <button class="cp-nome" data-cp="sel" data-id="${esc(c.id)}">${icone[c.tipo]} ${esc(c.nome || c.tipo)}${c.tipo === 'texto' ? ` <span class="caption">${esc(String(c.texto).slice(0, 18))}</span>` : ''}</button>
          <span class="cp-mini">
            <button data-cp="subir" data-id="${esc(c.id)}" title="Trazer para frente">▲</button>
            <button data-cp="descer" data-id="${esc(c.id)}" title="Levar para trás">▼</button>
            <button data-cp="ver" data-id="${esc(c.id)}" title="Mostrar/ocultar">${c.visivel ? '👁' : '◌'}</button>
            <button data-cp="travar" data-id="${esc(c.id)}" title="Travar">${c.travada ? '🔒' : '🔓'}</button>
          </span>
        </div>`).join('');
    }

    // ---------------- painel de propriedades
    const num = (k, rot, v, min, max, passo = 1) => `<label class="cp-num"><span>${rot}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${passo}" value="${v}"><input type="number" data-k="${k}" min="${min}" max="${max}" step="${passo}" value="${Math.round(v * 100) / 100}"></label>`;
    const corCampo = (k, rot, v) => `<div class="cp-cor"><span>${rot}</span><button class="cp-amostra" data-cp="roda" data-k="${k}" style="--c:${esc(hexRgba(v))}" title="${esc(v)}"></button><input type="text" data-k="${k}" value="${esc(v)}" maxlength="9" spellcheck="false"></div>${E.rodaPara === k ? rodaHtml(v) : ''}`;
    const chk = (k, rot, v) => `<label class="cp-chk"><input type="checkbox" data-k="${k}" ${v ? 'checked' : ''}> ${rot}</label>`;
    function rodaHtml(v) {
      const paleta = [...new Set([...(E.doc.paleta || []), ...PALETA_PADRAO, ...E.recentes])].slice(0, 20);
      return `<div class="cp-roda"><canvas width="220" height="220" data-roda="hs"></canvas>
        <label class="cp-num"><span>Brilho</span><input type="range" data-roda="v" min="0" max="100" value="${Math.round(hexParaHsv(v).v * 100)}"></label>
        <label class="cp-num"><span>Transparência</span><input type="range" data-roda="a" min="0" max="100" value="${Math.round(hexParaHsv(v).a * 100)}"></label>
        <div class="cp-paleta">${paleta.map(p => `<button data-cp="paleta" data-c="${esc(p)}" style="--c:${esc(hexRgba(p))}" title="${esc(p)}"></button>`).join('')}</div>
        <div class="row tight">${'EyeDropper' in window ? '<button class="btn-ghost" data-cp="contaGotas">Conta-gotas</button>' : ''}<button class="btn-ghost" data-cp="addPaleta">Guardar na paleta</button><button class="btn-ghost" data-cp="fecharRoda">Pronto</button></div></div>`;
    }
    function painel() {
      const box = $('#cpProps');
      const c = camada(E.sel);
      if (!c) {
        box.innerHTML = `<span class="label">Arte</span>${E.doc ? corCampo('doc.fundo', 'Cor de fundo', E.doc.fundo) : ''}<p class="caption">Clique numa camada da arte ou da lista para editar. Dica: os textos com {nome}, {preco}, {bairro}… trocam sozinhos quando você muda o imóvel.</p>`;
        desenharRoda();
        return;
      }
      const comum = `
        <div class="row between"><span class="label">${icone[c.tipo]} ${esc(c.nome || c.tipo)}</span><span class="row tight"><button class="btn-ghost" data-cp="duplicar">Duplicar</button><button class="btn-ghost danger" data-cp="apagar">Apagar</button></span></div>
        <label class="field"><span>Nome da camada</span><input type="text" data-k="nome" value="${esc(c.nome)}" maxlength="40"></label>
        <div class="cp-alinha">${[['esq', '⇤'], ['ch', '↔'], ['dir', '⇥'], ['topo', '⤒'], ['cv', '↕'], ['base', '⤓']].map(([k, t]) => `<button class="btn-ghost" data-cp="alinhar" data-a="${k}" title="Alinhar na arte">${t}</button>`).join('')}</div>
        <div class="cp-grade">${num('x', 'X', c.x, -2000, 3000)}${num('y', 'Y', c.y, -2000, 3000)}${c.tipo !== 'texto' ? num('w', 'Largura', c.w, 8, 3000) + num('h', 'Altura', c.h, 8, 4000) : num('w', 'Largura da caixa', c.w, 40, 3000)}</div>
        ${num('rot', 'Girar (°)', c.rot, -180, 180)}${num('opacidade', 'Opacidade', c.opacidade, 0, 1, 0.01)}`;
      let esp = '';
      if (c.tipo === 'texto') {
        esp = `
          <label class="field"><span>Texto</span><textarea data-k="texto" rows="3">${esc(c.texto)}</textarea></label>
          <div class="cp-vars">${VARS.map(([v, r]) => `<button class="tag" data-cp="var" data-v="${v}" title="${r}">${v}</button>`).join('')}</div>
          <div class="cp-fonte"><span class="label">Fonte: <b style="font-family:'${esc(c.fonte)}'">${esc(c.fonte)}</b></span>
            <div class="row tight"><input type="search" data-cpf="busca" placeholder="Buscar entre ${FONTES ? FONTES.length : '1.800+'} fontes do Google…" value="${esc(E.fonteBusca)}"><select data-cpf="cat"><option value="">Todas</option>${Object.entries(CAT).map(([k, v]) => `<option value="${k}" ${E.fonteCat === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
            <div class="cp-fontes" id="cpFontes"></div></div>
          <div class="cp-grade"><label class="field"><span>Peso</span><select data-k="peso">${pesosDe(c.fonte).map(w => `<option value="${w}" ${w === c.peso ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
            <label class="field"><span>Alinhamento</span><select data-k="alinhamento">${[['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita']].map(([v, t]) => `<option value="${v}" ${c.alinhamento === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
          ${num('tamanho', 'Tamanho', c.tamanho, 6, 400)}
          ${corCampo('cor', 'Cor do texto', c.cor)}
          <div class="cp-escala card-in"><span class="label">Escala das letras</span>
            ${chk('__uniforme', 'Escala uniforme (mantém a proporção)', E.uniforme)}
            ${num('escalaX', '↔ Horizontal', c.escalaX, 0.1, 4, 0.01)}${num('escalaY', '↕ Vertical', c.escalaY, 0.1, 4, 0.01)}
            <p class="caption">Uniforme: puxar o canto aumenta a letra inteira. Desligado: o canto estica separado na horizontal e na vertical. A alça da direita estica só na horizontal e a de baixo só na vertical. Segure Shift para inverter.</p></div>
          ${num('espacamento', 'Espaço entre letras', c.espacamento, -10, 60, 0.5)}${num('entrelinha', 'Altura da linha', c.entrelinha, 0.6, 2.5, 0.05)}
          <label class="field"><span>Quando o texto cresce</span><select data-k="ancora"><option value="topo" ${c.ancora !== 'base' ? 'selected' : ''}>Cresce para baixo</option><option value="base" ${c.ancora === 'base' ? 'selected' : ''}>Cresce para cima (ancorado embaixo)</option></select></label>
          <div class="row tight">${chk('italico', 'Itálico', c.italico)}${chk('maiusculas', 'MAIÚSCULAS', c.maiusculas)}${chk('fundo', 'Fundo (etiqueta)', c.fundo)}</div>
          ${c.fundo ? corCampo('corFundo', 'Cor do fundo', c.corFundo) + num('raioFundo', 'Arredondar fundo', c.raioFundo, 0, 200) + num('folga', 'Folga interna', c.folga, 0, 120) : ''}
          ${num('sombra', 'Sombra', c.sombra, 0, 60)}${c.sombra ? corCampo('corSombra', 'Cor da sombra', c.corSombra) : ''}
          ${num('contorno', 'Contorno', c.contorno, 0, 30)}${c.contorno ? corCampo('corContorno', 'Cor do contorno', c.corContorno) : ''}`;
      } else if (c.tipo === 'foto') {
        const fotos = fotosDe(E.prop);
        esp = `
          ${fotos.length > 1 ? `<span class="label">Qual foto</span><div class="cp-fotos">${fotos.slice(0, 12).map((f, i) => `<button data-cp="foto" data-i="${i}" class="${i === c.indiceFoto ? 'sel' : ''}"><img src="${esc(fotoUrl(f))}" alt=""></button>`).join('')}</div>` : ''}
          ${chk('__enquadrar', 'Arrastar move a foto dentro do quadro (ou segure Alt)', E.enquadrar)}
          ${num('zoom', 'Zoom', c.zoom, 1, 4, 0.01)}${num('offX', 'Enquadrar ↔', c.offX, -1, 1, 0.01)}${num('offY', 'Enquadrar ↕', c.offY, -1, 1, 0.01)}
          ${num('brilho', 'Brilho', c.brilho, 0, 200)}${num('contraste', 'Contraste', c.contraste, 0, 200)}${num('saturacao', 'Saturação', c.saturacao, 0, 200)}${num('desfoque', 'Desfoque', c.desfoque, 0, 30)}${num('raio', 'Arredondar cantos', c.raio, 0, 600)}`;
      } else if (c.tipo === 'retangulo') {
        esp = `${corCampo('cor', 'Cor', c.cor)}${num('raio', 'Arredondar', c.raio, 0, 1000)}${num('borda', 'Borda', c.borda, 0, 60)}${c.borda ? corCampo('corBorda', 'Cor da borda', c.corBorda) : ''}`;
      } else if (c.tipo === 'degrade') {
        esp = `${corCampo('cor1', 'Cor inicial', c.cor1)}${corCampo('cor2', 'Cor final', c.cor2)}${num('angulo', 'Direção (°)', c.angulo, 0, 360)}`;
      }
      box.innerHTML = comum + esp;
      if (c.tipo === 'texto') listarFontes();
      desenharRoda();
    }
    /** só atualiza os números (durante o arraste não refaz o painel inteiro) */
    function painelValores() {
      const c = camada(E.sel);
      if (!c) return;
      el.querySelectorAll('#cpProps [data-k]').forEach(i => {
        const k = i.dataset.k;
        if (k in c && (i.type === 'range' || i.type === 'number') && document.activeElement !== i) i.value = i.type === 'number' ? Math.round(c[k] * 100) / 100 : c[k];
      });
    }
    async function listarFontes() {
      const box = $('#cpFontes');
      if (!box) return;
      const todas = await listaFontes();
      const q = E.fonteBusca.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const achadas = todas.filter(f => (!E.fonteCat || f[1] === E.fonteCat) && (!q || f[0].toLowerCase().includes(q))).slice(0, 40);
      achadas.forEach(f => previaFonte(f[0]));
      const atual = camada(E.sel);
      box.innerHTML = achadas.length ? achadas.map(f => `<button data-cp="fonte" data-f="${esc(f[0])}" class="${atual && atual.fonte === f[0] ? 'sel' : ''}" style="font-family:'${esc(f[0])}',sans-serif">${esc(f[0])}</button>`).join('') : '<p class="caption">Nenhuma fonte com esse nome.</p>';
    }

    // ---------------- roda de cores (hue x saturação)
    function desenharRoda() {
      const rc = el.querySelector('canvas[data-roda=hs]');
      if (!rc) return;
      const k = E.rodaPara;
      const v = valorDe(k);
      const hsv = hexParaHsv(v);
      const x = rc.getContext('2d');
      const R = rc.width / 2;
      const img = x.createImageData(rc.width, rc.height);
      for (let py = 0; py < rc.height; py++) {
        for (let px = 0; px < rc.width; px++) {
          const dx = px - R;
          const dy = py - R;
          const d = Math.hypot(dx, dy);
          const i = (py * rc.width + px) * 4;
          if (d > R) {
            img.data[i + 3] = 0;
            continue;
          }
          const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
          const hx = hsvParaHex({ h, s: d / R, v: hsv.v, a: 1 });
          const n = parseInt(hx.slice(1, 7), 16);
          img.data[i] = n >> 16;
          img.data[i + 1] = (n >> 8) & 255;
          img.data[i + 2] = n & 255;
          img.data[i + 3] = 255;
        }
      }
      x.putImageData(img, 0, 0);
      const a = (hsv.h * Math.PI) / 180;
      x.strokeStyle = hsv.v > 0.5 ? '#000' : '#fff';
      x.lineWidth = 2;
      x.beginPath();
      x.arc(R + Math.cos(a) * hsv.s * R, R + Math.sin(a) * hsv.s * R, 7, 0, Math.PI * 2);
      x.stroke();
      const escolher = ev => {
        const r = rc.getBoundingClientRect();
        const dx = ((ev.clientX - r.left) / r.width) * rc.width - R;
        const dy = ((ev.clientY - r.top) / r.height) * rc.height - R;
        const atual = hexParaHsv(valorDe(k));
        aplicarCor(k, hsvParaHex({ h: ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360, s: clamp(Math.hypot(dx, dy) / R, 0, 1), v: atual.v || 1, a: atual.a }), false);
      };
      rc.onpointerdown = ev => {
        marcar();
        rc.setPointerCapture(ev.pointerId);
        escolher(ev);
        rc.onpointermove = escolher;
      };
      rc.onpointerup = () => {
        rc.onpointermove = null;
        painel();
      };
    }
    function valorDe(k) {
      if (!k) return '#ffffff';
      if (k === 'doc.fundo') return E.doc.fundo;
      const c = camada(E.sel);
      return c ? c[k] : '#ffffff';
    }
    function aplicarCor(k, hex, refazPainel = true) {
      if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) return;
      if (k === 'doc.fundo') E.doc.fundo = hex;
      else {
        const c = camada(E.sel);
        if (c) c[k] = hex;
      }
      E.recentes = [hex, ...E.recentes.filter(x => x !== hex)].slice(0, 8);
      redesenhar();
      if (refazPainel) painel();
      else {
        const amostra = el.querySelector(`.cp-amostra[data-k="${k}"]`);
        if (amostra) amostra.style.setProperty('--c', hexRgba(hex));
        const txt = el.querySelector(`.cp-cor input[data-k="${k}"]`);
        if (txt) txt.value = hex;
        desenharRoda();
      }
    }

    // ---------------- mudanças nos campos
    el.addEventListener('input', ev => {
      const t = ev.target;
      if (t.dataset.cpf === 'busca') {
        E.fonteBusca = t.value;
        return listarFontes();
      }
      if (t.dataset.roda === 'v' || t.dataset.roda === 'a') {
        const hsv = hexParaHsv(valorDe(E.rodaPara));
        hsv[t.dataset.roda] = Number(t.value) / 100;
        return aplicarCor(E.rodaPara, hsvParaHex(hsv), false);
      }
      const k = t.dataset.k;
      if (!k || t.type === 'checkbox' || t.tagName === 'SELECT') return;
      if (k === 'doc.fundo' || (t.closest('.cp-cor') && t.type === 'text')) {
        if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(t.value)) aplicarCor(k, t.value.toLowerCase(), false);
        return;
      }
      const c = camada(E.sel);
      if (!c) return;
      if (!t._marcado) {
        marcar();
        t._marcado = true;
      }
      if (k === 'texto' || k === 'nome') c[k] = t.value;
      else {
        const v = Number(t.value);
        if (!Number.isFinite(v)) return;
        c[k] = v;
        const par = el.querySelectorAll(`#cpProps [data-k="${k}"]`);
        par.forEach(o => o !== t && (o.value = v));
        if (k === 'escalaX' && E.uniforme && c.tipo === 'texto') {
          c.escalaY = v;
          el.querySelectorAll('#cpProps [data-k="escalaY"]').forEach(o => (o.value = v));
        } else if (k === 'escalaY' && E.uniforme && c.tipo === 'texto') {
          c.escalaX = v;
          el.querySelectorAll('#cpProps [data-k="escalaX"]').forEach(o => (o.value = v));
        }
      }
      redesenhar();
      if (k === 'nome' || k === 'texto') listaCamadas();
    });
    el.addEventListener('change', async ev => {
      const t = ev.target;
      if (t.name === 'cpImovel') {
        E.prop = inventario().find(p => String(p.id) === t.value) || null;
        return atualizarRecursos();
      }
      if (t.name === 'cpModelo') return abrirModelo(t.value, $('[name=cpTam]').value);
      if (t.name === 'cpTam') {
        if (E.modeloId) {
          marcar();
          const [W0, H0] = TAM[E.doc.tamanho];
          const [W1, H1] = TAM[t.value];
          for (const c of E.doc.camadas) {
            c.x = Math.round((c.x / W0) * W1);
            c.y = Math.round((c.y / H0) * H1);
            if (c.tipo !== 'texto') {
              c.w = Math.round((c.w / W0) * W1);
              c.h = Math.round((c.h / H0) * H1);
            }
          }
          E.doc.tamanho = t.value;
          return atualizarRecursos();
        }
        return abrirModelo($('[name=cpModelo]').value, t.value);
      }
      if (t.name === 'cpLogo' && t.files[0]) return adicionarLogo(t.files[0], t);
      if (t.dataset.cpf === 'cat') {
        E.fonteCat = t.value;
        return listarFontes();
      }
      if (t.dataset.k) t._marcado = false;
      const k = t.dataset.k;
      if (k === '__uniforme') {
        E.uniforme = t.checked;
        return;
      }
      if (k === '__enquadrar') {
        E.enquadrar = t.checked;
        return;
      }
      const c = camada(E.sel);
      if (!c || !k) return;
      if (t.type === 'checkbox') {
        marcar();
        c[k] = t.checked;
        if (k === 'italico') await carregarFonte(c.fonte, c.peso, c.italico);
        redesenhar();
        return painel();
      }
      if (t.tagName === 'SELECT') {
        marcar();
        c[k] = k === 'peso' ? Number(t.value) : t.value;
        if (k === 'peso') await carregarFonte(c.fonte, c.peso, c.italico);
        redesenhar();
      }
    });

    async function adicionarLogo(arquivo, input) {
      input.value = '';
      if (arquivo.size > 280 * 1024) return toast('Logo muito grande: use uma imagem de até 280 KB (PNG com fundo transparente fica melhor).', true);
      const src = await new Promise(res => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.readAsDataURL(arquivo);
      });
      const img = await carregarImagem(src);
      if (!img) return toast('Não consegui abrir esse arquivo.', true);
      marcar();
      const w = 260;
      const h = Math.round((img.naturalHeight / img.naturalWidth) * w);
      const c = { id: uid(), tipo: 'logo', nome: 'Logo', x: 60, y: 60, w, h, rot: 0, opacidade: 1, visivel: true, travada: false, src };
      E.doc.camadas.push(c);
      E.sel = c.id;
      E.R.logos[c.id] = img;
      tudo();
    }

    // ---------------- ações (botões)
    function alinhar(c, a) {
      const W = canvas.width;
      const H = canvas.height;
      if (a === 'esq') c.x = 0;
      if (a === 'ch') c.x = Math.round(W / 2 - c.w / 2);
      if (a === 'dir') c.x = W - c.w;
      if (a === 'topo') c.y = 0;
      if (a === 'cv') c.y = Math.round(H / 2 - c.h / 2);
      if (a === 'base') c.y = H - c.h;
    }
    async function acao(nome, d = {}) {
      const c = camada(E.sel);
      const W = canvas.width;
      const H = canvas.height;
      const add = nova => {
        marcar();
        E.doc.camadas.push(nova);
        E.sel = nova.id;
        tudo();
      };
      switch (nome) {
        case 'desfazer':
          return desfazer();
        case 'refazer':
          return refazer();
        case 'sel':
          E.sel = d.id;
          return tudo();
        case 'addTexto':
          await carregarFonte('Inter', 700);
          return add({ ...modeloPronto('classico', E.doc.tamanho).camadas.find(x => x.nome === 'Nome'), id: uid(), nome: 'Texto', texto: 'Seu texto aqui', fonte: 'Inter', y: Math.round(H / 2 - 50) });
        case 'addRet':
          return add({ id: uid(), tipo: 'retangulo', nome: 'Forma', x: W / 2 - 200, y: H / 2 - 100, w: 400, h: 200, rot: 0, opacidade: 1, visivel: true, travada: false, cor: '#5266eb', raio: 24, borda: 0, corBorda: '#ffffff' });
        case 'addDeg':
          return add({ id: uid(), tipo: 'degrade', nome: 'Degradê', x: 0, y: Math.round(H / 2), w: W, h: Math.round(H / 2), rot: 0, opacidade: 1, visivel: true, travada: false, cor1: '#00000000', cor2: '#000000cc', angulo: 180 });
        case 'addFoto':
          return add({ ...modeloPronto('classico', E.doc.tamanho).camadas[0], id: uid(), nome: 'Foto 2', x: W / 2 - 250, y: H / 2 - 250, w: 500, h: 500, raio: 24, indiceFoto: Math.min(1, Math.max(0, fotosDe(E.prop).length - 1)) });
        case 'duplicar':
          if (!c) return;
          return add({ ...copia(c), id: uid(), nome: `${c.nome} (cópia)`, x: c.x + 30, y: c.y + 30 });
        case 'apagar':
          if (!c) return;
          marcar();
          E.doc.camadas = E.doc.camadas.filter(x => x.id !== c.id);
          E.sel = null;
          return tudo();
        case 'subir':
        case 'descer': {
          const i = E.doc.camadas.findIndex(x => x.id === d.id);
          const j = nome === 'subir' ? i + 1 : i - 1;
          if (i < 0 || j < 0 || j >= E.doc.camadas.length) return;
          marcar();
          [E.doc.camadas[i], E.doc.camadas[j]] = [E.doc.camadas[j], E.doc.camadas[i]];
          return tudo();
        }
        case 'ver':
        case 'travar': {
          const x = camada(d.id);
          if (!x) return;
          marcar();
          if (nome === 'ver') x.visivel = !x.visivel;
          else x.travada = !x.travada;
          return tudo();
        }
        case 'alinhar':
          if (!c) return;
          marcar();
          alinhar(c, d.a);
          return tudo();
        case 'var': {
          const ta = $('#cpProps textarea[data-k=texto]');
          if (!c || !ta) return;
          marcar();
          const ini = ta.selectionStart ?? ta.value.length;
          c.texto = ta.value.slice(0, ini) + d.v + ta.value.slice(ta.selectionEnd ?? ini);
          return tudo();
        }
        case 'fonte':
          if (!c) return;
          marcar();
          c.fonte = d.f;
          await listaFontes();
          if (!pesosDe(c.fonte).includes(c.peso)) c.peso = pesosDe(c.fonte).reduce((a, b) => (Math.abs(b - c.peso) < Math.abs(a - c.peso) ? b : a));
          await carregarFonte(c.fonte, c.peso, c.italico);
          return tudo();
        case 'foto':
          if (!c) return;
          marcar();
          c.indiceFoto = Number(d.i) || 0;
          return tudo();
        case 'roda':
          E.rodaPara = E.rodaPara === d.k ? null : d.k;
          return painel();
        case 'fecharRoda':
          E.rodaPara = null;
          return painel();
        case 'paleta':
          marcar();
          return aplicarCor(E.rodaPara, d.c);
        case 'addPaleta': {
          const v = valorDe(E.rodaPara);
          E.doc.paleta = [...new Set([v, ...(E.doc.paleta || [])])].slice(0, 12);
          toast('Cor guardada na paleta deste modelo.');
          return painel();
        }
        case 'contaGotas':
          try {
            const r = await new window.EyeDropper().open();
            marcar();
            return aplicarCor(E.rodaPara, r.sRGBHex.toLowerCase());
          } catch {
            return;
          }
        case 'baixar':
          return baixar(canvas, nomeArquivo(E.prop));
        case 'vitrine':
          return usarNaVitrine(canvas, E.prop);
        case 'salvarModelo':
        case 'salvarComo':
          return salvarModelo(nome === 'salvarComo' || !E.modeloId);
        case 'lote':
          return abrirLote();
        case 'loteGerar':
          return gerarLote();
        case 'loteFechar':
          E.lote = null;
          $('#cpLote').innerHTML = '';
          return;
        case 'loteTodos':
          el.querySelectorAll('#cpLote input[name=loteImovel]').forEach(i => (i.checked = true));
          return;
        case 'loteBaixar':
          return loteBaixar(d.id);
        case 'loteVitrine':
          return loteVitrine(d.id);
        case 'loteBaixarTodas':
          for (const it of E.lote?.itens || []) {
            await loteBaixar(it.id);
            await new Promise(r => setTimeout(r, 400));
          }
          return;
        case 'loteVitrineTodas':
          for (const it of E.lote?.itens || []) await loteVitrine(it.id);
          return toast('Capas enviadas para a Vitrine (cada post volta para "pendente" até você aprovar).');
      }
    }
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-cp]');
      if (!b || !el.contains(b)) return;
      ev.preventDefault();
      acao(b.dataset.cp, { ...b.dataset }).catch(err => toast(err.message, true));
    });

    // ---------------- exportar / vitrine / modelos
    const nomeArquivo = p => `capa-${p ? String(p.id).replace(/[^\w-]/g, '') : 'biga'}.jpg`;
    function blobDe(cv) {
      return new Promise((res, rej) => {
        try {
          cv.toBlob(b => (b ? res(b) : rej(new Error('Não consegui gerar a imagem.'))), 'image/jpeg', 0.92);
        } catch {
          rej(new Error('A foto vem de outro site e o navegador bloqueou a exportação. Envie a foto para a Carteira (upload) e tente de novo.'));
        }
      });
    }
    async function baixar(cv, nome) {
      if (cv === canvas) desenhar(g, E.doc, E.R, null); // sem a seleção azul
      const b = await blobDe(cv);
      if (cv === canvas) redesenhar();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    async function usarNaVitrine(cv, p) {
      if (!p) return toast('Escolha um imóvel primeiro.', true);
      if (cv === canvas) desenhar(g, E.doc, E.R, null);
      const b = await blobDe(cv);
      if (cv === canvas) redesenhar();
      const fd = new FormData();
      fd.append('photos', b, nomeArquivo(p));
      const up = await api('POST', '/api/upload-photos', fd, true);
      await api('POST', `/api/vitrine/post/${encodeURIComponent(p.id)}`, { foto: up.files[0] });
      toast(`Capa do #${p.id} virou a foto do post da Vitrine (aprove o post para ele sair).`);
    }
    async function salvarModelo(comoNovo) {
      const nome = comoNovo ? prompt('Nome do modelo:', E.nomeModelo && !E.modeloId ? `${E.nomeModelo} (meu)` : E.nomeModelo || 'Meu modelo') : E.nomeModelo;
      if (!nome) return;
      const r = await api('POST', '/api/capas/modelos', { id: comoNovo ? undefined : E.modeloId, nome, tamanho: E.doc.tamanho, fundo: E.doc.fundo, camadas: E.doc.camadas, paleta: E.doc.paleta || [] });
      ctx.setModelos(r);
      E.modeloId = r.modelo.id;
      E.nomeModelo = r.modelo.nome;
      preencherSelects();
      toast(`Modelo "${r.modelo.nome}" salvo. Use "Aplicar em outros imóveis" para gerar as capas de toda a carteira.`);
    }

    // ---------------- aplicar o modelo em vários imóveis
    function abrirLote() {
      const lista = comFoto();
      E.lote = { itens: [] };
      $('#cpLote').innerHTML = `<div class="card stack-sm cp-lote">
        <div class="row between"><span class="label">Aplicar "${esc(E.nomeModelo || 'este modelo')}" em outros imóveis</span><button class="btn-ghost" data-cp="loteFechar">Fechar</button></div>
        <p class="caption">A BIGA troca só as informações (foto, nome, preço, bairro…) e mantém o seu design.</p>
        ${lista.length ? `<div class="chips scroll">${lista.map(p => `<label class="cp-chk"><input type="checkbox" name="loteImovel" value="${esc(p.id)}" ${E.prop && String(E.prop.id) === String(p.id) ? '' : 'checked'}> #${esc(p.id)} ${esc(p.tipo)} · ${esc(p.setor || '')}</label>`).join('')}</div>
        <div class="row tight"><button class="btn-ghost" data-cp="loteTodos">Marcar todos</button><button class="btn-primary" data-cp="loteGerar">Gerar capas</button></div>` : '<p class="body ash">Nenhum imóvel ativo com foto.</p>'}
        <div class="cp-lote-grade" id="cpLoteGrade"></div></div>`;
      $('#cpLote').scrollIntoView({ behavior: 'smooth' });
    }
    async function gerarLote() {
      const ids = [...el.querySelectorAll('#cpLote input[name=loteImovel]:checked')].map(i => i.value);
      if (!ids.length) return toast('Marque pelo menos um imóvel.', true);
      const grade = $('#cpLoteGrade');
      grade.innerHTML = '<p class="caption">Gerando…</p>';
      E.lote.itens = [];
      const [W, H] = TAM[E.doc.tamanho];
      for (const idp of ids) {
        const p = inventario().find(x => String(x.id) === idp);
        if (!p) continue;
        const cv = document.createElement('canvas');
        cv.width = W;
        cv.height = H;
        const doc = copia(E.doc);
        for (const c of doc.camadas) if (c.tipo === 'foto' && c.indiceFoto >= fotosDe(p).length) c.indiceFoto = 0;
        const R = await recursos(doc, p, fotoUrl);
        desenhar(cv.getContext('2d'), doc, R, null);
        E.lote.itens.push({ id: p.id, p, cv });
      }
      grade.innerHTML = E.lote.itens.map(it => `<figure class="cp-lote-item"><img alt="Capa do imóvel #${esc(it.id)}" data-lote-img="${esc(it.id)}"><figcaption>#${esc(it.id)} ${esc(it.p.setor || '')}<span class="row tight"><button class="btn-ghost" data-cp="loteBaixar" data-id="${esc(it.id)}">Baixar</button><button class="btn-ghost accent" data-cp="loteVitrine" data-id="${esc(it.id)}">Vitrine</button></span></figcaption></figure>`).join('') + (E.lote.itens.length > 1 ? `<div class="row tight cp-lote-todas"><button class="btn-ghost" data-cp="loteBaixarTodas">Baixar todas</button><button class="btn-primary" data-cp="loteVitrineTodas">Usar todas na Vitrine</button></div>` : '');
      for (const it of E.lote.itens) {
        const img = grade.querySelector(`[data-lote-img="${CSS.escape(String(it.id))}"]`);
        try {
          if (img) img.src = it.cv.toDataURL('image/jpeg', 0.6);
        } catch {
          if (img) img.alt = 'Prévia bloqueada (foto de outro site)';
        }
      }
    }
    const itemLote = idp => (E.lote?.itens || []).find(x => String(x.id) === String(idp));
    async function loteBaixar(idp) {
      const it = itemLote(idp);
      if (it) await baixar(it.cv, nomeArquivo(it.p));
    }
    async function loteVitrine(idp) {
      const it = itemLote(idp);
      if (it) await usarNaVitrine(it.cv, it.p);
    }

    // ---------------- início
    (async () => {
      await Promise.all([listaFontes(), carregarFonte('Inter', 700), carregarFonte('Playfair Display', 700), carregarFonte('Montserrat', 800)]);
      const inv = inventario();
      E.prop = comFoto()[0] || inv[0] || null;
      const m = ctx.modelos();
      await abrirModelo(m.padrao ? `meu:${m.padrao}` : 'pronto:classico', 'feed');
      canvas.focus({ preventScroll: true });
    })().catch(err => toast(err.message, true));
  }

  window.BIGA_CAPAS = { montar, modeloPronto, variaveis, trocar, hexParaHsv, hsvParaHex, TAM };
})();
