# Build and test — study-techniques

## Baseline (T-1.1, 2026-11-18, commit 4e7cc4e, antes de qualquer código da intent)

| Comando | Resultado |
|---|---|
| `pnpm lint`, `pnpm format:check`, `pnpm typecheck` | exit 0 |
| `pnpm test --coverage` | exit 0: 112 arquivos, 1192 testes; linhas 96,45% |
| `xvfb-run -a pnpm e2e` | exit 0: 54 passaram, 1 pulado (os specs com modelo roteirizado contra o app instalado, por a923e0b) em 1,9 min |

Sem falhas pré-existentes. A suposição A11 está resolvida.

## Final (2026-11-19, commits até `30308fc` mais a UNIT-7)

| Comando | Resultado |
|---|---|
| `pnpm lint` | exit 0 (cabeçalhos ok) |
| `pnpm format:check` | exit 0, rodado sem `docs/guides/study-guide.md` (arquivo do usuário, não commitado, com espaços no fim de linha) |
| `pnpm typecheck` | exit 0 |
| `pnpm test --coverage` | exit 0: 131 arquivos, 1336 testes; linhas 96,4% (baseline: 1192 testes, 96,45%) |
| `xvfb-run -a pnpm e2e` | exit 0: 61 passaram, 1 pulado (baseline: 54 passaram) |

Matriz requisito para teste: FR-1 a FR-6 em `pretest.test.ts`, `pretest.test.tsx`, `pretest.spec.ts`; FR-7 a FR-12 em `practice-feedback*.test.*`, `feedback-block.spec.ts`, `feedback-pending.spec.ts`; FR-13 a FR-15 em `interleave.test.ts`, `study-mix.test.ts`, `practice-mix.test.ts`, `mix.test.tsx`, `interleave.spec.ts`; FR-16 a FR-20 em `calibration.test.ts`, `calibration.test.tsx`, `calibration.spec.ts`; FR-21 em `settings.test.ts`, `practice-settings.test.tsx`, `practice-settings.spec.ts`; FR-22 em `practices.integration.test.ts`; FR-23 em `docs/guides/study-guide.md`. NFR-1 e NFR-10 em `db.test.ts` e `archive.test.ts`; NFR-3 e NFR-4 em `interleave.test.ts`.

Riscos que ficam: o contraste das faixas nos temas claro e escuro não foi revisado visualmente; um teste de `practice-session.test.tsx` mostrou instabilidade uma vez sob carga (passa isolado); os mockups nunca foram renderizados por um navegador aqui.
