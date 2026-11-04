/**
 * ============================================================================
 * FICHA EM PDF — moderna, minimalista e EDITÁVEL (04/11/2026)
 * ============================================================================
 * Gera a apresentação do imóvel para mandar ao cliente ou a um corretor parceiro:
 *  página 1: foto grande, nome, bairro, preço em destaque, números (quartos, suítes,
 *            vagas, área), descrição completa e diferenciais;
 *  página 2: galeria (quando há mais fotos) e contato do corretor.
 * Tudo que aparece pode ser editado no painel antes de gerar (título, subtítulo,
 * preço, descrição, diferenciais, fotos, cor de destaque, contato). As edições
 * ficam guardadas por imóvel em `fichas_pdf.json`; o contato fica para todas.
 * ============================================================================
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { FOTOS_DIR } = require('./paths');
const { readJson, writeJson } = require('./store');
const { formatPriceLabel } = require('./matcher');

const FILE = 'fichas_pdf.json';
const CORES = { cobalto: '#5266eb', dourado: '#b08d3c', verde: '#2f6b4f', grafite: '#1e1e2a', terracota: '#b8452e' };
const CAMPOS_TEXTO = { titulo: 120, subtitulo: 160, preco: 60, descricao: 20000, destaques: 2000, corretor: 80, telefone: 40, creci: 30, email: 80, rodape: 200 };

let state = { contato: {}, fichas: {}, ...readJson(FILE, {}) };

const limpo = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);
const semEmoji = s => String(s || '').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/\*/g, '').trim();

/** Só aceita nomes de foto da própria pasta de fotos (nada de caminho nem URL) */
function fotoLocal(f) {
  const nome = path.basename(String(f || ''));
  if (!/^[\w.-]+\.(jpe?g|png)$/i.test(nome)) return null;
  const p = path.join(FOTOS_DIR, nome);
  return fs.existsSync(p) ? p : null;
}

const fotosDe = p => (Array.isArray(p.fotos) ? p.fotos : String(p.fotos || '').split(/[,;\n]/)).map(x => String(x).trim()).filter(Boolean);

/** Texto padrão da ficha a partir da carteira */
function padrao(p) {
  const nome = p.edificio || `${p.tipo || 'Imóvel'}${p.setor ? ` no ${p.setor}` : ''}`;
  const destaques = [];
  const d = String(p.descricao || '');
  for (const [rx, t] of [
    [/piscina privativa|piscina na varanda/i, 'Piscina privativa'],
    [/varanda gourmet|espa[cç]o gourmet/i, 'Varanda gourmet'],
    [/mobiliad|decorad|porteira fechada/i, 'Mobiliado e decorado'],
    [/vista (livre|panor[aâ]mica|definitiva)/i, 'Vista livre'],
    [/lazer completo|condom[ií]nio clube/i, 'Lazer completo'],
    [/andar alto/i, 'Andar alto'],
    [/nascente|sol da manh[aã]/i, 'Sol da manhã'],
    [/aceita permuta/i, 'Aceita permuta'],
    [/aceita financiamento|financi[aá]vel/i, 'Aceita financiamento']
  ]) if (rx.test(d)) destaques.push(t);
  if (String(p.aceita_permuta).toUpperCase() === 'SIM' && !destaques.includes('Aceita permuta')) destaques.push('Aceita permuta');
  return {
    titulo: nome,
    subtitulo: [p.tipo, p.setor, p.cidade || 'Goiânia'].filter(Boolean).join(' · '),
    preco: formatPriceLabel(p),
    descricao: semEmoji(p.descricao),
    destaques: destaques.join('\n'),
    fotos: fotosDe(p).filter(fotoLocal).slice(0, 7),
    cor: 'cobalto',
    mostrarCodigo: true
  };
}

/** Ficha do imóvel = padrão da carteira + o que o corretor editou + contato */
function ficha(p) {
  const salvo = Object.prototype.hasOwnProperty.call(state.fichas, String(p.id)) ? state.fichas[String(p.id)] : {};
  return { ...padrao(p), ...salvo, ...state.contato, id: String(p.id) };
}

