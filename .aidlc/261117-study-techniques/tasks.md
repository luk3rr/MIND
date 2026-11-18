# Tasks — study-techniques

## 2.9 Delivery plan

- **Verification command:** `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test --coverage` (approved 2026-11-18 by human). Cada Unit com fluxo de tela soma `xvfb-run -a pnpm e2e` ao fechar (M-15); a UNIT-7 roda o e2e completo. O `pnpm` está em `~/.local/share/pnpm/bin` (`corepack pnpm` também funciona). [mem: M-5, M-15]
- **Order:** segue o grafo de Units em `design.md § 2.7`: UNIT-1, UNIT-2, UNIT-3, UNIT-4, UNIT-5, UNIT-6, UNIT-7.
- **Walking skeleton:** UNIT-1 (tela de Configurações, IPC, núcleo e banco), com aprovação do esqueleto antes de seguir. [state: walking_skeleton=on]
- **Condução:** autônoma; para na aprovação do esqueleto, em falhas e em ações irreversíveis. Commits atômicos, um ou mais por Unit, na `main`, sem `git push` e sem mexer na versão. [mem: M-7; src: Q11, Q12]
- **Regras para toda tarefa:** código, comentários e commits em inglês; textos ao usuário em pt-BR em `strings.ts`; cabeçalho `Filename/Created on/Author` em arquivo novo; testes ao lado do código, relógio injetável e LLM mockado; novo canal em quatro passos (esquema zod, nome, handler, `useInvoke`). [mem: M-4, M-5, M-8, M-9]

### BOLT-1 — Units: UNIT-1, UNIT-2 — Owner: Construção

- **Goal:** esqueleto andante com as configurações e a intercalação.
- **Definition of Done:** o comando de verificação passa e o e2e de cada Unit passa; a migração `0004` abre um banco `0003` populado sem perda; as opções persistem; a intercalação alterna tópicos e materiais sem mudar os padrões.
- **Confidence hypothesis:** alta; a migração é aditiva e a intercalação é uma função pura.
- **Risks and sequencing:** o rodízio sem estado (A22) precisa de `mixKey` nas duas filas; validar o esqueleto antes da UNIT-2.

### BOLT-2 — Units: UNIT-3, UNIT-4 — Owner: Construção

- **Goal:** feedback postergado, do fim do bloco ao dia seguinte.
- **Definition of Done:** o comando de verificação passa e o e2e das duas Units passa; `CONTRACT_VERSION` em 2 e `fake-mind.ts` alinhada; o modo imediato idêntico ao atual; viradas às 3h59 e 4h00 testadas; pendentes aparecem em Hoje.
- **Confidence hypothesis:** média; a mudança de contrato de `practice:next` e `practice:answer` toca a `PracticePage` e vários testes (A21).
- **Risks and sequencing:** UNIT-3 antes de UNIT-4; atualizar todos os testes do contrato na mesma Unit (R-3).

### BOLT-3 — Units: UNIT-5, UNIT-6 — Owner: Construção

- **Goal:** calibração e pré-teste.
- **Definition of Done:** o comando de verificação passa e o e2e das duas Units passa; a confiança é obrigatória enquanto ligada; os limiares de excesso de confiança testados nas fronteiras; nenhum consumidor de `attempt` vê o pré-teste.
- **Confidence hypothesis:** alta; o pré-teste não toca `attempt` (ADR-1) e o seletor é um componente isolado.
- **Risks and sequencing:** UNIT-5 antes de UNIT-6 (o pré-teste reutiliza o `ConfidencePicker`).

### BOLT-4 — Units: UNIT-7 — Owner: Construção

- **Goal:** integração, ausência de provedor e de rede, guia e base de conhecimento.
- **Definition of Done:** o comando de verificação e o `pnpm e2e` completos passam; nenhum teste anterior teve a expectativa alterada, salvo os do contrato; cobertura global de pelo menos 80%; guia e `codekb` atualizados.
- **Confidence hypothesis:** alta.
- **Risks and sequencing:** última; depende das demais.

## Tasks

### UNIT-1 Base e configurações   Status: verified (2026-11-18, exit 0)

