# Relatório Final de Auditoria, Correção e Blindagem em Produção

- **Repositório:** `secretaria-imoveis-whatsapp-main`
- **Branch de Auditoria:** `audit/escala-producao`
- **Commit Base:** `edfebbaec23ec7d7dabc9c556419c9ca6bda38c3`
- **Protocolo Executado:** Fase 0 (Baseline) → Passada 1 (Agentes 1–8) → Passada 2 (Refinos e Regressões) → Passada 3 (`1/2` limpa) → Passada 4 (`2/2` limpas consecutivas) → Fase 3 (Faxina Final) → Fase 4 (Relatório e Publicação na branch `audit/escala-producao`)

---

## 1. Resumo Executivo (Baseline vs. Estado Final Pré-Relatório)

| Métrica / Gate | Baseline Inicial (Fase 0) | Estado Convergido (Passadas 3 e 4 — `2/2`) |
| --- | --- | --- |
| `node scripts/check.js` | `89` arquivos verificados, `0` erros | `89` arquivos verificados, `0` erros |
| `npm test` (`node --test tests/*.test.js`) | `178` testes: `176` pass, `2` fail | `189` testes: `189` pass, `0` fail, `0` skipped |
| `npm audit` | `0` vulnerabilidades | `0` vulnerabilidades (`found 0 vulnerabilities`) |
| `bash -n deploy/*.sh` | `6/6` scripts válidos (`corretores.sh` falhava em runtime sob `set -u`) | `6/6` scripts válidos e corrigidos (`BASH_SYNTAX_OK`) |
| `git diff --stat edfebba..0d156cc` | — | `70` arquivos modificados (`+2267` / `-764` linhas) em `8` commits |
| Árvore de trabalho | Limpa | Limpa (sem arquivos temporários, caches locais ou `.audit_checkpoint.md`) |

### Falhas de Baseline Resolvidas
1. **`tests/cerebro.test.js:199`** — benchmark do Cérebro levava `109.1 ms` (acima do teto de `60 ms`); reduzido após cache OSM compartilhado e pré-computação de índices em `src/brain/locations.js`.
2. **`tests/sistema.test.js:61`** — `deploy/corretores.sh` abortava com `ENTRADAS[@]: unbound variable` sob `set -u` com lista vazia; corrigido com expansão segura `${arr[@]+"${arr[@]}"}`.

---

## 2. Histórico de Commits e Escopo por Especialista

### Passada 1 — 8 Agentes Especialistas
1. **`d88a6ac` — Agente 1 (Multi-Tenant & Isolamento de Escala)**
   - **Escopo:** `src/paths.js`, `src/store.js`, `src/settings.js`, `src/tenancy/{container,index,router,routes,session-manager,tenant-store}.js`, `src/radar.js`, `src/metrics.js`, `src/app.js`, `tests/multitenant.test.js`.
   - **Principais correções:** Isolamento de `dataPath`, escrita atômica com limpeza de `.tmp`, prevenção de path traversal e prototype pollution em `store.js`/`settings.js`/`tenant-store.js`; filtro de segredos e isolamento de `exitCode`/`req.cache`/timers em `container.js`; mutex por tenant e limpeza de listeners em `session-manager.js`; proteção contra host reservado e ressuscitação em `tenancy/index.js` e `router.js`; shutdown do `MemoryStore` do rate-limiter em `app.js`.
2. **`a3431a7` — Agente 2 (Segurança / AppSec OWASP)**
   - **Escopo:** `src/auth.js`, `src/app.js`, `src/envfile.js`, `src/vitrine.js`, `src/backup.js`, `src/sistema.js`, `src/metrics.js`, `tests/{seguranca,backup,seguranca-alertas-2}.test.js`.
   - **Principais correções:** Proteção de `parseCookies` contra `URIError`; comparação `safeEqual` com hash SHA-256; eliminação de bypass CSRF via Bearer falso; resolução de `clientIp` por `req.ip`; validação por magic bytes em uploads de fotos; validação estrita de URLs Google e horários; handler assíncrono `ah`/erros sem vazar stack trace em respostas HTTP; escrita atômica em `envfile.js` e `backup.js`; guarda contra prototype pollution em `vitrine.js`/`metrics.js` e validação de referência/URL em `sistema.js`.
