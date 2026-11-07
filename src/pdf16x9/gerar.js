'use strict';
// Gerador: monta o PDF de um imóvel num modelo. Sem fs: recebe fontes e fotos como buffers,
// por isso o mesmo código roda no Node (casos de teste) e no navegador (mini-editor).
const { Motor } = require('./motor');
const { derivar } = require('./kit');
const { MODELOS } = require('./modelos');
const { waLink, formatarFone, paragrafos, VAZIO } = require('./dados');

const LIMITE_PAGINAS = 14;
const MAX_GALERIA = 10;

/** Fontes compatíveis por modelo (proposta; o João aprova). A fonte do KIT troca só o papel "marca". */
const COMPATIVEIS = {
  A: ['Jost', 'Montserrat', 'Outfit'],
  B: ['CormorantGaramond', 'PlayfairDisplay', 'EBGaramond'],
  D: ['ArchivoBlack', 'Anton', 'AlfaSlabOne'],
  E: ['Lora', 'Merriweather', 'LibreBaskerville'],
  F: ['BodoniModa', 'LibreBodoni', 'PlayfairDisplay'],
};

function paginasPadrao(nFotos) {
  const p = [{ tipo: 'capa' }, { tipo: 'resumo' }];
  if (nFotos > 1) p.push({ tipo: 'foto', foto: 1 });
  const resto = [];
  for (let i = 2; i < nFotos && resto.length < MAX_GALERIA; i++) resto.push(i);
  if (resto.length) p.push({ tipo: 'galeria', fotos: resto });
  p.push({ tipo: 'texto' }, { tipo: 'contato' });
  return p;
}

/**
 * @param PDFDocument classe do pdfkit
 * @param QRCode      módulo qrcode
 * @param e.modelo    'A' | 'B' | 'D' | 'E' | 'F'
 * @param e.paleta    'principal' | 'segunda'
 * @param e.kit       {marca, logo (buffer png/jpg), cores {5}, fonte (família)}
 * @param e.dados     campos do imóvel (ver dados.VAZIO)
 * @param e.fotos     [{buf, w, h, nome}] já reduzidas (JPEG), ou null para foto inválida
 * @param e.paginas   lista opcional de páginas; padrão = 6 páginas
 * @param e.fontes    {'Familia-peso': buffer}
 * @returns {doc, info} doc é um PDFDocument já finalizado (doc.end() chamado)
 */
