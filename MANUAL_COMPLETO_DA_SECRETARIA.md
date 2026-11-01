# 📘 Manual da Secretária Imobiliária (v3)

Sua secretária no WhatsApp faz quatro trabalhos repetitivos por você:

1. **Lê os grupos de corretores**, entende cada pedido e, quando você tem um imóvel que atende **tudo** o que foi pedido, manda no privado do parceiro com fotos (e ficha em PDF se pedirem).
2. **Atende o seu privado**: responde a 1ª mensagem só de quem **nunca** falou com você e avisa quem ligou e você não atendeu.
3. **Divulga sua carteira** (Vitrine) em até 4 horários por dia nos grupos de divulgação que você escolher, com posts aprovados por você.
4. **Prospecta** os contatos que você escolher, no ritmo de uma pessoa, com descadastro automático.

E conversa com você pelo WhatsApp, na conversa **"Mensagem para mim"**.

---

## 1. Como ela decide o que fazer com um pedido do grupo

```
mensagem no grupo
   │
   ├─ é oferta ("Vendo…", "Captei…")? ───────────────► ignora
   │
   ├─ entende o pedido: tipo, local, preço, quartos, suítes, vagas, m², mobília,
   │  lazer, condomínio, idade, ágio, permuta, financiamento, características…
   │
   ├─ compara com cada imóvel da carteira
   │     ├─ atende 100% ──────────────────────────────► ENVIA ao parceiro + te avisa
   │     ├─ atende tudo, mas falta um dado no cadastro ► te PERGUNTA (código A12)
   │     └─ falha em algum critério ──────────────────► silêncio (fica no Radar)
```

**Na dúvida, ela não envia.** Você recebe um alerta com um código (ex.: `A12`) e responde **enviar A12** para ela mandar.

### O mapa de Goiânia
O cérebro conhece bairros (com região e coordenada), condomínios (Jardins Lyon, Alphaville, Aldeia do Vale…), marcos e avenidas (Praça Tamandaré, DETRAN, T-63, Shopping Flamboyant…) e as cidades da região (com distância, para pedidos como "raio de 40 km de Goiânia"). Ele tolera erros de digitação ("Marechal Rondom").

- **"região da Praça Tamandaré" / "perto do DETRAN"** → aceita o bairro do marco e os vizinhos (~2,5 km).
- **Nome de edifício/condomínio** ("Flat Metropolitan") → o imóvel só serve se esse nome estiver no cadastro (campo *Edifício* ou descrição). Foi isso que corrigiu o envio errado do Viva Sudoeste.
- **"sem região de preferência" / "qualquer setor"** → não filtra local.
- Ensine edifícios e lugares novos em **Painel › Cérebro**.

### Para ela acertar mais
Preencha no cadastro: **edifício/condomínio, suítes, vagas, condomínio (R$), aceita permuta, aceita financiamento, negociação (venda/ágio/aluguel) e valor do ágio**. Campo vazio vira "não sei" → ela te pergunta em vez de arriscar.

---

## 2. Comandos no WhatsApp ("Mensagem para mim")

| Você manda | Ela faz |
|---|---|
| `cadastrar apto 3q 2 suítes 98m² setor Bueno ed. Solar 650 mil aceita permuta` | monta o rascunho |
| (fotos) | anexa ao rascunho |
| `valor 640 mil`, `quartos 3`, `edificio Solar`, `permuta sim` | corrige um campo |
| `salvar` / `cancelar` | grava na carteira / descarta |
| `lista` · `ver 12` · `pdf 12` · `ativar 12` · `desativar 12` | carteira |
| `buscas` · `demanda` | últimos pedidos · o que mais pedem (para captar) |
| `enviar A12` · `enviar A12 30` | envia o imóvel sugerido (ou o #30) para quem pediu |
| `vitrine` · `vitrine 12` · `aprovar 12` · `reprovar 12` | posts da vitrine |
| `status` · `pausar` · `retomar` · `ajuda` | controle geral |

Anotações comuns que você faz no "Mensagem para mim" são ignoradas.
Às 19h (configurável) chega o **resumo do dia**.

---

## 3. A 1ª mensagem (o bug "respondia todo mundo")

**Causa:** o WhatsApp passou a identificar contatos por um ID novo (LID) em vez do telefone, e a memória só conhecia quem falou depois que ela foi ligada — e no Render gratuito essa memória é apagada a cada reinício.

**Agora ela só responde se TODAS forem verdade:**
- a pessoa nunca falou com você (nem pelo telefone, nem pelo ID novo);
- não está salva na sua agenda;
- a mensagem é nova (não é histórico nem chegou com o celular offline);
- não é resposta a uma mensagem anterior;
- e, se a memória estiver vazia (primeira conexão), espera 20 min aprendendo seus contatos.

---

## 4. Onde rodar de graça (e sem perder memória)

| Opção | Custo | Memória (sessão, contatos, carteira) |
|---|---|---|
| **VM gratuita (Oracle Cloud Always Free)** com `instalar-nuvem.sh` | grátis | ✅ permanente |
| Seu Mac/PC ligado (`npm start`) | grátis | ✅ permanente |
| Render gratuito | grátis | ❌ apagada a cada reinício/deploy (precisa ler QR de novo) |
| Render pago + disco em `/var/data` + `DATA_DIR=/var/data` | ~US$ 7/mês | ✅ |

Variáveis importantes (`.env` — nunca vai para o GitHub): `PAINEL_SENHA`, `DATA_DIR`, `GEMINI_API_KEY` (opcional, grátis), `MEU_WHATSAPP_ALERTA`, `API_TOKEN`.

---

## 5. Peças do sistema

| Arquivo | Papel |
|---|---|
| `index.js` | servidor do painel e API (tudo protegido por login) |
| `src/whatsapp.js` | conexão com o WhatsApp e roteamento das mensagens |
| `src/brain/*` | cérebro: mapa de Goiânia, intérprete de pedidos e motor de compatibilidade |
| `src/matcher.js` | decisão (enviar/perguntar/silêncio) e texto humano |
| `src/atendimento-diario.js` + `src/contacts.js` | 1ª mensagem, ligações e memória de contatos |
| `src/assistant.js` | comandos no "Mensagem para mim" |
| `src/vitrine.js`, `src/prospeccao.js`, `src/scheduler.js` | divulgação, prospecção e agendador |
| `src/radar.js`, `src/metrics.js` | histórico de pedidos, demanda e números do dia |
| `src/auth.js` | login do painel |
| `src/public/` | painel web |
| `tests/` | testes automáticos (`npm run verify`) com as mensagens reais dos grupos |
