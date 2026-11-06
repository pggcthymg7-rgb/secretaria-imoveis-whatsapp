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

## 6. Data Room — Etapa 1/4 Financeiro (APROVADA 06/11/2026)
1. Arquivo: `data_room_biga/03_FINANCEIRO_E_PRECOS/03_Unit_Economics_Custos_IA_e_Precos.md`.
2. Premissas: R$ 5,50/US$; Simples 6%; gateway 3,99%; Biga paga todas as APIs (cenário conservador, hoje é BYOK).
3. Margem bruta: Radar 76,4% (COGS R$ 21,52) · Designer 76,0% (R$ 44,39) · Imobiliária 78,3% (R$ 203,68, 8 assentos).
4. Uso justo: Radar 100 buscas SERP/1.500 pedidos IA, sem Apify · Designer 200 buscas/5 Apify/200 artes · Imob. 8 assentos + 20 Apify.
5. Acima do limite: cai para o cérebro local + add-ons (R$ 19/50 buscas · R$ 49/10 Apify · R$ 29/100 artes · R$ 79/assento).
6. Obrigatório: Flash-Lite fixo no matcher (Flash derruba o Radar para 70,9%) e fim do padrão Apify 20/dia.
7. Break-even: OPEX R$ 21 mil → 134 contratos (80/40/14) = 232 corretores; MRR R$ 29,6 mil.
8. Fase 2 autofinanciada (+R$ 25 mil/mês): 291 contratos = 501 corretores; MRR R$ 63,9 mil.
9. Fase 2: taxa fixa por parceria (nunca % da comissão, por risco COFECI) + pacotes de proprietário R$ 297/597 + relatório de demanda R$ 2,5 mil.
10. Fase 3: setup de R$ 45 mil por condomínio dividido entre associação e corretores fundadores; recorrência R$ 9,85 mil/mês; payback de 5,3 meses.

## 7. Data Room — Etapa 2/4 Vendas (aprovação pendente)
1. Arquivo: `data_room_biga/04_VENDAS_E_CRESCIMENTO/04_Go_to_Market_CAC_LTV_e_Metas.md`.
2. Canais: Indicação 35% · selo "feito com Biga" 25% · Eventos 15% · Meta Ads 15% · Venda consultiva Imob. 10%; CAC ponderado R$ 269.
3. Churn (premissa): Radar 6% · Designer 4% · Imob. 2,5% → ponderado 5,05%; LTV/CAC 17,4×; payback 1,7 mês.
4. Funil Radar: lead → teste 25% → ativado (1º match em 7 dias) 70% → pago 40% = 7%; North Star = matches/corretor/semana.
5. Plano anual só no Pix com 10% de desconto (margem ≥ 77%); no cartão, proibido (Radar cai para cerca de 72%).
6. Metas: break-even em M8 (151 contratos) · resultado positivo em M9 · 291 contratos em M14 · Fase 2 autofinanciada em M16.
7. Caixa até o break-even: pico de −R$ 95,5 mil → captação mínima de R$ 120 mil (insumo para a Sala do Investidor).
8. A Imobiliária é 10% dos contratos e 47% da MC; sem ela, o break-even vai para 225 contratos e o pico de caixa para R$ 162 mil.
9. Compliance do GTM: sem disparo em massa nos grupos; prospecção só com opt-in ou indicação; venda sempre como SaaS, sem intermediação.
10. 90 dias: Embaixadores, selo nas peças + página de teste, instrumentar funil e coortes no painel.
