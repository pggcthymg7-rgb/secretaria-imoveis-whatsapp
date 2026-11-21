/* Núcleo do painel da BIGA: namespace único, estado, utilidades/sanitização, API e registros */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  const brl = v => (Number(v) ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : '—');
  const fotoUrl = f => {
    const s = String(f || '').trim();
    return /^https?:\/\//i.test(s) ? s : `/fotos/${encodeURIComponent(s)}`;
  };
  const safeHref = u => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '#');
  const safeWaPhone = s => String(s || '').replace(/\D/g, '');
  const safeQrSvg = s => {
    const v = String(s || '').trim();
    return /^<svg\b[^>]*>[\s\S]*<\/svg>$/i.test(v) && !/<script\b|<foreignObject\b|\son[a-z]+\s*=|javascript:/i.test(v) ? v : '';
  };
  const hasOwn = (o, k) => Boolean(o) && Object.prototype.hasOwnProperty.call(o, k);
  const when = ts => (ts ? new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
  const root = $('#root');

  const S = {
    authed: false,
    configured: true,
    route: 'geral',
    lastNonStudioRoute: 'inicio',
    status: null,
    inventory: [],
    radar: null,
    vitrine: null,
    prosp: null,
    contatos: [],
    cerebro: null,
    editing: null,
    sim: null,
    selContacts: new Set(),
    filtro: '',
    _navSeq: 0
  };

  const views = new Map();
  const loaders = new Map();
  const actions = new Map();
  const toggleHooks = [];
  const inputHooks = [];
  const changeHooks = [];

  function register({ views: v, loaders: l, actions: a, onToggle, onInput, onChange } = {}) {
    if (v) for (const [k, fn] of Object.entries(v)) views.set(k, fn);
    if (l) for (const [k, fn] of Object.entries(l)) loaders.set(k, fn);
    if (a) for (const [k, fn] of Object.entries(a)) actions.set(k, fn);
    if (typeof onToggle === 'function') toggleHooks.push(onToggle);
    if (typeof onInput === 'function') inputHooks.push(onInput);
    if (typeof onChange === 'function') changeHooks.push(onChange);
  }

  async function api(method, url, body, isForm) {
    const opts = { method, headers: { 'x-secretaria': '1' }, credentials: 'same-origin' };
    if (body !== undefined) {
      if (isForm) opts.body = body;
      else {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
    }
    let r;
    try {
      r = await fetch(url, opts);
    } catch {
      throw new Error('Sem conexão com o servidor. Tente novamente.');
    }
    let data = {};
    try {
      data = await r.json();
    } catch {}
    if (r.status === 401 && !url.startsWith('/api/login') && !url.startsWith('/api/setup') && !url.startsWith('/api/change-password')) {
      S.authed = false;
      window.BIGA.render();
      throw new Error('Faça login novamente.');
    }
    if (!r.ok) throw new Error(data.error || `Erro ${r.status}`);
    return data;
  }

  let toastTimer;
  function toast(msg, err = false) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `show${err ? ' err' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = ''), 3200);
  }

  async function loadStatus() {
    S.status = await api('GET', '/api/status');
  }

  async function uploadFiles(files) {
    const fd = new FormData();
    [...files].forEach(f => fd.append('photos', f));
    return (await api('POST', '/api/upload-photos', fd, true)).files;
  }

  async function saveConfig(body, msg = 'Salvo!') {
    const r = await api('POST', '/api/config', body);
    if (S.status) S.status.config = r.config;
    toast(msg);
  }

  // partículas de fundo
  function ambient() {
    const c = $('#particles');
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const colors = ['#5266eb', '#ededf3', '#8b97f0'];
    let w, h, parts;
    let rafId = null;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function reset() {
      w = c.width = innerWidth * devicePixelRatio;
      h = c.height = innerHeight * devicePixelRatio;
      const n = Math.min(60, Math.round((innerWidth * innerHeight) / 30000));
      parts = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: (0.6 + Math.random() * 1.6) * devicePixelRatio,
        vy: (0.04 + Math.random() * 0.12) * devicePixelRatio,
        vx: (Math.random() - 0.5) * 0.06 * devicePixelRatio,
        c: colors[(Math.random() * colors.length) | 0],
        a: 0.12 + Math.random() * 0.3
      }));
    }
    function frame() {
      rafId = null;
      if (document.hidden && !reduce) return;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        if (!reduce) {
          p.y -= p.vy;
          p.x += p.vx;
          if (p.y < -10) p.y = h + 10;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.c;
        ctx.globalAlpha = p.a;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduce) rafId = requestAnimationFrame(frame);
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !reduce && !rafId) rafId = requestAnimationFrame(frame);
    });
    addEventListener('resize', reset);
    reset();
    frame();
  }

  window.BIGA = {
    $, $$, esc, brl, fotoUrl, safeHref, safeWaPhone, safeQrSvg, hasOwn, when, root, S,
    api, toast, loadStatus, uploadFiles, saveConfig, ambient,
    views, loaders, actions, toggleHooks, inputHooks, changeHooks, register,
    render: () => {},
    go: async () => {}
  };
})();
