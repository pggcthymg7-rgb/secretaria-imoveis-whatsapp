'use strict';
// Cores do KIT: 5 cores de entrada -> variáveis derivadas por contraste (WCAG 2.x).
// Funciona em Node e no navegador (sem dependências).

function lum(hex) {
  const h = hex.replace('#', '');
  const v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}

function contraste(a, b) {
  let la = lum(a), lb = lum(b);
  if (la < lb) [la, lb] = [lb, la];
  return (la + 0.05) / (lb + 0.05);
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Recebe {fundo, texto, principal, secundaria, destaque} e devolve a paleta completa. */
function derivar(p) {
  for (const k of ['fundo', 'texto', 'principal', 'secundaria', 'destaque']) {
    if (!HEX.test(p[k] || '')) throw new Error(`cor inválida em "${k}": ${p[k]}`);
  }
  const out = { ...p };
  for (const s of ['principal', 'secundaria', 'destaque']) {
    // texto sobre a superfície: fundo ou texto, o que tiver mais contraste (mesma regra do HTML)
    out['sobre-' + s] = contraste(p[s], p.fundo) >= contraste(p[s], p.texto) ? p.fundo : p.texto;
  }
  const fundoClaro = lum(p.fundo) > lum(p.texto);
  out['qr-claro'] = fundoClaro ? p.fundo : p.texto;
  out['qr-escuro'] = fundoClaro ? p.texto : p.fundo;
  out.ph = '#BEBEBE';
  return out;
}

/** Conferência de contraste (mesmos limites do LEIA-ME). */
function conferir(p) {
  const d = derivar(p);
  const pares = [
    ['texto/fundo', p.texto, p.fundo, 7],
    ['destaque/fundo', p.destaque, p.fundo, 3],
    ['sobre-principal/principal', d['sobre-principal'], p.principal, 4.5],
    ['sobre-secundaria/secundaria', d['sobre-secundaria'], p.secundaria, 3],
    ['sobre-destaque/destaque', d['sobre-destaque'], p.destaque, 3],
  ];
  return pares.map(([n, a, b, min]) => {
    const r = Math.round(contraste(a, b) * 100) / 100;
    return { par: n, razao: r, minimo: min, ok: r >= min };
  });
}

module.exports = { lum, contraste, derivar, conferir };
