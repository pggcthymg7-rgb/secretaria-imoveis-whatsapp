# HANDOFF — BIGA (secretária de imóveis no WhatsApp)

## O que faz
BIGA é a secretária do João (corretor em Goiânia). Ela fica conectada ao WhatsApp dele 24h e:
- lê grupos de corretores e manda em particular, com texto humano, os imóveis da carteira que combinam com cada pedido (ENVIAR / AVISAR / SILÊNCIO);
- responde ligações perdidas e só a **1ª mensagem** de quem nunca falou com ele;
- cadastra imóveis por conversa no "Mensagem para mim" (comandos: `ajuda`, `backup`, `atualizar`, `versão`...);
- faz a Vitrine (posts aprovados, 4 horários, grupos escolhidos), a Prospecção, o Radar de buscas, o resumo diário e o Garimpo (leads da web pública).

## Status (01/11/2026)
- **No ar** na VM Oracle grátis: https://147-15-87-168.sslip.io — WhatsApp CONECTADO.
- Código final em `main` (bde3762, v4.1). A VM se atualiza sozinha ~04:15 e, a partir de 02/11, também pelo botão "Atualizar agora" (Ajustes › Sistema) ou pelo comando `atualizar`.
- Testes: 83/83 passando (`npm run verify`) — com o mapa OSM agora versionado (ver sessão 01/11 abaixo).
- **Falta o João:** suspender o Render; colocar a chave Brave/Google e o token Meta no Garimpo.

## Decisões importantes
- Mapa: OpenStreetMap (`src/brain/data/mapa-osm.json`), porque o geo360 da prefeitura não tem exportação aberta (precisa de convênio).
- Garimpo só legal: busca pública, comentários dos próprios posts e bibliotecas de anúncios. Nada de raspar posts de terceiros nem descobrir "quem visitou portais" (LGPD).
- Memória em `DATA_DIR` com gravação atômica, backup diário/semanal e restauração pelo painel.
- O painel tem senha (`PAINEL_SENHA`), cookie HMAC, cabeçalho anti-CSRF e CSP. O repositório é **público**: nunca suba segredos.
- Visual Mercury (DESIGN-2.md) com a BIGA animada em SVG.
- Fluxo: trabalhar no branch → PR → merge em `main` → a VM puxa `main`.

## Como funciona (mapa)
- `index.js` — servidor Express e rotas (todas com `auth.requireAuth`).
- `src/brain/` — gazetteer, locations, parser e engine (o cérebro do match).
- `src/matcher.js` — decide e escreve a mensagem.
- `src/whatsapp.js` — Baileys e roteamento; `src/atendimento-diario.js`; `src/contacts.js` (LID↔telefone).
- `src/assistant.js`, `vitrine.js`, `prospeccao.js`, `scheduler.js`, `radar.js`, `garimpo.js`, `sistema.js`, `backup.js`, `auth.js`.
- `src/public/` — painel (app.js SPA, app.css, biga-art.js).
- `deploy/` — instalar-vm.sh, atualizar.sh (com rollback), cloud-init.sh. `scripts/atualizar-mapa.js` atualiza o mapa OSM toda semana.
- `tests/` — node:test; casos reais em `tests/fixtures-mensagens-reais.js`.

## Como construímos
Fomos por ciclos `/resolver-tudo`: bug real → caso no fixture → correção → teste → auditoria de segurança → PR. Primeiro rodava no Render, depois migramos para a Oracle (E2.1.Micro, Ubuntu 24.04, systemd + Caddy).

## Sessão 01/11/2026 (tarde) — mapa OSM faltando
- Causa: `.gitignore` `data/` ignorava `src/brain/data/`. Corrigido para `/data/` (só a pasta da raiz).
- VM: `deploy/atualizar.sh` ganhou `garantir_mapa` (gera `DATA_DIR/mapa-osm.json` se faltar, como usuário `secretaria`, sem travar a atualização); `deploy/instalar-vm.sh` gera o mapa já na instalação.
- O Overpass recusa conexões vindas da nuvem do Claude (mesmo com rede total). Solução: workflow `.github/workflows/mapa-osm.yml` — o GitHub baixa o mapa, roda `npm test` e grava `src/brain/data/mapa-osm.json` no branch (546 bairros, 408 condomínios, 90 edifícios). Roda ao mudar o workflow/script, pelo botão "Run workflow" e toda segunda 03:17 (só no `main`).
- PR #5 com merge em `main` (df28ac1). VM atualizada pelo comando `atualizar` e confirmada com `versão` = df28ac1 em 01/11.

