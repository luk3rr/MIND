# Tasks — generation-relevance

## 2.9 Delivery plan

- **Verification command:** `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test --coverage` (approved 2026-11-19 by human; pnpm em `~/.local/share/pnpm/bin`). A UNIT-6 e a UNIT-7 somam `xvfb-run -a pnpm e2e` ao fechar (M-15). O `pnpm eval:generation` (modelo real) é manual e fica fora do comando.
- **Order:** segue o grafo de `design.md § 2.7`: UNIT-1, UNIT-2, UNIT-3, UNIT-4, UNIT-5, UNIT-6, UNIT-7 (UNIT-3 e UNIT-4 podem trocar de ordem).
- **Walking skeleton:** UNIT-1 (a geração real com os prompts novos e LLM mockado), com aprovação do esqueleto antes de seguir. [state: walking_skeleton=on]
- **Condução:** autônoma; para na aprovação do esqueleto, em falhas e em ações irreversíveis. Commits atômicos, um ou mais por Unit, na `main`, sem `git push`, sem mexer na versão e sem tag. [mem: M-7; src: Q2 de 2.2, Q2 de 2.9]
- **Regras para toda tarefa:** código, comentários e commits em inglês; textos ao usuário em pt-BR em `strings.ts`; cabeçalho `Filename/Created on/Author` em arquivo de código novo (M-8); testes ao lado do código, relógio injetável e LLM mockado (M-5); migrations aditivas e geradas com `pnpm db:generate` (M-10); canais com esquema zod e `fake-mind.ts` alinhada (M-9); textos de tela em pt-BR.

### BOLT-1 — Units: UNIT-1, UNIT-2 — Owner: Construção

- **Goal:** prompts com disciplina e escopo, "até N" e o juiz de relevância; a primeira melhora visível na geração.
- **Definition of Done:** o comando de verificação passa; `prompts.test.ts` e `questions.test.ts` passam com as fixtures regeneradas; cards fora do escopo não viram rascunho; o contador "fora do escopo" persiste e aparece no resumo; a migration 0006 abre um banco 0005 populado sem perda; `CONTRACT_VERSION` em 2.
- **Confidence hypothesis:** alta; são mudanças de texto, de um passo `await` já usado nas questões e de uma coluna.
- **Risks and sequencing:** validar o esqueleto (UNIT-1) antes da UNIT-2; o juiz de cards muda o tempo da geração (R3 aceito).

### BOLT-2 — Units: UNIT-3, UNIT-4 — Owner: Construção

- **Goal:** medir a qualidade e classificar os trechos.
- **Definition of Done:** o comando de verificação passa; `pnpm eval:generation` roda e imprime os dois indicadores com o baseline; um material indexado fica classificado com a disciplina inferida; falha não perde o já classificado; `MONTHLY_LIMIT_REACHED` pausa; a migration 0007 abre um banco 0006 populado sem perda.
- **Confidence hypothesis:** média; a qualidade da classificação depende do modelo (R1) e das janelas (A18).
- **Risks and sequencing:** medir o baseline antes da UNIT-5; ajustar o tamanho da janela com as fixtures.

### BOLT-3 — Units: UNIT-5, UNIT-6 — Owner: Construção

- **Goal:** lotes por unidade e a disciplina na tela.
- **Definition of Done:** o comando de verificação e o e2e passam; uma questão dividida em dois trechos cai no mesmo lote; citação em contexto é descartada; sem análise a geração segue com o aviso; todos os estados do `mockups/refined.html` estão implementados.
- **Confidence hypothesis:** média; a UNIT-5 toca o planejamento, os dois geradores e o serviço.
- **Risks and sequencing:** UNIT-5 antes da UNIT-6 (os banners dependem do fallback); manter `planBatches` para o fallback.

### BOLT-4 — Units: UNIT-7 — Owner: Construção

