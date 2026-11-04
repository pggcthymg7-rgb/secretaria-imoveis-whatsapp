# ✅ Entrega v5 (noite de 04/11/2026): vitrine, busca mais esperta, Capas, Fichas PDF e 🎯 Quem procura

## O que foi feito
| Pedido | Resultado |
|---|---|
| **1. Vitrine sem limite de 5** | A vitrine manda até **10 imóveis com foto** e **20 só com texto** por horário (a escolha é sua). Entre um imóvel e outro ela espera **20 a 40 s**, e entre grupos 25 a 70 s, para o WhatsApp não tratar como spam. |
| **2. Busca com discernimento** | **"Até 200 m²"** agora quer dizer **perto de 200: de 160 a 210 m²** (80% a 105%). **"Em torno de 200"** vai de 180 a 220. **"Até 20 mil m² ou menos"** continua aceitando qualquer tamanho abaixo. **"Apto com piscina"** = piscina **no apartamento**; **"condomínio/área de lazer com piscina"** = piscina do prédio; **"casa com piscina"** = a da casa. **Decorado = mobiliado**. Sinônimos novos: apê/ape, dorms, porteira fechada, todo equipado, com móveis, varanda com churrasqueira, lavabo, hidro/banheira/ofurô, vista livre, automação, ar-condicionado, aquecimento. A faixa pode ser ajustada sem mexer no código (`AREA_ATE_PISO_PCT`, `AREA_ATE_TETO_PCT`, `AREA_TORNO_PCT`). |
| **3. Casa de condomínio** | Virou **categoria própria**: no cadastro, nos pedidos ("casas de condomínio", "cond fechado"), nos filtros da Busca e nos portais (ZAP: CONDOMINIUM). |
| **4. Navegação** | As 12 abas soltas viraram **4 grupos**, com ícones: ☀️ **Meu dia** (Hoje, Radar, Atendimento), 🏠 **Imóveis** (Carteira, Vitrine, Capas, Fichas PDF), 🤝 **Clientes** (Busca, Garimpo, Prospecção) e ⚙️ **Configurar** (Cérebro, Simulador, Ajustes). Cada página tem um submenu e uma trilha "Início › Imóveis › Vitrine". A página inicial mostra os 4 grupos em cartões. |
| **5. Descrição completa** | O post da vitrine leva a **descrição inteira** (antes: 1ª frase, 220 caracteres). O botão **"Texto completo da carteira"** refaz os posts antigos. A carteira aceita descrições de até 60 mil caracteres. |
| **6. Capas (beta): canvas imobiliário** | Em Imóveis › **Capas**, a BIGA monta a capa do Instagram com foto, nome e preço. Formatos: Feed 4:5, Quadrado e Story. Tudo é editável: **1.838 fontes do Google** com busca e prévia, **roda de cores** (com transparência, paleta e conta-gotas), escala **uniforme ou separada na horizontal e na vertical**, camadas (foto, texto, forma, degradê, logo), arrastar, redimensionar, girar, alinhar, travar, ocultar, ordem, duplicar, desfazer/refazer, guias de centro, filtros na foto (brilho, contraste, saturação, desfoque), enquadramento da foto, sombra, contorno, etiqueta de fundo e texto que cresce para cima. Textos com **{nome} {preco} {bairro} {quartos}…** trocam sozinhos. Você **salva seus modelos** e usa **"Aplicar em outros imóveis"** para gerar as capas de toda a carteira. Depois é só baixar ou mandar para a Vitrine. |
| **7. Fichas PDF (pedido extra)** | Em Imóveis › **Fichas PDF** (ou o botão "Ficha PDF" na Vitrine e na Carteira): um **PDF moderno e minimalista** com foto grande, preço, números, diferenciais, descrição completa, galeria e rodapé com o seu contato. Tudo é editável: título, preço, diferenciais, descrição, fotos e a ordem delas, cor de destaque e contato. **Baixar**, **ver antes** ou **enviar direto pelo WhatsApp** para um número. O comando `pdf 12` e o PDF que os corretores pedem nos grupos passaram a usar este modelo novo. |
| **8. Surpresa: 🎯 Quem procura este imóvel?** | O dia a dia do corretor: chegou um imóvel novo, quem pediu algo assim? Ao cadastrar (pelo painel ou pelo WhatsApp), a BIGA **relê todos os pedidos dos grupos dos últimos 60 dias** e avisa você no WhatsApp quem bate em tudo e quem está "quase" (com o que falta confirmar), com o link wa.me de cada um. Em Carteira › **🎯 Quem procura** você marca e toca em **Oferecer**: ela manda no privado de cada um, um por vez, com o mesmo texto humano e as mesmas travas dos grupos. No WhatsApp: `quem procura 12` e `oferecer 12`. |

