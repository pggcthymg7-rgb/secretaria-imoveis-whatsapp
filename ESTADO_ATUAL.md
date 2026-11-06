# ESTADO ATUAL — Memória Ponte (atualizado 06/11/2026)

## 1. Mercado
- Praça piloto: Goiânia-GO (corretores autônomos em grupos de WhatsApp).
- Dor: pedidos se perdem em grupos lotados; material de divulgação manual.
- Ponta Fase 3: condomínios fechados alto padrão (piloto Jardins Itália).

## 2. Arquitetura Atual
- Node 20 + Express + Baileys (WhatsApp não-oficial) + pdfkit. Persistência em JSON no `DATA_DIR`.
- 1 processo por corretor na VM Oracle grátis (João :3000, Laura :3001).
- Cérebro local (parser + mapa OSM); Gemini só reforça localização; Apify/Serper para portais.
- Engenharia e mapa do código: `.claude/ENGENHARIA.md`.

## 3. Unit Economics
- Planos: R$ 97 Radar · R$ 197 Designer · R$ 997 Imobiliária. Meta: margem bruta > 75%.
- COGS teto R$ 97 ≈ R$ 24. Gemini ≈ US$ 0,3–0,9/corretor/mês. Apify US$ 0,16/busca → precisa teto por plano.

## 4. Go-to-Market / Compliance
- LGPD: Corretor = Controlador, Biga = Operadora. Garimpo só fontes públicas.
- COFECI/CRECI: Biga é SaaS, sem intermediação. Risco Meta: Baileys → migração futura para Cloud API.

## 5. Status Atual — resumo técnico (10 linhas)
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

Detalhe: `data_room_biga/02_PRODUTO_E_COMPLIANCE/02.1_Auditoria_Tecnica_e_Roadmap_3_Fases.md`.
