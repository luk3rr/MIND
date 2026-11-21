# Tasks — images-in-cards

## 2.9 Delivery plan

- **Verification command:** `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test --coverage` (approved 2026-11-21 by human; pnpm em `~/.local/share/pnpm/bin`). As UNIT-1, 2, 3, 4, 5 e 6 somam `xvfb-run -a pnpm e2e` ao fechar (M-15). A UNIT-7 também, após a import-exam-questions.
- **Order:** UNIT-1, UNIT-2, depois UNIT-3, UNIT-4, UNIT-5 e UNIT-6 em qualquer ordem, e UNIT-7 por último, só com a import-exam-questions concluída. Esta intent roda a Construção antes da UNIT-7; a migração de imagem usa o próximo número livre no momento da UNIT-1 (T-1.2).
- **Walking skeleton:** UNIT-1 (anexar imagem pelo seletor, colar ou arrastar e vê-la no Estudo), com aprovação do esqueleto antes de seguir. [state: walking_skeleton=on]
- **Condução:** autônoma depois do esqueleto; para na aprovação do esqueleto, em falhas e em ações irreversíveis. Commits atômicos na `main`, um ou mais por Unit verificada, sem `git push`, sem mexer na versão e sem tag. [mem: M-7]
- **Regras para toda tarefa:** código, comentários e commits em inglês; textos ao usuário em pt-BR em `strings.ts`; cabeçalho `Filename/Created on/Author` em arquivo de código novo, exceto binários (M-8); testes ao lado do código, relógio injetável e LLM mockado (M-5); migração aditiva gerada com `pnpm db:generate` (M-10); canal com esquema zod, `channel-names.ts`, handler, teste de roteador e `fake-mind.ts` alinhados (M-9); fluxo novo de tela com spec e2e (M-14, M-15); nenhuma dependência nova sem ADR e licença AGPL (M-6).

### BOLT-1 — Units: UNIT-1 — Owner: Construção

- **Goal:** esqueleto: anexar uma imagem e vê-la no Estudo.
- **Definition of Done:** o comando de verificação e o e2e passam; a mesma imagem anexada duas vezes gera um só arquivo; SVG, arquivo corrompido e imagem enorme em pixels são recusados sem gravar nada; migração abre um banco da v0.9.0 populado; `CONTRACT_VERSION` em 2; baseline de testes registrado.
- **Confidence hypothesis:** média; o tamanho dos bytes pelo IPC (A26) e a leitura de WebP sem biblioteca são os pontos de incerteza.
- **Risks and sequencing:** validar o esqueleto antes das demais; se o IPC engasgar com 100 MB, passar a usar caminho de arquivo temporário.

### BOLT-2 — Units: UNIT-2, UNIT-3 — Owner: Construção

- **Goal:** imagens em todos os campos e telas, com editor e ampliação.
- **Definition of Done:** o comando de verificação e o e2e passam; cada tela de exibição mostra as imagens e trata arquivo ausente; questão com imagem no enunciado e numa alternativa responde em Prática; cortar/girar preserva o original; todos os estados do `mockups/refined.html` das telas de item implementados.
- **Confidence hypothesis:** alta; reaproveita editores e `MathText`.
- **Risks and sequencing:** UNIT-3 só depois da UNIT-2.

### BOLT-3 — Units: UNIT-4, UNIT-5, UNIT-6 — Owner: Construção

- **Goal:** ciclo de vida, recorte do PDF e planilha com imagens.
- **Definition of Done:** o comando de verificação e o e2e passam; excluir, editar e restaurar nunca apagam imagem em uso nem deixam sobra; recorte do leitor funciona com arrasto no Electron real; zip malicioso (`..`) é recusado; backup e restauração devolvem as imagens.
- **Confidence hypothesis:** média; a geometria do recorte e os limites do zip merecem fixtures.
- **Risks and sequencing:** UNIT-4, UNIT-5 e UNIT-6 em qualquer ordem após a UNIT-2.

### BOLT-4 — Units: UNIT-7 — Owner: Construção (após a import-exam-questions)