- **Goal:** verificação final, medição contra a meta, guia e memória.
- **Definition of Done:** o comando de verificação e o `pnpm e2e` completos passam; cobertura global ≥ 80%; `eval:generation` atinge 0 fora de escopo e ≥ 80% dos bons (ou o desvio é registrado); guia e codekb atualizados; memória C1 decidida.
- **Confidence hypothesis:** média; a meta depende do modelo real.
- **Risks and sequencing:** última; depende das demais.

## Tasks

### UNIT-1 Prompts, escopo e "até N"   Status: verified (2026-11-19, exit 0)

- [x] T-1.1 Rodar a suíte completa e o `xvfb-run -a pnpm e2e` do baseline e registrar as falhas anteriores — covers A10 — files: `.aidlc/261119-generation-relevance/construction/build-and-test.md` — test: saída registrada
- [x] T-1.2 Acrescentar `PromptScope` e o parâmetro `scope` a `buildCardMessages`, com a disciplina, o teste de escopo e a regra "até N" no `SYSTEM` e na tarefa — covers FR-1 (interino), FR-2, FR-3 — files: `src/core/generation/prompts.ts` — test: `prompts.test.ts` (conteúdo: disciplina, escopo, "up to")
- [x] T-1.3 O mesmo para `buildQuestionMessages`: `QUESTION_SYSTEM`, `PROFILE_RULES` e `CALCULATION_SYSTEM`, com questões práticas e sem forçar o número — covers FR-2, FR-3 — files: `src/core/generation/question-prompts.ts` — test: `questions.test.ts` (conteúdo para cada perfil)
- [x] T-1.4 Ajustar `self-contained.ts`: tirar a instrução de copiar enunciado de prova, acrescentar a regra do comentário do professor e da questão inspirada — covers FR-5 — files: `src/core/generation/self-contained.ts` — test: `self-contained.test.ts`
- [x] T-1.5 Garantir que `CardGenerator` e `QuestionGenerator` aceitam lista vazia ou menor que a pedida, sem erro e sem preenchimento; atualizar as descrições dos esquemas — covers FR-3 — files: `src/core/generation/cards.ts`, `questions.ts`, `schemas.ts` — test: testes dos geradores com LLM scriptado devolvendo 0, 1 e N−1 itens
- [x] T-1.6 Passar a disciplina (o título do material, por ora) do `GenerationService` aos geradores e aos builders — covers FR-1 (interino) — files: `src/core/generation/service.ts`, `cards.ts`, `questions.ts` — test: `generation.test.ts` (o prompt do lote contém o título)
- [x] T-1.7 Criar `scripts/regen-prompt-fixtures.ts` e o script `fixtures:prompts` em `package.json`; regenerar só as entradas de cards, questões e juiz de `fixtures/prompts.json` — covers FR-18 — files: `scripts/regen-prompt-fixtures.ts`, `package.json`, `fixtures/prompts.json` — test: `prompts.test.ts` e `questions.test.ts` passam
- [x] T-1.8 Registrar em `fixtures/README.md` que os prompts de geração divergem do Python por decisão (intent generation-relevance) e como regenerar — covers FR-18 — files: `fixtures/README.md` — test: `tests/fixtures/fixtures.test.ts` passa
- [x] T-1.9 Teste ponta a ponta do esqueleto: `GenerationService.start` com LLM scriptado que devolve menos itens que o pedido e um card sobre texto motivador marcado nas fixtures — covers FR-2, FR-3 — files: `src/core/generation/generation.test.ts` — test: o próprio teste
- [x] T-1.10 Rodar o comando de verificação e pedir a aprovação do esqueleto — covers DoD — files: `tasks.md`, `state.md` — test: exit 0

**Unit summary (Construction 3.5):**

