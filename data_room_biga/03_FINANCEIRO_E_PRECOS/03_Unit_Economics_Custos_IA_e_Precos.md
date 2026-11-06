# 03 — Unit Economics, Custos de IA e Preços
> Data Room Biga PropTech · Etapa 1/4 · 06/11/2026 · Auditoria: skill `auditor-viabilidade`

## 0. Premissas (todas auditáveis)
| Item | Valor | Fonte |
|---|---|---|
| Câmbio | R$ 5,50 / US$ | premissa conservadora (sensibilidade a R$ 6,00 na §5) |
| Impostos sobre receita | 6% (Simples Nacional, Anexo III, faixa 1) | Receita Líquida (RL) = preço × 0,94 |
| Gateway (Pix/cartão) | 3,99% do preço | entra no COGS |
| Gemini Flash-Lite | US$ 0,10 /1M in · US$ 0,40 /1M out | tabela Google AI |
| Gemini Flash | US$ 0,30 /1M in · US$ 2,50 /1M out | tabela Google AI |
| Serper (SERP) | US$ 0,001 / consulta | pacote 50k |
| Apify (scraper portais) | US$ 0,16 / busca | `ESTADO_ATUAL.md` §3 |
| WhatsApp Cloud API (BR, utilidade) | US$ 0,0068 / msg fora da janela de 24h | tabela Meta; mensagens de serviço e utilidade dentro da janela = grátis |
| RAM por corretor (Baileys) | 250 MB | `ESTADO_ATUAL.md` §5.6 |
| VM paga (4 OCPU / 24 GB) | ≈ US$ 55/mês → ~80 instâncias | Oracle A1 sob demanda |
| **Hipótese conservadora** | Biga paga todas as APIs | hoje o código é BYOK (o corretor usa chaves próprias grátis de Gemini/Tavily/Serper), o que deixa o COGS real menor |

**Margem bruta** = (RL − COGS) / RL. Meta: **> 75%**.

---

## 1. Mapa de chamadas pagas no código (gatilho → custo)
| Operação | Arquivo:linha | Gatilho | Tokens/consultas por evento | Custo unit. (R$) | Risco atual |
|---|---|---|---|---|---|
| Extração de lugares (LLM) | `src/matcher.js:140` | todo pedido detectado em grupo | ~1.500 in / 150 out | Lite: 0,0012 · Flash: 0,0045 | **sem cache e sem teto**; modelo escolhido sozinho (`gemini-modelo.js`) pode cair no Flash |
| Curadoria de resultados (LLM) | `src/busca-curadoria.js:64` | toda busca nos portais | ~3.000 in / 300 out | Lite: 0,0023 | a lista de fallback inclui `gemini-2.5-flash` (3,7× mais caro) |
| Busca SERP (Serper/Brave) | `src/busca-serp.js:141,154` | busca nos portais | até 3 rodadas × portais ≈ **6 consultas** | 0,033 / busca | `BUSCA_RODADAS` padrão 3 (`busca-serp.js:187`) |
| Busca Tavily | `src/busca-serp.js:129` | busca nos portais (alternativa) | 1 consulta | ~0,044 | — |
| Scraper Apify | `src/busca-inteligente.js:26` | busca nos portais (motor principal hoje) | 1 run | **0,88** / busca | limite padrão **20/dia** (`busca-inteligente.js:199`, `public/app.js:752`) → até R$ 528/mês por corretor |
| Garimpo (Brave + Graph Meta) | `src/garimpo.js:108,127` | varredura de fontes públicas | 1 consulta | 0,005 (Brave) · 0 (Graph) | — |
| Ficha PDF / Capas | `src/pdf.js:24`, `src/pdf-ficha.js:127` | pedido do corretor | pdfkit local (só CPU) | ≈ 0 (fica na infra) | — |
| Mensageria | Baileys | alertas e respostas | — | **0 hoje** · 0,037/msg paga na Cloud API | risco de banimento (Meta) → migração |
| Persistência | JSON no `DATA_DIR` | toda gravação | — | 0 | não escala (ver §1 do 02.1) |

---

