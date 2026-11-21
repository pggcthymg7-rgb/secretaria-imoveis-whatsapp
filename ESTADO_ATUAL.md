# ESTADO ATUAL — Memória Ponte (atualizado 20/11/2026)

## 1. Arquitetura
- Node 22 (VM/CI; `engines >=20.9`) + Express 5 + Baileys (WhatsApp não-oficial) + `pdfkit` + `sharp`. Persistência em JSON no `DATA_DIR`.
- VM Oracle grátis. Corretor extra em processo separado (opcional): `deploy/corretores.conf`.
- SaaS multi-tenant num único processo (`MULTI_TENANT=1` em `src/tenancy/`):
  - Admin (João): a BIGA dele + Configurar › Corretores (cadastra, convite, QR, pausa) e exclusividade na atualização do sistema.
  - Corretor: BIGA completa e independente no endereço `<id>.<DOMINIO>`, com login próprio (convite no 1º acesso) e bloqueio das rotas do SaaS no servidor.
  - Laura: já roda dentro da BIGA principal (mesmo endereço, senha, WhatsApp e dados).
- GitHub Pro: PRs protegidas por `CI/testes` (`npm run verify`), `CI/scripts-vm` (ShellCheck), `CodeQL` + `CodeQL/analisar`, `CODEOWNERS` e template de PR. Repo ainda **PÚBLICO** (`visibility: PUBLIC`): para privar, rode antes `deploy/chave-deploy.sh` na VM.
- Cérebro local (`src/brain/`, parser + mapa OSM); Gemini via `fetch` REST nativo (`src/integrations/gemini/`, sem `@google/genai`) reforça apenas nomes de lugares; busca em portais em 3 camadas (`src/integrations/busca/`: Apify, Tavily/Serper/Brave + curadoria Gemini, fallback Gemini + Google).
- Estrutura modular concluída (PRs #60 e #61): backend separado por domínio (`src/{config,web/routes,whatsapp,brain,domain,integrations,pdf,tenancy}`) e frontend SPA em `src/public/js/*` (`window.BIGA`) + `src/public/app.js` roteador enxuto.
- Mapas do código: `MAPA_DO_PROJETO.md` (prático) e `.claude/ENGENHARIA.md` (técnico).

## 2. Status Atual — resumo técnico (10 linhas)
1. Radar, Carteira, match reverso (Quem Procura), Vitrine, Atendimento, Busca Inteligente, Prospecção e Garimpo em produção (2 corretores), validados por auditoria funcional E2E 100% (PR #59).
2. Designer: Fichas PDF 16:9 (5 modelos modulares até 14 páginas + fallback A4) e editor de capas em Canvas (fontes Google + lote) prontos; falta aplicar paleta Biga (`#0D0D0D`/`#FFFFFF`/`#D4AF37`) e `Plus Jakarta Sans`.
3. Painel protegido (senha, HMAC, CSRF, CSP `script-src 'self'`, rate-limit); gate `npm run verify` com 107 arquivos JS e 196 testes + ShellCheck + CodeQL.
4. Custo dominante: Apify (US$ 0,16/busca); limite padrão `buscaLimiteDia: 20` (`src/config/settings.js`) quebra a margem do plano R$ 97.
5. Gemini é chamado em todo pedido `BUSCA` detectado, sem cache nem teto (`src/domain/matcher.js:299-301`).
6. Escala: modo multi-tenant num processo já opera (`src/tenancy/`), mas sessões Baileys + contêineres VM + caches JSON em memória ainda pressionam a RAM da VM grátis em dezenas/centenas de corretores.
7. JSON reescrito inteiro por gravação (`src/config/store.js`); sem consulta entre corretores → bloqueia CRM/Ranking.
8. Proposta: Postgres + PostGIS multi-tenant (RLS) com `pedidos`/`anuncios`/`imoveis`/`matches`/`eventos_merito`/`condominios`.
9. Dedup global de mensagens de grupo (hash) evita processar o mesmo pedido N vezes.
10. Próximo passo sugerido: tetos por plano + cache Gemini (Fase 1), depois migração para Postgres (Fase 2).
