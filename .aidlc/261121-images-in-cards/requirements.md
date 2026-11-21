# Requisitos — images-in-cards

## Original request

> Como poderíamos permitir que imagens fizessem parte de cards e questões?

(Pedido original, literal, via `/ai-dlc` em 2026-11-21.)

## 1.1 Intent & stakeholders

**Intenção, em termos de produto.** Hoje um card ou questão do MIND é só texto. Quando a pergunta depende de uma figura (gráfico, esquema, figura de prova), o item perde o sentido. O estudante quer que **imagens façam parte do item**: no enunciado ou frente, no verso ou explicação e nas alternativas, e que elas apareçam em todo lugar onde o item aparece (revisão, estudo, prática, caderno de erros, backup). [src: Original request]

**Problema que pesa mais.** Material visual perdido: provas e apostilas dependem de figuras, e sem elas a questão criada, importada ou transcrita fica incompleta. Memorizar imagens como objeto de estudo (oclusão de imagem) não é o foco desta intent. [src: Q3 de 1.1]

**Usuários.** O estudante, único usuário do app (desktop, local). [src: 261119-generation-relevance § 1.1]

**Origens das imagens (em escopo).** [src: Q1 de 1.1]
- Anexar à mão ao criar ou editar um item: colar da área de transferência, arrastar ou escolher arquivo.
- Recorte de uma região da página no leitor de PDF.
- Figuras de questões importadas de provas (a intent import-exam-questions ainda está em Construction; esta intent decide como ela se encaixa).

**Posições no item (em escopo).** Frente ou enunciado, verso ou explicação, e alternativas de questão. [src: Q2 de 1.1]

**Fora do que foi escolhido (a confirmar em 1.4).** Imagens geradas pelo modelo a partir do material; oclusão de imagem como novo tipo de card.

**Partes interessadas.**

| Papel | Quem | O que quer |
|---|---|---|
| Decide | o autor do app (também estudante) | figuras nos itens sem complicar o fluxo atual |
| Afetado | o estudante | ver a figura onde a pergunta a pede, em qualquer tela |
| Consultado | — | sem outras partes (app local, uso individual) |

**Critério de sucesso.** Fluxo ponta a ponta no Electron real: criar um item com imagem, vê-la ao estudar, praticar e revisar, fazer backup e restaurar com a imagem intacta. Cada fluxo ganha spec e2e. [src: Q4 de 1.1; mem: M-14, M-15]

**Restrições de partida.** Dados do usuário ficam fora da instalação (M-10); sem porta de rede e IPC tipado com zod (M-9); dependências com licença compatível com AGPL (M-6); código em inglês e textos de tela em pt-BR (M-8); itens gerados pelo modelo citam fonte (M-13).

### Assumptions & open questions
- A1 (1.1): imagens ficam em arquivos na pasta do workspace (como os materiais) e o item guarda só a referência; o backup já leva `files/` — confirmed: no
- A2 (1.1): o modelo de geração continua só texto; imagens não entram em prompts nem são geradas — confirmed: no
- A3 (1.1): a importação de planilha fica sem imagens — revista em 1.4: agora leva imagens via .zip; a exportação para arquivo continua fora
- Aberta: formato do conteúdo do item (hoje texto simples ou Markdown?) e como a imagem se referencia nele; tratar em 2.1/2.6.
- Aberta: como a importação de provas (BL-7) extrai e associa as figuras a cada questão; tratar em 1.3/1.4.

## 1.3 Feasibility, constraints & RAID

