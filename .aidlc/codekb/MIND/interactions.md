# Interações principais

Status: draft · Confiança: média

**Importar material.** Biblioteca → `material:import` → diálogo nativo (`pickFiles`) → `MaterialService.importFile` copia para `files/`, cria `material` em fila → job extrai em worker (mupdf, OCR se preciso) → chunker grava `chunk` → eventos `job:*` atualizam a lista. [src: handlers.ts:83-96; src/core/ingestion/service.ts]

**Ver trechos.** `MaterialPreviewPage` → `material:chunks` (paginado, destaca `chunkId`) — só texto extraído; o arquivo original nunca chega à janela. [src: pages/MaterialPreviewPage.tsx]

**Estudar.** `study:today` / `study:next` / `study:rate` (FSRS; grava `review_log.duration_ms`) e `practice:*` (grava `attempt.seconds`). `stats:overview` agrega por dia e tópico. [src: src/core/study, src/core/stats]

**Fonte citada.** Itens guardam `chunk_id`, `source_page` e `quote`; busca e chat levam a `.../library/<id>?chunk=<id>`. [inferred: pelo uso de chunkId em router.tsx e LibraryPage]
