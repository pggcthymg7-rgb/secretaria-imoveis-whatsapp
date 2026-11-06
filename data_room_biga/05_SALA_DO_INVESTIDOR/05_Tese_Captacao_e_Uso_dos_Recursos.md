# 05 — Sala do Investidor: Tese, Captação e Uso dos Recursos
> Data Room Biga PropTech · Etapa 4/4 · 06/11/2026 · Consolida os arquivos 01 (Mercado), 02.1 (Produto), 03 (Unit Economics) e 04 (Go-to-Market)

## 1. Tese em uma frase
**"Come for the tool, stay for the network."** A Biga entra pela ferramenta que o corretor usa todo dia (Radar dos grupos de WhatsApp + Designer de peças). Em cima dela constrói a rede (CRM, Ranking Meritocrático e Parcerias) e, por fim, o Portal 3D de condomínios fechados.

## 2. One-pager
| Bloco | Resumo | Fonte |
|---|---|---|
| Problema | pedidos de clientes se perdem em grupos de WhatsApp lotados; o material de divulgação é feito à mão | 01 §3 |
| Solução | Radar (lê os grupos e cruza com a carteira) + Designer (ficha PDF e artes automáticas) | 02.1 |
| Mercado | TAM R$ 995 mi/ano · SAM Goiás R$ 30,3 mi · SOM em 18 meses R$ 1,05 mi de receita anual | 01 §2 |
| Modelo | SaaS por assinatura: R$ 97 / R$ 197 / R$ 997 | 03 §2 |
| Margem bruta | 76,0% a 78,3% em todos os planos (trava > 75%) | 03 §2 |
| LTV/CAC | **17,4×** · CAC pago em 1,7 mês | 04 §3 |
| Tração | 2 corretores em produção (Goiânia); Radar, Carteira, match, Vitrine e Garimpo rodando | `ESTADO_ATUAL.md` §5 |
| Break-even | 134 contratos (232 corretores) → **mês 8** sem acelerar | 04 §5 |
| Fosso competitivo | dados de demanda dos grupos + rede/ranking (custo de troca) + ativo 3D exclusivo por condomínio | 01 §4 |

---

## 3. A captação
| Item | Proposta |
|---|---|
| Rodada | **Pré-seed: R$ 600 mil** |
| Instrumento | mútuo conversível (contrato de investidor-anjo, LC 182/2021) |
| Valuation cap | **R$ 6,0 mi post-money** (≈ 10% de diluição) · desconto de 20% na próxima rodada |
| Mínimo viável | R$ 120 mil (só cobre o caixa até o break-even, sem acelerar; 04 §5) |
| Runway | 18 meses no plano acelerado |
| Múltiplo implícito | cap de R$ 6,0 mi ÷ receita anual de R$ 1,05 mi no mês 18 = **5,7×** |

> Cap e desconto são **proposta de negociação**, sem benchmark de comparáveis neste documento. Validar com 3 a 5 investidores-anjo locais antes de fixar.

### Uso dos recursos
| # | Destino | R$ mil | % | Efeito | Fonte |
|---|---|---|---|---|---|
| 1 | Caixa até o break-even (pico de −R$ 95,5 mil + 25% de reserva) | 120 | 20% | garante a operação até o M8–M9 | 04 §5 |
| 2 | **Antecipar a Fase 2** (2 devs por 6 meses: CRM, Ranking e Parcerias) | 150 | 25% | Fase 2 começa no M6, não no M16 | 03 §4 |
| 3 | Migração técnica: Postgres + PostGIS multi-tenant, processo multi-tenant e WhatsApp Cloud API | 60 | 10% | elimina o risco de banimento e o teto de RAM; infra de R$ 3,80 para ~R$ 0,70 por corretor | 02.1 · 03 §6 |
| 4 | Aceleração comercial (Embaixadores, eventos, Meta Ads) | 150 | 25% | +~550 contratos a R$ 269 de CAC | 04 §2 |
| 5 | Piloto 3D Jardins Itália (CAPEX completo, sem depender do modelo misto) | 45 | 7,5% | prova a Fase 3; payback de 5,3 meses | 03 §3 |
| 6 | Pesquisa primária, jurídico (LGPD, CRECI, Meta) e marca no INPI | 30 | 5% | fecha as lacunas de 01 §6 | 01 §6 |
| 7 | Reserva | 45 | 7,5% | — | — |
| | **Total** | **600** | 100% | | |

