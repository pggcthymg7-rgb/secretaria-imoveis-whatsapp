const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const LOCAL_CSV_PATH = path.join(__dirname, '..', 'imoveis.csv');
const CSV_HEADERS = ['id', 'tipo', 'setor', 'quartos', 'tamanho_m2', 'valor', 'descricao', 'fotos', 'ativo'];

let cachedProperties = [];
let lastFetchTime = 0;
const CACHE_TTL_MS = 30 * 1000;

/**
 * Converte links do Google Drive (ex: https://drive.google.com/file/d/ID/view)
 * em links diretos de download de imagem para o WhatsApp conseguir enviar.
 */
function normalizeImageUrl(urlOrPath) {
  if (!urlOrPath) return '';
  const trimmed = String(urlOrPath).trim();
  const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch && driveMatch[1]) {
    return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
  }
  return trimmed;
}

/**
 * Limpa valores monetários (ex: "R$ 500.000,00", "500.000", "480000" -> 480000)
 */
function parsePrice(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  let str = String(val).trim();
  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }
  str = str.replace(/[^\d.]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Limpa números inteiros ou decimais (quartos, m2)
 */
function parseNumber(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const str = String(val).replace(',', '.').replace(/[^\d.]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Padroniza o nome do setor (ex: "bueno" -> "Setor Bueno", "setor marista" -> "Setor Marista")
 */
function sanitizeSetor(setor) {
  if (!setor) return '';
  const clean = String(setor).trim().replace(/\s+/g, ' ');
  return clean
    .split(' ')
    .map(w => {
      const lower = w.toLowerCase();
      if (['de', 'da', 'do', 'dos', 'das', 'e'].includes(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * Padroniza um objeto de imóvel garantindo que todos os campos estejam no formato ideal sem risco de erro
 */
function normalizePropertyRecord(row, idx = 0) {
  const id = String(row.id || idx + 1).trim();
  const tipo = String(row.tipo || 'Apartamento').trim();
  const setor = sanitizeSetor(row.setor || row.bairro || row.regiao || '');
  const quartos = Math.round(parseNumber(row.quartos ?? row.qts ?? row.dormitorios));
  const tamanho_m2 = parseNumber(row.tamanho_m2 ?? row.m2 ?? row.tamanho ?? row.area ?? row.metragem);
  const valor = parsePrice(row.valor ?? row.preco);
  const descricao = String(row.descricao || row.detalhes || '').trim();

  let fotos = [];
  if (Array.isArray(row.fotos)) {
    fotos = row.fotos.map(normalizeImageUrl).filter(Boolean);
  } else {
    const rawFotos = String(row.fotos || row.foto || row.imagens || '');
    fotos = rawFotos
      .split(/[;|,]/)
      .map(normalizeImageUrl)
      .filter(Boolean);
  }

  let ativo = true;
  if (typeof row.ativo === 'boolean') {
    ativo = row.ativo;
  } else if (row.ativo !== undefined && row.ativo !== null && String(row.ativo).trim() !== '') {
    const strAtivo = String(row.ativo).trim().toUpperCase();
    ativo = ['SIM', 'S', 'TRUE', '1', 'ATIVO', 'DISPONIVEL'].includes(strAtivo);
  }

  return {
    id,
    tipo,
    setor,
    quartos,
    tamanho_m2,
    valor,
    descricao,
    fotos,
    ativo
  };
}

/**
 * Faz o parse do conteúdo CSV
 */
function parseCsvContent(csvText) {
  if (!csvText || !csvText.trim()) return [];
  const records = parse(csvText, {
    columns: header => header.map(col => col.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')),
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true
  });

  return records
    .map((row, idx) => normalizePropertyRecord(row, idx))
    .filter(item => item.setor || item.descricao);
}

/**
 * Escreve a lista completa de imóveis de volta na planilha CSV local (no formato ideal)
 * e, se o usuário configurou o Webhook do Google Sheets, envia também para o Google Sheets na nuvem!
 */
async function saveAllPropertiesToSpreadsheet(properties) {
  const escapeCsv = (val) => {
    const str = String(val ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""');
    return str.includes(',') || str.includes('"') || str.includes(';') ? `"${str}"` : str;
  };

  const lines = [CSV_HEADERS.join(',')];

  for (const prop of properties) {
    const fotosStr = Array.isArray(prop.fotos) ? prop.fotos.join(';') : String(prop.fotos || '');
    const row = [
      escapeCsv(prop.id),
      escapeCsv(prop.tipo || 'Apartamento'),
      escapeCsv(prop.setor || ''),
      Number(prop.quartos || 0),
      Number(prop.tamanho_m2 || 0),
      Number(prop.valor || 0),
      escapeCsv(prop.descricao || ''),
      escapeCsv(fotosStr),
      prop.ativo ? 'SIM' : 'NAO'
    ];
    lines.push(row.join(','));
  }

  fs.writeFileSync(LOCAL_CSV_PATH, lines.join('\n') + '\n', 'utf-8');
  cachedProperties = properties;
  lastFetchTime = Date.now();

  // Sincronização automática com Google Sheets via Apps Script Webhook (se configurado)
  const webhookUrl = (process.env.GOOGLE_SHEETS_WEBHOOK_URL || '').trim();
  if (webhookUrl && webhookUrl.startsWith('https://script.google.com')) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SYNC_ALL', properties })
      });
    } catch (err) {
      console.error('⚠️ Aviso ao sincronizar com Google Sheets Webhook:', err.message);
    }
  }
}

/**
 * Converte uma URL normal do Google Sheets (ex: .../edit#gid=0) em URL de exportação CSV
 */
function normalizeGoogleSheetsUrl(url) {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.includes('/pub?') && trimmed.includes('output=csv')) {
    return trimmed;
  }
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1] && !trimmed.includes('/pub')) {
    const gidMatch = trimmed.match(/gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`;
  }
  return trimmed;
}

/**
 * Carrega TODOS os imóveis da planilha (inclusive os pausados/inativos para exibir no Mini-CRM)
 */
async function loadAllProperties(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedProperties.length > 0 && (now - lastFetchTime < CACHE_TTL_MS)) {
    return cachedProperties;
  }

  // 1. Se tiver Google Sheets CSV configurado E o usuário pedir sincronização externa
  const sheetsUrl = normalizeGoogleSheetsUrl(process.env.GOOGLE_SHEETS_CSV_URL);
  if (sheetsUrl && forceRefresh === 'from_google') {
    try {
      const response = await fetch(sheetsUrl);
      if (response.ok) {
        const csvText = await response.text();
        const imported = parseCsvContent(csvText);
        if (imported.length > 0) {
          await saveAllPropertiesToSpreadsheet(imported);
          return imported;
        }
      }
    } catch (err) {
      console.error('⚠️ Erro ao importar do Google Sheets:', err.message);
    }
  }

  // 2. Carrega da planilha local imoveis.csv (que é mantida em sincronia pelo Mini-CRM)
  if (fs.existsSync(LOCAL_CSV_PATH)) {
    const csvText = fs.readFileSync(LOCAL_CSV_PATH, 'utf-8');
    cachedProperties = parseCsvContent(csvText);
    lastFetchTime = now;
    return cachedProperties;
  }

  return [];
}

/**
 * Carrega apenas os imóveis ATIVOS (disponíveis para venda) para o robô do WhatsApp pesquisar
 */
async function loadInventory(forceRefresh = false) {
  const all = await loadAllProperties(forceRefresh);
  return all.filter(item => item.ativo);
}

/**
 * Adiciona um novo imóvel validado pelo Mini-CRM diretamente na planilha
 */
async function createProperty(rawProp) {
  const all = await loadAllProperties(true);
  const maxId = all.reduce((max, item) => {
    const num = parseInt(item.id, 10);
    return !isNaN(num) && num > max ? num : max;
  }, 0);

  const newProp = normalizePropertyRecord(
    {
      ...rawProp,
      id: rawProp.id || String(maxId + 1),
      ativo: rawProp.ativo !== undefined ? rawProp.ativo : true
    },
    maxId
  );

  all.push(newProp);
  await saveAllPropertiesToSpreadsheet(all);
  return newProp;
}

/**
 * Edita um imóvel existente pelo ID ou alterna seu status (Ativo / Vendido-Pausado)
 */
async function updateProperty(id, updates) {
  const all = await loadAllProperties(true);
  const idx = all.findIndex(item => String(item.id) === String(id));
  if (idx === -1) throw new Error(`Imóvel #${id} não encontrado na planilha.`);

  const merged = {
    ...all[idx],
    ...updates,
    id: String(id)
  };
  all[idx] = normalizePropertyRecord(merged, idx);
  await saveAllPropertiesToSpreadsheet(all);
  return all[idx];
}

/**
 * Remove um imóvel da planilha
 */
async function deleteProperty(id) {
  const all = await loadAllProperties(true);
  const filtered = all.filter(item => String(item.id) !== String(id));
  await saveAllPropertiesToSpreadsheet(filtered);
  return filtered;
}

module.exports = {
  LOCAL_CSV_PATH,
  loadInventory,
  loadAllProperties,
  createProperty,
  updateProperty,
  deleteProperty,
  normalizeGoogleSheetsUrl
};
