/* Componentes reutilizáveis, menu em grupos, fala da BIGA e casca das páginas */
(() => {
  'use strict';

  const BIGA = window.BIGA;
  const { $, $$, esc, hasOwn, root, S, register } = BIGA;

  const ART = window.BIGA_ART;
  const LOGO = `<span class="mini">${ART.miniBiga()}</span><span>BIGA</span>`;
  let _detachArt = () => {};
  function detachArt() {
    _detachArt();
    _detachArt = () => {};
  }
  function attachArt(stage) {
    detachArt();
    _detachArt = ART.attach(stage);
  }

  // ------------------------------------------------------------------ componentes
  const toggle = (key, on, label, desc = '') =>
    `<button type="button" class="toggle" data-toggle="${esc(key)}" aria-pressed="${on ? 'true' : 'false'}"><span>${esc(label)}${desc ? `<span class="t-desc">${esc(desc)}</span>` : ''}</span></button>`;
  const field = (name, label, value, opts = {}) => {
    const v = value ?? '';
    if (opts.area) return `<label class="field ${opts.cls || ''}"><span>${esc(label)}</span><textarea name="${esc(name)}" rows="${opts.rows || 4}" placeholder="${esc(opts.ph || '')}">${esc(v)}</textarea></label>`;
    if (opts.options)
      return `<label class="field ${opts.cls || ''}"><span>${esc(label)}</span><select name="${esc(name)}">${opts.options.map(([val, txt]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(txt)}</option>`).join('')}</select></label>`;
    return `<label class="field ${opts.cls || ''}"><span>${esc(label)}</span><input name="${esc(name)}" type="${opts.type || 'text'}" value="${esc(v)}" placeholder="${esc(opts.ph || (opts.type === 'number' ? '—' : ''))}" ${opts.attrs || ''}></label>`;
  };
  const header = (titulo, rotulo, texto) =>
    `<section class="page-head"><div class="container split"><h1 class="display reveal">${titulo}</h1><div class="intro reveal"><span class="label">${esc(rotulo)}</span><p class="body-lg muted">${texto}</p></div></div></section>`;
  const DECISION_TAGS = { ENVIAR: '<span class="tag enviar">● enviado</span>', AVISAR: '<span class="tag avisar">● conferir</span>', SILENCIO: '<span class="tag">● sem imóvel</span>' };
  const decisionTag = d => (hasOwn(DECISION_TAGS, d) ? DECISION_TAGS[d] : `<span class="tag">${esc(d)}</span>`);

  // Busca nos grupos: filtra na própria tela (não perde o que você marcou)
  const groupSearch = (key, total) =>
    total ? `<div class="searchbar"><input type="search" name="filtroGrupo" data-target="${key}" placeholder="Buscar grupo pelo nome… (${total} grupos)" autocomplete="off"><button type="button" class="btn-ghost" data-action="soMarcados" data-target="${key}">Só os marcados</button><span class="caption" data-count-for="${key}"></span></div>` : '';

  function applyGroupFilter(key) {
    const box = document.querySelector(`[data-filter="${key}"]`);
    if (!box) return;
    const q = (document.querySelector(`input[name=filtroGrupo][data-target="${key}"]`)?.value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const only = box.dataset.only === '1';
    let shown = 0;
    let marked = 0;
    for (const t of box.querySelectorAll('.toggle')) {
      const on = t.getAttribute('aria-pressed') === 'true';
      if (on) marked++;
      const txt = t.textContent.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const vis = (!q || txt.includes(q)) && (!only || on);
      t.classList.toggle('hide', !vis);
      if (vis) shown++;
    }
    const c = document.querySelector(`[data-count-for="${key}"]`);
    if (c) c.textContent = `${marked} marcado(s) · mostrando ${shown}`;
  }

  function formData(scope) {
    const out = {};
    $$('input[name], textarea[name], select[name]', scope).forEach(el => (out[el.name] = el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value));
    $$('[data-toggle]', scope).forEach(el => (out[el.dataset.toggle] = el.getAttribute('aria-pressed') === 'true'));
    return out;
  }

  // ------------------------------------------------------------------ SHELL
  // Páginas agrupadas por assunto (navegação de 04/11: 4 grupos em vez de 12 abas soltas)
  const GRUPOS = [
    ['dia', '☀️', 'Meu dia', 'O que aconteceu hoje e quem falou comigo'],
    ['imoveis', '🏠', 'Imóveis', 'Carteira, divulgação e capas para o Instagram'],
    ['clientes', '🤝', 'Clientes', 'Achar imóvel para cliente e achar cliente para imóvel'],
    ['config', '⚙️', 'Configurar', 'Como eu penso, testes e ajustes']
  ];
  const ROUTES = [
    ['inicio', 'Início', 'Volte para a BIGA', '', '✨'],
    ['hoje', 'Hoje', 'Números do dia, QR Code e atividade', 'dia', '📊'],
    ['radar', 'Radar', 'Pedidos dos grupos e o que eu fiz com cada um', 'dia', '📡'],
    ['atendimento', 'Atendimento', '1ª mensagem, ligações e respostas rápidas', 'dia', '💬'],
    ['carteira', 'Carteira', 'Seus imóveis, fotos e cadastro', 'imoveis', '🗂️'],
    ['vitrine', 'Vitrine', 'Divulgação automática nos grupos', 'imoveis', '🪟'],
    ['capas', 'Capas', 'Editor de capas para o Instagram (beta)', 'imoveis', '🎨'],
    ['pdf', 'Fichas PDF', 'Apresentação do imóvel em PDF para baixar ou enviar', 'imoveis', '📄'],
    ['busca', 'Busca', 'Procuro o imóvel do seu cliente nos grupos e nos portais', 'clientes', '🔎'],
    ['garimpo', 'Garimpo', 'Clientes procurando imóvel na internet', 'clientes', '⛏️'],
    ['prospeccao', 'Prospecção', 'Mensagens para contatos escolhidos', 'clientes', '📣'],
    ['cerebro', 'Cérebro', 'Mapa de Goiânia e meu jeito de falar', 'config', '🧠'],
    ['simulador', 'Simulador', 'Teste um pedido antes de valer', 'config', '🧪'],
    ['ajustes', 'Ajustes', 'Grupos, alertas, backup e segurança', 'config', '🔧'],
    ['corretores', 'Corretores', 'Cadastro e WhatsApp dos corretores da sua equipe', 'config', '👥']
  ];
  // Páginas da estrutura do SaaS: só aparecem para o administrador
  const SO_ADMIN = new Set(['corretores']);
  const isAdmin = () => !S.status || S.status.papel !== 'corretor';
  const rotasVisiveis = () => ROUTES.filter(r => !SO_ADMIN.has(r[0]) || isAdmin());
  const rotaDe = k => rotasVisiveis().find(r => r[0] === k) || ROUTES[1];
  const grupoDe = k => rotaDe(k === 'geral' ? 'hoje' : k)[3];
  const paginasDo = g => rotasVisiveis().filter(r => r[3] === g);

  let sayTimer = null;
  let sayEndTimer = null;
  function stopSay() {
    clearInterval(sayTimer);
    clearTimeout(sayEndTimer);
  }
  function say(text) {
    const el = $('#say');
    const stage = $('#stage');
    stopSay();
    if (!el) return;
    const msg = String(text ?? '');
    let i = 0;
    el.textContent = '';
    if (stage) stage.classList.add('talking');
    sayTimer = setInterval(() => {
      el.textContent = msg.slice(0, ++i);
      if (i >= msg.length) {
        clearInterval(sayTimer);
        if (stage) sayEndTimer = setTimeout(() => stage.classList.remove('talking'), 300);
      }
    }, 22);
  }

  const tabIconSvg = kind => {
    const attrs = 'viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    if (kind === 'design') return `<svg ${attrs}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5"/><path d="M12 12v9"/><path d="M12 12L4 7.5"/></svg>`;
    if (kind === 'imoveis') return `<svg ${attrs}><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5z"/></svg>`;
    if (kind === 'clientes') return `<svg ${attrs}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
    return `<svg ${attrs}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`;
  };

  const hamburgerBtnHtml = () =>
    '<button type="button" class="nav-hamburger" data-action="abrirGavetaNav" aria-label="Abrir menu" aria-expanded="false">☰</button>';

  function fecharMenusMobile() {
    $('#bigaNavDrawerBackdrop')?.classList.add('hide');
    $('#bigaNavDrawer')?.classList.add('hide');
    $('#bigaDesignBackdrop')?.classList.add('hide');
    $('#bigaDesignSheet')?.classList.add('hide');
    $('.nav-hamburger')?.setAttribute('aria-expanded', 'false');
  }

  function renderMobileShellExtras(rotaAtual) {
    const isDesign = rotaAtual === 'capas' || rotaAtual === 'pdf';
    const isImoveis = ['carteira', 'vitrine'].includes(rotaAtual);
    const isClientes = ['radar', 'busca', 'garimpo', 'prospeccao'].includes(rotaAtual);
    const isInicio = rotaAtual === 'inicio';
    return `
      <div class="biga-sheet-backdrop hide" id="bigaNavDrawerBackdrop" data-action="fecharMenusMobile"></div>
      <aside class="biga-drawer hide" id="bigaNavDrawer" role="dialog" aria-modal="true" aria-label="Menu principal">
        <div class="biga-drawer-head">
          <a class="logo" href="#inicio" data-nav-close="1">${LOGO}</a>
          <button type="button" class="biga-drawer-close" data-action="fecharMenusMobile" aria-label="Fechar menu">✕</button>
        </div>
        <div class="biga-drawer-body">
          <a href="#inicio" class="biga-drawer-home ${isInicio ? 'active' : ''}" data-nav-close="1"><span aria-hidden="true">✨</span><span>Início · BIGA</span></a>
          ${GRUPOS.map(([g, ic, nome]) => `
            <div class="biga-drawer-group">
              <span class="biga-drawer-label"><span aria-hidden="true">${ic}</span> ${esc(nome)}</span>
              <div class="biga-drawer-links">
                ${paginasDo(g).map(([k, l, d, , pic]) => `<a href="#${k}" title="${esc(d)}" class="${rotaAtual === k ? 'active' : ''}" data-nav-close="1"><span aria-hidden="true">${pic}</span><span>${esc(l)}</span></a>`).join('')}
              </div>
            </div>`).join('')}
        </div>
      </aside>
      <div class="biga-sheet-backdrop hide" id="bigaDesignBackdrop" data-action="fecharMenusMobile"></div>
      <div class="biga-design-sheet hide" id="bigaDesignSheet" role="dialog" aria-modal="true" aria-label="Escolher editor">
        <div class="biga-sheet-handle"><span></span></div>
        <div class="biga-design-head">
          <b>Estúdio de Design</b>
          <button type="button" class="biga-drawer-close" data-action="fecharMenusMobile" aria-label="Fechar">✕</button>
        </div>
        <div class="biga-design-cards">
          <a class="biga-design-card ${rotaAtual === 'capas' ? 'active' : ''}" href="#capas" data-nav-close="1">
            <span class="biga-design-ic" aria-hidden="true">🎨</span>
            <span class="biga-design-txt"><b>Editor de Capas</b><span>Capas &amp; Carrossel 4:5, 1:1, 9:16 · 12 modelos</span></span>
          </a>
          <a class="biga-design-card ${rotaAtual === 'pdf' ? 'active' : ''}" href="#pdf" data-nav-close="1">
            <span class="biga-design-ic" aria-hidden="true">📄</span>
            <span class="biga-design-txt"><b>Editor de PDF 16:9</b><span>Apresentação vetorial 16:9 · 12 modelos</span></span>
          </a>
        </div>
      </div>
      <nav class="biga-tabbar" aria-label="Navegação rápida">
        <button type="button" class="biga-tab ${isDesign ? 'active' : ''}" data-action="abrirSeletorDesign">
          ${tabIconSvg('design')}<span>Design</span>
        </button>
        <a class="biga-tab ${isImoveis ? 'active' : ''}" href="#carteira">
          ${tabIconSvg('imoveis')}<span>Imóveis</span>
        </a>
        <a class="biga-tab ${isClientes ? 'active' : ''}" href="#radar">
          ${tabIconSvg('clientes')}<span>Clientes</span>
        </a>
        <a class="biga-tab ${isInicio ? 'active' : ''}" href="#inicio">
          ${tabIconSvg('menu')}<span>Menu</span>
        </a>
      </nav>`;
  }

  function shell(inner) {
    const rotaAtual = S.route === 'geral' ? 'hoje' : S.route;
    const grupoAtual = grupoDe(rotaAtual);
    const st = S.status || {};
    const conn = st.connectionStatus === 'CONECTADO';
    const paused = st.config && st.config.pausado;
    const paginasGrupo = grupoAtual ? paginasDo(grupoAtual) : [];
    const subMobile = grupoAtual === 'imoveis'
      ? paginasGrupo.filter(([k]) => k !== 'capas' && k !== 'pdf')
      : paginasGrupo;
    stopSay();
    detachArt();
    root.innerHTML = `
      <nav class="nav"><div class="bar">
        <a class="logo" href="#inicio">${LOGO}</a>
        <div class="links groups">${GRUPOS.map(([g, ic, nome]) => `<a href="#${paginasDo(g)[0][0]}" class="${grupoAtual === g ? 'active' : ''}"><span aria-hidden="true">${ic}</span> ${nome}</a>`).join('')}</div>
        <span class="status-dot"><span class="dot ${paused ? 'warn' : conn ? 'on' : ''}"></span>${paused ? 'Pausada' : conn ? 'Online' : st.connectionStatus === 'AGUARDANDO_QR_CODE' ? 'Ler QR' : 'Offline'}</span>
        ${hamburgerBtnHtml()}
      </div>
      ${grupoAtual ? `<div class="subnav">${paginasGrupo.map(([k, l, d, , ic]) => `<a href="#${k}" title="${esc(d)}" class="${rotaAtual === k ? 'active' : ''}"><span aria-hidden="true">${ic}</span> ${l}</a>`).join('')}</div>` : ''}</nav>
      <main class="page-enter">
        <div class="container crumbs"><a href="#inicio">Início</a> › ${esc((GRUPOS.find(x => x[0] === grupoAtual) || [])[2] || '')} › <b>${esc(rotaDe(rotaAtual)[1])}</b></div>
        ${subMobile.length > 1 ? `<div class="container mobile-subtabs">${subMobile.map(([k, l, , , ic]) => `<a href="#${k}" class="${rotaAtual === k ? 'active' : ''}"><span aria-hidden="true">${ic}</span> ${esc(l)}</a>`).join('')}</div>` : ''}
        ${inner}</main>
      <div class="space-60"></div>
      ${renderMobileShellExtras(rotaAtual)}`;
  }

  root.addEventListener('click', ev => {
    if (ev.target.closest('[data-nav-close]')) fecharMenusMobile();
  });

  register({
    actions: {
      abrirGavetaNav: () => {
        const abriu = $('#bigaNavDrawer')?.classList.contains('hide');
        fecharMenusMobile();
        if (abriu) {
          $('#bigaNavDrawerBackdrop')?.classList.remove('hide');
          $('#bigaNavDrawer')?.classList.remove('hide');
          $('.nav-hamburger')?.setAttribute('aria-expanded', 'true');
        }
      },
      abrirSeletorDesign: () => {
        const abriu = $('#bigaDesignSheet')?.classList.contains('hide');
        fecharMenusMobile();
        if (abriu) {
          $('#bigaDesignBackdrop')?.classList.remove('hide');
          $('#bigaDesignSheet')?.classList.remove('hide');
        }
      },
      fecharMenusMobile: () => fecharMenusMobile(),
      soMarcados: el => {
        const box = document.querySelector(`[data-filter="${CSS.escape(el.dataset.target || '')}"]`);
        if (!box) return;
        box.dataset.only = box.dataset.only === '1' ? '0' : '1';
        el.classList.toggle('accent', box.dataset.only === '1');
        el.textContent = box.dataset.only === '1' ? 'Mostrar todos' : 'Só os marcados';
        applyGroupFilter(el.dataset.target);
      }
    },
    onToggle: k => {
      if (k.startsWith('g:')) {
        applyGroupFilter('vit');
        return true;
      }
      if (k.startsWith('mg:')) {
        applyGroupFilter('mg');
        return true;
      }
      if (k.startsWith('bg:')) {
        applyGroupFilter('bg');
        return true;
      }
      return false;
    },
    onInput: e => {
      if (e.target.name === 'filtroGrupo') {
        applyGroupFilter(e.target.dataset.target);
        return true;
      }
      return false;
    }
  });

  Object.assign(BIGA, {
    ART, LOGO, detachArt, attachArt, toggle, field, header, decisionTag, groupSearch, applyGroupFilter, formData,
    GRUPOS, ROUTES, SO_ADMIN, isAdmin, rotasVisiveis, rotaDe, grupoDe, paginasDo, stopSay, say, shell,
    hamburgerBtnHtml, renderMobileShellExtras, fecharMenusMobile
  });
})();
