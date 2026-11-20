# Build and test — generation-relevance

## Baseline (antes do primeiro commit de código; HEAD 8330836, tarefa T-1.1)

- `pnpm test --coverage`: **2 falhas, 1358 passaram** (131 arquivos). As duas falhas são instabilidade sob a carga da cobertura, não regressão: `calibration.test.tsx > chooses the level with Alt+1 to Alt+3` e `mix.test.tsx > offers to alternate by material` passam isoladamente (`vitest run` do arquivo). Registradas como pré-existentes.
- `xvfb-run -a pnpm e2e`: **61 passaram, 1 pulado**, exit 0 (2,4 min).
- Os números do baseline antigo (1192 testes, 96,45%) ficaram para trás: a suíte hoje tem 1360 testes.

## Resultado final (2026-11-19, após a UNIT-7)

- `pnpm lint`, `pnpm format:check` e `pnpm typecheck`: exit 0.
- `pnpm test --coverage`: exit 0, **137 arquivos e 1482 testes**; cobertura global **94,83% das instruções, 87,22% dos ramos, 94,63% das funções e 96,19% das linhas** (o piso é 80%). As duas instabilidades do baseline não apareceram nesta rodada.
- `xvfb-run -a pnpm e2e`: exit 0, **62 passaram, 1 pulado** (o spec novo `tests/e2e/subject.spec.ts` entre eles).
- Evolução da suíte: baseline 1360 testes → 1482 (+122) e 61 → 62 specs e2e.

## Requisito → teste

| Requisito | Testes |
|---|---|
| FR-1 disciplina nos prompts | `units.test.ts` (informada, inferida, título), `generation.test.ts`, `prompts.test.ts`, e2e `subject.spec.ts` |
| FR-2 teste de escopo | `prompts.test.ts`, `questions.test.ts` (perfis de questão e cálculo) |
| FR-3 "até N" | `generation.test.ts` (menos itens e nenhum), `questions.test.ts` |
| FR-4 segunda rodada | `generation.test.ts` (uma rodada, nunca duas), `planning.test.ts` (`planMore`), `generate.test.tsx` |
| FR-5 questão de prova e comentário | `self-contained.test.ts`, `prompts.test.ts` |
| FR-6 juiz de relevância de cards | `questions.test.ts` (`Judge.judgeRelevance`), `generation.test.ts`, `relevance.test.ts` |
| FR-7 relevância em questões | `questions.test.ts` (`out_of_scope`), `relevance.test.ts` |
| FR-8 classificação dos trechos | `classifier.test.ts`, `analyzer.test.ts` |
| FR-9 análise idempotente, cancelável e repetível | `analyzer.test.ts`, `analysis-handlers.test.ts`, `subject.test.tsx` |
| FR-10 lotes por unidade | `planning.test.ts`, `relevance.test.ts`, `units.test.ts` |
| FR-11 citação fora do contexto | `relevance.test.ts` (`source_is_context`), `prompts.test.ts` |
| FR-12 geração sem análise | `units.test.ts`, `relevance.test.ts`, `subject.test.tsx` |
| FR-13 material só de questões | `units.test.ts`, `subject.test.tsx` |
| FR-14 definir a disciplina | `analysis-handlers.test.ts`, `subject.test.tsx`, e2e `subject.spec.ts` |
| FR-15 resumo da execução | `db.test.ts`, `generation.test.ts`, `generate.test.tsx` |
| FR-16 custo e limite mensal | `generation.test.ts` (estimativa), `analyzer.test.ts` (limite) |
| FR-17 fixtures e avaliação | `relevance.test.ts`; `pnpm eval:generation` é manual |
| FR-18 fixtures de prompt por script | `prompts.test.ts`, `questions.test.ts`, `fixtures.test.ts` |
| NFR-1 meta de qualidade | **pendente**: medição com o modelo real (ver abaixo) |
| NFR-2 privacidade | `analyzer.test.ts` (sem chave ou consentimento) |
| NFR-3 resiliência | `analyzer.test.ts` (falha no meio, status `indexed` intacto) |
| NFR-4 compatibilidade | `db.test.ts` (0006 e 0007 com dados), `archive.test.ts` |
| NFR-5 desempenho | `analyzer.test.ts` (progresso e cancelamento) |
| NFR-6 testabilidade | LLM mockado em todos os testes; cobertura acima de 80% |
| NFR-7 acessibilidade | `subject.test.tsx` (foco, Esc, `role`), e2e `subject.spec.ts` |
| NFR-8 contrato | `analysis-handlers.test.ts`, `channels.test.ts`, `router.test.ts` |

## Segurança

- A análise manda trechos do material ao provedor já configurado, sob o mesmo consentimento da geração; sem chave ou consentimento ela não roda (`CONSENT_REQUIRED`, `PROVIDER_KEY_MISSING`). Nenhuma porta de rede nova (M-9). Nenhuma chave é lida ou gravada em arquivo do projeto.
- O texto do material entra nos prompts como dado: o prompt de classificação diz para tratar os trechos como dados e nunca como instruções.
- Migrations aditivas e anuláveis; nada é apagado (M-10).

## O que ficou pendente (honestamente)

- **NFR-1 não foi medida.** A meta (0 itens fora de escopo que passam e 80% do conteúdo coberto) exige rodar `OPENROUTER_API_KEY=... pnpm eval:generation` com o modelo real, o que gasta com o provedor; a chave só existe cifrada no app e não foi usada. As fixtures e o pipeline estão testados com modelos falsos (que comprovam o encanamento, não a qualidade do modelo). As tarefas **T-3.4 (baseline) e T-7.2 (medição final)** ficam com o usuário.
- A suíte tem instabilidade pontual de dois testes de tela sob a carga da cobertura (`calibration.test.tsx` e `mix.test.tsx`), pré-existente.

