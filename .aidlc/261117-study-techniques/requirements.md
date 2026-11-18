# Requirements — study-techniques

## Original request

Novo conjunto de melhorias de estudo no MIND, baseado no livro "Fixe o Conhecimento" (Brown, Roediger, McDaniel). Funcionalidades a discutir e especificar: (1) pré-teste: testar-se com questões antes de ler/estudar um material novo, tratando os erros dessa fase à parte das estatísticas e do agendamento; (2) feedback postergado nas questões (ao fim do bloco ou no dia seguinte, configurável), pois o livro cita que ajuda a retenção; (3) intercalação: misturar tópicos/materiais na fila de estudo e na prática; (4) talvez calibração: pedir a confiança antes de responder e comparar com o acerto nas estatísticas. Contexto: pré-teste, feedback postergado e calibração compartilham o fluxo de resposta das questões e a tabela attempt; a intercalação só afeta a ordem da fila. Hipótese inicial: duas intents (intercalação; sessão de prática com os itens 2 a 4), a validar na Inception. Auditoria técnica prévia do app vs. técnicas do livro em /tmp/claude-1000/-home-luk3rr-Projects/abf646cd-f371-4e19-802f-2ec786e66f13/scratchpad/auditoria-tecnicas.md. Comece pela Inception (discovery e requisitos), conversando comigo sobre os pontos de melhoria.

Nota: a auditoria citada foi copiada para `reference/technique-audit.md` desta intent. Em conversa anterior, o usuário também decidiu que as demais técnicas do livro (elaboração, reflexão, mnemônicos etc.) ficam a cargo do estudante, sem que o app precise induzi-las.

## 1.1 Intent & stakeholders

### Intent

Aplicar no MIND quatro práticas de estudo com respaldo em evidências, descritas no livro *Fixe o Conhecimento*, para que o estudante as use dentro do próprio app em vez de depender de contornos manuais. [src: Original request] [src: Q1]

O app já cobre recuperação ativa, repetição espaçada e aprendizado a partir dos erros (conferência em `reference/technique-audit.md`). Esta intent cobre o que o estudante não consegue fazer sozinho, porque depende da estrutura da fila, do fluxo de resposta e do feedback:

| # | Prática | O que o estudante ganha | Prioridade |
|---|---|---|---|
| 1 | Pré-teste | Responder questões sobre um material novo antes de estudá-lo, com os erros dessa fase tratados à parte das estatísticas e do agendamento | Must |
| 2 | Feedback postergado | Receber o gabarito e a explicação depois de um intervalo (ao fim do bloco ou no dia seguinte), configurável | Must |
| 3 | Intercalação | Estudar e praticar com tópicos e materiais misturados, em vez de em blocos | Must |
| 4 | Calibração | Informar a confiança antes de responder e comparar com o acerto nas estatísticas | Must (o pedido dizia "talvez"; o usuário fechou como Must em 1.1) |

[src: Q3]

### Problem

O estudante só consegue estudar em blocos de um assunto, vê a resposta no instante em que erra e não tem como testar-se antes de ler nem confrontar a sensação de saber com o acerto. Essas são justamente as lacunas apontadas pela conferência técnica. [src: reference/technique-audit.md]

### Users

- **Estudante com prova marcada:** prepara um conjunto fechado de materiais e usa questões no estilo de prova. Pré-teste e feedback postergado pesam mais.
- **Autodidata contínuo:** estuda um assunto ao longo de meses, sem prova. Intercalação e calibração pesam mais.

As funcionalidades devem servir aos dois, com padrões sensatos e configuração para ajustar. [src: Q2]

### Success measures

| ID | Medida | Como verificar |
|---|---|---|
| SM-1 | Cada uma das quatro práticas é usável ponta a ponta dentro do app, sem passos manuais fora dele | Teste automatizado por fluxo (unidade e e2e) na Construção |
| SM-2 | Nenhuma funcionalidade existente regride | O comando de verificação aprovado em 2.9 passa por inteiro |
| SM-3 | Cada prática pode ser ligada, desligada ou configurada pelo estudante, e o padrão preserva o comportamento atual | Teste de configuração e revisão do padrão em 2.3 |

[src: Q1]

### Stakeholders

| Papel | Quem | Interesse |
|---|---|---|
| Decisor | Mantenedor do MIND | Define escopo, prioridades e aprova os gates |
| Afetado | Estudantes que usam o MIND (os dois perfis acima) | Mudança no fluxo de estudo e prática |
| Consultado | Livro *Fixe o Conhecimento* (BROWN, P. C. et al.) | Fonte das práticas e das evidências; não participa das decisões |

### Constraints (preliminares; 1.3 detalha)