## 2. COGS por corretor/mês (R$) — com política de uso justo
### 2.1 Biga Radar — R$ 97 (RL R$ 91,18 · teto de COGS p/ 75% = R$ 22,80)
| Componente | Limite de uso justo | Cálculo | R$/mês |
|---|---|---|---|
| LLM extração (Flash-Lite fixo) | 1.500 pedidos analisados por IA | 2,25M in + 0,23M out | 1,75 |
| Busca SERP | **100 buscas/mês** (~3/dia útil) | 600 consultas × US$ 0,001 | 3,30 |
| Curadoria LLM | 100 | 0,0023 × 100 | 0,23 |
| Apify | **não incluso** (add-on) | — | 0,00 |
| WhatsApp Cloud API | 300 alertas; 70% dentro da janela grátis | 90 × US$ 0,0068 | 3,37 |
| Infra (VM / RAM 250 MB) | 1 instância | US$ 55 ÷ 80 | 3,80 |
| Banco (Postgres gerenciado, rateio) | — | — | 1,00 |
| Armazenamento (PDF/imagens) | 1 GB | — | 0,20 |
| Gateway 3,99% | — | — | 3,87 |
| Suporte (CS rateado) | — | — | 4,00 |
| **COGS total** | | | **21,52** |
| **Margem bruta** | | (91,18 − 21,52) / 91,18 | **76,4%** ✅ |
| Margem hoje (Baileys, sem Cloud API) | | COGS 18,15 | 80,1% |

### 2.2 Biga Designer — R$ 197 (RL R$ 185,18 · teto de COGS = R$ 46,30)
| Componente | Limite de uso justo | R$/mês |
|---|---|---|
| LLM extração (Lite) | 3.000 pedidos | 3,50 |
| Busca SERP | **200 buscas** | 6,60 |
| Curadoria LLM | 200 | 0,46 |
| Apify "busca profunda" | **5 créditos/mês** | 4,40 |
| Copy das artes/legendas (Gemini Flash) | **200 PDFs/artes** | 2,04 |
| Armazenamento | 5 GB | 0,50 |
| WhatsApp Cloud API | 600 msgs; 70% na janela | 6,73 |
| Infra (instância + CPU do pdfkit) | — | 4,80 |
| Banco | — | 1,50 |
| Gateway 3,99% | — | 7,86 |
| Suporte | — | 6,00 |
| **COGS total** | | **44,39** |
| **Margem bruta** | (185,18 − 44,39) / 185,18 | **76,0%** ✅ |

Geração de imagem por IA (ex.: Imagen ~US$ 0,04/imagem) **fica fora do plano** e entra só como add-on.

### 2.3 Biga Imobiliária — R$ 997 (RL R$ 937,18 · teto de COGS = R$ 234,30)
| Componente | Limite de uso justo | R$/mês |
|---|---|---|
| 8 assentos Radar (R$ 13,65 de APIs + infra por assento) | 100 buscas e 1.500 pedidos por assento | 109,20 |
| Designer em pool | 500 PDFs/artes | 7,10 |
| Apify em pool | 20 buscas profundas | 17,60 |
| Gateway 3,99% | — | 39,78 |
| Suporte dedicado + onboarding amortizado | — | 30,00 |
| **COGS total** | | **203,68** |
| **Margem bruta** | (937,18 − 203,68) / 937,18 | **78,3%** ✅ |
| Assento extra: R$ 79 | COGS R$ 16,80 | 77,4% ✅ |

### 2.4 Add-ons de excedente (todos > 75%)
| Add-on | Preço | COGS | Margem s/ RL |
|---|---|---|---|
| +50 buscas SERP | R$ 19 | R$ 2,52 | 86% |
| +10 buscas profundas Apify | R$ 49 | R$ 10,76 | 76,6% |
| +100 artes | R$ 29 | R$ 2,18 | 92% |

**Regra de corte:** ao bater o limite, o sistema cai para o **cérebro local** (parser + mapa OSM), sem LLM, e sugere o add-on. O serviço não é interrompido.

---

## 3. Monetização das Fases 2 e 3
### Fase 2 — Rede (CRM Meritocrático + Parcerias + Proprietários)
| Fonte | Modelo | Preço | COGS estimado | Margem | Observação |
|---|---|---|---|---|---|
| CRM + Ranking | **incluso** em todos os planos | — | +R$ 1,50/corretor (Postgres) | — | alavanca de retenção (efeito de rede) |
| Selo "Ouro" do Ranking | upsell para corretores do top 10% | R$ 49/mês | R$ 3 | 93% | o mérito é conquistado; o selo dá destaque nas indicações |
| Contrato de Parceria digital | taxa **fixa** por parceria formalizada | R$ 49/contrato | R$ 4 (assinatura eletrônica) | 91% | **não cobrar % da comissão**: isso seria divisão de honorários com uma empresa sem CRECI (risco COFECI) |
| Pacote Proprietário "Venda Assistida" | ficha PDF + arte + distribuição para 5 corretores do top do ranking | R$ 297 (único) | R$ 18 | 93% | a Biga não intermedia: o proprietário escolhe o corretor |
| Pacote Proprietário "Premium" | o anterior + 30 dias de destaque + relatório de demanda do Radar | R$ 597 | R$ 35 | 93% | — |
| Relatório de demanda (dados agregados e anonimizados) | incorporadoras e loteadoras | R$ 2.500/mês | R$ 150 | 94% | LGPD: só dados agregados, sem dado pessoal |

