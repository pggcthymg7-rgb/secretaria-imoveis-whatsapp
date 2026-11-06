# 01 — Mercado: TAM/SAM/SOM, Dor e Concorrência
> Data Room Biga PropTech · Etapa 3/4 · 06/11/2026 · Base numérica: arquivos 03 (Unit Economics) e 04 (Go-to-Market)

## 1. Dados de mercado (fontes públicas)
| Indicador | Valor | Fonte | Confiabilidade |
|---|---|---|---|
| Corretores no Brasil (2025) | **~650 mil** em atividade (crescimento de 195% em 15 anos) | Cofeci + DataZAP, Conecta Imobi 2025 [1] | alta (fonte oficial) |
| Corretores registrados no Brasil | 654.573 (35,5% mulheres) | Cofeci, mar/2026 [2] | alta |
| Corretores ativos no fim de 2024 | ~580 mil | Sistema Cofeci-Creci [1] | média (diverge do item acima) |
| Série histórica Brasil | 383 mil (2018) → 554 mil (2023) | Cofeci [1] | alta |
| **Corretores em Goiás** | **39.622** (+2.689 em 12 meses, +7,21%) | CRECI-GO via O Hoje, ago/2024 [3] | média (número de registros, não de ativos) |
| Exercício ilegal identificado em 2025 | 23.250 casos | Cofeci-Creci [4] | alta |

**Lacuna:** não existe número oficial de corretores **ativos** em Goiânia. Ação: pedir ao CRECI-GO o relatório de inscritos ativos por município (ver §6).

---

## 2. TAM / SAM / SOM
Receita média por corretor = **R$ 127,60/mês**. É o mix de assentos do break-even: R$ 29.598 de MRR ÷ 232 corretores (Etapa 1).

| Camada | Definição | Cálculo | Corretores | **R$/ano** |
|---|---|---|---|---|
| **TAM** | todos os corretores em atividade no Brasil | 650.000 × 127,60 × 12 | 650.000 | **R$ 995 mi** |
| **SAM** | corretores efetivamente atuantes em Goiás (premissa: 50% dos registros) | 19.811 × 127,60 × 12 | 19.811 | **R$ 30,3 mi** |
| SAM Goiânia (praça piloto) | 55% dos atuantes de Goiás estão na região metropolitana (premissa) | 10.896 × 127,60 × 12 | 10.896 | R$ 16,7 mi |
| **SOM em 18 meses** | meta M18 da Etapa 2: 402 contratos (241 Radar, 121 Designer, 40 Imobiliária × 8 assentos) | ARR = MRR de R$ 87.276 × 12 | **682** | **R$ 1,05 mi** |

| Teste de razoabilidade | Resultado |
|---|---|
| SOM ÷ SAM Goiânia | 682 ÷ 10.896 = **6,3%** ✅ (abaixo do teto de 10% definido na Etapa 2) |
| Meta Fase 2 (501 corretores) ÷ SAM Goiânia | **4,6%** ✅ |
| Novos corretores por ano em Goiás | 2.689 → mais que o triplo do SOM: só o fluxo de entrantes já cobre a meta |

### TAM adicional das Fases 2 e 3 (Goiânia, premissas a validar)
| Fonte | Base | Cálculo | R$/ano |
|---|---|---|---|
| Portal 3D de condomínios | 30 condomínios horizontais de alto padrão na região metropolitana (premissa) | 30 × R$ 9.850 × 12 | R$ 3,5 mi |
| Relatório de demanda para incorporadoras | 20 incorporadoras/loteadoras (premissa) | 20 × R$ 2.500 × 12 | R$ 0,6 mi |
| Pacotes para proprietários (R$ 297/597) | — | — | upside não quantificado: depende do tráfego do Ranking (Fase 2) |

---

## 3. A dor (por que agora)
| Dor | Evidência | Como a Biga resolve |
|---|---|---|
| Pedidos de clientes se perdem em grupos de WhatsApp lotados | dor nº 1 registrada na operação piloto (`ESTADO_ATUAL.md` §1) | **Radar**: lê os grupos, extrai bairro, condomínio, tipo e faixa de preço, e cruza com a carteira (match reverso) |
| Material de divulgação feito à mão | mesma fonte | **Designer**: ficha PDF e capas automáticas |
| Mercado cada vez mais disputado | 195% mais corretores em 15 anos [1]; Goiás +7,21% em 12 meses [3] | quem responde primeiro ao pedido ganha o negócio: velocidade passa a ser vantagem competitiva |
| A vitrine do corretor migrou para o celular | redes sociais viraram vitrine do corretor [5] | a peça sai pronta no formato de WhatsApp e Instagram |

**Por que agora:** a base de corretores cresce rápido, a demanda circula em grupos de WhatsApp que nenhum CRM lê, e o custo de LLM caiu ao ponto de o Radar custar R$ 1,75 por corretor por mês (Etapa 1).

