/**
 * ============================================================================
 * LEITOR DE ANÚNCIO (Camada 2, passo 1.5) — grátis e sem limite de uso
 * ============================================================================
 * A busca (Serper/Tavily/Brave) acha os LINKS; aqui lemos os DADOS e julgamos o pedido sem IA:
 *  - OLX: abre a página pública do anúncio (1 por link achado, no máx. 15 por busca) e lê os dados
 *    estruturados que a própria página traz: preço, m², quartos, vagas, bairro e se o anunciante é
 *    profissional ou particular (campo `professionalAd` — não é estimativa).
 *  - ZAP / VivaReal: bloqueiam leitura automática (403), então usamos só o que o endereço do anúncio
 *    já diz: transação (venda/aluguel), tipo, quartos, m² e — no VivaReal — o preço (RS1399000).
 * Nada daqui inventa dado: o que não foi lido fica vazio (0) e o anúncio vai para conferência.
 * Segurança: só busca endereços https de anúncio OLX que a própria busca devolveu (lista fechada),
 * sem seguir redirecionamento, com limite de tempo, de tamanho e de simultaneidade.
 * ============================================================================
 */
const { normalize } = require('./brain/text');

const UA = 'BIGA-secretaria-imoveis/1.0 (leitura de anuncio publico; contato do corretor)';
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_PAGINAS = 15;
const SIMULTANEAS = 4;

const num = v => {
  const n = Number(String(v == null ? '' : v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const primeiro = (txt, re) => {
  const m = String(txt).match(re);
  return m ? m[1] : '';
};

function tipoDoTexto(t) {
  const n = normalize(t);
  if (/\b(apartamento|apto|flat|cobertura|studio|kitnet|loft)\b/.test(n)) return 'apartamento';
  if (/\b(casa|sobrado)\b/.test(n)) return 'casa';
  if (/\b(terreno|lote)\b/.test(n)) return 'terreno';
  if (/\b(sala|conjunto comercial|loja|galpao)\b/.test(n)) return 'comercial';
  return '';
}

/** Dados que o ENDEREÇO do anúncio já traz (ZAP, VivaReal e OLX) */
function lerEndereco(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return {};
  }
  const s = normalize(u.pathname.replace(/[-_/]+/g, ' '));
  const d = {};
  const venda = /\bvenda\b/.test(s);
  const aluguel = /\balugue?l\b/.test(s);
  if (venda || aluguel) d.transacao = venda && aluguel ? 'AMBOS' : venda ? 'VENDA' : 'ALUGUEL';
  d.tipo = tipoDoTexto(s);
  const q = primeiro(s, /\b(\d{1,2}) quartos?\b/);
  if (q) d.quartos = Number(q);
  const a = primeiro(s, /\b(\d{2,4}) ?m2\b/);
  if (a) d.area = Number(a);
  const p = primeiro(u.pathname, /RS(\d{5,9})(?=[-/]|$)/i);
  if (p) d.preco = Number(p);
  return d;
}

/** Dados estruturados da PÁGINA do anúncio na OLX (campos do JSON da própria página) */
function lerPaginaOlx(html) {
  const h = String(html || '');
  if (!/"price":"\d+"/.test(h) && !/"professionalAd":/.test(h)) return null;
  const prof = primeiro(h, /"professionalAd":(true|false)/);
  const titulo = primeiro(h, /<title>([^<]{5,200})<\/title>/).replace(/\s*\|\s*OLX.*$/i, '');
  const desc = primeiro(h, /"@type":"Product","name":"[^"]*","url":"[^"]*","description":"((?:[^"\\]|\\.){0,1500})"/);
  const texto = `${titulo} ${desc}`.replace(/<br\s*\/?>/gi, ' ');
  const suites = primeiro(normalize(texto), /\b(\d{1,2}) suites?\b/);
  const tipoOlx = primeiro(h, /"real_estate_type":"([^"]*)"/);
  return {
    preco: num(primeiro(h, /"price":"(\d+)"/)),
    area: num(primeiro(h, /"size":(\d+)/)),
    quartos: num(primeiro(h, /"rooms":"(\d+)"/)),
    banheiros: num(primeiro(h, /"bathrooms":"(\d+)"/)),
    vagas: num(primeiro(h, /"garage_spaces":"(\d+)"/)),
    suites: suites ? Number(suites) : 0,
    bairro: primeiro(h, /"neighbourhood":"([^"]*)"/),
    cidade: primeiro(h, /"municipality":"([^"]*)"/),
    anunciante: primeiro(h, /"sellerName":"([^"]*)"/).slice(0, 80),
    profissional: prof === '' ? null : prof === 'true',
    tipo: tipoDoTexto(tipoOlx || titulo),
    transacao: /^venda/i.test(tipoOlx) ? 'VENDA' : /^alugu/i.test(tipoOlx) ? 'ALUGUEL' : '',
    titulo: titulo.slice(0, 140)
  };
}

/**
 * Julga os dados contra o pedido (mesmas tolerâncias de `dentroDoPedido`: ±5% no preço/área).
 * Só reprova com dado LIDO; dado ausente nunca reprova. Retorna { ok, motivo, conferir:[…] }.
 */
