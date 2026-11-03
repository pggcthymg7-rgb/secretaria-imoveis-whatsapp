/**
 * Busca guiada pelo WhatsApp: a BIGA pergunta um campo por vez (os mesmos filtros dos portais)
 * e o que for respondido com "-" fica em aberto. No fim roda a busca com os filtros.
 */
const { normalizarFiltros } = require('./busca-filtros');

const TTL_MS = 15 * 60 * 1000;

const PERGUNTAS = [
  { campo: 'tipo', q: 'Tipo do imóvel? (casa, apartamento, cobertura, sobrado, terreno, chácara…)' },
  { campo: 'negocio', q: 'Venda ou aluguel?' },
  { campo: 'cidade', q: 'Cidade? (ex.: Goiânia, Aparecida de Goiânia)' },
  { campo: 'bairro', q: 'Bairro? (ex.: Setor Marista)' },
  { campo: 'local', q: 'Condomínio ou edifício? (ex.: Jardins Itália)' },
  { campo: 'valorMin', q: 'Valor *a partir de* quanto? (ex.: 4 milhões)' },
  { campo: 'valorMax', q: 'Valor *até* quanto? (ex.: 5 milhões)' },
  { campo: 'quartos', q: 'Quartos (mínimo)? (ex.: 3)' },
  { campo: 'suites', q: 'Suítes (mínimo)? (ex.: 4)' },
  { campo: 'vagas', q: 'Vagas (mínimo)? (ex.: 2)' },
  { campo: 'areaMin', q: 'Tamanho *a partir de* quantos m²? (ex.: 100)' },
  { campo: 'areaMax', q: 'Tamanho *até* quantos m²? (ex.: 300)' },
  { campo: 'extras', q: 'Mais alguma coisa? (ex.: piscina, mobiliado, aceita financiamento)' }
];

const ABERTO = /^(-|—|\.|pular|passar|qualquer|aberto|tanto faz|nenhum|nao|não)$/i;

function iniciar() {
  return { i: 0, bruto: {}, ts: Date.now() };
}

function pergunta(st) {
  const p = PERGUNTAS[st.i];
  return `*${st.i + 1}/${PERGUNTAS.length}* ${p.q}\n_(*-* deixa em aberto · *voltar* · *cancelar*)_`;
}

/**
 * Trata uma resposta. Retorna:
 *  { acao: 'cancelada' } | { acao: 'pergunta', texto } | { acao: 'erro', texto } | { acao: 'fim', filtros }
 */
function responder(st, textoBruto) {
  const t = String(textoBruto || '').trim();
  const n = t.toLowerCase();
  if (/^(cancelar|cancela|sair|parar)$/.test(n)) return { acao: 'cancelada' };
  if (/^(voltar|volta|anterior)$/.test(n)) {
    st.i = Math.max(0, st.i - 1);
    return { acao: 'pergunta', texto: pergunta(st) };
  }
  if (/^(buscar|pronto|fim|ja deu|já deu|concluir)$/.test(n)) return terminar(st);
  const campo = PERGUNTAS[st.i].campo;
  if (ABERTO.test(t)) delete st.bruto[campo];
  else {
    const { erros } = normalizarFiltros({ [campo]: t });
    if (erros.length) return { acao: 'erro', texto: `${erros[0]}\n${pergunta(st)}` };
    st.bruto[campo] = t;
  }
  st.ts = Date.now();
  st.i++;
  if (st.i >= PERGUNTAS.length) return terminar(st);
  return { acao: 'pergunta', texto: pergunta(st) };
}

function terminar(st) {
  const { filtros, erros } = normalizarFiltros(st.bruto);
  if (erros.length) return { acao: 'erro', texto: erros[0] };
  return { acao: 'fim', filtros: st.bruto, validados: filtros };
}

module.exports = { PERGUNTAS, TTL_MS, iniciar, pergunta, responder };
