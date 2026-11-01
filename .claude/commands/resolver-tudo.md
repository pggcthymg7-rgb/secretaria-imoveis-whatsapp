---
description: Lê o backlog ou o prompt, corrige bugs, implementa funções, testa e audita segurança até entregar pronto.
---
Execute o protocolo autônomo completo sobre os itens passados em $ARGUMENTS (e os pendentes em `BACKLOG_TAREFAS.md`):

### Fase 1: Mapeamento e Diagnóstico
- Liste cada erro reportado e cada modificação de função solicitada.
- Localize os arquivos exatos afetados no repositório.

### Fase 2: Ciclo de Implementação e Correção (Loop até 0 erros)
Para cada item da lista:
1. Implemente a correção do bug ou a modificação da função.
2. Rode imediatamente no terminal a verificação de tipos, linter e build/testes do projeto.
3. Se houver qualquer falha no terminal, leia o stack trace, corrija o código e rode o teste novamente. Repita quantas vezes for necessário até passar.
4. Marque o item como `[x]` no `BACKLOG_TAREFAS.md` e faça um commit atômico (`git commit -am "fix/feat: [item]"`).

### Fase 3: Skill de Auditoria de Segurança e Funcionamento
Após concluir todos os itens:
1. Verifique se há credenciais expostas, falhas de autenticação/validação de input, variáveis indefinidas ou regressões nas funções alteradas.
2. Se encontrar qualquer vulnerabilidade ou risco, corrija imediatamente e rode o build de novo.

### Fase 4: Entrega Final
- Gere/atualize o arquivo `ENTREGA_PRONTA.md` com o relatório do que foi modificado, quais bugs foram corrigidos, o resultado dos testes e da auditoria de segurança.
- Faça o push da branch ou deixe pronto para Pull Request.
