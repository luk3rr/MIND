# Build and test — study-time-pdf-viewer

Data: 2026-11-14 · Commits: 369b9b8 a ced33fa (docs, UNIT-1 a UNIT-7) e o commit final da UNIT-8 · Resultado: **PASS**, com a ressalva do README abaixo.

## Comandos e resultados

| Comando | Resultado |
|---|---|
| `pnpm lint` (ESLint + cabeçalhos de arquivo) | exit 0 (242 arquivos) |
| `pnpm typecheck` (core, main, preload, renderer, ferramentas) | exit 0 |
| `pnpm test --coverage` | **80 arquivos, 728 testes**, exit 0 (baseline: 66 arquivos, 614 testes) |
| Cobertura | linhas **95,76%**, ramos 86,5%, funções 93,68%, instruções 94,56% (limite 80%; baseline 95,52%) |
| `pnpm exec prettier --check src tests .aidlc` | exit 0 |
| `pnpm format:check` | **falha só em `README.md`**: a linha `3. [Como gerar uma chave…` que o autor está editando; o resto do repositório passa. Corrigir com `pnpm format` depois que o autor terminar a edição |
| `pnpm e2e` (Playwright dirigindo o Electron, após a UNIT-7) | **36 passaram**, 1 ignorado (modelo real) |
| `pnpm package` + `scripts/verify-deb.sh` | `.deb` **171 MB** (limite 500), **520 MB instalado** (limite 1024), lintian sem erros |
| E2E no app empacotado (`MIND_E2E_EXECUTABLE=dist/linux-unpacked/mind`): `reader.spec` + `time.spec` | 5 passaram |

## Medições (NFR-2)

Teste `tests/e2e/reader.spec.ts`, PDF de 100 páginas (`fixtures/pdfs/big-100.pdf`), app em desenvolvimento e empacotado:

| Medida | Resultado | Limite |
|---|---|---|
| Primeira página visível depois de clicar em **Ler** | 210 ms (dev) · 207 ms (empacotado) | 2000 ms |
| Troca de página (5 trocas) | 54 a 70 ms | 500 ms |

## Matriz requisito → teste

| Requisitos | Onde são verificados |
|---|---|
| FR-1, FR-2, FR-6, FR-12 | `time.test.ts`, `time-handlers.test.ts`, `db.test.ts`, `time.spec` |
| FR-3, FR-4, FR-5, FR-13 | `time.test.ts` (automático, ociosidade, atribuição, duas janelas), `activity.test.tsx`, `time-precision.test.ts` |
| FR-7, FR-8, FR-9 | `time.test.tsx`, `time-stats.test.tsx`, `time.spec` |
| FR-10, FR-14 | `time-stats.test.ts`, `time-stats.test.tsx` |
| FR-11 | `archive.test.ts` (ida e volta, backup anterior à 0003) |
| FR-15, FR-16, FR-18, FR-24 | `reader.test.ts`, `worker-reader.test.ts`, `reader.test.tsx`, `reader.spec` |
| FR-17 | `reader.test.ts` (busca e `findOccurrences`), `reader.test.tsx`, `reader.spec` |
| FR-19, FR-20, FR-21 | `reader-windows.test.ts`, `reader-handlers.test.ts`, `reader.test.tsx`, `reader.spec` (janela real) |
| FR-22, FR-23 | `source.test.ts`, `reader.test.ts`, `see-in-pdf.test.tsx`, `router.test.tsx`, `reader.spec` |
| NFR-1 | `time-precision.test.ts` (1 h simulada, erro ≤ 60 s) |
| NFR-2 | medição acima |
| NFR-3 | `security.test.ts` (CSP sem `blob:`, `eval` ou http), `shell.spec` (nenhuma porta aberta); nenhuma dependência nova em `package.json` |
| NFR-4 | `reader.test.ts` ("never reads a file outside the workspace"), `reader-handlers.test.ts` |
| NFR-5 | `time.test.ts` (sem `console`); tempos não entram em prompts do LLM (nenhum código do LLM lê `study_session`) |
| NFR-6 | rótulos e papéis testados em `reader.test.tsx`, `time.test.tsx` |
| NFR-7 | relógio e atividade injetáveis (`TimeService`, `useActivity`); cobertura acima do limite |
| NFR-8 | `db.test.ts`, `archive.test.ts` |
| NFR-9 | `git diff 101d3e6 -- package.json pnpm-lock.yaml` vazio |
| NFR-10 | `.deb` 171 MB e 520 MB instalado |

## Notas de segurança

- Nenhuma porta de rede nova; a CSP não mudou; as imagens das páginas chegam como `data:image/png` (já permitido por `img-src`).
- O renderer nunca informa caminhos: abre janela e abre no sistema por `materialId`; o núcleo resolve dentro de `files/` (rejeita `..`, caminhos absolutos e links que escapam).
- A janela do leitor usa as mesmas `secureWebPreferences`, nega `window.open` e bloqueia navegação para fora do app; o parâmetro `?route=` só vale para rotas de leitor.
- `shell.openPath` abre o arquivo do material no aplicativo padrão do sistema, uma ação que o usuário pede com um clique.

## Não verificado

- O `shell.openPath` real não é exercitado nos testes automáticos (lançaria um aplicativo externo); o handler é testado com `openPath` simulado.
- Não foi medido um PDF de ~200 páginas exato (o fixture tem 100); a medição de 100 páginas ficou em ~10% do limite.
