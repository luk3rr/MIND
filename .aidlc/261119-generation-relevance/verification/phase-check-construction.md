# Verificação da fase — Construction (generation-relevance)

Data: 2026-11-19T21:27:30-03:00

## 1. Inventário

| Artefato | Presente |
|---|---|
| `tasks.md` com resumo e resultado de cada Unit | ✓ |
| `construction/build-and-test.md` (baseline, resultado final, requisito → teste, segurança, pendências) | ✓ |
| Commits por Unit na `main` (sem push, versão ou tag) | ✓ |
| 3.7 CI | [S]: o CI existente cobre lint, formato, tipos, testes, e2e e pacote |

## 2. Rastreabilidade (Unit → código → testes → resultado)

| Unit | Código | Testes | Resultado |
|---|---|---|---|
| UNIT-1 Prompts, escopo e "até N" | `generation/{prompts,question-prompts,self-contained,cards,questions,service}.ts`, `llm/scripted.ts`, `scripts/regen-prompt-fixtures.ts` | `prompts`, `questions`, `self-contained`, `generation`, `fixtures` | verificada, commit `bb5a36f` |
| UNIT-2 Juiz de relevância, resumo e segunda rodada | `generation/{judge,cards,questions,planning,service}.ts`, migration 0006, `GeneratePage.tsx` | `generation`, `questions`, `planning`, `db`, `generate.test.tsx` | verificada, commit `4d9cad6` |
| UNIT-3 Fixtures e avaliação | `test/relevance/*`, `scripts/eval-generation.ts` | `relevance.test.ts` | verificada, commit `9b1772b`; T-3.4 pendente do usuário |
| UNIT-4 Análise dos trechos | `analysis/*`, `ingestion/service.ts`, `core.ts`, migration 0007, contratos | `classifier`, `analyzer`, `analysis-handlers`, `db`, `archive` | verificada, commit `57388f0` |
| UNIT-5 Lotes por unidade e papéis | `generation/{planning,prompts,cards,questions,service}.ts` | `planning`, `prompts`, `relevance`, `units` | verificada, commit `b5a3f58` |
| UNIT-6 Disciplina na tela | `SubjectDialog.tsx`, `LibraryPage.tsx`, `GeneratePage.tsx`, `setSubject` | `subject.test.tsx`, `analysis-handlers` | verificada, commit `c69c420` |
| UNIT-7 Verificação final | `tests/e2e/subject.spec.ts`, guia, codekb | e2e completo | verificada; T-7.2 pendente do usuário |

Tarefas: 53 feitas, 2 parciais (T-3.4 e T-7.2, a medição com o modelo real) e 0 abertas.

## 3. Cobertura dos NFR

| NFR | Projeto (design) | Validação |
|---|---|---|
| NFR-1 qualidade | fixtures, juízes, lotes por unidade | **não medida com o modelo real** (pendente); pipeline provado com modelos falsos em `relevance.test.ts` |
| NFR-2 privacidade | consentimento da guarda do provedor | `analyzer.test.ts` |
| NFR-3 resiliência | gravação por janela e transação | `analyzer.test.ts` |
| NFR-4 compatibilidade | migrations 0006 e 0007 aditivas | `db.test.ts`, `archive.test.ts` |
| NFR-5 desempenho | job em segundo plano | `analyzer.test.ts` |
| NFR-6 testabilidade | LLM mockado, builders puros | cobertura 96,19% das linhas |
| NFR-7 acessibilidade | `Dialog` existente, `role="status"` | `subject.test.tsx`, e2e |
| NFR-8 contrato | zod, mudanças aditivas | `analysis-handlers.test.ts`, `channels.test.ts` |

## 4. Consistência

- O comando de verificação aprovado passa: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test --coverage` exit 0 (1482 testes) e `pnpm e2e` exit 0 (62 passaram, 1 pulado).
- Desvios do desenho, todos registrados nas notas de cada Unit: a análise guarda papel e `starts_unit` por janela e `unit` no fim; `onlyQuestions` em `generation:estimate`; `setSubject` na UNIT-6; banners sem `role="status"` em Gerar; custo sem o "(inclui a revisão)" do mockup.
- Nada foi publicado, enviado ou implantado.

## 5. Veredito

**PASS com uma pendência humana:** a medição do NFR-1 (`pnpm eval:generation` com a chave do provedor). Sem ela o código está verificado, mas a melhoria de qualidade ainda não foi comprovada com o modelo real.
