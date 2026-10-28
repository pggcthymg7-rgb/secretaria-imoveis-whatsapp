/**
 * ============================================================================
 * INTEGRAÇÃO MINI-CRM <-> GOOGLE SHEETS (OPCIONAL)
 * ============================================================================
 * Como usar (se quiser sincronizar automaticamente com o Google Sheets na nuvem):
 * 1. Abra sua planilha no Google Sheets.
 * 2. No menu superior, clique em: Extensões > Apps Script.
 * 3. Apague tudo que estiver lá e cole este código inteiro.
 * 4. Clique no botão azul "Implantar" (canto superior direito) > "Nova implantação".
 * 5. Em "Selecionar tipo" (ícone de engrenagem), escolha "App da Web".
 * 6. Em "Quem pode acessar", selecione "Qualquer pessoa".
 * 7. Clique em "Implantar", copie a URL gerada (termina com /exec) e cole no
 *    campo "Webhook Google Sheets" nas Configurações do seu Mini-CRM!
 * ============================================================================
 */

const HEADERS = ['id', 'tipo', 'setor', 'quartos', 'tamanho_m2', 'valor', 'descricao', 'fotos', 'ativo'];

function ensureSheetSetup() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#10b981').setFontColor('#ffffff');
  }
  return sheet;
}

// Quando o Agente busca a lista de imóveis (GET)
function doGet(e) {
  const sheet = ensureSheetSetup();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  }
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const rows = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i];
    });
    return obj;
  });
  return ContentService.createTextOutput(JSON.stringify(rows)).setMimeType(ContentService.MimeType.JSON);
}

// Quando você cadastra, edita ou exclui um imóvel pelo Mini-CRM (POST)
function doPost(e) {
  const sheet = ensureSheetSetup();
  const payload = JSON.parse(e.postData.contents);
  const action = payload.action || 'SYNC_ALL';

  if (action === 'SYNC_ALL' && Array.isArray(payload.properties)) {
    sheet.clearContents();
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#10b981').setFontColor('#ffffff');
    
    payload.properties.forEach(p => {
      sheet.appendRow([
        p.id,
        p.tipo,
        p.setor,
        p.quartos,
        p.tamanho_m2,
        p.valor,
        p.descricao,
        Array.isArray(p.fotos) ? p.fotos.join(';') : (p.fotos || ''),
        p.ativo ? 'SIM' : 'NAO'
      ]);
    });
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}