- **Goal:** figuras sugeridas nas questões importadas de provas.
- **Definition of Done:** o comando de verificação e o `pnpm e2e` completos passam; cobertura global ≥ 80%; fixtures de prova com figura raster e vetorial; guia e codekb atualizados.
- **Confidence hypothesis:** baixa a média; a heurística de vãos pode errar (ADR-5), mitigada pela revisão.
- **Risks and sequencing:** última; espera a import-exam-questions concluída.

## Tasks

### UNIT-1 Esqueleto: anexar e estudar   Status: verified and skeleton approved (2026-11-21)

- [x] T-1.1 Rodar `pnpm lint`, `format:check`, `typecheck`, `test --coverage` e `xvfb-run -a pnpm e2e` como baseline e registrar as falhas anteriores — covers NFR-9 — files: `.aidlc/261121-images-in-cards/construction/build-and-test.md` — test: saída registrada
- [x] T-1.2 Criar `src/core/images/probe.ts` (`probe(bytes)`: PNG, JPEG, GIF, WebP com VP8/VP8L/VP8X; tipo, largura, altura, animado; recusa o resto; 100 MP) — covers FR-4, NFR-2 — files: `src/core/images/probe.ts`, `probe.test.ts` — test: um caso por formato, SVG, truncada e cabeçalho falso
- [x] T-1.3 Gerar as fixtures de imagem (script reprodutível e README) fora de `fixtures/`: PNG, JPEG, GIF animado, WebP, corrompida e enorme em pixels — covers NFR-2 — files: `src/core/images/fixtures/`, `scripts/make-image-fixtures.ts` — test: o teste do probe usa as fixtures; Prettier ignora a pasta
- [x] T-1.4 Esquema Drizzle da tabela `image` e migração aditiva (próximo número livre) com `pnpm db:generate` — covers NFR-5 — files: `src/core/db/workspace-schema.ts`, `src/core/db/migrations/workspace/` — test: migração abre um banco da v0.9.0 populado
- [x] T-1.5 `ImageService.put/get`: valida, calcula sha-256, grava `files/images/<hash>.<ext>` com escrita atômica, registra em `image`, devolve `ImageRef` e `info`; aviso `LARGE_FILE` acima de 20 MB; recusa acima de 100 MB — covers FR-1, FR-4, FR-5, FR-6, NFR-2 — files: `src/core/images/service.ts`, `service.test.ts` — test: mesma imagem duas vezes gera um arquivo; recusas não gravam; aviso e confirmação
- [x] T-1.6 Esquemas zod `imageRef`, `itemImages`, erros `IMAGE_UNSUPPORTED`, `IMAGE_TOO_LARGE`, `IMAGE_CORRUPT`, `IMAGE_NOT_FOUND` e os canais `image:put`, `image:get`, `image:probe` (com handler, `channel-names.ts`, roteador e `fake-mind.ts`) — covers FR-1, NFR-1 — files: `src/core/contracts/channels.ts`, `errors.ts`, `channel-names.ts`, `src/main/ipc/handlers.ts`, `src/renderer/src/fake-mind.ts` — test: `channels.test.ts`, `router.test.ts`, `handlers.test.ts`
- [x] T-1.7 `payload.images` opcional em `items:create` e em `itemInfo`; `AuthoringService` guarda e confere que cada hash existe — covers FR-1, NFR-5 — files: `src/core/authoring/service.ts`, `src/core/generation/schemas.ts` — test: `authoring.test.ts` (item com imagem, hash inexistente, item antigo sem imagem)
- [x] T-1.8 Diálogo nativo "escolher imagem" no processo principal que devolve só o caminho, usado por `image:put {path}` — covers FR-1, NFR-1 — files: `src/main/` — test: teste do handler com diálogo falso
- [x] T-1.9 `ImageField` mínimo: botão "＋ Imagem", colar (Ctrl+V), arrastar, miniatura, aviso de arquivo grande com "Anexar mesmo assim" e mensagens de recusa — covers FR-1, FR-5 — files: `src/renderer/src/components/ImageField.tsx`, `strings.ts` — test: teste de componente (colar, arrastar, recusa, aviso)
- [x] T-1.10 `ItemText` mínimo (texto com `MathText` + imagens do campo via `image:get`) e uso no card do Estudo; ligar `ImageField` ao campo da frente da criação manual — covers FR-1, FR-9 — files: `src/renderer/src/components/ItemText.tsx`, `ItemEditor.tsx`, `pages/StudyPage.tsx` — test: teste de componente e teste da página
- [x] T-1.11 Spec e2e "anexar e estudar": cria um card com imagem na frente, estuda e vê a imagem; tenta anexar SVG e vê a recusa — covers FR-1, FR-4, M-14 — files: `tests/e2e/` — test: `xvfb-run -a pnpm e2e` no Electron real
- [x] T-1.12 Garantir que logs não registram nomes de arquivo nem conteúdo, e que a CSP não mudou — covers NFR-1, NFR-6 — files: `src/core/images/service.ts`, `src/main/security.test.ts` — test: teste de redação de log e teste da CSP
- [x] T-1.13 Rodar o comando de verificação e o e2e, registrar o resultado e pedir a aprovação do esqueleto — covers DoD da UNIT-1 — files: `construction/build-and-test.md` — test: verificação PASS

