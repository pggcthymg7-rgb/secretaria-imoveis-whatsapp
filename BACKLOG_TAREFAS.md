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
- [ ] Mover a secretária para uma VM gratuita (Oracle Always Free) com `DATA_DIR` — fim do QR Code a cada reinício
- [ ] Revisar os imóveis da carteira preenchendo edifício, suítes, vagas, condomínio e permuta
- [ ] Ensinar no Cérebro os edifícios/condomínios que você mais trabalha (ex.: Metropolitan, Brookfield)
- [ ] Multiusuário (produto): separar DATA_DIR por corretor e login por usuário