**Avaliação: viável, risco baixo a moderado.** O app já tem quase tudo o que a imagem precisa: [src: codebase]
- **Exibição.** A CSP já permite `img-src 'self' data:` (`src/main/security.ts`). Todo texto de item passa por `MathText` em seis telas (Revisão, Estudo, Prática, Chat, FeedbackList e a tela de erros), então há poucos pontos de renderização a estender. [src: src/main/security.ts; src/renderer/src/MathText.tsx]
- **Armazenamento.** Materiais já ficam em `workspaces/<uuid>/files/…` com caminho relativo, e o backup `.zip` já leva `files/` (`archive.ts`). Imagens de item podem seguir o mesmo padrão sem novo mecanismo de backup. [src: .aidlc/codekb/MIND/data-model.md]
- **Recorte do PDF.** O leitor já renderiza páginas em PNG com mupdf (`pdf-reader.ts`) e já tem seleção de texto por glifos; recortar uma região é renderizar a página numa escala e cortar o retângulo. [src: src/core/reader/pdf-reader.ts]
- **Figuras de provas.** O mupdf extrai texto por blocos e a página pode ser renderizada; a associação figura↔questão é o ponto mais incerto (R-4). [src: src/core/ingestion/pdf.ts]

**O que é novo.**
- O conteúdo do item hoje é texto simples (`front`/`back`, `statement`, `options[].text`/`why`, `explanation`) validado por `payloadProblem` e `draftProblem`. É preciso um jeito de referenciar imagens dentro desses campos sem quebrar o que existe (decisão de design em 2.6).
- Entrada de arquivo, colagem e arrastar no renderer, com leitura segura pelo núcleo via IPC.
- Seleção de região no leitor.
- Impacto em verificação de fonte (`quote`), importação de planilha, caderno de erros, exclusão de item e de material (arquivos órfãos), backup e restauração.

**Registro de restrições.**

| ID | Restrição | Origem |
|---|---|---|
| C-1 | Sem porta de rede; imagens vêm só de arquivo local, colagem ou recorte; sem URL | M-9, Q2 de 1.3 |
| C-2 | Só imagens raster (PNG, JPEG, WebP, GIF); SVG fica fora | Q2 de 1.3 |
| C-3 | Arquivos de imagem ficam dentro da pasta do workspace; instalar, atualizar ou remover o pacote nunca os apaga | M-10 |
| C-4 | Dependências novas com licença compatível com AGPL | M-6 |
| C-5 | Imagem com texto alternativo opcional; o item continua legível sem a imagem | boa prática; confirmar em 2.3 |
| C-6 | A geração por modelo continua só texto; nenhum conteúdo de imagem vai ao provedor nesta intent | A2 de 1.1 |
| C-7 | Sem limite prático de tamanho por imagem (o original é guardado como veio) | Q1 de 1.3 |
| C-8 | Specs e2e no Electron real para anexar, recortar, estudar/praticar e fazer backup com imagem | M-14, M-15 |

**RAID.**

| Tipo | ID | Item | Mitigação |
|---|---|---|---|
| Risco | R-1 | Sem limite, o backup e a pasta do workspace podem crescer muito (foto de celular, GIF animado) | Mostrar o tamanho ao anexar e o peso total das imagens nas Configurações; decidir em 2.3 um teto de segurança contra arquivos absurdos |
| Risco | R-2 | Arquivo malformado ou gigante em pixels (bomba de descompressão) trava o renderer | Validar o tipo pelo conteúdo (assinatura), não pela extensão; recusar dimensões absurdas; decodificar só ao exibir |
| Risco | R-3 | Arquivos órfãos: item excluído ou editado, ou material removido, deixa imagens sem uso | Contagem de referências e limpeza ao excluir; varredura periódica |
| Risco | R-4 | Associar figura à questão na importação de provas pode errar (figura de outra questão, cortada entre páginas) | Tratar como rascunho revisável, mostrar a figura na revisão; abordagem em 2.6 |
| Risco | R-5 | O conteúdo da imagem não existe no texto do PDF e quebraria o `quote` e a checagem de fonte | A imagem nunca entra na verificação; só o texto de entorno é verificado (M-13) |
| Risco | R-6 | A intent import-exam-questions ainda está em Construction; mudar o contrato de itens agora pode colidir | Sequenciar depois dela, ou desenhar o contrato de imagem como extensão aditiva (1.4/2.7) |
| Suposição | A-1 | O formato de referência no texto será estável e migrável | ADR em 2.6 |
| Dependência | D-1 | Importação de provas (BL-7) para a origem "figuras de provas" | 1.4 decide se entra no MVP |
| Questão | I-1 | Como evitar que a figura da frente do card entregue a resposta (legenda dentro da imagem) | Decisão de UX em 1.6 |

