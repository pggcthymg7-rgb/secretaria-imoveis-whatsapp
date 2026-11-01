# 🖥️ Guia: Secretária 24h numa máquina virtual gratuita

**Resultado:** a secretária fica ligada 24 horas por dia, sem depender do seu computador, e **nunca mais perde a memória**: sessão do WhatsApp, carteira, fotos, contatos conhecidos, radar, vitrine e prospecção.

Você faz tudo pelo celular, sem digitar comandos. Tempo total: **~30 minutos**, quase tudo esperando.

---

## Qual nuvem usar

| | **Oracle Cloud Always Free** ⭐ recomendado | Google Cloud e2-micro |
|---|---|---|
| Custo | grátis para sempre | grátis para sempre |
| Máquina | ARM até 4 CPUs / 24 GB (ou AMD 1 GB) | 2 vCPU compartilhadas / 1 GB |
| Região no Brasil | ✅ São Paulo ou Vinhedo | ❌ só nos EUA |
| Internet grátis | 10 TB/mês | 1 GB/mês (fotos podem passar disso) |
| Cartão de crédito | sim, só para verificação | sim, só para verificação |

---

## Passo 1 — Criar a conta na Oracle (10 min)

1. Acesse **signup.cloud.oracle.com**.
2. Preencha seus dados. Em **Home Region**, escolha **Brazil East (São Paulo)**. Ela não pode ser trocada depois.
3. Cadastre o cartão. A Oracle faz uma verificação de valor baixo e devolve. Nada é cobrado enquanto você usar só recursos *Always Free*.
4. Aguarde o e-mail de conta ativa (de minutos a algumas horas).

> **Recomendado depois de criar:** em ☰ › *Billing* › *Upgrade and Manage Payment*, mude para **Pay As You Go**. Continua grátis dentro dos limites Always Free, e a Oracle deixa de poder **desligar máquinas consideradas ociosas** (contas só-free podem ter máquinas paradas recuperadas). Por segurança, crie um alerta de orçamento de R$ 1 em ☰ › *Billing* › *Budgets*.

---

## Passo 2 — Criar a máquina com a secretária já instalada (5 min)

1. No painel da Oracle: ☰ › **Compute** › **Instances** › **Create instance**.
2. **Name:** `secretaria`.
3. **Image and shape** › *Edit*:
   - **Image:** *Change image* › **Canonical Ubuntu** › **24.04** (ou 22.04).
   - **Shape:** *Change shape*. Escolha uma destas duas:
     - **Ampere** › `VM.Standard.A1.Flex` com **1 OCPU e 6 GB** (melhor);
     - se aparecer "Out of capacity": **AMD** › `VM.Standard.E2.1.Micro` (1 GB, também funciona).
4. **Networking:** deixe o padrão e confirme que **Assign a public IPv4 address** está marcado.
5. **Add SSH keys:** toque em **Save private key** e guarde o arquivo. Só é preciso em emergência.
6. Toque em **Show advanced options** › **Management** › **Paste cloud-init script** e cole o texto abaixo, **trocando a senha**:

```bash
#!/bin/bash
export PAINEL_SENHA='TROQUE-POR-UMA-SENHA-FORTE'
export MEU_WHATSAPP_ALERTA=''
export GEMINI_API_KEY=''

curl -fsSL https://raw.githubusercontent.com/pggcthymg7-rgb/secretaria-imoveis-whatsapp/main/deploy/instalar-vm.sh -o /root/instalar-vm.sh
bash /root/instalar-vm.sh > /var/log/secretaria-instalacao.log 2>&1
```

7. Toque em **Create**. Quando o status ficar **Running**, anote o **Public IP address** (ex.: `129.151.10.20`).

A instalação continua sozinha por ~5 a 10 minutos depois que a máquina liga.

---

## Passo 3 — Liberar o acesso ao painel (3 min)

A Oracle bloqueia tudo por padrão. Libere as portas do site:

