/* Painel da BIGA — Secretária Imobiliária — Roteador e delegação da SPA (CSP: script-src 'self') */
(() => {
  'use strict';

  const BIGA = window.BIGA;
  const {
    $, $$, root, S, api, toast, ambient, applyGroupFilter, loadStatus, SO_ADMIN, isAdmin, say,
    views, loaders, actions, toggleHooks, inputHooks, changeHooks, viewLogin, viewHome
  } = BIGA;

  // Desenha a página atual. Ao TROCAR de página (go) anima a entrada; nas atualizações da mesma
  // página não anima, mantém a rolagem e (manterCampos) o que estava sendo digitado.
  function render(opts = {}) {
    if (!S.authed) return viewLogin();
    const navegando = Boolean(S._navegando);
    const y = scrollY;
    const campos = opts.manterCampos ? capturarCampos() : null;
    root.classList.toggle('sem-anim', !navegando);
    (views.get(S.route) || viewHome)();
    if (campos) restaurarCampos(campos);
    afterRender(navegando);
    if (!navegando) scrollTo(0, y);
  }
  function capturarCampos() {
    const ativo = document.activeElement && document.activeElement.name;
    return { ativo, valores: $$('input[name]:not([type=file]):not([type=password]), textarea[name], select[name]', root).map(el => [el.name, el.closest('[id]')?.id || '', el.value]) };
  }
  function restaurarCampos({ ativo, valores }) {
    for (const [nome, caixa, valor] of valores) {
      const el = $$(`[name="${CSS.escape(nome)}"]`, root).find(x => (x.closest('[id]')?.id || '') === caixa);
      if (el && el.value !== valor) el.value = valor;
    }
    if (ativo) $(`[name="${CSS.escape(ativo)}"]`, root)?.focus({ preventScroll: true });
  }

  // Animações de entrada (cada bloco aparece ao entrar na tela) e contadores
  let io = null;
  function afterRender(animar = true) {
    if (io) io.disconnect();
    if (!animar) {
      // mesma página: tudo aparece na hora, números já no valor final
      $$('.reveal').forEach(el => el.classList.add('in'));
      $$('.stat .n[data-count]').forEach(el => (el.textContent = Number(el.dataset.count) || 0));
      ['vit', 'mg', 'bg'].forEach(applyGroupFilter);
      return;
    }
    io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }, { threshold: 0.08 });
    $$('.reveal').forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i, 6) * 60}ms`;
      io.observe(el);
    });
    // garantia: nada fica invisível se o observador não disparar (impressão, captura, navegador antigo)
    clearTimeout(S._revealFallback);
    S._revealFallback = setTimeout(() => $$('.reveal:not(.in)').forEach(el => el.classList.add('in')), 1200);
    $$('.stat .n[data-count]').forEach(el => {
      const target = Number(el.dataset.count) || 0;
      if (!target) return;
      const t0 = performance.now();
      const step = t => {
        const k = Math.min(1, (t - t0) / 900);
        el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    ['vit', 'mg', 'bg'].forEach(applyGroupFilter);
  }

  // Cortina circular entre páginas (sai do ponto do clique)
  let lastClick = { x: innerWidth / 2, y: innerHeight / 2 };
  addEventListener('pointerdown', e => (lastClick = { x: e.clientX, y: e.clientY }), true);
  const curtain = document.createElement('div');
  curtain.className = 'curtain';
  document.body.appendChild(curtain);
  function playCurtain(phase) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
    curtain.style.setProperty('--cx', `${lastClick.x}px`);
    curtain.style.setProperty('--cy', `${lastClick.y}px`);
    curtain.className = `curtain ${phase}`;
    return new Promise(r => setTimeout(r, phase === 'go' ? 420 : 600));
  }

  async function go() {
    clearTimeout(S._ft);
    const navId = ++S._navSeq;
    const r = (location.hash || '#inicio').slice(1);
    S.route = views.has(r) ? r : location.pathname === '/dia-a-dia' ? 'atendimento' : 'inicio';
    S.editing = null;
    if (!S.authed) return render();
    const animate = S._booted;
    S._booted = true;
    const curtainIn = animate ? playCurtain('go') : Promise.resolve();
    try {
      if (!S.status) await loadStatus();
      if (navId !== S._navSeq) return;
      if (SO_ADMIN.has(S.route) && !isAdmin()) S.route = 'inicio'; // corretor não abre páginas do SaaS
      const load = loaders.get(S.route);
      await Promise.all([load ? load() : Promise.resolve(), curtainIn]);
    } catch (err) {
      if (navId === S._navSeq) toast(err.message, true);
    }
    if (navId !== S._navSeq) return;
    S._navegando = true;
    render();
    S._navegando = false;
    scrollTo(0, 0);
    if (animate) playCurtain('out');
  }

  BIGA.render = render;
  BIGA.go = go;

  // Clique em qualquer elemento com data-action / data-toggle
  root.addEventListener('click', async e => {
    const tg = e.target.closest('[data-toggle]');
    if (tg) {
      const on = tg.getAttribute('aria-pressed') !== 'true';
      tg.setAttribute('aria-pressed', String(on));
      const k = tg.dataset.toggle;
      for (const hook of toggleHooks) {
        if (await hook(k, on, tg) === true) return;
      }
      return;
    }
    const el = e.target.closest('[data-action]');
    const fn = el && actions.get(el.dataset.action);
    if (!el || !fn) return;
    e.preventDefault();
    const isBtn = el.tagName === 'BUTTON';
    if (isBtn) el.disabled = true;
    try {
      await fn(el);
    } catch (err) {
      toast(err.message, true);
    } finally {
      if (isBtn && el.isConnected) el.disabled = false;
    }
  });

  root.addEventListener('pointerover', e => {
    const a = e.target.closest('[data-say]');
    if (a && a !== S._lastSay) {
      S._lastSay = a;
      say(a.dataset.say + '.');
    }
  });
  root.addEventListener('focusin', e => {
    const a = e.target.closest('[data-say]');
    if (a) say(a.dataset.say + '.');
  });

  // Campos de filtro / upload
  root.addEventListener('input', e => {
    for (const hook of inputHooks) {
      if (hook(e) === true) return;
    }
    const n = e.target.name;
    if (n === 'busca' || n === 'filtroContato' || n === 'filtroBairro') {
      // atribuições explícitas (e não S[chave]): com chave dinâmica o CodeQL acha que QUALQUER campo de S recebeu texto digitado
      if (n === 'busca') S.filtro = e.target.value;
      else if (n === 'filtroContato') S.filtroContato = e.target.value;
      else S.filtroBairro = e.target.value;
      const rota = S.route;
      clearTimeout(S._ft);
      S._ft = setTimeout(() => {
        if (S.route !== rota) return;
        const pos = e.target.selectionStart;
        render({ manterCampos: true });
        const again = $(`[name="${CSS.escape(n)}"]`);
        if (again) {
          again.focus();
          if (typeof again.setSelectionRange === 'function' && pos !== null) again.setSelectionRange(pos, pos);
        }
      }, 250);
    }
  });
  root.addEventListener('change', async e => {
    try {
      for (const hook of changeHooks) {
        if (await hook(e) === true) return;
      }
    } catch (err) {
      toast(err.message, true);
    }
  });

  addEventListener('hashchange', go);

  // ------------------------------------------------------------------ início
  (async () => {
    ambient();
    try {
      const s = await api('GET', '/api/session');
      S.authed = s.authenticated;
      S.configured = s.configured;
    } catch {}
    go();
  })();
})();
