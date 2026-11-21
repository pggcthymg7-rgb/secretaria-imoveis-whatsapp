/* Grupo Imóveis: Editor modular de Fichas PDF 16:9 */
(() => {
  'use strict';

  const BIGA = window.BIGA;
  const { $, $$, esc, brl, fotoUrl, hasOwn, S, api, toast, register, field, header, formData, shell } = BIGA;
  const render = opts => BIGA.render(opts);

  // ------------------------------------------------------------------ FICHAS EM PDF
  const ROT_PAG_16X9 = { capa: 'Capa', resumo: 'Resumo', foto: 'Foto grande', galeria: 'Galeria', texto: 'Texto', contato: 'Contato' };
  const NOMES_MODELOS_16X9 = { A: 'A · Escuro sofisticado', B: 'B · Editorial claro', D: 'D · Grade assimétrica', E: 'E · Acolhedor clássico', F: 'F · Luxo clássico' };

  function viewPdf() {
    const ativos = S.inventory.filter(p => p.ativo !== false);
    const aprovados = new Set(Object.entries((S.vitrine && S.vitrine.posts) || {}).filter(([, v]) => v.status === 'APROVADO').map(([k]) => k));
    const ord = [...ativos].sort((a, b) => Number(aprovados.has(String(b.id))) - Number(aprovados.has(String(a.id))));
    const d = S.pdf;
    const f = d && d.ficha;
    const modSel = (f && f.modelo) || (d && d.kit && d.kit.modelo) || 'A';
    const palSel = (f && f.paleta) || (d && d.kit && d.kit.paletaPadrao) || 'principal';
    const pags = (f && Array.isArray(f.paginas) && f.paginas.length) ? f.paginas : [
      { tipo: 'capa' },
      { tipo: 'resumo' },
      { tipo: 'foto', foto: 1 },
      { tipo: 'galeria', fotos: [2, 3, 4] },
      { tipo: 'texto' },
      { tipo: 'contato' }
    ];

    shell(`
      ${header('Fichas PDF (16:9)', 'Apresentação profissional', 'Gerador de alta resolução 16:9 para envio no WhatsApp e visualização mobile/desktop. 5 modelos de design, paleta personalizável e até 14 páginas modulares.')}
      <section class="section"><div class="container stack" id="pdfForm">
        ${!ativos.length ? '<div class="card"><p class="body muted">Cadastre um imóvel na Carteira primeiro.</p></div>' : `
        <div class="card stack-sm">
          <label class="field"><span>Imóvel</span><select name="pdfImovel">${ord.map(p => `<option value="${esc(p.id)}" ${String(p.id) === String(S.pdfSel) ? 'selected' : ''}>${aprovados.has(String(p.id)) ? '🪟 ' : ''}#${esc(p.id)} · ${esc(p.tipo)} · ${esc(p.setor || '')} · ${esc(brl(p.valor))}</option>`).join('')}</select></label>
          <p class="caption">🪟 = está na Vitrine (aprovado).</p>
        </div>
        ${f ? `
        <div class="card stack-sm">
          <span class="label">Design & Modelo 16:9</span>
          <div class="row">
            <label class="field"><span>Modelo visual</span><select name="pdfModelo">
              ${Object.entries(NOMES_MODELOS_16X9).map(([k, n]) => `<option value="${esc(k)}" ${modSel === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}
            </select></label>
            <label class="field"><span>Paleta de Cores</span><select name="pdfPaleta">
              <option value="principal" ${palSel === 'principal' ? 'selected' : ''}>Paleta 1 (Principal)</option>
              <option value="segunda" ${palSel === 'segunda' ? 'selected' : ''}>Paleta 2 (Segunda / Alternativa)</option>
            </select></label>
          </div>
        </div>

        <div class="card stack-sm">
          <span class="label">Páginas da Apresentação (${pags.length} de 14)</span>
          <div class="stack-sm">
            ${pags.map((pg, i) => `
              <div class="row" style="align-items:center;background:var(--bg-card-subtle,#f4f4f6);padding:6px 12px;border-radius:6px;gap:8px;">
                <span class="caption" style="min-width:70px;font-weight:600;">Pág. ${i + 1} · ${esc(hasOwn(ROT_PAG_16X9, pg.tipo) ? ROT_PAG_16X9[pg.tipo] : pg.tipo)}</span>
                ${pg.tipo === 'texto' ? `<input type="text" name="pgTitulo_${i}" value="${esc(pg.titulo || '')}" placeholder="Título opcional da página" style="flex:1;font-size:12px;padding:4px 8px;">` : '<span style="flex:1;"></span>'}
                <div class="tight row">
                  <button type="button" class="btn-ghost" data-action="pdfSubirPagina" data-i="${i}" title="Subir página" ${i === 0 ? 'disabled' : ''}>↑</button>
                  <button type="button" class="btn-ghost" data-action="pdfDescerPagina" data-i="${i}" title="Descer página" ${i === pags.length - 1 ? 'disabled' : ''}>↓</button>
                  <button type="button" class="btn-ghost danger" data-action="pdfRmPagina" data-i="${i}" title="Remover página" ${pags.length <= 1 ? 'disabled' : ''}>×</button>
                </div>
              </div>
            `).join('')}
          </div>
          ${pags.length < 14 ? `
          <div class="row tight" style="margin-top:8px;">
            <button type="button" class="btn-ghost" data-action="pdfAddPagina" data-tipo="foto">+ Foto grande</button>
            <button type="button" class="btn-ghost" data-action="pdfAddPagina" data-tipo="galeria">+ Galeria</button>
            <button type="button" class="btn-ghost" data-action="pdfAddPagina" data-tipo="texto">+ Texto livre</button>
          </div>` : '<p class="caption muted">Limite máximo de 14 páginas atingido.</p>'}
        </div>

        <div class="card stack-sm">
          <span class="label">Textos do Imóvel</span>
          <div class="row">${field('titulo', 'Título / Edifício', f.titulo)}${field('subtitulo', 'Linha de apoio', f.subtitulo)}${field('preco', 'Preço (texto livre ou ágio)', f.preco)}</div>
          ${field('destaques', 'Diferenciais (um por linha · até 6 destaques principais)', f.destaques, { area: true, rows: 4, ph: 'Piscina privativa\nVaranda gourmet' })}
          ${field('descricao', 'Descrição Completa (continua em nova página automaticamente)', f.descricao, { area: true, rows: 7 })}
        </div>

        <div class="card stack-sm">
          <span class="label">Fotos (marque até 10 fotos na ordem desejada)</span>
          <div class="pdf-fotos">${(d.fotos || []).map(ft => `<label class="pdf-foto ${f.fotos.includes(ft) ? 'sel' : ''}"><input type="checkbox" name="pdfFoto" value="${esc(ft)}" ${f.fotos.includes(ft) ? 'checked' : ''}><img src="${esc(fotoUrl(ft))}" alt=""><span class="pdf-n">${f.fotos.includes(ft) ? f.fotos.indexOf(ft) + 1 : ''}</span></label>`).join('') || '<p class="caption">Este imóvel não tem foto enviada pelo painel.</p>'}</div>
        </div>

        <div class="card stack-sm">
          <span class="label">Contato do Corretor (com QR Code do WhatsApp)</span>
          <div class="row">${field('corretor', 'Nome do Corretor', f.corretor || '')}${field('creci', 'CRECI', f.creci || '')}${field('telefone', 'WhatsApp (gera QR Code)', f.telefone || '')}${field('email', 'E-mail', f.email || '')}</div>
          ${field('rodape', 'Observação de rodapé', f.rodape || '', { ph: 'Valores sujeitos a alteração.' })}
        </div>

        <div class="card stack-sm">
          <div class="row">
            <button class="btn-primary" data-action="pdfBaixar">Baixar PDF 16:9</button>
            <button class="btn-ghost" data-action="pdfVer">Ver antes (Prévia)</button>
            <button class="btn-ghost" data-action="pdfSalvar">Salvar edições</button>
            <button class="btn-ghost danger" data-action="pdfRestaurar">Voltar ao padrão</button>
          </div>
          <span class="label" style="margin-top:12px;">Enviar direto pelo WhatsApp</span>
          <div class="row">${field('pdfTel', 'Telefone do destinatário', (S.pdfEnvio || {}).tel || '', { ph: '62 99999-9999' })}${field('pdfMsg', 'Mensagem de envio', (S.pdfEnvio || {}).msg || `Olá! Segue a apresentação do imóvel ${f.titulo}.`)}</div>
          <button class="btn-ghost accent" data-action="pdfEnviar">Enviar PDF 16:9</button>
        </div>` : ''}`}
      </div></section>`);
  }

  // telefone/mensagem do envio não fazem parte da ficha: guardo antes de redesenhar a tela
  function guardarEnvioPdf() {
    const d = formData($('#pdfForm'));
    S.pdfEnvio = { tel: d.pdfTel || '', msg: d.pdfMsg || '' };
  }
  function atualizarPaginasPdf(alterar) {
    if (!S.pdf || !S.pdf.ficha) return;
    guardarEnvioPdf();
    const coletado = coletarPdf();
    const pags = Array.isArray(coletado.paginas)
      ? [...coletado.paginas]
      : [{ tipo: 'capa' }, { tipo: 'resumo' }, { tipo: 'foto', foto: 1 }, { tipo: 'galeria', fotos: [2, 3, 4] }, { tipo: 'texto' }, { tipo: 'contato' }];
    if (alterar(pags) === false) return;
    S.pdf.ficha = { ...S.pdf.ficha, ...coletado, paginas: pags };
    render();
  }
  function coletarPdf() {
    const box = $('#pdfForm');
    const d = formData(box);
    const marcadas = $$('input[name=pdfFoto]', box).filter(i => i.checked).map(i => i.value);
    const antes = (S.pdf && S.pdf.ficha.fotos) || [];
    const fotos = [...antes.filter(x => marcadas.includes(x)), ...marcadas.filter(x => !antes.includes(x))].slice(0, 10);
    const modelo = d.pdfModelo || (S.pdf && S.pdf.ficha && S.pdf.ficha.modelo) || 'A';
    const paleta = d.pdfPaleta || (S.pdf && S.pdf.ficha && S.pdf.ficha.paleta) || 'principal';
    const rawPaginas = (S.pdf && S.pdf.ficha && Array.isArray(S.pdf.ficha.paginas) && S.pdf.ficha.paginas.length)
      ? S.pdf.ficha.paginas
      : (hasOwn(d, 'pgTitulo_4') && String(d.pgTitulo_4 || '').trim()
        ? [{ tipo: 'capa' }, { tipo: 'resumo' }, { tipo: 'foto', foto: 1 }, { tipo: 'galeria', fotos: [2, 3, 4] }, { tipo: 'texto' }, { tipo: 'contato' }]
        : null);
    const paginas = rawPaginas
      ? rawPaginas.map((pg, i) => (pg && pg.tipo === 'texto' && hasOwn(d, `pgTitulo_${i}`) ? { ...pg, titulo: String(d[`pgTitulo_${i}`] ?? '') } : { ...pg }))
      : null;

    return {
      titulo: d.titulo,
      subtitulo: d.subtitulo,
      preco: d.preco,
      destaques: d.destaques,
      descricao: d.descricao,
      fotos,
      modelo,
      paleta,
      paginas,
      corretor: d.corretor,
      creci: d.creci,
      telefone: d.telefone,
      email: d.email,
      rodape: d.rodape
    };
  }
  async function pdfArquivo() {
    const fetchOpts = { method: 'POST', credentials: 'same-origin', headers: { 'x-secretaria': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(coletarPdf()) };
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') fetchOpts.signal = AbortSignal.timeout(30000);
    let r;
    try {
      r = await fetch(`/api/pdf/${encodeURIComponent(S.pdfSel)}/arquivo`, fetchOpts);
    } catch {
      throw new Error('Sem conexão ao gerar PDF. Tente novamente.');
    }
    if (r.status === 401) {
      S.authed = false;
      render();
      throw new Error('Faça login novamente.');
    }
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Erro ${r.status}`);
    const nome = (/filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '') || [])[1] || 'Imovel.pdf';
    return { blob: await r.blob(), nome };
  }

  register({
    views: { pdf: viewPdf },
    loaders: {
      pdf: async () => {
        S.inventory = (await api('GET', '/api/inventory')).inventory;
        if (!S.vitrine) S.vitrine = await api('GET', '/api/vitrine').catch(() => null);
        const ativos = S.inventory.filter(p => p.ativo !== false);
        if (!S.pdfSel || !ativos.some(p => String(p.id) === String(S.pdfSel))) S.pdfSel = (ativos[0] || {}).id;
        S.pdf = S.pdfSel ? await api('GET', `/api/pdf/${encodeURIComponent(S.pdfSel)}`) : null;
      }
    },
    actions: {
      irPdf: async el => {
        S.pdfSel = el.dataset.id;
        location.hash = '#pdf';
      },
      pdfCor: async el => {
        if (!S.pdf || !S.pdf.ficha) return;
        guardarEnvioPdf();
        S.pdf.ficha = { ...S.pdf.ficha, ...coletarPdf(), cor: el.dataset.cor };
        render();
      },
      pdfAddPagina: async el => {
        atualizarPaginasPdf(pags => {
          if (pags.length >= 14) {
            toast('Limite máximo de 14 páginas atingido.', true);
            return false;
          }
          const tipo = el.dataset.tipo || 'foto';
          if (tipo === 'foto') pags.push({ tipo: 'foto', foto: 0 });
          else if (tipo === 'galeria') pags.push({ tipo: 'galeria', fotos: [0, 1] });
          else if (tipo === 'texto') pags.push({ tipo: 'texto', titulo: 'Mais Detalhes' });
        });
      },
      pdfRmPagina: async el => {
        const idx = parseInt(el.dataset.i, 10);
        atualizarPaginasPdf(pags => {
          if (pags.length <= 1) {
            toast('A apresentação deve ter ao menos 1 página.', true);
            return false;
          }
          pags.splice(idx, 1);
        });
      },
      pdfSubirPagina: async el => {
        const idx = parseInt(el.dataset.i, 10);
        atualizarPaginasPdf(pags => {
          if (idx <= 0) return false;
          [pags[idx], pags[idx - 1]] = [pags[idx - 1], pags[idx]];
        });
      },
      pdfDescerPagina: async el => {
        const idx = parseInt(el.dataset.i, 10);
        atualizarPaginasPdf(pags => {
          if (idx >= pags.length - 1) return false;
          [pags[idx], pags[idx + 1]] = [pags[idx + 1], pags[idx]];
        });
      },
      pdfSalvar: async () => {
        if (!S.pdf) return;
        const r = await api('POST', `/api/pdf/${encodeURIComponent(S.pdfSel)}`, coletarPdf());
        S.pdf.ficha = r.ficha;
        toast('Ficha salva.');
        render();
      },
      pdfRestaurar: async () => {
        if (!S.pdf || !confirm('Voltar título, descrição, diferenciais e fotos ao que está na Carteira?')) return;
        const r = await api('POST', `/api/pdf/${encodeURIComponent(S.pdfSel)}`, { restaurar: true });
        S.pdf.ficha = r.ficha;
        render();
      },
      pdfBaixar: async () => {
        toast('Gerando o PDF…');
        const { blob, nome } = await pdfArquivo();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = nome;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      },
      pdfVer: async () => {
        const aba = window.open('', '_blank');
        if (aba) aba.opener = null;
        toast('Gerando o PDF…');
        try {
          const { blob } = await pdfArquivo();
          const url = URL.createObjectURL(blob);
          setTimeout(() => URL.revokeObjectURL(url), 60000);
          if (aba) aba.location.href = url;
          else location.href = url;
        } catch (err) {
          if (aba) aba.close();
          throw err;
        }
      },
      pdfEnviar: async () => {
        const box = $('#pdfForm');
        const d = formData(box);
        if (!String(d.pdfTel || '').replace(/\D/g, '')) return toast('Digite o telefone de quem vai receber.', true);
        toast('Enviando o PDF pelo WhatsApp…');
        await api('POST', `/api/pdf/${encodeURIComponent(S.pdfSel)}/enviar`, { telefone: d.pdfTel, mensagem: d.pdfMsg, ficha: coletarPdf() });
        toast('PDF enviado! ✅');
      }
    },
    onChange: async e => {
      if (e.target.name === 'pdfImovel') {
        S.pdfSel = e.target.value;
        await BIGA.loaders.get('pdf')();
        render();
        return true;
      }
      if (e.target.name === 'pdfFoto') {
        if (!S.pdf || !S.pdf.ficha) return true;
        guardarEnvioPdf();
        S.pdf.ficha = { ...S.pdf.ficha, ...coletarPdf() };
        render();
        return true;
      }
      return false;
    }
  });
})();
