# ESTADO ATUAL — Memória Ponte (atualizado 13/11/2026)

## 1. Arquitetura
- Node 20 + Express + Baileys (WhatsApp não-oficial) + pdfkit. Persistência em JSON no `DATA_DIR`.
- VM Oracle grátis. Corretor extra com processo próprio (opcional): `deploy/corretores.conf`.
- NOVO (13/11/2026) — SaaS multi-tenant num processo só (`MULTI_TENANT=1`):
  - Admin (João): a BIGA dele + Configurar › Corretores (cadastra, convite, QR, pausa). Só ele atualiza o sistema.
  - Corretor: BIGA completa e independente no endereço `<id>.<DOMINIO>`, com login próprio (convite no 1º acesso). Não acessa a estrutura do SaaS (bloqueio no servidor).
  - Laura: já roda dentro da BIGA principal (mesmo endereço, senha, WhatsApp e dados).
  - GitHub Pro: CI barra PR com teste falhando ou script da VM com aviso (ShellCheck); CODEOWNERS e modelo de PR. Repo ainda PÚBLICO: para privar, rode antes `deploy/chave-deploy.sh` na VM.
- Cérebro local (parser + mapa OSM); Gemini só reforça localização; Apify/Serper para portais.
- Engenharia e mapa do código: `.claude/ENGENHARIA.md`.

## 2. Status Atual — resumo técnico (10 linhas)
1. Radar, Carteira, match reverso, Vitrine, Atendimento e Garimpo em produção (2 corretores).
2. Designer: ficha PDF e capas prontas; falta aplicar paleta Biga (#0D0D0D/#FFFFFF/#D4AF37) e Plus Jakarta Sans.
3. Painel protegido (senha, HMAC, CSRF, CSP, rate-limit); `npm run verify` é o gate.
4. Custo dominante: Apify (US$ 0,16/busca); limite padrão 20/dia quebra a margem do plano R$ 97.
5. Gemini é chamado em todo pedido detectado, sem cache nem teto (`src/matcher.js:214`).
6. Escala: 1 processo/corretor ≈ 250 MB → 100 corretores ≈ 25 GB RAM (limite da VM grátis).
7. JSON reescrito inteiro por gravação; sem consulta entre corretores → bloqueia CRM/Ranking.
8. Proposta: Postgres + PostGIS multi-tenant (RLS) com pedidos/anuncios/imoveis/matches/eventos_merito/condominios.
9. Dedup global de mensagens de grupo (hash) evita processar o mesmo pedido N vezes.
10. Próximo passo sugerido: tetos por plano + cache Gemini (Fase 1), depois migração para Postgres.
