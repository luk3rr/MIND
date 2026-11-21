# Build and test — images-in-cards

## Baseline (2026-11-21, HEAD fe5170d, antes de qualquer código desta intent)

| Comando | Exit |
|---|---|
| `pnpm lint` | 0 |
| `pnpm format:check` | 0 |
| `pnpm typecheck` | 0 |
| `pnpm test --coverage` | 0 (linhas 96,23%, ramos 87,36%, funções 94,68%) |
| `xvfb-run -a pnpm e2e` | não medido (será rodado ao fechar a UNIT-1) |

Nota: a primeira execução do baseline foi disparada duas vezes em paralelo por engano; a segunda terminou com exit 254 por colisão de processos na mesma pasta de cobertura. O resultado válido é o da execução isolada, exit 0.

## UNIT-1 (2026-11-21)

| Comando | Exit |
|---|---|
| `pnpm lint` / `format:check` / `typecheck` | 0 / 0 / 0 |
| `pnpm test --coverage` | 0 (143 arquivos, 1548 testes; linhas 96,07%, ramos 87,22%, funções 94,56%) |
| `xvfb-run -a pnpm e2e` | 0 (63 passaram, 1 pulado) |

## UNIT-2 (2026-11-21)

| Comando | Exit |
|---|---|
| `pnpm lint` / `format:check` / `typecheck` | 0 / 0 / 0 |
| `pnpm test --coverage` | 0 (145 arquivos, 1564 testes; linhas 96,01%, ramos 87,21%) |
| `xvfb-run -a pnpm e2e` | 0 (64 passaram, 1 pulado) |

## UNIT-3 (2026-11-21)

| Comando | Exit |
|---|---|
| `pnpm lint` / `format:check` / `typecheck` | 0 / 0 / 0 |
| `pnpm test --coverage` | 0 (148 arquivos, 1582 testes; linhas 96,02%, ramos 87,26%) |
| `xvfb-run -a pnpm e2e` | 0 (65 passaram, 1 pulado) |

## UNIT-4 (2026-11-21)

| Comando | Exit |
|---|---|
| `pnpm lint` / `format:check` / `typecheck` | 0 / 0 / 0 |
| `pnpm test --coverage` | 0 (150 arquivos, 1596 testes; linhas 96,02%, ramos 87,24%) |
| `xvfb-run -a pnpm e2e` | 0 (66 passaram, 1 pulado) |

## UNIT-5 (2026-11-21)

| Comando | Exit |
|---|---|
| `pnpm lint` / `format:check` / `typecheck` | 0 / 0 / 0 |
| `pnpm test --coverage` | 0 (151 arquivos, 1608 testes; linhas 95,89%, ramos 87,17%) |
| `xvfb-run -a pnpm e2e` | 0 (67 passaram, 1 pulado) — a primeira rodada falhou em 4 specs do leitor por causa do botão de recorte; corrigido e repetido |

## UNIT-6 (2026-11-21)

| Comando | Exit |
|---|---|
| `pnpm lint` / `format:check` / `typecheck` | 0 / 0 / 0 |
| `pnpm test --coverage` | 0 (153 arquivos, 1621 testes; linhas 95,89%, ramos 87,09%) |
| `xvfb-run -a pnpm e2e` | 0 (68 passaram, 1 pulado) |

## 3.6 Build and Test (2026-11-21)

**Comando aprovado, última execução completa (após a UNIT-6).**

| Comando | Exit | Resultado |
|---|---|---|
| `pnpm lint` | 0 | cabeçalhos ok; sem erros |
| `pnpm format:check` | 0 | |
| `pnpm typecheck` | 0 | núcleo, main, preload, renderer, ferramentas |
| `pnpm test --coverage` | 0 | 153 arquivos, 1621 testes; instruções 94,33%, ramos 87,09%, funções 94,28%, linhas 95,89% (limite 80%) |
| `xvfb-run -a pnpm e2e` | 0 | 68 passaram, 1 pulado (o pulado é anterior a esta intent) |

Baseline antes desta intent (2026-11-20): 139 arquivos e 1504 testes → hoje 153 arquivos e 1621 testes (+117) e 62 → 68 specs e2e que passam (+6, todos em `images.spec.ts`; `authoring.spec.ts` só foi ajustado).

**Matriz requisito → teste** (todos passam).