- **Arquivos alterados:** `src/core/generation/{prompts,question-prompts,self-contained,cards,questions,service}.ts`, `src/core/llm/scripted.ts`, `fixtures/prompts.json`, `fixtures/README.md`, `package.json`, e os testes `generation.test.ts`, `prompts.test.ts`, `questions.test.ts`, `self-contained.test.ts`.
- **Arquivos novos:** `scripts/regen-prompt-fixtures.ts`.
- **Como rodar:** `pnpm test src/core/generation tests/fixtures`; para regenerar as fixtures de prompt, `pnpm fixtures:prompts`.
- **Resultado (2026-11-19):** `pnpm lint`, `format:check`, `typecheck` exit 0; `pnpm test --coverage` exit 0 (131 arquivos, 1372 testes, linhas 96,15%). Baseline antes da Unit: 2 falhas por instabilidade sob carga (ver `construction/build-and-test.md`); nesta rodada passaram.
- **Desvios:** (1) o provedor offline `scripted.ts` extraía a quantidade com `Create exactly N`; as regexes passaram a aceitar também `up to`; (2) os testes que citavam "Create exactly" nos prompts de geração foram atualizados para "up to"; os de seleção de trecho (`selection-prompts.ts`) mantêm "exactly", pois a seleção tem prompt próprio e não entrou no escopo; (3) `renderSubject` foi exportado de `prompts.ts` e `SCOPE_QUESTION_RULES` de `question-prompts.ts` para os testes de conteúdo.

### UNIT-2 Juiz de relevância, resumo e segunda rodada   Status: verified (2026-11-19, exit 0)

- [x] T-2.1 Acrescentar as colunas `discarded_out_of_scope`, `rounds` e `with_analysis` a `generation_run` e gerar a migration `0006_run_out_of_scope` com `pnpm db:generate` — covers FR-15, NFR-4 — files: `src/core/db/workspace-schema.ts`, `src/core/db/migrations/workspace/0006_*.sql`, `meta/` — test: `db.test.ts` (migration sobre banco 0005 com dados)
- [x] T-2.2 Criar `relevanceBatchSchema`, `buildRelevanceMessages` e `Judge.judgeRelevance` — covers FR-6 — files: `src/core/generation/schemas.ts`, `question-prompts.ts`, `judge.ts` — test: `judge.test.ts` (veredito por índice, ausente conta contra, em dúvida descarta)
- [x] T-2.3 Separar `CardGenerator` em `screen` → juízo de relevância (`await`) → `store`, descartando como `out_of_scope: <motivo>` — covers FR-6 — files: `src/core/generation/cards.ts` — test: gerador de cards com juiz scriptado (card fora do escopo vira descarte e entra no `discardLog`)
- [x] T-2.4 Acrescentar o critério de relevância ao `JUDGE_SYSTEM` e ao `CALCULATION_JUDGE_SYSTEM`, e contar `out_of_scope` no `QuestionGenerator` — covers FR-7 — files: `src/core/generation/question-prompts.ts`, `questions.ts` — test: `questions.test.ts` (enunciado correto mas fora da disciplina é descartado)
- [x] T-2.5 Somar `outOfScope` ao `BatchOutcome` e a `generation_run`; expor `discardedOutOfScope`, `rounds` e `withAnalysis` em `runInfo` — covers FR-15, NFR-8 — files: `src/core/generation/service.ts`, `src/core/contracts/channels.ts`, `src/main/ipc/handlers.ts` — test: `channels.test.ts` e testes dos handlers
- [x] T-2.6 Incluir o juiz de cards na estimativa de custo — covers FR-16 (estimativa) — files: `src/core/generation/service.ts` — test: `generation.test.ts` (estimativa de cards soma o juízo)
- [x] T-2.7 Segunda rodada: guardar os lotes não usados e rodar no máximo uma rodada extra quando os aceitos ficam abaixo do pedido; gravar `rounds` — covers FR-4 — files: `src/core/generation/service.ts`, `planning.ts` — test: `generation.test.ts` (uma rodada extra, nunca duas; sem lotes novos não roda)
- [x] T-2.8 Resumo da execução na `GeneratePage`: contador "fora do escopo", frase de por que vieram menos e linha da segunda rodada; textos em `strings.ts` — covers FR-15, FR-3, US-8 — files: `src/renderer/src/pages/GeneratePage.tsx`, `strings.ts` — test: teste de componente do resumo (estados do mockup)
- [x] T-2.9 Estender `fake-mind.ts` com os campos novos de `runInfo` — covers NFR-8 — files: `src/renderer/test/fake-mind.ts` — test: usado pelos testes de componente
- [x] T-2.10 Rodar o comando de verificação — covers DoD — files: `tasks.md`, `state.md` — test: exit 0

