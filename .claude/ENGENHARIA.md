# Engenharia — comandos e mapa do código

## Comandos do projeto
- Verificação completa (sintaxe + testes): `npm run verify`
- Só testes: `npm test` (usa pasta temporária — nunca toca na planilha real)
- Rodar local: `PAINEL_SENHA=algumasenha npm start` → http://localhost:3000

## Mapa do código
- `index.js` — única entrada em produção; inicia servidor HTTP, WhatsApp, agendador e multi-tenant.
- `src/web/app.js` — servidor Express (painel + API), igual para admin e corretor (`BIGA_PAPEL=corretor` no contêiner do tenant tira a estrutura do SaaS).
- `src/public/` — frontend SPA (Dala design system: `index.html`, `app.js`, `app.css`, `capas.js`, `biga-art.js`, `fontes-google.json`).
- `src/config/` — infraestrutura e configuração (`paths.js`, `store.js`, `envfile.js`, `settings.js`, `auth.js`, `backup.js`, `metrics.js`, `sistema.js`, `timeutil.js`).
- `src/brain/` — cérebro local: mapa de Goiânia (`gazetteer.js` + `data/mapa-osm.json`), localização (`locations.js`), intérprete de pedidos (`parser.js`), texto (`text.js`) e motor (`engine.js`).
- `src/whatsapp/` — conexão Baileys e roteamento (`client.js`, `reconexao.js`), comandos no "Mensagem para mim" (`assistant.js`), 1ª mensagem/ligações (`atendimento-diario.js`) e memória de contatos (`contacts.js`).
- `src/domain/` — regras de negócio: `matcher.js`, `sheets.js`, `radar.js`, `quem-procura.js`, `anuncios.js`, `vitrine.js`, `prospeccao.js`, `capas.js`, `garimpo.js`, `scheduler.js`.
- `src/integrations/` — APIs externas: Gemini (`gemini/{chave,modelo}.js`) e busca em portais (`busca/{inteligente,anuncio,apify,chaves,curadoria,filtros,guiada,links,serp}.js`).
- `src/pdf/` — gerador A4 (`ficha-a4.js`) e apresentação 16:9 com worker/cache (`deck16x9/*`).
- `src/tenancy/` — multi-tenant em camada de aplicação (`MULTI_TENANT=1` + `ADMIN_TOKEN` ≥ 32): `session-manager.js`, `router.js`, `container.js` (instância isolada dos módulos de `src/` por tenant), `tenant-store.js` (`config.json`, 600), `routes.js` (`/api/equipe` e `/api/conectar-corretor`). Regra: o domínio continua sem saber de tenant; só adapters mudam. `process.exit` de tenant recarrega só ele (timers rastreados + `dispose`). HTTPS de corretor novo: app grava `DATA_DIR/caddy-sincronizar` → systemd → `deploy/caddy-corretores.sh` (root).
- `docs/auditorias/` — relatórios históricos de auditoria técnica e E2E (`RELATORIO_AUDITORIA_FINAL.md`, `RELATORIO_AUDITORIA_FUNCIONAL_E2E.md`).
- Mensagens reais de grupos para regressão: `tests/fixtures-mensagens-reais.js` (sempre adicione novos casos reais aqui).
