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

  function shell(inner) {
    const rotaAtual = S.route === 'geral' ? 'hoje' : S.route;
    const grupoAtual = grupoDe(rotaAtual);
    const st = S.status || {};
    const conn = st.connectionStatus === 'CONECTADO';
    const paused = st.config && st.config.pausado;
    stopSay();
    detachArt();
    root.innerHTML = `
      <nav class="nav"><div class="bar">
        <a class="logo" href="#inicio">${LOGO}</a>
        <div class="links groups">${GRUPOS.map(([g, ic, nome]) => `<a href="#${paginasDo(g)[0][0]}" class="${grupoAtual === g ? 'active' : ''}"><span aria-hidden="true">${ic}</span> ${nome}</a>`).join('')}</div>
        <span class="status-dot"><span class="dot ${paused ? 'warn' : conn ? 'on' : ''}"></span>${paused ? 'Pausada' : conn ? 'Online' : st.connectionStatus === 'AGUARDANDO_QR_CODE' ? 'Ler QR' : 'Offline'}</span>
      </div>
      ${grupoAtual ? `<div class="subnav">${paginasDo(grupoAtual).map(([k, l, d, , ic]) => `<a href="#${k}" title="${esc(d)}" class="${rotaAtual === k ? 'active' : ''}"><span aria-hidden="true">${ic}</span> ${l}</a>`).join('')}</div>` : ''}</nav>
      <main class="page-enter">
        <div class="container crumbs"><a href="#inicio">Início</a> › ${esc((GRUPOS.find(x => x[0] === grupoAtual) || [])[2] || '')} › <b>${esc(rotaDe(rotaAtual)[1])}</b></div>
        ${inner}</main>
      <div class="space-60"></div>`;
  }

  register({
    actions: {
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
    GRUPOS, ROUTES, SO_ADMIN, isAdmin, rotasVisiveis, rotaDe, grupoDe, paginasDo, stopSay, say, shell
  });
})();