**Unit summary (Construction 3.5):**

- **Arquivos alterados:** `src/core/db/workspace-schema.ts`, `src/core/generation/{cards,questions,judge,schemas,question-prompts,planning,service}.ts`, `src/core/llm/scripted.ts`, `src/core/contracts/channels.ts`, `src/renderer/src/pages/GeneratePage.tsx`, `src/renderer/src/strings.ts`, `src/renderer/test/fake-mind.ts`, `fixtures/prompts.json` (regenerado) e os testes `db.test.ts`, `generation.test.ts`, `questions.test.ts`, `generate.test.tsx`, `see-in-pdf.test.tsx`, `study.test.tsx`.
- **Arquivos novos:** `src/core/db/migrations/workspace/0006_run_out_of_scope.sql` e `meta/0006_snapshot.json`.
- **Como rodar:** `pnpm test src/core/generation src/core/db src/renderer/src/generate.test.tsx`; `xvfb-run -a pnpm e2e tests/e2e/generation.spec.ts`.
- **Resultado (2026-11-19):** `pnpm lint`, `format:check`, `typecheck` exit 0; `pnpm test --coverage` exit 0 (131 arquivos, 1386 testes, linhas 96,14%); e2e de geração e do fluxo de exemplo passaram (3).
- **Desvios:** (1) o `Judge` ganhou `subject` opcional também no juiz de questões (a UNIT-2 só pedia o critério; a disciplina no prompt do juiz é o que dá sentido ao critério); (2) `BatchRequest.judgeModel` é obrigatório para cards, então os testes e o `scripted.ts` passaram a responder ao esquema `RelevanceBatch` (exportado `allInScope`); (3) `planMore` foi acrescentado a `planning.ts` para a segunda rodada; (4) a frase de lote incompleto passou de "o modelo devolveu N itens a menos" para "o material não tinha conteúdo da disciplina para N itens", como no mockup; (5) o custo de um lote de cards agora soma a revisão de relevância (0,02 nos testes em vez de 0,01).

### UNIT-3 Fixtures e avaliação   Status: verified (2026-11-19, exit 0); T-3.4 pendente do usuário

- [x] T-3.1 Montar o conjunto de fixtures de relevância em `src/core/test/relevance/` (trechos anonimizados de conceito, exemplo, questão de prova, motivador, comentário e outro, com o resultado esperado) — covers FR-17 — files: `src/core/test/relevance/*.ts` — test: teste de formato das fixtures
- [x] T-3.2 Testes do pipeline com LLM scriptado sobre as fixtures: itens esperados passam e os fora de escopo são descartados — covers FR-17 — files: `src/core/generation/relevance.test.ts` — test: o próprio teste
- [x] T-3.3 Criar `scripts/eval-generation.ts` (modelo real, lê a chave do ambiente, imprime fora de escopo que passam e bons mantidos) e o script `eval:generation` — covers FR-17, US-9, NFR-1 — files: `scripts/eval-generation.ts`, `package.json` — test: execução com LLM falso verifica o cálculo dos indicadores
- [~] T-3.4 Registrar o baseline da avaliação (antes da análise de trechos) em `construction/build-and-test.md` — covers NFR-1 — files: `.aidlc/261119-generation-relevance/construction/build-and-test.md` — test: números registrados
- [x] T-3.5 Rodar o comando de verificação — covers DoD — files: `tasks.md`, `state.md` — test: exit 0

**Unit summary (Construction 3.5):**