## Bugs corrigidos durante o trabalho
- Pedido vago ("alguém tem contato de pintor?") batia com qualquer imóvel no match reverso: agora exige tipo + pelo menos 1 critério real.
- Capas: as fontes do Google não apareciam no canvas (ele desenhava antes de a folha de fontes carregar).
- Capas: nome comprido cobria os detalhes. Agora o nome "cresce para cima" e o texto é medido antes de ser posicionado.
- Fichas PDF: a descrição longa invadia o rodapé, e as caixinhas de foto eram restauradas erradas ao redesenhar a tela.

## Testes
- `npm run verify`: **69 arquivos, 0 erros · 158 testes, 158 passando** (eram 147). Testes novos:
  - caso real da corretora no fixture (`aptoDecoradoPiscina`);
  - vocabulário (piscina, mobília, apê, gourmet, hidro, "em torno de", "ou menos");
  - casa de condomínio;
  - vitrine 10/20 com pausa e descrição completa;
  - Capas (lista branca, injeção de CSS pelo nome da fonte, logo de URL externa recusado);
  - Fichas PDF (PDF válido, várias páginas, fotos só locais, contato compartilhado, `__proto__`);
  - 🎯 Quem procura (match x quase, já recebeu, um pedido por corretor, 60 dias, pedido vago).
- **Testado no navegador** (Chromium, Playwright) com a BIGA rodando local:
  - Capas: abrir, trocar fonte, roda de cores, escala horizontal, arrastar, salvar modelo, gerar em lote, baixar JPG e usar na Vitrine;
  - Fichas PDF: editar, trocar a cor, baixar e conferir as páginas;
  - Carteira: 🎯 Quem procura e Oferecer;
  - navegação nova e celular (390 px).
  - Nenhum erro no console.
- **Não testado com WhatsApp real** (a sessão não tem um aparelho pareado): o envio da Ficha PDF e o "Oferecer" foram testados até o ponto em que o WhatsApp precisa estar conectado (a mensagem "WhatsApp desconectado" aparece certa).

## Auditoria de segurança
- **Rotas novas** (`/api/capas*`, `/api/pdf/*`, `/api/property/:id/quem-procura`, `/api/property/:id/oferecer`): todas atrás do login e do cabeçalho anti-CSRF.
- **Entradas**: tudo passa por lista branca.
  - Modelos de capa: só campos conhecidos, números dentro de faixas, cores só `#rrggbb[aa]`, nome de fonte só letras, números e espaços (não injeta CSS), logo só como imagem `data:` pequena (sem URL externa), até 40 modelos e 40 camadas.
  - Fichas PDF: fotos só da própria pasta de fotos (sem caminho nem URL); nome do arquivo baixado só com letras, números e "_"; o id `__proto__`/`constructor` é recusado.
  - Envio: telefone normalizado e conferido no WhatsApp; os códigos de pedido em `oferecer` precisam ser `A123`.
- **Editor no navegador**: só grava campos de uma lista fixa (sem poluição de protótipo) e todo texto mostrado passa por `esc()`. A CSP não mudou (as fontes vêm de fonts.googleapis.com/gstatic, que já eram permitidos).
- **Anti-spam**: a vitrine e o "Oferecer" têm pausa entre envios e respeitam o limite por hora e o "não repetir oferta".
- **Segredos**: nenhuma chave nova no código; o repositório continua sem segredos.

