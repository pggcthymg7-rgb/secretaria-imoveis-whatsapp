/* Grupo Meu dia: Radar de buscas e Atendimento diário */
(() => {
  'use strict';

  const BIGA = window.BIGA;
  const { $, $$, esc, safeWaPhone, when, S, api, toast, loadStatus, saveConfig, register, toggle, field, header, decisionTag, formData, shell } = BIGA;
  const render = opts => BIGA.render(opts);

  // ------------------------------------------------------------------ RADAR
  function viewRadar() {
    const r = S.radar || { items: [], demanda: { tipos: [], locais: [], faixas: [], total: 0 } };
    const items = r.items.filter(i => !S.filtroRadar || i.decision === S.filtroRadar);
    const bars = arr => {
      const safeArr = Array.isArray(arr) ? arr : [];
      const max = Math.max(1, ...safeArr.map(x => Number(x.qtd) || 0));
      return safeArr.length ? `<div class="bars">${safeArr.map(x => `<div class="bar"><span>${esc(x.nome)}</span><span class="track"><span class="fill" style="width:${Math.min(100, Math.max(0, ((Number(x.qtd) || 0) / max) * 100))}%"></span></span><span class="ash">${Number(x.qtd) || 0}</span></div>`).join('')}</div>` : '<p class="body ash">Sem dados ainda.</p>';
    };
    shell(`
      ${header('Radar de<br>buscas', 'O que os corretores pedem', `Todo pedido lido nos grupos fica aqui, com o que a BIGA entendeu e o que ela fez. Em <span class="saffron">conferir</span> você decide com um clique.`)}
      <section class="section"><div class="container split top">
        <div><span class="label">Mais procurados · ${Number(r.demanda.total) || 0} pedidos em 30 dias</span>${bars(r.demanda.locais)}</div>
        <div class="stack"><div><span class="label">Tipos</span>${bars(r.demanda.tipos)}</div><div><span class="label">Faixas de preço</span>${bars(r.demanda.faixas)}</div></div>
      </div></section>
      <section class="section"><div class="container">
        <div class="row tight">${[['', 'Todos'], ['AVISAR', 'Conferir'], ['ENVIAR', 'Enviados'], ['SILENCIO', 'Sem imóvel']].map(([k, l]) => `<button class="btn-ghost ${S.filtroRadar === k || (!S.filtroRadar && !k) ? 'accent' : ''}" data-action="filtroRadar" data-v="${k}">${l}</button>`).join('')}</div>
        <div class="list">${items.length ? items.map(i => `
          <div class="item stack-sm">
            <div class="row tight"><span class="tag iris">${esc(i.code)}</span>${decisionTag(i.decision)}<span class="caption">${esc(when(i.ts))} · ${esc(i.grupo)}</span></div>
            <h3 class="h2xs">${esc(i.sender)} ${safeWaPhone(i.phone) ? `<a class="btn-ghost accent" href="https://wa.me/${safeWaPhone(i.phone)}" target="_blank" rel="noopener noreferrer">wa.me/${esc(i.phone)}</a>` : ''}</h3>
            <div class="body muted pre">${esc(i.texto)}</div>
            <div class="caption">🧠 ${esc(i.resumo || '')}</div>
            ${(i.duvidas || []).length ? `<div class="caption saffron">${i.duvidas.map(esc).join('<br>')}</div>` : ''}
            ${i.enviados && i.enviados.length ? `<div class="caption">Enviado: #${i.enviados.map(esc).join(', #')}</div>` : ''}
            ${i.decision !== 'ENVIAR' ? `<div class="row tight">${(i.candidatos || []).map(id => `<button class="btn-ghost accent" data-action="aprovarRadar" data-code="${esc(i.code)}" data-id="${esc(id)}">Enviar #${esc(id)}</button>`).join('')}<button class="btn-ghost" data-action="aprovarOutro" data-code="${esc(i.code)}">Enviar outro imóvel…</button></div>` : ''}
          </div>`).join('') : '<p class="body ash">Nenhum pedido registrado ainda.</p>'}</div>
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

  function collectRules() {
    return $$('[data-rule]').map(el => formData(el));
  }

  register({
    views: { radar: viewRadar, atendimento: viewAtendimento },
    loaders: {
      radar: async () => (S.radar = await api('GET', '/api/radar')),
      atendimento: loadStatus
    },
    actions: {
      filtroRadar: el => {
        S.filtroRadar = el.dataset.v;
        render();
      },
      aprovarRadar: async el => {
        const r = await api('POST', `/api/radar/${encodeURIComponent(el.dataset.code)}/enviar`, { propId: el.dataset.id });
        toast(r.message || 'Enviado!');
        await BIGA.loaders.get('radar')();
        render();
      },
      aprovarOutro: async el => {
        const id = prompt('Número (#) do imóvel para enviar:');
        if (!id) return;
        const r = await api('POST', `/api/radar/${encodeURIComponent(el.dataset.code)}/enviar`, { propId: id.replace(/\D/g, '') });
        toast(r.message || 'Enviado!');
        await BIGA.loaders.get('radar')();
        render();
      },
      addRule: () => {
        if (!S.status?.config) return;
        const rules = collectRules();
        rules.push({ trigger: '', response: '', active: true });
        S.status.config.dailySimpleReplies = rules;
        render();
      },
      rmRule: el => {
        if (!S.status?.config) return;
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
      }
    }
  });
})();
