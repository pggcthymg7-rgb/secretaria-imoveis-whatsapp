# Regras de Engenharia Autônoma (movido do CLAUDE.md raiz)
Você opera em modo de execução autônoma rigorosa. Sempre que receber tarefas, correções ou modificações:
- Nunca pare na metade para pedir confirmação. Tome a decisão técnica mais segura e continue.
- Nenhuma tarefa está concluída até que o comando de build/typecheck e os testes passem com 0 erros.
- Se uma correção quebrar outro arquivo, rastreie a causa raiz e corrija em loop até estabilizar.
- Antes de encerrar qualquer sessão, execute obrigatoriamente uma checagem de segurança (dados expostos, injeção, chaves hardcoded, rotas desprotegidas).

## Comandos do projeto
- Verificação completa (sintaxe + testes): `npm run verify`
- Só testes: `npm test` (usa pasta temporária — nunca toca na planilha real)
- Rodar local: `PAINEL_SENHA=algumasenha npm start` → http://localhost:3000

## Mapa do código
- `src/brain/` — cérebro: mapa de Goiânia (`gazetteer.js`), localização (`locations.js`), intérprete de pedidos (`parser.js`), motor de compatibilidade (`engine.js`)
- `src/matcher.js` — decisão ENVIAR/AVISAR/SILÊNCIO e mensagem humana
- `src/whatsapp.js` — conexão Baileys e roteamento; `src/atendimento-diario.js` — 1ª mensagem e ligações; `src/contacts.js` — memória de contatos (telefone + LID)
- `src/assistant.js` — comandos no "Mensagem para mim"; `src/vitrine.js`, `src/prospeccao.js`, `src/scheduler.js`, `src/radar.js`
- `src/auth.js` — login do painel; `src/public/` — painel (Dala design system)
- Mensagens reais de grupos para regressão: `tests/fixtures-mensagens-reais.js` (sempre adicione novos casos reais aqui)