## O que você precisa fazer
1. Dar o merge na PR (depois dos 4 checks verdes) e mandar `atualizar` no "Mensagem para mim".
2. Abrir Imóveis › **Fichas PDF** e preencher o seu contato uma vez (nome, CRECI, telefone).
3. Testar a Capa de um imóvel e salvar o seu modelo.
4. Cadastrar um imóvel e ver o aviso 🎯 no WhatsApp (se alguém tiver pedido algo parecido nos grupos).

---

# ✅ Entrega v4.1 — Atualizar a BIGA pelo celular

- **Ajustes › Sistema**: mostra a versão em uso e as últimas atualizações, e tem o botão **Atualizar agora**.
- **WhatsApp**: comandos `atualizar` e `versão` no "Mensagem para mim".
- **Como funciona**: o painel só cria um pedido na pasta de dados. Quem atualiza é o sistema da VM, com o mesmo procedimento seguro da madrugada: baixa só a `main`, verifica, reinicia e volta para a versão anterior se algo falhar.
- **Ativação**: entra sozinho na **próxima atualização automática** (~04:15). Daí em diante não precisa mais do Cloud Shell.
- **Testado** numa VM Ubuntu 24.04 com systemd, reproduzindo a sua: versão v4 → atualização da madrugada (instala o gatilho) → botão no painel → versão nova no ar e resultado registrado. `npm run verify`: 41 arquivos, 0 erros · 62/62 testes.
- **Segurança**: rotas exigem login e o cabeçalho anti-CSRF; o app não ganhou nenhum privilégio novo.

---

# ✅ Entrega v4 — BIGA: mapa ampliado, painel novo e agente Garimpo

## O que foi feito
| Tarefa | Resultado |
|---|---|
| **1. Mapa da prefeitura** | O portal geo360 só libera dados com um token de "visitante" gerado pelo próprio site, e usá-lo a partir do nosso servidor seria contornar o controle de acesso da prefeitura. Por isso **não foi usado**. No lugar, entrou o **OpenStreetMap** (dados abertos, licença ODbL): **548 bairros e 394 condomínios** de Goiânia e região metropolitana, com coordenadas. Isso se soma aos 109 bairros, 41 condomínios e 67 marcos que BIGA já conhecia. A VM baixa o mapa completo de novo **todo domingo**. Para usar o geo360 oficialmente, é preciso pedir à prefeitura uma exportação ou um acesso de API. |
| **2. Busca nos grupos** | Campo de busca por nome e botão "Só os marcados" nas listas de grupos (Ajustes e Vitrine). A busca filtra na própria tela, sem perder o que já foi marcado. |
| **3. Nome** | A secretária agora é a **BIGA**: no painel, na ajuda, nos alertas, no resumo diário e no backup. |
| **4. Painel novo** | A página inicial mostra a **BIGA**, uma ilustração vetorial animada: respira, pisca, mexe o cabelo, os olhos seguem o cursor e a boca "fala" a descrição de cada item. O **menu fica ao lado dela**, sobre o céu da hora azul com o skyline de Goiânia em parallax. Há transição em cortina circular entre páginas, entrada animada dos blocos e contadores. O visual segue o `DESIGN-2.md` (Mercury). |
| **5. Agente Garimpo** | Varredura 24h, só em fontes oficiais: (a) **posts públicos da última semana** pedindo imóvel em Goiânia (Brave Search ou Google), interpretados pelo cérebro e cruzados com a carteira; (b) **comentários de interesse nos SEUS posts** do Instagram/Facebook (API oficial da Meta); (c) **campanhas de imóveis no ar** pelas bibliotecas oficiais de anúncios (Meta, Google, TikTok) e Google Trends de Goiás. Cada lead recebe uma pontuação, gera alerta no WhatsApp e entra no resumo diário. |

