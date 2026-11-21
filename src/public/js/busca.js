/* Grupo Clientes: Busca Inteligente em grupos e portais + memória/importação */
(() => {
  'use strict';

  const BIGA = window.BIGA;
  const { $, esc, brl, safeHref, safeWaPhone, when, S, api, toast, register, toggle, field, header, groupSearch, applyGroupFilter, formData, shell } = BIGA;
  const render = opts => BIGA.render(opts);

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
      <div class="stack-sm" style="margin-top:8px">${(g.fontes || []).map(f => `<div class="row between"><span class="caption">👤 <b>${esc(f.autor)}</b> · ${esc(f.grupo)} · ${esc(dataCurta(f.ts))}</span>${safeWaPhone(f.telefone) ? `<a class="btn-ghost accent" href="https://wa.me/${safeWaPhone(f.telefone)}" target="_blank" rel="noopener noreferrer">Chamar no WhatsApp ↗</a>` : ''}</div>`).join('')}</div>
    </div>`;
  }
  function cardPortal(x) {
    const det = [x.preco ? brl(x.preco) : 'preço no link', x.area ? `${x.area} m²` : '', x.quartos ? `${x.quartos} quartos` : '', x.bairro].filter(Boolean).join(' · ');
    return `<div class="item reveal">
      <div class="row between"><h3 class="hxs">${esc(x.titulo || x.resumo || 'Imóvel')}</h3><span class="tag">${esc(x.portal)}</span></div>
      <p class="body" style="margin-top:6px">${esc(det)}</p>
      ${x.anunciante ? `<p class="caption">${esc(x.anunciante)}${x.certeza === 'estimativa' ? ' · tipo estimado pelo texto' : ''}</p>` : ''}
      <div class="row tight"><a class="btn-ghost accent" href="${esc(safeHref(x.link))}" target="_blank" rel="noopener noreferrer">Abrir anúncio ↗</a></div>
    </div>`;
  }
  function resultadoBusca(r) {
    if (!r) return '';
    const p = r.portais || { itens: [] };
    const grupoPorTipo = t => (p.itens || []).filter(x => x.tipoAnunciante === t);
    const motivo = String(p.explicacao || 'não consegui buscar nos portais.').replace(/\*/g, '');
    const bloco = (titulo, lista) => (lista.length ? `<span class="label" style="margin-top:16px">${titulo} (${lista.length})</span><div class="list">${lista.map(cardPortal).join('')}</div>` : '');
    return `
      <section class="section"><div class="container">
        <div class="row between reveal"><div><span class="label">Busca nº ${esc(r.id)} · ${esc(when(r.ts))}</span><h2 class="heading-sm">${esc(r.descricao)}</h2></div>
          <div class="row tight"><button class="btn-ghost accent" data-action="buscaWhats" data-id="${esc(r.id)}">Mandar pro meu WhatsApp</button>${r.filtros ? '<button class="btn-ghost" data-action="refazerFiltros">Refazer com estes filtros</button>' : ''}</div></div>
        ${(r.avisos || []).map(a => `<p class="caption">⚠️ ${esc(a)}</p>`).join('')}
      </div></section>
      <section class="section"><div class="container">
        <span class="label reveal">📱 Nos seus grupos (${r.grupos.length})</span>
        <div class="list">${r.grupos.length ? r.grupos.map(cardGrupo).join('') : `<div class="card"><p class="body muted">Nada anunciado com esse perfil nos seus grupos. Memória: ${r.memoria?.total || 0} anúncios${r.memoria?.desde ? `, desde ${dataCurta(r.memoria.desde)}` : ''}.</p></div>`}</div>
      </div></section>
      <section class="section"><div class="container">
        <span class="label reveal">🌐 Nos portais (${(p.itens || []).length})</span>
        ${!p.ok ? `<div class="card"><p class="body muted">Não busquei nos portais: ${esc(motivo || '')} Use as buscas prontas abaixo.</p></div>` : `
          <p class="caption">Só entram anúncios com link confirmado pela busca${(p.via || []).length ? ` · via ${esc(p.via.join(' + '))}` : ''}.${p.semCuradoria ? ` ⚠️ Não consegui filtrar${p.curadoriaErro ? `: ${esc(p.curadoriaErro)}` : ' (sem chave/resposta do Gemini)'}. Veja abaixo os anúncios achados; tente de novo em alguns minutos.` : ''}</p>
          ${bloco('👤 Particular', grupoPorTipo('particular'))}${bloco('🏢 Profissional', grupoPorTipo('profissional'))}${bloco('❔ Não identificado', grupoPorTipo('desconhecido'))}
          ${!(p.itens || []).length ? `<div class="card"><p class="body muted">Nenhum anúncio confirmado com esse perfil.${p.diagBusca ? ` O buscador devolveu — ${esc(p.diagBusca)}.` : ''}</p></div>` : ''}
          ${(p.fontesSoltas || []).length ? `<span class="label" style="margin-top:16px">Outras páginas encontradas</span><div class="linkout">${p.fontesSoltas.map(f => `<a href="${esc(safeHref(f.url))}" target="_blank" rel="noopener noreferrer"><span>${esc(f.titulo || f.url)}</span><span>↗</span></a>`).join('')}</div>` : ''}`}
      </div></section>
      ${Object.keys(r.links || {}).length ? `<section class="section"><div class="container"><span class="label reveal">🔗 Busca pronta nos portais</span>
        <div class="linkout">${Object.entries(r.links).map(([n, u]) => `<a href="${esc(safeHref(u))}" target="_blank" rel="noopener noreferrer"><span>${esc(n)} — com os filtros do pedido</span><span>↗</span></a>`).join('')}</div></div></section>` : ''}`;
  }
  function viewBusca() {
    const b = S.busca || { config: {}, memoria: {}, historico: [] };
    const c = b.config || {};
    const m = b.memoria || {};
    const imp = b.importacao;
    const fb = S.buscaForm || {};
    shell(`
      ${header('Busca', 'Busca inteligente', 'Escreva o que o seu cliente quer. Eu procuro nos <b>seus grupos</b> (anúncios dos últimos 90 dias: quem anunciou e onde) e na <b>OLX, ZAP e VivaReal</b>, separando particular e profissional. Também dá para fazer tudo pelo “Mensagem para mim”: <b>busca …</b>')}
      <section class="section"><div class="container"><div class="card reveal stack" id="buscaForm">
        <span class="label">Filtros — como nos portais (o que ficar em branco fica aberto)</span>
        <div class="fields">
          ${field('tipo', 'Tipo', fb.tipo || '', { options: [['', 'Qualquer'], ['Apartamento', 'Apartamento'], ['Casa', 'Casa'], ['Casa de condomínio', 'Casa de condomínio'], ['Sobrado', 'Sobrado'], ['Cobertura', 'Cobertura'], ['Flat', 'Flat'], ['Studio', 'Studio'], ['Terreno', 'Terreno / lote'], ['Chácara', 'Chácara'], ['Comercial', 'Comercial']] })}
          ${field('negocio', 'Negócio', fb.negocio || 'VENDA', { options: [['VENDA', 'Venda'], ['ALUGUEL', 'Aluguel']] })}
          ${field('cidade', 'Cidade', fb.cidade || '', { ph: 'Ex.: Goiânia' })}
          ${field('bairro', 'Bairro', fb.bairro || '', { ph: 'Ex.: Setor Marista' })}
          ${field('local', 'Condomínio ou edifício', fb.local || '', { ph: 'Ex.: Jardins Itália', cls: 'wide' })}
          ${field('valorMin', 'Valor a partir de', fb.valorMin || '', { ph: 'Ex.: 4 milhões' })}
          ${field('valorMax', 'Valor até', fb.valorMax || '', { ph: 'Ex.: 5 milhões' })}
          ${field('quartos', 'Quartos (mín.)', fb.quartos || '', { type: 'number', attrs: 'min="0" max="20"' })}
          ${field('suites', 'Suítes (mín.)', fb.suites || '', { type: 'number', attrs: 'min="0" max="20"' })}
          ${field('vagas', 'Vagas (mín.)', fb.vagas || '', { type: 'number', attrs: 'min="0" max="20"' })}
          ${field('areaMin', 'Tamanho a partir de (m²)', fb.areaMin || '', { ph: 'Ex.: 100' })}
          ${field('areaMax', 'Tamanho até (m²)', fb.areaMax || '', { ph: 'Ex.: 300' })}
          ${field('extras', 'Mais (opcional)', fb.extras || '', { ph: 'Ex.: piscina, mobiliado, aceita financiamento', cls: 'wide' })}
        </div>
        <p class="caption">Condomínio/edifício é o mais específico: se preencher, ele vale no lugar do bairro. Valor: “4 milhões”, “800 mil”, “4.500.000”.</p>
        <details ${fb.texto ? 'open' : ''}><summary class="caption" style="cursor:pointer">Ou escreva o pedido do seu jeito</summary>
          ${field('texto', 'Pedido do cliente (texto livre)', fb.texto || '', { area: true, rows: 3, ph: 'Ex.: apartamento de 800 mil a 1 milhão no Setor Marista, mínimo 100 m², 3 quartos' })}
        </details>
        <div class="row">${toggle('whatsapp', false, 'Mandar também pro meu WhatsApp')}<button class="btn-primary" data-action="buscar">${S.buscando ? 'Buscando… (até 2 min)' : 'Buscar'}</button><button class="btn-ghost" data-action="limparFiltros">Limpar</button></div>
        <p class="caption">Buscas nos portais hoje: ${c.usadasHoje || 0} de ${c.limiteDia ?? 20} · ${(() => {
          const mt = c.motores || {};
          const partes = [mt.apify ? 'Apify (OLX, ZAP e VivaReal)' : '', (mt.busca || []).length ? `${mt.busca[0]} + Gemini` : '', !(mt.apify || (mt.busca || []).length) && mt.gemini ? 'Gemini + Google' : ''].filter(Boolean);
          return partes.length ? `motor: ${esc(partes.join(' + '))}` : 'sem motor de busca: só grupos e buscas prontas (configure o Tavily ou o Serper em Ajustes)';
        })()}</p>
      </div></div></section>
      ${resultadoBusca(S.buscaAtual)}
      <section class="section"><div class="container"><div class="stats reveal">
        <div class="stat"><div class="n" data-count="${Number(m.total) || 0}">0</div><div class="l">anúncios guardados</div></div>
        <div class="stat"><div class="n" data-count="${Number(m.grupos) || 0}">0</div><div class="l">grupos</div></div>
        <div class="stat"><div class="n" style="font-size:22px">${m.desde ? esc(dataCurta(m.desde)) : '—'}</div><div class="l">desde (guardo 90 dias)</div></div>
        <div class="stat"><div class="n" data-count="${(b.historico || []).length}">0</div><div class="l">buscas salvas</div></div>
      </div></div></section>
      <section class="section"><div class="container split top">
        <div class="card reveal stack-sm"><span class="label">Memória de anúncios dos grupos</span>
          <p class="body muted">Guardo sozinha todo anúncio que aparece nos seus grupos. Para trazer os <b>anúncios antigos</b>:</p>
          <p class="body"><b>1.</b> Peça ao seu celular (deixe-o ligado e com internet):</p>
          <div class="row tight"><button class="btn-ghost accent" id="btnImportar" data-action="importarHistorico" ${imp && imp.rodando ? 'disabled' : ''}>${imp && imp.rodando ? 'Importando…' : 'Importar histórico dos grupos'}</button></div>
          <p class="caption" id="impAndamento">${imp && imp.rodando ? esc(textoAndamento(imp)) : ''}</p>
          ${imp && !imp.rodando && imp.fim ? `<p class="caption">Última importação: ${Number(imp.anuncios) || 0} anúncios de ${Number(imp.comHistorico) || 0} de ${Number(imp.grupos) || 0} grupos (${esc(when(imp.fim))}).${imp.semAncora?.length ? ` Sem mensagem recente para começar: ${esc(imp.semAncora.slice(0, 5).join(', '))}${imp.semAncora.length > 5 ? '…' : ''} — exporte a conversa desses.` : ''}</p>` : ''}
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
          <div class="row"><button class="btn-primary" data-action="salvarBuscaCfg">Salvar configurações</button>${c.temChaveGemini ? '<button class="btn-ghost accent" data-action="testarChave">Testar chave salva</button><button class="btn-ghost" data-action="diagnosticoGemini">Diagnóstico completo</button>' : ''}</div>
          ${S.diagnostico ? `<p class="caption" style="white-space:pre-wrap">${esc(S.diagnostico)}</p>` : ''}
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

  register({
    views: { busca: viewBusca },
    loaders: { busca: async () => (S.busca = await api('GET', '/api/busca')) },
    actions: {
      buscar: async () => {
        if (S.buscando) return;
        const f = formData($('#buscaForm'));
        const { texto, whatsapp, ...filtros } = f;
        S.buscaForm = { ...filtros, texto };
        const algum = Object.entries(filtros).some(([k, v]) => k !== 'negocio' && String(v ?? '').trim() !== '');
        if (!algum && String(texto || '').trim().length < 8) return toast('Preencha pelo menos um filtro (cidade, bairro, valor…) ou escreva o pedido.', true);
        S.buscando = true;
        render();
        toast('Buscando nos grupos e nos portais…');
        try {
          const r = await api('POST', '/api/busca', { texto, filtros, whatsapp });
          S.buscaAtual = r.busca;
          S.busca = r.estado;
          toast(`${(r.busca?.grupos || []).length} nos grupos · ${(r.busca?.portais?.itens || []).length} nos portais${f.whatsapp ? ' · mandei no seu WhatsApp' : ''}`);
        } finally {
          S.buscando = false;
          render();
        }
      },
      limparFiltros: () => {
        S.buscaForm = {};
        render({ manterCampos: false });
      },
      refazerFiltros: () => {
        const f = (S.buscaAtual && S.buscaAtual.filtros) || {};
        const dinheiro = n => (n >= 1e6 ? `${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} milhões` : n >= 1000 ? `${Math.round(n / 1000)} mil` : String(n));
        S.buscaForm = { ...f, valorMin: f.valorMin ? dinheiro(f.valorMin) : '', valorMax: f.valorMax ? dinheiro(f.valorMax) : '', areaMin: f.areaMin || '', areaMax: f.areaMax || '' };
        render();
        scrollTo({ top: 0, behavior: 'smooth' });
        toast('Filtros carregados: ajuste e toque em Buscar.');
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
      diagnosticoGemini: async () => {
        toast('Testando a chave no Google… (até 1 minuto)');
        const r = await api('POST', '/api/busca/diagnostico');
        S.diagnostico = String(r.texto || '').replace(/\*/g, '');
        render({ manterCampos: true });
      },
      testarChave: async () => {
        toast('Perguntando ao Google…');
        const r = await api('POST', '/api/busca/testar-chave');
        toast(r.mensagem, !r.ok);
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
      }
    },
    onToggle: (k, on) => {
      if (k === 'todosGrupos' && $('#escolhaGrupos')) {
        $('#escolhaGrupos').hidden = on;
        applyGroupFilter('bg');
        return true;
      }
      return false;
    },
    onInput: e => {
      const n = e.target.name;
      if (n && e.target.closest('#buscaForm') && !e.target.closest('[data-toggle]')) {
        S.buscaForm = { ...S.buscaForm, [n]: e.target.value }; // não perde os filtros se a tela atualizar
        return true;
      }
      return false;
    },
    onChange: async e => {
      if (e.target.id !== 'conversaInput' || !e.target.files.length) return false;
      const fd = new FormData();
      fd.append('arquivo', e.target.files[0]);
      toast('Lendo a conversa…');
      const r = await api('POST', '/api/busca/importar-conversa', fd, true);
      S.busca = r.estado;
      toast(`"${r.grupo}": ${r.anuncios} anúncios guardados de ${r.lidas} mensagens.`);
      render();
      return true;
    }
  });
})();
