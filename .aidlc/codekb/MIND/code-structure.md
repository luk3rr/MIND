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