### O que o Garimpo não faz, e por quê
- **Saber quem pesquisou no Google ou visitou ZAP/VivaReal/OLX:** esses dados são privados das empresas e não existem para terceiros.
- **Ler comentários em posts de outras pessoas no Instagram/TikTok/Facebook:** viola as regras das plataformas (risco de bloqueio da conta) e a LGPD.
- Os leads guardam só o link público, o trecho e o nome exibido, por 30 dias. O contato é sempre feito pelo corretor.

## Testes
- `npm run verify`: **39 arquivos, 0 erros · 58 testes, 58 passando**. São 7 testes novos:
  - Garimpo: varredura web, oferta ignorada, link `javascript:` bloqueado, sem duplicar, comentários dos seus posts, falta de chaves, status;
  - mapa aberto: reconhecimento de condomínio e bairro novos e casamento com a carteira;
  - desempenho: menos de 60 ms por mensagem (medido: ~12 ms).
- Painel testado no navegador (desktop 1440 e celular 390): login, início, Hoje, Garimpo, Radar, Carteira, Vitrine, Ajustes e Simulador. Sem erros de JavaScript e sem rolagem horizontal.

## Auditoria de segurança
| Ponto | Situação |
|---|---|
| Rotas `/api/garimpo/*` | ✅ exigem login e o cabeçalho anti-CSRF |
| Chaves do Garimpo (Brave, Google, Meta) | ✅ gravadas em `DATA_DIR/.env` (600); o painel só recebe "configurada sim/não" |
| Links vindos da internet | ✅ só `http(s)`; abertos com `rel="noopener"`; todo texto externo é escapado |
| Dados de terceiros | ✅ retenção de 30 dias, sem coleta fora das APIs oficiais |
| Backup | ✅ passou a incluir os leads do Garimpo |
| Dependências | ✅ `npm audit`: 0 vulnerabilidades |
| Portal geo360 | ✅ não acessado de forma automática (exigiria contornar o acesso do site) |

## O que depende de você
1. **Atualizar a VM agora** (ou esperar a atualização automática das ~04:15): no Cloud Shell, entre na máquina e rode `sudo bash /opt/secretaria/deploy/atualizar.sh`.
2. **Ligar o Garimpo:** criar uma chave grátis em brave.com/search/api, colar em Garimpo › Chaves e ligar o interruptor. Opcional: o token da sua Página do Facebook, para os comentários dos seus posts.

---

# ✅ Entrega v3.1 — Máquina virtual gratuita, 24h e com memória permanente

## O problema
No Render gratuito o disco é apagado a cada reinício ou publicação. Isso apagava a sessão do WhatsApp (QR Code de novo), a memória de contatos (motivo principal da "1ª mensagem para todo mundo"), o radar e os cadastros feitos pelo painel.

## O que foi feito
| Item | Arquivo |
|---|---|
| **Instalador da VM** (Ubuntu 22/24; Oracle, Google ou qualquer VPS): Node 22, usuário dedicado, memória em `/var/lib/secretaria`, segredos em `/etc/secretaria.env` (640), serviço systemd que sobe no boot e reinicia se cair, HTTPS grátis (Caddy + sslip.io), firewall 80/443 (inclui as regras da Oracle), swap automático, fuso de Brasília | `deploy/instalar-vm.sh` |
| **Atualização automática diária** com verificação e **volta para a versão anterior** se falhar | `deploy/atualizar.sh` |
| **Backup diário local** (14 dias) | criado pelo instalador |
| **Instalação sem terminal**: script para colar ao criar a VM | `deploy/cloud-init.sh` |
| **Backup e restauração de toda a memória**: carteira, fotos, configurações, contatos, radar, vitrine, prospecção. Painel (Ajustes › Backup da memória), comando `backup` no WhatsApp e envio automático todo domingo no "Mensagem para mim" | `src/backup.js` |
| App: escuta só em `127.0.0.1` atrás do HTTPS; chaves salvas pelo painel ficam na pasta permanente | `index.js` |
| **Guia passo a passo pelo celular** (Oracle São Paulo e alternativa Google) | `GUIA_VM_GRATUITA.md` |