**Recomendação: GO.** Mudança aditiva, sem tocar na geração, que reaproveita armazenamento, backup, renderização e CSP; os riscos R-1 a R-4 têm mitigação definida.

### Assumptions & open questions
- A4 (1.3): o formato do arquivo é decidido pelo conteúdo (assinatura); a extensão é só dica — confirmed: no
- A5 (1.3): sem limite prático significa preservar o original, mas um teto de segurança contra arquivos absurdos (R-1, R-2) entra em 2.3 — confirmed: no
- Aberta: GIF animado vale como imagem estática ou animada? (2.3)
- Aberta: a importação de planilha (CSV/XLSX) leva imagens? (1.4, A3 de 1.1)

## 1.4 Scope

**Dentro do escopo.**
- **Anexar imagem à mão** ao criar ou editar um card ou questão: colar da área de transferência, arrastar ou escolher arquivo (PNG, JPEG, WebP, GIF). [src: Q1 de 1.1; C-2]
- **Posições:** frente do card, verso, enunciado da questão, cada alternativa e a explicação. [src: Q2 de 1.1]
- **Recortar e girar ao anexar:** editor simples (cortar bordas, girar 90°) antes de salvar; o original não é alterado em disco quando o estudante não edita. [src: Q3 de 1.4]
- **Texto alternativo ou legenda** opcional por imagem. [src: Q3 de 1.4; C-5]
- **Ampliar ao clicar** na imagem durante estudo, prática e revisão. [src: Q3 de 1.4]
- **Recorte do PDF no leitor:** selecionar uma região da página e criar o item (ou anexar a um item existente) com a imagem. [src: Q1 de 1.1]
- **Exibição em todas as telas** que mostram item: Revisão, Estudo, Prática, Chat, FeedbackList e tela de erros. [src: 1.3]
- **Ciclo de vida:** excluir item, editar campo ou remover material não deixa arquivos órfãos; backup e restauração levam as imagens. [src: R-3; M-10]
- **Planilha com imagens** (CSV/XLSX em `.zip`, por nome de arquivo): a importação manual existente passa a aceitar imagens. [src: Q3 de 1.4; A3 de 1.1 (revista)]
- **Figuras de questões importadas de provas** (UNIT final, depende da intent import-exam-questions concluída): a importação sugere a região da página da questão como figura; a revisão mostra, troca, recorta ou remove. [src: Q1 e Q2 de 1.4; R-4, R-6]
- **Segurança de entrada:** validação por assinatura, teto de segurança contra arquivos absurdos e dimensões em pixels (valores em 2.3). [src: R-1, R-2]
- Specs e2e no Electron real para cada fluxo. [mem: M-14, M-15]

**Fora do escopo.**
- Imagens geradas pelo modelo ou escolhidas por ele a partir do material; o conteúdo da imagem não vai ao provedor (C-6). [src: Q4 de 1.4]
- Oclusão de imagem como novo tipo de card. [src: Q4 de 1.4]
- SVG, imagens por URL, vídeo e áudio (C-1, C-2).
- Ler texto de dentro da imagem (OCR) para busca ou verificação de fonte (R-5).
- Reprocessar provas já importadas sem ação do estudante.
- Exportar itens com imagens para arquivo (BL-10 continua aberto).

**Limite do MVP.** O estudante cola ou recorta uma figura do PDF, a coloca na frente, no verso ou numa alternativa, estuda e pratica vendo a imagem, e faz backup e restauração sem perdê-la; a importação de provas liga as figuras na última UNIT.

