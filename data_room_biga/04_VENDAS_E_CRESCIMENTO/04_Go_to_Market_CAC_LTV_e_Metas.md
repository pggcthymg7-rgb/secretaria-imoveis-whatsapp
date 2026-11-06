# 04 — Go-to-Market, CAC/LTV, Funil e Metas
> Data Room Biga PropTech · Etapa 2/4 · 06/11/2026 · Base numérica: `03_FINANCEIRO_E_PRECOS/03_Unit_Economics_Custos_IA_e_Precos.md`

## 0. Premissas herdadas da Etapa 1
| Item | Valor |
|---|---|
| Margem de contribuição (MC) por contrato | Radar R$ 69,66 · Designer R$ 140,79 · Imobiliária R$ 733,50 · ponderada **R$ 157,38** |
| Mix de contratos | 60% Radar · 30% Designer · 10% Imobiliária → ticket médio **R$ 217** |
| OPEX fixo | R$ 21.000/mês, sendo R$ 3.500 de marketing base. Aqui o marketing passa a ser variável (CAC × novos contratos) e o OPEX fixo fica em **R$ 17.500** |
| Break-even da Etapa 1 | 134 contratos (232 corretores) · Fase 2 autofinanciada: 291 contratos (501 corretores) |
| Base atual | 2 corretores em produção (Goiânia) |

---

## 1. Perfil do cliente ideal (Goiânia, praça piloto)
| Segmento | Perfil | Dor principal | Plano-alvo | Sinal de compra |
|---|---|---|---|---|
| Corretor autônomo ativo | está em 10 ou mais grupos de WhatsApp e faz 5 ou mais negócios por ano | perde pedidos de clientes no meio do volume dos grupos | **Radar** | reclama que "não dá conta dos grupos" |
| Corretor de captação | carteira própria de 20 ou mais imóveis | monta material de divulgação à mão | **Designer** | posta fichas improvisadas nos grupos |
| Imobiliária pequena/média | 5 a 15 corretores | não enxerga a demanda e a padronização da marca é fraca | **Imobiliária** | gestor pede relatório de captação e conversão |
| Corretor de condomínio fechado | atua no Jardins Itália e em condomínios parecidos | imóvel de alto padrão exige apresentação melhor | Designer → **pré-venda da Fase 3** | já tem carteira dentro do condomínio |

> O tamanho do mercado (número de inscritos no CRECI-GO, corretores ativos e o total que a Biga pode alcançar) fica para a pasta `01_MERCADO_E_PESQUISA`. Os 501 corretores da meta Fase 2 devem ser validados como uma fatia pequena (< 10%) da base ativa em Goiânia.

---

## 2. Canais de aquisição e CAC
| # | Canal | Mecânica | Participação nos novos contratos | CAC (R$) |
|---|---|---|---|---|
| 1 | **Indicação/Embaixadores** | o corretor que indica ganha 1 mês grátis; o custo real para a Biga é só o COGS | 35% | 40 |
| 2 | **Crescimento pelo próprio produto nos grupos** | a ficha PDF e a arte saem com o selo "feito com Biga" e cada match entregue mostra o valor da ferramenta | 25% | 60 |
| 3 | Eventos (palestras no CRECI-GO, cafés em imobiliárias) | demonstração ao vivo do Radar | 15% | 250 |
| 4 | Anúncios Meta/Instagram (segmentação: corretores em Goiânia) | vídeo de demonstração → teste grátis | 15% | 350 |
| 5 | Venda consultiva (plano Imobiliária) | 20 reuniões → 8 propostas → 4 fechamentos por mês | 10% | 1.500 |
| | **CAC ponderado** | | 100% | **R$ 269** |

O custo do teste grátis de 14 dias (≈ R$ 8 por teste, ou metade do COGS do Radar) já está dentro do CAC de cada canal.

---

## 3. LTV, LTV/CAC e payback
| Plano | MC/mês | Churn mensal (premissa) | Vida média | **LTV** | CAC | **LTV/CAC** | Payback do CAC |
|---|---|---|---|---|---|---|---|
| Radar | 69,66 | 6,0% | 16,7 meses | **R$ 1.161** | 120 | **9,7×** | 1,7 mês |
| Designer | 140,79 | 4,0% | 25 meses | **R$ 3.520** | 157 | **22,4×** | 1,1 mês |
| Imobiliária | 733,50 | 2,5% | 40 meses | **R$ 29.340** | 1.500 | **19,6×** | 2,0 meses |
| Ponderado | 157,38 | **5,05%** | 19,8 meses | **R$ 4.687** (média por mix) | 269 | **17,4×** | 1,7 mês |

LTV = MC ÷ churn. CAC por plano = rateio do CAC ponderado (0,6 × 120 + 0,3 × 157 + 0,1 × 1.500 = R$ 269). Referência de Venture Capital para SaaS saudável: LTV/CAC ≥ 3× e payback ≤ 12 meses. Os quatro casos passam com folga.

### Plano anual sem quebrar a trava de 75%
| Plano | Anual no Pix (10% de desconto, taxa Pix de 0,99%) | COGS | Margem |
|---|---|---|---|
| Radar | R$ 87,30/mês | R$ 18,51 | **77,4%** ✅ |
| Designer | R$ 177,30/mês | R$ 38,29 | **77,0%** ✅ |
| Imobiliária | R$ 897,30/mês | R$ 172,78 | **79,5%** ✅ |