## Testes
- `npm run verify` → **35 arquivos, 0 erros · 51 testes, 51 passando** (4 novos de backup: ida e volta, arquivo malicioso, arquivo inválido, API com e sem login).
- **Instalação real testada** num Ubuntu 24.04 com systemd (em contêiner):

| Verificação | Resultado |
|---|---|
| Instalação do zero | ✅ concluída, serviço ativo e habilitado no boot |
| Processo roda sem privilégios (usuário `secretaria`) | ✅ |
| HTTPS pelo Caddy, cookie `Secure` | ✅ |
| Porta interna 3000 inacessível de fora | ✅ |
| Acesso sem login | ✅ 401 |
| **Reboot da máquina** | ✅ voltou sozinha, carteira e chave do Gemini preservadas |
| Backup diário e timers agendados | ✅ |
| Atualização para versão nova | ✅ atualizou e verificou a saúde |
| **Atualização com versão quebrada** | ✅ detectou o erro e voltou para a anterior |
| Reinstalar por cima | ✅ memória e senha preservadas |
| Restaurar backup pelo painel | ✅ restaurou e o serviço reiniciou sozinho |

## Auditoria de segurança
| Ponto | Situação |
|---|---|
| Rotas novas de backup/restauração | ✅ exigem login (e cabeçalho anti-CSRF na restauração) |
| Restauração com nomes maliciosos (`../`, `.env`, `.html`) | ✅ ignorados (testado) |
| Backup não leva a sessão do WhatsApp nem o hash da senha | ✅ |
| Instalador não imprime a senha; segredos só em `/etc/secretaria.env` (root/grupo) | ✅ |
| Serviço com `ProtectSystem=strict`, `NoNewPrivileges` e escrita só na pasta de dados | ✅ |
| **Repositório público** expunha seu número em `settings.json` | ✅ removido do arquivo (⚠️ continua no histórico do Git) |
| Dependências | ✅ `npm audit`: 0 vulnerabilidades |
| Atualização automática usa a `main` do GitHub | ⚠️ quem puder publicar na `main` atualiza a VM. Hoje só você tem esse acesso |

## O que depende de você
1. **Criar a conta na Oracle e a VM** seguindo os Passos 1 a 5 do `GUIA_VM_GRATUITA.md` (exige cadastro com cartão, que não posso fazer por você).
2. Recomendado: tornar o repositório **privado** no GitHub (as fotos e a carteira estão públicas). Se fizer isso, me avise: a instalação passa a precisar de um token de leitura.

---

# ✅ Entrega anterior — Secretária Imobiliária v3

Branch: `claude/lucid-maxwell-eyigut`

## O que foi corrigido

| Problema relatado | Causa encontrada | Correção |
|---|---|---|
| "Flat Metropolitan ou Brookfield" recebeu apê do Viva Sudoeste | Nomes de edifício eram ignorados; bastava ser apartamento mobiliado | Nomes próprios viram critério obrigatório: o imóvel precisa ter esse nome no cadastro. Flat é um tipo próprio. Pedido vago não é enviado sozinho |
| 9 alertas de dúvida ("local não reconhecido") | A lista de setores era pequena e sem tolerância; "região" na frase disparava dúvida | Mapa de Goiânia: 109 bairros, 41 condomínios, 67 marcos/avenidas, 26 cidades com coordenadas. Aceita erros de digitação, vizinhança e raio em km |
| Ágio e permuta sempre viravam dúvida | Eram tratados como bloqueio | Viraram critérios: ágio exige imóvel de ágio (compara o valor do ágio); permuta exige "aceita permuta". Se o cadastro não informa, ela te pergunta |
| Telefone da assinatura podia virar preço; "R$1.2" não entendido | Leitura de números sem contexto | Preço só com contexto (R$, mil, até, valor…). Telefones, m², km, anos e vagas são descartados. "R$1.2" = 1,2 milhão |
| Endereço do imóvel dado em permuta era lido como local procurado | — | Trecho de permuta é separado do que se procura |
| Excesso de alertas | Avisava mesmo sem nenhum imóvel parecido | Só avisa quando existe imóvel que atende tudo menos um dado do cadastro |
| **1ª mensagem respondia todo mundo** | (1) WhatsApp passou a usar ID novo (LID) no lugar do telefone; (2) memória apagada a cada reinício do Render; (3) agenda e histórico ignorados | Memória por telefone **e** LID (com tradução LID→telefone); agenda e histórico contam como "conhecido"; ignora mensagens antigas/offline e respostas a mensagens; aquecimento quando a memória está vazia |
| Link wa.me nos alertas inválido | Usava o LID | Mostra o telefone real |

