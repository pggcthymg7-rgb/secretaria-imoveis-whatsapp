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
  - `src/public/studio-core.js` (`window.BIGA_STUDIO`) — Motor Konva.js v9 (Schema JSON v1), 10 tipos de camada (`foto`, `texto`, `retangulo`, `circulo`, `linha`, `degrade`, `poligono` 4pt, `icone`, `logo`, `qrcode`), 22 tokens inteligentes (`CAMPOS_INTELIGENTES`), 23 ícones vetoriais (`ICONES_SVG`), 1.800+ fontes Google, roda de cores HSV, serialização com matriz lógica 1:1 (`getAbsoluteTransform(contentLayer)`) e telemetria tipográfica, miniaturas `data:image/png` (`renderizarMiniaturaCanvas`), blindagem touch mobile e UI estilo Canva/Adobe Express.
  - `src/public/studio.css` — Estilização Desktop (`>= 900px` rail + painel grafite + palco + barra contextual + filmstrip) e Mobile (`< 900px` topbar vidro fosco + palco + barra inferior + bottom sheet `[data-allow-scroll]`), Modo Apresentação (`.studio-pres`), modais Kit/Exportar.
  - `src/public/vendor/konva.min.js` — Konva v9.3.18 vendorizado localmente (`script-src 'self'`).
  - `src/public/fontes-google.json` — Metadados de famílias e pesos do Google Fonts.

- 🕸️ **UI / Painel SPA**
  - `src/public/index.html` — Casca HTML e ordem de carregamento (`app.css`, `studio.css`, `biga-art.js`, `konva.min.js`, `studio-core.js`, `capas.js`, `js/*.js`, `app.js`).
  - `src/public/app.css` — Design System BIGA ("Mercury — Alpine banking at blue hour"): tokens `--color-onyx-canvas`, `--color-graphite-card`, `--color-obsidian-button`, `--color-cobalt`, `--color-ivory-text`, `--color-ash-text`, `--font-ui`, `--font-display`, `--r-card`, `--r-pill`, `--r-nav`.
  - `src/public/app.js` — Roteador SPA (`views` em `Map`) e delegação de eventos.
  - `src/public/capas.js` — Editor unificado de Capas & Carrossel sobre `BIGA_STUDIO` (`feed 1080×1350`, `quadrado 1080×1080`, `story 1080×1920`, até 10 slides, 12 modelos sofisticados, exportação JPG/PNG e geração em lote).
  - `src/public/js/` — Módulos de tela: `core.js`, `ui.js`, `inicio.js`, `dia.js`, `carteira.js`, `vitrine.js`, `pdf.js` (Estúdio PDF 16:9 Konva), `busca.js`, `clientes.js`, `config.js`.

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
- *Motor Híbrido Vetorial 1:1 (`gerarDeCena`, Modo A/B, perspectiva), Cenas Preset 5×2 e Cache de Fontes Google 3 níveis* ➔ `src/pdf/deck16x9/{gerar,motor,cenas,cache-fontes,icones,worker}.js`
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
