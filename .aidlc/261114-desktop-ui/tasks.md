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


### UNIT-6 Pacote `.deb` (esqueleto ambulante)   Status: not started
- [ ] UNIT-6.1 Configurar electron-builder alvo deb, ícone, categoria, `depends` e módulos nativos fora do asar [FR-30] — teste: `pnpm package` gera o `.deb`
- [ ] UNIT-6.2 Verificar metadados com `dpkg-deb` e `lintian` [FR-30] — teste: Verificação sem erros
- [ ] UNIT-6.3 Teste de instalação, atualização e remoção em contêiner descartável [NFR-9, NFR-17] — teste: Dados persistem após `apt remove`
- [ ] UNIT-6.4 Medir tamanho do `.deb` e do instalado [NFR-16] — teste: Valores dentro do limite ou registro do desvio
- [ ] UNIT-6.5 Passo do CI que builda e testa o pacote [NFR-9] — teste: Workflow verde

### UNIT-4 Provedor LLM, configurações e custo   Status: not started
- [ ] UNIT-4.1 Interface de provedor e cliente OpenRouter com `fetch`, timeouts e erros estáveis [FR-19] — teste: Testes portados com provedor falso
- [ ] UNIT-4.2 Armazenamento cifrado da chave (AES-256-GCM, 0600) e redação de log [NFR-7] — teste: Teste: chave ausente de log, banco e renderer
- [ ] UNIT-4.3 Consentimento de envio de trechos [FR-20, NFR-6] — teste: Sem aceite não há envio
- [ ] UNIT-4.4 Tabela de preços, custo estimado, custo do mês e limite mensal [FR-21] — teste: Limite atingido bloqueia a geração
- [ ] UNIT-4.5 Telas de setup inicial e Configurações [FR-19] — teste: Testing Library

### UNIT-7 Ingestão, busca e biblioteca   Status: not started
- [ ] UNIT-7.1 Extração de PDF com mupdf em worker [FR-2] — teste: PDF de amostra com texto por página
- [ ] UNIT-7.2 Importar Markdown e texto [FR-2] — teste: Testes portados
- [ ] UNIT-7.3 Divisão em trechos com metadados e busca por palavras [FR-5] — teste: Trechos iguais às fixtures
- [ ] UNIT-7.4 Tela Biblioteca com importação, progresso e exclusão [FR-2] — teste: Testing Library e E2E
- [ ] UNIT-7.5 Medir importação de PDF de 100 páginas [NFR-1] — teste: Teste `perf` < 60 s

### UNIT-8 OCR, URL e DOCX   Status: not started
- [ ] UNIT-8.1 OCR com tesseract.js e dados de idioma embutidos, com confiança [FR-3] — teste: Amostra escaneada importada
- [ ] UNIT-8.2 Importação de URL com Readability + jsdom [FR-4] — teste: Páginas de amostra
- [ ] UNIT-8.3 Importação de DOCX [FR-4] — teste: Amostra DOCX
- [ ] UNIT-8.4 Comparar a qualidade com a do Python e registrar desvios [R-2] — teste: Relatório de comparação

### UNIT-9 Flashcards com fonte e revisão   Status: not started
- [ ] UNIT-9.1 Prompts e esquemas de geração de cards (4 tipos) [FR-6] — teste: Testes portados
- [ ] UNIT-9.2 Conferência de citação e descarte de itens sem fonte [FR-7] — teste: Fixtures de citação
- [ ] UNIT-9.3 Serviço de geração com jobs, progresso, cancelamento e relatório [FR-6, NFR-2] — teste: 20 itens com provedor falso sem travar a janela
- [ ] UNIT-9.4 Telas Gerar e Revisar (aprovar, editar, descartar, lote) [FR-8] — teste: Testing Library
- [ ] UNIT-9.5 Script de avaliação `pnpm sm1` [NFR-8] — teste: Executa sobre conjunto fixo

### UNIT-10 Estudo FSRS   Status: not started
- [ ] UNIT-10.1 Integrar ts-fsrs e agenda de cards [FR-12] — teste: Intervalos iguais aos de referência
- [ ] UNIT-10.2 Fila do dia, filtro, meta diária e desfazer [FR-13] — teste: Testes portados de `study`
- [ ] UNIT-10.3 Tela Estudar com atalhos [FR-13] — teste: Testing Library: Espaço e 1 a 4

### UNIT-11 Questões verificadas e prática   Status: not started
- [ ] UNIT-11.1 Geração de questões C/E e múltipla escolha [FR-9] — teste: Testes portados
- [ ] UNIT-11.2 Segunda verificação por LLM e descarte de não sustentadas [FR-10] — teste: Caso com gabarito sem suporte
- [ ] UNIT-11.3 Perfil de prova [FR-11] — teste: Formato respeita o perfil
- [ ] UNIT-11.4 Tela Praticar com correção, comentário e tempo [FR-14] — teste: Tentativa gravada

### UNIT-12 Caderno de erros e estatísticas   Status: not started
- [ ] UNIT-12.1 Itens errados viram cards com fonte [FR-15] — teste: Teste portado de `error_notebook`
- [ ] UNIT-12.2 Tópicos e estatísticas (retenção, sequência, acerto por tópico) [FR-16] — teste: Fixtures de estatísticas
- [ ] UNIT-12.3 Telas Erros e Estatísticas com Recharts [FR-16] — teste: Testing Library

### UNIT-13 Treino de pontos fracos   Status: not started
- [ ] UNIT-13.1 Escolher tópicos de menor acerto e pré-configurar a geração [FR-17] — teste: Teste de seleção
- [ ] UNIT-13.2 Botão "Treinar" nas telas Hoje, Estatísticas e Erros [FR-17] — teste: Testing Library

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

