'use strict';
// Regras de conteúdo (mesmas do gen/core.py): campo vazio -> bloco some.
const NB = ' ';

const loc = (d) => [d.setor, d.regiao, d.cidade].filter(Boolean).join(', ');

function tipoNeg(d) {
  const neg = d.neg === 'VENDA_ALUGUEL' ? 'Venda ou aluguel' : d.neg;
  if (d.tipo && neg) return `${d.tipo} para ${neg.toLowerCase()}`;
  return d.tipo || neg || '';
}

/** (rótulo, valor). Ágio mostra só "ÁGIO" e o valor; sem preço = "Sob consulta". Preço é texto livre. */
function preco(d) {
  if (d.agio) return ['ÁGIO', d.agio];
  const rotulo = d.neg === 'VENDA_ALUGUEL' ? 'Venda ou aluguel' : (d.neg || '');
  if (d.valor) return [rotulo, d.valor];
  return ['', 'Sob consulta'];
}
const temPreco = (d) => !!(d.valor || d.agio);

function dadosLinhas(d) {
  return [['Área', d.area], ['Terreno', d.terreno], ['Quartos', d.quartos], ['Suítes', d.suites],
    ['Vagas', d.vagas], ['Idade', d.idade], ['Mobiliado', d.mobiliado]].filter(([, v]) => v);
}

function destaques(d, max = 6) {
  let h = [];
  if (d.permuta) h.push('Aceita permuta');
  if (d.financ) h.push('Aceita financiamento');
  if (d.lazer) h.push('Área de lazer');
  h = h.concat(d.feats || []);
  if (h.length > max) {
    const extra = h.length - max;
    h = h.slice(0, max).concat(`+${extra}`);
  }
  return h;
}
const listaCorrida = (hs) => (hs.length > 1 ? hs.slice(0, -1).join(', ') + ' e ' + hs[hs.length - 1] : hs[0]) + '.';

/** Telefone -> link do WhatsApp (https://wa.me/55...). Vazio se não houver dígitos suficientes. */
function waLink(fone) {
  let n = String(fone || '').replace(/\D/g, '');
  if (n.length < 10) return '';
  if (!n.startsWith('55') || n.length <= 11) n = '55' + n;
  return 'https://wa.me/' + n;
}
function formatarFone(fone) {
  const n = String(fone || '').replace(/\D/g, '');
  if (n.length === 11) return `(${n.slice(0, 2)})${NB}${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)})${NB}${n.slice(2, 6)}-${n.slice(6)}`;
  return fone || '';
}

const paragrafos = (desc) => String(desc || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);

const VAZIO = {
  tipo: '', neg: '', edificio: '', setor: '', regiao: '', cidade: '', mobiliado: '', quartos: '', suites: '', vagas: '',
  area: '', terreno: '', valor: '', agio: '', idade: '', permuta: false, financ: false, lazer: false, feats: [], desc: '',
  corretor: '', fone: '', creci: '', email: '',
};

module.exports = { NB, loc, tipoNeg, preco, temPreco, dadosLinhas, destaques, listaCorrida, waLink, formatarFone, paragrafos, VAZIO };
