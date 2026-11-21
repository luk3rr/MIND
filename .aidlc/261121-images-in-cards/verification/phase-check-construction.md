# Verificação de fase — Construction (images-in-cards)

Data: 2026-11-21 · Veredito: **PASS com uma ressalva aceitável** (UNIT-7 pulada por dependência externa)

## 1. Inventário

| Artefato | Situação |
|---|---|
| Código e testes das UNIT-1 a UNIT-6 | ✓ (ver `tasks.md`, resumo por Unit) |
| `construction/build-and-test.md` (3.6) | ✓ com a matriz requisito → teste |
| `construction/ci-pipeline.md` (3.7) | ✓ (pipeline existente cobre tudo, sem alteração) |
| `design.md § 3` (nota da UNIT-1 e desvios nos resumos) | ✓ |
| UNIT-7 | [S]: depende da import-exam-questions (Construção pendente) |

## 2. Unit → código → testes → resultado

| Unit | Código principal | Testes | Resultado |
|---|---|---|---|
| UNIT-1 | `src/core/images/*`, migração `0008`, `image:put/get`, `ImageField` | `probe`, `service`, `image-handlers`, `images.test.tsx`, e2e | verde |
| UNIT-2 | `refs`, `validate`, `review`, `practice`, `notebook`, editores e telas | `item-images`, `images-screens`, e2e (questão) | verde |
| UNIT-3 | `images/transform`, `canvas`, `ImageEditorDialog`, `Lightbox` | `transform`, `canvas`, `images-editor`, e2e | verde |
| UNIT-4 | `sweep`, `stats`, `reindex`, `ImageStorage` | `sweep`, `images-storage`, e2e (backup) | verde |
| UNIT-5 | `renderRegion`, `reader:cropRegion`, `CropOverlay`, `CropPanel`, `AttachToItem` | `reader.test`, `reader-crop`, e2e (mouse real) | verde |
| UNIT-6 | `bundle.ts`, colunas `imagem_*`, `prepare`/`commit`, `ImportPanel` | `import-bundle`, `import-zip`, e2e (zip real) | verde |

Última execução completa: lint, format:check, typecheck exit 0; `pnpm test --coverage` exit 0 (153 arquivos, 1621 testes, linhas 95,89%, ramos 87,09%); `xvfb-run -a pnpm e2e` exit 0 (68 passaram, 1 pulado). Também passaram contra o app **empacotado** (`pnpm package:dir`, `MIND_E2E_EXECUTABLE`): `images.spec.ts` e `reader.spec.ts` (15 testes).

## 3. Cobertura das NFR

NFR-1 a NFR-9 têm desenho (ADR de 2.6) e teste (matriz em `build-and-test.md`). NFR-8 (licença e empacotamento): sem dependência de produção nova e o app empacotado roda os fluxos de imagem.

## 4. Consistência

- Os contratos do código batem com `design.md § 2.8`, com os desvios registrados: `image:probe` dispensado (o aviso de arquivo grande vai em `image:put`, com `token` de uso único para o diálogo); `images` opcional (não obrigatório) nas saídas de `itemInfo` e `study:next`; `commit` do import síncrono com `prepare` assíncrono antes.
- `CONTRACT_VERSION` continua 2 (tudo aditivo).
- A migração usa `0008_item_images`; a import-exam-questions, quando construída, precisa do próximo número livre (registrado em `ci-pipeline.md` e em `build-and-test.md`).
- Desvios de interface em relação aos mockups: editor de imagem aberto pelo botão "Editar" de cada imagem; corte por controles deslizantes; ampliação por botão ao lado da imagem; botão "＋ Imagem" depois do campo (um Tab a mais por campo); sem ampliação nas alternativas dentro do botão de rádio da Prática.

## 5. Ressalvas e riscos aceitos

- **FR-16 e US-7 (figuras de provas) não foram entregues**: dependem da import-exam-questions. `tasks.md`, `state.md` e o backlog (BL-12) registram a pendência; não há código morto nem esqueleto.
- Os commits não foram feitos (a pessoa não pediu; M-7 manda commits atômicos por Unit, sem `git push`).
- Medições manuais não feitas: NFR-3 (abrir um item com 10 imagens de 5 MP em até 1 s) foi garantido pelo desenho (carga só perto da tela), sem cronômetro.
