/* Grupo Clientes: Garimpo de leads na internet e campanhas de Prospecção */
(() => {
  'use strict';

  const BIGA = window.BIGA;
  const { $, esc, safeHref, hasOwn, when, S, api, toast, uploadFiles, register, toggle, field, header, formData, shell } = BIGA;
  const render = opts => BIGA.render(opts);

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
            <div class="row between"><div class="row tight"><span class="tag src ${esc(l.fonte)}"><i></i>${esc(hasOwn(fonteNome, l.fonte) ? fonteNome[l.fonte] : l.fonte)}</span>${(l.matches || []).length ? `<span class="tag enviar">● você tem #${l.matches.map(esc).join(', #')}</span>` : ''}<span class="caption">${esc(when(l.encontradoEm))}</span></div><span class="lead-score" title="Pontuação do lead">${Number(l.score) || 0}</span></div>
            <h3 class="hxs" style="margin-top:10px">${esc(l.titulo || '')}</h3>
            <p class="body muted" style="margin-top:6px">${esc(l.texto || '')}</p>
            <p class="caption">🧠 ${esc(l.resumo || '')}${l.post ? ` · no post: “${esc(l.post)}”` : ''}</p>
            <div class="row tight"><a class="btn-ghost accent" href="${esc(safeHref(l.link))}" target="_blank" rel="noopener noreferrer">Abrir publicação ↗</a>${l.status !== 'CONTATADO' ? `<button class="btn-ghost" data-action="leadStatus" data-id="${esc(l.id)}" data-s="CONTATADO">Marcar contatado</button>` : ''}${l.status !== 'DESCARTADO' ? `<button class="btn-ghost danger" data-action="leadStatus" data-id="${esc(l.id)}" data-s="DESCARTADO">Descartar</button>` : `<button class="btn-ghost" data-action="leadStatus" data-id="${esc(l.id)}" data-s="NOVO">Restaurar</button>`}</div>
          </div>`).join('') : `<div class="card"><p class="body muted">${g.leads.length ? 'Nada nesta lista.' : 'Ainda não encontrei leads. Configure a busca abaixo e toque em “Escavar agora”.'}</p></div>`}</div>
      </div></section>
      <section class="section"><div class="container split top">
        <div class="card reveal"><span class="label">Campanhas de imóveis no ar (bibliotecas oficiais)</span><p class="body muted">Anúncios ativos de imobiliárias e construtoras em Goiânia, e o interesse de busca na região nos últimos 7 dias.</p>
          <div class="linkout">${(g.campanhas || []).map(c => `<a href="${esc(safeHref(c.meta))}" target="_blank" rel="noopener noreferrer"><span>Meta (Instagram/Facebook) · ${esc(c.termo)}</span><span>↗</span></a><a href="${esc(safeHref(c.trends))}" target="_blank" rel="noopener noreferrer"><span>Google Trends Goiás · ${esc(c.termo)}</span><span>↗</span></a>`).join('')}
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
            <span class="field"><span>Contatos do WhatsApp · <span id="selContactsCount">${S.selContacts.size}</span> selecionado(s)</span></span>
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
            <div class="body muted">${Number(c.enviados) || 0}/${Number(c.total) || 0} enviados · ${Number(c.pendentes) || 0} na fila · ${Number(c.falhas) || 0} falhas · ${Number(c.sairam) || 0} saíram</div>
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

  register({
    views: { garimpo: viewGarimpo, prospeccao: viewProspeccao },
    loaders: {
      garimpo: async () => (S.garimpo = await api('GET', '/api/garimpo')),
      prospeccao: async () => {
        S.prosp = await api('GET', '/api/prospeccao');
        S.contatos = (await api('GET', '/api/contatos')).contatos;
      }
    },
    actions: {
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
        if (S.garimpo) S.garimpo.config = r.config;
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
        S.garimpo = (await api('POST', `/api/garimpo/lead/${encodeURIComponent(el.dataset.id)}`, { status: el.dataset.s })).state;
        render();
      },
      selTodos: () => {
        const f = (S.filtroContato || '').toLowerCase();
        S.contatos.filter(c => !f || (c.nome + c.telefone).toLowerCase().includes(f)).forEach(c => S.selContacts.add(c.telefone));
        render({ manterCampos: true });
      },
      selNenhum: () => {
        S.selContacts.clear();
        render({ manterCampos: true });
      },
      rmCampImg: () => {
        S.campImg = '';
        render({ manterCampos: true });
      },
      criarCampanha: el => criarCampanha(true, el),
      criarRascunho: el => criarCampanha(false, el),
      campStatus: async el => {
        S.prosp = (await api('POST', `/api/prospeccao/campanha/${encodeURIComponent(el.dataset.id)}/status`, { status: el.dataset.s })).state;
        render();
      },
      campExcluir: async el => {
        if (!confirm('Excluir esta campanha?')) return;
        S.prosp = (await api('DELETE', `/api/prospeccao/campanha/${encodeURIComponent(el.dataset.id)}`)).state;
        render();
      },
      salvarProspCfg: async () => {
        const r = await api('POST', '/api/prospeccao/config', formData($('#prospCfg')));
        if (S.prosp) S.prosp.config = r.config;
        toast('Ritmo salvo!');
        render();
      }
    },
    onToggle: (k, on) => {
      if (!k.startsWith('c:')) return false;
      on ? S.selContacts.add(k.slice(2)) : S.selContacts.delete(k.slice(2));
      const cnt = $('#selContactsCount');
      if (cnt) cnt.textContent = String(S.selContacts.size);
      return true;
    },
    onChange: async e => {
      if (e.target.id !== 'campImg' || !e.target.files.length) return false;
      S.campDraft = formData($('#campForm'));
      S.campImg = (await uploadFiles(e.target.files))[0];
      render();
      if (S.campDraft) {
        const nomeEl = $('#campForm [name=nome]');
        const msgEl = $('#campForm [name=mensagem]');
        const colarEl = $('#campForm [name=colar]');
        if (nomeEl) nomeEl.value = S.campDraft.nome || '';
        if (msgEl) msgEl.value = S.campDraft.mensagem || '';
        if (colarEl) colarEl.value = S.campDraft.colar || '';
      }
      return true;
    }
  });
})();