**Resumo da UNIT-1 (2026-11-21).**
- Arquivos: `src/core/images/` (`probe.ts`, `refs.ts`, `service.ts`, testes e `fixtures/`), `scripts/make-image-fixtures.ts`, tabela `image` e migração `0008_item_images.sql`, canais `image:put` e `image:get`, `images` em `items:create`, `ItemInfo` e `study:next`, `pickImage` no diálogo nativo, `ImageField`, `ItemImageList`, strings, CSS, `fake-mind`, `tests/e2e/images.spec.ts`.
- Resultado: `pnpm lint`, `format:check` e `typecheck` exit 0; `pnpm test --coverage` exit 0 (143 arquivos, 1548 testes; linhas 96,07%, ramos 87,22%); `xvfb-run -a pnpm e2e` exit 0 (63 passaram, 1 pulado, 2,2 min).
- Desvios do plano: (1) `image:probe` foi dispensado; `image:put` devolve `warning: "LARGE_FILE"` e, para arquivo do diálogo, um `token` de uso único que `kind: "confirm"` aceita (o caminho nunca vai à janela). (2) `ItemText` virou `ItemImageList`: o texto continua em `MathText`/`Pieces` e só as imagens são novas. (3) O botão "＋ Imagem" fica antes do campo no DOM (e embaixo na tela por CSS) para o Tab do campo seguir para o próximo campo; sem isso o spec de NFR-1 (3 interações) quebrava. (4) `images` é opcional nas saídas `itemInfo` e `study:next` (testes antigos sem ajuste). (5) Os specs e2e ficam em `tests/e2e/`. (6) A migração usa o número 0008; a import-exam-questions, quando construída, regenera a sua com o próximo número livre.
- Como rodar: `pnpm test src/core/images`, `pnpm tsx scripts/make-image-fixtures.ts` para regenerar fixtures.

### UNIT-2 Todos os campos e telas   Status: verified (2026-11-21)