## BIGA da Laura (namorada do João, corretora) — 01/11/2026
- Modelo: **uma BIGA por corretor na mesma VM**. Mesmo código (`/opt/secretaria`), tudo o mais separado: usuário Linux `secretaria-laura`, `DATA_DIR=/var/lib/secretaria-laura`, `/etc/secretaria-laura.env`, serviço `secretaria-laura`, porta 3001, endereço https://laura.147-15-87-168.sslip.io, backup próprio (03:40, `/var/backups/secretaria-laura`), WhatsApp, carteira, senha, preferências e análises dela.
- Lista de corretores: `deploy/corretores.conf` (`nome endereço porta`). Para mais um corretor: nova linha (porta 3002…) → PR → merge → `atualizar` duas vezes.
- `deploy/corretores.sh` (root, idempotente, valida cada linha) cria tudo; chamado pelo `deploy/atualizar.sh` (cria quando falta; reinicia todas quando há código novo). Se o Caddy não validar, ele tira o `import` e o painel do João não cai.
- Senha dela: a VM gera `SETUP_CODE` (no env dela) e grava em `/var/lib/secretaria/corretores.json`; o João manda `corretores` no "Mensagem para mim" e vê endereço + código. O código some quando ela cria a senha.
- **1ª vez**: o `atualizar` roda a cópia antiga do script, então precisa mandar `atualizar` **duas vezes** (a 2ª cria a BIGA dela). Depois: `corretores`.
- **Na VM (01/11 ~16h):** BIGA da Laura no ar em https://laura.147-15-87-168.sslip.io (HTTPS ok, senha criada, `/api` com 401 sem login). WhatsApp dela **CONECTADO em 03/11 13:36 UTC** (após a correção do 515, PR #9). Conferir com `curl https://laura.147-15-87-168.sslip.io/health`.
- Testado aqui: instância vazia sobe sem a carteira do João; código errado recusado/certo cria senha; script rodado como root com stubs de systemctl/caddy; idempotência; backup. **Não testado na VM real** ainda.

## 03/11/2026 — Laura não conseguia parear (408 → 515)
- 408 = QR venceu; 515 = QR lido, WhatsApp pede reconexão para terminar. A BIGA esperava até 60 s (espera crescente após vários 408) e o celular desistia → voltava a pedir QR.
- Correção `reconnectDelay()` em `src/whatsapp.js`: 515 → 1 s; 408 ou sem aparelho pareado → 3 s; demais quedas seguem crescentes até 60 s. Teste em `tests/whatsapp-fluxo.test.js`.

## 03/11/2026 — BIGA da Laura conectada mas não respondia `ajuda`
- Causa não confirmada (sem acesso aos logs dela). Reforços em `src/whatsapp.js`: `isOwnerChatAsync` (reconhece "Mensagem para mim" que vem só por LID, resolvendo o LID → número); comando recente (≤ 2 min) que chega como `append` é atendido; registros `ASSISTENTE` explicam por que um comando foi ignorado (chat não reconhecido, mensagem antiga, assistente desligada, mensagem ilegível de aparelho novo). Ver "Atividade" na página inicial do painel.

## Busca inteligente (03/11/2026) — `busca <pedido do cliente>` no "Mensagem para mim"
- Ponto de restauração antes dela: branch `restauracao/v4.3-funcionando` (0c53019). O GitHub recusou o push da tag (proxy da sessão), por isso é um branch.
- `src/anuncios.js`: memória de ANÚNCIOS dos grupos (90 dias, máx. 15 mil, `anuncios.json`). Fontes: ao vivo (todos os grupos, sem mudar o fluxo de pedidos), histórico pedido ao celular (`importar histórico` → `sock.fetchMessageHistory(50, âncora, tsMs)`; âncoras em `ancoras_grupos.json`; só funciona com o celular online) e conversa exportada .txt/.zip mandada no "Mensagem para mim" (leitor de zip próprio, sem dependência nova).
- `src/busca-inteligente.js`: entende o pedido com o mesmo `parseRequest`; grupos via `evaluateProperty` (junta o mesmo imóvel de vários grupos por impressão digital); portais via Gemini + `google_search` (chave `GEMINI_API_KEY`, no cabeçalho). **Anti-invenção:** só entra item cujo link está nas fontes do `groundingMetadata` (redirect aberto só se o host for vertexaisearch.cloud.google.com). Limite diário `BUSCA_LIMITE_DIA` (padrão 20, em `busca_inteligente.json`). Profissional × particular: OLX pelo anúncio; ZAP/VivaReal é estimativa. Sempre manda links prontos (ZAP, VivaReal, OLX) com os filtros.
- Corrigido no leitor de preços (afetava também os pedidos dos grupos): "R$ 950 mil" virava 95 mil; "R$ 2,8 mi" virava 2 mi; "de 800 mil a 1.000.000,00" e "entre R$ 900.000 e R$ 1,2 mi" não viravam faixa; "de 1,2 a 1,5 milhão" virava 1.200 reais; "de 400 mil a 1 milhão" virava 1 mi–400 mi. Exportação: hora AM/PM e id por hash do texto.
- Comandos novos: `busca …`, `importar histórico`, `memória`. Casos reais em `tests/fixtures-mensagens-reais.js`; testes em `tests/busca-inteligente.test.js` e `tests/whatsapp-fluxo.test.js`.
- **Não testado com WhatsApp/Gemini reais.** Custo do Google Search no Gemini: conferir no AI Studio (fontes divergem). Ao pôr a chave, o reforço de lugares por IA nos pedidos (`usarIaGemini`, já existia) também liga — dá para desligar em Ajustes.

