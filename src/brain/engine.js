/**
 * ============================================================================
 * MOTOR DE COMPATIBILIDADE (pedido x carteira)
 * ============================================================================
 * Para cada imóvel o motor responde:
 *   MATCH  -> atende TUDO que foi pedido (pode ser enviado automaticamente)
 *   QUASE  -> atende tudo que é verificável, mas falta um dado no cadastro
 *             (ex.: pediram "aceita permuta" e o imóvel não informa). NÃO envia;
 *             avisa o corretor para conferir.
 *   NAO    -> falha em pelo menos um critério (silêncio total)
 *
 * Regra de ouro: na dúvida, NÃO envia ao parceiro.
 * ============================================================================
 */
const { normalize } = require('./text');
const { propertyMatchesLocation, locateProperty } = require('./locations');
const { FEATURES, PISCINA_CONDOMINIO_RX } = require('./parser');

// ---------------------------------------------------------------------------
// FATOS DO IMÓVEL (lidos dos campos e, quando vazios, da descrição)
// ---------------------------------------------------------------------------
function propText(p) {
  return normalize(`${p.tipo || ''} ${p.titulo || ''} ${p.edificio || ''} ${p.setor || ''} ${p.caracteristicas || ''} ${p.descricao || ''}`);
}

function yesNo(v) {
  const n = normalize(v);
  if (['sim', 's', 'true', '1', 'yes', 'aceita'].includes(n)) return 'SIM';
  if (['nao', 'n', 'false', '0', 'no', 'nao aceita'].includes(n)) return 'NAO';
  return null;
}

function propTipo(p) {
  const t = normalize(p.tipo);
  const text = propText(p);
  if (/flat/.test(t)) return 'Flat';
  if (/cobertura/.test(t)) return 'Cobertura';
  if (/studio|kitnet|loft|kit/.test(t)) return 'Studio';
  if (/apart|apto|^ap$/.test(t)) return /\bflat\b/.test(text) ? 'Flat' : 'Apartamento';
  if (/sobrado/.test(t)) return 'Sobrado';
  if (/casa/.test(t)) return /\bsobrado\b/.test(text) ? 'Sobrado' : 'Casa';
  if (/lote|terreno/.test(t)) return 'Terreno';
  if (/chacara|sitio|rancho/.test(t)) return 'Chácara';
  if (/fazenda/.test(t)) return 'Fazenda';
  if (/sala|loja|galpao|comercial|predio/.test(t)) return 'Comercial';
  return p.tipo || 'Imóvel';
}

// Quais tipos de imóvel atendem a cada tipo pedido
const TIPO_ACEITA = {
  Apartamento: ['Apartamento', 'Cobertura'],
  Flat: ['Flat'],
  Cobertura: ['Cobertura'],
  Studio: ['Studio', 'Flat'],
  Casa: ['Casa', 'Sobrado'],
  Sobrado: ['Sobrado'],
  Terreno: ['Terreno'],
  'Chácara': ['Chácara'],
  Fazenda: ['Fazenda', 'Chácara'],
  Comercial: ['Comercial']
};

function propSuites(p) {
  if (p.suites !== undefined && p.suites !== null && String(p.suites).trim() !== '') {
    const n = parseInt(p.suites, 10);
    if (!Number.isNaN(n)) return n;
  }
  const d = normalize(p.descricao);
  if (!/suite/.test(d)) return 0;
  const m = d.match(/\b(\d+|uma|um|duas|dois|tres|quatro|cinco)\s*suites?\b/);
  if (m) return { uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5 }[m[1]] || parseInt(m[1], 10);
  if (/\btod[ao]s? (?:os quartos )?(?:sendo )?suites?\b/.test(d)) return Number(p.quartos) || null;
  if (/\bsuite\b/.test(d)) return 1;
  return null; // menciona "suítes" sem número -> desconhecido
}

function propVagas(p) {
  if (p.vagas !== undefined && p.vagas !== null && String(p.vagas).trim() !== '') {
    const n = parseInt(p.vagas, 10);
    if (!Number.isNaN(n)) return n;
  }
  const m = normalize(p.descricao).match(/\b(\d+|uma|duas|tres|quatro)\s*vagas?\b/);
  if (m) return { uma: 1, duas: 2, tres: 3, quatro: 4 }[m[1]] || parseInt(m[1], 10);
  return null;
}

function propCondominio(p) {
  if (p.condominio !== undefined && p.condominio !== null && String(p.condominio).trim() !== '' && !Number.isNaN(Number(p.condominio))) {
    return Number(p.condominio);
  }
  const d = normalize(p.descricao);
  if (/\b(sem condominio|isento de condominio)\b/.test(d)) return 0;
  const m = d.match(/\bcondominio\s*(?:de|valor|em media|aprox\.?|:|-)?\s*(?:r\$\s*)?(\d{1,2}\.\d{3}|\d{2,5})(?:,\d{2})?/);
  if (!m) return null;
  return parseFloat(m[1].replace('.', ''));
}

