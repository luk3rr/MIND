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

**Pedido do usuário na geração.** `generation:start` e `generation:estimate` aceitam `instructions` (até 500 caracteres, texto livre) e `variations` (booleano). O texto entra no prompt depois dos trechos ("Extra instructions from the user…"), sem afrouxar as regras de fonte e citação; `variations` usa até 15 itens aprovados do material (ou do tópico, no treino) como modelos de "novas variações" e substitui a lista "não repita"; sem itens aprovados a validação falha no campo `variations`. [src: src/core/generation/prompts.ts; service.ts]

**Estudar.** As telas de cards (`/w/:id/study`) e de questões (`/w/:id/study/practice`) mostram as abas **Cards** e **Questões** (`StudyTabs`, com a contagem de cada uma e uma linha explicando o modo); trocar de aba substitui a entrada do histórico em vez de empilhar. **Recarregamento.** `useInvoke` mantém os dados na tela quando a mesma chamada é recarregada (pollers da Biblioteca, da Geração e do painel semântico), mostrando o esqueleto só quando o canal ou o payload mudam. [src: src/renderer/src/hooks.ts; components/StudyTabs.tsx]

**Prática de questões (2026-11-15).** A sessão guarda a lista das questões já mostradas (`deck`): **Pular** avança sem responder, **Anterior** volta a qualquer uma (respondida aparece como estava, não respondida continua aberta) e, no fim da fila, as puladas podem ser retomadas. O combobox de filtro (tópico, material, tipo) é o mesmo `FilterSelect` dos cards, alimentado por `practice:facets` (facetas só de questões); trocar o filtro ou "Refazer certas" recomeça a sessão. **Gerações incompletas.** A tabela "Gerações recentes" mostra por que uma geração ficou abaixo do pedido: contagem por motivo (sem fonte, inválido, repetido, reprovado pela revisão), quanto o modelo simplesmente deixou de devolver e a lista traduzida dos descartes (`discardLog`, até 20). [src: src/renderer/src/pages/PracticePage.tsx; GeneratePage.tsx]