- **Arquivos novos:** `src/core/test/relevance/{cases,score,seed}.ts` (a apostila rotulada, a pontuação e a semeadura), `src/core/generation/relevance.test.ts`, `scripts/eval-generation.ts`.
- **Arquivos alterados:** `package.json` (script `eval:generation`).
- **Como rodar:** `pnpm test src/core/generation/relevance.test.ts`; a avaliação com o modelo real é `OPENROUTER_API_KEY=... pnpm eval:generation [--cards 40] [--questions 20]` (sai com 1 se uma meta falhar e com 2 sem chave).
- **Resultado (2026-11-19):** `pnpm lint`, `format:check`, `typecheck` exit 0; `pnpm test --coverage` exit 0 (132 arquivos, 1395 testes, linhas 96,14%).
- **Desvios:** (1) **T-3.4 (baseline com o modelo real) não foi feita**: a chave só existe cifrada no armazenamento do app e a avaliação gasta com o provedor; fica para o usuário rodar `pnpm eval:generation` (a UNIT-7 cobra o resultado); (2) o script de avaliação é fino e fica fora da cobertura (`scripts/**`); a lógica dos indicadores está em `score.ts`, testada em `relevance.test.ts`, em vez de um teste do script com LLM falso; (3) as fixtures têm 15 trechos (6 de conteúdo, 1 exemplo, 1 comentário, 2 questões, 3 motivadores, 2 de páginas que não são conteúdo), abaixo das "dezenas" da A14; podem crescer quando o baseline real mostrar onde faltam casos.

### UNIT-4 Análise dos trechos   Status: verified (2026-11-19, exit 0)

- [x] T-4.1 Acrescentar as colunas de `chunk` e `material` e gerar a migration `0007_material_analysis` — covers NFR-4 — files: `src/core/db/workspace-schema.ts`, `src/core/db/migrations/workspace/0007_*.sql`, `meta/` — test: `db.test.ts` (migration sobre banco 0006 com dados)
- [x] T-4.2 Criar `analysis/classifier.ts`: `ROLES`, `classifyBatchSchema`, `buildClassifyMessages` e `mergeWindows` (numera as unidades pela soma de `starts_unit`) — covers FR-8, FR-9 — files: `src/core/analysis/classifier.ts` — test: `classifier.test.ts` (merge com sobreposição, unidades, índice inválido)
- [x] T-4.3 Criar `MaterialAnalyzer` (janelas de ~12 trechos com 2 de sobreposição, modelo do juiz, disciplina da primeira janela, gravação por transação) — covers FR-8, NFR-3 — files: `src/core/analysis/analyzer.ts` — test: `analyzer.test.ts` (material classificado; falha no meio não perde o já gravado)
- [x] T-4.4 Rodar como job `analysis`, com progresso e cancelamento, e `analysis_job_id` e `analyzed_at` — covers FR-9, NFR-5 — files: `src/core/analysis/analyzer.ts`, `src/core/core.ts` — test: `analyzer.test.ts` (progresso, cancelamento)
- [x] T-4.5 Chamar a análise ao fim da indexação com `MaterialService.onIndexed` ligado em `core.ts`, sem afetar o status `indexed` — covers FR-8, NFR-3 — files: `src/core/ingestion/service.ts`, `src/core/core.ts` — test: `ingestion` testes (falha da análise não muda `indexed`)
- [x] T-4.6 Derivar o estado da análise do job e de `analyzed_at` e acrescentar `analysis` e `subject` (sem a informada ainda) à visão do material — covers FR-9, FR-16 — files: `src/core/ingestion/service.ts`, `src/core/contracts/channels.ts` — test: testes de contrato e do estado (none, analyzing, done, failed, paused)
- [x] T-4.7 Acrescentar o canal `material:analyze` (idempotente; erros de consentimento e chave) — covers FR-9, NFR-2, NFR-8 — files: `src/core/contracts/channels.ts`, `channel-names.ts`, `src/main/ipc/handlers.ts`, `src/renderer/test/fake-mind.ts` — test: testes dos handlers e de `router.test.ts`
- [x] T-4.8 Verificar que o limite mensal pausa a análise e que sem consentimento ela falha com o código — covers FR-16, NFR-2 — files: `src/core/analysis/analyzer.test.ts` — test: o próprio teste
- [x] T-4.9 Verificar que exportar e importar um workspace leva as colunas novas — covers NFR-4 — files: `src/core/workspaces/archive.test.ts` — test: exportar e importar com `chunk.role`
- [x] T-4.10 Rodar o comando de verificação — covers DoD — files: `tasks.md`, `state.md` — test: exit 0

