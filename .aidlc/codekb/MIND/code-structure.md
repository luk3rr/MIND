# Estrutura do código

Status: draft · Confiança: alta

| Caminho | Conteúdo |
|---|---|
| `src/main/` | processo principal: `index.ts` (janela, sessão, ciclo de vida), `ipc/` (router e handlers), `security.ts`, `window-state.ts`, workers (`extract-worker.ts`, `embed-worker.ts`), log em arquivo |
| `src/preload/index.ts` | ponte `window.mind` (invoke e on) |
| `src/core/contracts/` | `channels.ts` (esquemas zod por canal), `channel-names.ts`, `errors.ts`, `result.ts`, `api.ts` |
| `src/core/db/` | esquemas Drizzle (`app-schema.ts`, `workspace-schema.ts`), conexão, `migrations/{app,workspace}` |
| `src/core/workspaces/` | registro de workspaces, backup `.zip` (`archive.ts`) |
| `src/core/ingestion/` | extratores PDF (mupdf), DOCX, texto, web; OCR; chunker; `MaterialService` |
| `src/core/{generation,verification,review}` | geração com LLM, verificação de fonte, aprovação |
| `src/core/{study,practice,notebook,stats,today}` | FSRS, questões, caderno de erros, estatísticas, resumo de Hoje |
| `src/core/{retrieval,chat}` | BM25 + embeddings, chat com citações |
| `src/core/{llm,settings,jobs}` | provedor, consentimento, custos, configurações, fila |
| `src/renderer/src/` | `App.tsx`, `router.tsx` (rotas `/w/:id/:secao/:detalhe`), `pages/`, `components/`, `strings.ts` (textos pt-BR, `T`), `hooks.ts` (`useInvoke`, `useHotkeys`), `theme.ts`, estilos |
| `tests/` | `e2e/` (Playwright dirigindo o Electron), `fixtures/`; testes unitários ao lado do código (`*.test.ts[x]`) |
| `fixtures/`, `scripts/` | referências congeladas; `check-headers.mjs`, `verify-deb.sh`, `sm1.ts` |

[src: listagem de src/ no commit 101d3e6]

**Adições do intent study-time-pdf-viewer (2026-11-14).**

| Caminho | Conteúdo |
|---|---|
| `src/core/time/` | `TimeService` (cronômetro manual e contagem automática, metas, estatísticas, histórico) |
| `src/core/reader/` | `ReaderService`, `PdfReader` (mupdf), `backend.ts` (`WorkerReader`, `InProcessReader`), `reader.worker.ts`, `files.ts` (`materialFile`), `source.ts` (`pdfSourceOf`) |
| `src/main/reader-windows.ts`, `reader-worker.ts` | uma janela de leitor por material; fábrica do worker |
| `src/renderer/src/time.tsx` | `TimeProvider`, `useTime`, `useActivity`, `formatClock`, `formatDuration` |
| `src/renderer/src/pages/ReaderPage.tsx` | leitor de PDF (imagem, camada de texto, busca, zoom) |
| `src/renderer/src/components/` | `TimerCard`, `TimeStats`, `TimeSettingsForm`, `ChartBlock`, `SeeInPdf` |

**Adições até 240ed43 (2026-11-16).**

| Caminho | Conteúdo |
|---|---|
| `src/core/update/` | `UpdateService` e `version.ts` (aviso de nova versão); `src/main/update-scheduler.ts` agenda a consulta |
| `src/core/generation/` | além de `cards.ts`/`questions.ts`/`prompts.ts`: `calc.ts` (questões de cálculo), `self-contained.ts`, `topics.ts` (reuso de tópicos), `training.ts`, `judge.ts`, `planning.ts`, `service.ts` |
| `src/core/review/service.ts` | `ReviewService`: lista/catálogo de itens, `review`, `bulk`, edição, `discardApproved`, `restore`, `approveAll` |
| `src/core/notebook/service.ts` | caderno de erros e criação de cartão a partir de questão errada (run sintética) |
| `src/renderer/src/pages/` | `ItemsPage` (lista paginada, filtros, ações em lote), `ReviewPage`, `GeneratePage`, `ReaderPage` (807 linhas) |
| `src/renderer/src/components/` | `EditItemDialog` (edição de item), `ItemActions`, `ListControls`, `FilterSelect`, `SearchCombobox`, `MaterialProgress`, `StudyTabs`, `StudySettingsForm`, `HelpTip`, `UpdateBanner`, `Dialog`, `ConfirmDialog`, `PromptDialog` |
| `src/renderer/test/fake-mind.ts` | `window.mind` falso para testes de interface |

**Adições do intent manual-cards-import (2026-11-16).**

| Caminho | Conteúdo |
|---|---|
| `src/core/authoring/` | `ItemAuthoringService` (cria itens à mão, do leitor e em lote; run sintética por origem; `resolveSource`) e `validate.ts` (regras de rascunho compartilhadas com a ajuda do modelo e a importação) |
| `src/core/assist/` | `AssistService` e prompts: melhorar, corrigir e ajustar o texto de um item; só propõe |
| `src/core/generation/selection*.ts` | `SelectionGenerator`: itens de um trecho selecionado, com a citação verificada dentro do trecho |
| `src/core/importing/` | templates (`templates.ts`), leitura segura de CSV e XLSX (`read.ts`, `zip.ts`), validação por linha (`validate.ts`) e `ImportService` (prévia em memória, `commit`) |
| `src/core/db/run-kinds.ts` | `SYNTHETIC_RUN_KINDS`: runs que só existem para satisfazer `item.run_id` |
| `src/renderer/src/components/` | `SidePanel`, `ItemEditor` (cartão e questão), `SourcePicker`, `ImproveProposal`, `SelectionBar`, `GenerateFromSelection`, `ImportPanel`; `wordDiff.ts` |

**Adições de 2026-11-17 (commit 4e7cc4e).** `.githooks/pre-commit` e `scripts/pre-commit.ts` (hook de pre-commit), `tests/pre-commit.test.ts` (seus testes), `Makefile` (atalhos de desenvolvimento) e `docs/{img,guides}/` (imagens e guias). [src: listagem do repositório]