**Dependências de sequência.** A UNIT das figuras de provas só começa com a import-exam-questions concluída; as demais UNITs não dependem dela e podem andar em paralelo à Construction dela se os contratos de item forem aditivos (R-6). [src: Q1 de 1.4]

**Backlog.** Entram em `.aidlc/backlog.md`: BL-13 (modelo escolhe e usa figuras do material na geração) e BL-14 (oclusão de imagem). [mem: M-16]

### Assumptions & open questions
- A6 (1.4): o editor de imagem é só cortar e girar; sem desenho, setas nem texto sobre a imagem — confirmed: no
- A7 (1.4): na planilha com imagens, uma coluna traz o nome do arquivo, e o `.zip` traz as imagens ao lado das planilhas já aceitas — confirmed: no
- A8 (1.4): a região sugerida para a figura de prova vem dos blocos de imagem do PDF (mupdf); sem bloco de imagem, o item entra sem figura — confirmed: no

## 2.3 Requirements

### Functional

Prioridade em MoSCoW. "Campo de imagem" = frente, verso, enunciado, cada alternativa e explicação.

| ID | Requisito | Justificativa | Critério de aceite | Prio. | Fonte |
|---|---|---|---|---|---|
| FR-1 | O sistema deve permitir anexar imagem PNG, JPEG, WebP ou GIF a qualquer campo de imagem ao criar ou editar um card ou uma questão, por botão "＋ Imagem" (seletor de arquivo), colar (Ctrl+V) ou arrastar | Núcleo do pedido | Dado o editor aberto, quando o estudante cola uma imagem no campo, então a miniatura aparece no campo e o item salvo a guarda | Must | [src: 1.1; 1.4] |
| FR-2 | O sistema deve aceitar um número ilimitado de imagens por campo, na ordem em que foram anexadas, e permitir reordenar e remover | Q2 de 2.3 | Dado um campo com 3 imagens, quando o estudante remove a segunda, então restam duas, na ordem original | Must | [src: Q2 de 2.3] |
| FR-3 | Uma alternativa de questão e o verso de um card podem ter só imagem; o texto deixa de ser obrigatório se houver ao menos uma imagem no campo (o motivo da alternativa segue obrigatório) | Alternativas de gráficos e estruturas | Dada uma alternativa só com imagem e o motivo preenchido, quando o estudante salva, então a questão é aceita | Must | [src: 1.1] |
| FR-4 | O sistema deve validar o tipo da imagem pelo conteúdo (assinatura), não pela extensão, e recusar SVG e qualquer outro formato com mensagem clara | C-2, R-2 | Dado um `.svg` ou um `.png` com conteúdo de texto, quando o estudante anexa, então recebe "não é aceito" ou "arquivo ilegível" e nada é gravado | Must | [src: C-2; R-2] |
| FR-5 | O sistema deve avisar quando a imagem passar de 20 MB (com a opção de anexar mesmo assim) e recusar acima de 100 MB ou 100 megapixels | Q1 de 2.3; R-1, R-2 | Dado um arquivo de 30 MB, então aparece o aviso e é possível seguir; dado um de 120 MB, então é recusado | Must | [src: Q1 de 2.3] |
| FR-6 | O sistema deve guardar o arquivo original dentro da pasta do workspace, com nome derivado do conteúdo (a mesma imagem anexada duas vezes ocupa um arquivo só) | C-3, C-7 | Dadas duas anexações da mesma imagem, então existe um único arquivo no disco e as duas referências o usam | Must | [src: C-3; C-7] |
| FR-7 | O editor de imagem deve permitir cortar bordas e girar 90° antes de salvar; o original fica preservado e o item usa a versão ajustada | Q3 de 1.4 | Dada uma imagem cortada, então o item mostra o recorte e o original continua existindo no workspace | Should | [src: 1.4] |
| FR-8 | O estudante pode informar um texto alternativo ou legenda opcional por imagem, usado como descrição acessível e mostrado quando a imagem não carrega | C-5, Q4 de 2.3 | Dada uma imagem com legenda, então o elemento exibido tem o texto alternativo e, se o arquivo faltar, o aviso mostra a legenda | Should | [src: C-5; Q4 de 2.3] |
| FR-9 | O sistema deve exibir as imagens do item em Revisão, Estudo, Prática, Chat, feedback e tela de erros, nos mesmos campos em que foram anexadas; GIF anima e transparência é preservada | Valor do pedido | Dado um item com imagem no enunciado e numa alternativa, então ambas aparecem em Prática e Revisão | Must | [src: 1.1; Q3 de 2.3] |
| FR-10 | Clicar numa imagem em estudo, prática ou revisão deve ampliá-la numa sobreposição, fechada por Esc, clique fora ou botão | Q3 de 1.4 | Dado o clique, então a imagem aparece maior e Esc a fecha | Should | [src: 1.4] |
| FR-11 | Quando o arquivo de uma imagem referenciada não existir ou não puder ser lido, o item continua utilizável e mostra um aviso no lugar da imagem, com a ação "Substituir" na edição | Backup parcial, remoção manual | Dado um arquivo removido do disco, então Estudo exibe o aviso e o item segue respondível | Must | [src: R-3] |
| FR-12 | O leitor de PDF deve ter o modo "Recortar figura": arrastar sobre a página seleciona uma região, renderizada em alta resolução (200 dpi), que pode virar um card novo, uma questão nova ou ser anexada a um item existente | Q1 de 1.1 | Dada uma região selecionada na página 12, quando o estudante escolhe "Novo card", então o editor abre com a imagem anexada à frente | Must | [src: 1.1; 1.4] |
| FR-13 | Ao excluir um item, editar um campo removendo a imagem ou remover um material, o sistema deve apagar os arquivos de imagem que nenhum item usa mais | R-3, C-3 | Dada a exclusão do único item que usa uma imagem, então o arquivo some do disco; dada outra referência, o arquivo permanece | Must | [src: R-3] |
| FR-14 | O backup e a restauração do workspace devem incluir as imagens dos itens; um workspace restaurado mostra os mesmos itens com as mesmas imagens | Q4 de 1.1 | Dado um backup feito com 3 itens com imagem, quando restaurado, então os 3 mostram as imagens | Must | [src: 1.1] |
| FR-15 | A importação de planilha deve aceitar um `.zip` com a planilha e as imagens, com colunas de imagem por campo (`imagem_frente`, `imagem_verso`, `imagem_enunciado`, `imagem_a`..`imagem_e`, `imagem_explicacao`), referindo o nome do arquivo no zip; linha que cita imagem ausente entra sem imagem e com aviso | Q3 de 1.4 | Dado um zip com 18 imagens e 24 linhas, quando importado, então 18 imagens foram ligadas e as linhas com imagem faltando são avisadas | Should | [src: 1.4] |
| FR-16 | A importação de questões de provas deve sugerir, para cada questão que cita figura, a região da página como imagem do enunciado; a revisão mostra a figura e permite trocar, recortar do PDF ou remover; sem figura achada, aparece o aviso e o atalho de recorte | Q1 e Q2 de 1.4 | Dada uma questão da página 12 com figura, então o rascunho entra com a imagem sugerida e a revisão a mostra | Should | [src: 1.4] |
| FR-17 | As Configurações devem mostrar o número e o peso total das imagens dos itens e permitir limpar as imagens sem uso | R-1, R-3 | Dadas 9 imagens sem uso, então o aviso mostra a contagem e "Limpar agora" as remove | Could | [src: 1.3] |
| FR-18 | A geração de itens por modelo, a verificação de fonte (`quote`) e qualquer envio ao provedor ignoram imagens; nada de imagem sai do computador | C-6, R-5 | Dado um item com imagem, quando enviado ao chat do modelo, então só o texto vai e a imagem não | Must | [src: C-6; R-5] |
| FR-19 | O editor deve avisar que a imagem da frente não deve trazer a resposta escrita | I-1 | O aviso aparece ao anexar uma imagem à frente do card ou ao enunciado | Could | [src: 1.3] |