/** Grava as edições (lista branca de campos) */
function salvar(p, entrada = {}) {
  const f = {};
  for (const [k, max] of Object.entries(CAMPOS_TEXTO)) if (typeof entrada[k] === 'string') f[k] = limpo(entrada[k], max);
  if (Array.isArray(entrada.fotos)) f.fotos = entrada.fotos.map(String).filter(x => fotoLocal(x)).slice(0, 7);
  if (Object.prototype.hasOwnProperty.call(CORES, entrada.cor)) f.cor = entrada.cor;
  if (entrada.mostrarCodigo !== undefined) f.mostrarCodigo = Boolean(entrada.mostrarCodigo);
  const contato = {};
  for (const k of ['corretor', 'telefone', 'creci', 'email', 'rodape']) if (k in f) (contato[k] = f[k]), delete f[k];
  const id = String(p.id);
  if (id === '__proto__' || id === 'constructor' || id === 'prototype') throw Object.assign(new Error('Imóvel inválido.'), { status: 400 });
  state.fichas[id] = { ...(Object.prototype.hasOwnProperty.call(state.fichas, id) ? state.fichas[id] : {}), ...f };
  state.contato = { ...state.contato, ...contato };
  writeJson(FILE, state);
  return ficha(p);
}

function restaurar(p) {
  const id = String(p.id);
  if (Object.prototype.hasOwnProperty.call(state.fichas, id)) delete state.fichas[id];
  writeJson(FILE, state);
  return ficha(p);
}

// ------------------------------------------------------------------ desenho
function numeros(p) {
  return [
    [p.quartos, 'quartos'],
    [p.suites, 'suítes'],
    [p.vagas, 'vagas'],
    [p.tamanho_m2 || p.area_terreno, 'm²']
  ].filter(([v]) => v !== undefined && v !== null && String(v).trim() !== '' && String(v) !== '0');
}

function imagemCobrindo(doc, arquivo, x, y, w, h) {
  doc.save();
  doc.rect(x, y, w, h).clip();
  try {
    doc.image(arquivo, x, y, { cover: [w, h], align: 'center', valign: 'center' });
  } catch {
    doc.rect(x, y, w, h).fill('#ececf1');
  }
  doc.restore();
}

/**
 * @param p imóvel da carteira  @param f ficha (padrão + edições; ver `ficha`)
 * @returns Promise<Buffer>
 */