function propMobilia(p) {
  const v = normalize(p.mobiliado);
  if (['sim', 'mobiliado', 'porteira fechada', 'decorado', 'mobiliado e decorado'].includes(v)) return 'MOBILIADO';
  if (['semi', 'semimobiliado', 'armarios'].includes(v)) return 'SEMI';
  const d = normalize(p.descricao);
  if (/\b(mobiliad[oa]s?|decorad[oa]s?|porteira fechada|todo mobiliado|mobilia completa|com moveis|todo equipado)\b/.test(d) && !/semi/.test(d)) return 'MOBILIADO';
  if (/\b(semimobiliado|semi mobiliado|armarios)\b/.test(d)) return 'SEMI';
  if (['nao', 'sem mobilia', 'vazio'].includes(v)) return 'SEM';
  return 'SEM';
}

function propLazer(p) {
  const y = yesNo(p.lazer);
  if (y) return y;
  const d = propText(p);
  if (/\b(sem area de lazer|sem lazer)\b/.test(d)) return 'NAO';
  if (/\b(area de lazer|lazer completo|com lazer|condominio clube|piscina|salao de festas|academia|playground|brinquedoteca|quadra)\b/.test(d)) return 'SIM';
  return null;
}

function propIdade(p) {
  if (p.idade_anos !== undefined && p.idade_anos !== null && String(p.idade_anos).trim() !== '') {
    const n = parseInt(p.idade_anos, 10);
    if (!Number.isNaN(n)) return n;
  }
  const d = normalize(p.descricao).replace(/\b(novo mundo|novo horizonte|vila nova|nova suica)\b/g, ' ');
  const m = d.match(/\b(\d{1,2})\s*anos?\s*(?:de\s*(?:construcao|construido|entrega|uso|idade))?\b/);
  if (m) return parseInt(m[1], 10);
  const y = d.match(/\b(?:entregue em|construido em|ano de construcao:?)\s*((?:19|20)\d{2})\b/);
  if (y) return new Date().getFullYear() - parseInt(y[1], 10);
  if (/\b(novo|recem entregue|nunca habitado|lancamento)\b/.test(d)) return 0;
  return null;
}

function propNegociacao(p) {
  const n = normalize(p.negociacao);
  if (/agio/.test(n)) return 'AGIO';
  if (/alug|loca/.test(n)) return /venda/.test(n) ? 'VENDA_ALUGUEL' : 'ALUGUEL';
  if (n) return 'VENDA';
  const d = propText(p);
  if (/\bagio\b/.test(d)) return 'AGIO';
  return 'VENDA';
}

function propPermuta(p) {
  const y = yesNo(p.aceita_permuta);
  if (y) return y;
  const d = propText(p);
  if (/\b(nao aceita permuta|sem permuta)\b/.test(d)) return 'NAO';
  if (/\b(aceita permuta|aceito permuta|estuda permuta|permuta)\b/.test(d)) return 'SIM';
  return null;
}

function propFinanciamento(p) {
  const y = yesNo(p.aceita_financiamento);
  if (y) return y;
  const d = propText(p);
  if (/\b(nao aceita financiamento|somente a vista|apenas a vista)\b/.test(d)) return 'NAO';
  if (/\b(aceita financiamento|financiavel|financia)\b/.test(d)) return 'SIM';
  return null;
}

function propSubtipoCasa(p) {
  const d = propText(p);
  if (/\b(condominio fechado|condominio horizontal|casas? (?:em|de) condominio|sobrados? (?:em|de) condominio|alphaville|portal do sol|aldeia do vale|jardins [a-z]+|residencial fechado|em condominio)\b/.test(d)) return 'CONDOMINIO';
  return 'RUA';
}

function propPrice(p, c) {
  if (c.agio) {
    const ag = Number(p.valor_agio);
    if (ag > 0) return ag;
  }
  return Number(p.valor) || 0;
}

