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
const { detectTipos, detectRooms, detectArea, detectPrice, detectMobilia, detectNegocio, detectSubtipoCasa } = require('./brain/parser');
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
    tipo: tipos[0] === 'Casa' && detectSubtipoCasa(norm) === 'CONDOMINIO' ? 'Casa de condomínio' : tipos[0] || 'Apartamento',
    negociacao: neg.agio ? 'AGIO' : neg.transacao === 'ALUGUEL' ? 'ALUGUEL' : 'VENDA',
    setor: loc.bairros[0] || (loc.condominios[0] && loc.condominios[0].name) || '',
    edificio: (loc.condominios[0] && loc.condominios[0].name) || (loc.edificios[0] && loc.edificios[0].name) || '',
    cidade: loc.cidades.find(c => c !== 'Goiânia') || 'Goiânia',
    quartos: rooms.quartos_min || '',
    suites: rooms.suites_min || '',
    vagas: rooms.vagas_min || '',
    tamanho_m2: area.area_alvo || (area.area_min ? Math.round(area.area_min / 0.95) : area.area_max || ''),
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
• *busca guiada* → eu pergunto os filtros (cidade, bairro, condomínio, valor, quartos…) como nos portais
• *busca cidade: Goiânia; condomínio: Jardins Itália; suítes: 4; valor: 4 a 5 milhões*
• *busca* _apto 800 mil a 1 milhão no Marista, mínimo 100 m²_ (texto livre)
  → procura nos seus grupos (últimos 90 dias) e na OLX, ZAP e VivaReal
