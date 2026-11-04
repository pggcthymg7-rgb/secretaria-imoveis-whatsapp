const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const { CSV_PATH } = require('./paths');
const { BASE } = require('./brain/locations');

const LOCAL_CSV_PATH = CSV_PATH;
const CSV_HEADERS = [
  'id',
  'tipo',
  'negociacao',
  'edificio',
  'setor',
  'cidade',
  'regiao',
  'mobiliado',
  'quartos',
  'suites',
  'vagas',
  'tamanho_m2',
  'area_terreno',
  'valor',
  'valor_agio',
  'condominio',
  'idade_anos',
  'aceita_permuta',
  'aceita_financiamento',
  'lazer',
  'caracteristicas',
  'descricao',
  'fotos',
  'ativo',
  'atualizado_em'
];

let cachedProperties = [];
let lastFetchTime = 0;
const CACHE_TTL_MS = 30 * 1000;
let writeQueue = Promise.resolve();

function normalizeStr(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function escapeRegexStr(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasExactTerm(textNorm, termNorm) {
  if (!textNorm || !termNorm) return false;
  const rx = new RegExp(`(?:^|\\b)${escapeRegexStr(termNorm)}(?:\\b|$)`, 'i');
  return rx.test(textNorm);
}

/**
 * Deduz a região automaticamente pelo bairro (usando o Mapa de Goiânia do cérebro)
 */
function inferRegiaoFromSetor(setor, regiaoInformada) {
  if (regiaoInformada && String(regiaoInformada).trim() !== '') {
    return String(regiaoInformada).trim();
  }
  const sNorm = normalizeStr(setor);
  if (!sNorm) return '';
  const sorted = BASE.bairros
    .flatMap(b => b.aliases.map(a => ({ a: normalizeStr(a), b })))
    .sort((x, y) => y.a.length - x.a.length);
  const hit = sorted.find(({ a }) => a.length >= 4 && hasExactTerm(sNorm, a));
  return hit ? `Região ${hit.b.region}` : '';
}

/**
 * Deduz se o imóvel é mobiliado ou semimobiliado olhando também na descrição caso a coluna esteja vazia
 */
function inferMobiliado(mobiliadoVal, descricao) {
  const mNorm = normalizeStr(mobiliadoVal);
  if (mNorm === 'sim' || mNorm === 'mobiliado' || mNorm === '100% mobiliado' || mNorm === 'porteira fechada') {
    return 'SIM';
  }
  if (mNorm === 'semi' || mNorm === 'semimobiliado' || mNorm === 'armarios') {
    return 'SEMI';
  }
  if (mNorm === 'nao' || mNorm === 'sem mobilia' || mNorm === 'vazio') {
    return 'NAO';
  }

  // Se não foi preenchido explicitamente, analisa a descrição do imóvel na carteira!
  const descNorm = normalizeStr(descricao);
  if (/\b(mobiliado|mobiliada|porteira fechada|decorado e mobiliado|todo mobiliado|100% mobiliado)\b/.test(descNorm)) {
    return 'SIM';
  }
  if (/\b(semimobiliado|semi-mobiliado|semi mobiliado|rico em armarios|completo em armarios|armarios planejados)\b/.test(descNorm)) {
    return 'SEMI';
  }
  return 'NAO';
}

function normalizeImageUrl(urlOrPath) {
  if (!urlOrPath) return '';
  const trimmed = String(urlOrPath).trim();
  const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch && driveMatch[1]) {
    return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
  }
  return trimmed;
}

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

function parseNumber(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const str = String(val).replace(',', '.').replace(/[^\d.]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

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

function cleanYesNo(v) {
  const n = normalizeStr(v);
  if (['sim', 's', 'true', '1', 'aceita'].includes(n)) return 'SIM';
  if (['nao', 'n', 'false', '0'].includes(n)) return 'NAO';
  return '';
}

function cleanNegociacao(v) {
  const n = normalizeStr(v);
  if (/agio/.test(n)) return 'AGIO';
  if (/alug|loca/.test(n)) return /venda/.test(n) ? 'VENDA_ALUGUEL' : 'ALUGUEL';
  return 'VENDA';
}

function cleanText(v, max = 4000) {
  return String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

function optionalNumber(v) {
  if (v === undefined || v === null || String(v).trim() === '') return '';
  const n = parseNumber(v);
  return n || n === 0 ? n : '';
}

/**
 * Referência de foto segura: URL http(s) ou apenas o NOME do arquivo dentro de /fotos
 * (impede caminhos como ../../.env)
 */
function sanitizePhotoRef(ref) {
  const r = normalizeImageUrl(ref);
  if (!r) return '';
  if (/^https?:\/\//i.test(r)) return r.slice(0, 600);
  return path.basename(r).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

/**
 * Padroniza um objeto de imóvel garantindo que todos os campos estejam no formato ideal
 */
function normalizePropertyRecord(row, idx = 0) {
  const id = String(row.id || idx + 1).trim().replace(/[^0-9A-Za-z_-]/g, '').slice(0, 20) || String(idx + 1);
  const tipo = cleanText(row.tipo || 'Apartamento', 40);
  const setor = sanitizeSetor(cleanText(row.setor || row.bairro || '', 80));
  const descricao = cleanText(row.descricao || row.detalhes || '', 60000); // descrição completa (vai inteira para a vitrine)
  const regiao = inferRegiaoFromSetor(setor, row.regiao);
  const mobiliado = inferMobiliado(row.mobiliado, descricao);
  const quartos = Math.round(parseNumber(row.quartos ?? row.qts ?? row.dormitorios));
  const tamanho_m2 = parseNumber(row.tamanho_m2 ?? row.m2 ?? row.tamanho ?? row.area ?? row.metragem);
  const valor = parsePrice(row.valor ?? row.preco);

  let fotos = [];
  if (Array.isArray(row.fotos)) {
    fotos = row.fotos.map(sanitizePhotoRef).filter(Boolean);
  } else {
    const rawFotos = String(row.fotos || row.foto || row.imagens || '');
    fotos = rawFotos
      .split(/[;|]|,(?=\s*(?:https?:|[\w-]+\.(?:jpe?g|png|webp)))/i)
      .map(sanitizePhotoRef)
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
    negociacao: cleanNegociacao(row.negociacao),
    edificio: cleanText(row.edificio || row.condominio_nome || row.empreendimento || '', 80),
    setor,
    cidade: cleanText(row.cidade || 'Goiânia', 60) || 'Goiânia',
    regiao,
    mobiliado,
    quartos,
    suites: optionalNumber(row.suites),
    vagas: optionalNumber(row.vagas),
    tamanho_m2,
    area_terreno: optionalNumber(row.area_terreno),
    valor,
    valor_agio: row.valor_agio !== undefined && String(row.valor_agio).trim() !== '' ? parsePrice(row.valor_agio) : '',
    condominio: row.condominio !== undefined && String(row.condominio).trim() !== '' ? parsePrice(row.condominio) : '',
    idade_anos: optionalNumber(row.idade_anos),
    aceita_permuta: cleanYesNo(row.aceita_permuta),
    aceita_financiamento: cleanYesNo(row.aceita_financiamento),
    lazer: cleanYesNo(row.lazer),
    caracteristicas: cleanText(row.caracteristicas || '', 500),
    descricao,
    fotos: fotos.slice(0, 20),
    ativo,
    atualizado_em: cleanText(row.atualizado_em || '', 30)
  };
}

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

function escapeCsv(val) {
  let str = String(val ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""');
  // evita injeção de fórmula ao abrir o CSV no Excel/Sheets
  if (/^[=+\-@]/.test(str) && !/^-?\d/.test(str)) str = `'${str}`;
  return /[,";]/.test(str) ? `"${str}"` : str;
}

function serializeCsv(properties) {
  const lines = [CSV_HEADERS.join(',')];
  for (const prop of properties) {
    const row = CSV_HEADERS.map(h => {
      if (h === 'fotos') return escapeCsv(Array.isArray(prop.fotos) ? prop.fotos.join(';') : String(prop.fotos || ''));
      if (h === 'ativo') return prop.ativo ? 'SIM' : 'NAO';
      return escapeCsv(prop[h]);
    });
    lines.push(row.join(','));
  }
  return lines.join('\n') + '\n';
}

async function saveAllPropertiesToSpreadsheet(properties) {
  const job = writeQueue.then(async () => {
    const tmp = `${LOCAL_CSV_PATH}.tmp`;
    fs.writeFileSync(tmp, serializeCsv(properties), 'utf-8');
    fs.renameSync(tmp, LOCAL_CSV_PATH);
    cachedProperties = properties;
    lastFetchTime = Date.now();

    const webhookUrl = (process.env.GOOGLE_SHEETS_WEBHOOK_URL || '').trim();
    if (webhookUrl && webhookUrl.startsWith('https://script.google.com/')) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'SYNC_ALL', headers: CSV_HEADERS, properties, token: process.env.GOOGLE_SHEETS_TOKEN || '' }),
          signal: AbortSignal.timeout(15000)
        });
      } catch (err) {
        console.error('⚠️ Aviso ao sincronizar com Google Sheets Webhook:', err.message);
      }
    }
  });
  writeQueue = job.catch(() => {});
  return job;
}

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

async function loadAllProperties(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedProperties.length > 0 && (now - lastFetchTime < CACHE_TTL_MS)) {
    return cachedProperties;
  }

  const sheetsUrl = normalizeGoogleSheetsUrl(process.env.GOOGLE_SHEETS_CSV_URL);
  if (sheetsUrl && forceRefresh === 'from_google') {
    try {
      const response = await fetch(sheetsUrl, { signal: AbortSignal.timeout(15000) });
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

  if (fs.existsSync(LOCAL_CSV_PATH)) {
    const csvText = fs.readFileSync(LOCAL_CSV_PATH, 'utf-8');
    cachedProperties = parseCsvContent(csvText);
    lastFetchTime = now;
    return cachedProperties;
  }

  return [];
}

async function loadInventory(forceRefresh = false) {
  const all = await loadAllProperties(forceRefresh);
  return all.filter(item => item.ativo);
}

async function createProperty(rawProp) {
  const all = await loadAllProperties(true);
  const maxId = all.reduce((max, item) => {
    const num = parseInt(item.id, 10);
    return !isNaN(num) && num > max ? num : max;
  }, 0);

  const newProp = normalizePropertyRecord(
    {
      ...rawProp,
      id: String(maxId + 1),
      ativo: rawProp.ativo !== undefined ? rawProp.ativo : true,
      atualizado_em: new Date().toISOString()
    },
    maxId
  );

  all.push(newProp);
  await saveAllPropertiesToSpreadsheet(all);
  return newProp;
}

async function updateProperty(id, updates) {
  const all = await loadAllProperties(true);
  const idx = all.findIndex(item => String(item.id) === String(id));
  if (idx === -1) {
    const e = new Error(`Imóvel #${id} não encontrado na planilha.`);
    e.status = 404;
    throw e;
  }

  const merged = {
    ...all[idx],
    ...updates,
    id: String(id),
    atualizado_em: new Date().toISOString()
  };
  all[idx] = normalizePropertyRecord(merged, idx);
  await saveAllPropertiesToSpreadsheet(all);
  return all[idx];
}

async function deleteProperty(id) {
  const all = await loadAllProperties(true);
  const filtered = all.filter(item => String(item.id) !== String(id));
  await saveAllPropertiesToSpreadsheet(filtered);
  return filtered;
}

async function getPropertyById(id) {
  const all = await loadAllProperties();
  return all.find(p => String(p.id) === String(id)) || null;
}

module.exports = {
  LOCAL_CSV_PATH,
  CSV_HEADERS,
  getPropertyById,
  normalizePropertyRecord,
  parseCsvContent,
  serializeCsv,
  sanitizePhotoRef,
  loadInventory,
  loadAllProperties,
  createProperty,
  updateProperty,
  deleteProperty,
  saveAllPropertiesToSpreadsheet,
  normalizeGoogleSheetsUrl
};
