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
  const base = path.resolve(FOTOS_DIR);
  let realBase = base;
  try { realBase = fs.realpathSync(base); } catch {}
  const lista = Array.isArray(prop?.fotos) ? prop.fotos : String(prop?.fotos || '').split(/[,;\n]/);
  return lista
    .map(f => path.basename(String(f || '').trim()))
    .filter(nome => /^[\w.-]+\.(jpe?g|png)$/i.test(nome))
    .map(nome => path.join(FOTOS_DIR, nome))
    .filter(p => {
      try {
        if (!fs.existsSync(p)) return false;
        const rp = fs.realpathSync(p);
        return rp.startsWith(realBase + path.sep);
      } catch {
        return false;
      }
    })
    .slice(0, max);
}

function buildPropertyPdf(prop, { corretor = '', telefone = '' } = {}) {
  return new Promise((resolve, reject) => {
    const safeProp = prop && typeof prop === 'object' ? prop : {};
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Imóvel #${safeProp.id ?? ''}` } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      doc.fontSize(20).fillColor('#111111').text(stripEmoji(describeProperty(safeProp).split('\n')[0]), { align: 'left' });
      doc.moveDown(0.3);
      doc.fontSize(16).fillColor('#5b21b6').text(formatPriceLabel(safeProp));
      doc.moveDown(0.6);

      const photos = localPhotos(safeProp);
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
        ['Tipo', safeProp.tipo],
        ['Negociação', { AGIO: 'Ágio', ALUGUEL: 'Aluguel', VENDA_ALUGUEL: 'Venda ou aluguel' }[safeProp.negociacao] || 'Venda'],
        ['Edifício / condomínio', safeProp.edificio],
        ['Bairro', safeProp.setor],
        ['Cidade', safeProp.cidade],
        ['Quartos', safeProp.quartos],
        ['Suítes', safeProp.suites],
        ['Vagas', safeProp.vagas],
        ['Área', safeProp.tamanho_m2 ? `${safeProp.tamanho_m2} m²` : ''],
        ['Condomínio (taxa)', safeProp.condominio ? `R$ ${Number(safeProp.condominio).toLocaleString('pt-BR')}` : ''],
        ['Aceita permuta', safeProp.aceita_permuta === 'SIM' ? 'Sim' : safeProp.aceita_permuta === 'NAO' ? 'Não' : ''],
        ['Aceita financiamento', safeProp.aceita_financiamento === 'SIM' ? 'Sim' : safeProp.aceita_financiamento === 'NAO' ? 'Não' : '']
      ].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');
      for (const [k, v] of rows) {
        doc.font('Helvetica-Bold').text(`${k}: `, { continued: true }).font('Helvetica').text(String(v));
      }
      if (safeProp.descricao) {
        doc.moveDown(0.6).font('Helvetica-Bold').text('Descrição');
        doc.font('Helvetica').text(stripEmoji(safeProp.descricao), { align: 'justify' });
      }
      if (corretor || telefone) {
        doc.moveDown(1).fontSize(10).fillColor('#555555').text(`Contato: ${[corretor, telefone].filter(Boolean).join(' · ')}`);
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildPropertyPdf };
