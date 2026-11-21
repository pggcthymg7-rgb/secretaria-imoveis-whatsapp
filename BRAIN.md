# 🧠 Cérebro do Projeto — BIGA PropTech (`secretaria-imoveis-whatsapp`)

## 1. Nódulo Central (Core Architecture)
- **Runtime & Backend:** Node.js `>=20.9` (CommonJS), Express 5 (`src/web/app.js`), Baileys (`@whiskeysockets/baileys`), `pdfkit`, `sharp`, `qrcode`, persistência JSON em `DATA_DIR` (`src/config/store.js`).
- **Frontend SPA:** Vanilla JS/CSS sem build step, CSP estrita `script-src 'self'` e `img-src 'self' data: https:`, namespace `window.BIGA` (`src/public/js/core.js`) e motor visual unificado `window.BIGA_STUDIO` (`src/public/studio-core.js` + `src/public/vendor/konva.min.js` v9.3.18).
- **Multi-Tenant:** Isolamento por corretor em camada de aplicação (`MULTI_TENANT=1` em `src/tenancy/`), preservando o domínio agnóstico de tenant.
- **Verificação & Gates:** `npm run check` (`scripts/check.js`), `npm test` (`node --test tests/*.test.js`), `npm run verify`.

---

## 2. A Teia de Ramificações (Knowledge Graph / Modularity)

- 🕸️ **Entrypoints & HTTP API**
  - `index.js` — Inicialização do servidor HTTP, WhatsApp, agendador, multi-tenant e graceful shutdown.
  - `src/web/app.js` — Express app, cabeçalhos CSP/segurança, versionamento `?v=` de `/assets/...` (linha 78), estáticos `/assets` e `/fotos`.
  - `src/web/routes/` — Rotas por domínio: `status.routes.js`, `carteira.routes.js`, `config.routes.js`, `radar.routes.js`, `pdf.routes.js`, `vitrine.routes.js`, `prospeccao.routes.js`, `busca.routes.js`.

- 🕸️ **Studio Core & Konva UI/UX (Design Visual 1:1)**
  - `src/public/studio-core.js` (`window.BIGA_STUDIO`) — Motor Konva.js v9 (Schema JSON v1), 10 tipos de camada (`foto`, `texto`, `retangulo`, `circulo`, `linha`, `degrade`, `poligono` 4pt, `icone`, `logo` com `ocultarSemLogo`, `qrcode`), tokens inteligentes (`{nomeKicker}`, `{nomeDestaque}` + poda de rótulos órfãos), 23 ícones vetoriais (`ICONES_SVG`), 1.800+ fontes Google, gradientes retangulares exatos (5 paradas anti-banding), `Transformer` compensado (~10–11px, 4 cantos em `<90px`), quick-bar acima + 2 alças externas (`↻`, `✥`), barra inferior contextual em 2 modos (Criação 6 itens / Edição + `✓` + mini-painéis compactos), Camadas (`Tudo` / `Em sobreposição` + drag-and-drop), Apresentação no `document.body` (`contain`), Action Sheet `···` no mobile e miniaturas WYSIWYG com fontes pré-carregadas.
  - `src/public/studio.css` — Estilização Desktop (`>= 900px` rail + painel grafite + palco + filmstrip) e Mobile (`< 900px` modo tela cheia `100dvh` sem rolagem, topbar única compacta, Action Sheet inferior, alças flutuantes `↻`/`✥`, barra inferior em 2 modos, mini-sheet `44dvh`, cartões de camadas `>= 56px`, Modo Apresentação `100vw×100dvh`, miniaturas `object-fit: contain`).
  - `src/public/vendor/konva.min.js` — Konva v9.3.18 vendorizado localmente (`script-src 'self'`).
  - `src/public/fontes-google.json` — Metadados de famílias e pesos do Google Fonts.

- 🕸️ **UI / Painel SPA (Navegação Apple HIG)**
  - `src/public/index.html` — Casca HTML com `viewport-fit=cover` e ordem de carregamento (`app.css`, `studio.css`, `biga-art.js`, `konva.min.js`, `studio-core.js`, `capas.js`, `js/*.js`, `app.js`).
  - `src/public/app.css` — Design System BIGA (`#171721` Onyx, `#1e1e2a` Grafite, `#272735` Obsidiana, `#5266eb` Cobalto), Tab Bar inferior fixa 4 itens (`Design`, `Imóveis`, `Clientes`, `Menu`), gaveta `☰`, Bottom Sheet `Estúdio de Design`, menu `#inicio` em cards 2×2 e `body.biga-studio-fullscreen` (`100dvh`) para `#capas`/`#pdf`.
  - `src/public/app.js` — Roteador SPA (`views` em `Map`), toggle `biga-studio-fullscreen`, rastreamento explícito `lastNonStudioRoute` e delegação de eventos.
  - `src/public/capas.js` — Editor de Capas & Carrossel sobre `BIGA_STUDIO` (`4:5`, `1:1`, `9:16`, até 10 slides, **12 modelos fiéis**, exportação JPG/PNG, lote e fallback de tokens com poda de órfãos).
  - `src/public/js/` — Módulos de tela: `core.js`, `ui.js` (Tab Bar HIG, Design Sheet, Gaveta `☰`), `inicio.js` (hero BIGA + grid 2×2), `dia.js`, `carteira.js`, `vitrine.js`, `pdf.js` (Estúdio PDF 16:9 Konva 12 modelos), `busca.js`, `clientes.js`, `config.js`.