## Painel › Busca (03/11/2026) — tudo da busca pelo painel E pelo "Mensagem para mim"
| Função | Painel (#busca) | WhatsApp |
|---|---|---|
| Buscar | caixa + Buscar (opção mandar no WhatsApp) | `busca …` |
| Rever buscas (sem gastar outra) | Últimas buscas › Ver / WhatsApp | `minhas buscas`, `ver busca 3` |
| Memória / importar histórico | cartão Memória › Importar histórico | `memória`, `importar histórico` |
| Conversa exportada | Escolher arquivo (.txt/.zip) | mandar o arquivo |
| Portais ligados | toggles OLX/ZAP/VivaReal | `portais olx zap vivareal` / `portais todos` |
| Limite diário | campo (0–500) | `limite busca 30` |
| Guardar anúncios | toggle | `memória ligar/desligar` |
| Chave do Gemini | campo senha | `chave gemini SUA_CHAVE` (pede para apagar a mensagem) |
| Ver configuração | cartão Configurações | `config busca` |
- Config em `settings.json` (`buscaLimiteDia`, `buscaOlx/Zap/Vivareal`, `buscaMemoriaAtiva`); histórico em `busca_historico.json` (30). `src/envfile.js` (saiu do index.js) grava chaves no `.env` para painel e WhatsApp.
- Rotas: `GET/POST /api/busca`, `GET /api/busca/item/:id`, `POST /api/busca/item/:id/whatsapp`, `POST /api/busca/config`, `POST /api/busca/importar-historico`, `POST /api/busca/importar-conversa` (multer em memória, 40 MB, nome UTF-8 corrigido).
- Testado no navegador (Playwright) em computador e celular (390 px, sem rolagem lateral).
- 03/11: **grupos da busca separados dos grupos de pedidos**: `buscaGruposIds` (null = todos) filtra memória ao vivo, histórico, importação e resultado (`grupoNaBusca`; `exp:` sempre entra). Painel › Busca › "Grupos da busca"; WhatsApp `grupos da busca`, `busca grupos 1,4,7`, `busca grupos tirar 4`, `busca grupos todos`. Em Ajustes a lista virou "Grupos de pedidos".
- 03/11: chave do Gemini: `src/gemini-chave.js` limpa (espaços, invisíveis, aspas, "GEMINI_API_KEY=") e confere no Google (lista de modelos) antes de salvar; a regra antiga `[\w-]{20,200}` recusava chave válida.
- 03/11: TODAS as páginas: redesenho na mesma página não anima mais (`.sem-anim`), mantém rolagem; "Hoje" só redesenha se o status mudou e mantém o que foi digitado; `render({ manterCampos })`. Painel pede assets com `?v=<versão>` (sem cache velho após atualizar).
- 03/11: durante a importação a página se redesenhava a cada 5 s ("piscava", apagava o texto e a rolagem). Agora só o texto do andamento (`#impAndamento`: "X de Y grupos lidos · N anúncios · agora: grupo") é atualizado; o pedido digitado fica em `S.buscaTexto`.

## Próximos passos (BACKLOG_TAREFAS.md)
1. ~~Confirmar atualização pelo celular~~ — feito em 01/11 (df28ac1).
2. Revisar os imóveis da carteira: edifício, suítes, vagas, condomínio, permuta.
3. Ensinar no Cérebro os edifícios que ele mais trabalha (Metropolitan, Brookfield).
4. Multiusuário — **feito para a Laura (01/11), ver seção abaixo**. Virar produto de verdade (vários logins num site só) fica para depois.
5. Opcional: deixar o repositório privado (aí a VM vai precisar de token para o git).

## Ferramentas para a próxima sessão
- Graphify: workspace `joao-s-workspace-790dff`, repo `pggcthymg7-rgb/secretaria-imoveis-whatsapp`. Use `graphify_find` / `query_graph` antes de abrir arquivos inteiros.
- Render MCP: serviço `srv-dbh7t6k9v7es73b9h0v0` (só para suspender).
- Sempre responder em português.
- O João é iniciante: sempre explicar em palavras simples qualquer termo técnico (PR, branch, merge, rede, etc.) quando pedir algo a ele.