### Como ficaram os pedidos reais que você mandou
| Pedido | Agora entende |
|---|---|
| Flat metropolitan ou Brookfield mobiliado, PDF | Flat · edifício "metropolitan"/"brookfield" · mobiliado · manda PDF |
| Ágio sobrado Jardins Marselha/Lyon até 500 mil, 3 suítes, piscina, tem permuta | ÁGIO · Sobrado · Jardins Marselha/Lyon · 3+ suítes · ágio até R$ 500 mil · piscina · quer permuta (telefone ignorado; Cidade Verde ignorado) |
| Casa alto padrão 3q/2 suítes… sem região, até 1,1 mi | Casa · qualquer região · 3 quartos · 2+ suítes · vagas independentes, gourmet, piscina, quintal, despensa · até R$ 1,1 mi |
| Apto 3Q 1 suíte 500mil que aceite permuta | Apartamento · 3 quartos · 1+ suíte · em torno de R$ 500 mil · permuta |
| … na região da Marechal Rondom | + Setor Marechal Rondon e vizinhos |
| Ágio no Lyon em torno de 200mil | ÁGIO · Jardins Lyon · ágio ~R$ 200 mil |
| Apto 1 quarto até 50 m² região da Praça Tamandaré | Apartamento · 1 quarto · até 50 m² · Setor Oeste e vizinhos |
| Casa térrea perto do DETRAN até 600 mil, mín. 3 quartos | Casa térrea · Cidade Jardim e vizinhos · 3+ quartos · até R$ 600 mil |
| Chácara raio 40 km, condomínio 4–5 mil m² / fora até 20 mil m², 900 mil | Chácara · até 40 km de Goiânia · duas alternativas de área · escriturada · até R$ 900 mil · água como preferência |
| Casa ou sobrado em condomínio Jardins de Senador Canedo até R$1.2 | Casa/Sobrado · condomínio · Senador Canedo · até R$ 1,2 mi |

## Funções novas
- **Assistente no WhatsApp** ("Mensagem para mim"): cadastrar imóvel com texto + fotos, corrigir campos, salvar; lista, ver, PDF, ativar/desativar; **enviar A12** para aprovar alertas; vitrine; pausar/retomar; resumo diário às 19h.
- **Vitrine**: até 4 horários/dia, grupos de divulgação escolhidos, post (1 foto + texto) que você aprova, rodízio automático, intervalo entre grupos.
- **Prospecção**: seleção de contatos sincronizados ou lista colada, mensagem com {nome}/{saudacao} e variações, imagem opcional, 1 envio por vez com intervalo aleatório, limite diário, horário comercial, descadastro "SAIR".
- **Radar de buscas**: histórico de todos os pedidos, decisão tomada, aprovação com 1 clique e **demanda** (bairros, tipos e faixas de preço mais pedidos — guia de captação).
- **Ficha em PDF** do imóvel quando o corretor pede.
- **Cérebro editável**: ensine edifícios, condomínios e lugares no painel.
- **Painel novo** (Dala design system): Visão geral, Radar, Carteira, Vitrine, Prospecção, Atendimento, Cérebro, Simulador (mostra por que cada imóvel ficou de fora) e Ajustes. Funciona no celular.
- **Proteções anti-bloqueio**: no máximo 30 ofertas por hora, o mesmo imóvel não é reenviado à mesma pessoa por 15 dias, digitação simulada.

