/**
 * ============================================================================
 * MEMÓRIA DE ANÚNCIOS DOS GRUPOS (Busca inteligente — parte 1)
 * ============================================================================
 * Guarda os imóveis ANUNCIADOS nos grupos (não os pedidos — esses vão para o Radar)
 * por 90 dias, para a "busca" achar quem tem o imóvel que o cliente quer.
 * Fontes: mensagens ao vivo, histórico pedido ao celular e conversa exportada (.txt/.zip).
 * Fica só no DATA_DIR de cada BIGA; apaga sozinho depois de 90 dias.
 * ============================================================================
 */
const { readJson, writeJson } = require('./store');
const { normalize } = require('./brain/text');
const { detectIntent, detectTipos, detectPrice, detectArea } = require('./brain/parser');

const FILE = 'anuncios.json';
const DIAS = 90;
const MAX = 15000; // ~15 MB no pior caso (VM de 1 GB)
const DIA_MS = 86400000;

let items = readJson(FILE, []);
if (!Array.isArray(items)) items = [];
const ids = new Set(items.map(i => i.id));
let timer = null;

function persist(imediato = false) {
  const gravar = () => {
    timer = null;
    try {
      writeJson(FILE, items);
    } catch (err) {
      console.error('[ANUNCIOS] erro ao salvar:', err.message);
    }
  };
  if (imediato) {
    clearTimeout(timer);
    return gravar();
  }
  if (timer) return;
  timer = setTimeout(gravar, 5000);
  if (timer.unref) timer.unref();
}

function limpar(agora = Date.now()) {
  const limite = agora - DIAS * DIA_MS;
  const antes = items.length;
  items = items.filter(i => i.ts >= limite);
  if (items.length > MAX) items.length = MAX;
  if (items.length !== antes) {
    ids.clear();
    items.forEach(i => ids.add(i.id));
  }
  return antes - items.length;
}

const TEM_IMOVEL = /\b(ap|apto|apartamento|casa|sobrado|imovel|kitnet|studio|flat|lote|terreno|cobertura|sala|chacara|sitio|fazenda|galpao|loja|quartos?|suites?|\d+\s*q)\b/;

/** É anúncio de imóvel? (oferta explícita, ou texto com imóvel + preço + (local ou m²)) */
function pareceAnuncio(texto) {
  const t = String(texto || '');
  if (t.trim().length < 20) return false;
  const norm = normalize(t);
  const intent = detectIntent(norm, t);
  if (intent === 'BUSCA') return false;
  if (!TEM_IMOVEL.test(norm) && !detectTipos(norm).length) return false;
  const area = detectArea(norm);
  const preco = detectPrice(area.textWithoutArea, false);
  const temPreco = Boolean(preco.valor_alvo || preco.valor_max || preco.valor_min);
  if (intent === 'OFERTA') return true;
  return temPreco && Boolean(area.area_min || area.area_max || /\b(setor|jardim|residencial|condominio|bairro|parque|vila)\b/.test(norm));
}

/** Impressão digital para juntar o mesmo imóvel postado em vários grupos */
function impressao(prop) {
  const v = Number(prop.valor) || 0;
  const a = Number(prop.tamanho_m2) || 0;
  return [normalize(prop.tipo), normalize(prop.setor || prop.edificio), v ? Math.round(v / 10000) : '', a ? Math.round(a / 5) : '', prop.quartos || ''].join('|');
}

/**
 * Guarda um anúncio. entry: { id, ts, texto, grupo, grupoId, autor, telefone }
 * Retorna o item guardado (ou null se não é anúncio, repetido ou velho demais).
 */
function registrar(entry) {
  const texto = String(entry.texto || '').trim();
  if (!entry.id || ids.has(entry.id)) return null;
  const ts = Number(entry.ts) || Date.now();
  if (ts < Date.now() - DIAS * DIA_MS) return null;
  if (!pareceAnuncio(texto)) return null;
  const prop = require('./assistant').parsePropertyFromText(texto); // carregado aqui para evitar ciclo de módulos
  delete prop.descricao;
  // metragem como está escrita no anúncio ("110m²"), sem a margem que o cadastro aplica
  const m2 = normalize(texto).match(/\b(\d{2,5}(?:[.,]\d+)?)\s*(?:m2|m²|metros quadrados|metros)\b/);
  if (m2) prop.tamanho_m2 = Math.round(parseFloat(m2[1].replace('.', '').replace(',', '.')));
  const item = {
    id: String(entry.id),
    ts,
    grupo: String(entry.grupo || '').slice(0, 120),
    grupoId: entry.grupoId || '',
    autor: String(entry.autor || 'Corretor(a)').slice(0, 80),
    telefone: String(entry.telefone || '').replace(/\D/g, '').slice(0, 15),
    texto: texto.slice(0, 900),
    prop,
    fp: impressao(prop),
    origem: entry.origem || 'ao vivo'
  };
  items.push(item);
  ids.add(item.id);
  items.sort((a, b) => b.ts - a.ts);
  limpar();
  persist();
  return item;
}