function gerar(PDFDocument, QRCode, e) {
  const M = MODELOS[e.modelo];
  if (!M) throw new Error('modelo desconhecido: ' + e.modelo);
  const d = { ...VAZIO, ...e.dados };
  const kit = { ...(e.kit || {}) };
  const avisos = [];

  // paleta: KIT (5 cores) ou a do modelo; a "segunda" usa a paleta 2 do modelo
  const base = e.paleta === 'segunda' ? M.pal2 : (kit.cores || M.pal1);
  const pal = derivar(base);

  // fontes
  const pesos = {};
  for (const k of Object.keys(e.fontes)) {
    const i = k.lastIndexOf('-'); const fam = k.slice(0, i); const w = +k.slice(i + 1);
    (pesos[fam] = pesos[fam] || []).push(w);
  }
  let famMarca = M.fontes.t;
  if (kit.fonte && kit.fonte !== famMarca) {
    if (!COMPATIVEIS[M.id].includes(kit.fonte)) avisos.push(`fonte ${kit.fonte} fora da lista do modelo ${M.id}; mantida ${famMarca}`);
    else if (!M.pesosMarca.every((w) => (pesos[kit.fonte] || []).includes(w))) avisos.push(`fonte ${kit.fonte} sem os pesos ${M.pesosMarca}; mantida ${famMarca}`);
    else famMarca = kit.fonte;
  }
  const fam = { t: famMarca, b: M.fontes.b, s: M.fontes.s };

  const doc = new PDFDocument({ size: [1152, 648], margin: 0, autoFirstPage: false, compress: true,
    info: { Title: d.edificio || d.tipo || 'Apresentação do imóvel', Producer: 'BIGA protótipo', Creator: 'BIGA protótipo' } });
  for (const [k, buf] of Object.entries(e.fontes)) {
    const f = k.slice(0, k.lastIndexOf('-'));
    if (f === fam.t || f === fam.b || f === fam.s) doc.registerFont(k, buf);
  }

  // fotos: abre cada uma uma única vez (reutiliza o objeto entre páginas)
  const fotos = (e.fotos || []).map((f, i) => {
    if (!f || !f.buf) return null;
    try { return { img: doc.openImage(f.buf), w: f.w, h: f.h, nome: f.nome || `foto ${i + 1}`, wReduzida: f.w }; } catch (err) {
      avisos.push(`foto ${i + 1} inválida (${err.message}): espaço neutro`); return null;
    }
  });
  if (kit.logo) { try { kit.logoImg = doc.openImage(kit.logo); } catch (err) { avisos.push('logo inválido: usada a inicial'); } }

  const m = new Motor(doc, { pal, fam, pesos, logoWt: M.logoWt, avisos, recortes: e.recortes || null, medidas: e.medidas || [] });
  const fone = d.fone ? formatarFone(d.fone) : '';
  const url = d.fone ? waLink(d.fone) : '';
  const ctx = {
    fone,
    qr: url ? QRCode.create(url, { errorCorrectionLevel: 'M' }).modules : null,
    foto: (i) => fotos[i] || null,
    fotoTexto: fotos[2] || fotos[1] || fotos[0] || null,
  };
  if (d.fone && !url) avisos.push('telefone sem dígitos suficientes: QR omitido');

  let paginas = e.paginas || paginasPadrao(fotos.length);
  const nova = () => { doc.addPage({ size: [1152, 648], margin: 0 }); m.rect(0, 0, 1152, 648, 'fundo'); };
  let total = 0;
  const pular = (motivo) => avisos.push(motivo);

  for (const p of paginas) {
    if (total >= LIMITE_PAGINAS) { pular(`limite de ${LIMITE_PAGINAS} páginas: página "${p.tipo}" e seguintes omitidas`); break; }
    if (p.tipo === 'texto') {
      let paras = paragrafos(p.texto !== undefined ? p.texto : d.desc);
      if (!paras.length) { pular('descrição vazia: página de texto omitida'); continue; }
      let cont = false, guard = 0;
      while (paras.length && guard++ < 8) {
        if (total >= LIMITE_PAGINAS) { pular('limite de páginas atingido na continuação do texto'); break; }
        const res = m.paginar(paras, M.tb);
        if (!res.linhas.length) { pular('texto não coube'); break; }
        nova(); ctx.titulo = p.titulo; M.texto(m, d, kit, ctx, res, cont); total++;
        paras = res.resto; cont = true;
      }
      continue;
    }
    if (p.tipo === 'galeria') {
      const fs = (p.fotos || []).slice(0, MAX_GALERIA).map((i) => fotos[i] || null);
      if (!fs.length) { pular('galeria sem fotos: página omitida'); continue; }
      nova(); M.galeria(m, d, kit, ctx, fs); total++; continue;
    }
    if (p.tipo === 'foto') { nova(); M.foto(m, d, kit, ctx, fotos[p.foto] || null); total++; continue; }
    if (p.tipo === 'contato') {
      const temNome = Boolean(String(d.corretor || '').trim());
      const temFone = Boolean(String(d.fone || '').trim());
      if (!temNome && !temFone) {
        pular('sem nome e sem telefone: página de contato omitida');
        continue;
      }
      nova(); M.contato(m, d, kit, ctx); total++; continue;
    }
    if (p.tipo === 'capa' || p.tipo === 'resumo') { nova(); M[p.tipo](m, d, kit, ctx); total++; continue; }
    pular('tipo de página desconhecido: ' + p.tipo);
  }
  if (!total) { nova(); M.capa(m, d, kit, ctx); total = 1; }
  doc.end();
  return { doc, info: { paginas: total, avisos, fonteMarca: fam.t, medidas: m.medidas } };
}

module.exports = { gerar, paginasPadrao, COMPATIVEIS, LIMITE_PAGINAS, MAX_GALERIA, MODELOS };
