/* Grupo Imóveis: Estúdio Visual PDF 16:9 Híbrido (Konva + Telemetria 1:1) */
(() => {
  'use strict';

  const BIGA = window.BIGA;
  const { $, esc, brl, hasOwn, S, api, toast, register, shell, formData } = BIGA;

  const NOMES_MODELOS = {
    A: 'A · Escuro sofisticado',
    B: 'B · Editorial claro',
    D: 'D · Grade assimétrica',
    E: 'E · Acolhedor clássico',
    F: 'F · Luxo clássico'
  };

  const LAYOUTS_PAGINA = [
    { tipo: 'capa', titulo: 'Capa', desc: 'Foto principal, nome, localização e preço em destaque.' },
    { tipo: 'resumo', titulo: 'Resumo', desc: 'Ficha técnica (área, quartos, suítes, vagas) e diferenciais.' },
    { tipo: 'foto', titulo: 'Foto grande', desc: 'Foto ampliada do imóvel com legenda elegante.' },
    { tipo: 'galeria', titulo: 'Galeria', desc: 'Grade com 3 fotos combinadas do imóvel.' },
    { tipo: 'texto', titulo: 'Texto / Descrição', desc: 'Apresentação detalhada do imóvel.' },
    { tipo: 'contato', titulo: 'Contato + QR', desc: 'Cartão do corretor, telefone e QR Code do WhatsApp.' },
    { tipo: 'livre', titulo: 'Página em branco', desc: 'Tela limpa com o fundo da paleta atual.' }
  ];

  let studioInst = null;
  let studioObserver = null;
  let modeloAtual = 'A';
  let paletaAtual = 'principal';
  let modeloProprioAtivo = null;
  const presetsCache = new Map();

  function destruirStudioPdf() {
    if (studioObserver) {
      try { studioObserver.disconnect(); } catch {}
      studioObserver = null;
    }
    if (studioInst) {
      try { studioInst.destruir(); } catch {}
      studioInst = null;
    }
  }

  function aprovadosVitrineSet() {
    const posts = (S.vitrine && S.vitrine.posts) || {};
    const out = new Set();
    for (const [k, v] of Object.entries(posts)) {
      if (v && v.status === 'APROVADO') out.add(String(k));
    }
    return out;
  }

  function inventarioOrdenado() {
    const ativos = (S.inventory || []).filter(p => p.ativo !== false);
    const aprovados = aprovadosVitrineSet();
    return [...ativos].sort((a, b) => Number(aprovados.has(String(b.id))) - Number(aprovados.has(String(a.id))));
  }

  function fichaOverrideDe(ficha, prop) {
    if (!ficha || !prop) return null;
    const out = {};
    if (ficha.titulo && ficha.titulo !== prop.edificio) out.titulo = ficha.titulo;
    if (ficha.preco) out.preco = ficha.preco;
    if (ficha.destaques) out.destaques = ficha.destaques;
    if (ficha.descricao !== undefined && ficha.descricao !== prop.descricao) out.descricao = ficha.descricao;
    if (ficha.corretor) out.corretor = ficha.corretor;
    if (ficha.creci) out.creci = ficha.creci;
    if (ficha.telefone) out.telefone = ficha.telefone;
    if (ficha.email) out.email = ficha.email;
    if (ficha.rodape) out.rodape = ficha.rodape;
    return out;
  }

  async function carregarPreset(modelo, paleta, imovelId) {
    const key = `${modelo}|${paleta}|${imovelId || ''}`;
    if (presetsCache.has(key)) return JSON.parse(JSON.stringify(presetsCache.get(key)));
    const q = new URLSearchParams({ paleta: paleta || 'principal' });
    if (imovelId) q.set('imovelId', String(imovelId));
    const r = await api('GET', `/api/pdf/cena-preset/${encodeURIComponent(modelo)}?${q.toString()}`);
    if (r && r.cena) {
      presetsCache.set(key, r.cena);
      return JSON.parse(JSON.stringify(r.cena));
    }
    return null;
  }

  async function carregarTodosPresets(paleta, imovelId) {
    const lista = await Promise.all(
      Object.entries(NOMES_MODELOS).map(async ([id, nome]) => {
        const doc = await carregarPreset(id, paleta, imovelId).catch(() => null);
        return { id, nome, doc };
      })
    );
    return lista.filter(x => x.doc);
  }

  function decorarSeletorImovelVitrine() {
    const rootEl = $('#pdfStudioRoot');
    if (!rootEl) return;
    const sel = rootEl.querySelector('select[name="stImovel"]');
    if (!sel) return;
    const aprovados = aprovadosVitrineSet();
    for (const opt of sel.options) {
      if (opt.value && aprovados.has(String(opt.value)) && !opt.textContent.startsWith('🪟 ')) {
        opt.textContent = `🪟 ${opt.textContent}`;
      }
    }
    const badge = $('#pdfVitrineBadge');
    if (badge) {
      badge.classList.toggle('hide', !aprovados.has(String(S.pdfSel || '')));
    }
  }

  function fecharModalExtra() {
    const host = $('#pdfExtraModal');
    if (host) host.innerHTML = '';
  }

  function abrirModalExtra(html) {
    const host = $('#pdfExtraModal');
    if (!host) return;
    host.innerHTML = `
      <div class="studio-modal-backdrop" id="pdfExtraBackdrop">
        <div class="studio-modal" data-allow-scroll="1">${html}</div>
      </div>`;
    const bd = $('#pdfExtraBackdrop');
    if (bd) {
      bd.addEventListener('click', ev => {
        if (ev.target === bd) fecharModalExtra();
      });
    }
    host.querySelectorAll('[data-pdfm="fechar"]').forEach(btn => btn.addEventListener('click', fecharModalExtra));
  }

  async function abrirModalAddPagina() {
    if (!studioInst) return;
    const docAtual = studioInst.getDoc();
    if ((docAtual.slides || []).length >= 14) {
      return toast('Limite máximo de 14 páginas atingido.', true);
    }
    abrirModalExtra(`
      <div class="studio-modal-head">
        <h3>Adicionar página (${(docAtual.slides || []).length} / 14)</h3>
        <button type="button" class="studio-icon-btn" data-pdfm="fechar" aria-label="Fechar">✕</button>
      </div>
      <div class="studio-stack">
        <p class="studio-hint">Escolha um layout pronto do modelo ${esc(modeloAtual)} para inserir na apresentação:</p>
        <div class="studio-stack" style="gap:8px;">
          ${LAYOUTS_PAGINA.map(l => `
            <button type="button" class="studio-pill-btn full" data-pdf-layout="${esc(l.tipo)}" style="justify-content:flex-start;padding:10px 14px;height:auto;text-align:left;">
              <span>
                <b style="display:block;font-size:13px;">${esc(l.titulo)}</b>
                <small style="opacity:0.72;font-weight:400;">${esc(l.desc)}</small>
              </span>
            </button>
          `).join('')}
        </div>
      </div>
    `);

    const host = $('#pdfExtraModal');
    if (!host) return;
    host.querySelectorAll('[data-pdf-layout]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tipo = btn.dataset.pdfLayout;
        fecharModalExtra();
        const doc = studioInst.getDoc();
        if ((doc.slides || []).length >= 14) return toast('Limite máximo de 14 páginas atingido.', true);
        const q = new URLSearchParams({ paleta: paletaAtual, slide: tipo });
        if (S.pdfSel) q.set('imovelId', String(S.pdfSel));
        const r = await api('GET', `/api/pdf/cena-preset/${encodeURIComponent(modeloAtual)}?${q.toString()}`);
        if (r && r.slide) {
          doc.slides.push(r.slide);
          studioInst.setDoc(doc);
          studioInst.irParaSlide(doc.slides.length - 1);
          toast(`Página "${r.slide.nome}" adicionada.`);
        }
      });
    });
  }

  function abrirModalSalvarModelo(docParaSalvar, comoNovo = true) {
    const nomeSugerido = docParaSalvar?.nome || `Modelo ${modeloAtual}`;
    abrirModalExtra(`
      <div class="studio-modal-head">
        <h3>${comoNovo ? 'Salvar como modelo próprio' : 'Salvar modelo'}</h3>
        <button type="button" class="studio-icon-btn" data-pdfm="fechar" aria-label="Fechar">✕</button>
      </div>
      <div class="studio-stack" id="pdfSalvarModeloForm">
        <label class="studio-field">
          <span>Nome do modelo</span>
          <input type="text" name="modNome" value="${esc(nomeSugerido)}" maxlength="60" placeholder="Ex.: Padrão Alto Luxo">
        </label>
        <label class="studio-chk">
          <input type="checkbox" name="modPadrao">
          <span>Definir como padrão ★ para envios automáticos no WhatsApp</span>
        </label>
        <button type="button" class="studio-primary-btn full" id="pdfConfirmarSalvarModelo">Salvar modelo</button>
      </div>
    `);
    const btn = $('#pdfConfirmarSalvarModelo');
    if (btn) {
      btn.addEventListener('click', async () => {
        const box = $('#pdfSalvarModeloForm');
        const nome = String(box.querySelector('input[name="modNome"]')?.value || '').trim() || 'Meu modelo';
        const padrao = Boolean(box.querySelector('input[name="modPadrao"]')?.checked);
        const payload = {
          id: comoNovo ? undefined : (modeloProprioAtivo || undefined),
          nome,
          padrao,
          cena: docParaSalvar
        };
        const r = await api('POST', '/api/pdf/modelos', payload);
        if (S.pdf) S.pdf.modelosProprios = { modelos: r.modelos, padrao: r.padrao };
        if (r.modelo) modeloProprioAtivo = r.modelo.id;
        if (studioInst) studioInst.setMeusModelos(S.pdf.modelosProprios);
        fecharModalExtra();
        toast(padrao ? 'Modelo salvo e definido como padrão ★!' : 'Modelo salvo em "Meus modelos"!');
      });
    }
  }

  function abrirModalEditarImovel(propParam) {
    const p = propParam || (S.inventory || []).find(x => String(x.id) === String(S.pdfSel)) || S.pdf?.imovel;
    if (!p) return toast('Selecione um imóvel primeiro.', true);
    const f = (S.pdf && S.pdf.ficha) || {};
    const tituloVal = f.titulo || p.edificio || '';
    const precoVal = f.preco || (Number(p.valor) > 0 ? brl(p.valor) : '');
    const destaquesVal = f.destaques || '';
    const descVal = f.descricao !== undefined ? f.descricao : (p.descricao || '');

    abrirModalExtra(`
      <div class="studio-modal-head">
        <h3>Editar dados do imóvel #${esc(p.id)}</h3>
        <button type="button" class="studio-icon-btn" data-pdfm="fechar" aria-label="Fechar">✕</button>
      </div>
      <div class="studio-stack" id="pdfEditarImovelForm">
        <label class="studio-field"><span>Título / Edifício</span><input type="text" name="edTitulo" value="${esc(tituloVal)}" maxlength="120"></label>
        <div class="studio-grid-2">
          <label class="studio-field"><span>Preço exibido</span><input type="text" name="edPreco" value="${esc(precoVal)}" maxlength="60"></label>
          <label class="studio-field"><span>Bairro / Setor</span><input type="text" name="edBairro" value="${esc(p.setor || '')}" maxlength="80"></label>
        </div>
        <div class="studio-grid-4">
          <label class="studio-field"><span>Área (m²)</span><input type="number" name="edArea" value="${esc(p.tamanho_m2 || '')}" min="0" step="1"></label>
          <label class="studio-field"><span>Quartos</span><input type="number" name="edQuartos" value="${esc(p.quartos || '')}" min="0" step="1"></label>
          <label class="studio-field"><span>Suítes</span><input type="number" name="edSuites" value="${esc(p.suites || '')}" min="0" step="1"></label>
          <label class="studio-field"><span>Vagas</span><input type="number" name="edVagas" value="${esc(p.vagas || '')}" min="0" step="1"></label>
        </div>
        <label class="studio-field"><span>Diferenciais (1 por linha)</span><textarea name="edDestaques" rows="3">${esc(destaquesVal)}</textarea></label>
        <label class="studio-field"><span>Descrição completa</span><textarea name="edDescricao" rows="5">${esc(descVal)}</textarea></label>
        <button type="button" class="studio-primary-btn full" id="pdfConfirmarEditarImovel">Salvar e atualizar palco</button>
      </div>
    `);

    const btn = $('#pdfConfirmarEditarImovel');
    if (btn) {
      btn.addEventListener('click', async () => {
        const box = $('#pdfEditarImovelForm');
        const fd = formData(box);
        const titulo = String(fd.edTitulo || '').trim();
        const preco = String(fd.edPreco || '').trim();
        const setor = String(fd.edBairro || '').trim();
        const tamanhoM2 = fd.edArea !== '' ? Number(fd.edArea) : p.tamanho_m2;
        const quartos = fd.edQuartos !== '' ? Number(fd.edQuartos) : p.quartos;
        const suites = fd.edSuites !== '' ? Number(fd.edSuites) : p.suites;
        const vagas = fd.edVagas !== '' ? Number(fd.edVagas) : p.vagas;
        const destaques = String(fd.edDestaques || '');
        const descricao = String(fd.edDescricao || '');

        // Atualiza Carteira (sheets)
        const digitsPreco = preco.replace(/[^\d]/g, '');
        const propUpdate = {
          edificio: titulo,
          setor,
          tamanho_m2: tamanhoM2,
          quartos,
          suites,
          vagas,
          descricao
        };
        if (digitsPreco && Number(digitsPreco) > 0 && !/m[eê]s/i.test(preco)) {
          propUpdate.valor = Number(digitsPreco);
        }

        btn.disabled = true;
        try {
          const rProp = await api('PUT', `/api/property/${encodeURIComponent(p.id)}`, propUpdate);
          if (Array.isArray(rProp.inventory)) S.inventory = rProp.inventory;
          const updatedProp = rProp.property || { ...p, ...propUpdate };

          const rFicha = await api('POST', `/api/pdf/${encodeURIComponent(p.id)}`, {
            titulo,
            preco,
            destaques,
            descricao
          });
          if (S.pdf) {
            S.pdf.ficha = rFicha.ficha;
            S.pdf.imovel = updatedProp;
          }

          if (studioInst) {
            studioInst.setProp(updatedProp, fichaOverrideDe(rFicha.ficha, updatedProp));
            decorarSeletorImovelVitrine();
          }
          presetsCache.clear();
          fecharModalExtra();
          toast('Dados do imóvel atualizados ao vivo!');
        } catch (err) {
          toast(err.message || 'Erro ao atualizar dados do imóvel.', true);
        } finally {
          if (btn.isConnected) btn.disabled = false;
        }
      });
    }
  }

  async function exportarPdfArquivo(tipo = 'pdf', cenaOverride = null) {
    if (!S.pdfSel || !studioInst) return toast('Selecione um imóvel primeiro.', true);
    const cena = cenaOverride || studioInst.serializarCenaComTelemetria();
    const aba = tipo === 'preview' ? window.open('', '_blank') : null;
    if (aba) aba.opener = null;
    toast('Gerando PDF 16:9 vetorial…');

    const fetchOpts = {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'x-secretaria': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cena,
        modelo: modeloAtual,
        paleta: paletaAtual
      })
    };
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      fetchOpts.signal = AbortSignal.timeout(45000);
    }

    let r;
    try {
      r = await fetch(`/api/pdf/${encodeURIComponent(S.pdfSel)}/arquivo`, fetchOpts);
    } catch {
      if (aba) aba.close();
      throw new Error('Sem conexão ao gerar PDF. Tente novamente.');
    }
    if (r.status === 401) {
      if (aba) aba.close();
      S.authed = false;
      BIGA.render();
      throw new Error('Faça login novamente.');
    }
    if (!r.ok) {
      if (aba) aba.close();
      throw new Error((await r.json().catch(() => ({}))).error || `Erro ${r.status}`);
    }

    const blob = await r.blob();
    const nome = (/filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '') || [])[1] || 'Imovel.pdf';
    const url = URL.createObjectURL(blob);

    if (tipo === 'preview') {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      if (aba) aba.location.href = url;
      else location.href = url;
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast('PDF 16:9 baixado!');
    }
  }

  async function salvarCenaNoImovel() {
    if (!S.pdfSel || !studioInst) return;
    const cena = studioInst.serializarCenaComTelemetria();
    const r = await api('POST', `/api/pdf/${encodeURIComponent(S.pdfSel)}`, {
      cena,
      modelo: modeloAtual,
      paleta: paletaAtual
    });
    if (S.pdf) {
      S.pdf.ficha = r.ficha;
      S.pdf.cena = r.cena || cena;
    }
    toast('Apresentação salva no imóvel!');
  }

  function viewPdf() {
    destruirStudioPdf();
    const ord = inventarioOrdenado();
    const aprovados = aprovadosVitrineSet();
    const selProp = ord.find(p => String(p.id) === String(S.pdfSel)) || ord[0] || null;
    if (selProp) S.pdfSel = selProp.id;

    const d = S.pdf || {};
    const f = d.ficha || {};
    modeloAtual = f.modelo || d.kit?.modelo || 'A';
    paletaAtual = f.paleta || d.kit?.paletaPadrao || 'principal';
    const vitrineOn = selProp && aprovados.has(String(selProp.id));

    shell(`
      <section class="section" style="padding-top:16px;padding-bottom:12px;">
        <div class="container stack-sm">
          <div class="row between" style="flex-wrap:wrap;gap:10px;align-items:center;">
            <div class="row tight" style="align-items:center;gap:10px;">
              <h2 class="title" style="margin:0;">Estúdio PDF 16:9</h2>
              <span id="pdfVitrineBadge" class="tag enviar ${vitrineOn ? '' : 'hide'}">🪟 Aprovado na Vitrine</span>
            </div>
            ${ord.length ? `
              <div class="row tight" style="flex-wrap:wrap;gap:8px;">
                <button type="button" class="btn-ghost" data-action="pdfEditarDados">✏️ Editar dados do imóvel</button>
                <button type="button" class="btn-ghost" data-action="pdfAbrirAddPagina">＋ Página</button>
                <button type="button" class="btn-ghost" data-action="pdfSalvarImovel">💾 Salvar no imóvel</button>
                <button type="button" class="btn-ghost" data-action="pdfSalvarModeloNovo">★ Salvar como modelo</button>
                <button type="button" class="btn-ghost" data-action="pdfVer">Prévia PDF</button>
                <button type="button" class="btn-primary" data-action="pdfBaixar">Baixar PDF 16:9</button>
              </div>
            ` : ''}
          </div>
          ${!ord.length ? '<div class="card"><p class="body muted">Cadastre um imóvel na Carteira primeiro.</p></div>' : `
            <div id="pdfStudioRoot"></div>
            <div id="pdfExtraModal"></div>
          `}
        </div>
      </section>
    `);

    if (!ord.length) return;
    const rootEl = $('#pdfStudioRoot');
    if (!rootEl) return;
    if (!window.BIGA_STUDIO || typeof window.BIGA_STUDIO.montar !== 'function') {
      toast('Motor gráfico Studio não carregado. Recarregue a página.', true);
      return;
    }

    const modelosProntos = Array.isArray(d.modelosProntos) ? d.modelosProntos : [];

    studioInst = window.BIGA_STUDIO.montar(rootEl, {
      modo: 'pdf',
      doc: d.cena,
      prop: selProp,
      kit: d.kit,
      fichaOverride: fichaOverrideDe(f, selProp),
      inventario: () => inventarioOrdenado(),
      modelosProntos,
      meusModelos: () => (S.pdf && S.pdf.modelosProprios) || { modelos: [], padrao: null },
      opcoesTopbar: { apresentacao: true, whatsapp: true, lote: false, vitrine: false },
      toast,
      onSelectImovel: async p => {
        if (!p) return null;
        S.pdfSel = p.id;
        modeloProprioAtivo = null;
        const novoDados = await api('GET', `/api/pdf/${encodeURIComponent(p.id)}`);
        S.pdf = { ...S.pdf, ...novoDados };
        const novasF = novoDados.ficha || {};
        modeloAtual = novasF.modelo || novoDados.kit?.modelo || 'A';
        paletaAtual = novasF.paleta || novoDados.kit?.paletaPadrao || 'principal';
        const novProntos = await carregarTodosPresets(paletaAtual, p.id);
        modelosProntos.splice(0, modelosProntos.length, ...novProntos);
        S.pdf.modelosProntos = modelosProntos;
        setTimeout(decorarSeletorImovelVitrine, 20);
        return {
          doc: novoDados.cena,
          fichaOverride: fichaOverrideDe(novasF, p)
        };
      },
      onSelectModeloPronto: async mod => {
        modeloAtual = String(mod.id || 'A');
        modeloProprioAtivo = null;
        return carregarPreset(modeloAtual, paletaAtual, S.pdfSel);
      },
      onSelectPaleta: async pal => {
        paletaAtual = pal === 'segunda' ? 'segunda' : 'principal';
        const novProntos = await carregarTodosPresets(paletaAtual, S.pdfSel);
        modelosProntos.splice(0, modelosProntos.length, ...novProntos);
        return carregarPreset(modeloAtual, paletaAtual, S.pdfSel);
      },
      onSelectMeuModelo: mod => {
        modeloProprioAtivo = mod.id || null;
        return JSON.parse(JSON.stringify(mod.cena || mod.doc || mod));
      },
      onFavoritarModelo: async modeloId => {
        const atualPadrao = S.pdf?.modelosProprios?.padrao;
        const tornarPadrao = atualPadrao !== modeloId;
        const r = await api('POST', '/api/pdf/modelos', { id: modeloId, padrao: tornarPadrao });
        if (S.pdf) S.pdf.modelosProprios = { modelos: r.modelos, padrao: r.padrao };
        if (studioInst) studioInst.setMeusModelos(S.pdf.modelosProprios);
        toast(tornarPadrao ? 'Modelo definido como padrão para WhatsApp ★' : 'Removido dos padrões.');
      },
      onRenomearModelo: async (modeloId, novoNome) => {
        const r = await api('POST', '/api/pdf/modelos', { id: modeloId, nome: novoNome });
        if (S.pdf) S.pdf.modelosProprios = { modelos: r.modelos, padrao: r.padrao };
        if (studioInst) studioInst.setMeusModelos(S.pdf.modelosProprios);
      },
      onDuplicarModelo: async modeloId => {
        const lista = S.pdf?.modelosProprios?.modelos || [];
        const orig = lista.find(x => x.id === modeloId);
        if (!orig) return;
        const r = await api('POST', '/api/pdf/modelos', {
          nome: `${orig.nome || 'Modelo'} (cópia)`,
          cena: orig.cena || orig.doc
        });
        if (S.pdf) S.pdf.modelosProprios = { modelos: r.modelos, padrao: r.padrao };
        if (studioInst) studioInst.setMeusModelos(S.pdf.modelosProprios);
      },
      onExcluirModelo: async modeloId => {
        const r = await api('DELETE', `/api/pdf/modelos/${encodeURIComponent(modeloId)}`);
        if (S.pdf) S.pdf.modelosProprios = { modelos: r.modelos, padrao: r.padrao };
        if (modeloProprioAtivo === modeloId) modeloProprioAtivo = null;
        if (studioInst) studioInst.setMeusModelos(S.pdf.modelosProprios);
        toast('Modelo excluído.');
      },
      onSalvarModelo: async ({ doc, comoNovo }) => {
        if (comoNovo || !modeloProprioAtivo) {
          abrirModalSalvarModelo(doc, true);
          return;
        }
        const r = await api('POST', '/api/pdf/modelos', { id: modeloProprioAtivo, cena: doc });
        if (S.pdf) S.pdf.modelosProprios = { modelos: r.modelos, padrao: r.padrao };
        if (studioInst) studioInst.setMeusModelos(S.pdf.modelosProprios);
        toast('Modelo atualizado!');
      },
      onRestaurar: async () => {
        if (!confirm('Restaurar a apresentação padrão deste imóvel?')) return null;
        const r = await api('POST', `/api/pdf/${encodeURIComponent(S.pdfSel)}`, { restaurar: true });
        if (S.pdf) {
          S.pdf.ficha = r.ficha;
          S.pdf.cena = r.cena;
        }
        modeloProprioAtivo = null;
        toast('Apresentação restaurada para o padrão.');
        return r.cena;
      },
      onEditarImovel: p => abrirModalEditarImovel(p),
      onSalvarKit: async kitOut => {
        const r = await api('POST', '/api/pdf/kit', kitOut);
        if (S.pdf) S.pdf.kit = r.kit;
        return r.kit;
      },
      onUploadLogoKit: async file => {
        const fd = new FormData();
        fd.append('logo', file);
        const r = await api('POST', '/api/pdf/kit/logo', fd, true);
        if (S.pdf) S.pdf.kit = r.kit;
        return r;
      },
      onExportar: async ({ tipo, serializar }) => {
        const cena = typeof serializar === 'function' ? serializar() : null;
        await exportarPdfArquivo(tipo === 'preview' ? 'preview' : 'pdf', cena);
      },
      onWhatsapp: async ({ prop, telefone, mensagem, serializar }) => {
        const tel = String(telefone || '').replace(/\D/g, '');
        if (!tel) return toast('Digite o telefone com DDD.', true);
        const cena = typeof serializar === 'function' ? serializar() : null;
        toast('Enviando PDF 16:9 pelo WhatsApp…');
        await api('POST', `/api/pdf/${encodeURIComponent(prop?.id || S.pdfSel)}/enviar`, {
          telefone,
          mensagem,
          cena
        });
        toast('PDF enviado no WhatsApp! ✅');
      }
    });

    // Intercepta clique no botão "+ Página" do Studio para oferecer os 7 layouts prontos
    rootEl.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-st="addSlide"]');
      if (!btn || !rootEl.contains(btn)) return;
      ev.preventDefault();
      ev.stopPropagation();
      abrirModalAddPagina();
    }, true);

    // Decora seletor de imóveis com badge 🪟 quando aprovado na Vitrine
    decorarSeletorImovelVitrine();
    if (typeof MutationObserver !== 'undefined') {
      studioObserver = new MutationObserver(() => decorarSeletorImovelVitrine());
      studioObserver.observe(rootEl, { childList: true, subtree: true });
    }
  }

  // Limpa listeners do Konva/window quando sair da aba #pdf
  if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', () => {
      if ((location.hash || '').slice(1) !== 'pdf') destruirStudioPdf();
    });
  }

  register({
    views: { pdf: viewPdf },
    loaders: {
      pdf: async () => {
        destruirStudioPdf();
        S.inventory = (await api('GET', '/api/inventory')).inventory;
        if (!S.vitrine) S.vitrine = await api('GET', '/api/vitrine').catch(() => null);
        const ord = inventarioOrdenado();
        if (!S.pdfSel || !ord.some(p => String(p.id) === String(S.pdfSel))) {
          S.pdfSel = (ord[0] || {}).id;
        }
        if (S.pdfSel) {
          const dadosPdf = await api('GET', `/api/pdf/${encodeURIComponent(S.pdfSel)}`);
          const pal = dadosPdf.ficha?.paleta || dadosPdf.kit?.paletaPadrao || 'principal';
          const modelosProntos = await carregarTodosPresets(pal, S.pdfSel);
          S.pdf = { ...dadosPdf, modelosProntos };
        } else {
          S.pdf = null;
        }
      }
    },
    actions: {
      irPdf: async el => {
        S.pdfSel = el.dataset.id;
        location.hash = '#pdf';
      },
      pdfEditarDados: async () => abrirModalEditarImovel(),
      pdfAbrirAddPagina: async () => abrirModalAddPagina(),
      pdfSalvarImovel: async () => salvarCenaNoImovel(),
      pdfSalvarModeloNovo: async () => {
        if (!studioInst) return;
        abrirModalSalvarModelo(studioInst.getDoc(), true);
      },
      pdfBaixar: async () => exportarPdfArquivo('pdf'),
      pdfVer: async () => exportarPdfArquivo('preview')
    }
  });
})();