// ---------------------------------------------------------------------------
// AVALIAÇÃO
// ---------------------------------------------------------------------------
function evaluateProperty(p, c, index) {
  const fails = [];
  const unknowns = [];
  const hits = [];
  const text = propText(p);
  const tipo = propTipo(p);

  // Negócio
  const neg = propNegociacao(p);
  if (c.transacao === 'ALUGUEL' && !['ALUGUEL', 'VENDA_ALUGUEL'].includes(neg)) fails.push('é para venda, pediram aluguel');
  if (c.transacao === 'VENDA' && neg === 'ALUGUEL') fails.push('é só para aluguel');
  if (c.agio && neg !== 'AGIO') fails.push('não é ágio');
  if (!c.agio && neg === 'AGIO' && c.intent === 'BUSCA') fails.push('é ágio e não pediram ágio');

  // Tipo
  if (c.tipos.length) {
    const aceitos = new Set(c.tipos.flatMap(t => TIPO_ACEITA[t] || [t]));
    if (!aceitos.has(tipo)) fails.push(`é ${tipo}, pediram ${c.tipos.join('/')}`);
    else hits.push(tipo);
  }

  // Casa de rua x condomínio (+ alternativas com metragem)
  const sub = propSubtipoCasa(p);
  if (c.subtipo_casa && ['Casa', 'Sobrado', 'Chácara', 'Terreno'].includes(tipo) && sub !== c.subtipo_casa) {
    fails.push(c.subtipo_casa === 'CONDOMINIO' ? 'não é em condomínio fechado' : 'é em condomínio, pediram de rua');
  }
  if (Array.isArray(c.alternativas) && c.alternativas.length) {
    const area = Number(p.area_terreno || p.tamanho_m2) || 0;
    const okAlt = c.alternativas.some(a => a.subtipo === sub && (!a.area_min || area >= a.area_min) && (!a.area_max || area <= a.area_max));
    if (!okAlt) fails.push(`área/condomínio fora das opções pedidas (${area || '?'} m², ${sub === 'RUA' ? 'fora de condomínio' : 'em condomínio'})`);
  }

  // Localização
  const loc = propertyMatchesLocation(p, c.local, index);
  if (!loc.ok) fails.push(loc.motivo);
  else if (loc.motivo) hits.push(loc.motivo);
  if (c.local.localNaoReconhecido) unknowns.push('a mensagem cita um local que eu não reconheci no mapa');

  // Preço
  const price = propPrice(p, c);
  if (c.valor_max) {
    if (!price) unknowns.push('valor não cadastrado');
    else if (price > c.valor_max) fails.push(`valor R$ ${price.toLocaleString('pt-BR')} acima do teto`);
    else hits.push('preço dentro do orçamento');
  }
  if (c.valor_min && price && price < c.valor_min) fails.push(`valor R$ ${price.toLocaleString('pt-BR')} muito abaixo do pedido`);

  // Quartos / suítes / vagas
  const q = Number(p.quartos) || 0;
  if (c.quartos_min) {
    if (!q && !['Terreno', 'Chácara', 'Fazenda', 'Comercial'].includes(tipo)) unknowns.push('nº de quartos não cadastrado');
    else if (q < c.quartos_min) fails.push(`${q} quarto(s), pediram ${c.quartos_min}`);
    else if (c.quartos_max && q > c.quartos_max) fails.push(`${q} quartos, pediram até ${c.quartos_max}`);
  }
  if (c.suites_min) {
    const s = propSuites(p);
    if (s === null) unknowns.push('nº de suítes não confirmado no cadastro');
    else if (s < c.suites_min) fails.push(`${s} suíte(s), pediram ${c.suites_min}`);
    else if (c.suites_max && s > c.suites_max) fails.push(`${s} suítes, pediram até ${c.suites_max}`);
  }
  if (c.vagas_min) {
    const v = propVagas(p);
    if (v === null) unknowns.push('nº de vagas não cadastrado');
    else if (v < c.vagas_min) fails.push(`${v} vaga(s), pediram ${c.vagas_min}`);
  }

  // Metragem
  const area = Number(p.tamanho_m2) || Number(p.area_terreno) || 0;
  if (c.area_min || c.area_max) {
    if (!area) unknowns.push('metragem não cadastrada');
    else {
      if (c.area_min && area < c.area_min) fails.push(`${area} m², pediram mínimo ${c.area_min} m²`);
      if (c.area_max && area > c.area_max) fails.push(`${area} m², pediram até ${c.area_max} m²`);
    }
  }

  // Mobília
  if (c.mobilia) {
    const m = propMobilia(p);
    if (c.mobilia === 'MOBILIADO' && m !== 'MOBILIADO') fails.push('não é mobiliado');
    if (c.mobilia === 'SEMI' && m === 'SEM') fails.push('não tem armários');
    if (c.mobilia === 'SEM' && m !== 'SEM') fails.push('tem mobília/armários');
  }

  // Lazer
  if (c.lazer) {
    const l = propLazer(p);
    if (l === null) unknowns.push('não sei se tem área de lazer');
    else if (l !== c.lazer) fails.push(c.lazer === 'SIM' ? 'não tem área de lazer' : 'tem área de lazer, pediram sem');
  }

  // Condomínio (taxa)
  if (c.condominio_max && tipo !== 'Casa') {
    const cond = propCondominio(p);
    if (cond === null) unknowns.push('valor do condomínio não cadastrado');
    else if (cond > c.condominio_max) fails.push(`condomínio R$ ${cond} acima de R$ ${c.condominio_max}`);
  }

  // Idade / estado
  if (c.idade_max !== null && c.idade_max !== undefined) {
    const idade = propIdade(p);
    if (idade === null) unknowns.push(`idade do imóvel não informada (pediram até ${c.idade_max} anos)`);
    else if (idade > c.idade_max) fails.push(`tem ${idade} anos, pediram até ${c.idade_max}`);
  }
  if (c.estado === 'PLANTA' && !/\b(planta|lancamento|em construcao|obra)\b/.test(text)) fails.push('não é na planta/lançamento');

  // Permuta / financiamento
  if (c.permuta) {
    const pm = propPermuta(p);
    if (pm === 'NAO') fails.push('proprietário não aceita permuta');
    else if (pm === null) unknowns.push('não sei se o proprietário aceita permuta');
    else hits.push('aceita permuta');
  }
  if (c.financiamento) {
    const f = propFinanciamento(p);
    if (f === 'NAO') fails.push('não aceita financiamento');
    else if (f === null && neg === 'AGIO') unknowns.push('não sei se o ágio aceita financiamento');
  }

  // Características exigidas
  for (const f of c.features_required) {
    const def = FEATURES.find(x => x[0] === f.key);
    const rx = def ? def[3] : null;
    if (f.key === 'terrea') {
      if (tipo === 'Sobrado') fails.push('é sobrado, pediram térrea');
      continue;
    }
    if (f.key === 'escritura') {
      if (!(rx && rx.test(text))) unknowns.push('documentação/escritura não confirmada no cadastro');
      continue;
    }
    if (f.key === 'piscina_privativa') {
      // piscina DO IMÓVEL: casa/sobrado/chácara com "piscina" no texto é privativa; em apartamento precisa dizer
      // "privativa / na varanda / na cobertura…" — "piscina" sozinha em apto é a do condomínio
      const casa = ['Casa', 'Sobrado', 'Chácara', 'Fazenda'].includes(tipo);
      if (rx.test(text) || (casa && /\bpiscinas?\b/.test(text))) continue;
      if (tipo === 'Cobertura' && /\bpiscinas?\b/.test(text) && !PISCINA_CONDOMINIO_RX.test(text)) {
        unknowns.push('conferir se a piscina da cobertura é privativa');
        continue;
      }
      fails.push(/\bpiscinas?\b/.test(text) ? 'a piscina é do condomínio; pediram piscina no imóvel' : 'não consta: piscina privativa');
      continue;
    }
    if (!(rx && rx.test(text))) fails.push(`não consta: ${f.label}`);
  }

  // Pontuação para ordenar (preferências e proximidade de preço)
  let score = hits.length * 10;
  for (const f of c.features_desired) {
    const def = FEATURES.find(x => x[0] === f.key);
    if (def && def[3].test(text)) score += 5;
  }
  if (c.tom.altoPadrao && /\b(alto padrao|luxo|alto luxo)\b/.test(text)) score += 5;
  if (c.valor_alvo && price) score -= Math.abs(price - c.valor_alvo) / c.valor_alvo * 20;

  const status = fails.length ? 'NAO' : unknowns.length ? 'QUASE' : 'MATCH';
  return { property: p, status, fails, unknowns, hits, score, tipo, where: locateProperty(p, index) };
}