function avaliar(d, c) {
  const conferir = [];
  if (d.transacao && d.transacao !== 'AMBOS' && c.transacao && d.transacao !== c.transacao) return { ok: false, motivo: `é ${d.transacao.toLowerCase()}` };
  const tipos = (c.tipos || []).map(tipoDoTexto).filter(Boolean);
  if (d.tipo && tipos.length && !tipos.includes(d.tipo)) return { ok: false, motivo: `é ${d.tipo}` };
  if (d.cidade && c.local && c.local.cidades && c.local.cidades.length && !c.local.cidades.some(x => normalize(x) === normalize(d.cidade))) return { ok: false, motivo: `cidade ${d.cidade}` };
  const bairros = (c.local && !c.local.condominios.length && !c.local.edificios.length && c.local.bairros) || [];
  if (d.bairro && bairros.length) {
    const b = normalize(d.bairro);
    if (!bairros.some(x => { const n = normalize(typeof x === 'string' ? x : x.name); return n && (b.includes(n) || n.includes(b)); })) return { ok: false, motivo: `bairro ${d.bairro}` };
  }
  if (d.preco) {
    if (c.valor_max && d.preco > c.valor_max * 1.05) return { ok: false, motivo: 'acima do valor' };
    if (c.valor_min && d.preco < c.valor_min * 0.95) return { ok: false, motivo: 'abaixo do valor' };
  } else if (c.valor_min || c.valor_max) conferir.push('preço');
  if (d.area) {
    if (c.area_min && d.area < c.area_min * 0.95) return { ok: false, motivo: 'área menor' };
    if (c.area_max && d.area > c.area_max * 1.05) return { ok: false, motivo: 'área maior' };
  }
  if (c.quartos_min) {
    if (d.quartos && d.quartos < c.quartos_min) return { ok: false, motivo: 'poucos quartos' };
    if (!d.quartos) conferir.push('quartos');
  }
  if (c.suites_min) {
    if (d.suites && d.suites < c.suites_min) return { ok: false, motivo: 'poucas suítes' };
    if (!d.suites) conferir.push('suítes');
  }
  if (c.vagas_min) {
    if (d.vagas && d.vagas < c.vagas_min) return { ok: false, motivo: 'poucas vagas' };
    if (d.vagas == null || d.vagas === 0) conferir.push('vagas');
  }
  return { ok: true, conferir };
}

/** Só endereços de ANÚNCIO da OLX, https, host da OLX (nunca um endereço qualquer vindo da resposta) */
function urlLegivel(url, { portalDaUrl, ehPaginaDeAnuncio }) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && portalDaUrl(url) === 'olx.com.br' && ehPaginaDeAnuncio(url);
  } catch {
    return false;
  }
}

async function baixarPagina(url, fetcher) {
  const r = await fetcher(url, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'pt-BR,pt;q=0.9' }, redirect: 'manual', signal: AbortSignal.timeout(12000) });
  if (!r.ok) return { erro: `HTTP ${r.status}` };
  const len = Number(r.headers && r.headers.get && r.headers.get('content-length'));
  if (len > MAX_BYTES) return { erro: 'página grande demais' };
  const html = await r.text();
  return { html: html.length > MAX_BYTES ? html.slice(0, MAX_BYTES) : html };
}

/**
 * Lê os dados de cada link do catálogo e julga o pedido.
 * Retorna { decididos:[{cat, dados, tipoExato}], aCurar:[cat com conteudo enriquecido], descartados:n, lidas:n, falhas:n }
 *  - decididos: dados lidos da PÁGINA (OLX) e que atendem ao pedido (a IA nem precisa olhar)
 *  - aCurar: sobra (ZAP/VivaReal, ou OLX que não abriu) com o que o endereço já diz; reprovados pelo endereço saem
 *  - descartados: reprovados com dado lido (não aparecem nem em "outras páginas")
 */
async function lerAnuncios({ catalogo, criterios, fetcher = fetch, portalDaUrl, ehPaginaDeAnuncio, abrirPaginas = true }) {
  const out = { decididos: [], aCurar: [], descartados: new Set(), lidas: 0, falhas: 0 };
  const paraLer = abrirPaginas ? catalogo.filter(x => urlLegivel(x.url, { portalDaUrl, ehPaginaDeAnuncio })).slice(0, MAX_PAGINAS) : [];
  const paginas = new Map();
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(SIMULTANEAS, paraLer.length) }, async () => {
      while (i < paraLer.length) {
        const cat = paraLer[i++];
        try {
          const b = await baixarPagina(cat.url, fetcher);
          const d = b.html ? lerPaginaOlx(b.html) : null;
          if (d) {
            paginas.set(cat.id, d);
            out.lidas++;
          } else out.falhas++;
        } catch {
          out.falhas++;
        }
      }
    })
  );
  for (const cat of catalogo) {
    const doEndereco = lerEndereco(cat.url);
    const pagina = paginas.get(cat.id);
    const dados = pagina ? { ...doEndereco, ...Object.fromEntries(Object.entries(pagina).filter(([, v]) => v !== '' && v !== null && v !== 0)), vagas: pagina.vagas, fonte: 'pagina' } : { ...doEndereco, fonte: 'endereco' };
    const av = avaliar(dados, criterios);
    if (!av.ok) {
      out.descartados.add(cat.id);
      continue;
    }
    if (pagina) out.decididos.push({ cat, dados, conferir: av.conferir, tipoExato: pagina.profissional === null ? '' : pagina.profissional ? 'profissional' : 'particular' });
    else {
      const fatos = [dados.transacao && dados.transacao.toLowerCase(), dados.tipo, dados.quartos && `${dados.quartos} quartos`, dados.area && `${dados.area} m²`, dados.preco && `R$ ${dados.preco} (preço no endereço)`].filter(Boolean).join(', ');
      out.aCurar.push({ ...cat, conteudo: `${fatos ? `[do endereço: ${fatos}] ` : ''}${cat.conteudo || ''}`.slice(0, 560), dadosEndereco: dados });
    }
  }
  return out;
}

module.exports = { lerEndereco, lerPaginaOlx, avaliar, lerAnuncios, urlLegivel, tipoDoTexto };