---

## 4. Marcos por fase (como o investidor acompanha)
| Marco | Mês-alvo | KPI de prova |
|---|---|---|
| Tetos por plano e cache do Gemini em produção | M1 | COGS do Radar ≤ R$ 21,52 medido |
| Funil e coortes instrumentados | M3 | churn e conversão reais no lugar das premissas |
| 100 contratos | M6 | MRR ≥ R$ 21 mil · ativação ≥ 70% |
| Migração para Cloud API + Postgres concluída | M6 | zero dependência do Baileys em produção |
| **Break-even operacional** | **M8** | MC ≥ R$ 21 mil/mês |
| CRM + Ranking (Fase 2) lançados | M9 | ≥ 30% dos corretores usando parcerias |
| Piloto 3D Jardins Itália no ar | M12 | ≥ 25 imóveis ativos + associação assinada |
| Prontidão para Seed | M14–M18 | 291 a 402 contratos · receita anual ≥ R$ 0,8 mi · 2ª praça validada |

---

## 5. Matriz de riscos
| Risco | Prob. | Impacto | Mitigação | Fonte |
|---|---|---|---|---|
| Banimento de números pela Meta (Baileys não oficial) | alta | alto | migração para a Cloud API (item 3 do uso dos recursos); proibição de disparo em massa | 04 §7 |
| Custo de LLM e APIs foge do controle | média | alto | Flash-Lite fixo, cache, tetos e Apify só como crédito; sensibilidade documentada | 03 §5 |
| Churn acima da premissa (8%) | média | médio | onboarding do "1º match em 7 dias", plano anual no Pix, efeito de rede da Fase 2 | 04 §5–6 |
| Questionamento no COFECI/CRECI (intermediação) | baixa | alto | SaaS puro; taxa fixa por parceria, nunca % da comissão | 03 §3 |
| LGPD (dados de grupos e clientes) | média | alto | o corretor é controlador e a Biga é operadora; só fontes públicas; DPA com cada cliente | `ESTADO_ATUAL.md` §4 |
| Concentração em uma praça (Goiânia) | alta | médio | o modelo é replicável; 2ª praça no M14–M18 | 01 §5 |
| Dependência da Imobiliária (47% da MC) | média | alto | venda consultiva dedicada; sem ela, o break-even vai a 225 contratos | 04 §5 |
| Equipe enxuta (2 fundadores) | alta | médio | 2 devs com os recursos da rodada; documentação de engenharia (`.claude/ENGENHARIA.md`) | — |

---

## 6. Índice do Data Room (checklist de diligência)
| Pasta | Documento | Status |
|---|---|---|
| 01_MERCADO_E_PESQUISA | `01_Mercado_TAM_SAM_SOM_e_Concorrencia.md` | ✅ (pesquisa primária pendente) |
| 02_PRODUTO_E_COMPLIANCE | `02.1_Auditoria_Tecnica_e_Roadmap_3_Fases.md` | ✅ |
| 03_FINANCEIRO_E_PRECOS | `03_Unit_Economics_Custos_IA_e_Precos.md` | ✅ |
| 04_VENDAS_E_CRESCIMENTO | `04_Go_to_Market_CAC_LTV_e_Metas.md` | ✅ |
| 05_SALA_DO_INVESTIDOR | este documento | ✅ |
| 06_MARKETING_MARCA_E_VIDEO | pitch deck, manual de marca e roteiro do vídeo de demonstração | ⏳ pendente |
| Jurídico | contrato social, cap table, acordo de sócios, cessão de PI do código, pedido de marca no INPI | ⏳ preencher pelos fundadores |
| Compliance | Termos de Uso, Política de Privacidade, DPA (operador LGPD) | ⏳ pendente (skill `auditor-compliance`) |
| Métricas | painel de MRR, churn, coortes e COGS real por corretor | ⏳ após a instrumentação (M3) |
