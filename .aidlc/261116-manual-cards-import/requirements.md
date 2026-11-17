# Requisitos — manual-cards-import

## Original request

Quero permitir criar ou importar flashcards ou questões manualmente. A criação deve ser possível criar tanto sem referência ao meterial, como também durante a leitura do material selecionar um trecho do texto e pedir para gerar flashcards ou questões, com auxílio do modelo para elaborar/melhorar o texto. A importação deve ser possível a partir de templates de csv ou xlxs padronizados. As geradas manualmente também devem ser possíveis pedir o auxilio do modelo para melhorar/ajustar/corrigir o texto do card ou da questão.

## 1.1 Intent & stakeholders

**Intenção (em termos de produto).** Hoje todo flashcard e toda questão do MIND nasce da geração automática (tela Gerar) e passa pela fila de revisão. Esta feature dá ao estudante controle direto: criar itens à mão, criar itens a partir de um trecho que ele seleciona durante a leitura, importar itens prontos de planilhas e pedir ao modelo que elabore, melhore ou corrija o texto, sempre com decisão final do estudante. [src: Original request]

**Capacidades pedidas.**

1. Criar manualmente um flashcard ou uma questão, com ou sem referência a um material. [src: Original request; Q-M1]
2. No leitor, selecionar um trecho e pedir itens ao modelo, opcionalmente informando a quantidade e um assunto; sem instruções, o modelo decide quantidade e assuntos. O resultado abre como rascunho editável. [src: Original request; Q-leitor]
3. Importar flashcards e questões de templates CSV ou XLSX padronizados, com prévia e validação antes de salvar. [src: Original request; Q-import]
4. Em qualquer item criado à mão, pedir ao modelo para melhorar, ajustar ou corrigir o texto; o modelo propõe e o estudante aceita, edita ou descarta. [src: Original request; Q-llm]

**Decisões do gate de perguntas.**

- Itens manuais podem não ter fonte. A regra M-1 passa a valer só para itens gerados pelo modelo; a emenda será registrada no gate (proposta de memória). [src: Q-M1] [mem: M-1]
- O texto do modelo nunca é salvo sem aceite explícito, com comparação lado a lado. [src: Q-llm]
- A importação mostra prévia com linhas válidas e inválidas (com o motivo) e só salva após confirmação. [src: Q-import]
- Um template por tipo (cartões e questões), cada um em CSV e XLSX, disponível para download no app. [src: Q-templates]

**Medida de sucesso.** Do leitor ou da tela de itens, criar e salvar um cartão ou questão em menos de 1 minuto e poucos cliques, sem sair do fluxo de estudo. [src: Q-sucesso]

**Stakeholders.**

| Papel | Quem | Interesse |
|---|---|---|
| Decisor e usuário | Autor do MIND, estudante que usa o app | Define escopo, aprova gates, usa a feature no estudo diário |
| Afetado | Itens, fila de revisão, agendamento FSRS, estatísticas e backup do workspace | Itens manuais precisam conviver com os gerados |
| Consultado | Memória do projeto (M-1, M-4, M-6, M-9) | Restrições de fonte, zod, licença AGPL e IPC tipado |

**Não objetivos (a confirmar em 1.4).** Importar formatos de outros apps (Anki `.apkg`, Quizlet); exportar itens; edição colaborativa; geração automática em massa fora do que já existe.

### Assumptions & open questions

- ASSUMPTION A-1: o modelo usado para ajuda de texto é o mesmo provedor já configurado (OpenRouter), com o mesmo consentimento e custo registrados. [inferred: src/core/llm]
- ASSUMPTION A-2: itens manuais entram no agendamento FSRS e nas estatísticas como os demais. [inferred]
- Resolvida em 1.4: itens manuais e importados nascem aprovados e agendados. [src: Q-estado]

## 1.3 Feasibility & Constraints

**Avaliação.** Viável (GO). O núcleo já tem a tabela `item` com `origin`, `quote`, `chunk_id` e `edited`, validação com zod, IPC tipado, provedor de LLM com consentimento e custo, leitor de PDF com camada de texto selecionável e geração em lote. O trabalho é novo código sobre essas peças, sem mudar a arquitetura. [src: src/core/db/workspace-schema.ts; src/core/contracts/channels.ts; src/renderer/src/pages/ReaderPage.tsx]