- Regras da memória do projeto aplicáveis: M-4 e M-5 (stack e testes), M-7 (sem `git push`), M-8 (idioma do código e cabeçalho), M-9 e M-10 (sem rede e dados fora da instalação), M-12 (mockups em HTML), M-14 (e2e no Electron real). [mem: M-4, M-5, M-7, M-8, M-9, M-10, M-12, M-14]
- Mudanças de esquema do banco do workspace exigem migração versionada, e os dados existentes do usuário não podem ser perdidos. [mem: M-10]

### Non-goals

- Elaboração, geração (digitar a resposta do card), reflexão e mnemônicos: o estudante pode aplicá-las sozinho, sem o app induzi-las. [src: Q4]
- Mudanças no algoritmo FSRS e no gerador de itens (exceto o mínimo que o pré-teste exigir para marcar a origem). [src: Q4]
- Estilos de aprendizagem (a prática não tem respaldo nas evidências do livro). [src: reference/technique-audit.md]

### Assumptions & open questions

- A2: não há prazo definido para a entrega. — confirmed: no
- A3: o pré-teste e o feedback postergado valem para as questões. Nos cards, o feedback já é imediato por natureza (revelar e avaliar); se o usuário quiser estendê-los aos cards, é decisão para 1.4. — confirmed: no
- A4: "intercalação" vale tanto para a fila de Estudar (cards) quanto para Praticar (questões); a granularidade (por tópico, por material ou por tipo) é decidida em 2.3. — confirmed: no

## 1.3 Feasibility, constraints & RAID

### Feasibility assessment

Verificado no código na versão 0.7.0 (HEAD `4e7cc4e`). Todas as quatro práticas são viáveis dentro da arquitetura atual (núcleo, IPC tipado e validado com zod, SQLite por workspace com migrações do Drizzle). [src: src/core/db/workspace-schema.ts, src/core/practice/service.ts, src/core/study/service.ts, src/core/stats/service.ts]

Fatos que moldam o desenho:

- **As questões não entram no FSRS.** Só os cards têm agendamento (`card_state`). Responder uma questão grava uma linha em `attempt`, e a fila de prática segue a ordem: não vistas, erradas, refazer. [src: src/core/practice/service.ts]
- **A correção é calculada e gravada na hora da resposta** (`attempt.correct`). Adiar o feedback muda só o que é mostrado e quando, não o dado nem as estatísticas. [src: src/core/practice/service.ts]
- **Não existe progresso de leitura por material** (a tabela `material` não guarda isso). [src: src/core/db/workspace-schema.ts]
- **Cinco consumidores leem `attempt`:** estatísticas por tópico, por material e de retenção e atividade, treino de pontos fracos, caderno de erros e a fila e as contagens da prática. [src: src/core/stats/service.ts, src/core/generation/training.ts, src/core/notebook/service.ts]
- **Os filtros por tópico e por material já existem** em `StudyFilter`, o que facilita o pré-teste por material. [src: src/core/study/service.ts]

| Prática | Viabilidade | Mudança de dados | Pontos de código tocados | Esforço |
|---|---|---|---|---|
| Pré-teste | Alta | Tabela própria `pretest_attempt` (ADR-1, decidido em 2.6; a hipótese inicial era uma coluna de fase em `attempt`) | Serviço novo, nova tela e botão por material; os consumidores de `attempt` não mudam | Médio |
| Feedback postergado | Alta | Momento em que o feedback foi mostrado, em `attempt`; configuração em `meta` | Contrato de resposta no IPC, serviço e tela de prática, fila de feedback pendente | Médio a alto |
| Intercalação | Alta | Nenhuma (configuração em `meta`) | Ordenação da fila de Estudar e de Praticar | Baixo a médio |
| Calibração | Alta | Coluna de confiança (anulável) em `attempt` | Tela de prática, estatísticas | Baixo a médio |

As mudanças de esquema cabem em uma migração única de workspace (`0004`), que acrescenta colunas anuláveis ou com padrão, sem reescrever os dados existentes. [mem: M-10]

### Constraint register