• *importar histórico* (pede ao celular os anúncios antigos dos grupos)
• mande a conversa exportada de um grupo (.txt/.zip) para guardar os anúncios
• *memória* (quantos anúncios estão guardados) · *memória ligar/desligar*
• *minhas buscas* · *ver busca 3* · *config busca*
• *grupos da busca* · *busca grupos 1,4,7* · *busca grupos todos*
• *limite busca 30* · *portais olx zap vivareal* · *chave gemini SUA_CHAVE* · *testar gemini* · *testar gemini fundo* · *testar olx* · *testar apify*
• busca nos portais sem depender do Google: *chave tavily SUA_CHAVE* ou *chave serper SUA_CHAVE* (grátis: tavily.com · serper.dev) · opcional: *chave apify SEU_TOKEN*
⚙️ *status* · *pausar* · *retomar* · *ajuda*`;

async function reply(wa, chatJid, text) {
  return wa.sendText(chatJid, text.startsWith(BOT) ? text : `${BOT} ${text}`);
}

/**
 * Processa uma mensagem do dono. Retorna true se tratou como comando.
 * msgInfo: { chatJid, text, hasImage, downloadImage: async () => filename }
 */
// Busca guiada (pergunta um campo por vez): estado por conversa, vale 15 min
const guiadas = new Map();

/** Roda a busca (por filtros ou por texto livre) e manda o relatório; o aviso "Buscando…" já foi dado */
function rodarBusca(wa, chatJid, ctx, { filtros, texto }) {
  const bi = require('./busca-inteligente');
  const p = filtros ? bi.buscarComFiltros(filtros) : bi.buscar(texto);
  p.then(async r => {
    for (const parte of bi.formatarRelatorio(r)) await reply(wa, chatJid, parte);
    if (ctx.log) ctx.log('BUSCA', `🔎 Busca: ${r.descricao} — ${r.grupos.length} nos grupos, ${r.portais.itens.length} nos portais.`);
  }).catch(err => reply(wa, chatJid, `Não consegui terminar a busca: ${err.message}`).catch(() => {}));
}

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

  // --- Busca guiada em andamento: a mensagem é a resposta da pergunta atual ---
  const guia = guiadas.get(chatJid);
  if (guia) {
    const G = require('./busca-guiada');
    if (Date.now() - guia.ts > G.TTL_MS) guiadas.delete(chatJid);
    else {
      const r = G.responder(guia, text);
      if (r.acao === 'cancelada') {
        guiadas.delete(chatJid);
        await reply(wa, chatJid, 'Busca cancelada.');
      } else if (r.acao === 'fim') {
        guiadas.delete(chatJid);
        await reply(wa, chatJid, '🔎 Buscando nos seus grupos e nos portais… (1 a 2 minutos)');
        rodarBusca(wa, chatJid, ctx, { filtros: r.filtros });
      } else await reply(wa, chatJid, r.texto);
      return true;
    }
  }

  // --- Busca inteligente: configuração e histórico (iguais ao painel › Busca) ---
  if (/^(minhas buscas|historico de buscas|ultimas buscas)$/.test(norm)) {
    const h = require('./busca-inteligente').resumoHistorico().slice(0, 10);
    await reply(wa, chatJid, h.length ? `🗂️ *Últimas buscas*\n${h.map(x => `• *nº ${x.id}* (${new Date(x.ts).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })}) ${x.descricao} — ${x.grupos} nos grupos, ${x.portais} nos portais`).join('\n')}\n\nPara rever: *ver busca 3*` : 'Nenhuma busca ainda. Ex.: *busca apto 800 mil a 1 milhão no Setor Marista, mínimo 100 m²*');
    return true;
  }
  const verBusca = norm.match(/^(?:ver busca|busca n[o°]?|rever busca)\s*(\d{1,4})$/);
  if (verBusca) {
    const bi = require('./busca-inteligente');
    const r = bi.getBusca(verBusca[1]);
    if (!r) await reply(wa, chatJid, `Não achei a busca nº ${verBusca[1]}. Mande *minhas buscas*.`);
    else for (const parte of bi.formatarRelatorio(r)) await reply(wa, chatJid, parte);
    return true;
  }
  if (/^(config busca|configuracao da busca|configuracoes da busca|busca config)$/.test(norm)) {
    const c = require('./busca-inteligente').getConfig();
    const sn = v => (v ? '✅' : '❌');
    await reply(wa, chatJid, `⚙️ *Configuração da busca*\n• Portais: OLX ${sn(c.olx)} · ZAP ${sn(c.zap)} · VivaReal ${sn(c.vivareal)}\n• Limite: ${c.limiteDia} buscas nos portais por dia (hoje: ${c.usadasHoje})\n• Guardar anúncios dos grupos: ${sn(c.memoriaAtiva)}\n• Chave do Gemini: ${c.temChaveGemini ? '✅ configurada' : '❌ falta'}\n• Motores dos portais: ${c.motores.apify ? 'Apify ✅ · ' : ''}${c.motores.busca.length ? c.motores.busca.map(x => `${x} ✅`).join(' · ') + ' · ' : ''}${c.motores.gemini ? 'Gemini+Google (último recurso) ✅' : ''}${!c.motores.apify && !c.motores.busca.length && !c.motores.gemini ? '❌ nenhum (mande *chave tavily SUA_CHAVE*)' : ''}\n\nMudar: *limite busca 30* · *portais olx zap* · *memória desligar* · *chave gemini SUA_CHAVE*`);
    return true;
  }
  const limBusca = norm.match(/^limite (?:da )?busca\s+(\d{1,3})$/);
  if (limBusca) {
    try {
      const c = require('./busca-inteligente').atualizarConfig({ limiteDia: limBusca[1] });
      await reply(wa, chatJid, `Pronto: até *${c.limiteDia}* buscas nos portais por dia.`);
    } catch (err) {
      await reply(wa, chatJid, err.message);
    }
    return true;
  }
  const portaisCmd = norm.match(/^portais\s+(.+)$/);
  if (portaisCmd) {
    const p = portaisCmd[1];
    const todos = /\btodos\b/.test(p);
    const nenhum = /\b(nenhum|desligar|desliga)\b/.test(p);
    const c = require('./busca-inteligente').atualizarConfig({ olx: todos || (!nenhum && /\bolx\b/.test(p)), zap: todos || (!nenhum && /\bzap\b/.test(p)), vivareal: todos || (!nenhum && /\bviva ?real\b/.test(p)) });
    const sn = v => (v ? '✅' : '❌');
    await reply(wa, chatJid, `Portais da busca: OLX ${sn(c.olx)} · ZAP ${sn(c.zap)} · VivaReal ${sn(c.vivareal)}`);
    return true;
  }
  const memCmd = norm.match(/^(?:memoria|memoria de anuncios)\s+(ligar|liga|ativar|desligar|desliga|desativar)$/);
  if (memCmd) {
    const on = /^(ligar|liga|ativar)$/.test(memCmd[1]);
    require('./busca-inteligente').atualizarConfig({ memoriaAtiva: on });
    await reply(wa, chatJid, on ? '🧠 Volto a guardar os anúncios dos grupos.' : '🧠 Parei de guardar anúncios novos dos grupos (os já guardados continuam na busca).');
    return true;
  }
  // Grupos da busca (separados dos grupos de pedidos)
  const ordenarGrupos = () => [...(ctx.listarGrupos ? ctx.listarGrupos() : [])].sort((a, b) => String(a.subject).localeCompare(String(b.subject), 'pt-BR'));
  if (/^(grupos da busca|grupos busca|busca grupos)$/.test(norm)) {
    const bi = require('./busca-inteligente');
    const gs = ordenarGrupos();
    if (!gs.length) {
      await reply(wa, chatJid, 'Ainda não tenho a lista de grupos (WhatsApp conectando). Tente em 1 minuto.');
      return true;
    }
    const todos = bi.getConfig().todosGrupos;
    const linhas = gs.map((g, i) => `${bi.grupoNaBusca(g.id) ? '✅' : '⬜'} ${i + 1}. ${g.subject}`);
    const partes = [`📂 *Grupos da busca* (${todos ? 'todos' : `${gs.filter(g => bi.grupoNaBusca(g.id)).length} escolhidos`})\nSão separados dos grupos de pedidos.\n`];
    for (const l of linhas) {
      if ((partes[partes.length - 1] + '\n' + l).length > 3500) partes.push(l);
      else partes[partes.length - 1] += '\n' + l;
    }
    partes[partes.length - 1] += '\n\nEscolher: *busca grupos 1,4,7* · tirar: *busca grupos tirar 4* · *busca grupos todos*';
    for (const p of partes) await reply(wa, chatJid, p);
    return true;
  }
  const gCmd = norm.match(/^(?:busca grupos|grupos da busca|grupos busca)\s+(todos|(?:tirar|remover|adicionar|incluir|por)?\s*[\d ,e]+)$/);
  if (gCmd) {
    const bi = require('./busca-inteligente');
    const gs = ordenarGrupos();
    if (gCmd[1] === 'todos') {
      bi.atualizarConfig({ todosGrupos: true });
      await reply(wa, chatJid, `📂 Busca em *todos* os ${gs.length} grupos.`);
      return true;
    }
    const nums = [...gCmd[1].matchAll(/\d+/g)].map(m => Number(m[0]));
    const fora = nums.filter(n => n < 1 || n > gs.length);
    if (!gs.length || fora.length) {
      await reply(wa, chatJid, gs.length ? `Não existe o grupo nº ${fora.join(', ')}. Mande *grupos da busca* para ver a lista.` : 'Ainda não tenho a lista de grupos. Tente em 1 minuto.');
      return true;
    }
    const ids = nums.map(n => gs[n - 1].id);
    const atuais = gs.filter(g => bi.grupoNaBusca(g.id)).map(g => g.id);
    let novos;
    if (/^(tirar|remover)/.test(gCmd[1])) novos = atuais.filter(id => !ids.includes(id));
    else if (/^(adicionar|incluir|por)/.test(gCmd[1])) novos = [...new Set([...atuais, ...ids])];
    else novos = ids;
    bi.atualizarConfig({ gruposIds: novos });
    const nomes = gs.filter(g => novos.includes(g.id)).map(g => g.subject);
    await reply(wa, chatJid, `📂 Busca em ${nomes.length} grupo(s): ${nomes.slice(0, 15).join(', ')}${nomes.length > 15 ? '…' : ''}`);
    return true;
  }
  if (/^(testar|teste|diagnosticar) apify$/.test(norm)) {
    await reply(wa, chatJid, '🔬 Rodando os robôs do Apify de verdade (1 anúncio por portal, leva até 3 min)…');
    const A = require('./busca-apify');
    await reply(wa, chatJid, A.textoTesteApify(await A.testarApify()));
    return true;
  }
  const olxTeste = text.match(/^\s*(?:testar|diagnosticar|teste)\s+olx(?:\s+(\S{10,400}))?\s*$/i);
  if (olxTeste) {
    await reply(wa, chatJid, '🔬 Abrindo uma página da OLX a partir desta máquina…');
    const A = require('./busca-anuncio');
    await reply(wa, chatJid, A.textoDiagnosticoOlx(await A.diagnosticarOlx(olxTeste[1] ? { url: olxTeste[1] } : {})));
    return true;
  }
  if (/^(testar gemini (?:fundo|completo)|diagnosticar gemini|diagnostico gemini|testar chave (?:fundo|completa))$/.test(norm)) {
    await reply(wa, chatJid, '🔬 Testando a chave no Google (resposta simples + busca com Google)…');
    const r = await require('./gemini-chave').diagnosticarSalva();
    await reply(wa, chatJid, r.texto);
    return true;
  }
  if (/^(testar gemini|testar chave|testar chave gemini|teste gemini)$/.test(norm)) {
    const r = await require('./gemini-chave').testarChaveSalva();
    await reply(wa, chatJid, `🔑 ${r.mensagem}`);
    return true;
  }
  const chaveBusca = text.match(/^\s*chave\s+(tavily|serper|brave|apify)\s*:?\s+([\s\S]{8,400})$/i);
  if (chaveBusca) {
    const B = require('./busca-chaves');
    const prov = chaveBusca[1].toLowerCase();
    const v = await B.validar(prov, chaveBusca[2]);
    if (!v.ok) {
      await reply(wa, chatJid, `🔑 Não salvei: ${v.mensagem}`);
      return true;
    }
    require('./envfile').updateEnvFile({ [B.PROVEDORES[prov].env]: v.chave });
    await reply(wa, chatJid, `🔑 ${v.mensagem}\nPor segurança, *apague esta mensagem com a chave* (toque e segure › Apagar para mim).${prov === 'apify' ? '\nAgora mande *testar apify* para provar que OLX, ZAP e VivaReal respondem nesta máquina.' : ''}`);
    return true;
  }
  const chaveCmd = text.match(/^\s*chave\s+(?:do\s+)?gemini\s*:?\s+([\s\S]{10,400})$/i);
  if (chaveCmd) {
    const v = await require('./gemini-chave').validarChave(chaveCmd[1]);
    if (!v.ok) {
      await reply(wa, chatJid, `🔑 Não salvei: ${v.mensagem}`);
      return true;
    }
    require('./envfile').updateEnvFile({ GEMINI_API_KEY: v.chave });
    await reply(wa, chatJid, `🔑 ${v.mensagem}\nPor segurança, *apague esta mensagem com a chave* (toque e segure › Apagar para mim).`);
    return true;
  }

  // --- Busca inteligente ---
  if (/^(busca|buscar|procurar)\s+(guiada|por filtros?|passo a passo|com filtros?|filtros?)$|^(nova busca|busca guiada)$/.test(norm)) {
    const G = require('./busca-guiada');
    const st = G.iniciar();
    guiadas.set(chatJid, st);
    await reply(wa, chatJid, `🔎 *Busca por filtros* — como nos portais. Responda um campo por vez; o que ficar em aberto (*-*) não filtra.\n\n${G.pergunta(st)}`);
    return true;
  }
  const buscaCampos = text.match(/^\s*(?:busca(?:r)?(?:\s+inteligente)?|procur(?:ar|a))\s*[:\-]?\s+([\s\S]{3,})$/i);
  const camposBrutos = buscaCampos ? require('./busca-filtros').parseCampos(buscaCampos[1]) : null;
  if (camposBrutos) {
    const { normalizarFiltros, preenchidos } = require('./busca-filtros');
    const { filtros, erros } = normalizarFiltros(camposBrutos);
    if (erros.length || !preenchidos(filtros)) {
      await reply(wa, chatJid, `${erros[0] || 'Preencha pelo menos um campo.'}\nCampos: tipo, negócio, cidade, bairro, condomínio, valor, quartos, suítes, vagas, área, extras.`);
      return true;
    }
    await reply(wa, chatJid, '🔎 Buscando nos seus grupos e nos portais… (1 a 2 minutos)');
    rodarBusca(wa, chatJid, ctx, { filtros: camposBrutos });
    return true;
  }
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
    rodarBusca(wa, chatJid, ctx, { texto: busca[1] });
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