**Unit summary (Construction 3.5):**

- **Arquivos novos:** `src/core/analysis/{classifier,subject,analyzer}.ts` e seus testes (`classifier.test.ts`, `analyzer.test.ts`), `src/core/db/migrations/workspace/0007_material_analysis.sql` e `meta/0007_snapshot.json`, `src/main/ipc/analysis-handlers.test.ts`.
- **Arquivos alterados:** `src/core/db/workspace-schema.ts`, `src/core/ingestion/service.ts` (gancho `onIndexed`, `subject` e `analysis` na visão), `src/core/core.ts` (`analysis(workspaceId)` e o gancho), `src/core/contracts/{channels,channel-names}.ts`, `src/main/ipc/handlers.ts`, `src/core/llm/{fake,scripted}.ts`, `src/renderer/test/fake-mind.ts` e os testes `db.test.ts`, `archive.test.ts`, `router.test.ts`.
- **Como rodar:** `pnpm test src/core/analysis src/main/ipc/analysis-handlers.test.ts`; `xvfb-run -a pnpm e2e tests/e2e/library.spec.ts tests/e2e/import.spec.ts`.
- **Resultado (2026-11-19):** `pnpm lint`, `format:check`, `typecheck` exit 0; `pnpm test --coverage` exit 0 (135 arquivos, 1430 testes, linhas 96,19%); e2e de biblioteca, importação, geração, backup e fluxo de exemplo passaram (12).
- **Desvios:** (1) a análise guarda `role` e `starts_unit` por janela assim que ela termina (e `unit` só no fim), para que uma falha no meio não perca o já classificado; (2) `material:analyze` com `automatic` (o gancho depois da importação) fica quieto sem chave ou consentimento, em vez de falhar; (3) o provedor offline (`scripted.ts`) passou a responder `ClassifyBatch`, para os specs não terminarem com "falha na análise"; (4) `FakeProvider.requiresConsent` passou de literal `false` a `boolean`, para os testes simularem um provedor que pede chave; (5) os tipos `MaterialInfo` e `MaterialView` ganharam `subject` e `analysis`, e `fake-mind.ts` preenche os padrões para os testes de tela não precisarem mudar.

### UNIT-5 Lotes por unidade e papéis   Status: verified (2026-11-19, exit 0)