| ID | Restrição | Origem |
|---|---|---|
| C-1 | Stack: TypeScript `strict`, pnpm, Electron + React + Vite, validação com zod | [mem: M-4] |
| C-2 | Testes: Vitest (unidade) e Playwright no Electron; o LLM é sempre mockado | [mem: M-5] |
| C-3 | O renderer só fala com o núcleo por IPC tipado e validado; o app não abre porta de rede | [mem: M-9] |
| C-4 | Dados do usuário ficam fora da instalação; atualizar nunca os apaga, então a migração preserva os dados existentes | [mem: M-10] |
| C-5 | Fluxos com seleção de texto, diálogos nativos ou arquivos exigem teste e2e no Electron real | [mem: M-14] |
| C-6 | Mockups em HTML autocontido, com a paleta e os temas reais, abas por estado e valores fictícios | [mem: M-12] |
| C-7 | Textos exibidos ao usuário em pt-BR; código, comentários e commits em inglês; cabeçalho em arquivo novo | [mem: M-8] |
| C-8 | Nenhum `git push` até o fim da Construção, salvo pedido; commits atômicos | [mem: M-7] |
| C-9 | O padrão de cada prática preserva o comportamento atual (feedback imediato, sem intercalação, sem confiança) | [src: SM-3] |
| C-10 | Sem prazo definido | [src: A2] |

### RAID log

| ID | Tipo | Descrição | Mitigação ou ação | Dono |
|---|---|---|---|---|
| R-1 | Risco | Um consumidor de `attempt` esquecido conta erros do pré-teste como erros comuns | Mitigado por construção em 2.6 (ADR-1): o pré-teste vai para uma tabela própria e os cinco consumidores não mudam; basta um teste de que cada um ignora `pretest_attempt` | Construção |
| R-2 | Risco | Feedback "no dia seguinte": o estudante não volta e os pendentes se acumulam | Exibir pendentes em Hoje e definir o limite e o fallback em 2.3 | 2.3 |
| R-3 | Risco | Mudar o contrato de resposta no IPC quebra o renderer ou os e2e existentes | Esquemas zod compartilhados e e2e atualizados na mesma Unit | Construção |
| R-4 | Risco | A calibração acrescenta atrito (um clique extra por resposta) e reduz o uso | Opcional e desligada por padrão (C-9); decidir a interface em 1.6 e 2.5 | 1.6 |
| R-5 | Risco | Intercalação com sorteio torna os testes instáveis | Alternância determinística (rodízio por tópico ou material), sem `Math.random` | 2.3 |
| R-6 | Risco | Quatro itens Must com muita interface alargam o escopo | Esqueleto andante, Units independentes e a possibilidade de cortar por Unit em 2.7 | 2.7 |
| A-5 | Suposição | O pré-teste é iniciado pelo estudante em cada material; o app não rastreia leitura | — | confirmed: yes (gate 1.3) |
| A-6 | Suposição | Erros do pré-teste não contam em estatísticas, tópicos fracos, treino nem caderno de erros, e a questão continua "não vista" na prática normal | — | confirmed: yes (gate 1.3) |
| I-1 | Problema | O codekb está defasado (analisado em `240ed43`, o HEAD é `4e7cc4e`) | Atualizar em 2.1 junto com o usuário | 2.1 |
| I-2 | Problema | A linha de base dos testes ainda não foi rodada nesta intent | Rodar o comando de verificação em 2.1 e registrar as falhas anteriores | 2.1 |
| D-1 | Dependência | Geração da migração com `drizzle-kit` (`pnpm db:generate`) | Já é parte do fluxo do projeto | Construção |

### Go / no-go

**GO.** Nenhum bloqueio técnico, de dados ou de licença; todas as mudanças ficam no núcleo, no IPC e nas telas já existentes, com migração aditiva. O maior esforço está no feedback postergado (contrato de resposta e fila de pendentes) e na proteção das estatísticas contra os erros do pré-teste. [src: Q5, Q6]

### Assumptions & open questions

- A5 e A6 acima, definidas em 1.3 e confirmadas no gate. — confirmed: yes
- A granularidade da intercalação (por tópico, por material ou por tipo), o limite dos feedbacks pendentes e o que acontece com o pré-teste ao reiniciar ficam para 2.3.

## 1.4 Scope

### In scope

| Prática | Dentro do escopo | Origem |
|---|---|---|
| Pré-teste | Rodada de questões por material, iniciada pelo estudante, com os erros fora de estatísticas, tópicos fracos, treino e caderno de erros (A5, A6); resumo próprio ao fim da rodada | [src: Q5, Q6] |
| Feedback postergado | Três momentos para as questões, configuráveis: imediato (padrão), ao fim do bloco e no dia seguinte, com fila de feedback pendente e aviso em Hoje | [src: Q7] |
| Intercalação | Alternância de tópicos ou materiais na fila de Estudar (cards) e na de Praticar (questões), com opção de ligar e desligar | [src: Q9] |
| Calibração | Confiança informada antes de responder, apenas nas questões, e uma visão em Estatísticas que compara confiança e acerto | [src: Q8] |
| Transversal | Migração aditiva do workspace (`0004`), configurações em `meta`, textos em pt-BR, testes de unidade e e2e e atualização do guia `docs/guides/study-guide.md` | [src: C-4, C-5, C-7] |