- 🕸️ **Domain / Core Logic, PDF & Testes Studio**
  - `src/domain/` — `sheets.js` (carteira CSV), `matcher.js`, `radar.js`, `quem-procura.js`, `vitrine.js`, `capas.js` (modelos + carrossel até 10 slides em `capas.json`), `pdf-modelos.js` (modelos próprios JSON v1 em `pdf_modelos.json`), `prospeccao.js`, `garimpo.js`, `anuncios.js`, `scheduler.js`.
  - `src/brain/` — Parser de pedidos, gazetteer OSM de Goiânia (`parser.js`, `locations.js`, `gazetteer.js`, `engine.js`, `text.js`).
  - `src/pdf/` — `ficha-a4.js` (fallback) e `deck16x9/` (`manager.js`, `gerar.js`, `motor.js`, `modelos.js`, `cenas.js`, `cache-fontes.js`, `cache-fotos.js`, `icones.js`, `kit.js`, `dados.js`, `lock.js`, `worker.js`).
  - `tests/` — Suítes gerais + `studio-pdf-hibrido.test.js` e `studio-capas-carrossel.test.js`.

- 🕸️ **WhatsApp, Integrações & Infra**
  - `src/whatsapp/` — `client.js`, `reconexao.js`, `assistant.js`, `atendimento-diario.js`, `contacts.js`.
  - `src/integrations/` — `gemini/` e `busca/`.
  - `src/config/` — `paths.js`, `store.js`, `auth.js`, `settings.js`, `backup.js`, `envfile.js`, `metrics.js`, `sistema.js`.
  - `src/tenancy/` — `session-manager.js`, `router.js`, `container.js`, `tenant-store.js`, `routes.js`.

---

## 3. Matriz de Roteamento Rápido ("Onde ir em cada situação")
- *Motor Konva, 10 camadas, tokens `{nome}`/`{preco}`, fontes Google, roda de cores, telemetria 1:1* ➔ `src/public/studio-core.js`
- *Layout responsivo Studio (desktop/mobile), blindagem touch e modais* ➔ `src/public/studio.css`
- *Ordem de scripts/CSS e carregamento de Konva/Studio* ➔ `src/public/index.html`
- *CSP, rate limit e versionamento `?v=` de assets estáticos* ➔ `src/web/app.js#L48-L80`
- *Tokens visuais e estilos base do painel BIGA* ➔ `src/public/app.css#L5-L30`
- *Rotas HTTP de PDF 16:9, Kit de Marca, Logo, Modelos e QR* ➔ `src/web/routes/pdf.routes.js`
- *Rotas HTTP de Vitrine e Capas* ➔ `src/web/routes/vitrine.routes.js`
- *Gerenciador de Kit, Fichas 16:9, Precedência (ficha > padrão ★ > kit) e Worker PDFKit* ➔ `src/pdf/deck16x9/manager.js`
- *Motor Híbrido Vetorial 1:1 (`gerarDeCena`, Modo A/B, perspectiva, gradientes exatos), Cenas Preset 12 Modelos Estruturalmente Distintos × 2 Paletas + aliases `A..F` e Cache de Fontes Google* ➔ `src/pdf/deck16x9/{gerar,motor,modelos,cenas,cache-fontes,icones,worker}.js`
- *Modelos Próprios PDF JSON v1 & Backup* ➔ `src/domain/pdf-modelos.js`, `src/config/backup.js`
- *Tela `#pdf` (Estúdio PDF 16:9 Konva)* ➔ `src/public/js/pdf.js`
- *Tela `#capas` (Estúdio Capas, Carrossel 10 slides, 3 formatos e 12 modelos)* ➔ `src/public/capas.js`, `src/domain/capas.js`
- *Testes Studio Unificado (PDF híbrido, cache Google Fonts, Capas/Carrossel 12×3)* ➔ `tests/studio-pdf-hibrido.test.js`, `tests/studio-capas-carrossel.test.js`
- *Testes de segurança frontend (CSP, Prototype Pollution, `esc()`)* ➔ `tests/seguranca-alertas-2.test.js`

---

## 4. Grafo de Relações e Dependências Cruzadas
- `src/web/app.js` ➔ serve `src/public/index.html` com `?v=` nos `/assets/...` ➔ carrega `app.css` + `studio.css` + `vendor/konva.min.js` + `studio-core.js` (`window.BIGA_STUDIO`) + `js/*.js` + `app.js`.
- `src/public/studio-core.js` ➔ lê `/assets/fontes-google.json`, busca QR em `/api/pdf/qr?url=...` (com fallback local), carrega `/fotos/...` e delega persistência/exportação via callbacks `ctx` para `js/pdf.js` (`src/web/routes/pdf.routes.js`) e `capas.js` (`src/web/routes/vitrine.routes.js`).
- `src/public/studio-core.js#serializarCenaComTelemetria` ➔ extrai matriz 1:1 relativa a `contentLayer` + métricas `Konva.Text` (`lines`, `baselineShift`, `textTop`, `textoResolvido`) ➔ enviado por `js/pdf.js` ➔ `pdf.routes.js` ➔ `manager.js` ➔ `worker.js` (Sharp fotos + `cache-fontes.js` 3 níveis) ➔ `gerarDeCena()` (`gerar.js` + `motor.js`).
