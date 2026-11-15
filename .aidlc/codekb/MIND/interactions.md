# Interações principais

Status: draft · Confiança: média

**Importar material.** Biblioteca → `material:import` → diálogo nativo (`pickFiles`) → `MaterialService.importFile` copia para `files/`, cria `material` em fila → job extrai em worker (mupdf, OCR se preciso) → chunker grava `chunk` → eventos `job:*` atualizam a lista. [src: handlers.ts:83-96; src/core/ingestion/service.ts]

**Ver trechos.** `MaterialPreviewPage` → `material:chunks` (paginado, destaca `chunkId`) — só texto extraído; o arquivo original nunca chega à janela. [src: pages/MaterialPreviewPage.tsx]

**Estudar.** `study:today` / `study:next` / `study:rate` (FSRS; grava `review_log.duration_ms`) e `practice:*` (grava `attempt.seconds`). `stats:overview` agrega por dia e tópico. [src: src/core/study, src/core/stats]

**Fonte citada.** Itens guardam `chunk_id`, `source_page` e `quote`; busca e chat levam a `.../library/<id>?chunk=<id>`. [inferred: pelo uso de chunkId em router.tsx e LibraryPage]

**Adições do intent study-time-pdf-viewer (2026-11-14).**

- **Tempo.** `useActivity(fonte, contexto)` (Estudar, Praticar, prévia e leitor) envia `time:activity` (no máx. a cada 5 s) e `time:blur`; o `TimeService` abre, mantém ou fecha o intervalo (fim = última interação; ociosidade padrão 120 s). O cronômetro manual absorve os pings. Hoje, barra de status, Configurações e Estatísticas leem `time:*`.
- **Leitor.** Biblioteca → **Ler** → `reader:info/page/text` (worker mupdf, PNG em data URL); busca e destaque por glifos; **Nova janela** (`reader:openWindow`, uma por material), **Abrir no sistema** e **Abrir original** (`material:openOriginal`, só por id). **Ver no PDF** em cards, questões, erros, buscas e Chat abre na página citada e destaca o trecho (`reader:locate`).

**Navegação e leitor (2026-11-14).** `RouterProvider` mantém uma pilha de telas (até 50, reiniciada ao trocar de workspace); `BackLink` volta à tela de origem com o nome dela, ou à tela de reserva quando não há histórico; `Alt+←` volta. O leitor tem dois modos, página a página (padrão) e **rolagem contínua** (`ScrollPages`: todas as páginas com o tamanho final, só as vizinhas da área visível desenham imagem e texto; a escolha fica em `localStorage` `mind.reader.mode`). [src: src/renderer/src/router.tsx; src/renderer/src/pages/ReaderPage.tsx]

**Tela inicial.** O menu do workspace tem **Sair do workspace**, que vai para `/welcome`; com workspaces existentes a tela mostra a lista para abrir, mais "Novo workspace" e importar backup (sem workspaces, é o convite do primeiro uso). O histórico de telas reinicia ao sair. [src: src/renderer/src/pages/WelcomePage.tsx]

**Questões de cálculo.** Perfis `calculation_4` e `calculation_5` (subtipo gravado: `multiple_choice`). O modelo devolve, além do enunciado e das alternativas, `calculation { expression, decimals, unit }` e `value` em cada alternativa; o app avalia a expressão com um avaliador aritmético próprio (sem `eval`) e só guarda a questão se exatamente uma alternativa tiver o valor calculado, em `value` e no texto, e a chave do gabarito for essa (`checkCalculation`). O revisor (juiz) usa instruções próprias, que não refazem a conta. O payload guarda `calculation.result` e a explicação ganha a linha "Conta conferida pelo app". [src: src/core/generation/calc.ts; questions.ts; question-prompts.ts]