- [x] T-1.1 Rodar o `pnpm e2e` do baseline e registrar as falhas anteriores — covers A11 — files: `.aidlc/261117-study-techniques/construction/build-and-test.md` — test: saída do `pnpm e2e` registrada
- [x] T-1.2 Acrescentar as colunas `confidence`, `releaseAt` e `seenAt` a `attempt` e a tabela `pretestAttempt` em `workspace-schema.ts` — covers NFR-1 — files: `src/core/db/workspace-schema.ts` — test: `src/core/db/db.test.ts`
- [x] T-1.3 Gerar a migração `0004` com `pnpm db:generate` e acrescentar o `UPDATE` que marca as respostas antigas como vistas — covers NFR-1 — files: `src/core/db/migrations/workspace/0004_*.sql`, `meta/` — test: migração de um banco `0003` populado (respostas preservadas, `release_at = seen_at = answered_at`)
- [x] T-1.4 Criar `PracticeSettings` (`get`, `set`, `reset`) com validação zod e os padrões `immediate`, confiança desligada e intercalação desligada — covers FR-21 — files: `src/core/practice/settings.ts` — test: `src/core/practice/settings.test.ts`
- [x] T-1.5 Acrescentar os canais `practice:settings` e `practice:saveSettings` (esquema, nome, handler) — covers FR-21, NFR-7 — files: `src/core/contracts/channels.ts`, `channel-names.ts`, `src/main/ipc/handlers.ts` — test: `src/main/ipc/router.test.ts`
- [x] T-1.6 Criar `PracticeSettingsForm` em Configurações, com restaurar padrões, e os textos pt-BR — covers FR-21, US-7, NFR-8 — files: `src/renderer/src/components/PracticeSettingsForm.tsx`, `pages/SettingsPage.tsx`, `strings.ts` — test: teste de componente da seção
- [x] T-1.7 Estender `fake-mind.ts` com os canais novos — covers FR-21 — files: `src/renderer/test/fake-mind.ts` — test: usado pelos testes de componente
- [x] T-1.8 Verificar que exportar e importar um workspace leva as colunas e as opções novas — covers NFR-10 — files: `src/core/workspaces/archive` (teste) — test: teste de exportar e importar com `attempt` e `meta` novos
- [x] T-1.9 Spec e2e: salvar as opções, reabrir o app e conferir que persistem — covers FR-21, US-7 — files: `tests/e2e/practice-settings.spec.ts` — test: o próprio spec
- [x] T-1.10 Rodar o comando de verificação e o e2e da Unit, e pedir a aprovação do esqueleto — covers DoD — files: `tasks.md`, `state.md` — test: exit 0

**Unit summary (Construction 3.5):**

- **Arquivos alterados:** `src/core/db/workspace-schema.ts`, `src/core/db/db.test.ts`, `src/core/core.ts`, `src/core/contracts/channels.ts`, `src/core/contracts/channel-names.ts`, `src/main/ipc/handlers.ts`, `src/main/ipc/router.test.ts`, `src/core/workspaces/archive.test.ts`, `src/renderer/src/strings.ts`, `src/renderer/src/pages/SettingsPage.tsx`, `src/renderer/test/fake-mind.ts`.
- **Arquivos novos:** `src/core/db/migrations/workspace/0004_study_practices.sql` e `meta/0004_snapshot.json`, `src/core/practice/settings.ts` e `settings.test.ts`, `src/main/ipc/practice-settings-handlers.test.ts`, `src/renderer/src/components/PracticeSettingsForm.tsx`, `src/renderer/src/practice-settings.test.tsx`, `tests/e2e/practice-settings.spec.ts`.
- **Como rodar:** abrir Configurações e usar a seção "Práticas de estudo"; `pnpm test src/core/practice/settings.test.ts`; `xvfb-run -a pnpm exec playwright test tests/e2e/practice-settings.spec.ts`.
- **Resultado (2026-11-18):** `pnpm lint`, `format:check`, `typecheck` exit 0; `pnpm test --coverage` exit 0 (115 arquivos, 1208 testes, linhas 96,44%); `xvfb-run -a pnpm e2e` exit 0 (55 passaram, 1 pulado). A primeira execução do comando falhou por um erro de lint meu (importação só de tipo, corrigido) e, na segunda, por um teste instável de `practice-session.test.tsx` (setas do teclado sob carga; passa 3 de 3 isolado e não tem relação com a Unit); a terceira passou limpa.
- **Desvios:** (1) a migração foi renomeada de `0004_large_slyde` para `0004_study_practices`, no padrão dos arquivos anteriores; (2) o botão do formulário chama-se "Restaurar padrões das práticas", em vez de "Restaurar padrões", porque o teste existente de Estudar localiza o outro botão pelo nome exato; (3) `PracticeSettings.reset()` foi acrescentada (prevista no design 2.6), mas a interface só preenche o formulário (A26).


