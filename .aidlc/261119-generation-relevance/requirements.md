# Requirements — generation-relevance

## Original request

> Ok, agora precisamos deixar o modelo mais inteligente. Eu subi um material em pt-br sobre a lingua portuguesa, é um pdf de ortografia e acentuação. Bem, no meio do documento existe algumas questões ou passagens da aula do professor e o modelo está pegando por exemplo o texto motivador de uma questão para criar cards/questões
> [imagem: um card de estudo perguntando "O que se desenvolve por volta dos nove ou dez anos e acompanha a adolescência e boa parte do início da vida adulta?", tirado de um texto motivador, sem relação com ortografia ou acentuação]
>
> precisamos fazer com que ele foque em:
> 1. cards devem ser conceituais sobre o conteudo da disciplina do documento, não sobre qualquer trecho que exista e que possa ser tirado de contexto
> 2. questões devem focar mais na prática e também não cometer o mesmo erro. Os documentos podem ter questão e as vezes o modelo gera questões sobre parte do enunciado, mas acaba tirando de contexto e tangenciando a disciplian estudada
>
> Os documentos que a pessoa envia podem ser dos mais variados. Pode ser de conteudo + questões, somente conteudo, somente questões etc. Alem disso, a pessoa pode pedir para importar as proprias questoes do documento para o app
>
> como podemos melhorar isso?

Follow-up do usuário: "se por exemplo parte do trecho estiver em outra página, o modelo consegue pedir para enviarmos a pagina anterior [...]? [...] sobre classificar os trechos, seria bom."

## Direção acordada antes do intent (a validar em 1.1–1.4)

Causas encontradas em `src/core/generation/`: (1) o prompt não conhece a disciplina; (2) "crie exatamente N" obriga a inventar quando o lote não tem conteúdo; (3) `self-contained.ts` manda reescrever o enunciado de questões de prova dentro do item; (4) o juiz só avalia questões e só checa se a resposta está sustentada, nunca a relevância.

Escopo escolhido (perfil mvp): **A** prompts com disciplina e teste de escopo, "até N" em vez de "exatamente N"; **B** juiz de relevância também para cards e no juiz de questões; **C** classificação dos trechos por papel, continuidade e unidade, com lotes montados por unidade. Fora do escopo, para o backlog: **D** importar as questões do próprio documento (BL-7) e o pedido de contexto adicional pelo modelo (BL-8).

## 1.1 Intent & stakeholders

**Intenção, em termos de produto.** Os cards e as questões gerados devem ser sobre o **conteúdo da disciplina** do material, não sobre qualquer trecho que caiba num item. Hoje o modelo transforma em item o texto motivador de uma questão de prova, um exemplo ou uma passagem de aula, produzindo itens fora de contexto e sem relação com a disciplina (ex.: um card sobre desenvolvimento humano num material de ortografia). [src: Original request]

**Problema.** O estudante perde tempo descartando rascunhos irrelevantes na revisão, e itens fora de escopo que passam viram cartas de estudo sem valor. A causa está em `src/core/generation/`: o prompt não sabe a disciplina, "exatamente N" força itens quando o lote não tem conteúdo, `self-contained.ts` incentiva transformar enunciados de questões em itens, e o juiz só checa se a resposta está sustentada, nunca a relevância. [src: src/core/generation/prompts.ts, self-contained.ts, judge.ts]

**Usuários.** O estudante, único usuário do app (desktop, local). Materiais variados: só conteúdo, conteúdo mais questões, só questões. [src: Original request]

**Partes interessadas.**

| Papel | Quem | O que quer |
|---|---|---|
| Decide | o autor do app (também estudante) | itens de qualidade sem retrabalho na revisão |
| Afetado | o estudante | revisar menos lixo; cards conceituais, questões práticas |
| Consultado | — | sem outras partes (app local, uso individual) |

**Critério de sucesso.** Um conjunto de fixtures de trechos reais anonimizados (texto motivador, questão de prova, conceito, gabarito) com o resultado esperado; o teste mede quantos itens fora de escopo passam. A meta numérica é definida em 2.3. [src: Q1 de 1.1]

