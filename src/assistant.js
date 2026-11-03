/**
 * ============================================================================
 * ASSISTENTE PESSOAL NO WHATSAPP (chat "Mensagem para mim" / seu número de alerta)
 * ============================================================================
 * Você conversa com a secretária pelo seu próprio WhatsApp:
 *   cadastrar <descrição do imóvel>  -> ela entende tipo, bairro, quartos, valor...
 *   (mande as fotos)                 -> anexadas ao rascunho
 *   salvar / cancelar                -> grava na planilha ou descarta
 *   valor 640 mil / quartos 3 / ...  -> corrige um campo do rascunho
 *   enviar A12 [id]                  -> manda o imóvel para quem pediu no grupo (alerta A12)
 *   lista | ver 12 | ativar 12 | desativar 12 | pdf 12
 *   vitrine | vitrine 12 | aprovar 12 | reprovar 12
 *   buscas | demanda | status | pausar | retomar | ajuda
 * Só reage a comandos conhecidos: suas anotações no "Mensagem para mim" continuam livres.
 * ============================================================================
 */
const { normalize, parseBrazilianNumber } = require('./brain/text');
const { detectTipos, detectRooms, detectArea, detectPrice, detectMobilia, detectNegocio } = require('./brain/parser');
const { detectLocations } = require('./brain/locations');
const { nowParts } = require('./timeutil');
const sheets = require('./sheets');
const radar = require('./radar');
const vitrine = require('./vitrine');
const { loadSettings, saveSettings } = require('./settings');
const { describeProperty, formatPriceLabel } = require('./matcher');