- [x] T-5.1 Acrescentar `role`, `unit` e `context` a `SourceChunk`/`PromptChunk` e carregá-los em `selectChunks` — covers FR-10 — files: `src/core/generation/planning.ts`, `prompts.ts` — test: `planning.test.ts`
- [x] T-5.2 `planBatchesByUnit`: lotes por unidade, papéis permitidos por tipo, teto de 9000 caracteres e contexto vizinho rotulado — covers FR-10, FR-13, US-4 — files: `src/core/generation/planning.ts` — test: `planning.test.ts` (questão dividida em dois trechos no mesmo lote; unidade grande se divide na fronteira)
- [x] T-5.3 Rotular cada trecho com o papel no prompt e o contexto como "context only, never a source" — covers FR-10, FR-11 — files: `src/core/generation/prompts.ts` — test: `prompts.test.ts`
- [x] T-5.4 Montar `byId` só com trechos que não são contexto, nos dois geradores — covers FR-11, US-3 — files: `src/core/generation/cards.ts`, `questions.ts` — test: gerador com citação em trecho de contexto cai em "sem fonte"
- [x] T-5.5 Resolver a disciplina vigente (informada, senão inferida, senão título) e usá-la nos prompts — covers FR-1, US-1, US-2 — files: `src/core/generation/service.ts` — test: `generation.test.ts` (as três origens)
- [x] T-5.6 Escolher o modo no `GenerationService`: por unidade quando o material está analisado, senão `planBatches` com o fallback; gravar `with_analysis` — covers FR-12 — files: `src/core/generation/service.ts` — test: `generation.test.ts` (sem análise gera com as regras de prompt)
- [x] T-5.7 Material só de questões: questões novas inspiradas e cards só de comentário que explica a regra; aviso quando não há conteúdo — covers FR-13 — files: `src/core/generation/planning.ts`, `service.ts` — test: `generation.test.ts` com fixture só de questões
- [x] T-5.8 Teste de aceitação de US-1 a US-4 sobre as fixtures de relevância (cards conceituais, questões práticas, menos lixo, material misto) com LLM scriptado — covers US-1, US-2, US-3, US-4 — files: `src/core/generation/relevance.test.ts` — test: o próprio teste
- [x] T-5.9 Rodar o comando de verificação — covers DoD — files: `tasks.md`, `state.md` — test: exit 0

**Unit summary (Construction 3.5):**

- **Arquivos novos:** `src/core/generation/units.test.ts`.
- **Arquivos alterados:** `src/core/generation/{planning,prompts,question-prompts,cards,questions,service}.ts` e os testes `planning.test.ts`, `prompts.test.ts`, `relevance.test.ts`; `src/core/contracts/channels.ts` (`onlyQuestions` em `generation:estimate`); `src/core/test/relevance/{cases,seed}.ts` (unidades e semeadura analisada); `src/renderer/src/strings.ts` (motivo "citação de contexto"); `src/renderer/test/fake-mind.ts`.
- **Como rodar:** `pnpm test src/core/generation`.
- **Resultado (2026-11-19):** `pnpm lint`, `format:check`, `typecheck` exit 0; `pnpm test --coverage` exit 0 (136 arquivos, 1454 testes, linhas 96,24%).
- **Desvios:** (1) `generation:estimate` ganhou o campo `onlyQuestions` (aditivo), porque o banner de material só de questões da UNIT-6 precisa saber disso; (2) um material analisado sem nenhuma fonte para o tipo pedido (por exemplo, só questões e cards) falha com um `VALIDATION_ERROR` explicando, em vez de gerar zero itens; (3) a citação em trecho de contexto é descartada como `source_is_context` (um motivo novo, além de `chunk_not_in_batch`); (4) as fixtures de relevância ganharam `unit` e foram reordenadas (o texto motivador junto da sua questão) para o teste de aceitação; (5) o treino por tópico continua em lotes por tamanho (mistura materiais e não tem análise).

### UNIT-6 Disciplina na tela   Status: verified (2026-11-19, exit 0)

- [x] T-6.1 Acrescentar `MaterialService.setSubject` e o canal `material:setSubject`; `subject` passa a refletir a informada — covers FR-14, NFR-8 — files: `src/core/ingestion/service.ts`, `src/core/contracts/channels.ts`, `channel-names.ts`, `src/main/ipc/handlers.ts`, `fake-mind.ts` — test: testes dos handlers e do serviço (informada prevalece; vazio volta à inferida)
- [x] T-6.2 Criar o diálogo da disciplina (campo, inferida ao lado, estados do mockup) — covers FR-14, US-5, NFR-7 — files: `src/renderer/src/components/SubjectDialog.tsx`, `strings.ts` — test: teste de componente (todos os estados)
- [x] T-6.3 Biblioteca: ação "Definir disciplina…", "Analisar de novo", disciplina sob o nome e status da análise com progresso — covers FR-14, FR-9, US-6 — files: `src/renderer/src/pages/LibraryPage.tsx`, `strings.ts` — test: teste de componente
- [x] T-6.4 Gerar: linha da disciplina com "Alterar", banners de fallback e de material só de questões, e disparo de `material:analyze` ao abrir um material sem análise — covers FR-12, FR-13, US-7 — files: `src/renderer/src/pages/GeneratePage.tsx`, `strings.ts` — test: teste de componente (os estados do mockup)
- [x] T-6.5 Atalho às Configurações quando a análise falha por chave ou consentimento — covers FR-9, FR-16, US-6 — files: `LibraryPage.tsx`, `SubjectDialog.tsx` — test: teste de componente
- [x] T-6.6 Rodar o comando de verificação e o `xvfb-run -a pnpm e2e` — covers DoD — files: `tasks.md`, `state.md` — test: exit 0

