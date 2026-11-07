# RESUMO EXECUTIVO DE IMPLEMENTAÇÃO — GERADOR DE PDF 16:9 DA BIGA
**Fase 0 — Plano de Engenharia, Resiliência e Auditoria Arquitetural**  
*Documento submetido para avaliação e laudo dos perfis `@phd-backend-engineer` e `@analista-qa-global`.*

---

## 1. Contexto Operacional e Restrições de Hardware
* **Ambiente de Produção**: VM Oracle Linux / Ubuntu 24.04 (1 GB RAM física, 2 GB swap, Node 22.x).
* **Multi-tenancy Físico**: Duas instâncias BIGA ativas em simultâneo na mesma máquina (João na porta `3000` e Laura na `3001`), consumindo ~250 MB de base cada. Teto seguro de memória livre: **≤ 180–200 MB por pico de job**.
* **Deploy e Resiliência**: Atualização automática via `deploy/atualizar.sh` com rollback atômico (`git reset --hard`) se `scripts/check.js` falhar ou se `/health` não responder.
* **Premissa Central**: Em produção, **a ficha A4 clássica permanece como fallback inquebrável**. Falha de foto, fonte, sharp ausente ou estouro de timeout nunca interrompe o envio no WhatsApp.

---

## 2. Detalhamento dos Pilares Obrigatórios

### (a) Arquitetura de Isolamento de CPU e Memória (Worker Threads)
* **Problema Diagnosticado**: O processamento de imagens com `sharp` (decodificação de fotos JPEG/PNG/WebP de até 12 MP) e a geração vetorial com `pdfkit` na thread principal do Node.js congelam o Event Loop por 1,5 a 2,5 segundos. Isso causaria perda de pacotes keepalive do Baileys (WhatsApp), desconexão 428/515 e atraso crítico nas rotas HTTP do Express.
* **Desenho Estrutural (`node:worker_threads`)**:
  1. **Despachante na Thread Principal (`src/pdf16x9/manager.js`)**:
     * Recebe pedidos de geração (Web, WhatsApp, Assistente ou Background Job).
     * Gerencia fila local com concorrência estrita (`concurrency: 1`).
  2. **Passagem de Mensagens Zero-Copy (Apenas Metadados)**:
     * O despacho via `worker.postMessage({ imovelId, kit, ficha, filePaths })` trafega apenas metadados primitivos e caminhos em disco.
     * **Nenhum buffer pesado de fotos é trafegado entre threads**.
  3. **Worker Dedicado (`src/pdf16x9/worker.js`)**:
     * Executa em isolado V8 limpo com heap independente.
     * Configura obrigatoriamente `sharp.cache(false)` e `sharp.concurrency(1)` ao iniciar, contendo o uso de memória a ~170 MB.
     * Carrega fontes estáticas e redimensiona fotos para o cache efêmero em disco/memória no Worker.
     * Renderiza o PDF via `pdfkit` + `qrcode` (emissão de matriz vetorial nativa, sem bitmap intermediário).
     * Grava o arquivo compilado em cache e devolve para a thread principal `{ ok: true, pdfPath, bytes, ms, paginas, avisos }`.
  4. **Ciclo de Vida Efêmero (Kill-on-Complete)**:
     * O Worker morre (`worker.terminate()`) logo após finalizar o PDF para devolver 100% da memória RSS associada ao libvips e ao V8 para o sistema operacional Linux.
  5. **Watchdog de Timeout**:
     * Timeout rígido de 15 segundos na Thread Principal. Se o Worker exceder o limite, o processo principal executa `worker.terminate()`, loga o incidente e aciona o Fallback A4.

---

### (b) Lógica da Trava Atômica via Kernel Linux (PID Fencing)
* **Problema Diagnosticado**: Duas instâncias BIGA ou dois processos gerando PDFs simultâneos de 10 fotos na mesma VM de 1 GB de RAM causariam pico somado > 600 MB, acionando o `oom-killer` do kernel Linux. Travas baseadas em idade de arquivo (`mtime`) são frágeis a crashes e desvios de relógio NTP.
* **Algoritmo de Fencing Atômico no Kernel**:
  1. **Arquivo de Bloqueio**: `path.join(os.tmpdir(), 'biga-pdf-generator.lock')`.
  2. **Aquisição Atômica no SO**:
     * Usa a flag exclusiva do kernel Linux:
       ```javascript
       const handle = await fs.promises.open(LOCK_FILE, 'wx');
       await handle.writeFile(String(process.pid), 'utf8');
       await handle.close();
       ```
     * A flag `'wx'` instrui o SO a operar via `O_CREAT | O_EXCL`. Se o arquivo existir, falha instantaneamente com `EEXIST`.
  3. **Detecção Segura de Trava Órfã (Stale Lock por Crash de Processo)**:
     * Ao receber `EEXIST`, lê o PID gravado:
       ```javascript
       const lockPid = parseInt(await fs.promises.readFile(LOCK_FILE, 'utf8'), 10);
       ```
     * Envia o sinal de teste zero ao kernel:
       ```javascript
       try {
         process.kill(lockPid, 0); // Verifica se o processo ainda existe no SO
         // Processo existe -> Trava legítima: aguarda backoff ou fila
       } catch (err) {
         if (err.code === 'ESRCH') {
           // O processo dono da trava morreu de forma abrupta!
           await fs.promises.unlink(LOCK_FILE).catch(() => {});
           // Readquire a trava com segurança
         }
       }
       ```
  4. **Liberação Limpa**:
     * No bloco `finally`, confere se o PID gravado ainda corresponde ao seu próprio `process.pid`. Em caso positivo, executa `unlink`.