**Restrições e decisões desta etapa.**
- Custo: **qualidade acima de custo**; sem teto de chamadas extras ao modelo, mas a estimativa de custo continua exibida como hoje. [src: Q2 de 1.1]
- Legado: **só novas gerações**; itens já gerados são tratados pela revisão atual (descartar). Sem reavaliação retroativa. [src: Q3 de 1.1]
- Disciplina: **campo opcional na tela** ao gerar (ou ao enviar o material); vazio usa a disciplina inferida pela classificação. Implica mudança de tela, então 1.6 e 2.5 (mockups HTML, M-12) se aplicam. [src: Q4 de 1.1]
- Toda geração continua citando um trecho verbatim (M-1, M-13) e o código é escrito em inglês (M-8). [mem: M-1, M-13, M-8]

**Não objetivos.** Importar as questões do documento (BL-7) e o modelo pedir contexto extra (BL-8); reavaliar itens existentes; mudar o estudo e a prática. [src: backlog]

### Assumptions & open questions
- A2 (1.1): o texto motivador pode ser usado como contexto de uma questão quando a habilidade testada depende dele, mas nunca como fonte de um card — confirmed: no
- A3 (1.1): a disciplina inferida e a informada pelo estudante valem por material, não por geração — confirmed: no
- Aberta: onde fica o campo de disciplina (envio do material, tela de gerar ou ambos) — decidir em 1.6.
## 1.3 Feasibility, constraints & RAID

**Avaliação: viável, com risco moderado.** A arquitetura atual já comporta as três mudanças:
- **A (prompts, "até N"):** só texto e o esquema de saída em `prompts.ts`, `question-prompts.ts` e `schemas.ts`; os geradores (`cards.ts`, `questions.ts`) já descartam itens inválidos e contam descartes por motivo. [src: src/core/generation/]
- **B (juiz de relevância):** já existe o `Judge` com modelo próprio (`judgeModel`, configurável em `settings/service.ts`) e `withSelfContainedJudge`; falta aplicá-lo a cards e acrescentar o critério. [src: src/core/generation/judge.ts]
- **C (classificação):** os trechos já são pequenos (alvo de 1200 caracteres, máximo 1500, em `ingestion/chunker.ts`) e têm `ordinal` e `page`, então marcar papel e continuidade por trecho é granular o bastante. Os lotes (`planning.ts`, ~6000 caracteres) passam a ser montados por unidade. Exige uma migration em `chunk` (a última é a 0005) e um passo novo, no envio do material ou na primeira geração. [src: src/core/db/workspace-schema.ts, planning.ts]

**Restrições.**

| ID | Restrição | Fonte |
|---|---|---|
| C1 | Todo item gerado cita trecho verbatim, e o juiz continua descartando o que não é sustentado | M-1, M-13 |
| C2 | Saídas do LLM validadas com zod; o LLM é mockado nos testes | M-4, M-5 |
| C3 | O app não abre porta de rede; mudança de contrato IPC passa por esquemas compartilhados | M-9 |
| C4 | Dados do usuário ficam fora da instalação; migration não apaga nada | M-10 |
| C5 | Código, comentários e commits em inglês; textos de tela em pt-BR | M-8 |
| C6 | Qualidade acima de custo: sem teto de chamadas extras | Q2 de 1.1 |
| C7 | Materiais já enviados precisam funcionar sem reprocessamento obrigatório (classificação lazy ou sob demanda) | Q3 de 1.1, A4 |

**RAID.**

| Tipo | ID | Descrição | Mitigação |
|---|---|---|---|
| Risco | R1 | A classificação erra o papel de um trecho (conceito tomado por motivador, ou o contrário) | Juiz de relevância (B) como segunda barreira; fixtures com casos de borda; "até N" evita forçar itens |
| Risco | R2 | Excesso de rigor: o filtro descarta itens bons e a geração devolve poucos | Medir a taxa de descarte nas fixtures; o planejamento completa com outros lotes |
| Risco | R3 | Prompt mais longo e mais chamadas aumentam latência e custo | Aceito (C6); classificação guardada e reaproveitada; estimativa de custo atualizada |
| Risco | R4 | Documentos escaneados (OCR) têm texto ruidoso e a classificação piora | Tratar baixa confiança de OCR como "outro" ou classificar mesmo assim e deixar o juiz decidir; definir em 2.3 |
| Risco | R5 | Migration e reprocessamento de materiais existentes | Colunas anuláveis; classificar na primeira geração do material (A4) |
| Premissa | A4 | Um trecho tem um papel dominante; a fronteira de unidade pode cruzar trechos (coberta pela continuidade) | Validar nas fixtures |
| Premissa | A5 | Uma passada de classificação por material cabe no contexto do modelo (em janelas deslizantes) | Janelas com sobreposição; definir em 2.6 |
| Dependência | D1 | Chave e consentimento do provedor já configurados (ver erros `PROVIDER_KEY_MISSING`, `CONSENT_REQUIRED`) | Mesmos erros e atalho às Configurações já existentes |
| Pendência | I1 | O codekb está defasado (baseline 4e7cc4e); 2.1 atualiza | Executar 2.1 antes do desenho |

