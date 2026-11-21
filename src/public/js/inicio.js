/* Telas de entrada e visão diária: Login, Início e Hoje */
(() => {
  'use strict';

  const BIGA = window.BIGA;
  const {
    $, esc, safeQrSvg, root, S, api, toast, loadStatus, saveConfig, register,
    ART, LOGO, detachArt, attachArt, field, header, toggle, formData,
    GRUPOS, paginasDo, stopSay, say, shell
  } = BIGA;
  const render = opts => BIGA.render(opts);
  const go = () => BIGA.go();

  // ------------------------------------------------------------------ LOGIN
  function viewLogin() {
    const setup = !S.configured;
    stopSay();
    detachArt();
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
    attachArt($('#stage'));
    say(setup ? 'Oi! Eu sou a BIGA. Crie sua senha para começarmos.' : 'Oi! Eu sou a BIGA. Que bom te ver de novo.');
    $('#loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      const d = formData(e.target);
      try {
        await api('POST', setup ? '/api/setup' : '/api/login', d);
        S.authed = true;
        S.configured = true;
        S._booted = false;
        await go();
      } catch (err) {
        toast(err.message, true);
      }
    });
  }

  // ------------------------------------------------------------------ INÍCIO (BIGA + menu)
  function viewHome() {
    const st = S.status || {};
    const h = st.hoje || {};
    const conn = st.connectionStatus === 'CONECTADO';
    const paused = st.config && st.config.pausado;
    const saud = st.daily?.currentPeriodGreeting || 'Olá';
    const qr = safeQrSvg(st.qrSvg);
    stopSay();
    detachArt();
    root.innerHTML = `
      <main class="home page-enter">
        <div class="sky">${ART.skySVG()}</div>
        <nav class="nav"><div class="bar"><a class="logo" href="#inicio">${LOGO}</a><div class="links"></div>
          <span class="status-dot"><span class="dot ${paused ? 'warn' : conn ? 'on' : ''}"></span>${paused ? 'Pausada' : conn ? 'Online' : st.connectionStatus === 'AGUARDANDO_QR_CODE' ? 'Ler QR' : 'Offline'}</span>
          ${typeof BIGA.hamburgerBtnHtml === 'function' ? BIGA.hamburgerBtnHtml() : ''}</div></nav>
        <div class="wrap">
          <div class="biga-stage" id="stage"><div class="halo"></div><div class="rings"><span></span><span></span><span></span></div>${ART.bigaSVG('b')}
            <div class="speech"><span class="wave"><i></i><i></i><i></i><i></i></span><span id="say" class="typing"></span></div></div>
          <div class="home-menu">
            <div class="hello">${esc(saud)}${st.self?.name ? ', ' + esc(st.self.name.split(' ')[0]) : ''}</div>
            <h1 class="display">Eu sou a BIGA.</h1>
            <p class="sub">${conn ? (paused ? 'Estou pausada. Toque em Hoje para me retomar.' : 'Estou de olho nos grupos, nas ligações e nas conversas novas. Para onde vamos?') : 'Preciso que você conecte o WhatsApp para eu começar.'}</p>
            ${!conn && qr ? `<div class="card" style="display:flex;gap:20px;align-items:center;margin-bottom:20px;flex-wrap:wrap"><div class="qr" style="width:180px">${qr}</div><p class="body muted" style="flex:1;min-width:180px">WhatsApp › Configurações › Aparelhos conectados › <b>Conectar aparelho</b> e aponte para o código.</p></div>` : ''}
            <div class="home-groups">${GRUPOS.map(([g, ic, nome, desc], gi) => `<div class="hg" style="animation-delay:${0.08 + gi * 0.08}s"><div class="hg-head"><span class="hg-ic" aria-hidden="true">${ic}</span><div><b>${nome}</b><span>${desc}</span></div></div><div class="hg-links">${paginasDo(g).map(([k, l, d, , pic]) => `<a href="#${k}" data-say="${esc(d)}"><span aria-hidden="true">${pic}</span>${l}</a>`).join('')}</div></div>`).join('')}</div>
            <div class="kpis"><div><b>${Number(st.radarHoje) || 0}</b>pedidos hoje</div><div><b>${Number(h.ofertas_enviadas) || 0}</b>imóveis enviados</div><div><b>${Number(h.novas_conversas) || 0}</b>conversas novas</div><div><b>${Number(st.inventoryCount) || 0}</b>imóveis ativos</div></div>
          </div>
        </div>
      </main>
      ${typeof BIGA.renderMobileShellExtras === 'function' ? BIGA.renderMobileShellExtras('inicio') : ''}`;
    attachArt($('#stage'));
    say(conn ? `${saud}! Tenho ${Number(st.radarHoje) || 0} pedido(s) dos grupos hoje. Escolha uma página ao lado.` : 'Oi! Escaneie o QR Code para eu me conectar ao seu WhatsApp.');
  }

  // ------------------------------------------------------------------ HOJE
  function viewGeral() {
    const st = S.status || {};
    const h = st.hoje || {};
    const conn = st.connectionStatus === 'CONECTADO';
    const qr = safeQrSvg(st.qrSvg);
    const logs = (st.activityLogs || []).slice(0, 25);
    shell(`
      ${header(`${esc(st.daily?.currentPeriodGreeting || 'Olá')}.<br><span class="muted">${conn ? 'Tudo sob controle.' : 'Vamos conectar?'}</span>`, 'Hoje', conn ? `Conectada como <b>${esc(st.self?.name || st.self?.phone || '')}</b>. Monitorando ${st.connectedGroups ? st.connectedGroups.filter(g => g.monitored).length : 0} grupo(s) de busca com ${Number(st.inventoryCount) || 0} imóveis ativos.` : 'Escaneie o QR Code com o WhatsApp do seu celular: Configurações › Aparelhos conectados › Conectar aparelho.')}
      ${!conn && qr ? `<section class="section"><div class="container"><div class="card split rev reveal"><div class="qr">${qr}</div><div class="intro"><span class="label">QR Code</span><p class="body muted">O código muda a cada poucos segundos — esta tela atualiza sozinha.</p></div></div></div></section>` : ''}
      <section class="section"><div class="container"><div class="stats reveal">
        ${[['Pedidos lidos', Number(st.radarHoje) || 0], ['Imóveis enviados', Number(h.ofertas_enviadas) || 0], ['Para conferir', Number(h.duvidas) || 0], ['Novas conversas', Number(h.novas_conversas) || 0], ['Ligações respondidas', Number(h.ligacoes_perdidas) || 0], ['Leads do Garimpo', Number(h.garimpo_leads) || 0]].map(([l, n]) => `<div class="stat"><div class="n" data-count="${n}">${n}</div><div class="l">${l}</div></div>`).join('')}
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

  // Atualização automática da visão geral (QR Code, atividade)
  let pollingStatus = false;
  setInterval(async () => {
    if (pollingStatus || !S.authed || document.hidden || !['hoje', 'geral'].includes(S.route)) return;
    if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    pollingStatus = true;
    try {
      const antes = JSON.stringify(S.status);
      await loadStatus();
      if (['hoje', 'geral'].includes(S.route) && JSON.stringify(S.status) !== antes) render({ manterCampos: true }); // só redesenha se algo mudou
    } catch {} finally {
      pollingStatus = false;
    }
  }, 5000);

  BIGA.viewLogin = viewLogin;
  BIGA.viewHome = viewHome;
  register({
    views: { inicio: viewHome, hoje: viewGeral, geral: viewGeral },
    loaders: { inicio: loadStatus, hoje: loadStatus, geral: loadStatus },
    onToggle: async (k, on) => {
      if (k !== 'pausado' || !['hoje', 'geral'].includes(S.route)) return false;
      try {
        await saveConfig({ pausado: on }, on ? 'BIGA pausada.' : 'BIGA de volta ao trabalho!');
        render();
      } catch (err) {
        toast(err.message, true);
      }
      return true;
    }
  });
})();
