'use strict';
/**
 * Catálogo unificado de ícones SVG (viewBox 0 0 24 24).
 * Paths idênticos aos de `src/public/studio-core.js` para paridade 1:1 Konva <-> pdfkit.
 */
const ICONES_SVG = {
  quarto: {
    label: 'Quarto',
    path: 'M3 7v11h2v-3h14v3h2V11a3 3 0 0 0-3-3H10v5H5V7H3zm4.5 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'
  },
  banheiro: {
    label: 'Banheiro',
    path: 'M7 7a2 2 0 0 1 4 0v1h2v1H3v4a5 5 0 0 0 4 4.9V20h2v-2h6v2h2v-2.1A5 5 0 0 0 21 13v-2H9V7a1 1 0 0 1 2 0h2a3 3 0 0 0-6 0z'
  },
  suite: {
    label: 'Suíte',
    path: 'M12 2l2.2 4.4 4.8.7-3.5 3.4.8 4.8-4.3-2.3-4.3 2.3.8-4.8L5 7.1l4.8-.7L12 2zM3 16h18v4h-2v-2H5v2H3v-4z'
  },
  vaga: {
    label: 'Vaga',
    path: 'M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11v7h-2v-2H7v2H5v-7zm2.8-4l-.9 2.8h10.2L16.2 7H7.8zM7.5 14a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4zm9 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z'
  },
  area: {
    label: 'Área m²',
    path: 'M3 3h8v2H5v6H3V3zm10 0h8v8h-2V5h-6V3zM3 13h2v6h6v2H3v-8zm16 0h2v8h-8v-2h6v-6zM8 8h8v8H8V8zm2 2v4h4v-4h-4z'
  },
  terreno: {
    label: 'Terreno',
    path: 'M4 5l8-3 8 3v14l-8 3-8-3V5zm2 1.4v11.2l6 2.2 6-2.2V6.4l-6-2.2-6 2.2zM8 10h8v2H8v-2zm0 4h5v2H8v-2z'
  },
  pin: {
    label: 'Localização',
    path: 'M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z'
  },
  casa: {
    label: 'Casa',
    path: 'M12 3l9 7.5V21h-6v-6H9v6H3V10.5L12 3z'
  },
  predio: {
    label: 'Edifício',
    path: 'M4 21V5l8-3 8 3v16h-6v-4h-4v4H4zm4-13v2h2V8H8zm6 0v2h2V8h-2zm-6 4v2h2v-2H8zm6 0v2h2v-2h-2z'
  },
  chave: {
    label: 'Chave',
    path: 'M12.6 10A5.5 5.5 0 1 0 7 15.5c2.4 0 4.4-1.5 5.2-3.5H16v3h3v-3h2v-2h-8.4zM7 13.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4z'
  },
  sol: {
    label: 'Sol / Nascente',
    path: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm-1-5h2v3h-2V2zm0 17h2v3h-2v-3zM2 11h3v2H2v-2zm17 0h3v2h-3v-2zM4.9 5.6l1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1zm10.6 10.6l1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1zm2.1-10.6l-2.1 2.1-1.4-1.4 2.1-2.1 1.4 1.4zM7 16.2l-2.1 2.1-1.4-1.4 2.1-2.1 1.4 1.4z'
  },
  piscina: {
    label: 'Piscina / Lazer',
    path: 'M7 14v-2h10v2h2V7a3 3 0 0 0-3-3h-1v2h1a1 1 0 0 1 1 1v3H7V7a1 1 0 0 1 1-1h1V4H8a3 3 0 0 0-3 3v7h2zm-4 4c1.3 0 2-.7 3-.7s1.7.7 3 .7 2-.7 3-.7 1.7.7 3 .7 2-.7 3-.7 1.7.7 3 .7v-2c-1.3 0-2-.7-3-.7s-1.7.7-3 .7-2-.7-3-.7-1.7.7-3 .7-2-.7-3-.7-1.7.7-3 .7v2z'
  },
  estrela: {
    label: 'Destaque',
    path: 'M12 2l2.9 6.1 6.7.9-4.9 4.7 1.2 6.7L12 17.2 6.1 20.4l1.2-6.7L2.4 9l6.7-.9L12 2z'
  },
  check: {
    label: 'Confirmado',
    path: 'M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z'
  },
  whatsapp: {
    label: 'WhatsApp',
    path: 'M12 2a9.9 9.9 0 0 0-8.6 14.9L2 22l5.3-1.4A10 10 0 1 0 12 2zm5.2 14.1c-.2.6-1.3 1.2-1.8 1.3-.5.1-1.1.1-1.8-.1-.4-.1-1-.3-1.7-.6-3-1.3-5-4.3-5.1-4.5-.2-.2-1.2-1.6-1.2-3 0-1.5.7-2.2 1-2.5.3-.3.6-.4.8-.4h.6c.2 0 .4-.1.7.5.2.6.8 2 .9 2.1.1.2.1.3 0 .5-.1.2-.2.3-.3.5-.2.2-.3.4-.5.5-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1.1 2.2 1.4 2.5 1.6.3.1.5.1.7-.1.2-.2.8-.9 1-1.2.2-.3.4-.3.7-.2.3.1 1.8.8 2.1 1 .3.2.5.2.6.4.1.2.1.9-.1 1.5z'
  },
  telefone: {
    label: 'Telefone',
    path: 'M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1l-2.2 1.9z'
  },
  seta: {
    label: 'Seta',
    path: 'M4 11h12.2l-4.6-4.6L13 5l7 7-7 7-1.4-1.4 4.6-4.6H4v-2z'
  },
  'selo-exclusivo': {
    label: 'Selo Exclusivo',
    path: 'M12 2l2.4 2.3 3.3-.5 1 3.2 3.1 1.3-.9 3.2 1.7 2.9-2.5 2.2.1 3.3-3.2.7-1.5 3-3.1-1.1-3.1 1.1-1.5-3-3.2-.7.1-3.3-2.5-2.2 1.7-2.9-.9-3.2L6.3 7l1-3.2 3.3.5L12 2zm0 5.5L10.6 10.4 7.4 10.9l2.3 2.2-.5 3.2 2.8-1.5 2.8 1.5-.5-3.2 2.3-2.2-3.2-.5L12 7.5z'
  },
  'selo-novo': {
    label: 'Selo Novo',
    path: 'M12 2l3 5.5 6 1-4.2 4.5.9 6L12 16.5 6.3 19l.9-6L3 8.5l6-1L12 2zm-3 8.5v4h1.3v-2.2l1.8 2.2h1.2v-4H12v2.2l-1.8-2.2H9z'
  },
  'selo-vendido': {
    label: 'Selo Vendido',
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.2 14.2L6.5 12l1.4-1.4 2.9 2.9 5.3-5.3 1.4 1.4-6.7 6.6z'
  },
  'selo-oportunidade': {
    label: 'Selo Oportunidade',
    path: 'M13 2L4 14h7l-1 8 10-12h-7l0-8z'
  },
  'switch-on': {
    label: 'Ligado',
    path: 'M7 7h10a5 5 0 0 1 0 10H7A5 5 0 0 1 7 7zm10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'
  },
  'switch-off': {
    label: 'Desligado',
    path: 'M7 7h10a5 5 0 0 1 0 10H7A5 5 0 0 1 7 7zm0 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'
  }
};

module.exports = { ICONES_SVG };