---

### (c) Bibliotecas Envolvidas e Dependências
1. **`sharp` (v0.35.5 EXATO)**:
   * Declarado em `dependencies` no `package.json` (essencial para resistir a `npm ci --omit=dev` do deploy).
   * Binários pré-compilados Linux x64 garantidos no `package-lock.json` (`@img/sharp-linux-x64` e `@img/sharp-libvips-linux-x64`).
   * Configuração obrigatória: `sharp.cache(false)` e `sharp.concurrency(1)`.
   * Ajuste de `engines.node` para `">=20.9"`.
2. **`pdfkit` (`^0.20.2`)**:
   * Homologado no projeto para canvas vetorial 1152x648 pt, cálculo de largura tipográfica com `widthOfString` e paginação.
3. **`qrcode` (`^1.5.4`)**:
   * Geração direta dos módulos vetoriais matriciais (`QRCode.create(url).modules`) desenhados nativamente com retângulos vetoriais, sem bitmap intermediário.
4. **Fontes TTF Estáticas (SIL Open Font License 1.1)**:
   * 100% livres e sem eixos variáveis (sem tabelas `fvar`):
     * **Modelo A**: Jost (300, 500, 700)
     * **Modelo B**: Cormorant Garamond (400, 600) & Work Sans (400)
     * **Modelo D**: Archivo Black (400) & Archivo (400, 700)
     * **Modelo E**: Lora (400, 700) & Source Sans 3 (400, 600)
     * **Modelo F**: Bodoni Moda (400, 500) & Pinyon Script (400)
     * **Alternativas do KIT**: Montserrat, Outfit, Playfair Display, EB Garamond, Anton, Alfa Slab One, Merriweather, Libre Baskerville, Libre Bodoni.

---

### (d) Estratégia de Fallback e Integridade de Dados
* **Princípio da Não-Degradação**: A entrega de fichas e o atendimento no WhatsApp **nunca** podem ser interrompidos por falhas na camada nova de PDF 16:9.
* **Mecanismo de Proteção em Dupla Camada**:
  * Qualquer exceção (ausência de sharp, imagens corrompidas, timeout do Worker > 15s, erro de leitura de fontes ou inconsistência estrutural):
    1. O erro é capturado e registrado com log estruturado `addLog('AVISO', `[PDF-16:9] Falha na geração (${err.message}). Revertendo para ficha A4 clássica.`)`.
    2. O dispatcher invoca imediatamente `src/pdf-ficha.js` (gerador A4 clássico mantido 100% funcional).
    3. O cliente no WhatsApp ou no painel recebe o documento sem interrupção.
* **Imutabilidade e Aditividade de Dados**:
  * `fichas_pdf.json` **NÃO** é reescrito nem migrado in-place (garante reversibilidade perfeita em caso de rollback na VM).
  * Dados novos vão em arquivos novos no `DATA_DIR`:
    * `kit_marca.json`: Configurações de marca, logo, paletas de 5 cores e tipografia.
    * `fichas_16x9.json`: Configurações de layout, seleção de modelo (A, B, D, E, F) e páginas personalizadas por imóvel.
  * Leitura em memória converte os dados legados transparentemente.

---

### (e) Trava de Segurança no Deploy (`scripts/check.js`)
* Extensão de `scripts/check.js` para:
  1. Carregar dinamicamente o `sharp` e validar seu funcionamento.
  2. Inicializar um documento PDF mínimo via `pdfkit`.
  3. Validar se o buffer gerado inicia estritamente com os magic bytes `%PDF`.
  4. Caso falhe na VM, o script aborta com código de saída `1`, acionando o rollback automático do `deploy/atualizar.sh`.

---

## 3. Matriz de Fases de Engenharia e QA

| Etapa | Escopo Técnico | Critério de Aceite / Gate de QA |
| :--- | :--- | :--- |
| **Commit 1** | Dependências (`sharp` 0.35.5, engines `node >= 20.9`) e fontes TTF em `fonts/` | `npm ci --omit=dev` com sucesso e integridade de fontes |
| **Commit 2** | Núcleo do motor 16:9 (`src/pdf16x9/`: `motor.js`, `modelos.js`, `kit.js`, `dados.js`, `gerar.js`) | Testes unitários de quebra de linha, slots e cálculo WCAG aprovados |
| **Commit 3** | Worker Threads + Trava Atômica via PID + Cache em disco com hash SHA-256 | Teste de concorrência e recuperação de trava órfã passando |
| **Commit 4** | Integração em `src/whatsapp.js`, `src/assistant.js`, rotas `/api/pdf/*` e Fallback A4 | Fallback automático comprovado em testes de estresse |
| **Commit 5** | Interface Web no Painel (`src/public/app.js` e `.html`) com preview via Canvas | Edição, reordenação de fotos e prévias funcionais no navegador |
| **Commit 6** | Backup (`src/backup.js`) com KIT e Fichas novas + Trava no `scripts/check.js` | `npm run verify` com 0 erros (158 testes legados + nova suíte) |

---

### 🛑 Ponto de Parada Obrigatório (Fase 0)
* Branch `pdf-16x9` ativa.
* Código de produção intocado.
* **Aguardando laudo de aprovação da auditoria do `@phd-backend-engineer` e `@analista-qa-global` para início da codificação.**