**Pontos que exigem decisão de design (2.6).**

- `item.run_id` é obrigatório e aponta para `generation_run`; itens manuais não têm run. Opções: uma run sintética por origem ou tornar a coluna opcional (migração). [src: src/core/db/workspace-schema.ts:96]
- Leitura de XLSX exige uma biblioteca nova; CSV pode ser feito sem dependência. A biblioteca precisa ter licença compatível com AGPL e rodar no processo principal sem rede. [mem: M-6] [mem: M-9]
- Hoje o leitor só tem a camada de texto por página; é preciso mapear a seleção do usuário para um trecho de texto e para `chunk_id` e página. [src: ReaderPage.tsx]
- A verificação de fonte (`source-checker`) existe para itens gerados; para a seleção do leitor, o trecho é a própria seleção, então a citação é verificável por construção. [src: src/core/verification/source-checker.ts] [mem: M-1]

**Registro de restrições.**

| Tipo | Restrição | Fonte |
|---|---|---|
| Tecnologia | TypeScript strict, zod nas fronteiras, Electron + React | M-4 |
| Segurança | Sem porta de rede; renderer só por IPC tipado e validado | M-9 |
| Licença | Dependências compatíveis com AGPL-3.0 | M-6 |
| Dados | Dados do usuário fora da instalação; backup deve incluir itens manuais | M-10 |
| Privacidade | Texto enviado ao LLM só com consentimento já configurado; logs sem conteúdo | M-2 |
| Projeto | Textos da UI em pt-BR; código e commits em inglês | M-8 |

**RAID.**

| Tipo | Descrição | Mitigação |
|---|---|---|
| Risco | Importação de planilhas com conteúdo malicioso (fórmulas, arquivos enormes, zip bomb em XLSX) | Limites de tamanho e de linhas; ler só valores; nunca avaliar fórmulas |
| Risco | Seleção de texto no PDF imprecisa (colunas, hifenização) | Usuário edita o trecho e o rascunho antes de salvar |
| Risco | Custo de LLM por pedidos repetidos | Mostrar estimativa antes, usar o controle de custo existente |
| Premissa | Provedor de LLM configurado e com consentimento | A-1 |
| Dependência | Biblioteca XLSX aprovada em 2.6 | ADR |
| Problema | Esquema do banco assume `run_id` obrigatório | Decidir em 2.6 |

**Recomendação.** GO.

### Assumptions & open questions

- Nenhuma nova além das listadas.

## 1.4 Scope

**Dentro.**

- Criação manual na tela Itens: cartões (pergunta/resposta, cloze, comparar, verdadeiro/falso) e questões (certo/errado, múltipla escolha), com material e trecho opcionais. [src: Q-escopo]
- Geração no leitor a partir de um trecho selecionado: quantidade e assunto opcionais (sem instruções, o modelo decide), resultado como rascunho editável com o trecho como fonte. [src: Q-leitor]
- Importação de CSV e XLSX por templates padronizados (um para cartões, outro para questões), com download no app, prévia e validação. [src: Q-templates]
- Ajuda do modelo em itens manuais: melhorar, ajustar ou corrigir o texto, com proposta lado a lado. [src: Q-llm]
- Itens manuais e importados nascem aprovados e agendados (FSRS). [src: Q-estado]

**Fora (backlog).**

- Formatos de outros apps (Anki `.apkg`, Quizlet) e exportação de itens.
- Questões de cálculo com verificação aritmética em itens manuais (a verificação existe só na geração).
- Anexar imagens ou áudio a itens.
- Edição em lote de itens importados depois de salvos além do que a tela Itens já oferece.

**Fronteira do MVP.** As quatro capacidades acima, na ordem de prioridade: criação manual, leitor, importação (a ajuda do modelo acompanha a criação manual). Se for preciso cortar, a importação sai por último da fila de construção, mas é a primeira a ser adiada. [src: Q-prioridade]

**Backlog priorizado.**

| Prioridade | Item |
|---|---|
| 1 | Criação manual e ajuda do modelo |
| 2 | Geração a partir da seleção no leitor |
| 3 | Importação CSV e XLSX |
| 4 | Exportação, importação de outros formatos, questões de cálculo manuais |

### Assumptions & open questions

- Pergunta aberta (2.3): itens importados com `topic` novo criam o tópico automaticamente? [inferred]

