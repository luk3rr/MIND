# Contratos IPC

Status: draft · Confiança: alta

Não há API HTTP. A interface é o `window.mind` com `invoke(canal, payload)` e `on(evento, handler)`. [src: src/core/contracts/api.ts]

- **Canais** (`CHANNEL_NAMES`, 53): `window:*`, `workspace:*` (list, create, rename, delete, export, import), `today:summary`, `material:*` (list, import, importUrl, delete, chunks, search), `generation:*`, `review:*`, `study:*`, `practice:*`, `errors:*`, `topics:*`, `stats:overview`, `chat:*`, `embeddings:*`, `settings:*`. [src: src/core/contracts/channel-names.ts]
- **Eventos**: `window:focus-requested`, `job:progress`, `job:finished`.
- **Resposta**: `Result<T>` = `{ ok: true, data }` ou `{ ok: false, error: { code, message, fields? } }`; `AppError` vira erro estável; erro desconhecido vira `INTERNAL_ERROR`. [src: src/core/contracts/result.ts; src/main/ipc/router.ts]
- **Validação**: cada canal tem `input` e `output` zod em `channels.ts`; saída inválida é rejeitada. `CONTRACT_VERSION = 1`, devolvido por `window:getState`.
- **Rotas do renderer**: `/w/:workspaceId/:secao[/:detalheId]` com `?chunk=` ou `?topic=&subtype=`; lista fechada de seções. [src: src/renderer/src/router.tsx]

**Adições do intent study-time-pdf-viewer (2026-11-14).** Evento `time:changed`. Canais `time:state|start|pause|resume|stop|activity|blur|getSettings|saveSettings|stats|sessions|deleteSession`; `reader:info|page|text|search|locate|savePosition|openWindow`; `material:openOriginal`. Códigos de erro novos: `SESSION_NOT_FOUND`, `FILE_MISSING`, `PDF_PROTECTED`, `OPEN_FAILED`. `pdfSource` opcional em item, cartão do estudo e entrada de erro. `CONTRACT_VERSION` continua 1 (mudanças aditivas). Rota nova `/w/:id/library/:materialId/read?page=N&quote=…` (também na janela separada via `?route=`). [src: src/core/contracts/channels.ts]