- [x] T-2.1 Estender o `ImageField` para vários itens por campo: ordem, ↑ ↓, remover, legenda (`alt`), Substituir — covers FR-2, FR-8 — files: `ImageField.tsx` — test: componente (reordenar, remover, legenda)
- [x] T-2.2 Ligar `ImageField` a todos os campos: frente, verso, enunciado, cada alternativa e explicação nos editores (`EditItemDialog`, `ItemEditor`, criação manual, criação pelo leitor) — covers FR-1, FR-2 — files: `components/EditItemDialog.tsx`, `ItemEditor.tsx` — test: componente por editor
- [x] T-2.3 Aceitar texto vazio num campo com imagem; comparar alternativas por texto e hashes; manter o motivo obrigatório — covers FR-3 — files: `src/core/authoring/validate.ts`, `generation/cards.ts` — test: `authoring.test.ts` (alternativa só com imagem, duplicata por hash)
- [x] T-2.4 `review:edit` recebe e guarda `images`; preservar `images` em melhorar proposta, edição e cópia para o caderno de erros — covers FR-2, A22 — files: `src/core/review/service.ts`, `notebook/service.ts` — test: testes de serviço
- [x] T-2.5 `ItemText` completo e uso em Revisão, Estudo, Prática, Chat (exibição), FeedbackList e tela de erros, com `alt` e carga só das imagens visíveis — covers FR-9, NFR-3, NFR-7 — files: `ItemText.tsx`, `pages/*`, `components/FeedbackList.tsx` — test: um teste de componente por tela
- [x] T-2.6 Arquivo ausente: aviso com a legenda e "Substituir" na edição; o item segue respondível — covers FR-11 — files: `ItemText.tsx`, `ImageField.tsx` — test: componente e Prática com arquivo removido
- [x] T-2.7 Aviso na edição contra resposta escrita na imagem da frente ou do enunciado — covers FR-19 — files: `ImageField.tsx` — test: componente
- [x] T-2.8 Nenhuma imagem sai ao provedor: o contexto do chat e as chamadas ao modelo leem só texto; a exibição no Chat avisa — covers FR-18, NFR-1 — files: `src/core/chat/`, `pages/ChatPage.tsx` — test: teste que inspeciona a requisição ao provedor mockado
- [x] T-2.9 Spec e2e: questão com imagem no enunciado e numa alternativa só imagem, praticada e vista no feedback — covers FR-3, FR-9 — files: `tests/e2e/` — test: e2e no Electron real
- [x] T-2.10 Rodar o comando de verificação e o e2e — covers DoD da UNIT-2 — files: `construction/build-and-test.md` — test: verificação PASS

**Resumo da UNIT-2 (2026-11-21).**
- Arquivos: `src/core/images/refs.ts` (`textOrImage`, `beforeAnswer`, `imagesFor`), `authoring/validate.ts` e `review/service.ts` (campo só com imagem, `images` em `review:edit`, conferência de hashes), `practice/service.ts` (imagens do enunciado e das alternativas antes de responder; todas só no feedback), `notebook/service.ts` (`errorCardImages`, `imageCount`), `contracts/channels.ts`, `ImageField` (várias imagens, ordem, legenda, substituir, dica contra resposta), `ItemImageList` (carga só perto da tela), `ItemEditor` e `EditItemDialog` com `ImageField` em todos os campos, Revisão, Prática, FeedbackList e tela de erros, `fake-mind`, specs `item-images.test.ts`, `images-screens.test.tsx`, e2e de questão com figura.
- Resultado: lint, format:check, typecheck exit 0; `pnpm test --coverage` exit 0 (145 arquivos, 1564 testes; linhas 96,01%, ramos 87,21%); `xvfb-run -a pnpm e2e` exit 0 (64 passaram, 1 pulado).
- Desvios: (1) o Chat não exibe itens (só respostas do modelo), então não ganhou imagens; FR-18 foi provado no assistente (texto apenas) e no `questionView` (sem a explicação). (2) `ItemText` continuou como `ItemImageList`. (3) O botão "＋ Imagem" ficou depois do campo, o que acrescenta uma parada de Tab por campo; os specs de NFR-1 (Tab) foram ajustados. (4) A tela de erros mostra só a contagem de imagens (NFR-3); a lista de Itens não mostra imagens. (5) A carga preguiçosa só pede a imagem quando ela chega perto da tela (IntersectionObserver).

### UNIT-3 Editor de imagem e ampliação   Status: verified (2026-11-21)