**Recomendação: GO.** Nenhuma restrição bloqueia; os riscos são de qualidade e se medem com as fixtures.

### Assumptions & open questions
- A4 (1.3): um trecho tem um papel dominante e a continuidade entre trechos cobre as unidades que o cruzam — confirmed: no
- A5 (1.3): a classificação roda em janelas deslizantes de trechos, com sobreposição, e não em uma única chamada por material — confirmed: no
- Aberta: classificar no envio do material (ingestão) ou na primeira geração? Decidir em 2.6 com base no custo e na latência percebida.

## 1.4 Scope

**Dentro do escopo.**

| Parte | O que entrega |
|---|---|
| A | Prompts de cards, questões e cálculo com a **disciplina** e um **teste de escopo** (ficam fora texto motivador, trechos citados como material de exercício e o assunto de frases-exemplo); regra de **"até N"** (o modelo pode devolver menos) com o planejamento completando em outros lotes; ajuste de `self-contained.ts` para não incentivar itens a partir de enunciados de prova; cards só conceituais, questões voltadas à prática |
| B | **Juiz de relevância**: critério novo de "é sobre a disciplina?" no juiz de questões e um juiz de relevância para cards (hoje sem juiz) |
| C | **Classificação dos trechos** (papel, continuidade, unidade e disciplina do material), migration em `chunk`, **lotes montados por unidade** (uma questão não é cortada ao meio) e contexto vizinho rotulado "apenas contexto" |
| Tela | **Campo opcional de disciplina** (por material); a disciplina inferida é usada quando vazio |
| Testes | Conjunto de **fixtures** de trechos anonimizados com resultado esperado; LLM mockado (M-5) |

Vale para todos os tipos de item: cards (qa, cloze, compare, verdadeiro/falso) e questões (certo/errado, múltipla escolha, cálculo). [src: Q1 de 1.4]

**Fora do escopo.** Importar as questões do documento (BL-7); o modelo pedir contexto extra (BL-8); reavaliar itens já gerados (BL-9); mudanças no estudo, na prática e na revisão; novos provedores de modelo.

**Limite do MVP e entrega.** Incremental em Units, cada uma verificável e utilizável: (1) esqueleto com A+B e as fixtures; (2) classificação e lotes por unidade (C); (3) campo de disciplina na tela. A ordem e a divisão final são decididas em 2.7. [src: Q2 de 1.4]

**Backlog.** BL-7, BL-8 e BL-9 em `.aidlc/backlog.md` (M-16). [mem: M-16]

### Assumptions & open questions
- A6 (1.4): a disciplina informada pelo estudante vale por material e prevalece sobre a inferida — confirmed: no
- A7 (1.4): o campo de disciplina fica no envio do material e na edição do material; a tela de gerar mostra a disciplina vigente, sem campo próprio — confirmed: no
## 2.3 Requirements

### Functional

