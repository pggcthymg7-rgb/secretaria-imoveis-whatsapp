# ESTADO ATUAL — Memória Ponte (atualizado 06/11/2026)

## 1. Mercado
- Praça piloto: Goiânia-GO (corretores autônomos em grupos de WhatsApp).
- Dor: pedidos se perdem em grupos lotados; material de divulgação manual.
- Ponta Fase 3: condomínios fechados alto padrão (piloto Jardins Itália).
- 1. 650.000 a 700.000 Corretores Ativos (COFECI-CRECI): O estoque regulatório bruto no Brasil em 2026, representando um crescimento acumulado de 40% no quinquênio e a base para o cálculo do TAM regulatório (gerando um potencial bruto de R$ 1,702 bilhão/ano).
2. 412.736 Profissionais Ocupados (IBGE / PNAD Contínua): O número real de agentes imobiliários efetivamente ocupados no país (sendo 71% autônomos, ou cerca de 293.042 profissionais), métrica essencial para evitar a superestimativa do TAM efetivo (calculado em R$ 1,060 bilhão/ano).
3. 43.000 Corretores e ~4.800 PJs em Goiás (CRECI-GO): O contingente da 5ª Região, que cresceu 44% em cinco anos (com 40% de participação feminina), sustentando um mercado regional de software de R$ 89,5 milhões/ano.
4. R$ 8,25 Bilhões de VGV Total em Goiânia (2024): O volume consolidado da capital goiana — o 3º maior mercado imobiliário do Brasil —, impulsionado por 11.419 unidades lançadas e 11.797 vendidas, com destaque para os 53 condomínios horizontais fechados e o luxo vertical.
5. R$ 371 Milhões de TAM Qualificado Nacional / R$ 89,5 Milhões em Goiás: O potencial de receita anual (ARR) focado estritamente no segmento de médio e alto padrão e na praça prioritária de Goiânia.
6. R$ 0,0350 a R$ 0,3217 (Custo por Mensagem na API da Meta): O impacto tarifário vigente desde outubro de 2026 para mensagens de serviço/utilidade (após a franquia de 1.000 gratuitas) e de marketing, tornando a eficiência conversacional (FCR) um fator direto de COGS.
7. 51% dos Leads Fora do Horário Comercial: O percentual de contatos que chegam à noite e nos fins de semana (com pico de 18% concentrados na segunda-feira), evidenciando a dependência de agentes de IA 24/7 no WhatsApp.
8. 67% das Transações com Negociação de Preço ou Permuta: A proporção de compras efetivadas que envolvem desconto, repasse de ágio ou permutas cruzadas (especialmente em loteamentos de alto padrão), exigindo automação avançada além de chatbots de triagem básica.
9. +80.000 Corretores na Rede Homer: O patamar de profissionais cadastrados na maior plataforma nacional de co-broking e parcerias, ilustrando a liquidez digital e a necessidade de blindagem contra o "atravessamento".
10. LTV/CAC > 5,0x e Payback Abaixo de 6 Meses: As métricas de saúde financeira de elite (benchmark SaaS B2B) obtidas quando a PropTech abandona o SMB puro de baixo ticket e adota planos B2B estruturados (R$ 490 a R$ 1.200/mês) ancorados em contratos anuais e IA integrada.

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