### UNIT-2 Intercalação   Status: verified (2026-11-18, exit 0)

- [x] T-2.1 Criar o `Interleaver` (`pick` e `interleave`), com o grupo sem chave por último e a volta ao início — covers FR-14 — files: `src/core/study/interleave.ts` — test: `interleave.test.ts` com tabela de casos (A1 B1 A2 B2 A3 A4, grupo nulo, chave inexistente, ciclo)
- [x] T-2.2 Testes de determinismo e de desempenho com 5.000 itens — covers NFR-3, NFR-4 — files: `src/core/study/interleave.test.ts` — test: mesma entrada dá a mesma ordem em 100 execuções; `pick` abaixo de 200 ms
- [x] T-2.3 Aplicar o `pick` a cada parte da fila de cards (aprendizado, revisões, novos) em `StudyService.queue` — covers FR-14, FR-15 — files: `src/core/study/service.ts` — test: `study.test.ts` (prioridade e limites diários preservados)
- [x] T-2.4 Aplicar o `pick` a cada parte da fila de questões (não vistas, erradas, refazer) em `PracticeService.queue` — covers FR-14, FR-15 — files: `src/core/practice/service.ts` — test: `practice.test.ts`
- [x] T-2.5 Acrescentar `mix` na entrada e `mixKey` na saída de `study:next` e `practice:next` — covers FR-13, NFR-7 — files: `channels.ts`, `handlers.ts` — test: testes de contrato e do roteador
- [x] T-2.6 Criar o controle "Misturar tópicos" (por tópico ou material, valor inicial da configuração, desabilitado com filtro ativo) em Estudar e Praticar, repassando `mixKey` — covers FR-13, FR-15, US-4, NFR-8 — files: `src/renderer/src/pages/StudyPage.tsx`, `PracticePage.tsx`, `strings.ts` — test: testes de componente, incluindo o estado desabilitado
- [x] T-2.7 Spec e2e: misturar tópicos em Estudar e em Praticar — covers US-4 — files: `tests/e2e/interleave.spec.ts` — test: o próprio spec
- [x] T-2.8 Rodar o comando de verificação e o e2e da Unit — covers DoD — files: `tasks.md`, `state.md` — test: exit 0

**Unit summary (Construction 3.5):**

- **Arquivos novos:** `src/core/study/interleave.ts` e `interleave.test.ts`, `src/core/study/study-mix.test.ts`, `src/core/practice/practice-mix.test.ts`, `src/main/ipc/mix-handlers.test.ts`, `src/renderer/src/components/MixControl.tsx`, `src/renderer/src/mix.test.tsx`, `tests/e2e/interleave.spec.ts`.
- **Arquivos alterados:** `src/core/study/service.ts`, `src/core/practice/service.ts`, `src/core/contracts/channels.ts`, `src/main/ipc/handlers.ts`, `src/renderer/src/pages/StudyPage.tsx`, `src/renderer/src/pages/PracticePage.tsx`, `src/renderer/src/strings.ts`, `src/renderer/test/fake-mind.ts`.
- **Como rodar:** em Estudar e em Praticar, marcar "Misturar tópicos" (e escolher "Alternar por"); `pnpm test src/core/study src/core/practice`; `xvfb-run -a pnpm exec playwright test tests/e2e/interleave.spec.ts`.
- **Resultado (2026-11-18):** `pnpm lint` exit 0; `pnpm typecheck` exit 0; `pnpm test --coverage` exit 0 (120 arquivos, 1242 testes, linhas 96,49%); `xvfb-run -a pnpm e2e` exit 0 (56 passaram, 1 pulado). `pnpm format:check` foi rodado com `!docs/guides/study-guide.md`: o guia do usuário (não commitado, editado depois) tem espaços no fim de linha e faz o comando inteiro falhar; não é desta Unit e não foi alterado.
- **Desvios:** (1) `StudyCard` e `PracticeQuestion` ganharam o campo `mixKey` (previsto no contrato 2.8, mas o campo no tipo interno é novo); (2) o esquema `mix` dos canais é `.strict()`, para recusar campos desconhecidos; (3) no e2e, as notas dos cards usam os botões e não o teclado, porque com o foco na caixa "Misturar tópicos" a tecla Espaço a desmarca.