### Non-functional

| ID | Categoria | Requisito | Medida | Fonte |
|---|---|---|---|---|
| NFR-1 | Segurança | Imagens só vêm de arquivo local, colagem ou recorte; nenhuma URL é aberta; o núcleo lê o arquivo, o renderer recebe só um data URL ou bytes validados; sem novo protocolo nem mudança na CSP | Testes do contrato IPC e do `security.ts` (CSP inalterada) | [mem: M-9]; C-1 |
| NFR-2 | Robustez | Arquivo malformado, truncado, com cabeçalho falso ou com dimensões absurdas é recusado sem travar o app; decodificar só ao exibir | Fixtures corrompida e enorme em pixels (Q2 de 2.2) | R-2 |
| NFR-3 | Desempenho | Abrir um item com até 10 imagens de 5 MP mostra o texto na hora e as imagens em até 1 s numa máquina comum; a lista da revisão não carrega imagens em tamanho original (miniaturas ou carga sob demanda) | Teste manual cronometrado e teste de carga preguiçosa | R-1 |
| NFR-4 | Integridade | Nenhum arquivo é apagado enquanto um item o referencia; nenhuma referência aponta para arquivo inexistente após uma operação normal; a limpeza é idempotente | Testes de contagem de referências com excluir/editar/restaurar | R-3 |
| NFR-5 | Compatibilidade de dados | Migração aditiva, colunas anuláveis; itens antigos (payload sem imagem) abrem e funcionam; `payload_version` e backups antigos migram ao importar | Teste de migração de um banco da v0.9.0 e de um backup antigo | [mem: M-10] |
| NFR-6 | Privacidade | Nada é registrado em log além de contagens e tamanhos; nome de arquivo do estudante não vai a log nem a provedor | Teste de redação de logs | [mem: M-2] |
| NFR-7 | Acessibilidade | Imagens têm `alt` (legenda ou "imagem do item"); a ampliação funciona por teclado (Enter abre, Esc fecha); contraste dos controles nos dois temas | Testes de componente e e2e | C-5 |
| NFR-8 | Licença e empacotamento | Dependência nova só com licença compatível com AGPL e sem quebrar o `.deb`; preferir APIs já presentes | ADR e `pnpm package` | [mem: M-6]; Q2 de 2.2 |
| NFR-9 | Testabilidade | Cada fluxo novo (anexar, cortar, recortar do PDF, estudar/praticar com imagem, backup, planilha em zip) tem spec e2e no Electron real; cobertura mínima de 80% | CI e verificação aprovada | [mem: M-14, M-15] |