### Out of scope

- Elaboração, geração (digitar a resposta do card), reflexão e mnemônicos. [src: Q4]
- Mudanças no algoritmo FSRS e no gerador de itens. [src: Q4]
- Confiança antes de revelar nos cards (a calibração dos cards fica no backlog). [src: Q8]
- Rastreio automático de leitura e sugestão automática de pré-teste em material não lido. [src: Q6]
- Feedback postergado nos cards: o feedback deles já é imediato por natureza (revelar e avaliar). [src: A3]

### MVP boundary

O MVP é o escopo inteiro: as quatro práticas entregues por completo. Não há ordem de corte: o usuário respondeu "nada cai". [src: Q10]

Consequência: o risco R-6 (escopo largo) passa a ser tratado só por sequenciamento. Em 2.7, cada prática vira uma Unit independente, e a entrega é incremental, com esqueleto andante e verificação por Unit, para que um atraso em uma Unit não bloqueie as demais.

### Prioritized intent backlog

| # | Item | Prioridade | Situação |
|---|---|---|---|
| 1 | Pré-teste | Must | No escopo |
| 2 | Feedback postergado (imediato, fim do bloco, dia seguinte) | Must | No escopo |
| 3 | Intercalação (Estudar e Praticar) | Must | No escopo |
| 4 | Calibração nas questões | Must | No escopo |
| 5 | Calibração nos cards | Could | Backlog, intent futura |
| 6 | Rastreio de leitura e sugestão automática de pré-teste | Could | Backlog, intent futura |
| 7 | Geração: digitar a resposta do card antes de revelar | Could | Backlog, intent futura |
| 8 | Reflexão ao fim da sessão | Could | Backlog, intent futura |

### Assumptions & open questions

- A7: "bloco" do feedback ao fim do bloco é uma sessão de prática (uma sequência de questões respondida sem sair da tela de Praticar); a definição exata e o que fazer quando o estudante abandona o bloco ficam para 2.3. — confirmed: no
- A8: a intercalação é uma opção por sessão, com padrão desligado (C-9); a granularidade (tópico, material ou tipo) fica para 2.3. — confirmed: no
## 2.3 Requirements

Requisitos em linguagem de comportamento observável, sem solução técnica (a solução está em `design.md`). Prioridade em MoSCoW; todos os itens de escopo são Must, conforme 1.4, salvo indicação. [src: 1.4]

### Functional

#### Pré-teste

| ID | Requisito | Rationale | Acceptance criteria | Priority | Source |
|---|---|---|---|---|---|
| FR-1 | O app deve oferecer, na Biblioteca, um botão "Pré-teste" por material, habilitado quando o material tem ao menos uma questão aprovada que o estudante nunca respondeu na prática, e desabilitado, com a dica do motivo, caso contrário. | O estudante inicia o pré-teste por material (A5). | Given um material com questões aprovadas nunca respondidas, When abro a Biblioteca, Then o botão está habilitado. Given um material sem questões aprovadas, Then o botão está desabilitado e a dica explica que é preciso gerar e aprovar questões. | Must | [src: Q6, A5] |
| FR-2 | Ao iniciar o pré-teste, o app deve pedir a quantidade de questões (de 1 a 20, padrão 10, limitada às disponíveis) e montar a rodada com questões aprovadas do material nunca respondidas na prática. | Contato anterior ao estudo; o tamanho da rodada é do estudante. | Given 15 questões elegíveis, When escolho 10, Then a rodada tem 10 questões elegíveis. Given 4 elegíveis, When escolho 10, Then a rodada tem 4 e o app informa o limite. | Must | [src: Q16] |
| FR-3 | Durante a rodada, o app não deve mostrar gabarito, comentário nem correção; deve mostrar uma faixa informando que a rodada não conta nas estatísticas; e deve permitir pular e encerrar a rodada. | O pré-teste vale pelo esforço de tentar, com feedback só ao fim. | Given uma rodada em andamento, When respondo uma questão, Then a tela registra a resposta e avança sem revelar se acertei. | Must | [src: Q5] |
| FR-4 | As respostas do pré-teste devem ser gravadas à parte, sem entrar na prática, e não devem contar em estatísticas (por tópico, por material, retenção e atividade), tópicos fracos, treino, caderno de erros, fila e contagens da prática; as questões continuam "não vistas" na prática normal. | O pré-teste não deve distorcer o que mede o estudo real (A6). | Given uma questão errada no pré-teste, When abro Estatísticas, Erros e Praticar, Then ela não aparece como erro, não altera nenhum acerto e continua na fila de não vistas. | Must | [src: A6] |
| FR-5 | Ao terminar ou encerrar a rodada, o app deve mostrar um resumo com acertos, resposta dada, gabarito, comentário, fonte (com "Ver no PDF" quando houver) e, se a calibração estiver ligada, a confiança, e oferecer um atalho para ler o material. | O feedback do pré-teste vem ao fim da rodada. | Given uma rodada concluída com 8 respostas, When o resumo abre, Then mostra as 8 com gabarito e comentário. | Must | [src: Q5] |
| FR-6 | O pré-teste deve usar sempre o feedback ao fim da rodada, qualquer que seja o modo de feedback configurado para a prática. | Evita que o modo "imediato" desfaça o pré-teste. | Given o modo imediato configurado, When faço um pré-teste, Then não vejo o gabarito até o resumo. | Must | [src: 1.6] |