3. **`9c3187f` — Agente 3 (WhatsApp, Filas & Concorrência)**
   - **Escopo:** `src/whatsapp.js`, `src/scheduler.js`, `src/contacts.js`, `src/atendimento-diario.js`, `src/assistant.js`, `src/prospeccao.js`, `src/radar.js`, `src/sheets.js`, `src/anuncios.js`, `tests/{whatsapp-fluxo,funcoes}.test.js`.
   - **Principais correções:** `withTimeout`, `cleanupSocket`, mutex `startingAgent`, `stopWhatsAppAgent` com limpeza de listeners, proteção em `DOMAIN_EVENTS` e tetos de crescimento em `connectedGroups`/`sentOffers`/`ancoras` (`whatsapp.js`); trava sequencial em `scheduler.js` (`weeklyMapTick` aguardado e marcado apenas após sucesso); limites de memória em `contacts.js`, `atendimento-diario.js`, `prospeccao.js`; `clearTimeout(draft.ackTimer)` e guarda de protótipo em `assistant.js`/`radar.js`; validação ZIP/timestamps em `anuncios.js`; escrita atômica, validação de webhook e limite de 20 MB CSV em `sheets.js`.
4. **`9ae91f5` — Agente 4 (IA, NLP & Scraping Resiliente)**
   - **Escopo:** `src/brain/{locations,parser,text}.js`, `src/matcher.js`, `src/busca-{inteligente,anuncio,apify,serp}.js`, `src/gemini-modelo.js`, `src/garimpo.js`, `tests/{cerebro,busca-anuncio}.test.js`.
   - **Principais correções:** Cache OSM compartilhado por `caminho + mtime + tamanho` e pré-computação de índices/aliases em `src/brain/locations.js`; teto de entrada em `normalize`/`parseRequest`; `clearTimeout`, JSON seguro e callbacks seguras contra `$` em `matcher.js`; fallback para HTML HTTP 502 em `busca-inteligente.js`; validação estritamente numérica de `idAnuncio` em `busca-anuncio.js`; caches limitados em `gemini-modelo.js`; guardas de entrada nula e URL em `garimpo.js`, `busca-apify.js` e `busca-serp.js`.
5. **`574661f` — Agente 5 (PDF, Workers & Mídia)**
   - **Escopo:** `src/pdf16x9/{lock,cache-fotos,worker,manager,gerar,motor,kit}.js`, `src/pdf.js`, `src/pdf-ficha.js`, `src/capas.js`, `tests/{pdf16x9-manager,pdf}.test.js`.
   - **Principais correções:** `lock.js` com permissão `0o600`, liberação em `finally` e recuperação de lock vazio ou expirado (`maxAgeMs`); `cache-fotos.js` com escrita atômica, limite de `25 MB` / `40 MP` no `sharp` e limpeza de `.tmp`; `worker.js` com limite de `10 MB` no logo e escrita atômica; `manager.js` com `sanitizeId`, validação de `logoPath` restrita a `DATA_DIR`/`FOTOS_DIR`, cache PDF LRU de `100 MB`, hash completo (marca/paleta/logo/páginas), tratamento de `messageerror`/`exit` e `shutdown()`; contenção por `realpathSync` e guardas em `pdf.js`/`pdf-ficha.js`, `Object.hasOwn` em `gerar.js`, e limites de dimensão/comprimento em `motor.js`/`kit.js`.
6. **`a5eff58` — Agente 6 (Frontend & Resiliência de Interface)**
   - **Escopo:** `src/public/{app,capas,biga-art}.js`, `tests/{seguranca-alertas-2,capas}.test.js`.
   - **Principais correções:** `safeHref`, `safeWaPhone`, `safeQrSvg` e `hasOwn` em `src/public/app.js` neutralizando links XSS/`javascript:` e atributos inseguros (inclusive escape completo em `viewCarteira`), feedback amigável offline em `api()`, abort/`401` em `pdfArquivo()`, `stopSay()`, pausa de `ambient()` com aba oculta, trava anti-reentrância em polling/busca, sequência monotônica em `go()`, `CSS.escape` e `encodeURIComponent`; `safeFont`, LRU `cacheImg`, limpeza de timers `<link>` e trava `loteGerando` em `src/public/capas.js`; sanitização de ID SVG e prevenção de divisão por zero em `src/public/biga-art.js`.
7. **`5d0a3f9` — Agente 7 & Gate da Passada 1 (DevOps, Infraestrutura & Ciclo de Vida)**
   - **Escopo:** `deploy/*.sh` (`atualizar.sh`, `caddy-corretores.sh`, `chave-deploy.sh`, `cloud-init.sh`, `corretores.sh`, `instalar-vm.sh`), `index.js`, `scripts/{check,atualizar-mapa}.js`, `.gitignore`, `tests/sistema.test.js`.
   - **Principais correções:** Correção de `ENTRADAS[@]` sob `set -u` em `deploy/corretores.sh`, `trap`/limpeza de temporários e escrita atômica nos scripts em `deploy/*.sh` e `scripts/atualizar-mapa.js`, limpeza do diretório temporário `/tmp/check-*` em `scripts/check.js`, graceful shutdown e handlers de rejeição em `index.js`, e atualização de `.gitignore`.

