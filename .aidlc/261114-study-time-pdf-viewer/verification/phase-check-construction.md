# Phase check — Construction (study-time-pdf-viewer)

Data: 2026-11-14T21:38:16-03:00 · Veredito: **PASS**

## 1. Inventário

| Artefato | Estado |
|---|---|
| Código das 8 Units e testes (commits 369b9b8…ced33fa e o da UNIT-8) | ✓ |
| design.md § 3.1 por Unit, 3.2/3.3 em nota única, 3.4 [S] | ✓ |
| tasks.md: 52 tarefas marcadas, resumo por Unit | ✓ |
| construction/build-and-test.md e ci-pipeline.md | ✓ |
| codekb atualizado | ✓ |

## 2. Rastreabilidade (Unit → código → testes → resultado)

| Unit | Código principal | Testes | Resultado |
|---|---|---|---|
| UNIT-1 | `core/time/service.ts`, migração 0003, `time.tsx`, `TimerCard` | `time.test.ts`, `time-handlers.test.ts`, `time.test.tsx` | verificada |
| UNIT-2 | `activity/blur/tick`, `useActivity` | `time.test.ts`, `time-precision.test.ts`, `activity.test.tsx` | verificada |
| UNIT-3 | `settings/stats/sessions`, `TimeStats`, `TimeSettingsForm` | `time-stats.test.ts`, `time-stats.test.tsx`, `archive.test.ts`, `time.spec` | verificada |
| UNIT-4 | `core/reader/*` | `reader.test.ts`, `worker-reader.test.ts`, `reader-handlers.test.ts` | verificada |
| UNIT-5 | `ReaderPage`, rota `/read` | `reader.test.tsx`, `router.test.tsx`, `reader.spec` | verificada |
| UNIT-6 | `reader-windows.ts`, `material:openOriginal` | `reader-windows.test.ts`, `reader-handlers.test.ts`, `reader.test.tsx`, `reader.spec` | verificada |
| UNIT-7 | `source.ts`, `locate`, `SeeInPdf` | `source.test.ts`, `see-in-pdf.test.tsx`, `reader.spec` | verificada |
| UNIT-8 | e2e, medições, pacote | `reader.spec`, `security.test.ts` | verificada |

Cobertura de requisitos: todos os 24 FR e 10 NFR estão na matriz de `build-and-test.md`; cada NFR tem projeto (3.3) e validação.

## 3. Consistência e desvios registrados

- Canal `reader:openExternal` de 2.8 dispensado (`material:openOriginal` cobre PDF e demais); `hits[]` de `reader:search` = ocorrências; limite de 1 ping/5 s aplicado no hook, não no canal; tempo em Estatísticas como seção, não aba; busca por glifos (mupdf diferencia maiúsculas).
- Sem contradições abertas.

## 4. Pontos para o autor

- O `README.md` tem edições em andamento do autor; o commit `1c12308` (UNIT-4) incluiu, sem querer, uma versão anterior delas, e o texto novo sobre tempo e leitor está só no working tree. `pnpm format:check` falha apenas nesse arquivo.
- Nenhum `git push` foi feito.