#### Feedback postergado

| ID | Requisito | Rationale | Acceptance criteria | Priority | Source |
|---|---|---|---|---|---|
| FR-7 | O app deve permitir configurar, por workspace, o momento do feedback das questões da prática: imediato (padrão), ao fim do bloco ou no dia seguinte. | Feedback postergado ajuda a retenção, sem impor a mudança. | Given o padrão, When respondo, Then o feedback é imediato como hoje. Given "ao fim do bloco", Then muda conforme FR-8. | Must | [src: Q7, C-9] |
| FR-8 | No modo "ao fim do bloco", ao responder uma questão o app deve registrar a resposta sem revelar o gabarito e sem permitir alterá-la, e deve mostrar o feedback de todas as respondidas quando o bloco terminar ou quando o estudante pedir "Ver o feedback agora". O bloco é a fila de questões carregada (até 20). | Postergar o feedback até o fim do bloco. | Given um bloco de 20, When respondo as 20, Then abre o feedback do bloco. Given 8 respondidas, When peço o feedback agora, Then vejo o das 8. | Must | [src: Q7, A7] |
| FR-9 | No modo "no dia seguinte", ao responder o app deve registrar a resposta e informar que o feedback fica disponível amanhã; o feedback deve ser liberado na virada do dia de estudo (4h local). | O dia seguinte usa a mesma virada do dia de estudo. | Given uma resposta às 22h, When são 3h59 do dia seguinte, Then não há feedback; às 4h00, há. | Must | [src: Q7] |
| FR-10 | O app deve manter as respostas aguardando feedback e mostrar, em Hoje, um aviso com a quantidade liberada para ver, levando a uma tela de feedback pendente com o gabarito, o comentário e a fonte de cada uma; abrir o feedback marca as respostas como vistas. Não há limite nem expiração. Um bloco abandonado libera seu feedback na próxima visita à prática. | Nada se perde, e o estudante volta ao feedback quando quiser. | Given 16 liberadas, When abro Hoje, Then vejo "16 respostas aguardam feedback". Given que abri o feedback, Then o contador zera. | Must | [src: Q17] |
| FR-11 | A correção de cada resposta (certa ou errada) deve ser calculada e gravada no momento da resposta, e as estatísticas devem contá-la nesse momento, não quando o feedback é mostrado. | O feedback adiado muda só o que se vê e quando. | Given uma resposta com feedback pendente, When abro Estatísticas, Then ela já conta. | Must | [src: 1.3] |
| FR-12 | Do feedback, para respostas erradas (fora do pré-teste), o app deve manter a ação "Fazer um card desta questão". | Preserva a ligação com o caderno de erros. | Given uma errada no feedback do bloco, Then a ação está disponível e cria o card. | Should | [src: codekb interactions] |

#### Intercalação

| ID | Requisito | Rationale | Acceptance criteria | Priority | Source |
|---|---|---|---|---|---|
| FR-13 | O app deve oferecer a opção "Misturar tópicos" em Estudar (cards) e em Praticar (questões), ligada por sessão, com o padrão definido em Configurações (desligado). | Intercalar ajuda a discriminar conceitos. | Given o padrão, When abro Estudar, Then a opção vem desligada. Given que o padrão foi ligado, Then vem ligada. | Must | [src: Q9, Q14, A8] |
| FR-14 | Com a opção ligada, dentro de cada parte da fila (em Estudar: aprendizado, revisões e novos; em Praticar: não vistas, erradas e refazer) o app deve alternar os tópicos em rodízio, mantendo a ordem original dentro de cada tópico; itens sem tópico formam um grupo próprio; o estudante pode alternar por tópico ou por material. | Rodízio dentro das partes respeita as prioridades atuais. | Given novos de dois tópicos A (4 itens) e B (2), When misturo por tópico, Then a ordem é A1 B1 A2 B2 A3 A4. | Must | [src: Q14] |
| FR-15 | A intercalação não deve alterar a prioridade entre as partes da fila, os limites diários nem o agendamento; e a opção deve ficar desabilitada quando há filtro de tópico ou material ativo. | Mudar só a ordenação. | Given aprendizado e novos, When misturo, Then os cards em aprendizado vencidos continuam antes dos novos. | Must | [src: 1.6] |