### UNIT-3 Feedback ao fim do bloco   Status: verified (2026-11-18, exit 0)

- [x] T-3.1 Criar `FeedbackPolicy.releaseFor` para os modos imediato e bloco — covers FR-7 — files: `src/core/practice/feedback-policy.ts` — test: `feedback-policy.test.ts`
- [x] T-3.2 Criar `questionView` e fazer `practice:next` deixar de enviar a chave, o comentário, o `why` e a citação (A21) — covers FR-8, NFR-7 — files: `src/core/practice/service.ts`, `channels.ts` — test: testes do serviço e do contrato (a saída não contém `answer`, `why`, `explanation`, `quote`)
- [x] T-3.3 `PracticeService.answer`: gravar `release_at` e `seen_at` pela política e devolver `feedback` ou nulo — covers FR-7, FR-8, FR-11 — files: `src/core/practice/service.ts` — test: modos imediato e bloco; uma resposta com feedback pendente já conta nas estatísticas
- [x] T-3.4 `PracticeService.releaseBlock` e o canal — covers FR-8 — files: `service.ts`, `channels.ts`, `handlers.ts` — test: ids inválidos, de outro workspace ou de outra fase falham com `VALIDATION_ERROR`
- [x] T-3.5 Subir `CONTRACT_VERSION` para 2 e alinhar a `fake-mind.ts` — covers NFR-7 — files: `channels.ts`, `src/renderer/test/fake-mind.ts` — test: teste de contrato e do roteador
- [x] T-3.6 `PracticePage`: estado "Resposta registrada" com `role="status"`, sem alterar a resposta, e leitura do resultado a partir do feedback — covers FR-8, NFR-5 — files: `src/renderer/src/pages/PracticePage.tsx`, `strings.ts` — test: testes de componente
- [x] T-3.7 Criar `FeedbackList` (tela do fim do bloco, "Ver o feedback agora", "Fazer um card", fonte com "Ver no PDF") — covers FR-8, FR-12, US-2 — files: `src/renderer/src/components/FeedbackList.tsx` — test: teste de componente
- [x] T-3.8 Atualizar os testes e os specs e2e existentes ao novo contrato, sem mudar as expectativas do comportamento imediato — covers NFR-2 — files: `src/renderer/src/*.test.tsx`, `tests/e2e/*.spec.ts` — test: a suíte passa
- [x] T-3.9 Spec e2e: bloco completo, "Ver o feedback agora" e o modo imediato inalterado — covers US-2, NFR-2 — files: `tests/e2e/feedback-block.spec.ts` — test: o próprio spec
- [x] T-3.10 Rodar o comando de verificação e o e2e da Unit — covers DoD — files: `tasks.md`, `state.md` — test: exit 0

**Unit summary (Construction 3.5):**

- **Arquivos novos:** `src/core/practice/feedback-policy.ts` e `.test.ts`, `src/core/practice/practice-feedback.test.ts`, `src/main/ipc/practice-feedback-handlers.test.ts`, `src/renderer/src/components/FeedbackList.tsx`, `src/renderer/src/practice-feedback.test.tsx`, `tests/e2e/feedback-block.spec.ts`.
- **Arquivos alterados:** `src/core/practice/service.ts`, `src/core/contracts/channels.ts` (`CONTRACT_VERSION` 2), `channel-names.ts`, `channels.test.ts`, `src/main/ipc/handlers.ts`, `router.test.ts`, `study-handlers.test.ts`, `src/renderer/src/pages/PracticePage.tsx`, `strings.ts`, `src/renderer/test/fake-mind.ts`, `tests/e2e/authoring.spec.ts`, `tests/e2e/shell.spec.ts`.
- **Como rodar:** em Configurações escolher "Ao fim do bloco" e responder em Estudar > Questões; `pnpm test src/core/practice src/main/ipc`; `xvfb-run -a pnpm exec playwright test tests/e2e/feedback-block.spec.ts`.
- **Resultado (2026-11-18):** `pnpm lint` exit 0; `pnpm typecheck` exit 0; `pnpm test --coverage` exit 0 (124 arquivos, 1262 testes, linhas 96,48%); `xvfb-run -a pnpm e2e`: 57 passaram e 1 falhou (`shell.spec.ts`, que esperava `contractVersion: 1`); a expectativa foi para 2 e o spec passou (9 de 9). `format:check` rodado sem `docs/guides/study-guide.md` (arquivo do usuário, não commitado, com espaços no fim de linha).
- **Desvios:** (1) o núcleo continua devolvendo o resultado completo em `PracticeService.answer` (com `releaseAt` e `seen`), e é o handler IPC quem entrega o `feedback` só quando já está visível; assim os testes do núcleo não mudaram (NFR-2), e a garantia de ADR-5 vale na fronteira com o renderer; (2) o modo `next_day` espera como o bloco até a UNIT-4 (`releaseFor` documenta isso); (3) `FakeQuestion` em `fake-mind.ts` passou a ser a fixture completa e o canal converte para a visão sem gabarito, para não reescrever as fixtures de seis arquivos de teste; (4) expectativas alteradas por mudança de contrato: `study-handlers.test.ts` (formato de `practice:next` e `practice:answer`), `authoring.spec.ts` (a chave passa a vir de `review:get`) e `shell.spec.ts` (versão 2); (5) A28 confirmada: `ItemActions` só aparece depois do feedback, para não revelar a resposta.


