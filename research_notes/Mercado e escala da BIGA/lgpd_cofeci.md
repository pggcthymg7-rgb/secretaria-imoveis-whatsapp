# LGPD, mensagens não solicitadas, COFECI/CRECI e Marco Civil: restrições para o SaaS Biga (Radar de grupos + disparo de ofertas + prospecção a frio)

> Notas de pesquisa, nov/2026. Não é parecer jurídico. Fontes de escritórios/blogs são marcadas como secundárias. O site planalto.gov.br bloqueou a coleta automatizada nesta sessão, então os textos de lei foram confirmados por fontes secundárias ou pela página da ANPD.

## 1. LGPD: base legal, papéis, direitos, retenção, incidentes, fiscalização da ANPD, agentes de pequeno porte

### Takeaway
Ler mensagens de grupo (nome, telefone e pedido de imóvel) e reutilizá-las para enviar ofertas no privado só se sustenta, de forma plausível, pelo **legítimo interesse** (LGPD art. 7º, IX e art. 10). Isso exige um **teste de balanceamento documentado (LIA)**, transparência e opt-out fácil. A ANPD já multou uma microempresa (Telekall, 2023) por oferecer listas de contatos de WhatsApp sem base legal. O argumento de "dado público" (art. 7º, §4º) é fraco para grupos privados ou semiprivados. Dois fatores tendem a tornar a Biga, ao menos em parte, **controladora** (e não mera operadora): definir a finalidade do disparo automático e cruzar a base entre clientes. O processamento pode ainda ser considerado de "alto risco", o que limitaria os benefícios de agente de pequeno porte.

### Cited Findings

