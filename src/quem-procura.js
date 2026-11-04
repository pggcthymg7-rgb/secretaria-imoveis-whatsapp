/**
 * ============================================================================
 * 🎯 QUEM PROCURA ESTE IMÓVEL? (match reverso) — 04/11/2026
 * ============================================================================
 * O dia a dia do corretor: chega um imóvel novo na carteira e ele precisa lembrar
 * quem, nos grupos, pediu algo parecido nas últimas semanas. A BIGA já guarda todos
 * os pedidos no Radar; aqui ela RELÊ esses pedidos com o cérebro atual contra o
 * imóvel e devolve a lista de corretores interessados:
 *  - MATCH: o pedido bate em tudo;
 *  - QUASE: bate, mas falta confirmar algo no cadastro (ex.: metragem).
 * Quando um imóvel é cadastrado (painel ou WhatsApp) a BIGA avisa o dono sozinha;
 * no painel (Carteira › 🎯) ou com "oferecer 12" ela manda a oferta para cada um,
 * com o mesmo texto humano e as mesmas travas de envio dos grupos.
 * ============================================================================
 */
const radar = require('./radar');
const { analyzeMessageAndMatch } = require('./matcher');
const { countCriteria } = require('./brain/engine');

const DIAS_PADRAO = 60;

/**
 * @returns {Promise<Array<{code,ts,grupo,sender,phone,jid,resumo,nivel,falta,jaRecebeu}>>}
 */
async function quemProcura(prop, { dias = DIAS_PADRAO, itens, analisar = analyzeMessageAndMatch, max = 30 } = {}) {
  if (!prop) return [];
  const desde = Date.now() - dias * 86400000;
  const lista = (itens || radar.since(desde)).filter(i => i && i.texto && i.ts >= desde);
  const vistos = new Set();
  const out = [];
  for (const it of lista) {
    const quem = String(it.phone || it.jid || it.sender || '');
    if (!quem || vistos.has(quem)) continue; // cada corretor uma vez (o pedido mais recente)
    let a;
    try {
      a = await analisar(it.texto, it.sender, [{ ...prop, ativo: true }], { useAi: false });
    } catch {
      continue;
    }
    if (!a || !a.isLookingForProperty) continue;
    // pedido vago ("alguém tem contato de pintor?") bate com qualquer imóvel: exige tipo + pelo menos 1 critério real
    if (!a.criteria || !(a.criteria.tipos || []).length || countCriteria(a.criteria) < 1) continue;
    const id = String(prop.id);
    const match = (a.matchDetails || []).some(m => String(m.id) === id);
    const quase = !match && (a.quase || []).find(q => String(q.property.id) === id);
    if (!match && !quase) continue;
    vistos.add(quem);
    out.push({
      code: it.code,
      ts: it.ts,
      grupo: it.grupo || '',
      sender: it.sender || 'Corretor(a)',
      phone: it.phone || '',
      jid: it.jid || '',
      resumo: a.resumo || it.resumo || '',
      texto: String(it.texto),
      nivel: match ? 'MATCH' : 'QUASE',
      falta: quase ? quase.unknowns : [],
      jaRecebeu: (it.enviados || []).map(String).includes(id)
    });
    if (out.length >= max) break;
  }
  return out.sort((x, y) => (x.nivel === y.nivel ? y.ts - x.ts : x.nivel === 'MATCH' ? -1 : 1));
}

const quando = ts => new Date(ts).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });

/** Texto do aviso para o dono (WhatsApp) */
function textoAviso(prop, lista) {
  if (!lista.length) return '';
  const linhas = lista.slice(0, 8).map(l => `${l.nivel === 'MATCH' ? '🎯' : '🤔'} *${l.sender}* (${quando(l.ts)}, ${l.grupo})${l.phone ? ` wa.me/${l.phone}` : ''}\n   "${l.resumo}"${l.falta.length ? `\n   falta confirmar: ${l.falta.join('; ')}` : ''}${l.jaRecebeu ? ' · já recebeu' : ''}`);
  const novos = lista.filter(l => l.nivel === 'MATCH' && !l.jaRecebeu).length;
  return `🎯 *QUEM PROCURA O IMÓVEL #${prop.id}?*\n${prop.tipo || 'Imóvel'} · ${prop.setor || ''}\n\n${lista.length} corretor(es) pediram algo assim nos últimos ${DIAS_PADRAO} dias:\n\n${linhas.join('\n\n')}${lista.length > 8 ? `\n\n…e mais ${lista.length - 8} no painel (Carteira › 🎯).` : ''}${novos ? `\n\nResponda *oferecer ${prop.id}* e eu mando para os ${novos} que batem em tudo (com intervalo seguro).` : ''}`;
}

/** Depois de cadastrar: procura e avisa o dono (não trava o cadastro; erro vira log) */
async function avisarNovoImovel(prop, { enviarAoDono, log = () => {} } = {}) {
  try {
    const lista = await quemProcura(prop);
    if (!lista.length) return lista;
    log('QUEM_PROCURA', `🎯 Imóvel #${prop.id}: ${lista.length} corretor(es) já pediram algo assim.`);
    if (enviarAoDono) await enviarAoDono(textoAviso(prop, lista));
    return lista;
  } catch (err) {
    log('AVISO', `Quem procura #${prop && prop.id}: ${err.message}`);
    return [];
  }
}

module.exports = { DIAS_PADRAO, quemProcura, textoAviso, avisarNovoImovel };