O desconto anual **só funciona no Pix**: a economia de cerca de 3 pontos na taxa do gateway paga o desconto. No cartão, 10% de desconto derruba o Radar para cerca de 72%. Proibido.

---

## 4. Funil de conversão (Radar, plano de entrada)
| Etapa | Definição | Conversão | Para 40 novos contratos/mês |
|---|---|---|---|
| Lead | corretor que interagiu (grupo, indicação, anúncio ou evento) | — | 572 |
| Teste grátis | conectou o WhatsApp e começou o teste de 14 dias | 25% | 143 |
| **Ativado** | recebeu o **1º match em até 7 dias** | 70% | 100 |
| Pago | assinou ao fim do teste | 40% | **40** |
| Lead → pago | | **7%** | |

**North Star:** matches úteis entregues por corretor por semana. O corretor que recebe 3 ou mais matches na 1ª semana é o principal sinal de que vai continuar (validar com as coortes).

---

## 5. Metas e plano de caixa (18 meses)
Modelo: contratos(m) = contratos(m−1) × (1 − 5,05%) + novos(m). Resultado = MC − OPEX fixo de R$ 17.500 − novos × CAC de R$ 269.

| Mês | Novos | Contratos ativos | MRR (R$) | MC (R$) | Gasto com CAC (R$) | Resultado mensal (R$) | Caixa acumulado (R$) |
|---|---|---|---|---|---|---|---|
| M3 | 16 | 36 | 7.881 | 5.716 | 4.304 | −16.088 | −51.543 |
| M6 | 28 | 100 | 21.680 | 15.724 | 7.532 | −9.308 | −87.193 |
| **M8** | 32 | **151** ✅ BE (≥ 134) | 32.671 | 23.695 | 8.608 | −2.413 | **−95.526 (pico)** |
| **M9** | 34 | 177 | 38.399 | 27.849 | 9.146 | **+1.203** | −94.323 |
| M12 | 40 | 260 | 56.423 | 40.921 | 10.760 | +12.661 | −67.992 |
| **M14** | 40 | **312** ✅ (≥ 291) | 67.790 | 49.165 | 10.760 | +20.905 | −30.198 |
| **M16** | 40 | 360 | 78.038 | 56.597 | 10.760 | **+28.337** (≥ R$ 25 mil) | **+22.857** |
| M18 | 40 | 402 | 87.276 | 63.298 | 10.760 | +35.038 | +89.668 |

Novos contratos por mês, de M1 a M12: 8, 12, 16, 20, 24, 28, 30, 32, 34, 36, 38, 40. A partir de M13, constante em 40.

### Leitura para o investidor
| Marco | Mês |
|---|---|
| Break-even operacional (134 contratos) | **M8** |
| Resultado mensal positivo já pagando o CAC | **M9** |
| Base da Fase 2 (291 contratos) | **M14** |
| **Fase 2 autofinanciada** (resultado ≥ R$ 25 mil/mês) | **M16** |
| **Caixa necessário até o break-even** | **R$ 95,5 mil** → captação mínima de **R$ 120 mil** (25% de reserva) |

### Sensibilidade
| Cenário | Efeito |
|---|---|
| Churn de 8% (em vez de 5,05%) | resultado mensal positivo em M10; pico de caixa de R$ 101 mil (+6%) |
| CAC de R$ 400 | resultado mensal positivo em M10; pico de caixa de R$ 121 mil (+27%) |
| Mix sem Imobiliária | MC ponderada cai para R$ 93,37 → break-even exige 225 contratos (M11); resultado positivo só em M14; pico de caixa de R$ 162 mil |

O plano Imobiliária é **o motor da margem**: são 10% dos contratos e cerca de 47% da MC.

---

## 6. Alavancas de retenção (churn)
| Alavanca | Meta |
|---|---|
| Onboarding "1º match em 7 dias" (conexão guiada pelo WhatsApp) | ativação ≥ 70% |
| Resumo semanal: "a Biga achou X pedidos e Y matches para você" | prova de valor recorrente |
| Plano anual no Pix (10% de desconto) | 25% da base no anual → churn efetivo −1 ponto |
| Ranking e CRM da Fase 2 (custo de troca alto) | churn do Radar de 6% para 4% |

---

## 7. Regras de compliance do Go-to-Market (não negociáveis)
| Regra | Motivo |
|---|---|
| Proibido disparo em massa ou mensagem não solicitada nos grupos | política anti-spam da Meta: risco de banimento do número (o Baileys já é sensível) |
| Prospecção só com opt-in (o corretor chama primeiro) ou por indicação | LGPD: base legal de legítimo interesse, com opt-out em toda mensagem |
| O selo "feito com Biga" fica na peça do corretor, sem dado de cliente final | LGPD: o corretor é o controlador dos dados |
| Venda vendida como SaaS; a Biga nunca promete negócio fechado | COFECI/CRECI: sem intermediação |

---

## 8. Ações priorizadas (próximos 90 dias)
| # | Ação | Responsável | Meta |
|---|---|---|---|
| 1 | Programa de Embaixadores com os 2 corretores atuais + 10 corretores convidados | fundadores | 40% dos novos contratos via indicação |
| 2 | Selo "feito com Biga" nas fichas PDF e nas artes + página de teste grátis | produto | 25% via crescimento pelo produto |
| 3 | Instrumentar o funil (lead → teste → ativado → pago) e coortes de churn no painel | engenharia | dados reais para substituir as premissas até M3 |