1. Na página da instância: **Primary VNIC** › clique na **Subnet**.
2. **Security Lists** › **Default Security List**.
3. **Add Ingress Rules**:
   - **Source CIDR:** `0.0.0.0/0`
   - **IP Protocol:** TCP
   - **Destination Port Range:** `80,443`
4. **Add Ingress Rules** para salvar.

O firewall de dentro da máquina o instalador já liberou sozinho.

---

## Passo 4 — Abrir o painel e conectar o WhatsApp (5 min)

1. Troque os pontos do seu IP por traços e abra no navegador:
   **https://129-151-10-20.sslip.io** (use o *seu* IP).
   O cadeado de HTTPS é gerado sozinho e de graça. Se não abrir de primeira, espere 2 minutos.
2. Entre com a **senha** que você colocou no script.
3. Na **Visão geral**, escaneie o QR Code: WhatsApp › Configurações › Aparelhos conectados › Conectar aparelho.
4. Em **Ajustes**: marque os **grupos de busca** (ex.: BUSCA ADÃO), confira o número de alerta e salve.
5. No WhatsApp, abra "Mensagem para mim" e mande **ajuda**.

---

## Passo 5 — Desligar o Render (2 min)

Só uma secretária pode estar conectada ao seu WhatsApp.

1. No celular: WhatsApp › Aparelhos conectados. Se aparecer um aparelho antigo (o do Render), **desconecte-o**.
2. No Render: abra o serviço **secretaria-imoveis-whatsapp** › **Settings** › role até o fim › **Suspend Web Service**.

> **Se você cadastrou imóveis ou mudou configurações direto no painel do Render**, a VM começa com a carteira do GitHub. Cadastre de novo o que faltar. Daqui para frente, use **Ajustes › Backup da memória** para mudar de servidor sem perder nada.

---

## Como fica o dia a dia

| O quê | Como funciona |
|---|---|
| Ligada 24h | Serviço do sistema; volta sozinha se a máquina reiniciar ou se der erro |
| Memória | `/var/lib/secretaria`, permanente |
| Backup | diário na própria máquina (14 dias) + **todo domingo no seu WhatsApp** + botão em Ajustes |
| Atualizações | automáticas todo dia por volta das 04:15. Se a versão nova tiver problema, ela volta sozinha para a anterior |
| Segurança | HTTPS, senha no painel, porta interna fechada, configuração secreta legível só pelo sistema |

---

## Se algo der errado

| Problema | Solução |
|---|---|
| Site não abre | Confira o Passo 3 (portas 80 e 443). Espere 5 min após criar a máquina |
| "Out of capacity" ao criar | Use o shape AMD `VM.Standard.E2.1.Micro` ou tente de novo mais tarde |
| Quero ver o que está acontecendo | Página da instância › **Console connection** › *Launch Cloud Shell connection*, entre e digite `sudo journalctl -u secretaria -f` |
| Ver o log da instalação | `sudo tail -100 /var/log/secretaria-instalacao.log` |
| Trocar a senha | `sudo nano /etc/secretaria.env` (linha `PAINEL_SENHA=`), depois `sudo systemctl restart secretaria` |
| Atualizar agora | `sudo bash /opt/secretaria/deploy/atualizar.sh` |
| Reinstalar sem perder nada | `sudo bash /opt/secretaria/deploy/instalar-vm.sh` |

---

## Alternativa: Google Cloud (e2-micro)

1. **console.cloud.google.com** › Compute Engine › **Criar instância**.
2. Região **us-east1**, **us-central1** ou **us-west1** (só essas são grátis); tipo **e2-micro**.
3. Disco de inicialização: **Ubuntu 24.04 LTS**, *disco permanente padrão* de **30 GB**.
4. Firewall: marque **Permitir tráfego HTTP** e **HTTPS**.
5. **Avançado › Gerenciamento › Automação › Script de inicialização:** cole o mesmo script do Passo 2.
6. Crie e siga a partir do **Passo 4**, com o IP externo da instância.

No Google, o script roda a cada vez que a máquina liga. Não tem problema: a instalação é segura para repetir e mantém a memória.
