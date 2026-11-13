## O que muda
<!-- 1 a 3 linhas: o que o corretor/admin vai perceber -->

## Por quê

## Checklist
- [ ] `npm run verify` com 0 erros (o CI confere)
- [ ] Lógica de negócio, prompts e jeito de responder da BIGA intactos (ou mudança explicada acima)
- [ ] Isolamento entre corretores mantido (dados, WhatsApp, login, chaves)
- [ ] Corretor não ganha acesso à estrutura do SaaS (atualizar sistema, equipe)
- [ ] Margem bruta > 75% preservada (nenhuma chamada nova de API paga sem teto)
- [ ] Scripts de `deploy/` testados (rodam como root na VM)

## Como testar
