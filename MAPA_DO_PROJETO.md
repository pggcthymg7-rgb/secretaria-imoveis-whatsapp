# Mapa do Projeto — BIGA Secretária Imobiliária

Guia simples de onde cada parte do sistema mora e onde mexer para fazer alterações com segurança.

---

## 1. Estrutura de Pastas

```text
.
├── index.js                  # Ponto de partida oficial (liga servidor web, WhatsApp e agendamentos)
├── imoveis.csv               # Modelo inicial da carteira de imóveis (usado em dev e na 1ª instalação da VM)
├── settings.json             # Modelo inicial de configurações (usado em dev e na 1ª instalação da VM)
├── GOOGLE_SHEETS_SCRIPT.gs   # Script do Google Planilhas entregue pelo botão do painel
├── fonts/                    # Fontes .ttf usadas na geração dos PDFs 16:9
├── deploy/                   # Scripts de instalação, atualização, HTTPS e multi-VM do servidor Linux
├── scripts/                  # Ferramentas de checagem (check.js), pós-instalação e atualização do mapa
├── docs/auditorias/          # Relatórios históricos das auditorias técnica e E2E
├── tests/                    # Testes automatizados (rodados com npm test)
└── src/                      # Código principal da aplicação
    ├── public/               # Telas do painel web (index.html, app.css, app.js roteador, js/*.js por domínio, capas.js e biga-art.js)
    ├── web/                  # Servidor web Express (app.js, helpers.js e rotas por domínio em routes/)
    ├── config/               # Caminhos, gravação em JSON, .env, ajustes, login, backup, métricas e atualização
    ├── whatsapp/             # Conexão WhatsApp (Baileys), reconexão, atendimento 1ª msg/ligações, contatos e comandos
    ├── brain/                # Cérebro de leitura: bairros/condomínios (mapa OSM), parser de pedidos e motor de busca
    ├── domain/               # Regras de negócio: carteira, matcher, radar, vitrine, prospecção, garimpo, capas, agendador
    ├── integrations/         # Integrações externas (chaves/modelos Gemini e motores de busca nos portais)
    ├── pdf/                  # Geração de ficha A4 e apresentação PDF 16:9 com worker isolado e cache
    └── tenancy/              # Estrutura SaaS multi-corretor (isolamento de sessão, rotas de equipe e contêiner por corretor)
```

---

## 2. Onde Mexer para Cada Tipo de Ajuste