| Requisito | Testes principais |
|---|---|
| FR-1 anexar | `images.test.tsx` (botão, colar, arrastar), `image-handlers.test.ts`, e2e `images.spec.ts` (1) |
| FR-2 várias, ordem, remover | `images-screens.test.tsx` (mover, remover, substituir), `item-images.test.ts` (editar) |
| FR-3 campo só com imagem | `item-images.test.ts`, `images-screens.test.tsx`, e2e (2), `import-bundle.test.ts` |
| FR-4 tipo pelo conteúdo | `probe.test.ts`, `service.test.ts`, e2e (1) |
| FR-5 aviso >20 MB, teto | `service.test.ts`, `image-handlers.test.ts`, `images.test.tsx` |
| FR-6 um arquivo por hash | `service.test.ts` |
| FR-7 cortar e girar | `transform.test.ts`, `canvas.test.ts`, `images-editor.test.tsx`, e2e (3) |
| FR-8 legenda | `images-screens.test.tsx`, `images.test.tsx` |
| FR-9 exibição nas telas | `images.test.tsx` (Estudo), `images-screens.test.tsx` (Prática, Revisão), e2e |
| FR-10 ampliar | `images-editor.test.tsx`, e2e (3) |
| FR-11 arquivo ausente | `images.test.tsx`, `images-editor.test.tsx`, `service.test.ts` |
| FR-12 recorte do PDF | `reader.test.ts`, `reader-crop.test.tsx`, e2e (cuts a region) |
| FR-13 limpar sem uso | `sweep.test.ts`, e2e (backup) |
| FR-14 backup e restauração | `sweep.test.ts` (restauração), e2e (backup) |
| FR-15 planilha em zip | `import-bundle.test.ts`, `import-zip.test.tsx`, e2e (.zip) |
| FR-16 figuras de provas | **lacuna registrada**: UNIT-7 não executada (ver abaixo) |
| FR-17 armazenamento | `images-storage.test.tsx`, `sweep.test.ts` |
| FR-18 nada de imagem ao modelo | `item-images.test.ts` (assistente), `item-images.test.ts` (prática sem a explicação) |
| FR-19 dica contra resposta | `images-screens.test.tsx` |
| NFR-1 segurança | `image-handlers.test.ts` (caminho nunca vem da janela), `security.test.ts` (CSP inalterada), `import-bundle.test.ts` (`..`) |
| NFR-2 robustez | `probe.test.ts` (truncada, enorme em pixels), `service.test.ts`, `import-bundle.test.ts` |
| NFR-3 desempenho | carga só perto da tela (`ItemImageList`), e2e (a imagem só carrega ao rolar) |
| NFR-4 integridade | `sweep.test.ts` |
| NFR-5 compatibilidade | `db.test.ts` (migração de banco 0.9.0 populado), `reindex` (backup antigo) |
| NFR-6 privacidade | `service.test.ts` (log só com tamanhos) |
| NFR-7 acessibilidade | `images-editor.test.tsx` (teclado, foco), rótulos `alt` nas telas |
| NFR-8 licença/empacotamento | nenhuma dependência nova de produção; ver empacotamento abaixo |
| NFR-9 testabilidade | 6 fluxos e2e novos (anexar, giro e ampliar, questão com figura, backup, recorte do PDF, zip) |

**Notas de segurança.** Nenhuma dependência nova (`yauzl` e `yazl` já existiam; o decodificador de imagem é o do navegador). A CSP não mudou (`img-src 'self' data:`); o núcleo valida o tipo pelos bytes e devolve ao renderer só um data URL com o tipo verificado; o caminho de um arquivo escolhido nunca sai do processo principal (o renderer só recebe um token de uso único para confirmar um arquivo grande); o zip não grava nada em disco e recusa caminhos que saem dele; o conteúdo de imagem nunca vai ao provedor.

**Falhas encontradas durante a Construção (todas corrigidas):** o e2e completo da UNIT-5 pegou o botão de recorte, com texto, cobrindo o botão de rolagem contínua (4 specs do leitor); o foco do `Dialog` ia para um botão desabilitado; os specs de NFR-1 de teclado precisaram de um Tab a mais por campo.

**Lacunas conhecidas.** FR-16 (figuras de provas) depende da intent import-exam-questions, ainda em Construção: a UNIT-7 ficou `[S]` por esse motivo. A migração desta intent usa o número `0008`; a import-exam-questions, ao ser construída, deve gerar a sua com o próximo número livre (`0009`) e ajustar `db.test.ts`.