## 2.3 Requirements

Prioridades em MoSCoW. Origem: `[src: Q-…]` são respostas deste intent; `[mem: M-n]` regras do projeto.

### Functional

| ID | Requisito | Critério de aceitação | Prioridade | Fonte |
|---|---|---|---|---|
| FR-1 | Criar um cartão manualmente nos subtipos pergunta/resposta, cloze, comparar e verdadeiro/falso, com frente, verso e tópico opcional. | Dado o editor aberto, quando o usuário preenche frente e verso e salva, então o cartão aparece na lista de itens e na fila de estudo; frente ou verso vazios impedem salvar com mensagem no campo. | Must | Original request |
| FR-2 | Criar uma questão manualmente nos subtipos certo/errado e múltipla escolha (2 a 5 alternativas, letras A a E), com enunciado, gabarito, explicação e, por alternativa, o motivo. | Dado o editor de questão, quando falta enunciado, gabarito ou alternativa, então não salva e mostra o campo; gabarito deve ser uma das alternativas (ou C/E). | Must | Original request |
| FR-3 | Itens criados à mão nascem `approved`, com `origin = "manual"`, e entram em estudo (cartões) e prática (questões) como os gerados. | Dado um item manual salvo, então `study:next` ou `practice:next` pode servi-lo e a avaliação grava `review_log` ou `attempt`. | Must | Q-estado |
| FR-4 | A fonte é opcional em itens manuais: material, página e trecho podem ser informados ou deixados vazios. A regra de fonte obrigatória continua só para itens gerados. | Dado um item sem fonte, então salva; "Ver no PDF" não aparece. Dado um item gerado sem fonte, continua descartado. | Must | Q-M1; [mem: M-1] |
| FR-5 | No leitor, ao selecionar texto, aparecem as ações "Gerar itens" e "Criar item" para o trecho. | Dado texto selecionado numa página, então a barra com as duas ações aparece perto da seleção e some ao limpar a seleção. | Must | Original request |
| FR-6 | "Criar item" abre o editor com o trecho, a página e o material já preenchidos como fonte. | Dado o clique, então o editor mostra a fonte e o trecho pode ser editado antes de salvar. | Must | Q-leitor |
| FR-7 | "Gerar itens" pede o tipo (cartões ou questões) e, opcionalmente, quantidade (1 a 20) e assunto (até 200 caracteres). Sem quantidade e assunto, o modelo decide ambos. O trecho tem até 8.000 caracteres. | Dado uma seleção maior que o limite, então o app orienta a selecionar menos; dado quantidade vazia, então o pedido não envia quantidade. | Must | Q-leitor; Q-limite-leitor |
| FR-8 | O resultado da geração do leitor abre como rascunhos editáveis, um a um, com o trecho selecionado como fonte; cada rascunho pode ser editado, descartado ou salvo (salvar = aprovado). | Dado N rascunhos, quando o usuário salva um, então ele vira item aprovado com `origin = "reader"` e o trecho citado confere com a seleção; descartar não grava item. | Must | Q-leitor |
| FR-9 | Antes de gerar no leitor, o app mostra a estimativa de custo e exige o consentimento já existente do provedor; sem provedor ou consentimento, orienta a ir às Configurações. | Dado provedor ausente, então o botão explica e leva às Configurações; criação manual continua funcionando. | Must | A-1; [mem: M-2] |
| FR-10 | No editor, "Melhorar com IA" oferece três ações: melhorar, corrigir (ortografia e erros) e ajustar (com instrução livre de até 500 caracteres). | Dado texto preenchido, quando o usuário escolhe a ação, então o modelo é chamado só com o texto do item (e o trecho-fonte, se houver). | Must | Q-llm |
| FR-11 | A resposta do modelo é uma proposta mostrada lado a lado com o original; o usuário aceita (campo a campo ou tudo), edita ou descarta; nada é gravado sem aceite. | Dado uma proposta, quando o usuário descarta, então o item fica exatamente como estava; aceitar só altera o formulário até o usuário salvar. | Must | Q-llm |
| FR-12 | Em questões, a proposta do modelo inclui alternativas e gabarito e é validada (gabarito entre as alternativas, quantidade de alternativas, campos preenchidos) antes de ser mostrada. | Dado resposta inválida do modelo, então o app mostra erro e tenta uma vez de novo ou oferece tentar de novo, sem alterar o formulário. | Must | Q-llm |
| FR-13 | O app oferece o download de quatro templates: cartões em CSV e em XLSX, questões em CSV e em XLSX, com cabeçalho padronizado, uma linha de exemplo e instruções. | Dado o clique em baixar, então abre o diálogo de salvar e o arquivo reimportado sem mudanças passa na validação. | Must | Q-templates |
| FR-14 | Importar CSV ou XLSX escolhendo o tipo (cartões ou questões); o CSV aceita UTF-8 (com ou sem BOM) e separador vírgula ou ponto e vírgula; o XLSX usa a primeira planilha. | Dado CSV com `;` exportado pelo Excel, então as colunas são reconhecidas. | Must | Q-import |
| FR-15 | A prévia lista cada linha com situação (válida, erro com motivo e número da linha, duplicada) e os tópicos que serão criados; mostra o resumo (válidas, com erro, duplicadas). | Dado 3 linhas com erro, então a prévia mostra o número e o motivo de cada uma. | Must | Q-import |
| FR-16 | Confirmar a importação grava as linhas válidas, aprovadas e com `origin = "import"`, numa única transação; linhas com erro nunca entram. Duplicadas são puladas por padrão, com opção de marcar para importar. | Dado erro no meio da gravação, então nada é gravado; dado sucesso, o resumo mostra quantos itens entraram. | Must | Q-import; Q-duplicados |
| FR-17 | Tópicos desconhecidos na planilha são criados automaticamente (nome normalizado como na geração). | Dado tópico novo, então ele existe após a importação e a prévia o avisou. | Must | Q-topicos |
| FR-18 | A importação recusa arquivos acima de 5.000 linhas ou 10 MB, e extensões diferentes de `.csv` e `.xlsx`, com mensagem clara. | Dado arquivo de 5.001 linhas, então recusa antes de gravar. | Must | Q-limites |
| FR-19 | A tela Itens ganha os botões "Novo item" e "Importar" e mostra a origem de cada item (gerado, manual, importado, caderno de erros), com filtro por origem. | Dado itens de origens diferentes, então a coluna e o filtro funcionam. | Should | Q-escopo |
| FR-20 | Itens criados no leitor ou em outro fluxo guardam material, página e trecho quando houver fonte, e "Ver no PDF" funciona neles. | Dado item do leitor, então "Ver no PDF" abre a página e destaca o trecho. | Should | M-1; [src: pdfSourceOf] |
| FR-21 | "Salvar e criar outro" mantém tipo, subtipo e tópico para criar vários itens em sequência. | Dado o clique, então o formulário limpa texto e mantém tipo e tópico. | Could | Q-sucesso |