**Unit summary (Construction 3.5):**

- **Arquivos novos:** `src/renderer/src/components/SubjectDialog.tsx`, `src/renderer/src/subject.test.tsx`.
- **Arquivos alterados:** `src/core/ingestion/service.ts` (`setSubject`), `src/core/contracts/{channels,channel-names}.ts` (`material:setSubject`), `src/main/ipc/{handlers.ts,analysis-handlers.test.ts,router.test.ts}`, `src/renderer/src/pages/{LibraryPage,GeneratePage}.tsx`, `src/renderer/src/strings.ts`, `src/renderer/src/library.test.tsx`, `src/renderer/test/fake-mind.ts`.
- **Como rodar:** `pnpm test src/renderer/src/subject.test.tsx src/main/ipc/analysis-handlers.test.ts`; `xvfb-run -a pnpm e2e`.
- **Resultado (2026-11-19):** `pnpm lint`, `format:check`, `typecheck` exit 0; `pnpm test --coverage` exit 0 (137 arquivos, 1482 testes, linhas 96,19%); `xvfb-run -a pnpm e2e` exit 0 (61 passaram, 1 pulado).
- **Desvios:** (1) os banners e a pílula "Analisando" de Gerar ficaram sem `role="status"` (colidiam com o `role="status"` do paginador e quebravam testes existentes); o diálogo e a Biblioteca mantêm `role="status"` no estado "analisando"; (2) o texto do custo da geração continua "Custo estimado: ~US$ …", sem o "(inclui a revisão de relevância)" do mockup, porque a mesma frase serve à seleção no leitor e está nos testes; (3) `setSubject` limpa espaços repetidos e aceita no máximo 200 caracteres (o contrato e o serviço validam); (4) o spec e2e do fluxo da disciplina (T-7.1) fica na UNIT-7, como planejado.

### UNIT-7 Verificação final   Status: pending

- [ ] T-7.1 Spec e2e: definir a disciplina na Biblioteca e vê-la em Gerar, com LLM mockado — covers FR-14, US-5, US-7 — files: `tests/e2e/subject.spec.ts` — test: o próprio spec
- [ ] T-7.2 Rodar `pnpm eval:generation` com o modelo real e comparar com a meta (0 fora de escopo, ≥ 80% dos bons); ajustar prompts, janelas ou fixtures se não bater, ou registrar o desvio — covers NFR-1, US-9 — files: `construction/build-and-test.md` — test: números registrados
- [ ] T-7.3 Atualizar `docs/guides/study-guide.md` (disciplina, análise do material e o resumo da geração) — covers US-5, US-8 — files: `docs/guides/study-guide.md` — test: revisão do texto
- [ ] T-7.4 Atualizar o codekb e propor a memória C1 (emenda da M-11) e o que mais surgir da retrospectiva — covers NFR-6 — files: `.aidlc/codekb/MIND/`, `.aidlc/memory/project.md` — test: arquivos atualizados
- [ ] T-7.5 Rodar o comando de verificação e o `xvfb-run -a pnpm e2e` completos e conferir a cobertura ≥ 80% — covers NFR-6, NFR-8 — files: `construction/build-and-test.md` — test: exit 0
