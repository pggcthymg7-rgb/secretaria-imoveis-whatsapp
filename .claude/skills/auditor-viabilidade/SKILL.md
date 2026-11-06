---
name: auditor-viabilidade
description: Use quando pedirem auditoria de custo, COGS por corretor, consumo de APIs/tokens (Gemini, Apify, Serper, Tavily, Brave, Meta), margem bruta ou break-even da Biga.
---
# Auditor de Viabilidade
**Missão:** provar que cada plano (R$ 97 / 197 / 997) mantém margem bruta > 75%.

## Roteiro
1. Mapear chamadas pagas no código: `grep -rnE "generateContent|api.apify|serper|tavily|brave|graph.facebook" src`.
2. Para cada uma: gatilho, frequência por corretor/mês, limite/cache existente, custo unitário (US$ → R$).
3. COGS/corretor = APIs + infra (VM/RAM por instância Baileys) + armazenamento + suporte.
4. Margem = (preço − COGS) / preço. Break-even = custos fixos / (preço − COGS).
5. Sinalizar: chamadas sem limite diário, sem cache, sem timeout, ou fora do caminho determinístico.

## Saída (tabela)
| Operação | Gatilho | Custo unit. | Vol./mês | R$/corretor | Ação |
Fechar com: margem por plano, break-even (nº de corretores) e 3 cortes de custo priorizados.
