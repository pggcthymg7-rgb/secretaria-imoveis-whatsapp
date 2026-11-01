/**
 * ============================================================================
 * INTEGRAÇÃO SECRETÁRIA <-> GOOGLE SHEETS (OPCIONAL)
 * ============================================================================
 * 1. Abra sua planilha > Extensões > Apps Script, apague tudo e cole este código.
 * 2. Troque o TOKEN abaixo por uma senha longa e coloque o MESMO valor na variável
 *    GOOGLE_SHEETS_TOKEN do servidor da secretária (sem isso o webhook recusa).
 * 3. Implantar > Nova implantação > App da Web > Executar como: você;
 *    Quem pode acessar: Qualquer pessoa. Copie a URL (/exec) e cole em
 *    Ajustes > "Webhook do Apps Script" no painel.
 * As colunas são criadas automaticamente conforme o sistema (edifício, suítes,
 * vagas, ágio, permuta etc.).
 * ============================================================================
 */

const TOKEN = 'TROQUE-POR-UMA-SENHA-LONGA';

function getSheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

function doGet() {
  const sheet = getSheet_();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return json_([]);
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const rows = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = row[i]));
    return obj;
  });
  return json_(rows);
}

function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  if (TOKEN && payload.token !== TOKEN) return json_({ ok: false, error: 'token inválido' });
  if (payload.action !== 'SYNC_ALL' || !Array.isArray(payload.properties)) return json_({ ok: false });

  const headers = Array.isArray(payload.headers) && payload.headers.length ? payload.headers : Object.keys(payload.properties[0] || { id: '' });
  const rows = payload.properties.map(p =>
    headers.map(h => {
      if (h === 'fotos') return Array.isArray(p.fotos) ? p.fotos.join(';') : p.fotos || '';
      if (h === 'ativo') return p.ativo ? 'SIM' : 'NAO';
      const v = p[h] === undefined || p[h] === null ? '' : p[h];
      // evita que textos começando com = + - @ virem fórmula
      return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v;
    })
  );

  const sheet = getSheet_();
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  return json_({ ok: true, total: rows.length });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