function todos() {
  limpar();
  return items;
}

function resumo() {
  limpar();
  const maisAntigo = items.length ? items[items.length - 1].ts : null;
  return { total: items.length, grupos: new Set(items.map(i => i.grupoId || i.grupo)).size, desde: maisAntigo };
}

// ---------------------------------------------------------------------------
// Conversa exportada do WhatsApp ("Exportar conversa" -> "Sem mídia")
// Android: "03/11/2026 14:05 - Nome: texto"   iOS: "[03/11/2026, 14:05:33] Nome: texto"
// ---------------------------------------------------------------------------
const LINHA = /^‎?\[?(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?\]?\s*(?:-\s*)?([^:]{1,80}?):\s([\s\S]*)$/;

function lerExportacao(conteudo) {
  const msgs = [];
  let atual = null;
  for (const linha of String(conteudo || '').replace(/\r/g, '').split('\n')) {
    const m = linha.match(LINHA);
    if (m) {
      if (atual) msgs.push(atual);
      let [, d, mo, a, h, mi, s, ampm, autor, texto] = m;
      h = Number(h);
      if (ampm === 'PM' && h < 12) h += 12; // exportação em inglês: "1:05 PM"
      if (ampm === 'AM' && h === 12) h = 0;
      a = Number(a) < 100 ? 2000 + Number(a) : Number(a);
      const ts = new Date(a, Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s || 0)).getTime();
      atual = { ts, autor: autor.replace(/^‎/, '').trim(), texto };
    } else if (atual) {
      atual.texto += '\n' + linha;
    }
  }
  if (atual) msgs.push(atual);
  return msgs.filter(x => !/^‎?(<m[ií]dia oculta>|<media omitted>|imagem ocultada|‎?image omitted)/i.test(x.texto.trim()));
}

/** Lê o .zip do iPhone (só o _chat.txt; sem bibliotecas extras) */
function textoDoZip(buf) {
  const zlib = require('zlib');
  // procura o diretório central (fim do arquivo)
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) throw new Error('Arquivo .zip inválido.');
  const total = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  for (let n = 0; n < total && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(p + 10);
    const tamComp = buf.readUInt32LE(p + 20);
    const tamNome = buf.readUInt16LE(p + 28);
    const tamExtra = buf.readUInt16LE(p + 30);
    const tamCom = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.slice(p + 46, p + 46 + tamNome).toString('utf-8');
    if (/\.txt$/i.test(nome)) {
      const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const dados = buf.slice(ini, ini + tamComp);
      if (metodo === 0) return dados.toString('utf-8');
      if (metodo === 8) return zlib.inflateRawSync(dados, { maxOutputLength: 60 * 1024 * 1024 }).toString('utf-8');
      throw new Error('Compactação do .zip não suportada.');
    }
    p += 46 + tamNome + tamExtra + tamCom;
  }
  throw new Error('Não achei a conversa (.txt) dentro do .zip.');
}

/** "Conversa do WhatsApp com GRUPO.txt" / "WhatsApp Chat - GRUPO.zip" -> GRUPO */
function grupoDoArquivo(nome) {
  return String(nome || '')
    .replace(/\.(txt|zip)$/i, '')
    .replace(/^(conversa do whatsapp com|whatsapp chat (with|-)|chat do whatsapp com)\s*/i, '')
    .trim()
    .slice(0, 120) || 'Grupo importado';
}

/** Importa a conversa exportada. Retorna { lidas, anuncios, grupo } */
function importarExportacao(buf, nomeArquivo) {
  if (buf.length > 40 * 1024 * 1024) throw new Error('Arquivo grande demais (máximo 40 MB).');
  const conteudo = buf[0] === 0x50 && buf[1] === 0x4b ? textoDoZip(buf) : buf.toString('utf-8');
  const grupo = grupoDoArquivo(nomeArquivo);
  const msgs = lerExportacao(conteudo);
  let n = 0;
  for (const m of msgs) {
    // hash do texto: duas mensagens diferentes do mesmo autor no mesmo minuto não se confundem
    const id = `exp:${normalize(grupo)}:${m.ts}:${normalize(m.autor)}:${require('crypto').createHash('sha1').update(m.texto).digest('hex').slice(0, 12)}`;
    if (registrar({ id, ts: m.ts, texto: m.texto, grupo, grupoId: `exp:${normalize(grupo)}`, autor: m.autor, telefone: /^\+?\d[\d\s()-]{9,}$/.test(m.autor) ? m.autor : '', origem: 'conversa exportada' })) n++;
  }
  persist(true);
  return { lidas: msgs.length, anuncios: n, grupo };
}

function _reset() {
  items = [];
  ids.clear();
}

module.exports = { registrar, todos, resumo, pareceAnuncio, impressao, lerExportacao, importarExportacao, textoDoZip, grupoDoArquivo, persist, DIAS, _reset };
