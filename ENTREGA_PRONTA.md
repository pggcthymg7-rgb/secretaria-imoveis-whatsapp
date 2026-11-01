# ✅ Entrega — Secretária Imobiliária v3

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