### Fase 3 — Portal Imersivo 3D (piloto Jardins Itália)
| Item | Premissa |
|---|---|
| CAPEX por condomínio | R$ 45 mil (aerofotogrametria com drone + modelagem + tiles 3D) |
| Hospedagem e CDN do 3D | R$ 300/mês |
| **Quem paga o setup** | modelo misto: 50% pela associação/incorporadora (R$ 22,5 mil) + 50% em pré-venda para 15 corretores "fundadores" (R$ 1.500 cada, abatidos em destaque) |
| Receita recorrente | associação R$ 2.000/mês (portal oficial do condomínio) + 30 imóveis em destaque × R$ 197 + 20 "Pin 3D" de proprietários × R$ 97 = **R$ 9.850/mês** |
| Margem de contribuição | (9.850 × 0,94 − 300 − 393 de gateway) / 9.259 = **92,5%** |
| Payback da parte da Biga | não há CAPEX próprio se o modelo misto fechar; com 100% bancado pela Biga: 45.000 / 8.566 ≈ **5,3 meses** |
| Gatilho para replicar | ≥ 25 imóveis ativos no condomínio e associação assinada |

---

## 4. Break-even (Fase 1) e financiamento da Fase 2
### 4.1 Custos fixos mensais (OPEX Fase 1)
| Item | R$/mês |
|---|---|
| Pró-labore (2 fundadores) | 12.000 |
| Suporte/CS meio período | 2.500 |
| Marketing e aquisição base (Goiânia) | 3.500 |
| Contabilidade | 600 |
| Jurídico/compliance (LGPD, CRECI) | 800 |
| Ferramentas SaaS | 700 |
| Infra base fixa (domínio, monitoramento, backup) | 400 |
| Reserva | 500 |
| **Total** | **21.000** |

### 4.2 Margem de contribuição (RL − COGS) por contrato
| Plano | MC (R$) | Mix assumido |
|---|---|---|
| Radar | 69,66 | 60% |
| Designer | 140,79 | 30% |
| Imobiliária | 733,50 | 10% |
| **MC ponderada** | **157,38** | |

### 4.3 Resultado
| Cenário | Fórmula | Contratos | Corretores (assentos) | MRR |
|---|---|---|---|---|
| **Break-even operacional** | 21.000 / 157,38 | **134** (80 Radar · 40 Designer · 14 Imob.) | **232** | R$ 29.598 |
| Break-even só com Radar | 21.000 / 69,66 | 302 | 302 | R$ 29.294 |
| **Break-even + Fase 2 autofinanciada** (+R$ 25 mil/mês: 2 devs + migração Postgres por 6 meses = R$ 150 mil) | 46.000 / 157,38 | **291** (174 Radar · 87 Designer · 30 Imob.) | **501** | R$ 63.927 |

Prova: 80 × 69,66 + 40 × 140,79 + 14 × 733,50 = R$ 21.473 ≥ 21.000 ✅ · 174 × 69,66 + 87 × 140,79 + 30 × 733,50 = R$ 46.375 ≥ 46.000 ✅

**Fora do modelo:** churn, CAC variável e capital de giro. Com 232 instâncias, a RAM chega a 58 GB, acima da VM grátis; isso já está no COGS por assento (§2.1).

---

## 5. Sensibilidade (plano Radar, o mais apertado)
| Cenário | COGS | Margem | Status |
|---|---|---|---|
| Base | 21,52 | 76,4% | ✅ |
| Câmbio a R$ 6,00 | 22,76 | 75,0% | ⚠️ no limite |
| Matcher no Gemini Flash (não Lite) | 26,57 | 70,9% | ❌ |
| Apify no padrão atual (20/dia) | ~550 | negativa | ❌❌ |

---

## 6. Três cortes de custo priorizados (condição para a margem)
| # | Ação | Onde | Efeito |
|---|---|---|---|
| 1 | **Teto por plano** + Serper como motor padrão; Apify só como crédito de "busca profunda" | `busca-inteligente.js:199`, `public/app.js:752` | elimina o risco de R$ 528/mês por corretor |
| 2 | **Fixar Flash-Lite** no matcher e na curadoria, cache por hash do texto (combinado com o dedup global) e chamada só quando o parser local tem baixa confiança | `matcher.js:140`, `busca-curadoria.js:13`, `gemini-modelo.js` | −60% a −80% de tokens; evita o cenário de 70,9% |
| 3 | **Processo multi-tenant** (várias sessões Baileys por processo, ~40 MB cada) e, na Cloud API, priorizar respostas dentro da janela de 24h | arquitetura (ver 02.1) | infra de R$ 3,80 para ~R$ 0,70 por corretor; mensageria −70% |
