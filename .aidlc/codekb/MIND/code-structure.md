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
