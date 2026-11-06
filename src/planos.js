/**
 * PLANOS E USO JUSTO (trava financeira: margem bruta > 75%)
 * Limites mensais por plano, de acordo com o Data Room
 * (`data_room_biga/03_FINANCEIRO_E_PRECOS/03_Unit_Economics_Custos_IA_e_Precos.md` §2).
 *
 * BIGA_PLANO no .env: radar | designer | imobiliaria. Sem BIGA_PLANO = instalação própria
 * (o corretor usa as chaves dele) e nenhum teto de plano é aplicado; valem só os limites diários.
 * Quando o teto acaba, a BIGA não para: cai no cérebro local (parser + mapa) e avisa.
 */
const { readJson, writeJson } = require('./store');

const USO_FILE = 'uso_plano.json';

const PLANOS = Object.freeze({
  radar: Object.freeze({ nome: 'Biga Radar', preco: 97, buscas: 100, apify: 0, ia: 1500 }),
  designer: Object.freeze({ nome: 'Biga Designer', preco: 197, buscas: 200, apify: 5, ia: 3000 }),
  imobiliaria: Object.freeze({ nome: 'Biga Imobiliária', preco: 997, buscas: 800, apify: 20, ia: 12000 })
});
const TIPOS = ['buscas', 'apify', 'ia'];

/** Plano ativo ({ id, ...limites }) ou null (instalação própria, sem teto) */
function planoAtual(env = process.env) {
  const id = String((env && env.BIGA_PLANO) || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return Object.prototype.hasOwnProperty.call(PLANOS, id) ? { id, ...PLANOS[id] } : null;
}

function mesAtual() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
}

function lerUso() {
  const u = readJson(USO_FILE, {});
  const mes = mesAtual();
  const base = { mes, buscas: 0, apify: 0, ia: 0 };
  if (!u || u.mes !== mes) return base;
  for (const t of TIPOS) base[t] = Math.max(0, Number(u[t]) || 0);
  return base;
}

function validarTipo(tipo) {
  if (!TIPOS.includes(tipo)) throw new Error(`Tipo de uso desconhecido: ${tipo}`);
}

/** Ainda há saldo no mês? Sem plano: sempre true. */
function podeUsar(tipo, env = process.env) {
  validarTipo(tipo);
  const p = planoAtual(env);
  if (!p) return true;
  return lerUso()[tipo] < p[tipo];
}

function registrar(tipo, n = 1) {
  validarTipo(tipo);
  const u = lerUso();
  u[tipo] = Math.max(0, u[tipo] + n);
  writeJson(USO_FILE, u);
  return u[tipo];
}

/** Chamada que falhou não conta no mês */
function devolver(tipo) {
  return registrar(tipo, -1);
}

/** Resumo para o painel e o "Mensagem para mim" */
function resumo(env = process.env) {
  const p = planoAtual(env);
  const u = lerUso();
  if (!p) return { plano: null, mes: u.mes, uso: u };
  const saldo = {};
  for (const t of TIPOS) saldo[t] = Math.max(0, p[t] - u[t]);
  return { plano: { id: p.id, nome: p.nome, limites: { buscas: p.buscas, apify: p.apify, ia: p.ia } }, mes: u.mes, uso: u, saldo };
}

module.exports = { PLANOS, planoAtual, podeUsar, registrar, devolver, resumo, mesAtual, USO_FILE };
