# Fila de Execução da Secretária

## 1. Bugs e Erros Identificados
- [x] Pedido "Flat Metropolitan ou Brookfield mobiliado" recebeu apê do Viva Sudoeste (nome de edifício ignorado; bastava ser apto mobiliado)
- [x] Dúvidas falsas: "local não reconhecido" em Jardins Lyon/Marselha, Praça Tamandaré, DETRAN, Marechal Rondon (com erro de digitação), "sem região de preferência", raio de 40 km, Senador Canedo
- [x] Ágio e permuta bloqueavam tudo em vez de virar critério (imóvel precisa ser ágio / aceitar permuta)
- [x] Telefone da assinatura ("99353 0835") podia virar preço; "R$1.2" não era entendido como 1,2 milhão
- [x] Endereço do imóvel oferecido em permuta (Cidade Verde) era tratado como local procurado
- [x] Alerta de dúvida enviado mesmo quando não há nenhum imóvel parecido na carteira (excesso de alertas)
- [x] 1ª mensagem respondendo todo mundo (deveria ser só quem nunca falou comigo)
- [x] Link wa.me nos alertas usa o ID interno (LID) em vez do telefone real
- [x] Painel sem senha (qualquer pessoa com o link vê o QR Code, a carteira e muda configurações)
- [x] `.env` versionado no Git; upload aceita qualquer tipo de arquivo; caminho de foto permitia ler arquivos do servidor
- [x] `npm test` gravava na planilha real

## 2. Modificações e Novas Funções
- [x] Mapa de Goiânia no cérebro (bairros, regiões, marcos, avenidas, condomínios, cidades e raio em km)
- [x] Filtros completos de pedidos entre corretores (tipo, ágio, permuta, preço até/em torno/entre, quartos, suítes, vagas, m²/mil m²/hectare/alqueire, mobília, lazer, condomínio, idade, características exigidas x desejáveis, pagamento, PDF)
- [x] Assistente no WhatsApp para cadastrar imóveis por mensagem + fotos
- [x] Vitrine: carteira enviada em 4 horários para grupos escolhidos, com post (1 foto + texto) aprovado por mim
- [x] Prospecção: escolher contatos e enviar mensagem/imagem com intervalo seguro e opção de descadastro
- [x] Radar de buscas (tudo que foi pedido nos grupos) e resumo diário no WhatsApp
- [x] Novo painel com login e visual padronizado

## 3. Próximos passos sugeridos (para você aprovar)
- [ ] Revisar os imóveis da carteira preenchendo edifício, suítes, vagas, condomínio e permuta
- [ ] Ensinar no Cérebro os edifícios/condomínios que você mais trabalha (ex.: Metropolitan, Brookfield)
- [x] BIGA própria para a Laura (uma BIGA por corretor na mesma VM: WhatsApp, carteira, senha e análises separadas)
- [ ] Multiusuário (produto): vários logins num site só

## 4. Mudança para a máquina virtual gratuita (24h, memória permanente)
- [x] Backup e restauração de toda a memória (painel, comando `backup` no WhatsApp e backup semanal automático)
- [x] Instalador automático da VM (Node, serviço 24h, HTTPS, firewall, backup diário e atualização automática)
- [x] Instalação sem SSH pelo celular (cloud-init) + guia passo a passo Oracle/Google
- [x] Migração para a VM Oracle (São Paulo, E2.1.Micro, Ubuntu 24.04) — no ar em https://147-15-87-168.sslip.io e WhatsApp conectado
- [ ] Suspender o serviço no Render e desconectar o aparelho antigo no WhatsApp — **precisa de você**

## 5. BIGA — mapa, painel novo e Garimpo
- [x] Mapa de Goiânia ampliado com dados abertos do OpenStreetMap (548 bairros, 394 condomínios; atualização automática semanal na VM)
- [x] Busca por nome nas listas de grupos (Ajustes e Vitrine)
- [x] Secretária passa a se chamar BIGA
- [x] Painel novo: BIGA animada na página inicial com menu ao lado, transições e animações (referência DESIGN-2.md)
- [x] Agente Garimpo: leads da web pública, comentários nos seus posts, mapa de campanhas e tendências
- [ ] Configurar as chaves do Garimpo (Brave Search ou Google; token da Página Meta) — **precisa de você**
- [ ] Portal geo360 da prefeitura: sem exportação aberta; integração automática depende de autorização/convênio com a prefeitura
- [x] Atualizar a BIGA pelo celular: botão "Atualizar agora" (Ajustes › Sistema) e comando `atualizar` no WhatsApp — ativa sozinho na próxima atualização automática

## 6. Busca inteligente (03/11/2026)
- [x] Memória de anúncios dos grupos (90 dias) + comando `busca` com relatório (grupos, portais, links prontos)
- [x] Importar histórico dos grupos (pedido ao celular) e conversa exportada (.txt/.zip)
- [x] Portais via Gemini com busca no Google (só links confirmados; limite diário)
- [x] Leitor de preços: "R$ 950 mil", "R$ 2,8 mi", faixas com valores completos e "milhão"
- [x] Página Busca no painel + todas as configurações da busca também pelo "Mensagem para mim"
- [ ] Colocar a chave do Gemini (AI Studio) e conferir a cota grátis da busca com Google — **precisa de você**
- [ ] Rodar `importar histórico` com o celular ligado; exportar os grupos que vierem com pouco histórico — **precisa de você**

## 7. Noite de 04/11/2026 (pedido do João)
- [x] Vitrine sem o teto de 5: até 10 imóveis COM foto e 20 SÓ TEXTO por horário, pausa de 20–40 s entre imóveis
- [x] Descrição completa na vitrine (sem cortar na 1ª frase/220 caracteres) + botão "Texto completo da carteira"
- [x] Busca: "até 200 m²" = 160 a 210 m² (80%–105%); "apto com piscina" = piscina privativa; decorado = mobiliado; vocabulário ampliado
- [x] Casa de condomínio como categoria de imóvel
- [x] Navegação do painel mais clara e intuitiva (4 grupos: Meu dia, Imóveis, Clientes, Configurar)
- [x] Editor de capa (beta): canvas imobiliário com modelos editáveis
- [x] Surpresa: 🎯 "Quem procura este imóvel?" — ao cadastrar, a BIGA relê os pedidos dos grupos (60 dias) e oferece o imóvel a quem pediu
- [x] Gerador de PDF minimalista e editável dos imóveis (baixar ou enviar pelo WhatsApp)