/**
 * Quantos critérios objetivos o pedido tem (tipo não conta). Pedido vago demais
 * (ex: "busco apartamento") não dispara envio automático.
 */
function countCriteria(c) {
  let n = 0;
  if (c.local.mencionaLocal) n++;
  if (c.valor_max || c.valor_min) n++;
  if (c.quartos_min) n++;
  if (c.suites_min) n++;
  if (c.area_min || c.area_max || (c.alternativas && c.alternativas.length)) n++;
  if (c.mobilia) n++;
  if (c.vagas_min) n++;
  if (c.agio) n++;
  if (c.features_required.length) n++;
  if (c.lazer || c.condominio_max || c.idade_max) n++;
  return n;
}

function evaluateInventory(inventory, c, index) {
  const results = inventory.map(p => evaluateProperty(p, c, index));
  const matches = results.filter(r => r.status === 'MATCH').sort((a, b) => b.score - a.score);
  const quase = results.filter(r => r.status === 'QUASE').sort((a, b) => b.score - a.score);
  return { results, matches, quase, criteriaCount: countCriteria(c) };
}

module.exports = {
  evaluateProperty,
  evaluateInventory,
  countCriteria,
  propTipo,
  propSuites,
  propVagas,
  propCondominio,
  propMobilia,
  propLazer,
  propIdade,
  propNegociacao,
  propPermuta,
  propText
};