| ID | Requisito | Justificativa | Critério de aceitação | Prioridade | Fonte |
|---|---|---|---|---|---|
| FR-1 | Todo prompt de geração (cards, questões e cálculo) leva a **disciplina vigente** do material: a informada pelo estudante, senão a inferida, senão o título | O modelo não sabe de que disciplina é o trecho | Dado um material com disciplina informada, quando um lote é montado, então o prompt contém essa disciplina; sem informada usa a inferida; sem ambas usa o título | Must | [src: 1.1, Q4] |
| FR-2 | Os prompts trazem um **teste de escopo**: ficam fora texto motivador, trechos citados como material de exercício e o assunto de frases-exemplo; cards são conceituais e questões são práticas | Causa 1 e causa 3 do problema | O texto do prompt de cards e de questões contém o teste de escopo e a distinção card conceitual / questão prática (teste de conteúdo do builder) | Must | [src: Original request] |
| FR-3 | O modelo pode devolver **menos itens que o pedido** (até N) quando o lote não tem conteúdo adequado; não há item de preenchimento | "Exatamente N" força itens fora de escopo | Dado um lote sem conteúdo da disciplina, quando o modelo devolve lista vazia ou menor, então a geração aceita sem erro e sem inventar | Must | [src: causa 2] |
| FR-4 | Quando os aceitos ficam abaixo do pedido, faz **uma segunda rodada** em lotes de conteúdo ainda não usados; se ainda faltar, entrega o que tem | Completar sem custo imprevisível | Dado um pedido de 20 e 14 aceitos, então há no máximo uma rodada extra, e o resumo informa o total entregue | Should | [src: Q3 de 2.3] |
| FR-5 | As regras de autocontenção não incentivam itens a partir de **enunciados de prova**: uma questão de prova inspira uma questão nova com a mesma habilidade e dados novos; o texto motivador nunca é fonte; o **comentário do professor que explica a regra** pode ser fonte de card, reescrito sem depender da questão | `self-contained.ts` hoje manda copiar o enunciado | O prompt não contém a instrução antiga; o teste de conteúdo cobre a nova regra | Must | [src: causa 3; Q2 de 2.3] |
| FR-6 | **Juiz de relevância para cards**: uma chamada em lote com o modelo do juiz, antes de gravar, descarta o que não é da disciplina; em dúvida, descarta e registra | Cards não têm juiz | Dado um card sobre o tema de um texto motivador, quando o juiz o marca fora do escopo, então ele não vira rascunho e o `discardLog` traz o motivo | Must | [src: Original request; Q1 de 2.3] |
| FR-7 | O juiz de questões ganha o critério de **relevância** (a questão é sobre a disciplina, não sobre o contexto do enunciado) | A questão pode ser sustentada e ainda assim tangenciar | Dado um enunciado correto mas fora da disciplina, então é descartado como fora do escopo | Must | [src: Original request] |
| FR-8 | **Classificação dos trechos**: depois de indexar, um job em segundo plano com o modelo do juiz atribui a cada trecho um papel (conceito, exemplo resolvido, questão de prova, texto motivador, gabarito/comentário, outro), a continuidade com o trecho anterior e a unidade a que pertence, e infere a disciplina do material | Base para lotes por unidade e para regras por papel | Dado um material indexado, então todos os trechos ficam classificados e o material recebe a disciplina inferida; falha parcial não perde o que já foi classificado | Must | [src: Q1 e Q2 de 2.1; Q2 de 2.3] |
| FR-9 | A classificação roda em **janelas deslizantes com sobreposição**, é idempotente, cancelável e repetível, e mostra o estado (analisando, concluída, falha) na Biblioteca | Materiais grandes e falhas de rede | Dado uma falha no meio, então o estado é "falha na análise" e "Analisar de novo" retoma sem duplicar | Must | [src: A5 de 1.3; mockup 1.6] |
| FR-10 | Os **lotes são montados por unidade** (uma questão, um conceito não é cortado) e só com os papéis permitidos para o tipo: cards usam conceito, exemplo resolvido e comentário que explica a regra; questões usam também questão de prova como inspiração; trechos vizinhos entram rotulados como **"apenas contexto"** | Evita cortes e vazamento de papel | Dado um material com uma questão dividida em dois trechos, então ela cai no mesmo lote | Must | [src: C, Q2 de 2.3] |
| FR-11 | A **citação verbatim** (M-1, M-13) só pode vir de um trecho de papel permitido; trecho "apenas contexto" nunca é fonte | Preserva a rastreabilidade | Dado um item cuja citação está num trecho de contexto, então é descartado como sem fonte | Must | [mem: M-1, M-13] |
| FR-12 | **Sem classificação** (ainda não terminou, falhou ou material anterior à migration) a geração segue com FR-1 a FR-7, sem unidades nem papéis, e a tela avisa; não bloqueia | O estudante não fica parado | Dado um material sem classificação, quando gera, então gera com as regras de prompt e o juiz e mostra o aviso | Must | [src: Q4 de 2.3; A11] |
| FR-13 | Em material **só de questões**, a geração cria questões novas inspiradas e cards só das regras que o gabarito ou comentário enunciam; se não há conteúdo conceitual, avisa | Materiais variados | Dado um material classificado só com questões de prova, então os cards saem apenas de comentários que explicam a regra | Should | [src: Q3 de 2.3] |
| FR-14 | O estudante pode **definir a disciplina** de um material (ação "Definir disciplina…" na Biblioteca e "Alterar" em Gerar); a informada prevalece e vazio volta à inferida | Títulos como "Aula 3" não ajudam | Dado um valor informado, então FR-1 usa esse valor; vazio usa a inferida | Must | [src: Q4 de 1.1; mockup 1.6] |
| FR-15 | O **resumo da execução** conta os descartados **fora do escopo** e explica por que vieram menos itens que o pedido | Transparência | O resumo mostra o contador e a frase; o contador persiste em `generation_run` | Must | [src: mockup 1.6] |
| FR-16 | O custo da classificação e do juiz de cards conta no **limite mensal**; a estimativa de geração inclui o juiz de cards; se o limite for atingido, a classificação para com `MONTHLY_LIMIT_REACHED` e pode ser retomada | Consistência com o controle de custo atual | Dado o limite atingido, então a análise fica pausada com a mensagem e a geração segue o comportamento atual | Must | [src: C6; settings] |
| FR-17 | **Fixtures de relevância**: um conjunto de trechos anonimizados (conceito, exemplo, questão de prova, motivador, comentário, outro) com resultado esperado; testes automáticos com LLM mockado cobrem o pipeline, e um script de avaliação (`pnpm eval:generation`, fora do CI) mede com o modelo real | Mede o critério de sucesso | O script imprime os dois indicadores: itens fora de escopo que passam e bons mantidos | Must | [src: Q1 de 1.1; M-5] |
| FR-18 | As entradas de cards, questões e juiz de `fixtures/prompts.json` são **regeneradas por script** a partir dos builders, com nota em `fixtures/README.md` | Prompts mudam de propósito | `prompts.test.ts` e `questions.test.ts` passam e o README registra a divergência | Must | [src: Q1 de 2.2] |

