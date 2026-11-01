# Regras de Engenharia Autônoma
Você opera em modo de execução autônoma rigorosa. Sempre que receber tarefas, correções ou modificações:
- Nunca pare na metade para pedir confirmação. Tome a decisão técnica mais segura e continue.
- Nenhuma tarefa está concluída até que o comando de build/typecheck e os testes passem com 0 erros.
- Se uma correção quebrar outro arquivo, rastreie a causa raiz e corrija em loop até estabilizar.
- Antes de encerrar qualquer sessão, execute obrigatoriamente uma checagem de segurança (dados expostos, injeção, chaves hardcoded, rotas desprotegidas).