### Passada 2 — Varredura Adicional
8. **`0d156cc` — Refinos de Produção (`src/whatsapp.js`, `src/app.js`, `tests/seguranca-alertas-2.test.js`)**
   - `src/whatsapp.js:519-520`: `fs.mkdirSync(FOTOS_DIR, { recursive: true })` e `{ mode: 0o600 }` em `downloadImageToFotos` para evitar `ENOENT` em novos tenants sem upload prévio via painel.
   - `src/app.js:457-460`: verificação com `Object.prototype.hasOwnProperty.call(fichas16, pidStr)` na rota `GET /api/pdf/:id`.
   - `src/app.js:530-534`: leitura única de `vitrine.getState().posts` fora do loop, guarda `Object.prototype.hasOwnProperty.call(posts, String(p.id))` e incremento de `criados` apenas quando `vitrine.upsertPost(p)` retorna post válido.
   - `src/app.js:755-759`: `shutdown()` estendido para invocar `pdf16x9.shutdown()` e `anunciosMem.persist(true)` além de `rateLimitStore.shutdown()`.
   - `tests/seguranca-alertas-2.test.js:146-158`: teste regressivo automatizado cobrindo `app.shutdown()`, `hasOwnProperty` e criação segura de `FOTOS_DIR`.

---

## 3. Convergência & Faxina Final

- **Passada 3 (`1/2`):** Varredura estática (`debugger`, resíduos, diffs) + execução integral dos 4 gates (`check.js`, `npm test`, `npm audit`, `bash -n deploy/*.sh`) concluída sem novos defeitos (`189/189` testes, `53343 ms`).
- **Passada 4 (`2/2`):** Reexecução independente integral de todos os gates sem nenhuma alteração de código entre passadas (`189/189` testes em `53372 ms`, `0` erros no `check.js`, `0` vulnerabilidades no `npm audit`, `6/6` scripts shell válidos, árvore sem resíduos).
- **Faxina Final (Fase 3):** `.audit_checkpoint.md` removido antes do commit deste relatório; nenhum diretório temporário (`cache_pdf_16x9`, `cache_fotos_16x9`, `*.tmp`, `*.log`, `.DS_Store`) deixado na raiz; arquivos operacionais documentados (`ESTADO_ATUAL.md`, `GUIA_VM_GRATUITA.md`) preservados integralmente.
- **Preservação de Negócio:** Nenhuma regra de atendimento, limites da Vitrine, pontuação do Matcher/Cérebro ou comportamento de `BIGA_PAPEL=corretor` foi alterada.

---

## 4. Correções de CI (Node 22) e CodeQL na PR #57

Após a abertura da PR #57 (`audit/escala-producao` → `main`), dois checks remotos falharam e foram corrigidos integralmente:

1. **`CI/testes` (Node 22 em `ubuntu-latest`)**
   - **Causa raiz:** `esperarHistorico` em `src/whatsapp.js` usava `.unref()` em um `setTimeout` ativamente aguardado via `await`. No Node 22, quando não há outros handles ativos no event loop, `.unref()` permite o encerramento prematuro do processo com `ERR_TEST_FAILURE: Promise resolution is still pending but the event loop has already resolved` em `tests/whatsapp-fluxo.test.js:222` (cancelando os testes 181–189). O mesmo padrão latente existia em `withTimeout` (`src/whatsapp.js`) e no timeout do Gemini (`src/matcher.js`).
   - **Correção:** Remoção de `.unref()` nesses três timeouts ativamente aguardados (preservando `.unref()` apenas em timers em background) e limpeza imediata de `esperasHistorico` dentro de `stopWhatsAppAgent()` em `src/whatsapp.js`.

2. **`CodeQL` — Alerta #30 (`js/insufficient-password-hash`, High 8.1) em `src/auth.js:40`**
   - **Causa raiz:** `safeEqual()` utilizava `crypto.createHash('sha256')` antes de `crypto.timingSafeEqual`, acionando o detector de hash fraco em fluxo vindo de `API_TOKEN`/`PAINEL_SENHA`.
   - **Correção:** Remoção de `digestValue()` e comparação direta em tempo constante sobre `Buffer.from(..., 'utf8')` com `crypto.timingSafeEqual`.

3. **`CodeQL` — Alerta #29 (`js/redos`, High 7.5) em `tests/busca-anuncio.test.js:240`**
   - **Causa raiz:** `lerPaginaOlx()` (`src/busca-anuncio.js`) construía `new RegExp(...)` com `idLimpo` e o teste em `tests/busca-anuncio.test.js:240` passava a literal `'(a+)+$'`.
   - **Correção:** Substituição de ambos os `new RegExp` por busca linear pura via `indexOf` e checagem de fronteira de dígito (`encontrarCampoId` em `src/busca-anuncio.js`), e troca da literal no teste por entradas inválidas sem padrão ReDoS (`1509799842|999`, `abc-invalido`) mantendo a cobertura de rejeição.