### Non-functional

| ID | Requisito | Critério de aceitação | Prioridade |
|---|---|---|---|
| NFR-1 | Desempenho: criar um item manual exige no máximo 5 interações do primeiro clique ao salvar; a prévia de um arquivo de 500 linhas aparece em até 3 s; a gravação de 500 itens em até 5 s. | Teste automatizado mede a prévia e a gravação com dados sintéticos; contagem de interações no teste e2e. | Must |
| NFR-2 | Segurança da importação: nunca avaliar fórmulas (só valores), ignorar macros e links, validar tudo com zod, limite de tamanho e linhas verificado antes de processar, sem rede. | Teste com XLSX de fórmula, arquivo gigante e extensão falsa: sem execução, recusa com erro. | Must |
| NFR-3 | Privacidade: o modelo recebe apenas o texto do item, o trecho e as instruções do pedido; logs não gravam conteúdo de itens, trechos nem arquivos importados. | Teste de log com conteúdo marcador; chamada ao LLM mockada confere o corpo enviado. | Must |
| NFR-4 | Atomicidade e integridade: importação e salvamento são transacionais; itens manuais não distorcem contadores de gerações nem estatísticas por material. | Teste: falha injetada não deixa itens; estatísticas de geração não mudam após criar itens manuais. | Must |
| NFR-5 | Contrato: novos canais IPC com esquemas zod de entrada e saída; mudanças aditivas mantêm `CONTRACT_VERSION = 1`. | Teste de canais (`channels.test.ts`) cobre os novos nomes e esquemas. | Must |
| NFR-6 | Acessibilidade: painel com foco gerenciado, `Esc` fecha, campos com rótulo, prévia navegável por teclado, erros anunciados. | Testes de interface verificam rótulos e foco. | Should |
| NFR-7 | Qualidade: o `pnpm lint`, `format:check`, `typecheck` e `test --coverage` continuam passando; cobertura mínima de 80% por arquivo novo ou alterado relevante; o LLM é sempre mockado. | Comando de verificação da 2.9 passa. | Must |
| NFR-8 | Licença e dependências: a biblioteca de XLSX é compatível com AGPL-3.0 e empacotada sem recursos nativos extras. | ADR registra licença e versão; build `.deb` e Windows continuam passando. | Must |
| NFR-9 | Dados: itens manuais e importados entram no backup do workspace e restauram sem perda. | Teste de exportar e importar backup com itens das novas origens. | Must |

