# 📘 Manual Completo da Sua Secretária Imobiliária (Guia de Estudo do Zero)

Este documento foi escrito especialmente para você entender **como a sua Secretária Imobiliária funciona por dentro**, peça por peça, sem precisar ter conhecimento prévio de programação. Aqui você vai descobrir o papel de cada arquivo, como as ferramentas conversam entre si e qual é o caminho exato que uma mensagem percorre desde o grupo de WhatsApp até o fechamento da visita.

---

## 1. Visão Geral: O que é a Secretária na prática?

Imagine uma secretária humana sentada em uma mesa com **4 ferramentas** na frente dela:
1. **Um celular com WhatsApp aberto** olhando os grupos de corretores/clientes o dia inteiro.
2. **Um fichário (Planilha/Catálogo)** com todos os seus imóveis disponíveis, preços, setores e fotos.
3. **Um caderno de treinamento (Cérebro)** que diz como interpretar gírias do mercado (*"3q"*, *"500k"*, *"porteira fechada"*) e como responder cada tipo de pessoa (*urgente*, *parceria*, *à vista*).
4. **Uma tela de computador (Painel Web / Mini-CRM)** onde você cadastra imóveis e muda as ordens dela.

Na programação, nós transformamos essas 4 coisas em **código JavaScript (Node.js)** rodando dentro da pasta `agente-imoveis-whatsapp`.

---

## 2. As Tecnologias Usadas (Traduzidas do "Computês" para o Português)

Para construir a secretária, usamos tecnologias padrão de mercado, todas gratuitas:

- **Node.js:** É o "motor" que permite rodar código JavaScript fora do navegador, funcionando como um programa de servidor ligado 24h.
- **Express (`index.js`):** É a ferramenta que cria o **site/painel** e os "canais de comunicação" (rotas) entre a tela que você vê e o motor por trás.
- **Baileys (`src/whatsapp.js`):** É a biblioteca que simula o **WhatsApp Web**. Quando você escaneia o QR Code, é ela que recebe as mensagens dos grupos em tempo real e envia fotos no privado sem precisar pagar por mensagem.
- **Google Gemini (`src/matcher.js`):** É a Inteligência Artificial do Google. Funciona como um "segundo cérebro" que lê frases complexas e adapta a fala da secretária.
- **Multer (`index.js`):** É o "recebedor de arquivos" que pega as fotos que você escolhe no computador/celular e salva dentro da pasta `fotos/`.
- **Git & GitHub:** **Git** é a máquina do tempo que salva pontos de restauração no seu computador. **GitHub** é o cofre na internet (`github.com/pggcthymg7-rgb/secretaria-imoveis-whatsapp`) onde guardamos o código para a nuvem ler.
- **Render.com (`render.yaml`):** É o computador na nuvem (`https://secretaria-imoveis-whatsapp.onrender.com`) que fica ligado 24h por dia rodando o código que está no GitHub, mesmo com o seu Mac desligado.

---

## 3. Anatomia dos Arquivos: O que faz cada peça da pasta?

### 🏛️ 1. O Maestro: `index.js`
É o arquivo principal que dá a partida em tudo quando o servidor liga.
- Abre a pasta `fotos/` e prepara o sistema de upload para quando você enviar fotos pelo painel.
- `/api/status`: É o canal que alimenta a tela do seu painel a cada 5 segundos (dizendo se o WhatsApp está conectado, quantos imóveis existem e quais foram as últimas mensagens lidas nos grupos).
- `/api/property`: São os comandos que **criam**, **editam** ou **excluem** um imóvel quando você clica em salvar no Mini-CRM.
- `/api/simulate`: É o motor do **Simulador de Grupo**, permitindo testar qualquer frase antes de acontecer na vida real.
- **Partida + Despertador 24h:** Liga o painel web, inicia a conexão com o WhatsApp e ativa um **relógio interno (`setInterval`)** que dá um "cutucão" no próprio endereço da nuvem (`/ping`) a cada 10 minutos para o servidor gratuito do Render nunca dormir.

### 📱 2. Os Ouvidos e a Boca: `src/whatsapp.js`
Cuida exclusivamente da sua conexão com o WhatsApp.
- **Conexão e QR Code:** Cria a conexão com o WhatsApp Web e guarda a chave de acesso na pasta `auth_info_baileys`. Se a internet oscilar, reconecta sozinho em 4 segundos.
- **Filtro de Grupos (`shouldMonitorGroup`):** Olha a sua configuração `GRUPOS_MONITORADOS` (por exemplo: `teste`). Se chegar mensagem de um grupo da família ou de outro assunto que não esteja na lista, ela ignora completamente.
- **Escuta em Tempo Real (`messages.upsert`):**
  1. Ignora mensagens enviadas por você mesmo e conversas privadas (só vigia grupos).
  2. Chama o cérebro (`matcher.js`) para analisar a frase.
  3. Verifica na memória `sentOffersCache` se já mandou aquele imóvel para aquela mesma pessoa hoje (para não mandar repetido).
- **Envio Humanizado + 5 Fotos (`sendPropertyOffer`):**
  1. Envia o sinal `composing` para o WhatsApp da pessoa — fazendo aparecer **`digitando...`** no celular dela por 2,5 segundos.
  2. Pega até **5 fotos** do imóvel. Na **primeira foto**, coloca a mensagem completa e personalizada como legenda. Nas fotos seguintes (`2/5`, `3/5`...), envia as imagens complementares.
  3. Manda um resumo no **seu WhatsApp pessoal** (`MEU_WHATSAPP_ALERTA`) com o link direto do cliente.

### 🧠 3. O Cérebro e Intérprete Humano: `src/matcher.js`
É onde mora toda a inteligência da secretária. Ele funciona em **duas camadas** (Inteligência Artificial do Google + Motor de Regras Imobiliárias Local):
1. **Diferencia Comprador de Vendedor:** Bloqueia anúncios de quem está vendendo (*"Vendo lindo ap..."*) e reconhece mais de 35 formas de procurar imóvel (*"quero"*, *"busco"*, *"preciso"*, *"procuro"*, *"tenho cliente"*, *"alguém tem"*, etc.).
2. **Tradutor de "Língua de WhatsApp":**
   - Traduz `3q`, `3 qts`, `3 quartos`, `3 suítes` -> `3`.
   - Traduz `90m`, `90m2`, `90 metros` -> `90`.
   - Traduz `500mil`, `500k`, `R$ 500.000,00`, `500.000` -> `500000`.
   - Entende pedidos por **Mobiliado**, **Região** (*"Região Sul"*, *"Região Sudoeste"*) ou *"qualquer setor"*.
3. **Adaptação Humana e Treinamento (`buildHumanContextualParts`):**
   - Cumprimenta com *"Bom dia"*, *"Boa tarde"* ou *"Boa noite"* pelo horário de Brasília.
   - Adapta a abertura e o fechamento se detectar **Urgência** (*"podemos ir visitar a qualquer horário, é só me avisar"*), **Parceria com Corretor** ou **Comprador à Vista**, além das regras que você escrever no painel.

### 📂 4. A Memória da Carteira: `src/sheets.js` e `imoveis.csv`
Guarda todos os seus imóveis cadastrados localmente em `imoveis.csv` e sincroniza opcionalmente com o **Google Sheets** (`GOOGLE_SHEETS_SCRIPT.gs`).

### 🖥️ 5. O Painel Visual (Mini-CRM): `src/dashboard.html`
É a interface web que você acessa pelo navegador com as 4 abas: Carteira de Imóveis, Personalizar Mensagem & Treinamento, Simulador de Grupo e WhatsApp & Config.