**Legítimo interesse e LIA**
- Em fev/2024, depois de consulta pública em 2023, a ANPD publicou o guia "Hipóteses Legais de Tratamento de Dados Pessoais: Legítimo Interesse". O guia traz um modelo de teste de balanceamento de uso não obrigatório, em três fases: (i) finalidade, (ii) necessidade e (iii) balanceamento e salvaguardas — [Mattos Filho](https://www.mattosfilho.com.br/unico/anpd-legitimo-interesse-lgpd/); [Confidata](https://confidata.com.br/blog/legitimo-interesse-lgpd-lia-exemplos-limites); [PDF do guia (cópia TCE-PB)](https://tce.pb.gov.br/wp-content/uploads/2025/03/guia_legitimo_interesse.pdf)
- Pelo guia, se o teste for inconclusivo ou não houver salvaguardas e mitigação de risco adequadas, **outra base legal deve ser adotada** — [Mattos Filho](https://www.mattosfilho.com.br/unico/anpd-legitimo-interesse-lgpd/)
- Parte da doutrina critica o guia por criar, na prática, uma obrigação documental (fazer o LIA antes do tratamento) que a LGPD não prevê expressamente. Isso pesaria sobre PMEs — [BMA (secundária)](https://www.bmalaw.com.br/conteudo/direito-digital-protecao-de-dados-e-cybersecurity/artigos-e-noticias/o-legitimo-interesse-na-visao-da-anpd/pdf)

**Dados "públicos" e raspagem**
- O art. 7º, §4º dispensa o consentimento para dados tornados manifestamente públicos pelo titular, desde que sejam respeitados os direitos do titular e os princípios da lei (finalidade, adequação, necessidade). Não é uma autorização ampla — [Migalhas](https://www.migalhas.com.br/depeso/293745/a-excecao-dos-dados-pessoais-tornados-manifestamente-publicos-pelo-titular-na-lgpd); [texto da LGPD](https://planalto.gov.br/ccivil_03/_ato2015-2018/2018/Lei/L13709.htm)
- Raspar dados públicos exige base legal dos arts. 7º ou 11 e respeito aos princípios — [Monitor Mercantil](https://monitormercantil.com.br/data-scraping-e-a-responsabilidade-do-controlador/)
- No caso Telekall, a ANPD declarou: "Só porque é possível encontrar essas informações publicamente, não quer dizer que podem ser usadas" — [TabNews/Convergência Digital](https://www.tabnews.com.br/NewsletterOficial/anpd-alerta-que-web-scraping-de-dados-pessoais-viola-lgpd)
- A agenda regulatória da ANPD inclui orientação sobre os limites do uso de dados públicos e manifestamente públicos e sobre agregadores de dados. Até a data desta pesquisa, a orientação não havia sido localizada como publicada — [ANPD, agenda regulatória](https://www.gov.br/anpd/pt-br/assuntos/regulacao/agenda-regulatoria-1)

**Fiscalização: casos relevantes**
- **Telekall Infoservice (jul/2023)**, a primeira multa da ANPD: microempresa que oferecia listas de contatos de WhatsApp de eleitores para campanhas, **sem base legal**. Sanções: duas multas de R$ 7.200 (total de R$ 14.400, reduzido pelo porte) e advertência. Infrações: art. 7º (sem base legal), art. 41 (sem encarregado) e falta de resposta à ANPD — [Confidata, mapa de sanções](https://confidata.com.br/blog/mapa-sancoes-anpd-todos-casos-2026); [Consumidor Moderno](https://consumidormoderno.com.br/telekall-infoservice-dados-pessoais/)
- Até 2024, a Telekall foi a única empresa privada sancionada. As demais sanções atingiram órgãos públicos e trataram de incidentes ou falta de encarregado/RIPD — [Confidata](https://confidata.com.br/blog/mapa-sancoes-anpd-todos-casos-2026)
- **WhatsApp/Meta (11/11/2025)**: a ANPD concluiu a análise do compartilhamento de dados, determinou uma auditoria independente e recomendou que o WhatsApp informe que comunicações de marketing são enviadas fora da plataforma (Despacho Decisório nº 11/2025/CGF; Nota Técnica nº 58/2025) — [Legismap](https://legismap.com.br/conteudos/artigos-e-noticias/anpd-conclui-a-analise-sobre-compartilhamento-de-dados-pessoais-entre-whatsapp-e-meta); [Teletime](https://teletime.com.br/13/11/2025/anpd-determina-medidas-de-transparencia-na-meta/)
- **2026**: multa de R$ 153,7 mi ao TikTok (25/08/2026) e bloqueio de ferramenta do Discord (12/08/2026). Em 31/08/2026, o presidente da ANPD disse que "não haverá uma curva acentuada" de multas. A ANPD tem 500 servidores, 57 deles em regulação e fiscalização, e o foco atual é o ECA Digital — [Mobile Time](https://www.mobiletime.com.br/noticias/31/08/2026/anpd-descarta-multas/)
- Uma fonte secundária afirma que, desde mar/2025, a ANPD intensificou a fiscalização de micro e pequenas empresas, com foco em campanhas digitais. Não foi confirmado em fonte primária — [Contábeis](https://www.contabeis.com.br/noticias/72161/lgpd-falhas-em-campanhas-digitais-tornam-pmes-alvo-de-sancoes/)

**Controlador × operador**
- Segundo o Guia de Agentes de Tratamento da ANPD (v2, abr/2022, não vinculante), o controlador decide sobre o tratamento e o operador trata em nome dele. A ANPD recomenda contrato escrito que limite o operador às instruções do controlador (objeto, duração, natureza e finalidade) e prevê suboperadores — [ANPD, guia v2](https://www.gov.br/anpd/pt-br/documentos-e-publicacoes/Segunda_Versao_do_Guia_de_Agentes_de_Tratamento_retificada.pdf/); [BMA](https://www.bmalaw.com.br/conteudo/direito-digital-protecao-de-dados-e-cybersecurity/artigos-e-noticias/anpd-publica-versao-atualizada-do-guia-orientativo-para-a-definicao-dos-agentes-de-tratamento-e-do-encarregado/pdf)

**Incidentes de segurança (Resolução CD/ANPD 15/2024)**
- O controlador deve comunicar a ANPD em **3 dias úteis** a partir de quando souber que o incidente afetou dados pessoais. É possível enviar uma comunicação preliminar e complementá-la em até 20 dias úteis — [Confidata](https://confidata.com.br/blog/comunicacao-incidente-seguranca-anpd); [BMA](https://www.bmalaw.com.br/conteudo/direito-digital-protecao-de-dados-e-cybersecurity/publicacoes/comunicacao-de-incidentes-de-seguranca-o-passo-a-passo-definitivo-de-acordo-com-o-regulamento-da-anpd/pdf)
- As fontes secundárias divergem sobre o prazo para comunicar os titulares ("sem demora injustificada" × 3 dias úteis) e sobre qual artigo fixa o prazo — [Contábeis](https://www.contabeis.com.br/artigos/72514/anpd-exige-notificacao-de-incidentes-de-seguranca-em-3-dias-uteis/)
- A maior parte das sanções da ANPD de 2023 e 2024 envolveu falha em notificar os titulares após incidentes e segurança inadequada (arts. 48 e 49) — [Confidata](https://confidata.com.br/blog/mapa-sancoes-anpd-todos-casos-2026)

**Agentes de pequeno porte (Resolução CD/ANPD 2/2022)**
- Abrange ME, EPP, MEI e startups (LC 123/2006 e LC 182/2021). Ficam **excluídos** os agentes que fazem tratamento de **alto risco**, que têm receita acima dos limites ou que pertencem a grupo econômico acima dos limites (art. 3º) — [ANPD, Res. 2/2022](https://www.gov.br/anpd/pt-br/documentos-e-publicacoes/regulamentacoes-da-anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022)
- Há **alto risco** quando se cumpre ao menos 1 critério geral (larga escala ou afetação significativa de direitos) **e** 1 específico (tecnologia emergente ou inovadora, vigilância, decisão exclusivamente automatizada inclusive perfilamento, ou dados sensíveis, de crianças ou de idosos) (art. 4º). A larga escala considera o nº de titulares, o volume, a duração, a frequência e a extensão geográfica — [ANPD, Res. 2/2022](https://www.gov.br/anpd/pt-br/documentos-e-publicacoes/regulamentacoes-da-anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022)
- Benefícios: registro de operações (ROPA) simplificado (art. 9º), dispensa de encarregado desde que haja canal de atendimento ao titular (art. 11), política de segurança simplificada (art. 13, sem dispensar as medidas essenciais do art. 12), **prazos em dobro** para atender titulares, comunicar incidentes e responder à ANPD (art. 14) e declaração simplificada em 15 dias (art. 15). A ANPD pode revogar os benefícios conforme o risco (art. 16) — [ANPD, Res. 2/2022](https://www.gov.br/anpd/pt-br/documentos-e-publicacoes/regulamentacoes-da-anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022)

### Inferences
- **Papéis.** Em cada conta, o corretor é controlador dos dados do seu grupo e dos seus leads. A Biga, porém, provavelmente vira **controladora (ou cocontroladora)** em três situações: se reaproveitar dados entre clientes (rede, ranking, "matching" cruzado), se decidir quem recebe as ofertas automáticas ou se usar os dados para treinar ou melhorar o produto. Ser só operadora exige um DPA que limite o uso às instruções do corretor e proíba o pooling entre contas. Isso entra em conflito com a tese "stay for the network".
- **Base legal.** O consentimento é inviável para membros de grupo que nunca falaram com a Biga. O legítimo interesse do corretor é plausível quando o membro publicou um pedido de imóvel em grupo profissional e recebe uma oferta pertinente, com expectativa razoável. Fica bem mais fraco em três casos: (a) prospecção a frio em listas compradas ou raspadas, (b) membros que não publicaram demanda e (c) retenção longa. O caso Telekall (listas de contatos de WhatsApp sem base legal) é o precedente mais próximo.
- **Alto risco.** Monitorar grupos, extrair dados por IA (tecnologia emergente) e fazer perfilamento ou matching automatizado, em escala de milhares de grupos, tende a cumprir "larga escala + tecnologia emergente/decisão automatizada". Nesse cenário, a Biga **perderia os benefícios** da Res. 2/2022: teria de nomear encarregado e elaborar RIPD (DPIA) e não teria prazos em dobro. É uma interpretação; não há caso concreto.
- **Requisitos mínimos para o lançamento:** LIA por finalidade (radar, disparo e prospecção); aviso de privacidade acessível por link na 1ª mensagem; opt-out em toda mensagem ("SAIR"), com lista de supressão global; minimização (guardar só a demanda e o contato, descartar o resto da conversa); retenção curta (ex.: demandas expiram em 90 a 180 dias, a confirmar); DPA com o corretor; ROPA; canal do titular para os direitos do art. 18 (acesso, correção, eliminação, oposição); plano de resposta a incidentes de 3 dias úteis; criptografia e controle de acesso.

### Gaps
- Não foi encontrada decisão da ANPD especificamente sobre leitura ou raspagem de **grupos de WhatsApp** nem sobre ferramentas de "radar" de grupos.
- Não foi confirmado o texto oficial do art. 6º da Res. 15/2024 quanto ao prazo de comunicação aos titulares.
- O resultado da deliberação CD 09/2026 da ANPD (raspagem em larga escala) não foi verificado — [ANPD, votos CD 09/2026](https://www.gov.br/anpd/pt-br/assuntos/deliberacoes-do-conselho-diretor-1/circuitos-deliberativos-ano-2026/cd-09-2026-votos.pdf/@@display-file/file)
- Faltam fontes primárias sobre os limites de multa (art. 52: 2% do faturamento, até R$ 50 mi por infração). O dado vem de conhecimento geral e não foi verificado nesta sessão.

## 2. Mensagens não solicitadas: CDC, "Não Me Perturbe", Senacon, opt-out

### Takeaway
Não há proibição nacional específica de marketing por WhatsApp. O "Não Me Perturbe" (Anatel/setores aderentes) cobre basicamente ligações de telecom e de consignado. Em **São Paulo**, porém, a Lei estadual 17.334/2021 estende o cadastro "Não Me Ligue" a **WhatsApp, Telegram e SMS**, e empresas de outros estados devem respeitá-lo ao contatar números dos DDDs 11 a 19. A prospecção a frio precisa, no mínimo, consultar essa lista e oferecer opt-out.

### Cited Findings
- O "Não Me Perturbe" funciona principalmente para ligações de telecom e crédito consignado e não bloqueia outros setores nem empresas que não aderiram. Fechou 2024 com cerca de 125 milhões de cadastros — [Consumidor Moderno](https://consumidormoderno.com.br/telemarketing-boa-onersosa-consumidor/); [TI Inside](https://tiinside.com.br/13/01/2025/nao-me-perturbe-fecha-2024-com-quase-125-milhoes-de-cadastros/)
- **SP, Lei 17.334/2021** (vigência em 11/03/2021): proíbe telemarketing por SMS e por apps vinculados à linha (WhatsApp, Telegram) para números cadastrados no Não Me Ligue/Procon-SP, 30 dias após o pedido. O consumidor pode autorizar empresas específicas. Abrange os DDDs 11 a 19, e empresas de outros estados também devem respeitar — [Tecnoblog](https://tecnoblog.net/noticias/whatsapp-e-sms-entram-para-lista-de-bloqueio-nao-perturbe-do-procon-sp/)
- O PL 8.195/2017 (cadastro nacional de bloqueio para setores não cobertos) ainda estava em tramitação — [Congresso em Foco](https://www.congressoemfoco.com.br/noticia/110842/proibicao-de-ligacoes-de-telemarketing-pode-virar-lei)
- Há reclamações de 2026 no Reclame Aqui sobre ofertas por WhatsApp enviadas após cadastro no Não Me Perturbe. São relatos individuais, não decisões, mas indicam risco reputacional e de Procon — [Reclame Aqui](https://www.reclameaqui.com.br/tg-promotora/recebimento-excessivo-de-ofertas-nao-solicitadas-via-whatsapp-mesmo-apos-bloqueio-e-cadastro-no-nao-me-perturbe_olQ1Y0HL0gA9MVkN/)
- O Idec defende consentimento prévio e horário fixo para telemarketing (posição de advocacy, não norma) — [Teletime](https://teletime.com.br/14/02/2023/idec-sugere-horario-fixo-e-consentimento-previo-para-ligacao-de-telemarketing/)

### Inferences
- **Requisitos:** (1) cruzar as campanhas frias com o cadastro do Procon-SP para DDD 11 a 19; (2) aplicar opt-out em 1 clique, com supressão permanente entre todos os clientes Biga; (3) identificar o remetente (corretor + CRECI) e informar a origem do contato; (4) limitar frequência e horário. Outros estados têm leis locais de "não perturbe", cuja cobertura de WhatsApp não foi verificada.
- O maior risco prático do disparo a frio vem dos **Termos do WhatsApp/Meta** (banimento e exigência de opt-in para mensagens de marketing na API oficial), não da Senacon. Esse tema está fora deste escopo e deve ser verificado por outro pesquisador.
- O CDC (práticas abusivas, art. 39) é frequentemente invocado por Procons contra spam, mas não foi encontrada decisão específica sobre WhatsApp nesta sessão.

### Gaps
- Nenhuma norma ou nota da Senacon de 2025/2026 específica sobre marketing por WhatsApp foi localizada.
- O mapeamento das leis estaduais equivalentes à paulista (RJ, PR, MG etc.) e de sua cobertura de apps de mensagem não foi feito.
- As multas aplicáveis pela Lei SP 17.334/2021 não foram encontradas.

## 3. COFECI/CRECI: publicidade, intermediação por plataforma, parceria e divisão de honorários

### Takeaway
Toda peça publicitária do corretor (incluindo PDFs e artes geradas pelo Designer e mensagens de oferta) deve trazer o **nome + "Corretor de Imóveis" + número do CRECI**, conforme a Res. COFECI 1.065/2007 e os manuais dos CRECIs. A corretagem é atividade privativa de inscritos no CRECI. O risco de a Biga ser vista como intermediadora cresce se ela própria conectar comprador e vendedor ou receber remuneração atrelada ao negócio. A regulação de plataformas digitais (Res. 1.551/2025) está **barrada judicialmente** (TRF-1, set/2026). Não há percentual normativo para a divisão de comissão em parcerias; vale o acordo entre as partes.

### Cited Findings
- **Res. COFECI 1.065/2007**: aplica-se a qualquer divulgação publicitária ou documental de pessoa física ou jurídica, incluindo meios digitais. A expressão obrigatória deve vir seguida do número de inscrição no CRECI, com destaque idêntico — [Legisweb](https://www.legisweb.com.br/legislacao/?id=106183); [CRECI-SC (PDF)](https://www.creci-sc.gov.br/c/16057/5_Resolucao1065_2007.pdf)
- O Manual de Divulgação do CRECI-SP exige a sigla, o número e a letra "F" (ou "J"). Esse conjunto não pode ser menor que 25% do tamanho do nome do profissional, e a regra inclui redes sociais e sites — [CRECI-SP, Manual de Divulgação](https://new.crecisp.gov.br/Media/Requerimentos/MANUAL%20DE%20DIVULGA%C3%87%C3%83O-REV00-20230721041255.pdf)
- O uso de redes sociais deve observar o Código de Ética (Res. COFECI 326/1992) — [CRECI-ES](https://crecies.gov.br/as-redes-sociais-ajudam-o-corretor-de-imoveis)
- **"Res. 1.504/2023"**: nenhuma fonte associa esse número a publicidade. As resoluções 1.506 e 1.507/2023 tratam de anuidades — [COFECI 1.507/2023](https://intranet.cofeci.gov.br/arquivos/legislacao/resolucao_1507_2023.pdf); [COFECI 1.506/2023](https://intranet.cofeci.gov.br/arquivos/legislacao/resolucao_1506_2023.pdf)
- **Reserva de atividade**: a intermediação imobiliária é privativa de corretores e de pessoas jurídicas inscritas no CRECI (Lei 6.530/78). O exercício sem inscrição é contravenção penal, e o PL 3.614/2015 propõe torná-lo crime — [COFECI, Res. 1.551/2025](https://intranet.cofeci.gov.br/arquivos/legislacao/resolucao_1551_2025.pdf); [CRECI-SP, agenda 2024](https://crecisp.gov.br/files/agenda2024.pdf)
- **Res. COFECI 1.551/2025 (14/08/2025)**: regula as "Plataformas Imobiliárias para Transações Digitais" (PITD), que dependem de credenciamento prévio no sistema COFECI-CRECI (SGR), e os agentes de custódia (ACGI), com foco em tokenização. Aplica-se apenas a transações que configurem corretagem — [Demarest](https://www.demarest.com.br/cofeci-regulamenta-uso-de-tecnologia-de-registro-distribuido-blockchain-dlt-na-intermediacao-de-transacoes-imobiliarias/); [Normas Brasil](https://www.normasbrasil.com.br/norma/resolucao-1551-2025_482265.html)
- O **TRF-1 manteve a liminar e a sentença contra a Res. 1.551/2025** em ação do ONR e negou o pedido de suspensão do COFECI (notícia de 08/09/2026). O fundamento foi a extrapolação do poder regulamentar da Lei 6.530/78 — [Registro de Imóveis](https://www.registrodeimoveis.org.br/trf-1-mantem-liminar-sobre-resolucao-cofeci-1551-2025)
- **Honorários**: pelo Código de Ética (Res. 326/1992, alterada pela Res. 1.404/2018), o corretor recebe honorários de apenas uma das partes, salvo consentimento expresso. Não há regra normativa de percentual entre captador e vendedor: a divisão é acordada entre os parceiros — [Legisweb, Res. 326/92](https://www.legisweb.com.br/legislacao/?id=95563); [CRECI-ES](https://crecies.gov.br/5-dicas-para-o-corretor-de-imoveis-vender-mais-com-parcerias)
- Em 2018, o CADE firmou acordo com o COFECI e os CRECIs para encerrar o uso de tabelas de honorários — [IstoÉ Dinheiro](https://istoedinheiro.com.br/acordo-do-cade-com-o-cofeci-acaba-com-utilizacao-de-tabela-de-honorarios)

### Inferences
- **Intermediação.** Um SaaS que cobra assinatura fixa (R$ 97, 197 ou 997), em que o corretor envia a oferta em seu próprio nome e com seu CRECI, tende a ser ferramenta, e não corretagem. Três desenhos podem caracterizar intermediação: (a) a Biga receber percentual ou success fee sobre o negócio, (b) a Biga contatar consumidores finais em nome próprio, (c) o portal 3D aproximar comprador e vendedor sem corretor. Mitigações: cobrança só por assinatura, remetente sempre identificado como o corretor (nome + CRECI) e, se houver marketplace, constituir PJ com CRECI-J ou operar via imobiliária parceira.
- **Parcerias e ranking.** Os termos de parceria devem ser firmados entre os corretores, com a divisão definida por eles. Se a Biga intermediar ou reter parte da comissão, aumenta o risco de exercício ilegal. Um ranking ou "nota" de corretores deve evitar parecer fixação de honorários (risco CADE).
- O Designer de PDFs/Artes deve **inserir automaticamente o CRECI** (≥ 25% do tamanho do nome, padrão CRECI-SP) e bloquear a exportação sem esse dado.

### Gaps
- Não foi localizada a "Res. COFECI 1.504/2023"; o número informado na pergunta pode estar incorreto.
- Não foi confirmado se a Res. 1.065/2007 sofreu alteração posterior.
- Não foi encontrada manifestação do COFECI sobre SaaS de automação de WhatsApp ou matching de ofertas entre corretores.
- O status definitivo da Res. 1.551/2025 depende do mérito no TRF-1.

## 4. Marco Civil da Internet: guarda de registros

### Takeaway
Como provedora de aplicações (PJ, com fins econômicos), a Biga deve guardar os **registros de acesso à aplicação (data, hora e IP) por 6 meses**, sob sigilo e em ambiente seguro. O prazo pode ser estendido a pedido da autoridade policial, administrativa ou do MP. Isso não autoriza guardar o conteúdo das mensagens por 6 meses: esse prazo segue a LGPD (finalidade e necessidade).

### Cited Findings
- **Art. 15**: o provedor de aplicações constituído como PJ, que atue de forma organizada, profissional e com fins econômicos, deve manter os registros de acesso a aplicações, sob sigilo, em ambiente controlado e de segurança, por 6 meses — [Modelo Inicial, art. 15](https://modeloinicial.com.br/lei/27460/marco-civil-internet/art-15); [LegJur](https://www.legjur.com/legislacao/art/lei_00129652014-15)
- **Art. 5º, VIII**: registros de acesso a aplicações são o conjunto de informações de data e hora de uso de uma aplicação a partir de um IP — [Legale](https://legale.com.br/blog/prazo-de-guarda-de-dados-no-marco-civil-regras-e-conflitos-juridicos/)
- **§2º**: a autoridade policial, administrativa ou o MP pode requerer cautelarmente a guarda por prazo superior. Para provedores de conexão, o prazo é de 1 ano (art. 13) — [Legale](https://legale.com.br/blog/prazo-de-guarda-de-dados-no-marco-civil-regras-e-conflitos-juridicos/); [Jurídico Certo](https://juridicocerto.com/p/faria-cendao-e-maia/artigos/prazo-de-guarda-de-registros-de-acesso-a-aplicacoes-de-internet-1736)
- Em set/2026, a ANPD anunciou que ampliará a dosimetria de multas para abranger o MCI e o ECA Digital (só a manchete foi vista) — [Mobile Time](https://www.mobiletime.com.br/noticias/31/08/2026/anpd-descarta-multas/)

### Inferences
- A Biga deve guardar os logs de login e acesso dos corretores (usuários) por 6 meses e então expurgá-los, salvo ordem judicial ou requisição. Os membros dos grupos não são usuários da aplicação Biga, então o art. 15 não se aplica aos dados deles; a retenção desses dados segue só a LGPD.
- Se a dosimetria da ANPD passar a abranger o MCI, o risco de sanção administrativa por descumprir a guarda de logs pode aumentar. A extensão real dessa mudança não foi verificada.

### Gaps
- O texto oficial no planalto.gov.br não pôde ser acessado (bloqueio). As citações vêm de reproduções secundárias.
- Não foram verificados o alcance nem o texto da nova dosimetria da ANPD envolvendo o MCI.