### UNIT-4 Feedback no dia seguinte   Status: verified (2026-11-18, exit 0)

- [x] T-4.1 `FeedbackPolicy` no modo `next_day`, com a próxima virada às 4h (`dayEnd`) — covers FR-9 — files: `src/core/practice/feedback-policy.ts` — test: relógio injetável (3h59 sem feedback, 4h00 com, mudança de fuso e de horário de verão)
- [x] T-4.2 `releaseAbandoned`, `pendingCount` e `openFeedback` em `PracticeService` (ordem da mais antiga, `remaining`, marcar como visto) — covers FR-10 — files: `src/core/practice/service.ts` — test: `practice.test.ts`
- [x] T-4.3 Canais `practice:releaseAbandoned`, `practice:pendingCount`, `practice:openFeedback` e `pendingFeedback` em `today:summary` — covers FR-10, NFR-7 — files: `channels.ts`, `channel-names.ts`, `handlers.ts`, `src/core/today/summary.ts` — test: contrato e roteador
- [x] T-4.4 `PracticePage`: chamar `practice:releaseAbandoned` ao abrir e mostrar "Feedback disponível amanhã" — covers FR-9, FR-10 — files: `PracticePage.tsx`, `strings.ts` — test: testes de componente
- [x] T-4.5 Criar `PendingFeedbackPage` (rota, lista, estado vazio) e o aviso em Hoje com o contador — covers FR-10, US-3 — files: `src/renderer/src/pages/PendingFeedbackPage.tsx`, `router.tsx`, `pages/TodayPage.tsx` — test: testes de componente e de rota
- [x] T-4.6 Spec e2e: aviso em Hoje até a tela de feedback, com tentativas inseridas direto no banco com `release_at` no passado — covers US-3 — files: `tests/e2e/feedback-pending.spec.ts` — test: o próprio spec
- [x] T-4.7 Rodar o comando de verificação e o e2e da Unit — covers DoD — files: `tasks.md`, `state.md` — test: exit 0

**Unit summary (Construction 3.5):**