### Non-functional

| ID | Categoria | Meta mensurável | Verificação | Fonte |
|---|---|---|---|---|
| NFR-1 | Qualidade | Nas fixtures: **0 itens fora de escopo** passam e **≥ 80%** dos itens bons esperados são gerados/mantidos | `pnpm eval:generation` (modelo real, manual) e testes com LLM mockado | [src: Q1 de 2.3] |
| NFR-2 | Privacidade | O texto do material só vai ao provedor configurado, com o consentimento já existente; sem consentimento a análise não roda e o erro `CONSENT_REQUIRED` aparece | Teste de unidade do job; teste de contrato | [mem: M-2, M-9] |
| NFR-3 | Resiliência | Falha ou cancelamento da classificação não altera o status `indexed` do material nem apaga trechos; gravação por transação | Testes de unidade com falha injetada | [src: FR-9] |
| NFR-4 | Compatibilidade | Migration aditiva (colunas anuláveis); material sem classificação continua gerando (FR-12); nenhum dado é apagado | Teste de migration em banco com dados | [mem: M-10] |
| NFR-5 | Desempenho | A classificação roda em segundo plano sem travar a interface, com progresso e cancelamento; o tempo da geração aumenta só pela chamada do juiz de cards | Teste de job com progresso e cancelamento | [src: C6] |
| NFR-6 | Testabilidade | LLM mockado em todos os testes automáticos; builders de prompt puros; cobertura global mantida ≥ 80% | `pnpm test --coverage` | [mem: M-5] |
| NFR-7 | Acessibilidade | O diálogo da disciplina usa o `Dialog`, rótulos e foco já existentes; o status "analisando" tem `role="status"` | Teste de componente e e2e | [src: 2.2] |
| NFR-8 | Contrato | Canais novos ou alterados com esquema zod; mudança incompatível sobe `CONTRACT_VERSION` | Testes de contrato | [mem: M-4, M-9] |

### Constraints · Out of scope · Glossary

- **Restrições:** C1 a C7 de 1.3; código em inglês, textos de tela em pt-BR (M-8); commits por Unit na `main`, sem push, sem versão e sem tag (M-7).
- **Fora do escopo:** BL-7 (importar questões do documento), BL-8 (modelo pede contexto), BL-9 (reavaliar itens existentes); mudanças em estudo, prática e revisão.
- **Glossário:** *papel* (função do trecho no material); *unidade* (conjunto de trechos que formam um todo, como uma questão com motivador e alternativas); *texto motivador* (texto que abre uma questão de prova e não faz parte do conteúdo da disciplina); *fora do escopo* (item que não é sobre a disciplina); *contexto* (trecho vizinho enviado só como apoio, nunca como fonte); *disciplina vigente* (informada, senão inferida, senão título).

