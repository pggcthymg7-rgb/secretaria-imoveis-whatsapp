/* Painel da BIGA — Secretária Imobiliária — SPA sem dependências (CSP: script-src 'self') */
(() => {
  'use strict';

  // ------------------------------------------------------------------ utilidades
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = v => (Number(v) ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : '—');
  const fotoUrl = f => (/^https?:\/\//i.test(f) ? f : `/fotos/${encodeURIComponent(f)}`);
  const when = ts => (ts ? new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
  const root = $('#root');

  async function api(method, url, body, isForm) {
    const opts = { method, headers: { 'x-secretaria': '1' }, credentials: 'same-origin' };
    if (body !== undefined) {
      if (isForm) opts.body = body;
      else {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
    }
    const r = await fetch(url, opts);
    let data = {};
    try {
      data = await r.json();
    } catch {}
    if (r.status === 401 && !url.startsWith('/api/login') && !url.startsWith('/api/setup')) {
      S.authed = false;
      render();
      throw new Error('Faça login novamente.');
    }
    if (!r.ok) throw new Error(data.error || `Erro ${r.status}`);
    return data;
  }

  let toastTimer;
  function toast(msg, err = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = `show${err ? ' err' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = ''), 3200);
  }

  const S = { authed: false, configured: true, route: 'geral', status: null, inventory: [], radar: null, vitrine: null, prosp: null, contatos: [], cerebro: null, editing: null, sim: null, selContacts: new Set(), filtro: '' };

  // ------------------------------------------------------------------ partículas de fundo
  function ambient() {
    const c = $('#particles');
    const ctx = c.getContext('2d');
    const colors = ['#5266eb', '#ededf3', '#8b97f0'];
    let w, h, parts;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function reset() {
      w = c.width = innerWidth * devicePixelRatio;
      h = c.height = innerHeight * devicePixelRatio;
      const n = Math.min(60, Math.round((innerWidth * innerHeight) / 30000));
      parts = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, r: (0.6 + Math.random() * 1.6) * devicePixelRatio, vy: (0.04 + Math.random() * 0.12) * devicePixelRatio, vx: (Math.random() - 0.5) * 0.06 * devicePixelRatio, c: colors[(Math.random() * colors.length) | 0], a: 0.12 + Math.random() * 0.3 }));
    }
    function frame() {
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
      if (!reduce) requestAnimationFrame(frame);
    }
    addEventListener('resize', reset);
    reset();
    frame();
  }

  const ART = window.BIGA_ART;
  const LOGO = `<span class="mini">${ART.miniBiga()}</span><span>BIGA</span>`;
  let detachArt = () => {};

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
  const decisionTag = d => ({ ENVIAR: '<span class="tag enviar">● enviado</span>', AVISAR: '<span class="tag avisar">● conferir</span>', SILENCIO: '<span class="tag">● sem imóvel</span>' }[d] || `<span class="tag">${esc(d)}</span>`);

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

  // ------------------------------------------------------------------ LOGIN
  function viewLogin() {
    const setup = !S.configured;
    root.innerHTML = `
      <main class="login">
        <div class="home"><div class="sky">${ART.skySVG()}</div></div>
        <div class="wrap" style="position:absolute;inset:0">
          <div class="biga-stage" id="stage"><div class="halo"></div><div class="rings"><span></span><span></span><span></span></div>${ART.bigaSVG('b')}
            <div class="speech"><span class="wave"><i></i><i></i><i></i><i></i></span><span id="say" class="typing"></span></div></div>
          <div class="panel stack">
            <div class="logo">${LOGO}</div>
            <span class="label">${setup ? 'Primeiro acesso' : 'Acesso protegido'}</span>
            <h1 class="heading-lg">${setup ? 'Vamos começar.' : 'Bem-vindo de volta.'}</h1>
            <p class="body muted">${setup ? 'Digite o código de configuração (quem instalou a BIGA te passa; ele também aparece no log do servidor) e escolha uma senha com pelo menos 8 caracteres.' : 'A BIGA cuidou dos grupos, das ligações e das novas conversas. Entre para ver o que aconteceu.'}</p>
            <form id="loginForm" class="stack" autocomplete="on">
              ${setup ? field('codigo', 'Código de configuração', '', { ph: 'Ex: 9F3A1C2B', attrs: 'autocomplete="off" required' }) : ''}
              ${field('senha', setup ? 'Nova senha' : 'Senha', '', { type: 'password', ph: '••••••••', attrs: `required autocomplete="${setup ? 'new-password' : 'current-password'}"` })}
              <button class="btn-primary" type="submit">${setup ? 'Criar senha e entrar' : 'Entrar'}</button>
            </form>
          </div>
        </div>
      </main>`;
    detachArt();
    detachArt = ART.attach($('#stage'));
    say(setup ? 'Oi! Eu sou a BIGA. Crie sua senha para começarmos.' : 'Oi! Eu sou a BIGA. Que bom te ver de novo.');
    $('#loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      const d = formData(e.target);
      try {
        await api('POST', setup ? '/api/setup' : '/api/login', d);
        S.authed = true;
        S.configured = true;
        await loadStatus();
        render();
      } catch (err) {
        toast(err.message, true);
      }
    });
  }

  // ------------------------------------------------------------------ SHELL
  const ROUTES = [
    ['inicio', 'Início', 'Volte para a BIGA'],
    ['hoje', 'Hoje', 'Números do dia, QR Code e atividade'],
    ['radar', 'Radar', 'Pedidos dos grupos e o que eu fiz com cada um'],
    ['busca', 'Busca', 'Procuro o imóvel do seu cliente nos grupos e nos portais'],
    ['carteira', 'Carteira', 'Seus imóveis, fotos e cadastro'],
    ['garimpo', 'Garimpo', 'Clientes procurando imóvel na internet'],
    ['vitrine', 'Vitrine', 'Divulgação automática nos grupos'],
    ['prospeccao', 'Prospecção', 'Mensagens para contatos escolhidos'],
    ['atendimento', 'Atendimento', '1ª mensagem, ligações e respostas rápidas'],
    ['cerebro', 'Cérebro', 'Mapa de Goiânia e meu jeito de falar'],
    ['simulador', 'Simulador', 'Teste um pedido antes de valer'],
    ['ajustes', 'Ajustes', 'Grupos, alertas, backup e segurança']
  ];

  let sayTimer = null;
  function say(text) {
    const el = $('#say');
    const stage = $('#stage');
    if (!el) return;
    clearInterval(sayTimer);
    let i = 0;
    el.textContent = '';
    if (stage) stage.classList.add('talking');
    sayTimer = setInterval(() => {
      el.textContent = text.slice(0, ++i);
      if (i >= text.length) {
        clearInterval(sayTimer);
        if (stage) setTimeout(() => stage.classList.remove('talking'), 300);
      }
    }, 22);
  }

  function shell(inner) {
    const st = S.status || {};
    const conn = st.connectionStatus === 'CONECTADO';
    const paused = st.config && st.config.pausado;
    detachArt();
    root.innerHTML = `
      <nav class="nav"><div class="bar">
        <a class="logo" href="#inicio">${LOGO}</a>
        <div class="links">${ROUTES.filter(r => r[0] !== 'inicio').map(([k, l]) => `<a href="#${k}" class="${S.route === k ? 'active' : ''}">${l}</a>`).join('')}</div>
        <span class="status-dot"><span class="dot ${paused ? 'warn' : conn ? 'on' : ''}"></span>${paused ? 'Pausada' : conn ? 'Online' : st.connectionStatus === 'AGUARDANDO_QR_CODE' ? 'Ler QR' : 'Offline'}</span>
      </div></nav>
      <main class="page-enter">${inner}</main>
      <div class="space-60"></div>`;
  }

  // ------------------------------------------------------------------ INÍCIO (BIGA + menu)
  function viewHome() {
    const st = S.status || {};
    const h = st.hoje || {};
    const conn = st.connectionStatus === 'CONECTADO';
    const paused = st.config && st.config.pausado;
    const saud = st.daily?.currentPeriodGreeting || 'Olá';
    detachArt();
    root.innerHTML = `
      <main class="home page-enter">
        <div class="sky">${ART.skySVG()}</div>
        <nav class="nav"><div class="bar"><a class="logo" href="#inicio">${LOGO}</a><div class="links"></div>
          <span class="status-dot"><span class="dot ${paused ? 'warn' : conn ? 'on' : ''}"></span>${paused ? 'Pausada' : conn ? 'Online' : st.connectionStatus === 'AGUARDANDO_QR_CODE' ? 'Ler QR' : 'Offline'}</span></div></nav>
        <div class="wrap">
          <div class="biga-stage" id="stage"><div class="halo"></div><div class="rings"><span></span><span></span><span></span></div>${ART.bigaSVG('b')}
            <div class="speech"><span class="wave"><i></i><i></i><i></i><i></i></span><span id="say" class="typing"></span></div></div>
          <div class="home-menu">
            <div class="hello">${esc(saud)}${st.self?.name ? ', ' + esc(st.self.name.split(' ')[0]) : ''}</div>
            <h1 class="display">Eu sou a BIGA.</h1>
            <p class="sub">${conn ? (paused ? 'Estou pausada. Toque em Hoje para me retomar.' : 'Estou de olho nos grupos, nas ligações e nas conversas novas. Para onde vamos?') : 'Preciso que você conecte o WhatsApp para eu começar.'}</p>
            ${!conn && st.qrSvg ? `<div class="card" style="display:flex;gap:20px;align-items:center;margin-bottom:20px;flex-wrap:wrap"><div class="qr" style="width:180px">${st.qrSvg}</div><p class="body muted" style="flex:1;min-width:180px">WhatsApp › Configurações › Aparelhos conectados › <b>Conectar aparelho</b> e aponte para o código.</p></div>` : ''}
            <ul class="menu-list">${ROUTES.filter(r => r[0] !== 'inicio').map(([k, l, d], i) => `<li style="animation-delay:${0.08 + i * 0.05}s"><a href="#${k}" data-say="${esc(d)}"><span><span class="t">${l}</span><span class="d">${d}</span></span><span class="arrow">→</span></a></li>`).join('')}</ul>
            <div class="kpis"><div><b>${st.radarHoje || 0}</b>pedidos hoje</div><div><b>${h.ofertas_enviadas || 0}</b>imóveis enviados</div><div><b>${h.novas_conversas || 0}</b>conversas novas</div><div><b>${st.inventoryCount || 0}</b>imóveis ativos</div></div>
          </div>
        </div>
      </main>`;
    detachArt = ART.attach($('#stage'));
    say(conn ? `${saud}! Tenho ${st.radarHoje || 0} pedido(s) dos grupos hoje. Escolha uma página ao lado.` : 'Oi! Escaneie o QR Code para eu me conectar ao seu WhatsApp.');
  }

  // ------------------------------------------------------------------ HOJE
  function viewGeral() {
    const st = S.status || {};
    const h = st.hoje || {};
    const conn = st.connectionStatus === 'CONECTADO';
    const logs = (st.activityLogs || []).slice(0, 25);
    shell(`
      ${header(`${esc(st.daily?.currentPeriodGreeting || 'Olá')}.<br><span class="muted">${conn ? 'Tudo sob controle.' : 'Vamos conectar?'}</span>`, 'Hoje', conn ? `Conectada como <b>${esc(st.self?.name || st.self?.phone || '')}</b>. Monitorando ${st.connectedGroups ? st.connectedGroups.filter(g => g.monitored).length : 0} grupo(s) de busca com ${st.inventoryCount || 0} imóveis ativos.` : 'Escaneie o QR Code com o WhatsApp do seu celular: Configurações › Aparelhos conectados › Conectar aparelho.')}
      ${!conn && st.qrSvg ? `<section class="section"><div class="container"><div class="card split rev reveal"><div class="qr">${st.qrSvg}</div><div class="intro"><span class="label">QR Code</span><p class="body muted">O código muda a cada poucos segundos — esta tela atualiza sozinha.</p></div></div></div></section>` : ''}
      <section class="section"><div class="container"><div class="stats reveal">
        ${[['Pedidos lidos', st.radarHoje || 0], ['Imóveis enviados', h.ofertas_enviadas || 0], ['Para conferir', h.duvidas || 0], ['Novas conversas', h.novas_conversas || 0], ['Ligações respondidas', h.ligacoes_perdidas || 0], ['Leads do Garimpo', h.garimpo_leads || 0]].map(([l, n]) => `<div class="stat"><div class="n" data-count="${n}">${n}</div><div class="l">${l}</div></div>`).join('')}
      </div></div></section>
      ${st.config && !st.config.dataDirPersistente ? `<section class="section"><div class="container"><div class="card reveal"><h2 class="heading-sm warn">Memória temporária</h2><p class="body muted">Os dados ficam na pasta do projeto e podem ser apagados em reinícios. Use a máquina virtual com DATA_DIR (veja GUIA_VM_GRATUITA.md).</p></div></div></section>` : ''}
      <section class="section"><div class="container split top">
        <div class="card reveal"><span class="label">Atividade</span><div class="log">${logs.length ? logs.map(l => `<div><span class="t">${esc(l.time)}</span>${esc(l.message)}</div>`).join('') : '<div>Nenhuma atividade ainda.</div>'}</div></div>
        <div class="card stack reveal">
          <span class="label">Controle</span>
          ${toggle('pausado', st.config?.pausado, st.config?.pausado ? 'Pausada — toque para retomar' : 'Pausar tudo', 'Para tudo que é automático: grupos, vitrine, prospecção, garimpo e 1ª mensagem. Também funciona mandando “pausar” no WhatsApp.')}
          <p class="body muted">Dica: no WhatsApp, abra <b>“Mensagem para mim”</b> e envie <b>ajuda</b> para falar direto com a BIGA.</p>
          <div class="row"><a class="btn-ghost" href="#radar">Ver pedidos</a><a class="btn-ghost" href="#carteira">Cadastrar imóvel</a><a class="btn-ghost" href="#simulador">Testar mensagem</a></div>
        </div>
      </div></section>`);
  }

  // ------------------------------------------------------------------ RADAR
  function viewRadar() {
    const r = S.radar || { items: [], demanda: { tipos: [], locais: [], faixas: [], total: 0 } };
    const items = r.items.filter(i => !S.filtroRadar || i.decision === S.filtroRadar);
    const bars = arr => {
      const max = Math.max(1, ...arr.map(x => x.qtd));
      return arr.length ? `<div class="bars">${arr.map(x => `<div class="bar"><span>${esc(x.nome)}</span><span class="track"><span class="fill" style="width:${(x.qtd / max) * 100}%"></span></span><span class="ash">${x.qtd}</span></div>`).join('')}</div>` : '<p class="body ash">Sem dados ainda.</p>';
    };
    shell(`
      ${header('Radar de<br>buscas', 'O que os corretores pedem', `Todo pedido lido nos grupos fica aqui, com o que a BIGA entendeu e o que ela fez. Em <span class="saffron">conferir</span> você decide com um clique.`)}
      <section class="section"><div class="container split top">
        <div><span class="label">Mais procurados · ${r.demanda.total} pedidos em 30 dias</span>${bars(r.demanda.locais)}</div>
        <div class="stack"><div><span class="label">Tipos</span>${bars(r.demanda.tipos)}</div><div><span class="label">Faixas de preço</span>${bars(r.demanda.faixas)}</div></div>
      </div></section>
      <section class="section"><div class="container">
        <div class="row tight">${[['', 'Todos'], ['AVISAR', 'Conferir'], ['ENVIAR', 'Enviados'], ['SILENCIO', 'Sem imóvel']].map(([k, l]) => `<button class="btn-ghost ${S.filtroRadar === k || (!S.filtroRadar && !k) ? 'accent' : ''}" data-action="filtroRadar" data-v="${k}">${l}</button>`).join('')}</div>
        <div class="list">${items.length ? items.map(i => `
          <div class="item stack-sm">
            <div class="row tight"><span class="tag iris">${esc(i.code)}</span>${decisionTag(i.decision)}<span class="caption">${esc(when(i.ts))} · ${esc(i.grupo)}</span></div>
            <h3 class="h2xs">${esc(i.sender)} ${i.phone ? `<a class="btn-ghost accent" href="https://wa.me/${esc(i.phone)}" target="_blank" rel="noopener">wa.me/${esc(i.phone)}</a>` : ''}</h3>
            <div class="body muted pre">${esc(i.texto)}</div>
            <div class="caption">🧠 ${esc(i.resumo || '')}</div>
            ${(i.duvidas || []).length ? `<div class="caption saffron">${i.duvidas.map(esc).join('<br>')}</div>` : ''}
            ${i.enviados && i.enviados.length ? `<div class="caption">Enviado: #${i.enviados.map(esc).join(', #')}</div>` : ''}
            ${i.decision !== 'ENVIAR' ? `<div class="row tight">${(i.candidatos || []).map(id => `<button class="btn-ghost accent" data-action="aprovarRadar" data-code="${esc(i.code)}" data-id="${esc(id)}">Enviar #${esc(id)}</button>`).join('')}<button class="btn-ghost" data-action="aprovarOutro" data-code="${esc(i.code)}">Enviar outro imóvel…</button></div>` : ''}
          </div>`).join('') : '<p class="body ash">Nenhum pedido registrado ainda.</p>'}</div>
      </div></section>`);
  }

  // ------------------------------------------------------------------ CARTEIRA
  const TIPOS = ['Apartamento', 'Casa', 'Sobrado', 'Flat', 'Cobertura', 'Studio', 'Terreno', 'Chácara', 'Fazenda', 'Comercial'];
  function propTitle(p) {
    return `${p.tipo}${p.edificio ? ' · ' + p.edificio : ''} — ${p.setor || 'sem bairro'}${p.cidade && p.cidade !== 'Goiânia' ? ' (' + p.cidade + ')' : ''}`;
  }
  function viewCarteira() {
    const f = (S.filtro || '').toLowerCase();
    const list = S.inventory.filter(p => !f || JSON.stringify(p).toLowerCase().includes(f));
    const e = S.editing;
    shell(`
      ${header('Carteira', `${S.inventory.filter(p => p.ativo).length} ativo(s) · ${S.inventory.length} no total`, 'Quanto mais completo o cadastro (edifício, suítes, vagas, condomínio, permuta), mais certeira a BIGA fica. Também dá para cadastrar pelo WhatsApp: mande <b>cadastrar</b> + descrição e as fotos no “Mensagem para mim”.')}
      ${e ? editorProp(e) : `<section class="section"><div class="container row between"><div class="grow">${field('busca', 'Buscar na carteira', S.filtro, { type: 'search', ph: 'bairro, edifício, tipo…' })}</div><button class="btn-primary" data-action="novoImovel">Novo imóvel</button></div></section>`}
      <section class="section"><div class="container">
        <div class="row tight"><a class="btn-ghost" href="/api/export-csv">Baixar planilha (.csv)</a><button class="btn-ghost" data-action="importGoogle">Importar do Google Sheets</button></div>
        <div class="list">${list.length ? list.map(p => `
          <div class="item item-media">
            ${p.fotos && p.fotos[0] ? `<img class="thumb" loading="lazy" src="${esc(fotoUrl(p.fotos[0]))}" alt="">` : '<div class="thumb ph">sem foto</div>'}
            <div class="stack-sm">
              <div class="row tight"><span class="tag iris">#${esc(p.id)}</span>${p.ativo ? '<span class="tag enviar">● ativo</span>' : '<span class="tag">● inativo</span>'}${p.negociacao === 'AGIO' ? '<span class="tag avisar">ágio</span>' : ''}${p.negociacao === 'ALUGUEL' ? '<span class="tag">aluguel</span>' : ''}${p.aceita_permuta === 'SIM' ? '<span class="tag">aceita permuta</span>' : ''}</div>
              <h3 class="h2xs">${esc(propTitle(p))}</h3>
              <div class="body muted">${[p.quartos ? p.quartos + ' qts' : '', p.suites !== '' && p.suites !== undefined ? p.suites + ' suítes' : '', p.vagas ? p.vagas + ' vagas' : '', p.tamanho_m2 ? p.tamanho_m2 + ' m²' : '', { SIM: 'mobiliado', SEMI: 'com armários' }[p.mobiliado] || ''].filter(Boolean).join(' · ')} · <span class="saffron">${p.negociacao === 'AGIO' && p.valor_agio ? 'ágio ' + brl(p.valor_agio) : brl(p.valor)}</span></div>
              <div class="row tight"><button class="btn-ghost accent" data-action="editar" data-id="${esc(p.id)}">Editar</button><button class="btn-ghost" data-action="ativo" data-id="${esc(p.id)}">${p.ativo ? 'Desativar' : 'Ativar'}</button><button class="btn-ghost" data-action="aVitrine" data-id="${esc(p.id)}">Vitrine</button><button class="btn-ghost danger" data-action="excluir" data-id="${esc(p.id)}">Excluir</button></div>
            </div>
          </div>`).join('') : '<p class="body ash">Nenhum imóvel encontrado.</p>'}</div>
      </div></section>`);
  }

  function editorProp(p) {
    const yn = [['', 'Não informado'], ['SIM', 'Sim'], ['NAO', 'Não']];
    return `<section class="section"><div class="container stack" id="propForm">
      <span class="label">${p.id ? `Editando #${esc(p.id)}` : 'Novo imóvel'}</span>
      <div class="fields">
        ${field('tipo', 'Tipo', p.tipo || 'Apartamento', { options: TIPOS.map(t => [t, t]) })}
        ${field('negociacao', 'Negociação', p.negociacao || 'VENDA', { options: [['VENDA', 'Venda'], ['AGIO', 'Ágio'], ['ALUGUEL', 'Aluguel'], ['VENDA_ALUGUEL', 'Venda ou aluguel']] })}
        ${field('edificio', 'Edifício / condomínio', p.edificio, { ph: 'Ex: Metropolitan' })}
        ${field('setor', 'Bairro / setor', p.setor, { ph: 'Ex: Setor Bueno' })}
        ${field('cidade', 'Cidade', p.cidade || 'Goiânia')}
        ${field('valor', 'Valor (R$)', p.valor || '', { type: 'number', attrs: 'min="0" step="1000"' })}
        ${field('valor_agio', 'Valor do ágio (R$)', p.valor_agio, { type: 'number', attrs: 'min="0" step="1000"' })}
        ${field('quartos', 'Quartos', p.quartos || '', { type: 'number', attrs: 'min="0"' })}
        ${field('suites', 'Suítes', p.suites, { type: 'number', attrs: 'min="0"' })}
        ${field('vagas', 'Vagas', p.vagas, { type: 'number', attrs: 'min="0"' })}
        ${field('tamanho_m2', 'Área (m²)', p.tamanho_m2 || '', { type: 'number', attrs: 'min="0"' })}
        ${field('condominio', 'Condomínio (R$/mês)', p.condominio, { type: 'number', attrs: 'min="0"' })}
        ${field('idade_anos', 'Idade (anos)', p.idade_anos, { type: 'number', attrs: 'min="0"' })}
        ${field('mobiliado', 'Mobília', p.mobiliado || 'NAO', { options: [['NAO', 'Sem mobília'], ['SEMI', 'Com armários'], ['SIM', 'Mobiliado']] })}
        ${field('lazer', 'Área de lazer', p.lazer || '', { options: yn })}
        ${field('aceita_permuta', 'Aceita permuta', p.aceita_permuta || '', { options: yn })}
        ${field('aceita_financiamento', 'Aceita financiamento', p.aceita_financiamento || '', { options: yn })}
        ${field('caracteristicas', 'Características', p.caracteristicas, { cls: 'full', ph: 'piscina, varanda gourmet, nascente, vagas independentes, despensa…' })}
        ${field('descricao', 'Descrição', p.descricao, { area: true, cls: 'full', rows: 5, ph: 'Descreva o imóvel como você contaria para um corretor parceiro.' })}
      </div>
      <div class="stack-sm"><span class="field"><span>Fotos (clique numa foto para torná-la a capa)</span></span>
        <div class="photos" id="photos">${(p.fotos || []).map((f, i) => `<div class="ph-item ${i === 0 ? 'sel' : ''}"><img src="${esc(fotoUrl(f))}" alt="" data-action="capa" data-i="${i}"><button class="x" data-action="rmFoto" data-i="${i}" aria-label="Remover foto">×</button></div>`).join('')}</div>
        <label class="btn-ghost accent" style="cursor:pointer">+ Adicionar fotos<input type="file" id="fotoInput" accept="image/jpeg,image/png,image/webp" multiple></label>
      </div>
      <div class="row">${toggle('ativo', p.ativo !== false, 'Ativo na carteira')}</div>
      <div class="row"><button class="btn-primary" data-action="salvarImovel">Salvar imóvel</button><button class="btn-ghost" data-action="cancelarEdicao">Cancelar</button></div>
    </div></section>`;
  }

  // ------------------------------------------------------------------ VITRINE
  function viewVitrine() {
    const v = S.vitrine || { config: { horarios: [], grupos: [] }, posts: {}, historico: [] };
    const groups = (S.status && S.status.connectedGroups) || [];
    const posts = Object.entries(v.posts).map(([id, post]) => ({ id, post, prop: S.inventory.find(p => String(p.id) === String(id)) })).filter(x => x.prop);
    const horarios = [...v.config.horarios, '', '', '', ''].slice(0, 4);
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    shell(`
      ${header('Vitrine', 'Divulgação automática', 'Em até 4 horários por dia a BIGA publica sua carteira nos grupos de divulgação que você escolher (diferentes dos grupos de busca). Só vão posts que você aprovou, em rodízio.')}
      <section class="section"><div class="container stack" id="vitrineCfg">
        ${toggle('ativo', v.config.ativo, v.config.ativo ? 'Vitrine ligada' : 'Vitrine desligada')}
        <div class="row">${horarios.map((h, i) => field(`h${i}`, `Horário ${i + 1}`, h, { type: 'time' })).join('')}${field('porHorario', 'Imóveis por horário', v.config.porHorario, { type: 'number', attrs: 'min="1" max="5"' })}</div>
        <div><span class="field"><span>Dias</span></span><div class="chips">${dias.map((d, i) => toggle(`d${i}`, v.config.diasSemana.includes(i), d)).join('')}</div></div>
        <div><span class="field"><span>Grupos de divulgação (${v.config.grupos.length})</span></span>
          ${groupSearch('vit', groups.length)}
          <div class="chips scroll" data-filter="vit">${groups.length ? groups.map(g => toggle(`g:${g.id}`, v.config.grupos.includes(g.id), g.subject + (g.monitored ? ' · busca' : ''))).join('') : '<span class="body ash">Conecte o WhatsApp para listar seus grupos.</span>'}</div></div>
        <div class="row"><button class="btn-primary" data-action="salvarVitrine">Salvar vitrine</button><button class="btn-ghost accent" data-action="gerarPosts">Gerar rascunhos da carteira</button><button class="btn-ghost" data-action="vitrineAgora">Publicar agora</button></div>
      </div></section>
      <section class="section"><div class="container">
        <span class="label">Posts · ${posts.filter(x => x.post.status === 'APROVADO').length} aprovados</span>
        <div class="list">${posts.length ? posts.map(({ id, post, prop }) => `
          <div class="item item-media" data-post="${esc(id)}">
            ${post.foto ? `<img class="thumb" src="${esc(fotoUrl(post.foto))}" alt="">` : '<div class="thumb ph">sem foto</div>'}
            <div class="stack-sm">
              <div class="row tight"><span class="tag iris">#${esc(id)}</span><span class="tag ${post.status === 'APROVADO' ? 'enviar' : post.status === 'PENDENTE' ? 'avisar' : ''}">● ${esc(post.status.toLowerCase())}</span><span class="caption">${post.envios || 0} envio(s)${post.ultimoEnvio ? ' · último ' + esc(when(post.ultimoEnvio)) : ''}</span></div>
              <textarea name="texto" rows="6">${esc(post.texto)}</textarea>
              ${(prop.fotos || []).length > 1 ? `<div class="photos">${prop.fotos.map(f => `<div class="ph-item ${f === post.foto ? 'sel' : ''}"><img src="${esc(fotoUrl(f))}" alt="" data-action="fotoPost" data-id="${esc(id)}" data-f="${esc(f)}"></div>`).join('')}</div>` : ''}
              <div class="row tight"><button class="btn-ghost accent" data-action="aprovarPost" data-id="${esc(id)}">${post.status === 'APROVADO' ? 'Aprovado ✓' : 'Salvar e aprovar'}</button><button class="btn-ghost" data-action="salvarPost" data-id="${esc(id)}">Salvar texto</button><button class="btn-ghost danger" data-action="reprovarPost" data-id="${esc(id)}">Reprovar</button></div>
            </div>
          </div>`).join('') : '<p class="body ash">Nenhum post ainda. Clique em “Gerar rascunhos da carteira”.</p>'}</div>
      </div></section>`);
  }

  // ------------------------------------------------------------------ PROSPECÇÃO
  function viewProspeccao() {
    const p = S.prosp || { campanhas: [], config: {} };
    const f = (S.filtroContato || '').toLowerCase();
    const contatos = S.contatos.filter(c => !f || (c.nome + c.telefone).toLowerCase().includes(f)).slice(0, 300);
    shell(`
      ${header('Prospecção', `${p.enviadosHoje || 0} de ${p.config.limiteDiario || 0} hoje`, 'Escolha os contatos, escreva a mensagem (com ou sem imagem) e a BIGA envia um por vez, no ritmo de uma pessoa, dentro do horário comercial. Quem responder <b>SAIR</b> nunca mais recebe.')}
      <section class="section"><div class="container stack" id="campForm">
        <span class="label">Nova campanha</span>
        <div class="fields wide">${field('nome', 'Nome da campanha', '', { ph: 'Ex: Lançamento Setor Bueno' })}</div>
        ${field('mensagem', 'Mensagem', '', { area: true, rows: 6, ph: '{Oi|Olá} {nome}, {saudacao}! Tenho uma oportunidade que pode te interessar…' })}
        <p class="caption">Use {nome} e {saudacao}. Variações {Oi|Olá|E aí} são sorteadas para cada contato (ajuda a não parecer disparo em massa).</p>
        <div class="row tight"><label class="btn-ghost accent" style="cursor:pointer">+ Imagem (opcional)<input type="file" id="campImg" accept="image/jpeg,image/png,image/webp"></label><span class="caption" id="campImgName">${esc(S.campImg || '')}</span>${S.campImg ? '<button class="btn-ghost" data-action="rmCampImg">remover</button>' : ''}</div>
        <div class="split top">
          <div class="stack-sm">
            <span class="field"><span>Contatos do WhatsApp · ${S.selContacts.size} selecionado(s)</span></span>
            ${field('filtroContato', 'Filtrar', S.filtroContato || '', { type: 'search', ph: 'nome ou número' })}
            <div class="row tight"><button class="btn-ghost accent" data-action="selTodos">Selecionar filtrados</button><button class="btn-ghost" data-action="selNenhum">Limpar</button></div>
            <div class="chips" style="max-height:320px;overflow:auto">${contatos.length ? contatos.map(c => toggle(`c:${c.telefone}`, S.selContacts.has(c.telefone), `${c.nome || 'Sem nome'} · ${c.telefone}`)).join('') : '<span class="body ash">A lista aparece conforme o WhatsApp sincroniza seus contatos.</span>'}</div>
          </div>
          <div class="stack-sm">${field('colar', 'Ou cole uma lista (um por linha: nome; telefone)', '', { area: true, rows: 8, ph: 'Maria; 62 98888-7777\nJoão 62 99999-0000' })}</div>
        </div>
        <div class="row"><button class="btn-primary" data-action="criarCampanha">Criar e iniciar</button><button class="btn-ghost" data-action="criarRascunho">Salvar como rascunho</button></div>
      </div></section>
      <section class="section"><div class="container">
        <span class="label">Campanhas</span>
        <div class="list">${p.campanhas.length ? p.campanhas.map(c => `
          <div class="item stack-sm">
            <div class="row tight"><span class="tag ${c.status === 'ATIVA' ? 'enviar' : c.status === 'PAUSADA' ? 'avisar' : ''}">● ${esc(c.status.toLowerCase())}</span><span class="caption">${esc(when(c.criadaEm))}</span></div>
            <h3 class="h2xs">${esc(c.nome)}</h3>
            <div class="body muted">${c.enviados}/${c.total} enviados · ${c.pendentes} na fila · ${c.falhas} falhas · ${c.sairam} saíram</div>
            <div class="caption pre">${esc(c.mensagem.slice(0, 200))}</div>
            <div class="row tight">${c.status === 'ATIVA' ? `<button class="btn-ghost accent" data-action="campStatus" data-id="${esc(c.id)}" data-s="PAUSADA">Pausar</button>` : ['RASCUNHO', 'PAUSADA'].includes(c.status) ? `<button class="btn-ghost accent" data-action="campStatus" data-id="${esc(c.id)}" data-s="ATIVA">Iniciar</button>` : ''}<button class="btn-ghost danger" data-action="campExcluir" data-id="${esc(c.id)}">Excluir</button></div>
          </div>`).join('') : '<p class="body ash">Nenhuma campanha.</p>'}</div>
      </div></section>
      <section class="section"><div class="container stack" id="prospCfg">
        <span class="label">Ritmo seguro (proteção contra bloqueio)</span>
        <div class="fields">
          ${field('intervaloMinSeg', 'Intervalo mínimo (s)', p.config.intervaloMinSeg, { type: 'number', attrs: 'min="20"' })}
          ${field('intervaloMaxSeg', 'Intervalo máximo (s)', p.config.intervaloMaxSeg, { type: 'number' })}
          ${field('limiteDiario', 'Limite por dia', p.config.limiteDiario, { type: 'number', attrs: 'min="1" max="300"' })}
          ${field('horaInicio', 'Começa às', p.config.horaInicio, { type: 'time' })}
          ${field('horaFim', 'Termina às', p.config.horaFim, { type: 'time' })}
        </div>
        ${toggle('rodapeSair', p.config.rodapeSair, 'Incluir “responda SAIR” no fim da mensagem')}
        <p class="caption">Recomendado: até 40 por dia, intervalo de 1 a 3 minutos, só para quem conhece você ou seu trabalho. O WhatsApp bloqueia números que enviam muitas mensagens para quem não tem seu contato.</p>
        <div><button class="btn-ghost accent" data-action="salvarProspCfg">Salvar ritmo</button></div>
      </div></section>`);
  }

  // ------------------------------------------------------------------ ATENDIMENTO
  function viewAtendimento() {
    const c = (S.status && S.status.config) || {};
    const d = (S.status && S.status.daily) || {};
    const rules = c.dailySimpleReplies || [];
    shell(`
      ${header('Atendimento', `${d.knownContactsCount || 0} contatos conhecidos`, 'A BIGA responde a 1ª mensagem só de quem nunca falou com você (nem pelo telefone, nem pelo novo ID do WhatsApp, nem salvo na agenda) e avisa quem ligou e você não atendeu.')}
      <section class="section"><div class="container stack" id="atdForm">
        ${toggle('firstContactEnabled', c.firstContactEnabled, 'Responder 1ª mensagem', 'Use {saudacao} (Bom dia/Boa tarde/Boa noite) e {nome}.')}
        ${field('firstContactMessage', 'Mensagem de 1º contato', c.firstContactMessage, { area: true, rows: 3 })}
        ${toggle('firstContactIgnorarAgenda', c.firstContactIgnorarAgenda, 'Nunca responder contatos salvos na minha agenda')}
        <div class="fields">${field('firstContactAquecimentoMin', 'Aquecimento após conectar (min)', c.firstContactAquecimentoMin, { type: 'number', attrs: 'min="0" max="240"' })}</div>
        <p class="caption">O aquecimento só vale quando a memória ainda está vazia (primeira conexão ou disco novo): a BIGA aprende seus contatos antes de responder alguém.</p>
        <div class="space-36"></div>
        ${toggle('missedCallEnabled', c.missedCallEnabled, 'Responder ligação não atendida')}
        ${field('missedCallMessage', 'Mensagem após ligação perdida', c.missedCallMessage, { area: true, rows: 3 })}
        <div class="space-36"></div>
        <span class="label">Respostas rápidas (gatilho exato)</span>
        <div class="stack" id="rules">${rules.map((r, i) => `<div class="fields wide" data-rule="${i}">${field('trigger', 'Quando a pessoa escrever', r.trigger)}${field('response', 'Responder', r.response)}<div>${toggle('active', r.active !== false, 'Ativa')} <button class="btn-ghost danger" data-action="rmRule" data-i="${i}">Remover</button></div></div>`).join('')}</div>
        <div><button class="btn-ghost accent" data-action="addRule">+ Nova resposta rápida</button></div>
        <div><button class="btn-primary" data-action="salvarAtendimento">Salvar atendimento</button></div>
      </div></section>
      <section class="section"><div class="container split top">
        <div><span class="label">Histórico do dia a dia</span><div class="log">${(d.dailyActivityLogs || []).slice(0, 40).map(l => `<div><span class="t">${esc(l.time)}</span>${esc(l.message)}</div>`).join('') || '<div>Nada ainda.</div>'}</div></div>
        <div class="stack" id="resetForm"><span class="label">Testar 1ª mensagem</span><p class="body muted">Libere um número da memória para testar como se ele nunca tivesse falado com você.</p>${field('phone', 'Número com DDD', '', { type: 'tel', ph: '62 99999-9999' })}<button class="btn-ghost accent" data-action="resetContato">Liberar número</button></div>
      </div></section>`);
  }

  // ------------------------------------------------------------------ CÉREBRO
  function viewCerebro() {
    const cb = S.cerebro || { base: {}, extraPlaces: [], bairros: [] };
    const c = (S.status && S.status.config) || {};
    const fb = (S.filtroBairro || '').toLowerCase();
    shell(`
      ${header('Cérebro', 'Mapa de Goiânia', `A BIGA conhece ${cb.base.bairros || 0} bairros, ${cb.base.condominios || 0} condomínios, ${cb.base.marcos || 0} marcos e avenidas e ${cb.base.cidades || 0} cidades da região${cb.base.fonteAberta ? ` (mapa aberto do OpenStreetMap, atualizado em ${esc(when(cb.base.mapaAtualizadoEm))} e renovado todo domingo)` : ''}. Ensine edifícios e lugares novos aqui — vale na hora.`)}
      <section class="section"><div class="container stack" id="places">
        <span class="label">Lugares que você ensinou</span>
        ${(cb.extraPlaces || []).map((p, i) => `<div class="fields" data-place="${i}">${field('name', 'Nome', p.name)}${field('kind', 'Tipo', p.kind, { options: [['edificio', 'Edifício'], ['condominio', 'Condomínio'], ['bairro', 'Bairro'], ['marco', 'Ponto de referência']] })}${field('bairro', 'Fica no bairro', p.bairro)}${field('aliases', 'Apelidos (vírgula)', p.aliases)}<div><button class="btn-ghost danger" data-action="rmPlace" data-i="${i}">Remover</button></div></div>`).join('') || '<p class="body ash">Nenhum ainda. Ex: Edifício Metropolitan · Setor Marista · apelidos: metropolitan, metropolitan flat.</p>'}
        <div class="row"><button class="btn-ghost accent" data-action="addPlace">+ Ensinar lugar</button><button class="btn-primary" data-action="salvarPlaces">Salvar lugares</button></div>
      </div></section>
      <section class="section"><div class="container stack" id="treino">
        <span class="label">Jeito de falar</span>
        ${toggle('humanModeEnabled', c.humanModeEnabled, 'Adaptar abertura ao horário e ao tom do pedido')}
        ${field('humanTraining', 'Regras treinadas (uma por linha: Se o corretor falar "X", diga: "Y")', c.humanTraining, { area: true, rows: 5 })}
        ${field('messageTemplate', 'Modelo da mensagem ao parceiro', c.messageTemplate, { area: true, rows: 9 })}
        <p class="caption">Variáveis: {abertura_humana} {resumo} {tipo} {setor} {edificio} {quartos} {suites} {vagas} {tamanho} {mobiliado} {valor} {descricao} {fechamento_humano}</p>
        <div class="row"><button class="btn-ghost accent" data-action="salvarTreino">Salvar jeito de falar</button><button class="btn-ghost" data-action="templatePadrao">Voltar ao modelo padrão</button></div>
      </div></section>
      <section class="section"><div class="container stack">
        <span class="label">Bairros conhecidos</span>
        ${field('filtroBairro', 'Procurar', S.filtroBairro || '', { type: 'search', ph: 'Ex: Marista' })}
        <div class="chips">${(cb.bairros || []).filter(b => !fb || b.nome.toLowerCase().includes(fb) || String(b.regiao).toLowerCase().includes(fb)).slice(0, 120).map(b => `<span class="body muted">${esc(b.nome)} <span class="caption">${esc(b.regiao)}</span></span>`).join('')}</div>
      </div></section>`);
  }

  // ------------------------------------------------------------------ SIMULADOR
  function viewSimulador() {
    const r = S.sim;
    const a = r && r.analysis;
    shell(`
      ${header('Simulador', 'Teste antes de valer', 'Cole um pedido real de grupo e veja exatamente o que a BIGA entende, o que ela faria e a mensagem que mandaria.')}
      <section class="section"><div class="container stack" id="simForm">
        ${field('message', 'Mensagem do grupo', S.simMsg || '', { area: true, rows: 6, ph: 'BUSCO\nApto 3Q sendo 1 suíte no Setor Bueno até 600 mil' })}
        <div class="fields wide">${field('senderName', 'Quem mandou', S.simSender || 'Sara Corretora')}</div>
        <div><button class="btn-primary" data-action="simular">Simular</button></div>
      </div></section>
      ${a ? `<section class="section"><div class="container split top">
        <div class="stack">
          <span class="label">Decisão</span>
          <h2 class="heading ${a.decision === 'ENVIAR' ? 'verdant' : a.decision === 'AVISAR' ? 'saffron' : ''}">${esc({ ENVIAR: 'Envia ao parceiro', AVISAR: 'Pergunta para você', SILENCIO: 'Fica em silêncio', IGNORAR: 'Ignora' }[a.decision] || a.decision)}</h2>
          <p class="body muted">${esc(a.reason || '')}</p>
          ${a.resumo ? `<p class="body">🧠 ${esc(a.resumo)}</p>` : ''}
          ${(a.doubtReasons || []).length ? `<div class="caption saffron">${a.doubtReasons.map(esc).join('<br>')}</div>` : ''}
          ${(a.descartes || []).length ? `<div><span class="field"><span>Por que outros imóveis ficaram de fora</span></span><div class="log">${a.descartes.map(d => `<div>#${esc(d.id)} — ${esc(d.motivo)}</div>`).join('')}</div></div>` : ''}
          <p class="caption">${esc(a.usedEngine || '')}${a.detectedTone ? ' · tom: ' + esc(a.detectedTone) : ''}</p>
        </div>
        <div class="stack">${(r.previews || []).length ? r.previews.map(p => `<div><span class="label">Prévia · #${esc(p.property.id)}</span><div class="preview">${esc(p.whatsappMessagePreview)}</div></div>`).join('') : '<p class="body ash">Nenhuma mensagem seria enviada.</p>'}</div>
      </div></section>` : ''}`);
  }

  // ------------------------------------------------------------------ BUSCA INTELIGENTE
  const dataCurta = ts => (ts ? new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—');
  function cardGrupo(g, i) {
    const p = g.prop || {};
    const det = [p.tipo, p.setor || p.edificio, p.tamanho_m2 ? `${p.tamanho_m2} m²` : '', p.quartos ? `${p.quartos} quartos` : '', p.suites ? `${p.suites} suítes` : ''].filter(Boolean).join(' · ');
    return `<div class="item reveal">
      <div class="row between"><h3 class="hxs">${i + 1}. ${esc(det || 'Imóvel')}</h3><span class="tag ${g.status === 'MATCH' ? 'enviar' : 'avisar'}">● ${g.status === 'MATCH' ? 'bate com o pedido' : 'conferir'}</span></div>
      <p class="body" style="margin-top:6px"><b>${p.valor ? brl(p.valor) : 'preço não informado'}</b></p>
      <p class="body muted" style="margin-top:6px">“${esc(String(g.texto || '').slice(0, 300))}${String(g.texto || '').length > 300 ? '…' : ''}”</p>
      ${g.status !== 'MATCH' && (g.faltando || []).length ? `<p class="caption">⚠️ ${esc(g.faltando.slice(0, 2).join('; '))}</p>` : ''}
      <div class="stack-sm" style="margin-top:8px">${(g.fontes || []).map(f => `<div class="row between"><span class="caption">👤 <b>${esc(f.autor)}</b> · ${esc(f.grupo)} · ${dataCurta(f.ts)}</span>${f.telefone ? `<a class="btn-ghost accent" href="https://wa.me/${esc(f.telefone)}" target="_blank" rel="noopener noreferrer">Chamar no WhatsApp ↗</a>` : ''}</div>`).join('')}</div>
    </div>`;
  }
  function cardPortal(x) {
    const det = [x.preco ? brl(x.preco) : 'preço no link', x.area ? `${x.area} m²` : '', x.quartos ? `${x.quartos} quartos` : '', x.bairro].filter(Boolean).join(' · ');
    return `<div class="item reveal">
      <div class="row between"><h3 class="hxs">${esc(x.titulo || x.resumo || 'Imóvel')}</h3><span class="tag">${esc(x.portal)}</span></div>
      <p class="body" style="margin-top:6px">${esc(det)}</p>
      ${x.anunciante ? `<p class="caption">${esc(x.anunciante)}${x.certeza === 'estimativa' ? ' · tipo estimado pelo texto' : ''}</p>` : ''}
      <div class="row tight"><a class="btn-ghost accent" href="${esc(x.link)}" target="_blank" rel="noopener noreferrer">Abrir anúncio ↗</a></div>
    </div>`;
  }
  function resultadoBusca(r) {
    if (!r) return '';
    const p = r.portais || { itens: [] };
    const grupoPorTipo = t => (p.itens || []).filter(x => x.tipoAnunciante === t);
    const motivo = { sem_chave: 'Falta a chave do Gemini (em Configurações, abaixo).', limite: 'Limite diário de buscas atingido. Volta amanhã (ou aumente em Configurações).', cota: 'A cota grátis do Google acabou por hoje.', desligado: 'Todos os portais estão desligados em Configurações.', erro: `O Gemini não respondeu agora${p.detalhe ? ` (${p.detalhe})` : ''}.` }[p.motivo];
    const bloco = (titulo, lista) => (lista.length ? `<span class="label" style="margin-top:16px">${titulo} (${lista.length})</span><div class="list">${lista.map(cardPortal).join('')}</div>` : '');
    return `
      <section class="section"><div class="container">
        <div class="row between reveal"><div><span class="label">Busca nº ${esc(r.id)} · ${esc(when(r.ts))}</span><h2 class="heading-sm">${esc(r.descricao)}</h2></div>
          <button class="btn-ghost accent" data-action="buscaWhats" data-id="${esc(r.id)}">Mandar pro meu WhatsApp</button></div>
      </div></section>
      <section class="section"><div class="container">
        <span class="label reveal">📱 Nos seus grupos (${r.grupos.length})</span>
        <div class="list">${r.grupos.length ? r.grupos.map(cardGrupo).join('') : `<div class="card"><p class="body muted">Nada anunciado com esse perfil nos seus grupos. Memória: ${r.memoria?.total || 0} anúncios${r.memoria?.desde ? `, desde ${dataCurta(r.memoria.desde)}` : ''}.</p></div>`}</div>
      </div></section>
      <section class="section"><div class="container">
        <span class="label reveal">🌐 Nos portais (${(p.itens || []).length})</span>
        ${!p.ok ? `<div class="card"><p class="body muted">Não busquei nos portais: ${esc(motivo || '')} Use as buscas prontas abaixo.</p></div>` : `
          <p class="caption">Só entram anúncios com link confirmado pela busca do Google.</p>
          ${bloco('👤 Particular', grupoPorTipo('particular'))}${bloco('🏢 Profissional', grupoPorTipo('profissional'))}${bloco('❔ Não identificado', grupoPorTipo('desconhecido'))}
          ${!(p.itens || []).length ? '<div class="card"><p class="body muted">Nenhum anúncio confirmado com esse perfil.</p></div>' : ''}
          ${(p.fontesSoltas || []).length ? `<span class="label" style="margin-top:16px">Outras páginas encontradas</span><div class="linkout">${p.fontesSoltas.map(f => `<a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(f.titulo || f.url)}</span><span>↗</span></a>`).join('')}</div>` : ''}`}
      </div></section>
      ${Object.keys(r.links || {}).length ? `<section class="section"><div class="container"><span class="label reveal">🔗 Busca pronta nos portais</span>
        <div class="linkout">${Object.entries(r.links).map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer"><span>${esc(n)} — com os filtros do pedido</span><span>↗</span></a>`).join('')}</div></div></section>` : ''}`;
  }
  function viewBusca() {
    const b = S.busca || { config: {}, memoria: {}, historico: [] };
    const c = b.config || {};
    const m = b.memoria || {};
    const imp = b.importacao;
    shell(`
      ${header('Busca', 'Busca inteligente', 'Escreva o que o seu cliente quer. Eu procuro nos <b>seus grupos</b> (anúncios dos últimos 90 dias: quem anunciou e onde) e na <b>OLX, ZAP e VivaReal</b>, separando particular e profissional. Também dá para fazer tudo pelo “Mensagem para mim”: <b>busca …</b>')}
      <section class="section"><div class="container"><div class="card reveal stack" id="buscaForm">
        ${field('texto', 'Pedido do cliente', S.buscaTexto || '', { area: true, rows: 3, ph: 'Ex.: apartamento de 800 mil a 1 milhão no Setor Marista, mínimo 100 m², 3 quartos' })}
        <div class="row">${toggle('whatsapp', false, 'Mandar também pro meu WhatsApp')}<button class="btn-primary" data-action="buscar">${S.buscando ? 'Buscando… (até 2 min)' : 'Buscar'}</button></div>
        <p class="caption">Buscas nos portais hoje: ${c.usadasHoje || 0} de ${c.limiteDia ?? 20}${c.temChaveGemini ? '' : ' · sem chave do Gemini: só grupos e buscas prontas'}</p>
      </div></div></section>
      ${resultadoBusca(S.buscaAtual)}
      <section class="section"><div class="container"><div class="stats reveal">
        <div class="stat"><div class="n" data-count="${m.total || 0}">0</div><div class="l">anúncios guardados</div></div>
        <div class="stat"><div class="n" data-count="${m.grupos || 0}">0</div><div class="l">grupos</div></div>
        <div class="stat"><div class="n" style="font-size:22px">${m.desde ? esc(dataCurta(m.desde)) : '—'}</div><div class="l">desde (guardo 90 dias)</div></div>
        <div class="stat"><div class="n" data-count="${(b.historico || []).length}">0</div><div class="l">buscas salvas</div></div>
      </div></div></section>
      <section class="section"><div class="container split top">
        <div class="card reveal stack-sm"><span class="label">Memória de anúncios dos grupos</span>
          <p class="body muted">Guardo sozinha todo anúncio que aparece nos seus grupos. Para trazer os <b>anúncios antigos</b>:</p>
          <p class="body"><b>1.</b> Peça ao seu celular (deixe-o ligado e com internet):</p>
          <div class="row tight"><button class="btn-ghost accent" id="btnImportar" data-action="importarHistorico" ${imp && imp.rodando ? 'disabled' : ''}>${imp && imp.rodando ? 'Importando…' : 'Importar histórico dos grupos'}</button></div>
          <p class="caption" id="impAndamento">${imp && imp.rodando ? esc(textoAndamento(imp)) : ''}</p>
          ${imp && !imp.rodando && imp.fim ? `<p class="caption">Última importação: ${imp.anuncios} anúncios de ${imp.comHistorico} de ${imp.grupos} grupos (${esc(when(imp.fim))}).${imp.semAncora.length ? ` Sem mensagem recente para começar: ${esc(imp.semAncora.slice(0, 5).join(', '))}${imp.semAncora.length > 5 ? '…' : ''} — exporte a conversa desses.` : ''}</p>` : ''}
          <p class="body"><b>2.</b> Ou mande a conversa exportada de um grupo (WhatsApp › grupo › Exportar conversa › Sem mídia):</p>
          <div class="row tight"><label class="btn-ghost accent" style="cursor:pointer">Escolher arquivo (.txt ou .zip)<input type="file" id="conversaInput" accept=".txt,.zip,text/plain,application/zip" hidden></label></div>
        </div>
        <div class="card reveal stack-sm" id="buscaCfg"><span class="label">Configurações</span>
          ${toggle('olx', c.olx !== false, 'Buscar na OLX')}
          ${toggle('zap', c.zap !== false, 'Buscar no ZAP Imóveis')}
          ${toggle('vivareal', c.vivareal !== false, 'Buscar no VivaReal')}
          ${toggle('memoriaAtiva', c.memoriaAtiva !== false, 'Guardar os anúncios dos grupos', 'Desligado: paro de guardar anúncios novos (os guardados continuam).')}
          <div class="fields">${field('limiteDia', 'Limite de buscas nos portais por dia', c.limiteDia ?? 20, { type: 'number', attrs: 'min="0" max="500"' })}
          ${field('geminiApiKey', 'Chave do Gemini (grátis em aistudio.google.com)', '', { type: 'password', ph: c.temChaveGemini ? '•••••••• (manter a atual)' : 'cole aqui', attrs: 'autocomplete="off"' })}</div>
          <div class="row"><button class="btn-primary" data-action="salvarBuscaCfg">Salvar configurações</button></div>
        </div>
      </div></section>
      <section class="section"><div class="container stack reveal" id="buscaGrupos">
        <span class="label">Grupos da busca (de onde guardo anúncios, importo o histórico e faço as buscas)</span>
        <p class="caption">São separados dos grupos de pedidos (Ajustes). Conversas exportadas que você mandar sempre entram.</p>
        ${toggle('todosGrupos', c.todosGrupos !== false, 'Usar todos os grupos', 'Desligue para escolher só alguns.')}
        <div ${c.todosGrupos !== false ? 'hidden' : ''} id="escolhaGrupos">
          ${groupSearch('bg', (b.grupos || []).length)}
          <div class="chips scroll" data-filter="bg">${(b.grupos || []).length ? b.grupos.map(g => toggle(`bg:${g.id}`, g.naBusca && c.todosGrupos === false, `${g.subject} · ${g.participantsCount}`)).join('') : '<span class="body ash">Conecte o WhatsApp para listar os grupos.</span>'}</div>
        </div>
        <div class="row"><button class="btn-primary" data-action="salvarBuscaGrupos">Salvar grupos da busca</button></div>
      </div></section>
      <section class="section"><div class="container"><span class="label reveal">Últimas buscas</span>
        <div class="list">${(b.historico || []).length ? b.historico.map(h => `<div class="item reveal row between"><div><p class="body"><b>nº ${esc(h.id)}</b> · ${esc(h.descricao)}</p><p class="caption">${esc(when(h.ts))} · ${h.grupos} nos grupos · ${h.portaisOk ? `${h.portais} nos portais` : 'portais não consultados'}</p></div><div class="row tight"><button class="btn-ghost accent" data-action="verBusca" data-id="${esc(h.id)}">Ver</button><button class="btn-ghost" data-action="buscaWhats" data-id="${esc(h.id)}">WhatsApp</button></div></div>`).join('') : '<div class="card"><p class="body muted">Nenhuma busca ainda.</p></div>'}</div>
      </div></section>`);
    acompanharImportacao();
  }

  // Andamento da importação: atualiza SÓ o texto (sem redesenhar a página — antes ela "piscava"
  // a cada 5 s e apagava o que estava sendo digitado)
  function textoAndamento(imp) {
    return `${imp.vistos || 0} de ${imp.total || '?'} grupos lidos · ${imp.anuncios || 0} anúncios novos${imp.atual ? ` · agora: ${imp.atual}` : ''}`;
  }
  function acompanharImportacao() {
    clearTimeout(S._buscaPoll);
    const imp = S.busca && S.busca.importacao;
    if (!imp || !imp.rodando || S.route !== 'busca') return;
    S._buscaPoll = setTimeout(async () => {
      if (S.route !== 'busca' || document.hidden) return acompanharImportacao();
      try {
        const st = await api('GET', '/api/busca');
        S.busca = st;
        const i = st.importacao;
        const and = $('#impAndamento');
        const btn = $('#btnImportar');
        if (i && i.rodando) {
          if (and) and.textContent = textoAndamento(i);
        } else {
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Importar histórico dos grupos';
          }
          if (and) and.textContent = i ? `Pronto: ${i.anuncios} anúncios de ${i.comHistorico} de ${i.grupos} grupos.` : '';
          toast('Importação do histórico terminou.');
          return;
        }
      } catch {}
      acompanharImportacao();
    }, 5000);
  }

  // ------------------------------------------------------------------ GARIMPO
  function viewGarimpo() {
    const g = S.garimpo || { config: {}, chaves: {}, leads: [], execucoes: [], campanhas: [] };
    const f = S.filtroLead || 'NOVO';
    const leads = g.leads.filter(l => f === 'TODOS' || l.status === f);
    const fonteNome = { web: 'Web pública', instagram: 'Seu Instagram', facebook: 'Seu Facebook' };
    const ult = g.execucoes[0];
    shell(`
      ${header('Garimpo', g.config.ativo ? 'Escavando 24h' : 'Desligado', 'Eu procuro na internet pessoas pedindo imóvel em Goiânia na última semana, leio o que querem e cruzo com a sua carteira. Também acompanho quem comenta nos <b>seus</b> posts e mapeio as campanhas de imóveis no ar.')}
      <section class="section"><div class="container"><div class="stats reveal">
        <div class="stat"><div class="n" data-count="${g.leads.filter(l => l.status === 'NOVO').length}">0</div><div class="l">leads novos</div></div>
        <div class="stat"><div class="n" data-count="${g.leads.filter(l => (l.matches || []).length).length}">0</div><div class="l">com imóvel compatível</div></div>
        <div class="stat"><div class="n" data-count="${g.leads.filter(l => l.status === 'CONTATADO').length}">0</div><div class="l">contatados</div></div>
        <div class="stat"><div class="n" style="font-size:22px">${g.ultimaExecucao ? esc(when(g.ultimaExecucao)) : '—'}</div><div class="l">última varredura${ult ? ` · ${ult.web} páginas lidas` : ''}</div></div>
      </div></div></section>
      ${!g.chaves.busca || !g.chaves.meta ? `<section class="section"><div class="container"><div class="card reveal stack-sm"><span class="label">Para eu começar a escavar</span>
        ${!g.chaves.busca ? '<p class="body">🌐 <b>Busca na web:</b> crie uma chave grátis em <a href="https://brave.com/search/api/" target="_blank" rel="noopener">brave.com/search/api</a> (2.000 buscas/mês) ou no Google Programmable Search, e cole abaixo.</p>' : ''}
        ${!g.chaves.meta ? '<p class="body">📸 <b>Seus posts:</b> com um token da sua Página do Facebook (Meta for Developers › Graph API Explorer) eu leio os comentários de quem pergunta valor e disponibilidade no seu Instagram e Facebook.</p>' : ''}
      </div></div></section>` : ''}
      <section class="section"><div class="container">
        <div class="row between reveal" style="margin-bottom:16px"><div class="row tight">${[['NOVO', 'Novos'], ['CONTATADO', 'Contatados'], ['DESCARTADO', 'Descartados'], ['TODOS', 'Todos']].map(([k, l]) => `<button class="btn-ghost ${f === k ? 'accent' : ''}" data-action="filtroLead" data-v="${k}">${l}</button>`).join('')}</div>
          <button class="btn-primary" data-action="garimpoRodar">${g.rodando ? 'Escavando…' : 'Escavar agora'}</button></div>
        <div class="list">${leads.length ? leads.map(l => `
          <div class="item reveal">
            <div class="row between"><div class="row tight"><span class="tag src ${esc(l.fonte)}"><i></i>${esc(fonteNome[l.fonte] || l.fonte)}</span>${(l.matches || []).length ? `<span class="tag enviar">● você tem #${l.matches.map(esc).join(', #')}</span>` : ''}<span class="caption">${esc(when(l.encontradoEm))}</span></div><span class="lead-score" title="Pontuação do lead">${l.score}</span></div>
            <h3 class="hxs" style="margin-top:10px">${esc(l.titulo || '')}</h3>
            <p class="body muted" style="margin-top:6px">${esc(l.texto || '')}</p>
            <p class="caption">🧠 ${esc(l.resumo || '')}${l.post ? ` · no post: “${esc(l.post)}”` : ''}</p>
            <div class="row tight"><a class="btn-ghost accent" href="${esc(l.link)}" target="_blank" rel="noopener noreferrer">Abrir publicação ↗</a>${l.status !== 'CONTATADO' ? `<button class="btn-ghost" data-action="leadStatus" data-id="${esc(l.id)}" data-s="CONTATADO">Marcar contatado</button>` : ''}${l.status !== 'DESCARTADO' ? `<button class="btn-ghost danger" data-action="leadStatus" data-id="${esc(l.id)}" data-s="DESCARTADO">Descartar</button>` : `<button class="btn-ghost" data-action="leadStatus" data-id="${esc(l.id)}" data-s="NOVO">Restaurar</button>`}</div>
          </div>`).join('') : `<div class="card"><p class="body muted">${g.leads.length ? 'Nada nesta lista.' : 'Ainda não encontrei leads. Configure a busca abaixo e toque em “Escavar agora”.'}</p></div>`}</div>
      </div></section>
      <section class="section"><div class="container split top">
        <div class="card reveal"><span class="label">Campanhas de imóveis no ar (bibliotecas oficiais)</span><p class="body muted">Anúncios ativos de imobiliárias e construtoras em Goiânia, e o interesse de busca na região nos últimos 7 dias.</p>
          <div class="linkout">${(g.campanhas || []).map(c => `<a href="${esc(c.meta)}" target="_blank" rel="noopener noreferrer"><span>Meta (Instagram/Facebook) · ${esc(c.termo)}</span><span>↗</span></a><a href="${esc(c.trends)}" target="_blank" rel="noopener noreferrer"><span>Google Trends Goiás · ${esc(c.termo)}</span><span>↗</span></a>`).join('')}
          <a href="https://adstransparency.google.com/?region=BR" target="_blank" rel="noopener noreferrer"><span>Google (Central de Transparência de Anúncios)</span><span>↗</span></a>
          <a href="https://library.tiktok.com/ads?region=BR" target="_blank" rel="noopener noreferrer"><span>TikTok (Biblioteca de Anúncios)</span><span>↗</span></a></div></div>
        <div class="card reveal stack-sm"><span class="label">O que eu não faço (e por quê)</span>
          <p class="body muted">• Ver <b>quem</b> pesquisou no Google ou visitou ZAP/VivaReal/OLX: esses dados são privados das empresas e não existem para ninguém.</p>
          <p class="body muted">• Ler comentários em posts de <b>outras</b> pessoas no Instagram/TikTok/Facebook: viola as regras das plataformas (pode bloquear sua conta) e a LGPD.</p>
          <p class="body muted">Guardo só o link público, o trecho e o nome exibido, por 30 dias. O contato com o lead é sempre feito por você.</p></div>
      </div></section>
      <section class="section"><div class="container"><div id="garimpoCfg" class="stack reveal">
        <span class="label">Configuração</span>
        ${toggle('ativo', g.config.ativo, g.config.ativo ? 'Garimpo ligado (24h)' : 'Garimpo desligado')}
        ${toggle('alertarNoWhatsApp', g.config.alertarNoWhatsApp !== false, 'Me avisar no WhatsApp quando achar leads novos')}
        <div class="fields">${field('intervaloHoras', 'Escavar a cada (horas)', g.config.intervaloHoras, { type: 'number', attrs: 'min="2" max="48"' })}</div>
        ${field('consultas', 'O que procurar na web (uma busca por linha)', (g.config.consultas || []).join('\n'), { area: true, rows: 8 })}
        ${field('termosCampanha', 'Termos para mapear campanhas (um por linha)', (g.config.termosCampanha || []).join('\n'), { area: true, rows: 4 })}
        <div class="row"><button class="btn-ghost accent" data-action="garimpoSalvar">Salvar configuração</button></div>
        <span class="label" style="margin-top:24px">Chaves das fontes ${g.chaves.buscaProvedor ? `· busca: ${esc(g.chaves.buscaProvedor)} ✓` : ''} ${g.chaves.meta ? '· Meta ✓' : ''}</span>
        <div class="fields wide" id="garimpoKeys">
          ${field('braveKey', 'Brave Search API key', '', { type: 'password', ph: g.chaves.buscaProvedor === 'Brave' ? '•••••• (manter)' : 'cole aqui', attrs: 'autocomplete="off"' })}
          ${field('googleKey', 'Google Programmable Search — API key', '', { type: 'password', ph: 'opcional', attrs: 'autocomplete="off"' })}
          ${field('googleCx', 'Google Programmable Search — ID (cx)', '', { ph: 'opcional' })}
          ${field('metaToken', 'Token da Página (Meta)', '', { type: 'password', ph: g.chaves.meta ? '•••••• (manter)' : 'opcional', attrs: 'autocomplete="off"' })}
          ${field('metaPageId', 'ID da Página do Facebook', '', { ph: 'opcional' })}
          ${field('igUserId', 'ID da conta Instagram Business', '', { ph: 'opcional' })}
        </div>
        <div class="row"><button class="btn-ghost accent" data-action="garimpoChaves">Salvar chaves</button></div>
      </div></div></section>`);
  }

  // ------------------------------------------------------------------ AJUSTES
  function viewAjustes() {
    const c = (S.status && S.status.config) || {};
    const groups = (S.status && S.status.connectedGroups) || [];
    shell(`
      ${header('Ajustes', 'Configurações', 'Grupos de busca, número de alerta, inteligência artificial, planilha e segurança.')}
      <section class="section"><div class="container stack" id="cfgForm">
        <span class="label">Grupos de pedidos (onde a BIGA lê os pedidos e oferece a sua carteira)</span>
        <p class="caption">Os grupos da <b>Busca inteligente</b> são escolhidos à parte, na página Busca.</p>
        ${groupSearch('mg', groups.length)}
        <div class="chips scroll" data-filter="mg">${groups.length ? groups.map(g => toggle(`mg:${g.id}`, g.monitored, `${g.subject} · ${g.participantsCount}`)).join('') : '<span class="body ash">Conecte o WhatsApp para listar os grupos.</span>'}</div>
        <div class="row tight"><button class="btn-ghost" data-action="refreshGroups">Atualizar lista de grupos</button></div>
        <div class="fields wide">
          ${field('meuWhatsappAlerta', 'Seu WhatsApp para alertas', c.meuWhatsappAlerta, { type: 'tel', ph: 'vazio = conversa “Mensagem para mim”' })}
          ${field('assistenteNumerosExtras', 'Outros números que podem comandar a BIGA', c.assistenteNumerosExtras, { ph: '62999990000, 62988880000' })}
          ${field('minCriteriosParaEnvio', 'Mínimo de critérios para enviar sozinha', c.minCriteriosParaEnvio, { type: 'number', attrs: 'min="1" max="6"' })}
          ${field('maxOfertasPorPedido', 'Máximo de imóveis por pedido', c.maxOfertasPorPedido, { type: 'number', attrs: 'min="1" max="5"' })}
          ${field('maxPhotosPerMatch', 'Fotos por imóvel enviado', c.maxPhotosPerMatch, { type: 'number', attrs: 'min="0" max="10"' })}
          ${field('resumoDiarioHorario', 'Horário do resumo diário', c.resumoDiarioHorario, { type: 'time' })}
        </div>
        <div class="stack-sm">
          ${toggle('modoApenasAvisar', c.modoApenasAvisar, 'Modo apenas avisar', 'Não envia nada sozinha: te avisa e você responde “enviar A12”.')}
          ${toggle('alertarQuase', c.alertarQuase, 'Avisar quando um imóvel quase serve', 'Ex.: bate em tudo, mas não sei se aceita permuta.')}
          ${toggle('enviarPdfQuandoPedir', c.enviarPdfQuandoPedir, 'Mandar ficha em PDF quando o corretor pedir')}
          ${toggle('assistenteAtivo', c.assistenteAtivo, 'Assistente no WhatsApp (“Mensagem para mim”)')}
          ${toggle('resumoDiarioAtivo', c.resumoDiarioAtivo, 'Resumo diário no meu WhatsApp')}
          ${toggle('usarIaGemini', c.usarIaGemini, 'Usar Google Gemini para reforçar nomes de lugares', c.hasGeminiKey ? 'Chave configurada.' : 'Sem chave: funciona só com o mapa e as regras.')}
        </div>
        <div class="fields wide">
          ${field('geminiApiKey', 'Chave do Gemini (grátis em aistudio.google.com)', '', { type: 'password', ph: c.hasGeminiKey ? '•••••••• (manter a atual)' : 'cole aqui', attrs: 'autocomplete="off"' })}
          ${field('googleSheetsUrl', 'Link CSV do Google Sheets (importar)', c.googleSheetsUrl, { ph: 'https://docs.google.com/…' })}
          ${field('googleSheetsWebhookUrl', 'Webhook do Apps Script (sincronizar)', c.googleSheetsWebhookUrl, { ph: 'https://script.google.com/…/exec' })}
        </div>
        <div class="row"><button class="btn-primary" data-action="salvarAjustes">Salvar ajustes</button><button class="btn-ghost accent" data-action="testAlert">Testar alerta</button></div>
      </div></section>
      <section class="section"><div class="container split top">
        <div class="stack" id="pwForm"><span class="label">Senha do painel</span>${field('atual', 'Senha atual', '', { type: 'password', attrs: 'autocomplete="current-password"' })}${field('nova', 'Nova senha (mín. 8)', '', { type: 'password', attrs: 'autocomplete="new-password"' })}<div><button class="btn-ghost accent" data-action="trocarSenha">Trocar senha</button></div></div>
        <div class="stack" id="bkForm"><span class="label">Backup da memória</span><p class="body muted">Um arquivo com carteira, fotos, configurações, contatos conhecidos, radar, vitrine e prospecção. Use para mudar de servidor ou se algo der errado. Todo domingo a BIGA também manda um backup no seu WhatsApp.</p>
          ${toggle('backupSemanalAtivo', c.backupSemanalAtivo !== false, 'Backup semanal no meu WhatsApp')}
          <div class="row tight"><a class="btn-ghost accent" href="/api/backup" download>Baixar backup agora</a><label class="btn-ghost" style="cursor:pointer">Restaurar backup…<input type="file" id="restoreInput" accept=".gz,application/gzip"></label></div></div>
        <div class="stack" id="sysBox"><span class="label">Sistema</span><p class="body muted">Versão em uso: <b>${esc((S.sistema && S.sistema.versao) || '?')}</b>. A BIGA se atualiza sozinha toda madrugada; aqui você puxa a versão nova na hora, direto do celular.</p>
          ${S.sistema && S.sistema.resultados && S.sistema.resultados.length ? `<div class="log">${S.sistema.resultados.map(r => `<div>${esc(r)}</div>`).join('')}</div>` : ''}
          <div class="row tight"><button class="btn-ghost accent" data-action="atualizarAgora" ${S.sistema && !S.sistema.naVM ? 'disabled' : ''}>Atualizar agora</button></div></div>
        <div class="stack"><span class="label">Sessão</span><p class="body muted">Desconectar o WhatsApp apaga a sessão e gera um novo QR Code.</p><div class="row tight"><button class="btn-ghost danger" data-action="resetWa">Desconectar WhatsApp</button><button class="btn-ghost" data-action="logout">Sair do painel</button></div></div>
      </div></section>`);
  }

  // ------------------------------------------------------------------ carregamento
  async function loadStatus() {
    S.status = await api('GET', '/api/status');
  }
  const loaders = {
    inicio: loadStatus,
    hoje: loadStatus,
    geral: loadStatus,
    garimpo: async () => (S.garimpo = await api('GET', '/api/garimpo')),
    busca: async () => (S.busca = await api('GET', '/api/busca')),
    radar: async () => (S.radar = await api('GET', '/api/radar')),
    carteira: async () => (S.inventory = (await api('GET', '/api/inventory')).inventory),
    vitrine: async () => {
      S.vitrine = await api('GET', '/api/vitrine');
      S.inventory = (await api('GET', '/api/inventory')).inventory;
    },
    prospeccao: async () => {
      S.prosp = await api('GET', '/api/prospeccao');
      S.contatos = (await api('GET', '/api/contatos')).contatos;
    },
    atendimento: loadStatus,
    cerebro: async () => (S.cerebro = await api('GET', '/api/cerebro')),
    simulador: async () => {},
    ajustes: async () => {
      await loadStatus();
      S.sistema = await api('GET', '/api/sistema').catch(() => null);
    }
  };
  const views = { inicio: viewHome, hoje: viewGeral, geral: viewGeral, garimpo: (...a) => viewGarimpo(...a), busca: viewBusca, radar: viewRadar, carteira: viewCarteira, vitrine: viewVitrine, prospeccao: viewProspeccao, atendimento: viewAtendimento, cerebro: viewCerebro, simulador: viewSimulador, ajustes: viewAjustes };

  // Desenha a página atual. Ao TROCAR de página (go) anima a entrada; nas atualizações da mesma
  // página não anima, mantém a rolagem e (manterCampos) o que estava sendo digitado.
  function render(opts = {}) {
    if (!S.authed) return viewLogin();
    const navegando = Boolean(S._navegando);
    const y = scrollY;
    const campos = opts.manterCampos ? capturarCampos() : null;
    root.classList.toggle('sem-anim', !navegando);
    (views[S.route] || viewHome)();
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
    const r = (location.hash || '#inicio').slice(1);
    S.route = views[r] ? r : location.pathname === '/dia-a-dia' ? 'atendimento' : 'inicio';
    S.editing = null;
    if (!S.authed) return render();
    const animate = S._booted;
    S._booted = true;
    const curtainIn = animate ? playCurtain('go') : Promise.resolve();
    try {
      if (!S.status) await loadStatus();
      await Promise.all([loaders[S.route](), curtainIn]);
    } catch (err) {
      toast(err.message, true);
    }
    S._navegando = true;
    render();
    S._navegando = false;
    scrollTo(0, 0);
    if (animate) playCurtain('out');
  }

  // Atualização automática da visão geral (QR Code, atividade)
  setInterval(async () => {
    if (!S.authed || document.hidden || !['hoje', 'geral'].includes(S.route)) return;
    if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    try {
      const antes = JSON.stringify(S.status);
      await loadStatus();
      if (JSON.stringify(S.status) !== antes) render({ manterCampos: true }); // só redesenha se algo mudou
    } catch {}
  }, 5000);

  // ------------------------------------------------------------------ ações
  async function uploadFiles(files) {
    const fd = new FormData();
    [...files].forEach(f => fd.append('photos', f));
    return (await api('POST', '/api/upload-photos', fd, true)).files;
  }

  function collectVitrine() {
    const box = $('#vitrineCfg');
    const d = formData(box);
    const grupos = Object.keys(d).filter(k => k.startsWith('g:') && d[k]).map(k => k.slice(2));
    const diasSemana = [0, 1, 2, 3, 4, 5, 6].filter(i => d[`d${i}`]);
    return { ativo: d.ativo, horarios: [d.h0, d.h1, d.h2, d.h3].filter(Boolean), porHorario: d.porHorario, grupos, diasSemana };
  }

  function collectRules() {
    return $$('[data-rule]').map(el => formData(el));
  }
  function collectPlaces() {
    return $$('[data-place]').map(el => formData(el));
  }

  async function saveConfig(body, msg = 'Salvo!') {
    const r = await api('POST', '/api/config', body);
    if (S.status) S.status.config = r.config;
    toast(msg);
  }

  const actions = {
    buscar: async () => {
      const f = formData($('#buscaForm'));
      S.buscaTexto = f.texto;
      if (!String(f.texto || '').trim()) return toast('Escreva o pedido do cliente.', true);
      S.buscando = true;
      render();
      toast('Buscando nos grupos e nos portais…');
      try {
        const r = await api('POST', '/api/busca', { texto: f.texto, whatsapp: f.whatsapp });
        S.buscaAtual = r.busca;
        S.busca = r.estado;
        toast(`${r.busca.grupos.length} nos grupos · ${(r.busca.portais.itens || []).length} nos portais${f.whatsapp ? ' · mandei no seu WhatsApp' : ''}`);
      } finally {
        S.buscando = false;
        render();
      }
    },
    verBusca: async el => {
      S.buscaAtual = await api('GET', `/api/busca/item/${encodeURIComponent(el.dataset.id)}`);
      render();
      scrollTo({ top: 0, behavior: 'smooth' });
    },
    buscaWhats: async el => {
      await api('POST', `/api/busca/item/${encodeURIComponent(el.dataset.id)}/whatsapp`);
      toast('Relatório enviado para o seu WhatsApp.');
    },
    importarHistorico: async () => {
      const r = await api('POST', '/api/busca/importar-historico');
      S.busca = r.estado;
      toast('Importando… deixe o celular ligado. Eu aviso no WhatsApp quando terminar.');
      const btn = $('#btnImportar');
      if (btn) {
        btn.textContent = 'Importando…';
        setTimeout(() => (btn.disabled = true), 0); // depois do clique (o clique reabilita o botão ao terminar)
      }
      if (r.estado.importacao && $('#impAndamento')) $('#impAndamento').textContent = textoAndamento(r.estado.importacao);
      acompanharImportacao();
    },
    salvarBuscaGrupos: async () => {
      const f = formData($('#buscaGrupos'));
      const gruposIds = Object.keys(f).filter(k => k.startsWith('bg:') && f[k]).map(k => k.slice(3));
      if (!f.todosGrupos && !gruposIds.length) return toast('Marque pelo menos um grupo (ou ligue "Usar todos os grupos").', true);
      const r = await api('POST', '/api/busca/config', f.todosGrupos ? { todosGrupos: true } : { gruposIds });
      S.busca = r.estado;
      toast(f.todosGrupos ? 'Busca em todos os grupos.' : `Busca em ${gruposIds.length} grupo(s).`);
      render();
    },
    salvarBuscaCfg: async () => {
      const f = formData($('#buscaCfg'));
      if (!f.geminiApiKey) delete f.geminiApiKey;
      const r = await api('POST', '/api/busca/config', f);
      S.busca = r.estado;
      toast(r.chaveMsg || 'Configurações da busca salvas.');
      render();
    },
    atualizarAgora: async () => {
      const r = await api('POST', '/api/sistema/atualizar');
      toast(r.message);
      setTimeout(async () => {
        S.sistema = await api('GET', '/api/sistema').catch(() => S.sistema);
        if (S.route === 'ajustes') render();
      }, 120000);
    },
    filtroLead: el => {
      S.filtroLead = el.dataset.v;
      render();
    },
    garimpoRodar: async () => {
      toast('Escavando a internet… pode levar alguns minutos.');
      const r = await api('POST', '/api/garimpo/rodar');
      S.garimpo = r.state;
      toast(r.ok === false ? r.erro : `${r.novos || 0} lead(s) novo(s).${r.semChave && r.semChave.length ? ' Falta configurar: ' + r.semChave.join(', ') : ''}`, r.ok === false);
      render();
    },
    garimpoSalvar: async () => {
      const r = await api('POST', '/api/garimpo/config', formData($('#garimpoCfg')));
      S.garimpo.config = r.config;
      toast('Garimpo salvo!');
      render();
    },
    garimpoChaves: async () => {
      const r = await api('POST', '/api/garimpo/chaves', formData($('#garimpoKeys')));
      S.garimpo = r.state;
      toast('Chaves salvas.');
      render();
    },
    leadStatus: async el => {
      S.garimpo = (await api('POST', `/api/garimpo/lead/${el.dataset.id}`, { status: el.dataset.s })).state;
      render();
    },
    soMarcados: el => {
      const box = document.querySelector(`[data-filter="${el.dataset.target}"]`);
      if (!box) return;
      box.dataset.only = box.dataset.only === '1' ? '0' : '1';
      el.classList.toggle('accent', box.dataset.only === '1');
      el.textContent = box.dataset.only === '1' ? 'Mostrar todos' : 'Só os marcados';
      applyGroupFilter(el.dataset.target);
    },
    filtroRadar: el => {
      S.filtroRadar = el.dataset.v;
      render();
    },
    aprovarRadar: async el => {
      const r = await api('POST', `/api/radar/${el.dataset.code}/enviar`, { propId: el.dataset.id });
      toast(r.message || 'Enviado!');
      await loaders.radar();
      render();
    },
    aprovarOutro: async el => {
      const id = prompt('Número (#) do imóvel para enviar:');
      if (!id) return;
      const r = await api('POST', `/api/radar/${el.dataset.code}/enviar`, { propId: id.replace(/\D/g, '') });
      toast(r.message || 'Enviado!');
      await loaders.radar();
      render();
    },
    novoImovel: () => {
      S.editing = { fotos: [], ativo: true, cidade: 'Goiânia' };
      render();
    },
    editar: el => {
      S.editing = JSON.parse(JSON.stringify(S.inventory.find(p => String(p.id) === el.dataset.id)));
      render();
      scrollTo(0, 0);
    },
    cancelarEdicao: () => {
      S.editing = null;
      render();
    },
    capa: el => {
      const i = Number(el.dataset.i);
      const fotos = syncEditing().fotos;
      fotos.unshift(...fotos.splice(i, 1));
      render();
    },
    rmFoto: el => {
      syncEditing().fotos.splice(Number(el.dataset.i), 1);
      render();
    },
    salvarImovel: async () => {
      const p = syncEditing();
      const r = p.id ? await api('PUT', `/api/property/${p.id}`, p) : await api('POST', '/api/property', p);
      S.inventory = r.inventory;
      S.editing = null;
      toast(`Imóvel #${r.property.id} salvo!`);
      render();
    },
    ativo: async el => {
      const p = S.inventory.find(x => String(x.id) === el.dataset.id);
      const r = await api('PUT', `/api/property/${p.id}`, { ativo: !p.ativo });
      S.inventory = r.inventory;
      render();
    },
    excluir: async el => {
      if (!confirm(`Excluir o imóvel #${el.dataset.id}? Isso não pode ser desfeito.`)) return;
      S.inventory = (await api('DELETE', `/api/property/${el.dataset.id}`)).inventory;
      toast('Excluído.');
      render();
    },
    aVitrine: async el => {
      await api('POST', `/api/vitrine/post/${el.dataset.id}`, {});
      location.hash = '#vitrine';
    },
    importGoogle: async () => {
      S.inventory = (await api('GET', '/api/inventory?refresh=google')).inventory;
      toast('Planilha importada.');
      render();
    },
    salvarVitrine: async () => {
      const r = await api('POST', '/api/vitrine/config', collectVitrine());
      S.vitrine.config = r.config;
      toast('Vitrine salva!');
      render();
    },
    gerarPosts: async () => {
      const r = await api('POST', '/api/vitrine/gerar');
      S.vitrine = r.state;
      toast(`${r.criados} rascunho(s) criado(s).`);
      render();
    },
    vitrineAgora: async () => {
      if (!confirm('Publicar agora nos grupos de divulgação selecionados?')) return;
      toast('Publicando… pode levar alguns minutos.');
      const r = await api('POST', '/api/vitrine/enviar-agora');
      toast(`Publicado em ${r.enviados} grupo(s).`);
      await loaders.vitrine();
      render();
    },
    salvarPost: async el => {
      const texto = $(`[data-post="${el.dataset.id}"] textarea`).value;
      const r = await api('POST', `/api/vitrine/post/${el.dataset.id}`, { texto });
      S.vitrine.posts[el.dataset.id] = r.post;
      toast('Texto salvo (aguardando aprovação).');
      render();
    },
    aprovarPost: async el => {
      const texto = $(`[data-post="${el.dataset.id}"] textarea`).value;
      await api('POST', `/api/vitrine/post/${el.dataset.id}`, { texto });
      const r = await api('POST', `/api/vitrine/post/${el.dataset.id}/status`, { status: 'APROVADO' });
      S.vitrine.posts[el.dataset.id] = r.post;
      toast('Aprovado para a vitrine!');
      render();
    },
    reprovarPost: async el => {
      const r = await api('POST', `/api/vitrine/post/${el.dataset.id}/status`, { status: 'REPROVADO' });
      S.vitrine.posts[el.dataset.id] = r.post;
      render();
    },
    fotoPost: async el => {
      const r = await api('POST', `/api/vitrine/post/${el.dataset.id}`, { foto: el.dataset.f });
      S.vitrine.posts[el.dataset.id] = r.post;
      render();
    },
    selTodos: () => {
      const f = (S.filtroContato || '').toLowerCase();
      S.contatos.filter(c => !f || (c.nome + c.telefone).toLowerCase().includes(f)).forEach(c => S.selContacts.add(c.telefone));
      render();
    },
    selNenhum: () => {
      S.selContacts.clear();
      render();
    },
    rmCampImg: () => {
      S.campImg = '';
      render();
    },
    criarCampanha: el => criarCampanha(true, el),
    criarRascunho: el => criarCampanha(false, el),
    campStatus: async el => {
      S.prosp = (await api('POST', `/api/prospeccao/campanha/${el.dataset.id}/status`, { status: el.dataset.s })).state;
      render();
    },
    campExcluir: async el => {
      if (!confirm('Excluir esta campanha?')) return;
      S.prosp = (await api('DELETE', `/api/prospeccao/campanha/${el.dataset.id}`)).state;
      render();
    },
    salvarProspCfg: async () => {
      const r = await api('POST', '/api/prospeccao/config', formData($('#prospCfg')));
      S.prosp.config = r.config;
      toast('Ritmo salvo!');
      render();
    },
    addRule: () => {
      const rules = collectRules();
      rules.push({ trigger: '', response: '', active: true });
      S.status.config.dailySimpleReplies = rules;
      render();
    },
    rmRule: el => {
      const rules = collectRules();
      rules.splice(Number(el.dataset.i), 1);
      S.status.config.dailySimpleReplies = rules;
      render();
    },
    salvarAtendimento: async () => {
      const d = formData($('#atdForm'));
      const body = {
        firstContactEnabled: d.firstContactEnabled,
        firstContactMessage: d.firstContactMessage,
        firstContactIgnorarAgenda: d.firstContactIgnorarAgenda,
        firstContactAquecimentoMin: d.firstContactAquecimentoMin,
        missedCallEnabled: d.missedCallEnabled,
        missedCallMessage: d.missedCallMessage,
        dailySimpleReplies: collectRules()
      };
      await saveConfig(body, 'Atendimento salvo!');
      render();
    },
    resetContato: async () => {
      const r = await api('POST', '/api/daily/reset-contact', formData($('#resetForm')));
      toast(r.message);
    },
    addPlace: () => {
      S.cerebro.extraPlaces = [...collectPlaces(), { name: '', kind: 'edificio', bairro: '', aliases: '' }];
      render();
    },
    rmPlace: el => {
      const list = collectPlaces();
      list.splice(Number(el.dataset.i), 1);
      S.cerebro.extraPlaces = list;
      render();
    },
    salvarPlaces: async () => {
      const r = await api('POST', '/api/cerebro/lugares', { extraPlaces: collectPlaces() });
      S.cerebro.extraPlaces = r.extraPlaces;
      toast('Lugares salvos — a BIGA já aprendeu.');
      render();
    },
    salvarTreino: async () => {
      await saveConfig(formData($('#treino')), 'Jeito de falar salvo!');
      render();
    },
    templatePadrao: () => {
      $('#treino textarea[name=messageTemplate]').value = S.status.config.defaultMessageTemplate;
    },
    simular: async () => {
      const d = formData($('#simForm'));
      S.simMsg = d.message;
      S.simSender = d.senderName;
      S.sim = await api('POST', '/api/simulate', d);
      render();
    },
    refreshGroups: async () => {
      await api('GET', '/api/groups?refresh=1');
      await loadStatus();
      toast('Grupos atualizados.');
      render();
    },
    salvarAjustes: async () => {
      const d = { ...formData($('#cfgForm')), ...formData($('#bkForm')) };
      const ids = Object.keys(d).filter(k => k.startsWith('mg:') && d[k]).map(k => k.slice(3));
      for (const k of Object.keys(d)) if (k.startsWith('mg:')) delete d[k];
      d.gruposMonitoradosIds = ids;
      if (!d.geminiApiKey) delete d.geminiApiKey;
      await saveConfig(d, 'Ajustes salvos!');
      await loadStatus();
      render();
    },
    testAlert: async () => {
      const r = await api('POST', '/api/test-alert');
      toast(r.ok ? 'Alerta enviado ao seu WhatsApp!' : r.error || 'Não foi possível enviar.', !r.ok);
    },
    trocarSenha: async () => {
      await api('POST', '/api/change-password', formData($('#pwForm')));
      toast('Senha alterada!');
      render();
    },
    resetWa: async () => {
      if (!confirm('Desconectar o WhatsApp? Você vai precisar escanear um novo QR Code.')) return;
      await api('POST', '/api/whatsapp/reset-session');
      toast('Desconectado. Aguarde o novo QR Code.');
      location.hash = '#geral';
    },
    logout: async () => {
      await api('POST', '/api/logout');
      S.authed = false;
      render();
    }
  };

  async function criarCampanha(iniciar) {
    const d = formData($('#campForm'));
    let contatos = S.contatos.filter(c => S.selContacts.has(c.telefone));
    if (d.colar && d.colar.trim()) contatos = contatos.concat((await api('POST', '/api/prospeccao/parse', { texto: d.colar })).contatos);
    if (iniciar && !confirm(`Iniciar campanha para ${contatos.length} contato(s)? O envio é gradual, no ritmo configurado.`)) return;
    const r = await api('POST', '/api/prospeccao/campanha', { nome: d.nome, mensagem: d.mensagem, imagem: S.campImg || '', contatos, iniciar });
    S.prosp = r.state;
    S.selContacts.clear();
    S.campImg = '';
    toast(iniciar ? 'Campanha iniciada!' : 'Rascunho salvo.');
    render();
  }

  function syncEditing() {
    const box = $('#propForm');
    if (box && S.editing) Object.assign(S.editing, formData(box));
    return S.editing;
  }

  // Clique em qualquer elemento com data-action / data-toggle
  root.addEventListener('click', async e => {
    const tg = e.target.closest('[data-toggle]');
    if (tg) {
      const on = tg.getAttribute('aria-pressed') !== 'true';
      tg.setAttribute('aria-pressed', String(on));
      const k = tg.dataset.toggle;
      if (k.startsWith('c:')) {
        on ? S.selContacts.add(k.slice(2)) : S.selContacts.delete(k.slice(2));
        return;
      }
      if (k.startsWith('g:')) applyGroupFilter('vit');
      if (k.startsWith('mg:')) applyGroupFilter('mg');
      if (k.startsWith('bg:')) applyGroupFilter('bg');
      if (k === 'todosGrupos' && $('#escolhaGrupos')) {
        $('#escolhaGrupos').hidden = on;
        applyGroupFilter('bg');
      }
      if (k === 'pausado' && ['hoje', 'geral'].includes(S.route)) {
        try {
          await saveConfig({ pausado: on }, on ? 'BIGA pausada.' : 'BIGA de volta ao trabalho!');
          render();
        } catch (err) {
          toast(err.message, true);
        }
      }
      return;
    }
    const el = e.target.closest('[data-action]');
    if (!el || !actions[el.dataset.action]) return;
    e.preventDefault();
    const isBtn = el.tagName === 'BUTTON';
    if (isBtn) el.disabled = true;
    try {
      await actions[el.dataset.action](el);
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
    const n = e.target.name;
    if (n === 'filtroGrupo') return applyGroupFilter(e.target.dataset.target);
    if (n === 'texto' && e.target.closest('#buscaForm')) S.buscaTexto = e.target.value; // não perde o pedido se a tela atualizar
    if (n === 'busca' || n === 'filtroContato' || n === 'filtroBairro') {
      const key = { busca: 'filtro', filtroContato: 'filtroContato', filtroBairro: 'filtroBairro' }[n];
      S[key] = e.target.value;
      clearTimeout(S._ft);
      S._ft = setTimeout(() => {
        const pos = e.target.selectionStart;
        render();
        const again = $(`[name="${n}"]`);
        if (again) {
          again.focus();
          again.setSelectionRange(pos, pos);
        }
      }, 250);
    }
  });
  root.addEventListener('change', async e => {
    try {
      if (e.target.id === 'fotoInput' && e.target.files.length) {
        const p = syncEditing();
        toast('Enviando fotos…');
        p.fotos = [...(p.fotos || []), ...(await uploadFiles(e.target.files))];
        render();
      }
      if (e.target.id === 'restoreInput' && e.target.files.length) {
        if (!confirm('Restaurar este backup? A carteira, as configurações e a memória atuais serão substituídas e a BIGA reinicia.')) {
          e.target.value = '';
          return;
        }
        const fd = new FormData();
        fd.append('backup', e.target.files[0]);
        const r = await api('POST', '/api/restore', fd, true);
        toast(`Restaurado: ${r.arquivos.length} arquivos e ${r.fotos} fotos. Reiniciando…`);
        setTimeout(() => location.reload(), 9000);
        return;
      }
      if (e.target.id === 'conversaInput' && e.target.files.length) {
        const fd = new FormData();
        fd.append('arquivo', e.target.files[0]);
        toast('Lendo a conversa…');
        const r = await api('POST', '/api/busca/importar-conversa', fd, true);
        S.busca = r.estado;
        toast(`"${r.grupo}": ${r.anuncios} anúncios guardados de ${r.lidas} mensagens.`);
        render();
        return;
      }
      if (e.target.id === 'campImg' && e.target.files.length) {
        S.campDraft = formData($('#campForm'));
        S.campImg = (await uploadFiles(e.target.files))[0];
        render();
        if (S.campDraft) {
          $('#campForm [name=nome]').value = S.campDraft.nome || '';
          $('#campForm [name=mensagem]').value = S.campDraft.mensagem || '';
          $('#campForm [name=colar]').value = S.campDraft.colar || '';
        }
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
