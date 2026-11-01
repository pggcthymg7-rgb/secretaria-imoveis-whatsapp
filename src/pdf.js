/**
 * Ficha do imóvel em PDF (para quando o corretor pede "enviar em PDF").
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { FOTOS_DIR } = require('./paths');
const { describeProperty, formatPriceLabel } = require('./matcher');

function stripEmoji(s) {
  return String(s || '').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\*/g, '').trim();
}

function localPhotos(prop, max = 3) {
  return (prop.fotos || [])
    .filter(f => !/^https?:/i.test(f) && /\.(jpe?g|png)$/i.test(f))
    .map(f => path.join(FOTOS_DIR, path.basename(f)))
    .filter(p => fs.existsSync(p))
    .slice(0, max);
}

function buildPropertyPdf(prop, { corretor = '', telefone = '' } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Imóvel #${prop.id}` } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).fillColor('#111111').text(stripEmoji(describeProperty(prop).split('\n')[0]), { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(16).fillColor('#5b21b6').text(formatPriceLabel(prop));
    doc.moveDown(0.6);

    const photos = localPhotos(prop);
    if (photos.length) {
      try {
        doc.image(photos[0], { fit: [515, 300], align: 'center' });
        doc.moveDown(0.5);
      } catch {}
      const rest = photos.slice(1);
      if (rest.length) {
        const y = doc.y;
        rest.forEach((p, i) => {
          try {
            doc.image(p, 40 + i * 262, y, { fit: [253, 160] });
          } catch {}
        });
        doc.y = y + 170;
      }
    }

    doc.fillColor('#111111').fontSize(12);
    const rows = [
      ['Tipo', prop.tipo],
      ['Negociação', { AGIO: 'Ágio', ALUGUEL: 'Aluguel', VENDA_ALUGUEL: 'Venda ou aluguel' }[prop.negociacao] || 'Venda'],
      ['Edifício / condomínio', prop.edificio],
      ['Bairro', prop.setor],
      ['Cidade', prop.cidade],
      ['Quartos', prop.quartos],
      ['Suítes', prop.suites],
      ['Vagas', prop.vagas],
      ['Área', prop.tamanho_m2 ? `${prop.tamanho_m2} m²` : ''],
      ['Condomínio (taxa)', prop.condominio ? `R$ ${Number(prop.condominio).toLocaleString('pt-BR')}` : ''],
      ['Aceita permuta', prop.aceita_permuta === 'SIM' ? 'Sim' : prop.aceita_permuta === 'NAO' ? 'Não' : ''],
      ['Aceita financiamento', prop.aceita_financiamento === 'SIM' ? 'Sim' : prop.aceita_financiamento === 'NAO' ? 'Não' : '']
    ].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');
    for (const [k, v] of rows) {
      doc.font('Helvetica-Bold').text(`${k}: `, { continued: true }).font('Helvetica').text(String(v));
    }
    if (prop.descricao) {
      doc.moveDown(0.6).font('Helvetica-Bold').text('Descrição');
      doc.font('Helvetica').text(stripEmoji(prop.descricao), { align: 'justify' });
    }
    if (corretor || telefone) {
      doc.moveDown(1).fontSize(10).fillColor('#555555').text(`Contato: ${[corretor, telefone].filter(Boolean).join(' · ')}`);
    }
    doc.end();
  });
}

module.exports = { buildPropertyPdf };
