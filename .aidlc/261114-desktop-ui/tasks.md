# Tasks — desktop-ui

- Verification command: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test --coverage` (proposto em 2.9; a aprovar no gate; o E2E Playwright e o teste do `.deb` rodam como etapas separadas do CI)
- Pré-requisito do UNIT-1: o repositório ainda não tem `package.json`; o comando passa a valer após a primeira tarefa de ferramentas do UNIT-1.

## 2.9 Delivery plan

Esqueleto ambulante ligado (`walking_skeleton=on`): o primeiro slice ponta a ponta é UNIT-1, 2, 3, 5 e 6 (janela Electron com barra lateral e Hoje lendo o banco, empacotada em `.deb`).

### Bolts

| Bolt | Units | Definition of Done | Hipótese de confiança |
|---|---|---|---|
| BOLT-1 Esqueleto ambulante | UNIT-1, UNIT-2, UNIT-3, UNIT-5, UNIT-6 | `apt install ./mind.deb` abre a janela com a tela Hoje lendo o banco; verification command, E2E de abertura e teste do pacote verdes; módulo nativo e tamanho validados | Média: o maior risco é o módulo nativo e o tamanho do pacote |
| BOLT-2 Entrada de conteúdo | UNIT-4, UNIT-7, UNIT-8 | Importar PDF, Markdown, escaneado, URL e DOCX e configurar o provedor, com qualidade comparada ao Python | Média: extração web e OCR podem divergir |
| BOLT-3 Gerar e estudar | UNIT-9, UNIT-10, UNIT-11 | Gerar, revisar, estudar com FSRS e praticar questões, com fixtures iguais às do Python | Alta: regras já especificadas por testes |
| BOLT-4 Análise e extras | UNIT-12, UNIT-13, UNIT-14, UNIT-15 | Erros, estatísticas, treino, chat com busca semântica e backup | Média: embeddings no Electron |
| BOLT-5 Fechamento | UNIT-16 | Paridade aprovada, Python removido, README novo e CI com E2E e `.deb` | Alta |

### Sequência e dependências externas

Ordem: BOLT-1 → BOLT-2 → BOLT-3 → BOLT-4 → BOLT-5 (seguindo o DAG de 2.7). Dependências externas: acesso ao registro npm e aos binários do Electron; chave de API real só para a avaliação de qualidade (NFR-8), fora do CI; Python em `legacy/` e `uv` disponíveis até o UNIT-16 para consultar a especificação. Sem push antes do fim da Construction, salvo pedido (M-7); o primeiro push exige reconciliar com o commit inicial da `main` remota (A6).

## Tasks

### UNIT-1 Fundação do repositório e ferramentas   Status: verified (2026-11-14, exit 0)
- [x] UNIT-1.1 Criar a tag de segurança `pre-squash` e colapsar o histórico Python em 1 commit local (sem push) [NFR-10] — teste: `git rev-list --count HEAD` = 1 mais o que vier depois; a tag aponta para o histórico antigo — files: git tag pre-squash; commit 83b528a
- [x] UNIT-1.2 Mover `src/`, `tests/`, `pyproject.toml`, `uv.lock`, `Dockerfile` e CI Python para `legacy/` [T-4] — teste: `legacy/` contém o Python; a raiz não tem `.py` — files: commit 7257452 (legacy/, samples/)
- [x] UNIT-1.3 Iniciar pnpm, `package.json`, tsconfig por alvo (strict), ESLint e Prettier [NFR-10] — teste: `pnpm lint`, `format:check`, `typecheck` passam — files: package.json, tsconfig.*.json, eslint.config.js, .prettierrc.json, .prettierignore, scripts/check-headers.mjs
- [x] UNIT-1.4 Configurar Vitest com cobertura V8 e um teste de fumaça [NFR-10] — teste: `pnpm test --coverage` passa — files: vitest.config.ts, src/core/smoke.test.ts
- [x] UNIT-1.5 Extrair fixtures de referência do Python (FSRS, trechos, prompts, citação, estatísticas) para JSON versionado [SC-4, ADR-6] — teste: Script em `legacy/` gera `fixtures/*.json`; teste de integridade lê as fixtures — files: scripts/extract-fixtures/extract_fixtures.py, fixtures/*.json, tests/fixtures/fixtures.test.ts, legacy/README.md
- [x] UNIT-1.6 CI GitHub Actions (instalar, lint, formato, tipos, testes) [NFR-10] — teste: Workflow roda localmente com `act` ou valida a sintaxe — files: .github/workflows/ci.yml
- [x] UNIT-1.7 Cabeçalho de arquivo, `.gitignore`, `LICENSE` e `README` provisório [C-6] — teste: Lint verifica o cabeçalho — files: README.md, .gitignore, cabeçalhos via scripts/check-headers.mjs

**Resumo do UNIT-1.** Histórico Python colapsado em 1 commit (`pre-squash` guarda os 152 originais); Python movido para `legacy/`; toolchain pnpm 10 (via `corepack pnpm@10.12.1`, pois o `pnpm` não está no PATH), TypeScript 6.0 strict, ESLint 10 + Prettier, Vitest 5 com cobertura V8; fixtures de FSRS, trechos, citação e prompts extraídas do Python; CI do GitHub Actions com pnpm. Como rodar: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test --coverage`. Resultado em 2026-11-14: lint 0, formato 0, tipos 0, testes 0 (2 arquivos, 5 testes); cobertura sem código de produto ainda.

**Desvios.** (1) TypeScript fixado em 6.0 porque o typescript-eslint não suporta o 7.0 ainda; `@types/node` em 22. (2) As fixtures de estatísticas ficam para o UNIT-12, pois dependem de banco semeado; o script de extração será estendido lá. (3) Alvos de tipagem: um `tsconfig` por alvo e um para ferramentas, rodados em cadeia (sem `tsc -b`). (4) Nada commitado além do squash e do move; as mudanças do UNIT-1 aguardam seu aval para commit.


### UNIT-2 Casca Electron e IPC   Status: verified (2026-11-14, exit 0)
- [x] UNIT-2.1 Janela principal com barra de título nativa e mínimo 960x600 [FR-25] — teste: Teste Playwright lê o tamanho mínimo — files: src/main/index.ts, electron.vite.config.ts, src/renderer/*
- [x] UNIT-2.2 Instância única com foco na janela existente [FR-26] — teste: Teste lança duas instâncias e confere uma só janela — files: src/main/index.ts (requestSingleInstanceLock, second-instance)
- [x] UNIT-2.3 Persistir tamanho, posição e última rota [FR-27] — teste: Teste fecha e reabre e compara — files: src/main/window-state.ts, src/main/window-bounds.ts
- [x] UNIT-2.4 Preload `window.mind` mínimo e roteador IPC com zod [FR-31] — teste: Teste de canal válido e inválido (`VALIDATION_ERROR`) — files: src/core/contracts/*, src/main/ipc/router.ts, src/preload/index.ts
- [x] UNIT-2.5 Opções seguras da janela e CSP [NFR-15] — teste: Teste automatizado das opções e bloqueio de navegação externa — files: src/main/security.ts, electron.vite.config.ts (CSP meta)
- [x] UNIT-2.6 Garantir nenhuma porta de rede e medir o tempo de abertura [FR-25, NFR-14] — teste: Teste `perf` mede < 3 s; `ss -ltnp` sem listener — files: tests/e2e/shell.spec.ts, tests/e2e/launch.ts

**Resumo do UNIT-2.** Electron 45.3.2 com electron-vite 6 (main ESM, preload CJS sandboxado, renderer React 19); janela nativa com mínimo 960x600, instância única, estado da janela e da última rota via electron-store 12 com validação contra os monitores; segurança (`contextIsolation`, `sandbox`, sem `nodeIntegration`, CSP, navegação e janelas externas bloqueadas, permissões negadas); IPC tipado com `Result<T>`, canais `window:getState` e `window:setLastRoute`, roteador sem Electron e preload mínimo (`window.mind.invoke/on`). Como rodar: `pnpm dev` (usa `--no-sandbox`), `pnpm build`, `xvfb-run -a pnpm e2e`. Resultado: verification command exit 0 (24 testes, cobertura 100% do código medido) e E2E 8/8 em 9 s (janela abre em < 1 s).

**Desvios.** (1) **Sandbox do Chromium:** nesta máquina o `chrome-sandbox` do Electron não é setuid, então o app só inicia com `--no-sandbox` (o Playwright já o passa); o `.deb` do UNIT-6 deve instalar o helper com modo 4755 (ou usar perfil do AppArmor), e o E2E de cada instância extra usa `--no-sandbox`. (2) O teste de portas inicia o app direto, porque o Playwright acrescenta portas de depuração ao processo que lança. (3) CSP sem `frame-ancestors` (ignorado em `<meta>`). (4) Rota IPC rejeita `//…` (protocol-relative). (5) E2E e etapa de CI com Xvfb adicionados, fora do verification command.


### UNIT-3 Dados, workspaces e jobs   Status: verified (2026-11-14, exit 0)
- [x] UNIT-3.1 Esquema Drizzle do `app.db` e migrações [NFR-12] — teste: Teste de migração em banco novo e antigo — files: src/core/db/app-schema.ts, migrations/app/0000_init.sql, migrate.ts, migrations.ts
- [x] UNIT-3.2 Esquema do `workspace.db` e migrações [NFR-12] — teste: Teste de migração e de integridade — files: src/core/db/workspace-schema.ts, migrations/workspace/0000_init.sql
- [x] UNIT-3.3 Registro de workspaces: criar, renomear, trocar e excluir com isolamento [FR-1] — teste: Testes portados de `test_workspace_registry` — files: src/core/workspaces/registry.ts (+ registry.test.ts)
- [x] UNIT-3.4 Fila de jobs com `worker_threads`, limite de concorrência e recuperação de jobs interrompidos [NFR-18] — teste: Testes portados de `test_jobs`; tarefa longa não bloqueia — files: src/core/jobs/{store,queue,worker-pool}.ts (+ testes)
- [x] UNIT-3.5 Configuração, diretório de dados e canais `workspace:*` [FR-1] — teste: Teste de IPC dos canais — files: src/core/core.ts, src/main/ipc/handlers.ts, src/core/contracts/channels.ts, src/main/index.ts

**Resumo do UNIT-3.** Esquemas Drizzle de `app.db` e `workspace.db` com migrações SQL geradas pelo drizzle-kit (`pnpm db:generate`) e aplicadas por um executor próprio (transação por arquivo, tabela `_migrations`, recusa de banco mais novo); `WorkspaceRegistry` síncrono (criar, listar, obter, renomear, excluir, abrir com recuperação de jobs interrompidos, pastas órfãs removidas, nomes únicos sem diferenciar maiúsculas); `JobQueue` assíncrona com limite de concorrência, cancelamento cooperativo, progresso limitado e eventos; `runInWorker` sobre `worker_threads`; `createCore`; canais IPC `workspace:list/create/rename/delete`; handlers sem Electron; eventos `job:progress` e `job:finished`; fechamento ordenado no `before-quit`. Resultado: verification command exit 0 (65 testes, cobertura 94,87%, limiar de 80% agora imposto) e E2E 9/9 (workspace persiste entre execuções).

**Desvios.** (1) O `better-sqlite3` 13 usa N-API: o mesmo binário carrega no Node 22 e no Node 24 do Electron, então não houve rebuild. (2) Códigos de erro: acrescentado `INTERRUPTED` (A33). (3) Datas em ISO-8601 UTC como texto (A34). (4) Os workers reais (PDF, OCR, embeddings) ficam para os Units 7, 8 e 14; aqui só o pool genérico, testado com workers inline; o mecanismo de empacotamento dos workers (`?nodeWorker` do electron-vite) será validado no UNIT-7. (5) `export`/`import` de workspace ficam no UNIT-15. (6) A regra `security/detect-non-literal-fs-filename` foi desligada: os caminhos vêm do diretório de dados validado.


### UNIT-5 Casca de UI, tema e atalhos   Status: verified (2026-11-14, exit 0)
- [x] UNIT-5.1 Projeto React + Vite, tokens CSS e fontes locais [FR-28, FR-29] — teste: Teste de renderização do tema escuro e claro — files: src/renderer/src/styles/*.css, assets/fonts/*, electron.vite.config.ts
- [x] UNIT-5.2 Barra lateral com 8 seções, seletor de workspace e rodapé [FR-28] — teste: Testing Library: navegação e item ativo — files: src/renderer/src/components/{Sidebar,WorkspaceSwitcher,StatusBar,Shell}.tsx
- [x] UNIT-5.3 Tema escuro padrão com alternador salvo [FR-29] — teste: Teste de persistência — files: src/renderer/src/theme.ts, components/Shell.tsx
- [x] UNIT-5.4 Atalhos de teclado (Espaço, 1 a 4, Ctrl+K, Ctrl+,) [FR-32] — teste: Teste de teclado — files: src/renderer/src/hooks.ts, components/QuickSwitcher.tsx
- [x] UNIT-5.5 Tela Hoje com dados reais do banco e estados vazio, carregando e erro [FR-28] — teste: Teste com banco semeado — files: src/renderer/src/pages/TodayPage.tsx, src/core/today/summary.ts, canal today:summary
- [x] UNIT-5.6 Renderização de fórmulas com KaTeX, com texto bruto para fórmula inválida [FR-23] — teste: Fixtures de `math` portadas — files: src/renderer/src/math.ts, MathText.tsx
- [x] UNIT-5.7 Verificação de contraste AA nos dois temas [NFR-11] — teste: Teste portado de `test_theme_contrast` — files: tests/ui/contrast.test.ts, src/renderer/src/styles/tokens.css

**Resumo do UNIT-5.** Casca de UI definitiva em React 19: roteador próprio, barra lateral verde com as 8 seções e seletor de workspace (trocar, criar, renomear, excluir com confirmação), rodapé de status, tema escuro padrão (Dracula) com alternador salvo, atalhos (`Ctrl+K` seletor rápido, `Ctrl+,` Configurações, hook `useHotkeys` para Espaço e 1 a 4), tela Hoje com contagens reais via `today:summary` (estados vazio, carregando e erro), boas-vindas, KaTeX com `splitMath` portado e fontes locais. Como rodar: `pnpm dev` ou `xvfb-run -a pnpm e2e`. Resultado: verification command exit 0 (133 testes, cobertura 91,6% de linhas e 81,8% de ramos, limiar 80% imposto), contraste AA verificado nos dois temas, E2E 13/13 sem erros de console.

**Desvios.** (1) Hoje mostra a faixa de resumo da biblioteca; os indicadores de estudo chegam no UNIT-10 (A35). (2) O tema fica em `localStorage` (A36). (3) Contraste: o verde da barra lateral e o acento do tema claro foram escurecidos para passar AA (`--side` #1f7a45, `--accent` claro #177a41), e o vermelho do tema escuro foi clareado (#ff6e6e); o mockup de 2.5 usava valores um pouco diferentes. (4) KaTeX ainda não aparece em nenhuma tela (os Units 9 a 11 usam `MathText`), então seu CSS só entra no bundle quando for usado. (5) O teste de contraste vive em `tests/ui/` porque precisa de tipos do Node.


### UNIT-6 Pacote `.deb` (esqueleto ambulante)   Status: verified (2026-11-14, exit 0; instalação real pendente do autor)
- [x] UNIT-6.1 Configurar electron-builder alvo deb, ícone, categoria, `depends` e módulos nativos fora do asar [FR-30] — teste: `pnpm package` gera o `.deb` — files: electron-builder.yml, package.json (scripts package e package:dir), build/icons, build/icon.svg, build/copyright
- [x] UNIT-6.2 Verificar metadados com `dpkg-deb` e `lintian` [FR-30] — teste: Verificação sem erros — files: scripts/verify-deb.sh (dpkg-deb, desktop-file-validate, lintian)
- [x] UNIT-6.3 Teste de instalação, atualização e remoção em contêiner descartável [NFR-9, NFR-17] — teste: Dados persistem após `apt remove` — files: .github/workflows/ci.yml (job package: apt install, E2E no app instalado, reinstalação e apt remove); localmente só estático
- [x] UNIT-6.4 Medir tamanho do `.deb` e do instalado [NFR-16] — teste: Valores dentro do limite ou registro do desvio — files: scripts/verify-deb.sh (limites de tamanho)
- [x] UNIT-6.5 Passo do CI que builda e testa o pacote [NFR-9] — teste: Workflow verde — files: .github/workflows/ci.yml

**Resumo do UNIT-6.** `pnpm package` gera `dist/mind-study_0.1.0_amd64.deb` com electron-builder 26: app em `/opt/MIND`, atalho `/usr/bin/mind`, entrada de menu `mind.desktop` (categoria Education), ícones de 16 a 512 px, arquivo de copyright, `better-sqlite3` em `app.asar.unpacked` (só o binário linux-x64), dependências de sistema do Electron, `postinst` que configura o `chrome-sandbox` (user namespaces ou setuid) e o perfil do AppArmor do Ubuntu 24+. `scripts/verify-deb.sh` confere metadados, conteúdo, ausência de arquivos em diretórios de usuário e de `conffiles`, `desktop-file-validate`, limites de tamanho e `lintian` (sem erros, com as tags típicas de Electron suprimidas). Resultado: **.deb de 99 MB e 293 MB instalado** (limites 500 MB e 1 GB), verification command exit 0 (133 testes, 91,6%), E2E 13/13 tanto no código de desenvolvimento quanto contra o executável empacotado (`MIND_E2E_EXECUTABLE=dist/linux-unpacked/mind`).

**Desvios.** (1) **A instalação real não foi feita aqui:** o docker pede senha de sudo sem terminal; a instalação, a reinstalação e o `apt remove` reais com checagem de que `~/.config/mind` permanece estão no job `package` do CI (ainda não executado, pois não há push) e podem ser feitos à mão com `sudo apt install ./dist/mind-study_0.1.0_amd64.deb`. (2) O `pnpm` não está no PATH, então o electron-builder cai para a travessia manual de `node_modules` (resultado equivalente, conferido pelo E2E empacotado). (3) Campos `License` e `Vendor` do `control` geram avisos "unknown-field" no lintian; inofensivos. (4) `react`, `react-dom`, `katex` e `lucide-react` foram movidos para `devDependencies` (o Vite os embute no renderer). (5) O ícone é provisório (A38). (6) O design deste Unit foi escrito e implementado no mesmo turno, porque o autor já havia decidido nome, mantenedor, ícone e verificação; a aprovação formal fica no checkpoint do esqueleto.


### UNIT-4 Provedor LLM, configurações e custo   Status: verified (2026-11-14, exit 0)
- [x] UNIT-4.1 Interface de provedor e cliente OpenRouter com `fetch`, timeouts e erros estáveis [FR-19] — teste: Testes portados com provedor falso — files: src/core/llm/{provider,openrouter,types,fake}.ts (+ testes)
- [x] UNIT-4.2 Armazenamento cifrado da chave (AES-256-GCM, 0600) e redação de log [NFR-7] — teste: Teste: chave ausente de log, banco e renderer — files: src/core/secrets.ts, src/core/redaction.ts (+ testes); ADR-2
- [x] UNIT-4.3 Consentimento de envio de trechos [FR-20, NFR-6] — teste: Sem aceite não há envio — files: src/core/llm/{consent,guarded}.ts
- [x] UNIT-4.4 Tabela de preços, custo estimado, custo do mês e limite mensal [FR-21] — teste: Limite atingido bloqueia a geração — files: src/core/llm/costs.ts, src/core/settings/service.ts
- [x] UNIT-4.5 Telas de setup inicial e Configurações [FR-19] — teste: Testing Library — files: src/renderer/src/pages/{SetupPage,SettingsPage}.tsx, components/ProviderForm.tsx, settings-status.tsx, faixa em Shell.tsx

**Resumo do UNIT-4.** `Provider` único com `OpenRouterProvider` (fetch injetável, JSON Schema vindo do zod, recuo sem `response_format`, reenvio com a mensagem de validação, nova tentativa em 429 e 5xx, erros estáveis), `GuardedProvider` (sem aceite não há envio, limite mensal, registro de custo), `PriceCatalog` e `CostLedger` em `app.db`, `ConsentService`, `SettingsService`, `SecretStore` AES-256-GCM com a variável de ambiente prioritária, redação de log, `FakeProvider`, canais `settings:*` (a chave nunca sai do núcleo), telas de setup em 2 passos, faixa de aviso e Configurações (provedor, privacidade, custo do mês). Resultado: verification command exit 0 (197 testes, cobertura 95,6% de linhas e 87,0% de ramos) e E2E 15/15, incluindo a conferência de que a chave não aparece em arquivo algum do perfil e de que os arquivos `ai/*` são 0600.

**Desvios.** (1) A origem da chave é `stored` (cifrada) em vez de `file`, pois o `.env` não existe mais. (2) A UI não restaura rotas de setup após reiniciar (só seções). (3) `settings:getCost` recebe ano e mês explícitos (a UI usa o mês corrente). (4) O custo estimado antes de gerar (`PriceCatalog.estimate`) existe no núcleo, mas a tela Gerar que o mostra é do UNIT-9. (5) Aviso de design: o catálogo de modelos só é buscado quando o usuário pede (botão), como no Python; sem rede o campo de modelo continua livre.


### UNIT-7 Ingestão, busca e biblioteca   Status: verified (2026-11-14, exit 0)
- [x] UNIT-7.1 Extração de PDF com mupdf em worker [FR-2] — teste: PDF de amostra com texto por página — files: src/core/ingestion/pdf.ts, pdf.worker.ts, src/main/extract-worker.ts
- [x] UNIT-7.2 Importar Markdown e texto [FR-2] — teste: Testes portados — files: src/core/ingestion/text.ts
- [x] UNIT-7.3 Divisão em trechos com metadados e busca por palavras [FR-5] — teste: Trechos iguais às fixtures — files: src/core/ingestion/chunker.ts, db/migrations/workspace/0001_chunk_index.sql, 0002_chunk_fts.sql, src/core/retrieval/retriever.ts
- [x] UNIT-7.4 Tela Biblioteca com importação, progresso e exclusão [FR-2] — teste: Testing Library e E2E — files: src/renderer/src/pages/LibraryPage.tsx, MaterialPreviewPage.tsx, canais material:*
- [x] UNIT-7.5 Medir importação de PDF de 100 páginas [NFR-1] — teste: Teste `perf` < 60 s — files: tests/e2e/library.spec.ts (100 páginas em ~2 s, janela responsiva)

**Resumo do UNIT-7.** `Segment`, `reflowParagraphs`, `markdownSegments`, `extractText`, `extractPdf` (mupdf em `worker_threads`), `chunkSegments` e `MaterialService` (nome saneado, limite de 200 MB, job `import`, cancelamento, exclusão completa), índice FTS5 com gatilhos e `Bm25Retriever`, canais `material:*`, diálogo nativo no processo principal (o renderer nunca informa caminhos) e as telas Biblioteca e Prévia (progresso, busca com realce do trecho, paginação, exclusão com confirmação). Conferência por fixtures: texto de 3 PDFs, reflow, Markdown e trechos idênticos aos que o Python produz. **Desvios.** (1) Páginas com menos de 20 caracteres contam como "sem texto" no aviso, como no Python. (2) O `?nodeWorker` do electron-vite funcionou também no app empacotado.

### UNIT-8 OCR, URL e DOCX   Status: verified (2026-11-14, exit 0)
- [x] UNIT-8.1 OCR com tesseract.js e dados de idioma embutidos, com confiança [FR-3] — teste: Amostra escaneada importada — files: src/core/ingestion/ocr.ts (tesseract.js + dados por e eng), pdf.worker.ts
- [x] UNIT-8.2 Importação de URL com Readability + jsdom [FR-4] — teste: Páginas de amostra — files: src/core/ingestion/web.ts (fetchPage, validateUrl, Readability + linkedom), blocks.ts
- [x] UNIT-8.3 Importação de DOCX [FR-4] — teste: Amostra DOCX — files: src/core/ingestion/docx.ts (mammoth), blocks.ts
- [x] UNIT-8.4 Comparar a qualidade com a do Python e registrar desvios [R-2] — teste: Relatório de comparação — files: docx-web-ocr.test.ts, tests/e2e/library.spec.ts

**Resumo do UNIT-8.** OCR embutido com tesseract.js 7 (dados `por` e `eng` copiados uma vez para `userData/cache/tessdata`, confiança média por página, página escaneada de exemplo lida em ~0,4 s), Word por mammoth + linkedom (mesmas seções e linhas de tabela do Python, conferido com o `.docx` gerado), páginas web por `fetch` com limites do Python (5 MB, 20 s, 5 redirecionamentos validados um a um) e Readability, importação de URL com diálogo e erro de validação inline. **Resultado do esqueleto completo até aqui:** verification command exit 0 (299 testes, 95,5% de linhas, 86,4% de ramos), E2E 21/21 no código e 6/6 da biblioteca contra o app empacotado, `.deb` de 143 MB e 385 MB instalado (limites 500 MB e 1 GB), verify-deb e lintian sem erros. **Desvios.** (1) OCR e extração web não têm valor dourado exato (motores diferentes), o critério é ler as amostras com os termos esperados (R-2). (2) Readability remove o título repetido no corpo, então o primeiro bloco de uma página não tem seção. (3) `tesseract.js`, `tesseract.js-core` e os dados entram em `asarUnpack`.

### UNIT-9 Flashcards com fonte e revisão   Status: verified (2026-11-14, exit 0)
- [x] UNIT-9.1 Prompts e esquemas de geração de cards (4 tipos) [FR-6] — teste: Testes portados — files: src/core/generation/{prompts,schemas}.ts (texto idêntico às fixtures do Python)
- [x] UNIT-9.2 Conferência de citação e descarte de itens sem fonte [FR-7] — teste: Fixtures de citação — files: src/core/verification/source-checker.ts, src/core/generation/{planning,topics,cards,service}.ts
- [x] UNIT-9.3 Serviço de geração com jobs, progresso, cancelamento e relatório [FR-6, NFR-2] — teste: 20 itens com provedor falso sem travar a janela — files: src/core/generation/service.ts, src/core/core.ts (ensureReady), canais generation:*
- [x] UNIT-9.4 Telas Gerar e Revisar (aprovar, editar, descartar, lote) [FR-8] — teste: Testing Library — files: src/renderer/src/pages/{GeneratePage,ReviewPage}.tsx, src/core/review/service.ts, canais review:*
- [x] UNIT-9.5 Script de avaliação `pnpm sm1` [NFR-8] — teste: Executa sobre conjunto fixo — files: scripts/sm1.ts, src/core/sm1.ts, src/core/llm/scripted.ts, tests/e2e/generation.spec.ts

**Resumo do UNIT-9.** Prompts e esquemas portados com texto idêntico ao do Python (conferido por fixtures), `SourceChecker` (NFKC, aspas, traços, invisíveis, caixa) conferido caso a caso com as fixtures, planejamento (lotes de 6000 caracteres, 5 cards por lote, arredondamento como o do Python), `CardGenerator` (forma, fonte, duplicidade, cota, tópicos), `GenerationService` (estimativa, `ensureReady`, 2 lotes em paralelo, progresso, cancelamento, contadores e razões de descarte) e `ReviewService` (aprovar, descartar, editar, aprovar todos, contadores do SM-1). UI: Gerar com estimativa de custo e lista de execuções; Revisar com a citação ao lado, abas e edição; fórmulas e lacunas. `pnpm sm1` calcula a taxa SM-1. Resultado: verification command exit 0 (369 testes, 95,7% de linhas, 85,2% de ramos) e E2E 23/23 com o provedor roteirizado. **Desvios.** (1) O tipo `question` e o treino ficam nos Units 11 e 13; o contrato de `generation:*` só aceita `card` por enquanto (A45). (2) A rota de detalhe passou a ser genérica (`detailId`) para a prévia de material e a revisão (A46). (3) `import.meta.glob` das migrações ganhou um caminho de leitura de disco para rodar sob `tsx` (`pnpm sm1`). (4) Os testes E2E de geração só rodam fora do app empacotado.

### UNIT-10 Estudo FSRS   Status: verified (2026-11-14, exit 0)
- [x] UNIT-10.1 Integrar ts-fsrs e agenda de cards [FR-12] — teste: Intervalos iguais aos de referência — files: src/core/study/scheduler.ts (ts-fsrs, dia de estudo, intervalos) + scheduler.test.ts contra fixtures/fsrs.json
- [x] UNIT-10.2 Fila do dia, filtro, meta diária e desfazer [FR-13] — teste: Testes portados de `study` — files: src/core/study/service.ts, rendering.ts, canais study:*
- [x] UNIT-10.3 Tela Estudar com atalhos [FR-13] — teste: Testing Library: Espaço e 1 a 4 — files: src/renderer/src/pages/StudyPage.tsx, TodayPage.tsx (indicadores), hooks de teclado

**Resumo do UNIT-10.** `Scheduler` sobre ts-fsrs 6 (retenção 0,9), dia de estudo com virada às 4 h e deslocamento de fuso injetável, `StudyService` (fila com aprendizado vencido, revisões do dia e novos dentro da cota global, filtros por tópico, material e tipo, facetas, avaliação com log, desfazer, configurações validadas), apresentação de lacunas e intervalos (`1 min` a `1,2 anos`), canais `study:*`, tela Estudar com Espaço e 1 a 4, Ctrl+Z e filtro, e os indicadores de estudo em Hoje. **Paridade com o Python:** estados, repetições, lapsos, estabilidade e dificuldade coincidem em todas as sequências; **um** intervalo de revisão (boa depois de reaprendizado) difere em 1 dia entre as duas bibliotecas FSRS e o teste aceita essa tolerância (R-1). **Desvios.** (1) A fila serve primeiro o card em aprendizado que vence em até 20 min, como no Python; por isso a mesma carta volta logo após uma avaliação "Bom". (2) O E2E mede a troca de card (limite 1 s no teste; o alvo de 300 ms do NFR-3 é medido no UNIT-16).

### UNIT-11 Questões verificadas e prática   Status: verified (2026-11-14, exit 0)
- [x] UNIT-11.1 Geração de questões C/E e múltipla escolha [FR-9] — teste: Testes portados — files: src/core/generation/{question-prompts,schemas,questions}.ts (textos idênticos às fixtures)
- [x] UNIT-11.2 Segunda verificação por LLM e descarte de não sustentadas [FR-10] — teste: Caso com gabarito sem suporte — files: src/core/generation/judge.ts, questions.ts
- [x] UNIT-11.3 Perfil de prova [FR-11] — teste: Formato respeita o perfil — files: src/core/generation/service.ts (kind question, perfil, estimativa com juiz)
- [x] UNIT-11.4 Tela Praticar com correção, comentário e tempo [FR-14] — teste: Tentativa gravada — files: src/core/practice/service.ts, canais practice:*, src/renderer/src/pages/PracticePage.tsx

**Resumo do UNIT-11.** Prompts de questão e do juiz com texto idêntico ao do Python (fixtures regeneradas pelo script), esquemas, `questionProblem`, `QuestionGenerator` (forma, fonte, duplicidade, juiz em lote, contagem de não sustentadas e custo somado), `GenerationService` com perfis (`certo_errado`, `multiple_choice_4`, `multiple_choice_5`), lotes de 3 e estimativa de geração mais juiz, `PracticeService` (fila de novas, depois erradas e, com refazer, as certas; tentativas com resultado, tempo e dia; contagens), canais `practice:*` e telas Gerar (cards ou questões), Revisar (alternativas, gabarito e comentário) e Praticar (cronômetro, correção, comentário por alternativa e fonte, teclado). **Resultado dos Units 10 e 11:** verification command exit 0 (469 testes, 96,1% de linhas, 86,1% de ramos) e E2E 26/26 (estudo com teclado, desfazer e prática com o provedor roteirizado). **Desvios.** (1) O contrato `generation:*` agora aceita `kind: question` (A45 cumprida). (2) Uma regressão do `pnpm sm1` (leitura de migrações) foi detectada pelo E2E e corrigida com `try/catch` em torno de `import.meta.glob`.

### UNIT-12 Caderno de erros e estatísticas   Status: verified (2026-11-14, exit 0)
- [x] UNIT-12.1 Itens errados viram cards com fonte [FR-15] — teste: Teste portado de `error_notebook` — files: src/core/notebook/service.ts (+ notebook.test.ts, fixtures/stats.json)
- [x] UNIT-12.2 Tópicos e estatísticas (retenção, sequência, acerto por tópico) [FR-16] — teste: Fixtures de estatísticas — files: src/core/stats/{service,topics}.ts (+ stats.test.ts, topics.test.ts, paridade com fixtures/stats.json)
- [x] UNIT-12.3 Telas Erros e Estatísticas com Recharts [FR-16] — teste: Testing Library — files: src/renderer/src/pages/{ErrorsPage,StatsPage}.tsx, PracticePage (Virar card), Recharts + tabelas alternativas

**Resumo do UNIT-12.** `ErrorNotebook` (card de erro idempotente com fonte, lista e contagens), `TopicService` (listar, renomear, mesclar, excluir), `StatsService` (acerto por tópico, mais fracos, retenção 30 d, atividade, resumo e sequências), canais `errors:*`, `topics:*` e `stats:overview`, telas Erros e Estatísticas (gráficos Recharts com descrição e tabela alternativa, meta editável, gestão de tópicos) e "Virar card" na Prática. **Paridade:** `extract_fixtures.py` ganhou um mundo semeado (`fixtures/stats.json`) e o TS reproduz exatamente acerto por tópico, mais fracos, retenção, atividade, resumo e o texto dos cards de erro. **Resultado:** verification command exit 0 (512 testes, 96,4% de linhas, 85,9% de ramos), E2E 28/28; consulta de visão geral com 10 mil registros abaixo de 300 ms. **Desvios.** (1) O Recharts 3.2.1 foi adicionado como dependência (decisão do ADR de UI). (2) A seção Chat continua como placeholder (UNIT-14); os testes de navegação passaram a usar Chat.

### UNIT-13 Treino de pontos fracos   Status: verified (2026-11-14, exit 0)
- [x] UNIT-13.1 Escolher tópicos de menor acerto e pré-configurar a geração [FR-17] — teste: Teste de seleção — files: src/core/generation/training.ts (+ training.test.ts), service.ts (topicId sem material, avoid, spread)
- [x] UNIT-13.2 Botão "Treinar" nas telas Hoje, Estatísticas e Erros [FR-17] — teste: Testing Library — files: src/renderer/src/components/WeakTopics.tsx, GeneratePage (modo treino), router (?topic=&subtype=), Hoje e Estatísticas

**Resumo do UNIT-13.** `trainingMaterial` (trechos errados primeiro, depois BM25 do nome do tópico, máx. 30; `avoid` com até 25 itens existentes), `GenerationService` aceita `topicId` sem material (tópico forçado nos itens, lotes sem espalhar, `avoid` no prompt, validações e estimativa sem chamar o modelo), seção "Pontos fracos" com "Treinar" em Hoje e Estatísticas e Gerar pré-preenchida por `/w/:id/generate?topic=<id>&subtype=<tipo>` com banner, volta ao formulário de material e rótulo "Treino: tópico" nas execuções. **Resultado:** verification command exit 0 (527 testes, 96,5% de linhas, 86,3% de ramos), E2E 29/29 (treino sem material). **Desvios.** (1) O parser de rotas passou a aceitar só as chaves `chunk`, `topic` e `subtype`, sem repetição. (2) Os testes de treino usam as 3 passagens do rig em vez das 6 do Python; a ordem esperada foi adaptada.

### UNIT-14 Chat e busca semântica   Status: not started
- [ ] UNIT-14.1 Chat com recuperação por palavras, citações e "não encontrei suporte" [FR-18] — teste: Testes portados
- [ ] UNIT-14.2 Busca semântica opcional com transformers.js e modelo sob demanda [FR-18] — teste: Ativar, baixar e usar

### UNIT-15 Backup do workspace   Status: not started
- [ ] UNIT-15.1 Exportar workspace em `.zip` com manifesto [FR-22] — teste: Arquivo contém manifesto, banco e materiais
- [ ] UNIT-15.2 Importar com validação do manifesto [FR-22] — teste: Testes portados de `archive`; `ARCHIVE_INVALID` e `ARCHIVE_INCOMPATIBLE`

### UNIT-16 Fechamento e remoção do Python   Status: not started
- [ ] UNIT-16.1 Checklist de paridade por tela e por FR [SC-4] — teste: Checklist preenchido e aprovado pelo autor
- [ ] UNIT-16.2 E2E Playwright do fluxo de amostra (importar, gerar, revisar, estudar) [SC-4] — teste: Teste verde
- [ ] UNIT-16.3 Medir latência de telas, uso offline, memória e idioma [NFR-3, NFR-4, NFR-5, NFR-13] — teste: Relatório com os alvos
- [ ] UNIT-16.4 Remover `legacy/`, Dockerfile, API e `uvx` do README; README novo [SC-5, T-6] — teste: `git ls-files "*.py"` vazio
- [ ] UNIT-16.5 CI final com E2E e `.deb` [NFR-9] — teste: Workflow verde