### Constraints · Out of scope · Glossary

**Restrições.** TypeScript strict, zod, Electron + React; IPC único e tipado; sem porta de rede; UI em pt-BR; código e commits em inglês; AGPL. [mem: M-4, M-6, M-8, M-9]

**Fora de escopo.** Formatos Anki e Quizlet, exportação, questões de cálculo manuais, mídia em itens, edição em lote de itens importados além da tela Itens atual (ver 1.4).

**Glossário.**

| Termo | Significado |
|---|---|
| Item | Cartão ou questão armazenado em `item` |
| Origem (`origin`) | De onde o item veio: `generated`, `manual`, `reader`, `import`, `error_note` |
| Run sintética | Linha de `generation_run` sem geração real, usada para satisfazer `item.run_id` |
| Trecho | Texto selecionado no leitor, com material e página |
| Proposta | Texto sugerido pelo modelo, ainda não aceito |
| Prévia | Tela que mostra o resultado da validação antes de gravar a importação |

### Assumptions & open questions

- ASSUMPTION A-4: o botão "Melhorar com IA" fica no editor inteiro, também ao editar um item já salvo (não só itens manuais), porque reaproveita o mesmo editor. [inferred]
- ASSUMPTION A-5: questões de múltipla escolha manuais têm de 2 a 5 alternativas; as geradas continuam com 4 ou 5. [inferred]
- ASSUMPTION A-6: itens criados no leitor ganham `origin = "reader"` para diferenciá-los dos manuais sem fonte. [inferred]
- ASSUMPTION A-7: a duplicata é detectada pelo texto normalizado da frente (cartão) ou do enunciado (questão) entre itens não descartados do workspace. [inferred: src/core/generation/cards.ts]

## 2.4 User stories

Persona única: **Estudante** (a pessoa que usa o MIND para estudar os próprios materiais). Notas da mob: design (estados vazio, erro e sem provedor), desenvolvedor (reuso de `NotebookService` e `ReviewService`), qualidade (um teste por critério abaixo).

### US-1 Criar um cartão manualmente (FR-1, FR-3, FR-4, FR-21)

Como estudante, quero criar um cartão à mão, com ou sem material de origem, para estudar algo que não está em nenhum material.

- Dado o editor aberto em Itens, quando preencho frente e verso e salvo, então o cartão aparece na lista como "manual" e entra na fila de estudo.
- Dado frente ou verso vazios, quando tento salvar, então vejo o erro no campo e nada é gravado.
- Dado que escolhi "Salvar e criar outro", então o formulário mantém tipo, subtipo e tópico.
- Estados: sem material (fonte vazia), com material (escolher material, página e trecho).

### US-2 Criar uma questão manualmente (FR-2, FR-3, FR-4)

Como estudante, quero escrever uma questão de certo/errado ou de múltipla escolha, com gabarito e explicação, para praticar.

- Dado o tipo "Questão" e múltipla escolha, quando informo enunciado, 2 a 5 alternativas, gabarito e explicação, então salvo e ela aparece na prática.
- Dado gabarito que não é uma alternativa, então não salva e o erro aponta o campo.
- Dado certo/errado, então o editor não mostra alternativas e o gabarito é C ou E.

### US-3 Melhorar, corrigir ou ajustar o texto com o modelo (FR-10, FR-11, FR-12, FR-9)

Como estudante, quero pedir ao modelo que melhore, corrija ou ajuste o texto do meu item, e decidir o que aceito.