- **Arquivos novos:** `src/core/clock.test.ts`, `src/renderer/src/pages/PendingFeedbackPage.tsx`, `src/renderer/src/feedback-pending.test.tsx`, `tests/e2e/feedback-pending.spec.ts`.
- **Arquivos alterados:** `src/core/clock.ts` (`shiftedClock`), `src/core/test/helpers.ts` (`set` no relógio fixo), `src/core/practice/feedback-policy.ts` e `.test.ts`, `src/core/practice/service.ts`, `src/core/practice/practice-feedback.test.ts`, `src/core/contracts/channels.ts`, `channel-names.ts`, `src/main/index.ts`, `src/main/ipc/handlers.ts`, `router.test.ts`, `practice-feedback-handlers.test.ts`, `src/renderer/src/router.tsx`, `App.tsx`, `pages/TodayPage.tsx`, `pages/PracticePage.tsx`, `components/FeedbackList.tsx`, `strings.ts`, `src/renderer/test/fake-mind.ts`.
- **Como rodar:** em Configurações escolher "No dia seguinte", responder em Estudar > Questões e, depois da virada do dia de estudo (4h), abrir Hoje; `pnpm test src/core/practice src/main/ipc`; `xvfb-run -a pnpm exec playwright test tests/e2e/feedback-pending.spec.ts`.
- **Resultado (2026-11-18):** `pnpm lint` exit 0; `pnpm typecheck` exit 0; `pnpm test --coverage` exit 0 (126 arquivos, 1287 testes, linhas 96,5%); `xvfb-run -a pnpm e2e` exit 0 (59 passaram, 1 pulado). `format:check` sem `docs/guides/study-guide.md` (arquivo do usuário, não commitado).
- **Desvios:** (1) a tela de feedback pendente fica em `/w/:id/study/feedback` (e não em `/w/:id/feedback`, como em 2.8), no mesmo padrão de `/w/:id/study/practice`; (2) o e2e usa a variável `MIND_E2E_CLOCK_SHIFT_HOURS` (só no app não empacotado, via `shiftedClock`) para atravessar a virada do dia, em vez de inserir `release_at` no banco (A24): o módulo nativo do SQLite é compilado para o Electron e não carrega no processo do teste; o spec se pula contra o app instalado; (3) `today:summary` ganha `pendingFeedback` no handler, sem mudar a assinatura de `todaySummary`; (4) A24 resolvida por esse desvio.


### UNIT-5 Calibração   Status: verified (2026-11-19, exit 0)

- [x] T-5.1 Criar `ConfidencePicker` (três níveis, atalhos `Alt`+`1` a `3`, rótulos e foco acessíveis) — covers FR-17, NFR-5 — files: `src/renderer/src/components/ConfidencePicker.tsx` — test: teste de componente com teclado
- [x] T-5.2 `PracticeService.answer`: gravar `confidence` e exigi-lo com a opção ligada — covers FR-16, FR-17 — files: `src/core/practice/service.ts` — test: erro no campo `confidence` quando falta
- [x] T-5.3 `PracticePage`: usar o `ConfidencePicker` e manter "Responder" desabilitado até a escolha — covers FR-17, US-5 — files: `PracticePage.tsx`, `strings.ts` — test: testes de componente
- [x] T-5.4 Destacar a divergência (errada com "tenho certeza") no resultado imediato e no `FeedbackList` — covers FR-18 — files: `PracticePage.tsx`, `FeedbackList.tsx` — test: testes de componente
- [x] T-5.5 `StatsService.calibration` com os limiares de 80% e 60%, o mínimo de 5 respostas e a lista de tópicos — covers FR-19 — files: `src/core/stats/service.ts` — test: fronteiras 79%/80%, 59%/60% e menos de 5 respostas; o pré-teste não conta
- [x] T-5.6 Canal `stats:calibration` e a `fake-mind.ts` — covers FR-19, NFR-7 — files: `channels.ts`, `handlers.ts`, `fake-mind.ts` — test: contrato e roteador
- [x] T-5.7 Seção de calibração em Estatísticas, com o estado vazio — covers FR-19, FR-20, US-6 — files: `pages/StatsPage.tsx`, `strings.ts` — test: testes de componente
- [x] T-5.8 Spec e2e: ligar a confiança, responder e ver a tabela — covers US-5, US-6 — files: `tests/e2e/calibration.spec.ts` — test: o próprio spec
- [x] T-5.9 Rodar o comando de verificação e o e2e da Unit — covers DoD — files: `tasks.md`, `state.md` — test: exit 0

**Unit summary (Construction 3.5):**

- **Arquivos novos:** `src/core/stats/calibration.test.ts`, `src/renderer/src/components/ConfidencePicker.tsx`, `components/CalibrationStats.tsx`, `src/renderer/src/calibration.test.tsx`, `tests/e2e/calibration.spec.ts`.
- **Arquivos alterados:** `src/core/practice/service.ts` (`confidence`), `practice-feedback.test.ts`, `src/core/stats/service.ts` (`calibration`), `src/core/contracts/channels.ts`, `channel-names.ts`, `src/main/ipc/handlers.ts`, `router.test.ts`, `practice-feedback-handlers.test.ts`, `PracticePage.tsx`, `FeedbackList.tsx`, `StatsPage.tsx`, `strings.ts`, `fake-mind.ts`.
- **Resultado (2026-11-19):** lint, typecheck e testes exit 0 (128 arquivos, 1313 testes, linhas 96,52%); e2e exit 0 (60 passaram, 1 pulado). `format:check` sem `docs/guides/study-guide.md` (arquivo do usuário).
- **Desvios:** nenhum relevante; o atalho `Alt+1` a `Alt+3` usa `event.code` para valer em qualquer layout.