| O que você quer alterar | Pasta / Arquivo | O que fica lá |
|---|---|---|
| **Visual, cores, rotas e estrutura geral do painel** | `src/public/` | `index.html`, `app.css`, `app.js` (roteador), `js/core.js`, `js/ui.js`, `biga-art.js` |
| **Telas de Entrada (Login, Início e Hoje)** | `src/public/js/inicio.js` | Primeiro acesso, tela inicial com menu e painel do dia + QR Code |
| **Telas de Meu Dia (Radar e Atendimento)** | `src/public/js/dia.js` | Pedidos dos grupos, aprovações e regras de 1ª mensagem/ligação |
| **Tela da Carteira (Imóveis e Quem Procura)** | `src/public/js/carteira.js` | Cadastro, edição, fotos e match reverso nos grupos |
| **Tela da Vitrine (e ligação com Capas)** | `src/public/js/vitrine.js` | Publicação automática nos grupos e montagem da aba Capas |
| **Tela de Fichas PDF (16:9)** | `src/public/js/pdf.js` | Seleção de modelos, paletas, ordem de páginas, prévia e envio WhatsApp |
| **Tela de Busca Inteligente** | `src/public/js/busca.js` | Filtros dos portais, histórico de grupos e importação `.txt`/`.zip` |
| **Telas de Garimpo e Prospecção** | `src/public/js/clientes.js` | Leads encontrados na web e campanhas graduais no WhatsApp |
| **Telas de Configurar (Cérebro, Simulador, Ajustes, Corretores)** | `src/public/js/config.js` | Lugares ensinados, teste de mensagens, chaves/backup e equipe multi-tenant |
| **Editor visual de capas no navegador** | `src/public/capas.js` e `src/public/fontes-google.json` | Canvas, camadas, presets e lista de fontes Google |
| **Salvar/carregar modelos de capa no servidor** | `src/domain/capas.js` | Persistência dos modelos salvos (`capas.json`) |
| **Rotas HTTP e endpoints da API (`/api/...`)** | `src/web/app.js` e `src/web/routes/*.routes.js` | Segurança HTTP em `app.js` e rotas separadas por área (`status`, `carteira`, `config`, `radar`, `pdf`, `vitrine`, `prospeccao`, `busca`) |
| **Conexão com WhatsApp, QR Code e queda/reconexão** | `src/whatsapp/client.js` e `src/whatsapp/reconexao.js` | Socket Baileys, leitura de grupos e disparo de mensagens |
| **Comandos no "Mensagem para mim" (`ajuda`, `busca`, etc.)** | `src/whatsapp/assistant.js` | Interpretador de comandos do dono via WhatsApp |
| **Atendimento diário (1ª mensagem e ligação perdida)** | `src/whatsapp/atendimento-diario.js` e `src/whatsapp/contacts.js` | Saudação inicial, cooldown e memória telefone + LID |
| **Entendimento de pedidos, bairros e condomínios** | `src/brain/` (`parser.js`, `locations.js`, `gazetteer.js`, `engine.js`, `text.js`) | Leitura de texto imobiliário, sinônimos e mapa OSM de Goiânia |
| **Regras de envio (ENVIAR / AVISAR / texto humano)** | `src/domain/matcher.js` | Decisão de match, montagem da resposta natural e reforço opcional de lugares via Gemini |
| **Carteira de imóveis e integração Google Planilhas** | `src/domain/sheets.js` e `GOOGLE_SHEETS_SCRIPT.gs` | CRUD local, CSV e sincronização com planilha externa |
| **Radar de buscas e "Quem procura"** | `src/domain/radar.js` e `src/domain/quem-procura.js` | Histórico de pedidos compatíveis e oferta reversa |
| **Vitrine automática e Prospecção** | `src/domain/vitrine.js` e `src/domain/prospeccao.js` | Fila de divulgação em grupos e campanhas em massa |
| **Agendamentos automáticos (vitrine, backups, resumo, garimpo)** | `src/domain/scheduler.js` | Rotinas periódicas com horário configurável |
| **Busca inteligente em portais e grupos** | `src/integrations/busca/` e `src/domain/anuncios.js` | OLX/ZAP/VivaReal via Apify, Serper, Brave, Tavily e memória de grupos |
| **Garimpo de compradores na internet** | `src/domain/garimpo.js` | Varredura periódica de leads interessados |
| **Chaves e seleção de modelo Gemini (IA)** | `src/integrations/gemini/` | Validação de chave e fallback automático de modelos |
| **PDF 16:9 e Ficha A4 do imóvel** | `src/pdf/deck16x9/` e `src/pdf/ficha-a4.js` (e `fonts/`) | Modelos de slides, paletas, cache de fotos e worker de PDF |
| **Login, senha, configurações, backup e restauração** | `src/config/` (`auth.js`, `settings.js`, `backup.js`, `envfile.js`) | Sessões, validações do painel e arquivo `.json.gz` |
| **Caminhos de dados (`DATA_DIR`) e métricas** | `src/config/paths.js`, `store.js`, `metrics.js`, `sistema.js` | Armazenamento seguro em disco e atualização na VM |
| **Modo equipe / SaaS (vários corretores no mesmo servidor)** | `src/tenancy/` | Contêiner isolado por corretor, `/api/equipe` e sessões múltiplas |
| **Servidor Linux, systemd, Caddy HTTPS e atualização** | `deploy/` e `scripts/` | Scripts de VM, rollback e checagem de código |

---

## 3. Comandos Principais e Arquivos Protegidos

- **Rodar localmente:** `PAINEL_SENHA=suasenha npm start` (abre `http://localhost:3000`).
- **Validar tudo antes de commitar:** `npm run verify` (verifica sintaxe de todos os `.js`, `sharp`, `pdfkit` e roda toda a suíte em `tests/` usando pasta temporária).
- **Rodar só os testes:** `npm test`.
- **Arquivos na raiz que NÃO devem ser apagados:** `index.js`, `imoveis.csv`, `settings.json`, `GOOGLE_SHEETS_SCRIPT.gs`, `CLAUDE.md`, `ESTADO_ATUAL.md`, `GUIA_VM_GRATUITA.md` e `fonts/`.