const BOT = '🤖';
const drafts = new Map(); // chatKey -> { prop, fotos: [], ts }
const DRAFT_TTL_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Texto livre -> imóvel
// ---------------------------------------------------------------------------
function parsePropertyFromText(text) {
  const norm = normalize(text);
  const tipos = detectTipos(norm);
  const rooms = detectRooms(norm);
  const area = detectArea(norm);
  const neg = detectNegocio(norm);
  const price = detectPrice(area.textWithoutArea, false);
  const loc = detectLocations(text);

  const prop = {
    tipo: tipos[0] || 'Apartamento',
    negociacao: neg.agio ? 'AGIO' : neg.transacao === 'ALUGUEL' ? 'ALUGUEL' : 'VENDA',
    setor: loc.bairros[0] || (loc.condominios[0] && loc.condominios[0].name) || '',
    edificio: (loc.condominios[0] && loc.condominios[0].name) || (loc.edificios[0] && loc.edificios[0].name) || '',
    cidade: loc.cidades.find(c => c !== 'Goiânia') || 'Goiânia',
    quartos: rooms.quartos_min || '',
    suites: rooms.suites_min || '',
    vagas: rooms.vagas_min || '',
    tamanho_m2: area.area_min ? Math.round(area.area_min / 0.95) : area.area_max || '',
    mobiliado: { MOBILIADO: 'SIM', SEMI: 'SEMI', SEM: 'NAO' }[detectMobilia(norm)] || '',
    descricao: String(text).replace(/^\s*(cadastrar|cadastra|novo im[oó]vel|#im[oó]vel)\s*:?\s*/i, '').trim()
  };

  // "ed. Solar", "edifício Solar", "residencial X"
  const ed = String(text).match(/\b(?:ed\.?|edif[ií]cio|residencial|condom[ií]nio)\s+([A-ZÀ-Úa-zà-ú0-9][\wÀ-ú'-]*(?:\s+[A-ZÀ-Ú][\wÀ-ú'-]*){0,3})/);
  if (ed && !prop.edificio) prop.edificio = ed[1].trim();

  if (neg.agio) {
    const ag = norm.match(/agio\s*(?:de|r\$|:)?\s*(?:r\$\s*)?(\d+(?:[.,]\d+)?)\s*(mil|k)?/);
    if (ag) prop.valor_agio = parseBrazilianNumber(ag[1]) * (ag[2] ? 1000 : 1);
    const total = norm.match(/(?:valor total|total|saldo|valor do imovel)\s*(?:de|r\$|:)?\s*(?:r\$\s*)?(\d+(?:[.,]\d+)?)\s*(mil|k|mi|milhao|milhoes)?/);
    if (total) prop.valor = parseBrazilianNumber(total[1]) * (/mi|milh/.test(total[2] || '') ? 1e6 : total[2] ? 1e3 : 1);
  } else if (price.valor_alvo || price.valor_max) {
    prop.valor = price.valor_alvo || price.valor_max;
  }

  const cond = norm.match(/\bcondominio\s*(?:de|r\$|:)?\s*(?:r\$\s*)?(\d{2,5})(?:,\d{2})?\b/);
  if (cond) prop.condominio = parseInt(cond[1], 10);
  if (/\b(aceita|aceito|estuda)\s+permuta\b/.test(norm)) prop.aceita_permuta = 'SIM';
  if (/\b(nao aceita|sem)\s+permuta\b/.test(norm)) prop.aceita_permuta = 'NAO';
  if (/\b(aceita|aceito)\s+financiamento|financiavel\b/.test(norm)) prop.aceita_financiamento = 'SIM';
  const idade = norm.match(/\b(\d{1,2})\s*anos\b/);
  if (idade) prop.idade_anos = parseInt(idade[1], 10);
  if (/\b(lazer completo|area de lazer|piscina|academia)\b/.test(norm)) prop.lazer = 'SIM';
  return prop;
}

function draftSummary(p, fotos) {
  const linhas = [
    `${BOT} *Rascunho do imóvel*`,
    '',
    describeProperty(p).replace(/\*/g, ''),
    `💰 ${p.valor || p.valor_agio ? formatPriceLabel(p) : '❗ valor não identificado'}`,
    `🏷️ ${{ AGIO: 'Ágio', ALUGUEL: 'Aluguel', VENDA: 'Venda' }[p.negociacao] || 'Venda'}${p.aceita_permuta === 'SIM' ? ' · aceita permuta' : ''}${p.mobiliado === 'SIM' ? ' · mobiliado' : ''}`,
    `📸 ${fotos.length} foto(s)`,
    ''
  ];
  const faltando = [];
  if (!p.setor) faltando.push('bairro (ex: *setor Jardim Goiás*)');
  if (!p.valor && !p.valor_agio) faltando.push('valor (ex: *valor 650 mil*)');
  if (faltando.length) linhas.push(`Falta: ${faltando.join(', ')}`);
  linhas.push('Mande as fotos agora. Para corrigir: *campo valor* (ex: _quartos 3_, _suites 2_, _vagas 2_, _m2 98_, _edificio Solar_, _permuta sim_).');
  linhas.push('Quando terminar responda *SALVAR* (ou *CANCELAR*).');
  return linhas.join('\n');
}

const FIELD_ALIASES = {
  valor: 'valor', preco: 'valor', agio: 'valor_agio', quartos: 'quartos', qts: 'quartos', suites: 'suites', suite: 'suites',
  vagas: 'vagas', vaga: 'vagas', m2: 'tamanho_m2', metragem: 'tamanho_m2', area: 'tamanho_m2', setor: 'setor', bairro: 'setor',
  edificio: 'edificio', ed: 'edificio', condominio: 'condominio', cidade: 'cidade', tipo: 'tipo', descricao: 'descricao',
  permuta: 'aceita_permuta', financiamento: 'aceita_financiamento', mobiliado: 'mobiliado', idade: 'idade_anos', negociacao: 'negociacao'
};

function applyFieldEdit(prop, text) {
  const m = String(text).trim().match(/^([a-zA-ZÀ-ú0-9]+)\s*[:=]?\s+(.+)$/s);
  if (!m) return false;
  const field = FIELD_ALIASES[normalize(m[1])];
  if (!field) return false;
  let value = m[2].trim();
  if (['valor', 'valor_agio', 'condominio'].includes(field)) {
    const p = detectPrice(normalize(/r\$|mil|k|mi/i.test(value) ? value : `r$ ${value}`), false);
    const v = p.valor_alvo || p.valor_max || parseBrazilianNumber(value.replace(/[^\d.,]/g, ''));
    if (!v) return false;
    value = field === 'condominio' ? parseBrazilianNumber(value.replace(/[^\d.,]/g, '')) : v;
  } else if (['quartos', 'suites', 'vagas', 'tamanho_m2', 'idade_anos'].includes(field)) {
    value = parseBrazilianNumber(value.replace(/[^\d.,]/g, ''));
    if (value === null) return false;
  } else if (['aceita_permuta', 'aceita_financiamento'].includes(field)) {
    value = /^(s|sim|aceita)/i.test(value) ? 'SIM' : /^(n|nao|não)/i.test(value) ? 'NAO' : '';
  } else if (field === 'mobiliado') {
    value = /semi|armar/i.test(value) ? 'SEMI' : /^(s|sim)/i.test(value) ? 'SIM' : 'NAO';
  } else if (field === 'setor') {
    const loc = detectLocations(value);
    value = loc.bairros[0] || value;
  }
  prop[field] = value;
  return true;
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------
const HELP = `${BOT} *Oi, eu sou a BIGA!* Seus comandos:

🏠 *Cadastro rápido*
• *cadastrar* apto 3q 2 suítes 98m² setor Bueno ed. Solar 650 mil aceita permuta
• mande as fotos → *salvar* (ou *cancelar*)
• corrigir: _valor 640 mil_, _quartos 3_, _edificio Solar_…

📋 *Carteira*
• *lista* · *ver 12* · *pdf 12* · *ativar 12* · *desativar 12*

🔔 *Pedidos dos grupos*
• *buscas* (últimos pedidos) · *demanda* (o que mais pedem)
• *enviar A12* → manda o imóvel sugerido para quem pediu
• *enviar A12 30* → manda o imóvel #30 para quem pediu

🪟 *Vitrine*
• *vitrine* (pendentes) · *vitrine 12* (prévia) · *aprovar 12* · *reprovar 12*

💾 *backup* (arquivo com toda a memória) · 🔄 *atualizar* · *versão*
👥 *corretores* (BIGAs de outros corretores)

🔎 *Busca inteligente*
• *busca* _apto 800 mil a 1 milhão no Marista, mínimo 100 m²_
  → procura nos seus grupos (últimos 90 dias) e na OLX, ZAP e VivaReal
• *importar histórico* (pede ao celular os anúncios antigos dos grupos)
• mande a conversa exportada de um grupo (.txt/.zip) para guardar os anúncios
• *memória* (quantos anúncios estão guardados)
⚙️ *status* · *pausar* · *retomar* · *ajuda*`;

async function reply(wa, chatJid, text) {
  return wa.sendText(chatJid, text.startsWith(BOT) ? text : `${BOT} ${text}`);
}

/**
 * Processa uma mensagem do dono. Retorna true se tratou como comando.
 * msgInfo: { chatJid, text, hasImage, downloadImage: async () => filename }
 */
async function handleOwnerMessage(wa, msgInfo, ctx = {}) {
  const { chatJid, hasImage } = msgInfo;
  const text = String(msgInfo.text || '').trim();
  const norm = normalize(text);
  const key = chatJid;
  let draft = drafts.get(key);
  if (draft && Date.now() - draft.ts > DRAFT_TTL_MS) {
    drafts.delete(key);
    draft = null;
  }

  // Fotos para o rascunho aberto (ou foto com legenda "cadastrar ...")
  if (hasImage && (draft || /^(cadastrar|cadastra|novo imovel|#imovel)\b/.test(norm))) {
    if (!draft) {
      draft = { prop: parsePropertyFromText(text), fotos: [], ts: Date.now() };
      drafts.set(key, draft);
    }
    const file = await msgInfo.downloadImage();
    if (file) draft.fotos.push(file);
    draft.ts = Date.now();
    clearTimeout(draft.ackTimer);
    draft.ackTimer = setTimeout(() => {
      reply(wa, chatJid, `📸 ${draft.fotos.length} foto(s) no rascunho. Responda *SALVAR* quando terminar.`).catch(() => {});
    }, 4000);
    return true;
  }
  if (!text) return false;

  // --- Busca inteligente ---
  const busca = text.match(/^\s*(?:busca(?:r)?(?:\s+inteligente)?|procur(?:ar|a))\s*[:\-]?\s+([\s\S]{8,})$/i);
  if (busca) {
    const bi0 = require('./busca-inteligente');
    const { countCriteria } = require('./brain/engine');
    if (countCriteria(bi0.entenderPedido(busca[1]).criterios) < 2) {
      if (!/\b(ap|apto|apartamento|casa|sobrado|lote|terreno|cobertura|flat|chacara|sala|imovel|mil|milh|m2|quartos?)\b/.test(norm)) return false; // anotação comum ("busca o João…")
      await reply(wa, chatJid, 'Preciso de mais detalhes. Ex.: *busca apto 800 mil a 1 milhão no Setor Marista, mínimo 100 m²*');
      return true;
    }
    await reply(wa, chatJid, '🔎 Buscando nos seus grupos e nos portais… (1 a 2 minutos)');
    const bi = require('./busca-inteligente');
    bi.buscar(busca[1])
      .then(async r => {
        for (const parte of bi.formatarRelatorio(r)) await reply(wa, chatJid, parte);
        if (ctx.log) ctx.log('BUSCA', `🔎 Busca: ${r.descricao} — ${r.grupos.length} nos grupos, ${r.portais.itens.length} nos portais.`);
      })
      .catch(err => reply(wa, chatJid, `Não consegui terminar a busca: ${err.message}`).catch(() => {}));
    return true;
  }
  if (/^(importar historico|importar o historico|importar anuncios|importar)$/.test(norm)) {
    if (!ctx.importarHistorico) return false;
    try {
      const st = await ctx.importarHistorico(async e => {
        const sem = e.semAncora.length ? `\n⚠️ ${e.semAncora.length} grupo(s) ainda sem mensagem recente para começar (ex.: ${e.semAncora.slice(0, 3).join(', ')}). Para esses, exporte a conversa e me mande o arquivo.` : '';
        await reply(wa, chatJid, `📥 *Histórico importado*\n${e.anuncios} anúncios de ${e.comHistorico} de ${e.grupos} grupos.${sem}\nMande *memória* para ver o total.`);
      });
      await reply(wa, chatJid, st.jaRodando ? `A importação já está rodando (${st.anuncios} anúncios até agora).` : '📥 Importando os anúncios antigos dos grupos (até 90 dias). Deixe o *celular ligado e com internet*. Pode levar de minutos a horas; eu aviso quando terminar.');
    } catch (err) {
      await reply(wa, chatJid, err.message);
    }
    return true;
  }
  if (/^(memoria|memoria de anuncios|anuncios)$/.test(norm)) {
    const r = require('./anuncios').resumo();
    const imp = ctx.estadoImportacao ? ctx.estadoImportacao() : null;
    const desde = r.desde ? new Date(r.desde).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
    await reply(wa, chatJid, `🧠 *Memória de anúncios*\n${r.total} anúncios de ${r.grupos} grupos (desde ${desde}; guardo 90 dias).${imp && imp.rodando ? `\n📥 Importando histórico: ${imp.anuncios} anúncios até agora.` : ''}`);
    return true;
  }

  // --- rascunho aberto ---
  if (draft) {
    if (/^(salvar|salva|ok salvar|confirmar|confirma)$/.test(norm)) {
      if (!draft.prop.setor) {
        await reply(wa, chatJid, 'Falta o bairro. Responda por exemplo: *setor Jardim Goiás*');
        return true;
      }
      const created = await sheets.createProperty({ ...draft.prop, fotos: draft.fotos, ativo: true });
      drafts.delete(key);
      if (ctx.log) ctx.log('ASSISTENTE', `Imóvel #${created.id} cadastrado pelo WhatsApp.`);
      await reply(wa, chatJid, `✅ Imóvel *#${created.id}* salvo e ativo — já vale para os pedidos dos grupos.\nQuer divulgar na vitrine? Responda *vitrine ${created.id}*.`);
      return true;
    }
    if (/^(cancelar|cancela|descartar)$/.test(norm)) {
      drafts.delete(key);
      await reply(wa, chatJid, 'Rascunho descartado.');
      return true;
    }
    if (applyFieldEdit(draft.prop, text)) {
      draft.ts = Date.now();
      await reply(wa, chatJid, draftSummary(draft.prop, draft.fotos));
      return true;
    }
  }

  // --- cadastro ---
  const cad = text.match(/^\s*(cadastrar|cadastra|novo im[oó]vel|#im[oó]vel)\b\s*:?\s*([\s\S]*)$/i);
  if (cad) {
    draft = { prop: parsePropertyFromText(cad[2] || ''), fotos: [], ts: Date.now() };
    drafts.set(key, draft);
    await reply(wa, chatJid, draftSummary(draft.prop, draft.fotos));
    return true;
  }

  let m;
  if (/^(atualizar|atualiza|atualizacao|update)$/.test(norm)) {
    const sistema = require('./sistema');
    try {
      sistema.requestUpdate();
      await reply(wa, chatJid, `🔄 Atualização pedida (versão atual ${sistema.version() || '?'}). Se houver versão nova, eu reinicio em 1 a 2 minutos e continuo conectada.`);
    } catch (err) {
      await reply(wa, chatJid, err.message);
    }
    return true;
  }
  if (/^(versao|versão)$/.test(norm)) {
    const sistema = require('./sistema');
    const ult = sistema.lastResults(1)[0];
    await reply(wa, chatJid, `Versão ${sistema.version() || '?'}${ult ? `\nÚltima atualização: ${ult}` : ''}`);
    return true;
  }
  if (/^(corretores|corretor|usuarios)$/.test(norm)) {
    const lista = require('./sistema').corretores();
    if (!lista.length) {
      await reply(wa, chatJid, 'Nenhuma BIGA de outro corretor ainda (ela aparece depois da atualização da VM).');
      return true;
    }
    const linhas = lista.map(c => {
      const nome = c.nome.charAt(0).toUpperCase() + c.nome.slice(1);
      return c.codigo
        ? `• *${nome}*: ${c.url}\n  Código para criar a senha: *${c.codigo}* (passe só para ela)`
        : `• *${nome}*: ${c.url}\n  ✅ senha já criada`;
    });
    await reply(wa, chatJid, `👥 *BIGAs dos corretores*\n${linhas.join('\n')}\n\nCada uma tem WhatsApp, carteira, senha e análises próprias.`);
    return true;
  }
  if (/^(backup|copia de seguranca|salvar memoria)$/.test(norm)) {
    if (!ctx.sendBackup) return false;
    await reply(wa, chatJid, 'Gerando o backup da memória…');
    await ctx.sendBackup(chatJid);
    return true;
  }
  if (/^(ajuda|menu|comandos|help)$/.test(norm)) {
    await reply(wa, chatJid, HELP);
    return true;
  }
  if (/^status$/.test(norm)) {
    const inv = await sheets.loadInventory();
    const s = loadSettings();
    const hoje = radar.since(Date.now() - nowParts().minutes * 60000);
    await reply(wa, chatJid, `*Status*\n${s.pausado ? '⏸️ PAUSADA' : '▶️ Ativa'} · ${inv.length} imóveis ativos\nHoje: ${hoje.length} pedidos lidos, ${hoje.filter(h => h.decision === 'ENVIAR').length} enviados, ${hoje.filter(h => h.decision === 'AVISAR').length} para você conferir.`);
    return true;
  }
  if (/^(pausar|pausa|parar tudo)$/.test(norm)) {
    saveSettings({ pausado: true });
    await reply(wa, chatJid, '⏸️ Pausada. Não envio nada automático até você mandar *retomar*.');
    return true;
  }
  if (/^(retomar|continuar|despausar|voltar)$/.test(norm)) {
    saveSettings({ pausado: false });
    await reply(wa, chatJid, '▶️ De volta ao trabalho!');
    return true;
  }
  if (/^(lista|carteira|imoveis)$/.test(norm)) {
    const inv = await sheets.loadInventory();
    const lines = inv.slice(0, 40).map(p => `#${p.id} ${p.tipo} · ${p.setor} · ${p.quartos || '-'}q · ${formatPriceLabel(p)}`);
    await reply(wa, chatJid, inv.length ? `*Carteira ativa (${inv.length})*\n${lines.join('\n')}` : 'Nenhum imóvel ativo.');
    return true;
  }
  if ((m = norm.match(/^ver\s+#?(\w+)$/))) {
    const p = await sheets.getPropertyById(m[1]);
    await reply(wa, chatJid, p ? `${describeProperty(p)}\n💰 ${formatPriceLabel(p)}\n${p.ativo ? '✅ ativo' : '⛔ inativo'}\n\n${p.descricao}` : 'Imóvel não encontrado.');
    return true;
  }
  if ((m = norm.match(/^(ativar|desativar|vendido|inativar)\s+#?(\w+)$/))) {
    const ativo = m[1] === 'ativar';
    try {
      const p = await sheets.updateProperty(m[2], { ativo });
      await reply(wa, chatJid, `Imóvel #${p.id} agora está ${ativo ? '✅ ativo' : '⛔ inativo'}.`);
    } catch (err) {
      await reply(wa, chatJid, err.message);
    }
    return true;
  }
  if ((m = norm.match(/^pdf\s+#?(\w+)$/))) {
    const p = await sheets.getPropertyById(m[1]);
    if (!p) await reply(wa, chatJid, 'Imóvel não encontrado.');
    else await wa.sendPdf(chatJid, p);
    return true;
  }
  if (/^(buscas|pedidos|radar)$/.test(norm)) {
    const last = radar.list({ limit: 8 });
    const lines = last.map(r => `*${r.code}* ${r.decision === 'ENVIAR' ? '✅' : r.decision === 'AVISAR' ? '🤔' : '·'} ${r.sender}: ${r.resumo || ''}`.slice(0, 220));
    await reply(wa, chatJid, last.length ? `*Últimos pedidos*\n${lines.join('\n')}` : 'Nenhum pedido registrado ainda.');
    return true;
  }
  if (/^demanda$/.test(norm)) {
    const d = radar.demand(30);
    const fmt = arr => arr.map(x => `${x.nome} (${x.qtd})`).join(', ') || '-';
    await reply(wa, chatJid, `*Demanda dos últimos 30 dias* (${d.total} pedidos)\n🏠 Tipos: ${fmt(d.tipos)}\n📍 Locais: ${fmt(d.locais)}\n💰 Faixas: ${fmt(d.faixas)}\n\nUse isso para captar o que está sendo procurado.`);
    return true;
  }
  if ((m = norm.match(/^(?:enviar|envia|ok|manda|mandar)\s+(a\d{1,3})(?:\s+#?(\w+))?$/))) {
    await ctx.approveAlert(chatJid, m[1].toUpperCase(), m[2] || null);
    return true;
  }
  if (/^vitrine$/.test(norm)) {
    const st = vitrine.getState();
    const pend = Object.entries(st.posts).filter(([, p]) => p.status === 'PENDENTE').map(([id]) => `#${id}`);
    const apr = Object.entries(st.posts).filter(([, p]) => p.status === 'APROVADO').map(([id]) => `#${id}`);
    await reply(wa, chatJid, `*Vitrine* ${st.config.ativo ? '▶️ ligada' : '⏸️ desligada'} · horários ${st.config.horarios.join(', ')} · ${st.config.grupos.length} grupo(s)\n✅ Aprovados: ${apr.join(' ') || '-'}\n⏳ Pendentes: ${pend.join(' ') || '-'}\n\nPrévia: *vitrine 12* · Aprovar: *aprovar 12*`);
    return true;
  }
  if ((m = norm.match(/^vitrine\s+#?(\w+)$/))) {
    const p = await sheets.getPropertyById(m[1]);
    if (!p) {
      await reply(wa, chatJid, 'Imóvel não encontrado.');
      return true;
    }
    const post = vitrine.getState().posts[p.id] || vitrine.upsertPost(p);
    if (post.foto) await wa.sendImage(chatJid, post.foto, post.texto);
    else await wa.sendText(chatJid, post.texto);
    await reply(wa, chatJid, `Esse é o post do #${p.id} (${post.status}). Responda *aprovar ${p.id}* para entrar no rodízio. Para editar o texto, use o painel.`);
    return true;
  }
  if ((m = norm.match(/^(aprovar|reprovar)\s+#?(\w+)$/))) {
    const p = await sheets.getPropertyById(m[2]);
    if (!p) {
      await reply(wa, chatJid, 'Imóvel não encontrado.');
      return true;
    }
    if (!vitrine.getState().posts[p.id]) vitrine.upsertPost(p);
    vitrine.setStatus(p.id, m[1] === 'aprovar' ? 'APROVADO' : 'REPROVADO');
    await reply(wa, chatJid, m[1] === 'aprovar' ? `✅ Post do #${p.id} aprovado para a vitrine.` : `Post do #${p.id} reprovado.`);
    return true;
  }
  return false;
}

module.exports = { handleOwnerMessage, parsePropertyFromText, applyFieldEdit, HELP, BOT, _drafts: drafts };