### Restrições, fora de escopo e glossário
- Restrições: C-1 a C-8 de 1.3. Fora de escopo: ver 1.4.
- **Campo de imagem**: posição do item que aceita imagens. **Recorte do PDF**: região da página renderizada como imagem. **Figura sugerida**: imagem proposta pela importação de provas.

### Assumptions & open questions
- A15 (2.3): "ilimitado" por campo vale na regra; a interface pode rolar e o contrato aceita um número prático de itens (ex.: 200 por campo) só para defender o app de payload absurdo — confirmed: no
- A16 (2.3): o aviso de 20 MB e o teto de 100 MB/100 MP valem por arquivo, não por item — confirmed: no
- A17 (2.3): cortar e girar um GIF animado usa só o primeiro quadro, com aviso; o original animado continua guardado — confirmed: no
- A18 (2.3): "Substituir" troca o arquivo mantendo a posição e a legenda — confirmed: no

## 2.4 User stories

**Persona.** *Estudante*: único usuário do app desktop, estuda por cards e questões, monta o próprio material e usa PDFs de provas e apostilas com figuras. [src: 1.1]

| ID | História | Critérios de aceite (Dado/Quando/Então) | FR | Notas (UX, dev, teste) |
|---|---|---|---|---|
| US-1 | Como estudante, quero anexar imagens a um card ou questão (colar, arrastar ou escolher arquivo), para que a pergunta traga a figura de que depende | Dado o editor aberto, quando colo uma imagem no enunciado, então a miniatura aparece. Dado um arquivo `.svg` ou corrompido, quando anexo, então vejo a recusa e nada é gravado. Dado um arquivo de 30 MB, quando anexo, então vejo o aviso e posso seguir. Dada uma alternativa só com imagem e motivo preenchido, quando salvo, então a questão é aceita | FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-8, FR-19 | UX: mockup "Editor de card/questão". Dev: leitura no núcleo. Teste: fixtures de PNG, JPEG, GIF, WebP, corrompida e enorme em pixels |
| US-2 | Como estudante, quero cortar bordas e girar a imagem ao anexar, para tirar o excesso de uma captura de tela | Dada uma captura com margem, quando corto e uso a imagem, então o item mostra o recorte e o original continua guardado | FR-7 | Teste: unidade da transformação e e2e do diálogo |
| US-3 | Como estudante, quero ver as imagens do item ao estudar, praticar e revisar, e ampliá-las, para resolver a questão com a figura | Dado um item com imagem no enunciado e numa alternativa, quando pratico, então ambas aparecem. Dado clique na imagem, então ela amplia e Esc fecha. Dado arquivo ausente, então o item segue respondível com um aviso. Dado o chat com o modelo, então a imagem não é enviada | FR-9, FR-10, FR-11, FR-18 | UX: ampliar e estado ausente. Teste: componente e e2e em Estudo e Prática |
| US-4 | Como estudante, quero recortar uma figura do PDF no leitor e transformá-la em item, para não precisar de captura de tela | Dada uma região na página 12, quando escolho "Novo card", então o editor abre com a imagem à frente. Dado "Anexar a um item…", então a imagem entra no campo escolhido | FR-12 | Teste: e2e no Electron real (seleção por arrasto; M-14) |
| US-5 | Como estudante, quero que as imagens acompanhem o backup e que arquivos sem uso sejam limpos, para não perder figuras nem encher o disco | Dado um backup com 3 itens com imagem, quando restauro, então as imagens aparecem. Dada a exclusão do único item que usa uma imagem, então o arquivo some. Dadas 9 imagens sem uso, então as Configurações mostram a contagem e o botão as limpa | FR-13, FR-14, FR-17 | Teste: restauração e contagem de referências; e2e do backup |
| US-6 | Como estudante, quero importar uma planilha com imagens em `.zip`, para trazer vários itens com figuras de uma vez | Dado um zip com 24 linhas e 18 imagens, quando importo, então 18 imagens são ligadas. Dada uma linha que cita imagem ausente, então ela entra sem imagem e é avisada | FR-15 | Dev: reaproveita `summarizeZip` e seus limites |
| US-7 | Como estudante, quero que as questões importadas de provas venham com a figura sugerida, para revisar com a imagem certa | Dada uma questão da página 12 com figura, então o rascunho tem a imagem e a revisão a mostra. Dada a figura errada, então posso trocar, recortar do PDF ou remover. Sem figura achada, então vejo o aviso e o atalho | FR-16 | Depende da intent import-exam-questions concluída |

**Cobertura.** FR-1..FR-19 aparecem em US-1..US-7 (FR-9 a FR-11 e FR-18 em US-3; FR-13, FR-14 e FR-17 em US-5); toda história liga a ≥1 FR. As NFR (1..9) são tratadas em 2.7 como Definition of Done das Units. [src: 2.3]

### Assumptions & open questions
- A19 (2.4): o editor de card e o de questão são os mesmos usados pela criação manual, pelo leitor e pela edição na revisão; "＋ Imagem" aparece em todos — confirmed: no
