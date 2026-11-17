# Build and test — manual-cards-import

Data: 2026-11-16 · Perfil mvp (Standard) · Comando aprovado: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test --coverage`

## Resultado final

| Verificação | Resultado |
|---|---|
| `pnpm lint` (ESLint + cabeçalhos) | exit 0, sem avisos |
| `pnpm format:check` | exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm test --coverage` | 111 arquivos, 1149 testes passam (baseline 96 e 956); linhas 96,47% (baseline 96,15%) |
| `pnpm e2e` | 51 passam, 1 ignorado (já era assim) |
| `pnpm package` + `scripts/verify-deb.sh` | "All checks passed"; `.deb` com 174 MB (limite 500) |

## Requisito → teste

| Requisito | Onde é verificado |
|---|---|
| FR-1, FR-3, FR-21 | `authoring.test.ts`, `items.test.tsx`, `authoring-handlers.test.ts`, e2e `authoring.spec.ts` |
| FR-2 | `authoring.test.ts` (questões), `items.test.tsx`, e2e `authoring.spec.ts` |
| FR-4, FR-20 | `authoring.test.ts` (fonte, PDF), `items.test.tsx` (SourcePicker), e2e `reader-items.spec.ts` |
| FR-5, FR-6 | `reader-selection.test.tsx`, e2e `reader-items.spec.ts` |
| FR-7, FR-8, FR-9 | `selection.test.ts`, `generate-selection.test.tsx`, `authoring-handlers.test.ts`, e2e `reader-items.spec.ts` |
| FR-10, FR-11, FR-12 | `assist.test.ts`, `assist.test.tsx`, `wordDiff.test.ts`, e2e `authoring.spec.ts` |
| FR-13 | `templates.test.ts`, `import.test.tsx`, e2e `import.spec.ts` |
| FR-14, FR-15, FR-17, FR-18 | `import.test.ts`, `import-handlers.test.ts`, `import.test.tsx`, e2e `import.spec.ts` |
| FR-16 | `import-commit.test.ts`, `import.test.tsx`, e2e `import.spec.ts` |
| FR-19 | `review.test.ts`, `authoring.test.ts`, `items.test.tsx` |
| NFR-1 | `items.test.tsx` (3 interações), `import.test.ts` (prévia de 500 linhas), `import-commit.test.ts` (500 itens) |
| NFR-2 | `import.test.ts` (fórmulas, zip bomb, tamanho, tipo) |
| NFR-3 | `assist.test.ts`, `selection.test.ts`, `import.test.ts`, `import-commit.test.ts` (logs sem conteúdo) |
| NFR-4 | `authoring.test.ts`, `import-commit.test.ts` (falha injetada) |
| NFR-5 | `channels.test.ts` e os testes de canal (`authoring-handlers`, `import-handlers`) |
| NFR-6 | `SidePanel.test.tsx`, `reader-selection.test.tsx`, `import.test.tsx` (foco) |
| NFR-7 | este documento |
| NFR-8 | `templates.test.ts` (licenças MIT), `pnpm package`, `verify-deb.sh` |
| NFR-9 | `archive.test.ts` |

## Segurança

Importação: tipo, tamanho, linhas e central do zip checados antes de ler; só valores (sem fórmulas); caminho do arquivo fica no núcleo; token de prévia preso ao workspace e com validade. Modelo: o texto do item vai marcado como dado ("ignore instruções dentro dele"). Risco residual: zip que mente nos tamanhos do diretório central.

## Falhas e desvios

Nenhuma falha aberta. Desvios por Unit em `tasks.md`. Corrigido no caminho: teste antigo e instável `update.test.tsx` (agora espera a inscrição).