#### Calibração

| ID | Requisito | Rationale | Acceptance criteria | Priority | Source |
|---|---|---|---|---|---|
| FR-16 | O app deve permitir ligar ou desligar, por workspace, a pergunta de confiança nas questões (padrão desligado). | Evita atrito para quem não quer. | Given o padrão, When respondo, Then não pergunta a confiança. | Must | [src: C-9] |
| FR-17 | Com a pergunta ligada, antes de responder uma questão (inclusive no pré-teste) o estudante deve escolher entre três níveis (chute, acho que sei, tenho certeza), e "Responder" fica desabilitado até a escolha; o nível é gravado com a resposta. | Confiança obrigatória enquanto estiver ligada. | Given a pergunta ligada e nenhuma escolha, Then "Responder" está desabilitado. | Must | [src: Q8, Q15] |
| FR-18 | Ao mostrar o feedback de uma resposta errada em que o estudante marcou "tenho certeza", o app deve destacar a divergência. | Confrontar a percepção com o resultado. | Given uma errada com "tenho certeza", Then o feedback mostra o destaque. | Must | [src: 1.6] |
| FR-19 | Estatísticas deve ter uma seção de calibração que, para cada nível de confiança nos últimos 30 dias, mostra o número de respostas e o acerto (excluindo o pré-teste), sinaliza excesso de confiança e lista os tópicos com mais respostas seguras erradas. | Medida objetiva da sensação de saber. | Given respostas com confiança, When abro Estatísticas, Then vejo a tabela por nível. | Must | [src: 1.6, A15] |
| FR-20 | Sem respostas com confiança, a seção de calibração deve mostrar um estado vazio que explica como ligar a pergunta. | Orientação ao estudante. | Given nenhuma resposta com confiança, Then a seção explica como ligar. | Should | [src: 1.6] |

#### Transversais

| ID | Requisito | Rationale | Acceptance criteria | Priority | Source |
|---|---|---|---|---|---|
| FR-21 | Configurações deve ter uma seção "Práticas de estudo" por workspace com o modo de feedback, a pergunta de confiança e a intercalação por padrão, e uma ação para restaurar os padrões. | Um lugar só para as opções. | Given que salvei, When reabro o app, Then as opções persistem. | Must | [src: 1.6] |
| FR-22 | As quatro práticas devem funcionar sem provedor de IA e sem internet. | Como Estudar e Praticar hoje. | Given sem provedor, Then todas as quatro funcionam. | Must | [src: 1.6] |
| FR-23 | O guia `docs/guides/study-guide.md` deve ser atualizado para descrever as quatro práticas dentro do app. | Documentação alinhada. | Given a entrega, Then o guia descreve pré-teste, feedback, intercalação e calibração sem contornos manuais. | Should | [src: 1.4] |

### Non-functional

| ID | Category | Measurable target | Verification | Source |
|---|---|---|---|---|
| NFR-1 | Compatibilidade de dados | Um workspace existente (migração 0003) abre na nova versão sem perda de dados; as respostas antigas passam a contar como já vistas e sem confiança | Teste de migração com banco 0003 populado | [mem: M-10] |
| NFR-2 | Comportamento padrão | Com os padrões, o fluxo de Estudar e de Praticar é idêntico ao atual | Os testes existentes passam sem alteração de expectativa | [src: SM-2, SM-3] |
| NFR-3 | Desempenho | Montar a fila intercalada com 5.000 itens aprovados leva menos de 200 ms; gravar uma resposta, menos de 50 ms | Teste de desempenho no núcleo com 5.000 itens | [src: A14] |
| NFR-4 | Determinismo | A mesma entrada produz sempre a mesma ordem intercalada; sem sorteio | Teste com várias execuções iguais | [src: R-5] |
| NFR-5 | Acessibilidade | Tudo operável por teclado (inclusive o seletor de confiança); o registro da resposta e o feedback são anunciados (`role="status"`); contraste das faixas de pelo menos 4,5:1 nos dois temas | Testes de componente e e2e de teclado; checagem de contraste | [src: 1.6] |
| NFR-6 | Privacidade e rede | Nenhuma chamada de rede nova; as quatro práticas funcionam offline | Revisão do código e teste sem rede | [mem: M-9] |
| NFR-7 | Contrato | Todo canal novo ou alterado valida entrada e saída com zod, e uma mudança incompatível sobe `CONTRACT_VERSION` | Teste de contrato e do roteador | [mem: M-9] |
| NFR-8 | Idioma | Todo texto novo exibido ao usuário está em pt-BR, em `strings.ts` | Revisão e teste de strings | [mem: M-8] |
| NFR-9 | Testes | Cobertura global de linhas, instruções, ramos e funções mantém o limite de 80%; cada prática tem um spec e2e no Electron real além dos testes de unidade e de componente | `pnpm test --coverage` e `pnpm e2e` | [mem: M-15] |
| NFR-10 | Backup | As novas colunas e configurações entram no backup e na restauração do workspace | Teste de exportar e importar com dados novos | [src: codekb data-model] |

