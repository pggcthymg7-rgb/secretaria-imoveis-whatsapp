#!/usr/bin/env node
/**
 * Impacto de uma PR no grafo do código (Graphify local, grátis, sem IA).
 * Uso (no GitHub Actions): node scripts/graphify-impacto.js <BASE_SHA> <HEAD_SHA> [graphify-out]
 * Lê graphify-out/graph.json e GRAPH_REPORT.md (gerados por `graphify update .`) e escreve o comentário
 * em markdown na saída padrão. Sem dependências; só chama `git diff` (sem shell).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MARCA = '<!-- graphify-review-local -->';
const LIMITE_COMENTARIO = 60000; // o GitHub aceita 65536 caracteres
// em CommonJS o uso entre arquivos aparece como imports_from/imports (o require), além de calls/indirect_call
const CHAMADAS = new Set(['calls', 'indirect_call', 'imports_from', 'imports']);

/** Quem, FORA dos arquivos mudados, chama funções definidas nos arquivos mudados; e quais testes se ligam a eles */
function impacto(graph, mudados) {
  const nos = new Map((graph.nodes || []).map(n => [n.id, n]));
  const set = new Set(mudados);
  const porArquivo = new Map();
  const pega = f => {
    if (!porArquivo.has(f)) porArquivo.set(f, { arquivo: f, funcoes: new Set(), chamadores: new Map(), testes: new Set() });
    return porArquivo.get(f);
  };
  for (const n of graph.nodes || []) if (set.has(n.source_file) && n._callable) pega(n.source_file).funcoes.add(n.label);
  for (const e of graph.links || graph.edges || []) {
    if (!CHAMADAS.has(e.relation)) continue;
    const de = nos.get(e.source);
    const para = nos.get(e.target);
    if (!de || !para || !set.has(para.source_file) || de.source_file === para.source_file) continue;
    const alvo = pega(para.source_file);
    if (/^tests?\//.test(de.source_file)) alvo.testes.add(de.source_file);
    else if (!set.has(de.source_file)) alvo.chamadores.set(`${de.source_file}|${de.label}|${para.label}`, { arquivo: de.source_file, de: de.label, para: para.label });
  }
  const fora = mudados.filter(f => !porArquivo.has(f) || (!porArquivo.get(f).funcoes.size && !porArquivo.get(f).chamadores.size && !porArquivo.get(f).testes.size));
  return { arquivos: [...porArquivo.values()].filter(a => a.funcoes.size || a.chamadores.size || a.testes.size), foraDoGrafo: fora };
}

function montarComentario({ graph, relatorio, mudados, base, head }) {
  const { arquivos, foraDoGrafo } = impacto(graph, mudados);
  const linhas = [MARCA, '## 🕸️ Graphify (local) — impacto desta PR', `_Grafo gerado no próprio GitHub Actions (sem limite de builds). Commit analisado: \`${String(head).slice(0, 8)}\` · base \`${String(base).slice(0, 8)}\`._`, ''];
  const srcSemTeste = arquivos.filter(a => /^src\//.test(a.arquivo) && !a.testes.size).map(a => a.arquivo);
  if (!arquivos.some(x => !/^tests?\//.test(x.arquivo))) linhas.push('Nenhuma função dos arquivos alterados aparece no grafo (mudança só em docs/configuração?).');
  for (const a of arquivos.filter(x => !/^tests?\//.test(x.arquivo)).sort((x, y) => y.chamadores.size - x.chamadores.size)) {
    const ch = [...a.chamadores.values()];
    const arqs = [...new Set(ch.map(c => c.arquivo))].sort();
    linhas.push(`### \`${a.arquivo}\``, `- Funções no arquivo: **${a.funcoes.size}** · usado por **${arqs.length}** arquivo${arqs.length === 1 ? '' : 's'} de fora · testes ligados: **${a.testes.size}**`);
    if (arqs.length) linhas.push(`- Quem usa: ${arqs.slice(0, 10).map(f => `\`${f}\``).join(', ')}${arqs.length > 10 ? `, …e mais ${arqs.length - 10}` : ''}`);
    if (a.testes.size) linhas.push(`- Testes: ${[...a.testes].sort().slice(0, 6).map(t => `\`${t}\``).join(', ')}`);
    linhas.push('');
  }
  if (srcSemTeste.length) linhas.push(`> ⚠️ **Sem teste ligado no grafo:** ${srcSemTeste.map(f => `\`${f}\``).join(', ')} — confira se algum teste cobre a mudança (o grafo não enxerga testes que só passam por \`require\` indireto).`, '');
  if (foraDoGrafo.length) linhas.push(`<sub>Fora do grafo (não é código analisado): ${foraDoGrafo.slice(0, 12).map(f => `\`${f}\``).join(', ')}${foraDoGrafo.length > 12 ? '…' : ''}</sub>`, '');
  const corpo = linhas.filter(l => l !== undefined).join('\n');
  const rel = `<details><summary>Relatório completo do grafo (GRAPH_REPORT.md)</summary>\n\n${String(relatorio || '').slice(0, Math.max(0, LIMITE_COMENTARIO - corpo.length - 400))}\n\n</details>`;
  return `${corpo}\n${rel}\n\n---\n_Gerado por \`graphify update .\` + \`scripts/graphify-impacto.js\`. Não substitui a leitura da mudança: mostra o raio de alcance._\n`.slice(0, LIMITE_COMENTARIO);
}

function arquivosMudados(base, head) {
  const ok = s => /^[0-9a-f]{40}$/.test(String(s));
  if (!ok(base) || !ok(head)) throw new Error('BASE_SHA/HEAD_SHA inválidos (esperado 40 hexadecimais)');
  return execFileSync('git', ['diff', '--name-only', `${base}...${head}`], { encoding: 'utf8' }).split('\n').map(s => s.trim()).filter(Boolean);
}

function main() {
  const [base, head, pasta = 'graphify-out'] = process.argv.slice(2);
  const graph = JSON.parse(fs.readFileSync(path.join(pasta, 'graph.json'), 'utf8'));
  const relatorio = fs.existsSync(path.join(pasta, 'GRAPH_REPORT.md')) ? fs.readFileSync(path.join(pasta, 'GRAPH_REPORT.md'), 'utf8') : '';
  process.stdout.write(montarComentario({ graph, relatorio, mudados: arquivosMudados(base, head), base, head }));
}

if (require.main === module) main();
module.exports = { impacto, montarComentario, MARCA };
