# Contratos IPC

Status: draft · Confiança: alta

Não há API HTTP. A interface é o `window.mind` com `invoke(canal, payload)` e `on(evento, handler)`. [src: src/core/contracts/api.ts]

- **Canais** (`CHANNEL_NAMES`, cerca de 86 canais em 2026-11-16): `window:*`, `workspace:*` (list, create, rename, delete, export, import), `today:summary`, `material:*` (list, import, importUrl, delete, chunks, search), `generation:*`, `review:*`, `study:*`, `practice:*`, `errors:*`, `topics:*`, `stats:overview`, `chat:*`, `embeddings:*`, `settings:*`. [src: src/core/contracts/channel-names.ts]
- **Eventos**: `window:focus-requested`, `job:progress`, `job:finished`.
- **Resposta**: `Result<T>` = `{ ok: true, data }` ou `{ ok: false, error: { code, message, fields? } }`; `AppError` vira erro estável; erro desconhecido vira `INTERNAL_ERROR`. [src: src/core/contracts/result.ts; src/main/ipc/router.ts]
- **Validação**: cada canal tem `input` e `output` zod em `channels.ts`; saída inválida é rejeitada. `CONTRACT_VERSION = 1`, devolvido por `window:getState`.
- **Rotas do renderer**: `/w/:workspaceId/:secao[/:detalheId]` com `?chunk=` ou `?topic=&subtype=`; lista fechada de seções. [src: src/renderer/src/router.tsx]

**Adições do intent study-time-pdf-viewer (2026-11-14).** Evento `time:changed`. Canais `time:state|start|pause|resume|stop|activity|blur|getSettings|saveSettings|stats|sessions|deleteSession`; `reader:info|page|text|search|locate|savePosition|openWindow`; `material:openOriginal`. Códigos de erro novos: `SESSION_NOT_FOUND`, `FILE_MISSING`, `PDF_PROTECTED`, `OPEN_FAILED`. `pdfSource` opcional em item, cartão do estudo e entrada de erro. `CONTRACT_VERSION` continua 1 (mudanças aditivas). Rota nova `/w/:id/library/:materialId/read?page=N&quote=…` (também na janela separada via `?route=`). [src: src/core/contracts/channels.ts]

**Renomear material.** Canal `material:rename` (`{ workspaceId, id, title }`): atualiza `material.title` (1 a 200 caracteres, espaços normalizados) e a cópia `item.sourceTitle` dos itens gerados a partir dele; o nome do arquivo em disco não muda. [src: src/core/ingestion/service.ts]

**Adições até 240ed43 (2026-11-16).** Canais `material:rename`, `review:discardApproved`, `review:restore`, `items:list`, `items:bulk` (ações `topic|discard|restore|approve`), `practice:facets`, `stats:materials`, `update:state|check|setEnabled|dismiss|openRelease` e evento `update:available`. `review:edit` aceita `front`, `back`, `topic` e, para questões, `options[{key,text,why}]` e `answer`. `items:list` devolve `{id, kind, subtype, front, back, status, topicId, topic, materialId, material, edited, createdAt}` (sem fonte). `generation:start` e `generation:estimate` aceitam `instructions` e `variations`. [src: src/core/contracts/channels.ts]

**Criação, ajuda do modelo e importação (intent manual-cards-import, 2026-11-16).** Canais novos, todos com esquemas zod estritos em `channels.ts`:

| Canal | Para quê |
|---|---|
| `items:create` | cria um cartão ou uma questão aprovados (`origin` `manual` ou `reader`), com tópico e fonte opcionais; devolve `{ itemId, topicCreated, sourceLinked }` |
| `source:resolve` | casa um texto com um chunk da página do material (`full`, `partial` ou `none`) |
| `assist:improve` | pede ao modelo melhorar, corrigir ou ajustar o texto de um item; devolve uma proposta e nunca grava |
| `selection:estimate`, `selection:generate` | custo estimado e rascunhos a partir de um trecho selecionado no leitor (até 20 itens, 8.000 caracteres); nada é gravado |
| `import:template` | salva o template de cartões ou de questões em CSV ou XLSX (diálogo de salvar) |
| `import:preview`, `import:previewRows`, `import:commit`, `import:discard` | lê um arquivo escolhido no diálogo do núcleo, mostra a prévia (token de 15 min), grava as linhas válidas de uma vez e descarta a prévia |

`items:list` passou a devolver `origin`, `sourceTitle`, `sourcePage` e `hasPdf`. Códigos de erro novos: `IMPORT_FILE_INVALID`, `IMPORT_LIMIT_EXCEEDED`, `IMPORT_EXPIRED`. `UiBridge` ganhou `pickImportFile`. `CONTRACT_VERSION` continua 1 (mudanças aditivas). [src: src/core/contracts/channels.ts]

**`study:next` (2026-11-16, commit eb9a6b8).** O payload aceita `early` (booleano opcional: estudar já os cards em aprendizado que vencem mais tarde hoje) e a resposta sem card traz `waiting { count, due } | null`. [src: src/core/contracts/channels.ts; src/main/ipc/handlers.ts]

**Práticas de estudo (intent study-techniques, 2026-11-19; `CONTRACT_VERSION` 2).** `practice:next` devolve a questão sem chave, comentário nem citação (`questionView`); `practice:answer` aceita `confidence` e devolve `{ attemptId, feedback | null, releaseAt | null }`. Canais novos: `practice:settings`, `practice:saveSettings`, `practice:releaseBlock`, `practice:releaseAbandoned`, `practice:pendingCount`, `practice:openFeedback`, `pretest:start`, `pretest:answer`, `pretest:summary`, `stats:calibration`. `study:next` e `practice:next` aceitam `mix` e devolvem `mixKey`; `material:list` traz `pretestEligible`; `today:summary` traz `pendingFeedback`. [src: src/core/contracts/channels.ts]

**Análise e disciplina do material (verificado em 2026-11-19, commit c69c420).** `material:analyze {id}` devolve `{ started, analysis }` (idempotente; erros de chave e consentimento de `ensureReady`) e `material:setSubject {id, subject: string|null}` devolve o material. `materialInfo` (list, import, importUrl, rename, setSubject) ganha `subject` (`value`, `source` informed|inferred|title, `informed`, `inferred`) e `analysis` (`state`, `progress`, `errorCode`, `errorDetail`, `analyzedAt`); `runInfo` ganha `discardedOutOfScope`, `rounds` e `withAnalysis`; `generation:estimate` ganha `onlyQuestions`. `CONTRACT_VERSION` continua 2 (mudanças aditivas). [src: src/core/contracts/channels.ts]