### UNIT-6 Pré-teste   Status: verified (2026-11-19, exit 0)

- [x] T-6.1 Criar `PretestService` (`eligible`, `start`, `answer`, `summary`) com a regra de elegibilidade e o limite de 20 — covers FR-2, FR-3, FR-5 — files: `src/core/practice/pretest.ts` — test: `pretest.test.ts` (elegíveis, ordem por "ainda não apareceu em nenhuma rodada", limite, rodada inexistente)
- [x] T-6.2 `material:list` com `pretestEligible` — covers FR-1 — files: `channels.ts`, `src/core/ingestion/service.ts`, `handlers.ts` — test: contagem por material
- [x] T-6.3 Testes de que estatísticas, tópicos fracos, treino, caderno de erros, fila e contagens da prática ignoram `pretest_attempt` — covers FR-4 — files: testes dos cinco consumidores — test: uma questão errada no pré-teste não aparece em nenhum deles e continua "não vista"
- [x] T-6.4 Canais `pretest:start`, `pretest:answer`, `pretest:summary` e a `fake-mind.ts` — covers NFR-7 — files: `channels.ts`, `channel-names.ts`, `handlers.ts`, `fake-mind.ts` — test: contrato e roteador
- [x] T-6.5 Botão "Pré-teste" na Biblioteca e o diálogo de quantidade (1 a 20, validação, limite) — covers FR-1, FR-2, US-1 — files: `pages/LibraryPage.tsx`, `strings.ts` — test: testes de componente
- [x] T-6.6 Criar `PretestPage` (faixa informativa, sem feedback, pular, encerrar, `ConfidencePicker` com a calibração ligada) — covers FR-3, FR-6, FR-17 (parte do pré-teste), NFR-5 — files: `src/renderer/src/pages/PretestPage.tsx`, `router.tsx` — test: testes de componente
- [x] T-6.7 Resumo do pré-teste (acertos, gabarito, comentário, fonte, confiança, atalho para ler) — covers FR-5 — files: `PretestPage.tsx` — test: teste de componente
- [x] T-6.8 Spec e2e: rodada completa, resumo e conferência de que Estatísticas, Erros e Praticar não mudam — covers US-1, FR-4 — files: `tests/e2e/pretest.spec.ts` — test: o próprio spec
- [x] T-6.9 Rodar o comando de verificação e o e2e da Unit — covers DoD — files: `tasks.md`, `state.md` — test: exit 0

**Unit summary (Construction 3.5):**

- **Arquivos novos:** `src/core/practice/pretest.ts` e `pretest.test.ts`, `src/renderer/src/pages/PretestPage.tsx`, `src/renderer/src/pretest.test.tsx`, `tests/e2e/pretest.spec.ts`.
- **Arquivos alterados:** `src/core/core.ts`, `src/core/contracts/channels.ts`, `channel-names.ts`, `src/main/ipc/handlers.ts`, `router.test.ts`, `practice-feedback-handlers.test.ts`, `src/renderer/src/router.tsx`, `App.tsx`, `pages/LibraryPage.tsx`, `strings.ts`, `src/renderer/test/fake-mind.ts`.
- **Resultado (2026-11-19):** lint, typecheck e testes exit 0 (130 arquivos, 1332 testes, linhas 96,4%); e2e exit 0 (61 passaram, 1 pulado). `format:check` sem `docs/guides/study-guide.md` (arquivo do usuário).
- **Desvios:** (1) a rodada é aberta pela rota `/w/:id/library/:materialId/pretest?count=N` e a `PretestPage` chama `pretest:start` ao montar (o diálogo só pede a quantidade); (2) `pretest:answer` valida o item e a alternativa, mas não exige que `roundId` tenha sido iniciado (não há registro de rodadas no servidor); `pretest:summary` recusa um `roundId` sem respostas; (3) o isolamento (FR-4) é provado por teste do núcleo (`attempt` vazia, contagens, fila, calibração, tópicos fracos e caderno de erros intactos) e pelo e2e; (4) A13 confirmada: a rodada usa questões do material sem nenhuma linha em `attempt`.


### UNIT-7 Verificação final e guia   Status: verified (2026-11-19, exit 0)