### Constraints, out of scope and glossary

- **Restrições:** C-1 a C-10 (1.3). **Fora do escopo:** conforme 1.4.
- **Glossário:** *bloco* é a fila de questões carregada em Praticar (até 20); *pré-teste* é uma rodada de questões de um material antes de estudá-lo; *feedback pendente* é uma resposta registrada cujo gabarito ainda não foi mostrado; *confiança* é o nível que o estudante marca antes de responder (chute, acho que sei, tenho certeza); *dia de estudo* vira às 4h local.

### Assumptions & open questions

- A7 e A8 resolvidas: o bloco é a fila carregada (até 20), e a intercalação é uma opção por sessão, com rodízio por tópico ou por material dentro de cada parte da fila. [src: Q14, A7, A8]
- A13: a rodada de pré-teste usa as questões aprovadas do material que o estudante nunca respondeu na prática; o padrão de quantidade é 10. — confirmed: no
- A14: o teto de 5.000 itens aprovados do NFR-3 é uma estimativa de uso grande (o baseline não mede isso). — confirmed: no
- A15: "excesso de confiança" quando o acerto de "tenho certeza" fica abaixo de 80% ou o de "acho que sei" abaixo de 60%; os limiares são definidos em 2.6 e ajustáveis depois. — confirmed: no

## 2.4 User stories

### Personas

| ID | Persona | Contexto |
|---|---|---|
| P-1 | Estudante com prova marcada | Prepara um conjunto fechado de materiais, com data de prova e questões no estilo de prova. Quer sair da prova sabendo e ver onde ainda erra. |
| P-2 | Autodidata contínuo | Estuda um assunto ao longo de meses, sem prova. Quer reter por mais tempo e usar bem o tempo diário de estudo. |

[src: 1.1, Q2]

### US-1 Testar-me antes de ler (FR-1, FR-2, FR-3, FR-4, FR-5, FR-6)  Persona: P-1

As estudante com prova marcada, I want fazer um pré-teste de um material antes de estudá-lo, so that eu descubra o que já sei e leia prestando atenção ao que errei, sem que isso suje as minhas estatísticas.

- AC1: Given um material com questões aprovadas nunca respondidas, When abro a Biblioteca, Then "Pré-teste" está habilitado; Given um material sem elas, Then está desabilitado e explica o motivo.
- AC2: Given que escolho 10 questões, When a rodada começa, Then vejo 10 questões elegíveis, sem gabarito nem correção após responder, e uma faixa informando que a rodada não conta nas estatísticas.
- AC3: Given que errei questões no pré-teste, When abro Estatísticas, Erros e Praticar, Then elas não aparecem como erros, não alteram o acerto e continuam como novas.
- AC4: Given a rodada concluída ou encerrada, Then o resumo mostra acertos, respostas, gabarito, comentário e fonte, com um atalho para ler o material.
- AC5: Given o modo de feedback imediato configurado, When faço o pré-teste, Then o gabarito continua só no resumo.

### US-2 Ver o gabarito só ao fim do bloco (FR-7, FR-8, FR-11, FR-12)  Persona: P-1

As estudante com prova marcada, I want responder um bloco de questões e ver o gabarito só no fim, so that eu me esforce para lembrar sem checar a resposta a cada questão.

- AC1: Given o modo "ao fim do bloco", When respondo uma questão, Then vejo "Resposta registrada" sem gabarito e não posso alterá-la.
- AC2: Given um bloco de 20, When respondo as 20 (ou peço "Ver o feedback agora" com 8), Then vejo o feedback de todas as respondidas, com gabarito, comentário e fonte.
- AC3: Given uma resposta com feedback pendente, When abro Estatísticas, Then ela já conta.
- AC4: Given uma resposta errada no feedback, Then posso fazer um card da questão.

### US-3 Receber o gabarito no dia seguinte (FR-9, FR-10)  Persona: P-2