## Testes
`npm run verify` → **33 arquivos verificados, 0 erros · 47 testes, 47 passando**
- `tests/cerebro.test.js` — as 10 mensagens reais + casos de regressão (oferta, pedido vago, aluguel, Leste × Oeste)
- `tests/atendimento.test.js` — 1ª mensagem: LID × telefone, agenda, histórico, citação, pausa
- `tests/funcoes.test.js` — assistente, vitrine (rodízio/aprovação), prospecção (fila, SAIR)
- `tests/seguranca.test.js` — login, CSRF, upload, path traversal, CSV, config
- `tests/whatsapp-fluxo.test.js` — ponta a ponta com WhatsApp simulado (grupo → envio, sem duplicar, grupo não monitorado, assistente sem loop, 1ª mensagem)
- Painel testado no navegador (desktop e celular): 9 telas, sem erros de JavaScript, sem rolagem horizontal.
- O servidor subiu localmente e gerou o QR Code real do WhatsApp.

## Auditoria de segurança
| Risco encontrado | Gravidade | Situação |
|---|---|---|
| Painel e API sem senha: qualquer um com o link via o **QR Code** (sequestro do WhatsApp), a carteira e mudava configurações | Crítica | ✅ Login obrigatório (scrypt, cookie HttpOnly/SameSite/Secure assinado, 8 tentativas a cada 15 min) |
| `.env` versionado no Git | Alta | ✅ Removido do Git e no `.gitignore` (histórico conferido: nenhuma chave Gemini foi commitada) |
| Upload aceitava qualquer arquivo (HTML/JS servido pelo site) | Alta | ✅ Só JPG/PNG/WEBP até 10 MB, nome aleatório, `nosniff` |
| Caminho de foto permitia ler arquivos do servidor (`../../.env`) e mandar pelo WhatsApp | Alta | ✅ Restrito à pasta de fotos |
| Injeção de variáveis no `.env` via configurações | Média | ✅ Lista de chaves permitidas e sem quebras de linha |
| CSRF / clickjacking | Média | ✅ Cabeçalho obrigatório, SameSite=Strict, CSP, `frame-ancestors 'none'` |
| QR Code gerado por biblioteca externa (CDN) | Baixa | ✅ Gerado no servidor |
| Fórmulas em CSV/Sheets | Baixa | ✅ Neutralizadas |
| Webhook do Sheets aberto | Baixa | ✅ Token (`GOOGLE_SHEETS_TOKEN`) |
| Dependências | — | ✅ `npm audit`: 0 vulnerabilidades |

## ⚠️ O que você precisa fazer
1. **Definir `PAINEL_SENHA`** no Render (Environment). Sem ela, o painel pede um código que aparece no log do servidor.
2. **Memória permanente**: no Render gratuito tudo é apagado a cada reinício (sessão, contatos conhecidos, cadastros feitos pelo painel). Para manter de graça, use uma VM Oracle Always Free com `instalar-nuvem.sh` e `DATA_DIR`. Detalhes no `MANUAL_COMPLETO_DA_SECRETARIA.md`.
3. **Grupos de busca**: em Ajustes, marque os grupos (ex.: BUSCA ADÃO). Configuração antiga por nome continua valendo.
4. Complete o cadastro do imóvel #6 (edifício "Viva Sudoeste", suítes 1, condomínio 500, permuta…) — e dos próximos.
5. `settings.json` versionado contém seu número de alerta. Se o repositório for público, considere torná-lo privado.

## Limitações conhecidas
- Coordenadas do mapa são aproximadas (nível de bairro); ajuste ou ensine lugares pelo Cérebro.
- Mensagens recebidas enquanto a secretária estava desconectada não são processadas (de propósito, para não responder coisas antigas).
- O Gemini é opcional: sem chave tudo funciona; com chave ele só reforça a leitura de nomes de lugares.
- Prospecção em massa pode levar a bloqueio do número pelo WhatsApp — use para contatos que conhecem você, dentro dos limites sugeridos.
