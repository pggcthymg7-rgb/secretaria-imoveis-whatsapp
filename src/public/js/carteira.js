/* Grupo Imóveis: Carteira de imóveis, editor de cadastro e Quem Procura */
(() => {
  'use strict';

  const BIGA = window.BIGA;
  const { $, $$, esc, brl, fotoUrl, safeWaPhone, hasOwn, when, S, api, toast, uploadFiles, register, toggle, field, header, formData, shell } = BIGA;
  const render = opts => BIGA.render(opts);

  // ------------------------------------------------------------------ CARTEIRA
  const TIPOS = ['Apartamento', 'Casa', 'Casa de condomínio', 'Sobrado', 'Flat', 'Cobertura', 'Studio', 'Terreno', 'Chácara', 'Fazenda', 'Comercial'];
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
              <div class="body muted">${esc([p.quartos ? p.quartos + ' qts' : '', p.suites !== '' && p.suites !== undefined ? p.suites + ' suítes' : '', p.vagas ? p.vagas + ' vagas' : '', p.tamanho_m2 ? p.tamanho_m2 + ' m²' : '', hasOwn({ SIM: 1, SEMI: 1 }, p.mobiliado) ? ({ SIM: 'mobiliado', SEMI: 'com armários' }[p.mobiliado]) : ''].filter(Boolean).join(' · '))} · <span class="saffron">${esc(p.negociacao === 'AGIO' && p.valor_agio ? 'ágio ' + brl(p.valor_agio) : brl(p.valor))}</span></div>
              <div class="row tight"><button class="btn-ghost accent" data-action="editar" data-id="${esc(p.id)}">Editar</button><button class="btn-ghost" data-action="ativo" data-id="${esc(p.id)}">${p.ativo ? 'Desativar' : 'Ativar'}</button><button class="btn-ghost" data-action="aVitrine" data-id="${esc(p.id)}">Vitrine</button><button class="btn-ghost accent" data-action="quemProcura" data-id="${esc(p.id)}" title="Pedidos dos grupos que batem com este imóvel">🎯 Quem procura</button><button class="btn-ghost" data-action="irPdf" data-id="${esc(p.id)}">Ficha PDF</button><button class="btn-ghost danger" data-action="excluir" data-id="${esc(p.id)}">Excluir</button></div>
              ${S.qp && String(S.qp.id) === String(p.id) ? blocoQuemProcura(S.qp) : ''}
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

  // ------------------------------------------------------------------ 🎯 QUEM PROCURA (match reverso)
  function blocoQuemProcura(q) {
    if (q.carregando) return '<div class="qp card-in"><p class="caption">Relendo os pedidos dos grupos…</p></div>';
    if (!q.lista.length) return `<div class="qp card-in"><p class="body muted">Ninguém pediu algo assim nos grupos nos últimos ${q.dias} dias. Que tal divulgar na Vitrine ou fazer uma capa?</p></div>`;
    return `<div class="qp card-in" data-qp="${esc(q.id)}">
      <p class="body"><b>${Number(q.lista.length) || 0}</b> corretor(es) pediram algo assim nos últimos ${Number(q.dias) || 0} dias:</p>
      ${q.lista.map(l => `<label class="qp-item"><input type="checkbox" name="qpCode" value="${esc(l.code)}" ${l.nivel === 'MATCH' && !l.jaRecebeu ? 'checked' : ''}>
        <span><span class="tag ${l.nivel === 'MATCH' ? 'enviar' : 'avisar'}">${l.nivel === 'MATCH' ? '🎯 bate em tudo' : '🤔 quase'}</span>${l.jaRecebeu ? ' <span class="tag">já recebeu</span>' : ''}
        <b>${esc(l.sender)}</b> <span class="caption">${esc(when(l.ts))} · ${esc(l.grupo)}${safeWaPhone(l.phone) ? ` · <a href="https://wa.me/${safeWaPhone(l.phone)}" target="_blank" rel="noopener noreferrer">wa.me/${esc(l.phone)}</a>` : ''}</span><br>
        <span class="caption">“${esc(l.texto)}”${l.falta && l.falta.length ? `<br>Falta confirmar: ${esc(l.falta.join('; '))}` : ''}</span></span></label>`).join('')}
      <div class="row tight"><button class="btn-primary" data-action="oferecer" data-id="${esc(q.id)}">Oferecer para os marcados</button><span class="caption">Um por vez, com pausa de 25–45 s, no privado de cada um.</span></div>
    </div>`;
  }

  function syncEditing() {
    const box = $('#propForm');
    if (box && S.editing) Object.assign(S.editing, formData(box));
    return S.editing;
  }

  register({
    views: { carteira: viewCarteira },
    loaders: { carteira: async () => (S.inventory = (await api('GET', '/api/inventory')).inventory) },
    actions: {
      novoImovel: () => {
        S.editing = { fotos: [], ativo: true, cidade: 'Goiânia' };
        render();
      },
      editar: el => {
        const item = S.inventory.find(p => String(p.id) === el.dataset.id);
        if (!item) return;
        S.editing = JSON.parse(JSON.stringify(item));
        render();
        scrollTo(0, 0);
      },
      cancelarEdicao: () => {
        S.editing = null;
        render();
      },
      capa: el => {
        const i = Number(el.dataset.i);
        const ed = syncEditing();
        if (!ed || !Array.isArray(ed.fotos)) return;
        ed.fotos.unshift(...ed.fotos.splice(i, 1));
        render();
      },
      rmFoto: el => {
        const ed = syncEditing();
        if (!ed || !Array.isArray(ed.fotos)) return;
        ed.fotos.splice(Number(el.dataset.i), 1);
        render();
      },
      salvarImovel: async () => {
        const p = syncEditing();
        if (!p) return;
        const r = p.id ? await api('PUT', `/api/property/${encodeURIComponent(p.id)}`, p) : await api('POST', '/api/property', p);
        S.inventory = r.inventory;
        S.editing = null;
        toast(`Imóvel #${r.property.id} salvo!`);
        render();
      },
      ativo: async el => {
        const p = S.inventory.find(x => String(x.id) === el.dataset.id);
        if (!p) return;
        const r = await api('PUT', `/api/property/${encodeURIComponent(p.id)}`, { ativo: !p.ativo });
        S.inventory = r.inventory;
        render();
      },
      excluir: async el => {
        if (!confirm(`Excluir o imóvel #${el.dataset.id}? Isso não pode ser desfeito.`)) return;
        S.inventory = (await api('DELETE', `/api/property/${encodeURIComponent(el.dataset.id)}`)).inventory;
        toast('Excluído.');
        render();
      },
      aVitrine: async el => {
        await api('POST', `/api/vitrine/post/${encodeURIComponent(el.dataset.id)}`, {});
        location.hash = '#vitrine';
      },
      importGoogle: async () => {
        S.inventory = (await api('GET', '/api/inventory?refresh=google')).inventory;
        toast('Planilha importada.');
        render();
      },
      quemProcura: async el => {
        const id = el.dataset.id;
        if (S.qp && String(S.qp.id) === String(id) && !S.qp.carregando) {
          S.qp = null;
          return render({ manterCampos: true });
        }
        S.qp = { id, carregando: true, lista: [] };
        render({ manterCampos: true });
        const r = await api('GET', `/api/property/${encodeURIComponent(id)}/quem-procura`);
        S.qp = { id, dias: r.dias, lista: r.lista };
        render({ manterCampos: true });
      },
      oferecer: async el => {
        const box = $(`[data-qp="${CSS.escape(el.dataset.id)}"]`);
        const codes = $$('input[name=qpCode]', box).filter(i => i.checked).map(i => i.value);
        if (!codes.length) return toast('Marque pelo menos um corretor.', true);
        const r = await api('POST', `/api/property/${encodeURIComponent(el.dataset.id)}/oferecer`, { codes });
        toast(`🎯 ${r.message} Eu aviso no WhatsApp quando terminar.`);
      }
    },
    onChange: async e => {
      if (e.target.id !== 'fotoInput' || !e.target.files.length) return false;
      const p = syncEditing();
      if (!p) return true;
      toast('Enviando fotos…');
      p.fotos = [...(p.fotos || []), ...(await uploadFiles(e.target.files))];
      render();
      return true;
    }
  });
})();