- [x] T-3.1 Função pura de corte e giro (retângulo, 90°) e geração de PNG por canvas, GIF animado usa o primeiro quadro com aviso — covers FR-7 — files: `src/renderer/src/images/transform.ts`, `transform.test.ts` — test: unidade com canvas simulado
- [x] T-3.2 `ImageEditorDialog`: janela de corte, girar, restaurar, "Usar imagem"; envia original e ajustado a `image:put`; `source` guarda o original — covers FR-7 — files: `components/ImageEditorDialog.tsx` — test: componente
- [x] T-3.3 `Lightbox`: abre por clique ou Enter, Esc e clique fora fecham, foco preso e devolvido, legenda visível — covers FR-10, NFR-7 — files: `components/Lightbox.tsx`, `ItemText.tsx` — test: componente (teclado)
- [x] T-3.4 Spec e2e: colar imagem, cortar e girar, usar, estudar e ampliar — covers FR-7, FR-10 — files: `tests/e2e/` — test: e2e no Electron real
- [x] T-3.5 Rodar o comando de verificação e o e2e — covers DoD da UNIT-3 — files: `construction/build-and-test.md` — test: verificação PASS

**Resumo da UNIT-3 (2026-11-21).**
- Arquivos: `src/renderer/src/images/transform.ts` e `canvas.ts` (corte e giro puros e desenho em canvas), `components/ImageEditorDialog.tsx`, `components/Lightbox.tsx`, `ItemImageList.tsx` (ampliar por clique e botão), `ImageField.tsx` (botão Editar), `Dialog.tsx` (não foca botão desabilitado), strings, CSS, testes `transform.test.ts`, `canvas.test.ts`, `images-editor.test.tsx` e e2e de giro, ampliação e original preservado.
- Resultado: lint, format:check, typecheck exit 0; `pnpm test --coverage` exit 0 (148 arquivos, 1582 testes; linhas 96,02%, ramos 87,26%); `xvfb-run -a pnpm e2e` exit 0 (65 passaram, 1 pulado).
- Desvios: (1) o editor abre pelo botão "Editar" de cada imagem já anexada (o original já está guardado), e não automaticamente a cada colagem; (2) o corte usa quatro controles deslizantes em porcentagem, acessíveis por teclado, em vez de arrastar uma janela; (3) reeditar parte sempre do original (o ajuste anterior não é somado); (4) a ampliação é um botão ao lado da imagem (a imagem continua `img`); alternativas dentro de um botão de rádio na Prática não têm ampliação.

### UNIT-4 Ciclo de vida   Status: verified (2026-11-21)

- [x] T-4.1 `ImageService.sweep(now)`: junta os hashes (incluindo `source`) de todos os payloads, apaga arquivos e linhas sem uso, respeita a carência de 1 h — covers FR-13, NFR-4 — files: `src/core/images/sweep.ts`, `sweep.test.ts` — test: exclusão, edição, cópia do caderno de erros, carência, idempotência
- [x] T-4.2 Chamar `sweep` após excluir item, editar campo, remover material e restaurar backup — covers FR-13 — files: `review/service.ts`, `ingestion/service.ts`, `workspaces/archive.ts` — test: serviços (nunca apaga imagem em uso)
- [x] T-4.3 Canais `image:stats` e `image:sweep` e a seção "Armazenamento" nas Configurações com contagem, peso e "Limpar agora" com confirmação — covers FR-17 — files: `contracts/channels.ts`, `pages/SettingsPage.tsx`, `strings.ts` — test: contrato, handler e componente
- [x] T-4.4 Backup e restauração com imagens: reindexar `image` a partir de `files/images/` quando a tabela falta — covers FR-14, NFR-5 — files: `workspaces/archive.ts` — test: exporta e importa um workspace com imagens e outro de backup antigo
- [x] T-4.5 Spec e2e: criar item com imagem, fazer backup, restaurar e ver a imagem; excluir o item e ver o peso cair — covers FR-13, FR-14, FR-17 — files: `tests/e2e/` — test: e2e no Electron real
- [x] T-4.6 Rodar o comando de verificação e o e2e — covers DoD da UNIT-4 — files: `construction/build-and-test.md` — test: verificação PASS