### Assumptions & open questions
- A13 (2.3): a avaliação com o modelo real (`pnpm eval:generation`) é manual e fica fora do CI, por M-5 (LLM mockado) e pelo custo — confirmed: no
- A14 (2.3): a meta de 80% usa um conjunto pequeno de fixtures (algumas dezenas de trechos); o tamanho final é definido em 2.9 — confirmed: no
- A15 (2.3): a segunda rodada de FR-4 só roda se faltar pelo menos um item e existirem lotes de conteúdo não usados — confirmed: no

## 2.4 User stories

### Personas

| Persona | Descrição |
|---|---|
| Estudante | Único usuário do app (desktop, local): envia materiais variados, gera itens, revisa rascunhos e estuda. Também é o autor do app, que avalia a qualidade (US-9). |

### Histórias

| ID | História | Critérios (Dado / Quando / Então) | FR | Notas da mob |
|---|---|---|---|---|
| US-1 | Como estudante, quero que os **cards** gerados sejam conceituais sobre a disciplina do material, para estudar o que importa e não trechos soltos | Dado um material de ortografia com texto motivador, quando gero cards, então nenhum card é sobre o tema do texto motivador e cada card ensina uma regra ou conceito | FR-1, FR-2, FR-3, FR-5, FR-11 | Design: o resumo explica quando vêm menos. Dev: schema permite lista menor. Quality: fixture com motivador e conceito lado a lado |
| US-2 | Como estudante, quero que as **questões** geradas sejam práticas e da disciplina, para treinar a aplicação das regras | Dado um trecho com exemplos, quando gero questões, então cada uma exige aplicar uma regra da disciplina e é autocontida | FR-1, FR-2, FR-5, FR-7 | Dev: prompt de cálculo também recebe a disciplina. Quality: fixture de questão que tangencia o assunto |
| US-3 | Como estudante, quero **revisar menos lixo**, para não perder tempo descartando rascunhos fora de contexto | Dado um item fora do escopo, quando o juiz o avalia, então ele não vira rascunho e fica registrado como fora do escopo | FR-6, FR-7, FR-11 | Dev: juízo de cards antes do `store` (um `await` novo). Quality: citação em trecho de contexto é descartada |
| US-4 | Como estudante, quero que materiais **mistos ou só de questões** funcionem, para usar qualquer apostila | Dado um material com conteúdo, motivadores e questões, quando é analisado, então cada trecho recebe um papel e uma questão inteira cai no mesmo lote; em material só de questões saem questões novas inspiradas | FR-8, FR-10, FR-13 | Quality: fixtures de cada tipo de material |
| US-5 | Como estudante, quero **informar a disciplina** do material, para guiar o modelo quando o título não ajuda | Dado um material "Aula 3", quando defino "Língua Portuguesa", então a geração usa essa disciplina; vazio volta à inferida | FR-14, FR-1 | Design: mockup 1.6, mesmo diálogo na Biblioteca e em Gerar |
| US-6 | Como estudante, quero **ver o estado da análise** do material e refazê-la se falhar | Dado uma análise em curso, então vejo "Analisando"; dado uma falha, então vejo o motivo e "Analisar de novo"; dado o limite mensal atingido, então a análise pausa com a mensagem | FR-8, FR-9, FR-16 | Dev: job cancelável com progresso. Quality: falha injetada, limite mensal |
| US-7 | Como estudante, quero **gerar sem esperar** a análise, para não ficar parado | Dado um material ainda sem classificação, quando gero, então a geração segue com um aviso | FR-12 | Design: banner informativo da tela Gerar |
| US-8 | Como estudante, quero **entender o resumo** da execução, para saber por que vieram menos itens e o que foi descartado | Dado uma execução com descartes, então o resumo mostra o total entregue, os descartados fora do escopo e a razão de ser menos que o pedido | FR-3, FR-4, FR-15 | Design: mockup do resumo. Quality: contador persistido |
| US-9 | Como autor do app, quero **medir a qualidade** com fixtures e um script, para saber se a melhoria funcionou e evitar regressões | Dado o conjunto de fixtures, quando rodo `pnpm eval:generation`, então vejo itens fora de escopo que passam e a taxa de bons mantidos; os testes de prompt passam com as fixtures regeneradas | FR-17, FR-18 | Dev: script fora do CI. Quality: meta 0 e ≥80% (NFR-1) |

**Cobertura:** FR-1 a FR-18 estão ligados a pelo menos uma história, e toda história liga a pelo menos um FR.

### Assumptions & open questions
- Nenhuma nova.