- Dado texto preenchido, quando escolho "Corrigir", então vejo original e proposta lado a lado.
- Dado a proposta, quando aceito um campo, então só o formulário muda; o item só é gravado ao salvar.
- Dado "Ajustar" com instrução de até 500 caracteres, então a proposta segue a instrução.
- Dado proposta inválida (gabarito fora das alternativas), então vejo o erro e o formulário não muda.
- Dado provedor ou consentimento ausentes, então vejo como configurar, e o resto do editor segue funcionando.

### US-4 Criar um item a partir de um trecho do material (FR-5, FR-6, FR-20)

Como estudante, quero selecionar um trecho no leitor e criar um item com ele como fonte, para não perder o contexto.

- Dado texto selecionado, então aparecem "Gerar itens" e "Criar item" perto da seleção.
- Dado "Criar item", então o editor abre com material, página e trecho preenchidos.
- Dado o item salvo, então "Ver no PDF" abre a página e destaca o trecho.

### US-5 Gerar itens do trecho selecionado (FR-7, FR-8, FR-9, FR-20)

Como estudante, quero pedir ao modelo itens do trecho que selecionei, opcionalmente dizendo quantos e sobre qual assunto.

- Dado um trecho, quando escolho "Cartões" sem quantidade nem assunto, então o modelo decide quantos itens e quais assuntos.
- Dado quantidade 5 e assunto "juros compostos", então recebo até 5 rascunhos sobre esse assunto.
- Dado a estimativa de custo e o consentimento, então só gera depois de eu confirmar.
- Dado cada rascunho, então posso editar, descartar ou salvar; salvar cria item aprovado com o trecho como fonte.
- Dado trecho maior que 8.000 caracteres, então o app pede que eu selecione menos.

### US-6 Baixar os templates de importação (FR-13)

Como estudante, quero baixar templates de cartões e de questões em CSV ou XLSX, para preencher fora do app.

- Dado "Importar", então posso baixar o template do tipo escolhido no formato escolhido.
- Dado o template sem alterações, quando importo, então a prévia valida a linha de exemplo.

### US-7 Importar um arquivo e ver a prévia (FR-14, FR-15, FR-17, FR-18)

Como estudante, quero escolher um CSV ou XLSX e ver, antes de salvar, o que entra e o que dá erro.

- Dado um CSV com `;`, então as colunas são reconhecidas.
- Dado linhas com erro, então a prévia mostra número da linha e motivo.
- Dado linhas duplicadas, então aparecem marcadas e desmarcadas para importar.
- Dado tópicos novos, então a prévia lista os que serão criados.
- Dado arquivo com mais de 5.000 linhas ou 10 MB, ou extensão errada, então o app recusa com mensagem.

### US-8 Confirmar a importação (FR-16, FR-17)

Como estudante, quero confirmar a importação e ter as linhas válidas no estudo.

- Dado "Importar N válidas", então os itens entram aprovados com origem "importado" e vejo o resumo.
- Dado falha durante a gravação, então nenhum item entra e vejo o erro.

### US-9 Ver a origem dos itens (FR-19)

Como estudante, quero ver de onde veio cada item e filtrar por origem.

- Dado itens gerados, manuais, do leitor, importados e do caderno de erros, então a lista mostra a origem e o filtro isola cada uma.

### Cobertura FR ↔ história

| FR | Histórias |
|---|---|
| FR-1 | US-1 |
| FR-2 | US-2 |
| FR-3 | US-1, US-2 |
| FR-4 | US-1, US-2 |
| FR-5 | US-4 |
| FR-6 | US-4 |
| FR-7 | US-5 |
| FR-8 | US-5 |
| FR-9 | US-3, US-5 |
| FR-10 | US-3 |
| FR-11 | US-3 |
| FR-12 | US-3 |
| FR-13 | US-6 |
| FR-14 | US-7 |
| FR-15 | US-7 |
| FR-16 | US-8 |
| FR-17 | US-7, US-8 |
| FR-18 | US-7 |
| FR-19 | US-9 |
| FR-20 | US-4, US-5 |
| FR-21 | US-1 |

### Assumptions & open questions

- Nenhuma nova. INVEST: cada história é entregável e testável sozinha; US-3 depende do editor de US-1 e US-2.