**Resumo da UNIT-4 (2026-11-21).**
- Arquivos: `src/core/images/service.ts` (`usedHashes`, `reindex`, `stats`, `sweep` com carência de 1 h), `review/service.ts` (varredura após editar imagens), canais `image:stats` e `image:sweep`, `components/ImageStorage.tsx` e seção "Armazenamento de imagens" nas Configurações, `fake-mind`, testes `sweep.test.ts` (varredura, estatísticas, reindexação, backup e restauração), `images-storage.test.tsx` e e2e de backup com imagem.
- Resultado: lint, format:check, typecheck exit 0; `pnpm test --coverage` exit 0 (150 arquivos, 1596 testes; linhas 96,02%, ramos 87,24%); `xvfb-run -a pnpm e2e` exit 0 (66 passaram, 1 pulado).
- Desvios: (1) o app nunca exclui item de verdade (só descarta, e o descartado pode voltar), então as imagens de itens descartados ficam e a varredura automática roda após editar imagens de um item; a limpeza completa é o botão "Limpar agora" (carência 0, com confirmação) e a varredura com carência de 1 h; (2) o backup não precisou de código novo: `files/images/` já entra no zip, e uma tabela `image` ausente (backup antigo) é reconstruída por `reindex`; (3) remover material não apaga imagens de item (elas pertencem aos itens).

### UNIT-5 Recorte do PDF   Status: verified (2026-11-21)

- [x] T-5.1 `PdfReader.cropRegion`: renderiza só a região (clip de pixmap) a 200 dpi como PNG — covers FR-12 — files: `src/core/reader/pdf-reader.ts`, `reader.test.ts` — test: PDF de fixture, tamanho esperado, rotação de página
- [x] T-5.2 Canal `reader:cropRegion` (grava via `ImageService.put` e devolve a referência) — covers FR-12, NFR-1 — files: `contracts/channels.ts`, `reader/service.ts`, handlers — test: contrato e serviço
- [x] T-5.3 Modo "Recortar figura" no leitor: arrastar, retângulo, painel com miniatura, legenda e ações "Novo card…", "Nova questão…" e "Anexar a um item…" — covers FR-12 — files: `pages/ReaderPage.tsx`, `components/` — test: componente
- [x] T-5.4 Spec e2e do arrasto no Electron real e criação do card com a figura — covers FR-12, M-14 — files: `tests/e2e/` — test: e2e
- [x] T-5.5 Rodar o comando de verificação e o e2e — covers DoD da UNIT-5 — files: `construction/build-and-test.md` — test: verificação PASS

**Resumo da UNIT-5 (2026-11-21).**
- Arquivos: `src/core/reader/pdf-reader.ts` (`renderRegion`: retângulo em frações da página, 200 dpi, limite de pixels), `backend.ts`, `service.ts` (`region`), canal `reader:cropRegion` (grava a região via `ImageService`), `components/CropOverlay.tsx`, `CropPanel.tsx`, `AttachToItem.tsx`, `ReaderPage.tsx` (botão e modo Recortar figura), `fake-mind`, testes `reader.test.ts`, `reader-crop.test.tsx` e e2e com arrasto de mouse real.
- Resultado: lint, format:check, typecheck exit 0; `pnpm test --coverage` exit 0 (151 arquivos, 1608 testes; linhas 95,89%, ramos 87,17%); `xvfb-run -a pnpm e2e` exit 0 (67 passaram, 1 pulado).
- Desvios: (1) o e2e completo pegou uma regressão: o botão de recorte, com texto, cobria o botão de rolagem contínua e quebrou 4 specs do leitor; ficou só com ícone, `aria-label` e `title`; (2) "Anexar a um item" lista os itens não descartados e o campo (frente, verso, enunciado, alternativas, comentário) e anexa ao fim do campo, mantendo as outras imagens; (3) `reader:cropRegion` já grava a imagem (o painel mostra o resultado real) e, se a pessoa desistir, a imagem fica sem uso até a varredura.

### UNIT-6 Planilha em zip   Status: verified (2026-11-21)

