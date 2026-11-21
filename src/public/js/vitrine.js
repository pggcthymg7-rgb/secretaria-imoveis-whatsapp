/* Grupo Imóveis: Vitrine automática nos grupos e wrapper do editor de Capas */
(() => {
  'use strict';

  const BIGA = window.BIGA;
  const { $, esc, fotoUrl, when, S, api, toast, register, toggle, field, header, groupSearch, formData, shell } = BIGA;
  const render = opts => BIGA.render(opts);

  // ------------------------------------------------------------------ CAPAS (Studio)
  function viewCapas() {
    shell(`
      <div class="studio-page-head">${header('Capas', 'Studio · carrossel & Instagram', 'A BIGA monta capas e carrosséis com a foto, os ícones e os dados reais do imóvel. Escolha entre 12 modelos prontos, personalize no Studio, salve com sua marca e aplique em toda a carteira.')}</div>
      <section class="section studio-page-section"><div class="container studio-page-container" id="capasApp"></div></section>`);
    if (!window.BIGA_CAPAS) return toast('O editor de capas não carregou. Recarregue a página.', true);
    window.BIGA_CAPAS.montar($('#capasApp'), {
      api,
      toast,
      fotoUrl,
      onVoltar: () => {
        location.hash = '#' + (S.lastNonStudioRoute || 'inicio');
      },
      inventario: () => S.inventory,
      modelos: () => S.capas || { modelos: [] },
      setModelos: r => (S.capas = { modelos: r.modelos, padrao: r.padrao, tamanhos: r.tamanhos }),
      kit: () => S.kit,
      setKit: k => (S.kit = k)
    });
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
        <div class="row">${horarios.map((h, i) => field(`h${i}`, `Horário ${i + 1}`, h, { type: 'time' })).join('')}${field('porHorario', 'Imóveis COM foto por horário (até 10)', v.config.porHorario, { type: 'number', attrs: 'min="0" max="10"' })}${field('porHorarioTexto', 'Imóveis SÓ TEXTO por horário (até 20)', v.config.porHorarioTexto ?? v.config.porHorario, { type: 'number', attrs: 'min="0" max="20"' })}</div>
        <p class="caption">Entre um imóvel e outro a BIGA espera 20 a 40 s, e entre grupos 25 a 70 s: assim o WhatsApp não trata como spam.</p>
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
              <div class="row tight"><button class="btn-ghost accent" data-action="aprovarPost" data-id="${esc(id)}">${post.status === 'APROVADO' ? 'Aprovado ✓' : 'Salvar e aprovar'}</button><button class="btn-ghost" data-action="salvarPost" data-id="${esc(id)}">Salvar texto</button><button class="btn-ghost" data-action="regerarPost" data-id="${esc(id)}" title="Refaz o texto com a descrição completa do imóvel">Texto completo da carteira</button><button class="btn-ghost" data-action="irPdf" data-id="${esc(id)}">Ficha PDF</button><button class="btn-ghost danger" data-action="reprovarPost" data-id="${esc(id)}">Reprovar</button></div>
            </div>
          </div>`).join('') : '<p class="body ash">Nenhum post ainda. Clique em “Gerar rascunhos da carteira”.</p>'}</div>
      </div></section>`);
  }

  function collectVitrine() {
    const box = $('#vitrineCfg');
    const d = formData(box);
    const grupos = Object.keys(d).filter(k => k.startsWith('g:') && d[k]).map(k => k.slice(2));
    const diasSemana = [0, 1, 2, 3, 4, 5, 6].filter(i => d[`d${i}`]);
    return { ativo: d.ativo, horarios: [d.h0, d.h1, d.h2, d.h3].filter(Boolean), porHorario: d.porHorario, porHorarioTexto: d.porHorarioTexto, grupos, diasSemana };
  }

  register({
    views: { vitrine: viewVitrine, capas: viewCapas },
    loaders: {
      vitrine: async () => {
        S.vitrine = await api('GET', '/api/vitrine');
        S.inventory = (await api('GET', '/api/inventory')).inventory;
      },
      capas: async () => {
        const [capasRes, invRes, kitRes] = await Promise.all([
          api('GET', '/api/capas'),
          api('GET', '/api/inventory'),
          api('GET', '/api/pdf/kit').catch(() => null)
        ]);
        S.capas = capasRes;
        S.inventory = invRes.inventory;
        if (kitRes && kitRes.kit) S.kit = kitRes.kit;
      }
    },
    actions: {
      salvarVitrine: async () => {
        const r = await api('POST', '/api/vitrine/config', collectVitrine());
        if (S.vitrine) S.vitrine.config = r.config;
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
        await BIGA.loaders.get('vitrine')();
        render();
      },
      salvarPost: async el => {
        const postId = String(el.dataset.id || '');
        const ta = $(`[data-post="${CSS.escape(postId)}"] textarea`);
        if (!ta) return;
        const r = await api('POST', `/api/vitrine/post/${encodeURIComponent(postId)}`, { texto: ta.value });
        if (S.vitrine?.posts && !['__proto__', 'constructor', 'prototype'].includes(postId)) S.vitrine.posts[postId] = r.post;
        toast('Texto salvo (aguardando aprovação).');
        render();
      },
      regerarPost: async el => {
        const postId = String(el.dataset.id || '');
        const r = await api('POST', `/api/vitrine/post/${encodeURIComponent(postId)}`, { regerar: true });
        if (S.vitrine?.posts && !['__proto__', 'constructor', 'prototype'].includes(postId)) S.vitrine.posts[postId] = r.post;
        toast('Texto refeito com a descrição completa (aguardando aprovação).');
        render();
      },
      aprovarPost: async el => {
        const postId = String(el.dataset.id || '');
        const ta = $(`[data-post="${CSS.escape(postId)}"] textarea`);
        if (!ta) return;
        await api('POST', `/api/vitrine/post/${encodeURIComponent(postId)}`, { texto: ta.value });
        const r = await api('POST', `/api/vitrine/post/${encodeURIComponent(postId)}/status`, { status: 'APROVADO' });
        if (S.vitrine?.posts && !['__proto__', 'constructor', 'prototype'].includes(postId)) S.vitrine.posts[postId] = r.post;
        toast('Aprovado para a vitrine!');
        render();
      },
      reprovarPost: async el => {
        const postId = String(el.dataset.id || '');
        const r = await api('POST', `/api/vitrine/post/${encodeURIComponent(postId)}/status`, { status: 'REPROVADO' });
        if (S.vitrine?.posts && !['__proto__', 'constructor', 'prototype'].includes(postId)) S.vitrine.posts[postId] = r.post;
        render();
      },
      fotoPost: async el => {
        const postId = String(el.dataset.id || '');
        const r = await api('POST', `/api/vitrine/post/${encodeURIComponent(postId)}`, { foto: el.dataset.f });
        if (S.vitrine?.posts && !['__proto__', 'constructor', 'prototype'].includes(postId)) S.vitrine.posts[postId] = r.post;
        render();
      }
    }
  });
})();
