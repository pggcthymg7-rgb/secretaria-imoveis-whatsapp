/* Grupo Configurar: Cérebro, Simulador, Ajustes e Corretores (equipe) */
(() => {
  'use strict';

  const BIGA = window.BIGA;
  const { $, $$, esc, safeHref, safeWaPhone, safeQrSvg, hasOwn, when, S, api, toast, loadStatus, saveConfig, register, toggle, field, header, groupSearch, formData, isAdmin, shell } = BIGA;
  const render = opts => BIGA.render(opts);

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

  function collectPlaces() {
    return $$('[data-place]').map(el => formData(el));
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
          ${field('tavilyApiKey', 'Busca nos portais: chave do Tavily', '', { type: 'password', ph: c.hasTavilyKey ? '•••••••• (manter a atual)' : 'cole aqui (grátis)', attrs: 'autocomplete="off"' })}
          ${field('serperApiKey', 'Busca nos portais: chave do Serper (alternativa)', '', { type: 'password', ph: c.hasSerperKey ? '•••••••• (manter a atual)' : 'cole aqui (grátis)', attrs: 'autocomplete="off"' })}
          ${field('apifyToken', 'Opcional: token do Apify (OLX, ZAP e VivaReal com preço exato)', '', { type: 'password', ph: c.hasApifyToken ? '•••••••• (manter o atual)' : 'cole aqui', attrs: 'autocomplete="off"' })}
          <p class="caption" style="grid-column:1/-1">Para a Busca nos portais funcionar sem depender do Google: crie uma chave grátis em 1 minuto em <a href="https://tavily.com" target="_blank" rel="noopener noreferrer">tavily.com</a> (1.000 buscas por mês) ou <a href="https://serper.dev" target="_blank" rel="noopener noreferrer">serper.dev</a> (2.500 buscas). Cada chave é conferida no serviço antes de salvar.</p>
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
        ${isAdmin() ? '' : '<!-- atualização do sistema: só o administrador -->'}<div class="stack" id="sysBox" ${isAdmin() ? '' : 'hidden'}><span class="label">Sistema</span><p class="body muted">Versão em uso: <b>${esc((S.sistema && S.sistema.versao) || '?')}</b>. A BIGA se atualiza sozinha toda madrugada; aqui você puxa a versão nova na hora, direto do celular.</p>
          ${S.sistema && S.sistema.resultados && S.sistema.resultados.length ? `<div class="log">${S.sistema.resultados.map(r => `<div>${esc(r)}</div>`).join('')}</div>` : ''}
          <div class="row tight"><button class="btn-ghost accent" data-action="atualizarAgora" ${S.sistema && !S.sistema.naVM ? 'disabled' : ''}>Atualizar agora</button></div></div>
        <div class="stack"><span class="label">Sessão</span><p class="body muted">Desconectar o WhatsApp apaga a sessão e gera um novo QR Code.</p><div class="row tight"><button class="btn-ghost danger" data-action="resetWa">Desconectar WhatsApp</button><button class="btn-ghost" data-action="logout">Sair do painel</button></div></div>
      </div></section>`);
  }

  // ------------------------------------------------------------------ CORRETORES (equipe — só o dono do painel)
  const STATUS_CORRETOR = {
    CONECTADO: ['enviar', 'Conectado'],
    AGUARDANDO_QR_CODE: ['avisar', 'Esperando QR Code'],
    INICIANDO: ['avisar', 'Conectando…'],
    DESCONECTADO: ['avisar', 'Reconectando…'],
    PAUSADO: ['', 'Pausado'],
    NAO_INICIADO: ['', 'Desligado']
  };
  const slugCorretor = nome => String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  function viewCorretores() {
    const eq = S.equipe || { multiTenant: false, corretores: [] };
    const ed = S.corretorEdit || null;
    const ia = (ed && (ed.efetivo || ed.configIA)) || {};
    const lista = eq.corretores || [];
    shell(`
      ${header('Corretores<br><span class="muted">da equipe</span>', 'Só você vê esta página', 'Cada corretor tem a própria BIGA, completa e independente: painel com login próprio, WhatsApp, carteira, radar, vitrine e chaves dele, separados dos seus. Só não mexem na estrutura do SaaS (atualizações e equipe), que fica com você.')}
      ${!eq.multiTenant ? `<section class="section"><div class="container"><div class="card reveal"><h2 class="heading-sm warn">Modo equipe desligado</h2><p class="body muted">Este servidor ainda roda só a sua BIGA. Na máquina virtual, a próxima atualização liga o modo equipe (MULTI_TENANT=1) e traz a Laura para cá automaticamente.</p></div></div></section>` : `
      <section class="section"><div class="container stack">
        <span class="label">${lista.length} corretor(es)</span>
        <div class="list">${lista.length ? lista.map(c => {
          const w = c.whatsapp || {};
          const [cls, txt] = hasOwn(STATUS_CORRETOR, w.status) ? STATUS_CORRETOR[w.status] : ['', w.status || '—'];
          const pUrl = c.painel && c.painel.url ? safeHref(c.painel.url) : '#';
          const cQr = safeQrSvg(w.qrSvg);
          return `<div class="item stack-sm">
            <div class="row tight"><span class="tag iris">${esc(c.corretorId)}</span><span class="tag ${cls}">● ${esc(txt)}</span>${(c.efetivo || {}).hasGeminiApiKey ? '<span class="tag">🧠 IA própria</span>' : '<span class="tag">sem chave de IA</span>'}${(c.efetivo || {}).modoApenasAvisar ? '<span class="tag">só avisa</span>' : ''}</div>
            <h3 class="h2xs">${esc(c.nome)}${safeWaPhone(w.telefone) ? ` <span class="caption">· ${esc(w.nomeWhatsapp || '')} wa.me/${safeWaPhone(w.telefone)}</span>` : ''}</h3>
            ${w.status === 'CONECTADO' ? `<div class="caption">${Number(w.grupos) || 0} grupo(s) na conta · ${Number(w.gruposMonitorados) || 0} monitorado(s)</div>` : ''}
            ${c.painel && (pUrl !== '#' || c.painel.codigoConvite) ? `<div class="caption">${pUrl !== '#' ? `Painel dele(a): <a class="btn-ghost accent" href="${esc(pUrl)}" target="_blank" rel="noopener noreferrer">${esc(pUrl.replace(/^https?:\/\//, ''))}</a> · ` : ''}${c.painel.codigoConvite ? `código para criar a senha: <b class="saffron">${esc(c.painel.codigoConvite)}</b>` : 'senha já criada'}</div>` : ''}
            ${cQr ? `<div class="split rev top"><div class="qr" style="max-width:220px">${cQr}</div><p class="body muted">Peça para ${esc(String(c.nome || '').split(' ')[0])} abrir o WhatsApp › Configurações › Aparelhos conectados › <b>Conectar aparelho</b> e apontar para este código. Ele muda sozinho a cada poucos segundos.</p></div>` : ''}
            <div class="row tight">
              <button class="btn-ghost" data-action="editarCorretor" data-id="${esc(c.corretorId)}">Editar</button>
              ${c.ativo === false ? `<button class="btn-ghost accent" data-action="acaoCorretor" data-acao="retomar" data-id="${esc(c.corretorId)}">Retomar</button>` : `<button class="btn-ghost" data-action="acaoCorretor" data-acao="novo-qr" data-id="${esc(c.corretorId)}" data-confirm="Desconectar o WhatsApp de ${esc(c.nome)} e gerar um QR Code novo?">Novo QR Code</button><button class="btn-ghost" data-action="acaoCorretor" data-acao="pausar" data-id="${esc(c.corretorId)}" data-confirm="Pausar a BIGA de ${esc(c.nome)}? Ela para de ler grupos e responder até você retomar.">Pausar</button>`}
            </div>
          </div>`;
        }).join('') : '<p class="body ash">Nenhum corretor cadastrado ainda.</p>'}</div>
      </div></section>
      <section class="section"><div class="container"><div class="card stack reveal" id="corretorForm">
        <span class="label">${ed ? `Editar ${esc(ed.nome)}` : 'Cadastrar corretor'}</span>
        <p class="caption">Configuração inicial: depois o corretor ajusta tudo no painel dele. Salvar aqui de novo sobrescreve o que ele mudou nestes campos.</p>
        <div class="fields wide">
          ${field('nome', 'Nome', ed ? ed.nome : '', { ph: 'Ex: Laura Mendes', attrs: 'maxlength="80" required' })}
          ${field('corretorId', 'Identificador (não muda depois)', ed ? ed.corretorId : '', { ph: 'gerado a partir do nome', attrs: `maxlength="32" pattern="[a-z0-9][a-z0-9-]{1,31}" ${ed ? 'readonly' : ''}` })}
          ${field('meuWhatsappAlerta', 'WhatsApp de alertas dele(a)', ia.meuWhatsappAlerta, { type: 'tel', ph: 'vazio = “Mensagem para mim” do próprio corretor' })}
          ${field('geminiApiKey', 'Chave de IA (Gemini)', '', { type: 'password', ph: ia.hasGeminiApiKey ? 'já cadastrada — deixe vazio para manter' : 'opcional', attrs: 'autocomplete="off" maxlength="200"' })}
          ${field('googleSheetsCsvUrl', 'Planilha da carteira (link CSV)', ia.googleSheetsCsvUrl, { ph: 'https://… (opcional)' })}
          ${field('humanTraining', 'Jeito de falar (opcional)', ia.humanTraining, { area: true, rows: 3, cls: 'wide', ph: 'regras de resposta do corretor' })}
        </div>
        ${toggle('modoApenasAvisar', ia.modoApenasAvisar, 'Só avisar, não enviar sozinha', 'Recomendado nos primeiros dias: a BIGA avisa o corretor em vez de mandar o imóvel direto ao parceiro.')}
        <div class="row tight"><button class="btn-primary" data-action="salvarCorretor">${ed ? 'Salvar alterações' : 'Cadastrar e gerar QR Code'}</button>${ed ? '<button class="btn-ghost" data-action="cancelarCorretor">Cancelar</button>' : ''}</div>
      </div></div></section>`}`);
  }

  // Corretores: QR Code e status atualizam sozinhos
  let pollingEquipe = false;
  setInterval(async () => {
    if (pollingEquipe || !S.authed || document.hidden || S.route !== 'corretores') return;
    if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    pollingEquipe = true;
    try {
      const antes = JSON.stringify(S.equipe);
      await BIGA.loaders.get('corretores')();
      if (S.route === 'corretores' && JSON.stringify(S.equipe) !== antes) render({ manterCampos: true });
    } catch {} finally {
      pollingEquipe = false;
    }
  }, 5000);

  register({
    views: { cerebro: viewCerebro, simulador: viewSimulador, ajustes: viewAjustes, corretores: viewCorretores },
    loaders: {
      cerebro: async () => (S.cerebro = await api('GET', '/api/cerebro')),
      simulador: async () => {},
      ajustes: async () => {
        await loadStatus();
        S.sistema = isAdmin() ? await api('GET', '/api/sistema').catch(() => null) : null;
      },
      corretores: async () => (S.equipe = await api('GET', '/api/equipe'))
    },
    actions: {
      salvarCorretor: async () => {
        const d = formData($('#corretorForm'));
        const ed = S.corretorEdit;
        const corretorId = ed ? ed.corretorId : String(d.corretorId || '').trim() || slugCorretor(d.nome);
        const configIA = { meuWhatsappAlerta: d.meuWhatsappAlerta || '', googleSheetsCsvUrl: d.googleSheetsCsvUrl || '', humanTraining: d.humanTraining || '', modoApenasAvisar: Boolean(d.modoApenasAvisar) };
        if (d.geminiApiKey) configIA.geminiApiKey = d.geminiApiKey.trim();
        const r = await api('POST', '/api/equipe', { corretorId, nome: d.nome, configIA });
        S.corretorEdit = null;
        await BIGA.loaders.get('corretores')();
        render({ manterCampos: false });
        toast(r.corretor.whatsapp.qrSvg || r.corretor.whatsapp.status !== 'CONECTADO' ? `${r.corretor.nome} salvo(a). O QR Code aparece na lista em instantes.` : `${r.corretor.nome} salvo(a).`);
      },
      editarCorretor: el => {
        const c = ((S.equipe && S.equipe.corretores) || []).find(x => x.corretorId === el.dataset.id);
        if (!c) return;
        S.corretorEdit = c;
        render({ manterCampos: false });
        $('#corretorForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      cancelarCorretor: () => {
        S.corretorEdit = null;
        render({ manterCampos: false });
      },
      acaoCorretor: async el => {
        if (el.dataset.confirm && !confirm(el.dataset.confirm)) return;
        await api('POST', `/api/equipe/${encodeURIComponent(el.dataset.id)}/${encodeURIComponent(el.dataset.acao)}`);
        await BIGA.loaders.get('corretores')();
        render();
        toast({ pausar: 'Corretor pausado.', retomar: 'Corretor retomado.', 'novo-qr': 'QR Code novo gerado.' }[el.dataset.acao] || 'Feito.');
      },
      atualizarAgora: async () => {
        const r = await api('POST', '/api/sistema/atualizar');
        toast(r.message);
        clearTimeout(S._updatePoll);
        S._updatePoll = setTimeout(async () => {
          S.sistema = await api('GET', '/api/sistema').catch(() => S.sistema);
          if (S.route === 'ajustes') render();
        }, 120000);
      },
      addPlace: () => {
        if (!S.cerebro) return;
        S.cerebro.extraPlaces = [...collectPlaces(), { name: '', kind: 'edificio', bairro: '', aliases: '' }];
        render();
      },
      rmPlace: el => {
        if (!S.cerebro) return;
        const list = collectPlaces();
        list.splice(Number(el.dataset.i), 1);
        S.cerebro.extraPlaces = list;
        render();
      },
      salvarPlaces: async () => {
        if (!S.cerebro) return;
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
        const ta = $('#treino textarea[name=messageTemplate]');
        if (ta && S.status?.config) ta.value = S.status.config.defaultMessageTemplate || '';
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
        for (const k of ['geminiApiKey', 'tavilyApiKey', 'serperApiKey', 'apifyToken']) if (!d[k]) delete d[k];
        const r = await api('POST', '/api/config', d);
        if (S.status) S.status.config = r.config;
        toast(r.chavesMsg ? `Ajustes salvos! ${r.chavesMsg}` : 'Ajustes salvos!');
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
    },
    onChange: async e => {
      if (e.target.id !== 'restoreInput' || !e.target.files.length) return false;
      if (!confirm('Restaurar este backup? A carteira, as configurações e a memória atuais serão substituídas e a BIGA reinicia.')) {
        e.target.value = '';
        return true;
      }
      const fd = new FormData();
      fd.append('backup', e.target.files[0]);
      const r = await api('POST', '/api/restore', fd, true);
      toast(`Restaurado: ${r.arquivos.length} arquivos e ${r.fotos} fotos. Reiniciando…`);
      setTimeout(() => location.reload(), 9000);
      return true;
    }
  });
})();
