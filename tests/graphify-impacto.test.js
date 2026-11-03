// Impacto da PR no grafo do Graphify local: lê graph.json e diz quem usa o que mudou e quais testes se ligam
require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../scripts/graphify-impacto');

const no = (id, source_file, label, extra = {}) => ({ id, source_file, label, ...extra });
// formato REAL do graph.json (graphify 0.9.101): o require entre arquivos vira imports_from/imports
const graph = {
  nodes: [
    no('serp', 'src/busca-serp.js', 'busca-serp.js'),
    no('serp_buscar', 'src/busca-serp.js', 'buscarAnuncios()', { _callable: true }),
    no('inteligente', 'src/busca-inteligente.js', 'busca-inteligente.js'),
    no('inteligente_buscar', 'src/busca-inteligente.js', 'buscar()', { _callable: true }),
    no('assistant_rodar', 'src/assistant.js', 'rodarBusca()', { _callable: true }),
    no('index', 'index.js', 'index.js'),
    no('teste', 'tests/busca-inteligente.test.js', 'busca-inteligente.test.js'),
    no('orfa', 'src/orfa.js', 'orfa()', { _callable: true })
  ],
  links: [
    { source: 'assistant_rodar', target: 'inteligente', relation: 'imports_from' },
    { source: 'index', target: 'inteligente', relation: 'imports_from' },
    { source: 'teste', target: 'inteligente', relation: 'imports_from' },
    { source: 'inteligente_buscar', target: 'serp_buscar', relation: 'calls' },
    { source: 'inteligente', target: 'serp', relation: 'imports_from' }
  ]
};

test('Graphify local: quem usa o arquivo alterado (imports_from/calls) e quais testes se ligam', () => {
  const r = G.impacto(graph, ['src/busca-inteligente.js', 'src/busca-serp.js', 'src/orfa.js', 'HANDOFF.md']);
  const inteligente = r.arquivos.find(a => a.arquivo === 'src/busca-inteligente.js');
  assert.deepEqual([...new Set([...inteligente.chamadores.values()].map(c => c.arquivo))].sort(), ['index.js', 'src/assistant.js']);
  assert.deepEqual([...inteligente.testes], ['tests/busca-inteligente.test.js']);
  // busca-serp só é usado por busca-inteligente, que também mudou nesta PR: não conta como "de fora"
  const serp = r.arquivos.find(a => a.arquivo === 'src/busca-serp.js');
  assert.equal(serp.chamadores.size, 0);
  assert.ok(r.foraDoGrafo.includes('HANDOFF.md'));
});

test('Graphify local: comentário tem marca para atualizar o mesmo comentário, alerta de teste e respeita o limite', () => {
  const md = G.montarComentario({ graph, relatorio: 'x'.repeat(200000), mudados: ['src/busca-inteligente.js', 'src/orfa.js'], base: 'a'.repeat(40), head: 'b'.repeat(40) });
  assert.ok(md.startsWith(G.MARCA));
  assert.ok(md.length <= 60000);
  assert.match(md, /Quem usa: `index\.js`, `src\/assistant\.js`/);
  assert.match(md, /Sem teste ligado no grafo:\*\* `src\/orfa\.js`/);
  assert.ok(!/Sem teste ligado no grafo:\*\*[^\n]*busca-inteligente\.js/.test(md), 'busca-inteligente tem teste ligado');
});

test('Graphify local: SHA inválido é recusado (nada de montar comando git com texto livre)', () => {
  assert.throws(() => require('child_process').execFileSync('node', [require.resolve('../scripts/graphify-impacto'), '--oops; rm -rf /', 'b'.repeat(40)], { stdio: 'pipe' }), /inválidos|Command failed/);
});
