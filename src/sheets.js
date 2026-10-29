const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const LOCAL_CSV_PATH = path.join(__dirname, '..', 'imoveis.csv');
const CSV_HEADERS = [
  'id',
  'tipo',
  'setor',
  'regiao',
  'mobiliado',
  'quartos',
  'tamanho_m2',
  'valor',
  'descricao',
  'fotos',
  'ativo'
];

let cachedProperties = [];
let lastFetchTime = 0;
const CACHE_TTL_MS = 30 * 1000;

/**
 * Mapa inteligente de Setores -> Regiões (ex: Goiânia e Região) para que
 * se a pessoa pedir "na região sul" mesmo quando você só preencheu o Setor,
 * o sistema já saiba a região automaticamente!
 */
const SETOR_TO_REGIAO_MAP = {
  'regiao sul': [
    'setor bueno', 'bueno', 'setor marista', 'marista', 'setor bela vista', 'bela vista',
    'jardim america', 'parque amazonia', 'setor pedro ludovico', 'pedro ludovico',
    'jardim goias', 'alto da gloria', 'nova suica', 'setor nova suica', 'serrinha',
    'setor serrinha', 'vila rosa', 'jardim atlantico', 'alphaville', 'portal do sol',
    'jardins valencia', 'jardins verona', 'jardins milao', 'jardins parma', 'jardins paris',
    'jardins atenas', 'jardins lisboa', 'jardins madri', 'jardins monaco', 'vila redencao',
    'parque atheneu', 'jardim da luz', 'jardim maria inez', 'vila maria', 'areiao'
  ],
  'regiao sudoeste': [
    'setor sudoeste', 'sudoeste', 'cidade jardim', 'eldorado', 'parque oeste',
    'parque oeste industrial', 'jardim europa', 'vila alps', 'jardim vila boa',
    'residencial eldorado', 'celina park', 'novo horizonte', 'faicalville',
    'setor faicalville', 'jardim presidente', 'jardim planalto', 'vila maua',
    'residencial granville', 'jardins viena', 'jardim ana lucia', 'recreio dos bandeirantes',
    'garavelo', 'jardim marques de abreu'
  ],
  'regiao oeste': [
    'setor oeste', 'oeste', 'setor aeroviario', 'aeroviario', 'campinas', 'setor campinas',
    'setor coimbra', 'coimbra', 'setor castelo branco', 'castelo branco',
    'setor dos funcionarios', 'vila canaa', 'capuava', 'ipiranga', 'jardim petropolis'
  ],
  'regiao central': [
    'setor central', 'centro', 'setor sul', 'setor aeroporto', 'aeroporto',
    'setor universitario', 'universitario', 'leste universitario', 'setor leste universitario',
    'vila nova', 'setor vila nova', 'setor marechal rondon', 'norte ferroviario',
    'setor norte ferroviario', 'centro oeste', 'setor centro oeste', 'crimeia oeste', 'crimeia leste'
  ],
  'regiao norte': [
    'setor jao', 'jao', 'setor santa genoveva', 'santa genoveva', 'setor urias magalhaes',
    'urias magalhaes', 'passeio das aguas', 'jardim guanabara', 'vila itatiaia',
    'goiania 2', 'goiania ii', 'setor negrao de lima', 'negrao de lima', 'aldeia do vale',
    'jardim balneario meia ponte', 'residencial humaita', 'vila nova canaa'
  ],
  'regiao leste': [
    'jardim novo mundo', 'novo mundo', 'agua branca', 'setor leste vila nova', 'riviera',
    'parque flamboyant', 'flamboyant', 'aruana', 'jardim brasil', 'jardim california'
  ]
};

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
 * Deduz a região automaticamente pelo setor se não tiver sido informada
 */
function inferRegiaoFromSetor(setor, regiaoInformada) {
  if (regiaoInformada && String(regiaoInformada).trim() !== '') {
    return String(regiaoInformada).trim();
  }
  const sNorm = normalizeStr(setor);
  if (!sNorm) return '';

  // Verifica primeiro termos compostos (ex: "parque oeste", "setor sudoeste") antes de termos curtos
  for (const [regKey, setores] of Object.entries(SETOR_TO_REGIAO_MAP)) {
    const sorted = [...setores].sort((a, b) => b.length - a.length);
    if (sorted.some(st => hasExactTerm(sNorm, st))) {
      const label = regKey.replace('regiao ', '');
      return 'Região ' + label.charAt(0).toUpperCase() + label.slice(1);
    }
  }
  return '';
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

/**
 * Padroniza um objeto de imóvel garantindo que todos os campos (incluindo regiao e mobiliado) estejam no formato ideal
 */
function normalizePropertyRecord(row, idx = 0) {
  const id = String(row.id || idx + 1).trim();
  const tipo = String(row.tipo || 'Apartamento').trim();
  const setor = sanitizeSetor(row.setor || row.bairro || '');
  const descricao = String(row.descricao || row.detalhes || '').trim();
  const regiao = inferRegiaoFromSetor(setor, row.regiao);
  const mobiliado = inferMobiliado(row.mobiliado, descricao);
  const quartos = Math.round(parseNumber(row.quartos ?? row.qts ?? row.dormitorios));
  const tamanho_m2 = parseNumber(row.tamanho_m2 ?? row.m2 ?? row.tamanho ?? row.area ?? row.metragem);
  const valor = parsePrice(row.valor ?? row.preco);

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
    regiao,
    mobiliado,
    quartos,
    tamanho_m2,
    valor,
    descricao,
    fotos,
    ativo
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
      escapeCsv(prop.regiao || ''),
      escapeCsv(prop.mobiliado || 'NAO'),
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
      id: rawProp.id || String(maxId + 1),
      ativo: rawProp.ativo !== undefined ? rawProp.ativo : true
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

async function deleteProperty(id) {
  const all = await loadAllProperties(true);
  const filtered = all.filter(item => String(item.id) !== String(id));
  await saveAllPropertiesToSpreadsheet(filtered);
  return filtered;
}

module.exports = {
  LOCAL_CSV_PATH,
  SETOR_TO_REGIAO_MAP,
  loadInventory,
  loadAllProperties,
  createProperty,
  updateProperty,
  deleteProperty,
  saveAllPropertiesToSpreadsheet,
  normalizeGoogleSheetsUrl
};