---

## 4. Concorrência
| Categoria | Players | Preço público | O que faz | Lacuna que a Biga ocupa |
|---|---|---|---|---|
| CRM imobiliário | iMobzi | a partir de R$ 129/mês [6] | funil, CRM, locação | não lê os grupos de WhatsApp (a demanda) |
| | ImobNuvem · Ville Imob · SEI CRM | R$ 99 · R$ 54 · R$ 8/mês [6] | CRM e site | idem |
| | Kenlo · Jetimob | sob consulta [6] | plataformas completas para imobiliárias | foco na imobiliária, não no corretor autônomo; caras para o autônomo [6] |
| Portais | ZAP · VivaReal · OLX (Grupo OLX) | por anúncio/plano | oferta de imóveis | não capturam a **demanda** que circula nos grupos; a Biga consulta os portais como fonte |
| Design genérico | Canva e similares | — | peças avulsas | sem dados do imóvel, sem marca padronizada e sem automação |
| Solução caseira | o próprio corretor lendo os grupos | tempo do corretor | — | é o principal "concorrente" a vencer |

**Posicionamento:** os CRMs organizam o que o corretor **já tem**. A Biga traz **o que ele está perdendo**: o pedido do cliente no grupo. Na pesquisa preliminar não encontramos concorrente direto no Radar de grupos (validar em §6).

**Riscos competitivos**
| Risco | Mitigação |
|---|---|
| Um CRM grande copia o Radar | rede e ranking (Fase 2) criam custo de troca; os dados de demanda de Goiânia são um ativo próprio |
| A Meta restringe automação em grupos | migração para a Cloud API (Etapa 1) e Radar baseado em opt-in |
| O Grupo OLX lança uma ferramenta para corretores | a Biga é neutra entre portais e consulta todos |

---

## 5. Por que Goiânia
| Fator | Leitura |
|---|---|
| Base de corretores | 39,6 mil registros em Goiás, crescendo 7% ao ano [3] |
| Condomínios horizontais de alto padrão | permite testar a Fase 3 (piloto Jardins Itália) |
| Operação já rodando | 2 corretores em produção, com aprendizado real |
| Replicação | o modelo serve para outras capitais: SAM Brasil = TAM × 50% de atuantes ≈ R$ 498 mi |

---

## 6. Pesquisa primária pendente (para fechar as lacunas antes da captação)
| # | Ação | Meta | Substitui a premissa de |
|---|---|---|---|
| 1 | Pedir ao CRECI-GO os inscritos **ativos** por município | número oficial | 50% atuantes e 55% em Goiânia |
| 2 | 30 entrevistas com corretores de Goiânia (roteiro: número de grupos, pedidos perdidos por semana, disposição a pagar R$ 97) | ≥ 60% com disposição a pagar | ticket e conversão de 7% |
| 3 | Levantar os condomínios horizontais de alto padrão da região metropolitana | lista com número de lotes | 30 condomínios |
| 4 | Benchmark de preço (teste gratuito) em 5 CRMs | tabela confirmada | preços do agregador [6] |

---

## Fontes
1. [Brasil já conta com 650 mil corretores de imóveis — Paraíba Business](https://paraibabusiness.com.br/brasil-ja-conta-com-650-mil-corretores-de-imoveis-aponta-pesquisa/) · [Agenda Legislativa Cofeci 2025](https://intranet.cofeci.gov.br/agenda-legislativa/2025/AgendaLegislativa2025.pdf)
2. [Mulheres já representam mais de 232 mil corretores — Tribuna do Sertão](https://www.tribunadosertao.com.br/geral/2026/03/30/880565-mulheres-ja-representam-mais-de-232-mil-corretores-de-imoveis-no-brasil)
3. [Quantidade de corretores cresceu em Goiás — O Hoje](https://ohoje.com/2024/08/17/em-um-ano-quantidade-de-corretores-de-imoveis-cresceu-10-em-goias/)
4. [Fiscalização aponta 23.250 casos de corretagem ilegal em 2025 — Portas](https://portas.com.br/noticias/fiscalizacao-aponta-23-250-casos-de-corretagem-ilegal-em-2025/)
5. [Do plantão ao feed: redes sociais viram vitrine para corretores — Paraíba Business](https://paraibabusiness.com.br/do-plantao-ao-feed-redes-sociais-se-tornam-vitrine-para-corretores-de-imoveis-apontam-especialistas/)
6. [Comparativo iMobzi × Kenlo — B2B Stack](https://www.b2bstack.com.br/compare/imobzi-vs-kenlo) · [Jetimob × Kenlo](https://www.b2bstack.com.br/compare/jetimob-vs-kenlo) · [ImobNuvem × Kenlo](https://www.b2bstack.com.br/compare/imobnuvem-vs-kenlo)