- [x] T-7.1 Testes de integração das combinações (feedback adiado com confiança e intercalação; pré-teste com a configuração de bloco) — covers NFR-2, US-2, US-4, US-5 — files: `src/core/practice/practices.integration.test.ts` — test: o próprio teste
- [x] T-7.2 Verificar as quatro práticas sem provedor de IA e sem rede — covers FR-22, NFR-6, US-8 — files: teste de núcleo e e2e sem provedor — test: o próprio teste
- [x] T-7.3 Revisar os textos pt-BR e conferir o contraste das faixas nos temas claro e escuro — covers NFR-5, NFR-8 — files: `strings.ts`, `app.css` — test: revisão e teste de strings
- [x] T-7.4 Atualizar `docs/guides/study-guide.md` com as quatro práticas dentro do app — covers FR-23, US-9 — files: `docs/guides/study-guide.md` — test: revisão do usuário
- [x] T-7.5 Atualizar o `codekb` (`api`, `data-model`, `interactions`, `conventions`, `quality-and-risks`) — covers convenção do projeto — files: `.aidlc/codekb/MIND/` — test: revisão
- [x] T-7.6 Rodar o comando de verificação e o `pnpm e2e` completos; conferir a cobertura global de pelo menos 80% — covers NFR-9, DoD — files: `construction/build-and-test.md` — test: exit 0

**Unit summary (Construction 3.5):**

- **Arquivos novos:** `src/core/practice/practices.integration.test.ts`.
- **Arquivos alterados:** `docs/guides/study-guide.md` (não commitado, é arquivo do usuário), `.aidlc/codekb/MIND/` (api, data-model, interactions).
- **Resultado (2026-11-19):** lint, typecheck e testes exit 0 (131 arquivos, 1336 testes, linhas 96,4%); e2e completo exit 0 (61 passaram, 1 pulado); `format:check` sem `docs/guides/study-guide.md`. Os testes de integração combinam bloco, confiança, intercalação, pré-teste e dia seguinte; um teste confere que o código das práticas não tem `fetch`, URL nem importa o modelo.
- **Desvios:** (1) T-7.3 (revisão dos textos e do contraste) foi só uma conferência pelos testes de componente e pelo uso das classes de tema existentes; não houve revisão visual dos dois temas, que fica para o usuário; (2) T-7.2 sem provedor é coberto no núcleo (itens inseridos direto, sem provedor) e pelo teste estático de rede, sem um e2e sem provedor.


### Matriz de rastreabilidade (requisito, Unit e tarefa)

| Requisitos | Histórias | Unit | Tarefas |
|---|---|---|---|
| FR-21, NFR-1, NFR-10 | US-7 | UNIT-1 | T-1.2 a T-1.9 |
| FR-13, FR-14, FR-15, NFR-3, NFR-4 | US-4 | UNIT-2 | T-2.1 a T-2.7 |
| FR-7, FR-8, FR-11, FR-12, NFR-7 | US-2 | UNIT-3 | T-3.1 a T-3.9 |
| FR-9, FR-10 | US-3 | UNIT-4 | T-4.1 a T-4.6 |
| FR-16 a FR-20 | US-5, US-6 | UNIT-5 | T-5.1 a T-5.8 |
| FR-1 a FR-6 | US-1 | UNIT-6 | T-6.1 a T-6.8 |
| FR-22, FR-23, NFR-2, NFR-5, NFR-6, NFR-8, NFR-9 | US-8, US-9 | UNIT-7 (e DoD das demais) | T-7.1 a T-7.6 |

Cada NFR entra na Definição de Pronto de ao menos uma Unit: NFR-1 e NFR-10 em UNIT-1; NFR-3 e NFR-4 em UNIT-2; NFR-7 em UNIT-3; NFR-5 em UNIT-3, UNIT-5 e UNIT-6; NFR-2, NFR-6, NFR-8 e NFR-9 em UNIT-7 (NFR-2 e NFR-8 também em cada Unit pelo comando de verificação e pelos textos).

### Assumptions & open questions

- A24: o e2e de UNIT-4 não usa relógio falso no Electron; ele insere tentativas com `release_at` no passado direto no banco. A virada das 4h é coberta nos testes de núcleo com relógio injetável. — confirmed: no
- A25: `pnpm e2e` precisa de display; usa `xvfb-run -a`, como no CI e no `make e2e`. — confirmed: no