- [x] T-6.1 Leitor de `.zip` com planilha e imagens (yauzl): recusa nomes com `..` e caminho absoluto, aplica os limites (planilha 10 MB, imagem 100 MB, total 1 GB) — covers FR-15, NFR-2 — files: `src/core/importing/zip-bundle.ts`, `zip-bundle.test.ts` — test: zip válido, malicioso, truncado
- [x] T-6.2 Colunas `imagem_*` com vários nomes por `;`; linha com imagem ausente entra sem imagem e com aviso — covers FR-15 — files: `importing/validate.ts`, `service.ts` — test: `import.test.ts`
- [x] T-6.3 Opção ".zip com planilha e imagens" no diálogo de importação, com contagem de imagens ligadas e faltantes — covers FR-15 — files: `components/ImportPanel.tsx` — test: componente
- [x] T-6.4 Spec e2e do fluxo — covers FR-15 — files: `tests/e2e/` — test: e2e
- [x] T-6.5 Rodar o comando de verificação e o e2e — covers DoD da UNIT-6 — files: `construction/build-and-test.md` — test: verificação PASS

**Resumo da UNIT-6 (2026-11-21).**
- Arquivos: `src/core/importing/bundle.ts` (abre o `.zip` com yauzl: recusa caminhos que saem do arquivo, conta bytes reais, limites de 5000 entradas e 1 GB, uma só planilha), `read.ts` (`tableFromBuffer`), `validate.ts` (colunas `imagem_*`, `fileNames`), `service.ts` (`preview` do zip com aviso por linha, `prepare` que guarda as imagens, `commit` síncrono que as liga), canais `import:preview`/`import:commit` com campos aditivos, `ImportPanel` e strings, `fake-mind`, testes `import-bundle.test.ts`, `import-zip.test.tsx` e e2e com zip real.
- Resultado: lint, format:check, typecheck exit 0; `pnpm test --coverage` exit 0 (153 arquivos, 1621 testes; linhas 95,89%, ramos 87,09%); `xvfb-run -a pnpm e2e` exit 0 (68 passaram, 1 pulado).
- Desvios: (1) `commit` ficou síncrono e uma etapa nova `prepare` (assíncrona, chamada pelo handler de `import:commit`) lê o zip e guarda as imagens antes, para não mudar a API dos testes e do restante; (2) os campos novos de totais, linha e resultado só aparecem quando o arquivo é um `.zip`, então a planilha simples responde exatamente como antes; (3) as colunas de imagem são opcionais e não entram nos templates.

### UNIT-7 Figuras de provas   Status: [S] pulada por ora: depende da import-exam-questions, cuja Construção ainda não aconteceu (nenhum código de `examimport` existe)

- [ ] T-7.1 Sugerir a região da figura da questão (blocos de imagem do texto estruturado e vãos verticais) — covers FR-16 — files: `src/core/examimport/figures.ts`, `figures.test.ts` — test: PDFs de fixture com figura raster e vetorial
- [ ] T-7.2 Gravar a figura em `payload.images.statement` ao importar e canal `exam:figure` para trocar a região — covers FR-16 — files: `examimport/service.ts`, `contracts/channels.ts` — test: serviço e contrato
- [ ] T-7.3 Revisão com selo de figura sugerida ou não encontrada, Trocar, Recortar do PDF… e Remover — covers FR-16 — files: `pages/ReviewPage.tsx` — test: componente
- [ ] T-7.4 Spec e2e da revisão com figura — covers FR-16 — files: `tests/e2e/` — test: e2e
- [ ] T-7.5 Rodar o comando de verificação e o `pnpm e2e` completos; atualizar guia e codekb — covers DoD da UNIT-7 e das NFR-9 — files: `construction/build-and-test.md`, `.aidlc/codekb/MIND/` — test: verificação PASS

## Cobertura das tarefas

Toda UNIT tem tarefas; cada tarefa nomeia FR/NFR e teste. As NFR estão nas Definition of Done: NFR-1, 2, 5, 6 e 8 (UNIT-1), NFR-3 e 7 (UNIT-2 e 3), NFR-4 (UNIT-4), NFR-9 (todas).