function gerar(p, f = ficha(p)) {
  return new Promise((resolve, reject) => {
    const cor = CORES[f.cor] || CORES.cobalto;
    const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 76, left: 48, right: 48 }, bufferPages: true, info: { Title: semEmoji(f.titulo), Author: semEmoji(f.corretor || 'BIGA'), Subject: `Imóvel #${p.id}` } });
    const out = [];
    doc.on('data', c => out.push(c));
    doc.on('end', () => resolve(Buffer.concat(out)));
    doc.on('error', reject);
    const W = doc.page.width;
    const H = doc.page.height;
    const M = 48;
    const fotos = (f.fotos || []).map(fotoLocal).filter(Boolean);

    // capa: foto grande sangrando a página
    const alturaCapa = fotos.length ? 360 : 0;
    if (fotos.length) imagemCobrindo(doc, fotos[0], 0, 0, W, alturaCapa);
    else doc.rect(0, 0, W, 8).fill(cor);

    // etiqueta com o código
    let y = alturaCapa + 36;
    if (f.mostrarCodigo !== false) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(cor).text(`IMÓVEL #${p.id}`.toUpperCase(), M, y, { characterSpacing: 2 });
      y += 18;
    }
    doc.font('Helvetica-Bold').fontSize(26).fillColor('#15151d').text(semEmoji(f.titulo), M, y, { width: W - M * 2, lineGap: 2 });
    y = doc.y + 6;
    if (f.subtitulo) {
      doc.font('Helvetica').fontSize(11).fillColor('#6b6b78').text(semEmoji(f.subtitulo).toUpperCase(), M, y, { width: W - M * 2, characterSpacing: 1.2 });
      y = doc.y + 16;
    }
    // preço
    doc.font('Helvetica-Bold').fontSize(24).fillColor(cor).text(semEmoji(f.preco), M, y);
    y = doc.y + 18;

    // números em blocos
    const nums = numeros(p);
    if (nums.length) {
      const gap = 10;
      const bw = (W - M * 2 - gap * (nums.length - 1)) / nums.length;
      nums.forEach(([v, rot], i) => {
        const x = M + i * (bw + gap);
        doc.roundedRect(x, y, bw, 56, 8).fill('#f3f3f7');
        doc.font('Helvetica-Bold').fontSize(18).fillColor('#15151d').text(String(v), x, y + 10, { width: bw, align: 'center' });
        doc.font('Helvetica').fontSize(8.5).fillColor('#6b6b78').text(rot.toUpperCase(), x, y + 34, { width: bw, align: 'center', characterSpacing: 1 });
      });
      y += 56 + 22;
    }

    // diferenciais
    const destaques = String(f.destaques || '').split('\n').map(semEmoji).filter(Boolean).slice(0, 12);
    if (destaques.length) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#15151d').text('DIFERENCIAIS', M, y, { characterSpacing: 2 });
      y = doc.y + 8;
      const col = (W - M * 2 - 20) / 2;
      destaques.forEach((d, i) => {
        const x = M + (i % 2) * (col + 20);
        const yy = y + Math.floor(i / 2) * 18;
        doc.circle(x + 3, yy + 5, 2.5).fill(cor);
        doc.font('Helvetica').fontSize(10.5).fillColor('#2a2a35').text(d, x + 12, yy, { width: col - 12, lineBreak: false, ellipsis: true });
      });
      y += Math.ceil(destaques.length / 2) * 18 + 16;
    }

    // descrição completa (continua nas páginas seguintes se precisar)
    if (f.descricao) {
      if (y > H - 120) {
        doc.addPage();
        y = M;
      }
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#15151d').text('SOBRE O IMÓVEL', M, y, { characterSpacing: 2 });
      doc.moveDown(0.6);
      doc.font('Helvetica').fontSize(10.5).fillColor('#2a2a35').text(semEmoji(f.descricao), M, doc.y, { width: W - M * 2, lineGap: 3, align: 'left' });
    }

    // galeria: continua na mesma página se couber; abre página nova quando acaba o espaço
    const resto = fotos.slice(1);
    if (resto.length) {
      const gap = 10;
      const cw = (W - M * 2 - gap) / 2;
      const ch = 190;
      const limite = H - 76;
      let gy = (f.descricao || destaques.length || nums.length ? doc.y : y) + 26;
      if (gy + 22 + ch > limite) {
        doc.addPage();
        gy = M;
      }
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#15151d').text('GALERIA', M, gy, { characterSpacing: 2 });
      gy += 22;
      for (let i = 0; i < resto.length; i += 2) {
        if (gy + ch > limite) {
          doc.addPage();
          gy = M;
        }
        imagemCobrindo(doc, resto[i], M, gy, resto[i + 1] ? cw : W - M * 2, ch);
        if (resto[i + 1]) imagemCobrindo(doc, resto[i + 1], M + cw + gap, gy, cw, ch);
        gy += ch + gap;
      }
    }

    // rodapé com contato em todas as páginas
    const contato = [f.corretor, f.creci ? `CRECI ${String(f.creci).replace(/^creci\s*/i, '')}` : '', f.telefone, f.email].map(semEmoji).filter(Boolean).join('   ·   ');
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0; // o rodapé fica abaixo da margem: sem isso o pdfkit abriria página nova
      doc.rect(0, H - 44, W, 44).fill('#15151d');
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff').text(contato || 'Fale comigo para agendar uma visita', M, H - 28, { width: W - M * 2 - 60, lineBreak: false, ellipsis: true });
      doc.font('Helvetica').fontSize(8).fillColor('#9a9aa8').text(`${i + 1}/${range.count}`, W - M - 40, H - 28, { width: 40, align: 'right', lineBreak: false });
      if (f.rodape) doc.font('Helvetica').fontSize(7).fillColor('#6b6b78').text(semEmoji(f.rodape), M, H - 58, { width: W - M * 2, lineBreak: false, ellipsis: true });
    }
    doc.end();
  });
}

const nomeArquivo = (p, f) => `${String(f.titulo || `Imovel_${p.id}`).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'Imovel'}_${p.id}.pdf`;

module.exports = { CORES, padrao, ficha, salvar, restaurar, gerar, nomeArquivo };