As autodidata contínuo, I want ver o gabarito só no dia seguinte, so that eu consolide o conteúdo com um intervalo maior antes de conferir.

- AC1: Given o modo "no dia seguinte" e uma resposta às 22h, When são 3h59 do dia seguinte, Then não há feedback; às 4h00, o feedback está liberado.
- AC2: Given 16 respostas liberadas, When abro Hoje, Then vejo "16 respostas aguardam feedback" e abro a tela de feedback pendente; ao abrir, o contador zera.
- AC3: Given que não voltei por vários dias, Then as respostas continuam pendentes, sem expirar, e um bloco abandonado libera o feedback na próxima visita à prática.

### US-4 Misturar os assuntos (FR-13, FR-14, FR-15)  Persona: P-2

As autodidata contínuo, I want misturar os tópicos na fila de estudo e na prática, so that eu pratique distinguir os conceitos em vez de estudar um assunto por vez.

- AC1: Given o padrão, When abro Estudar, Then "Misturar tópicos" vem desligada; Given o padrão ligado nas configurações, Then vem ligada.
- AC2: Given novos de dois tópicos A (4 itens) e B (2), When misturo por tópico, Then a ordem é A1 B1 A2 B2 A3 A4; por material, o rodízio é por material.
- AC3: Given cards em aprendizado e novos, When misturo, Then os em aprendizado vencidos continuam antes dos novos e os limites diários não mudam.
- AC4: Given um filtro de tópico ou material ativo, Then a opção fica desabilitada.

### US-5 Dizer o quanto estou seguro (FR-16, FR-17, FR-18)  Persona: P-1

As estudante com prova marcada, I want informar a minha confiança antes de responder, so that eu perceba quando estou segura demais de uma resposta errada.

- AC1: Given o padrão, When respondo, Then não pergunta a confiança.
- AC2: Given a pergunta ligada, When ainda não escolhi um nível, Then "Responder" está desabilitado; o nível escolhido é gravado com a resposta (também no pré-teste).
- AC3: Given uma resposta errada com "tenho certeza", Then o feedback destaca a divergência.

### US-6 Ver como a minha confiança se compara ao acerto (FR-19, FR-20)  Persona: P-2

As autodidata contínuo, I want ver em Estatísticas a minha confiança contra o meu acerto, so that eu calibre a sensação de saber e escolha onde reforçar.

- AC1: Given respostas com confiança nos últimos 30 dias, When abro Estatísticas, Then vejo, por nível, respostas e acerto (sem o pré-teste), o aviso de excesso de confiança e os tópicos com mais respostas seguras erradas.
- AC2: Given nenhuma resposta com confiança, Then a seção explica como ligar a pergunta.

### US-7 Ajustar as práticas ao meu jeito (FR-21)  Persona: P-1, P-2

As estudante, I want configurar o momento do feedback, a pergunta de confiança e a intercalação padrão num só lugar, so that eu adote só o que me serve e volte ao padrão quando quiser.

- AC1: Given que salvei as opções, When reabro o app, Then elas persistem por workspace.
- AC2: Given a ação "Restaurar padrões", Then voltam o feedback imediato, a confiança desligada e a intercalação desligada.

### US-8 Estudar sem internet nem provedor de IA (FR-22)  Persona: P-1, P-2

As estudante, I want usar as quatro práticas sem internet e sem provedor de IA configurado, so that eu estude em qualquer lugar, como já faço em Estudar e Praticar.

- AC1: Given nenhum provedor configurado e sem rede, Then pré-teste, feedback postergado, intercalação e calibração funcionam com as questões e os cards já aprovados.

### US-9 Aprender a usar as práticas (FR-23)  Persona: P-1, P-2

As estudante, I want um guia que explique as práticas dentro do app, so that eu saiba usar cada uma sem contornos manuais.

- AC1: Given a entrega, Then `docs/guides/study-guide.md` descreve pré-teste, feedback postergado, intercalação e calibração como funcionalidades do app.

### Mapa de cobertura (FR para história)

| FR | História | FR | História |
|---|---|---|---|
| FR-1 a FR-6 | US-1 | FR-16 a FR-18 | US-5 |
| FR-7, FR-8, FR-11, FR-12 | US-2 | FR-19, FR-20 | US-6 |
| FR-9, FR-10 | US-3 | FR-21 | US-7 |
| FR-13 a FR-15 | US-4 | FR-22 | US-8 |
|  |  | FR-23 | US-9 |

Todo FR tem ao menos uma história e toda história liga a ao menos um FR. Os NFR-1 a NFR-10 entram nas Definições de Pronto das Units (2.7).

### Assumptions & open questions

- Nenhuma nova. A13 a A15 seguem abertas.
