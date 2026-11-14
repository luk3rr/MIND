# Requirements — study-time-pdf-viewer

## Original request

> Quero adicionar na app um sistema para permitir contabilizar o tempo de estudo. Além disso, já que os arquivos da base de conhecimento são salvos, por exemplo, os pdfs, quero permitir que a pessoa abra o pdf pelo app, podendo utiliza-lo de consulta, não apenas o texto cru extraído dos documentos.

## 1.1 Intent & stakeholders

**Intenção (negócio).** Dois acréscimos ao MIND, sem mudar as regras de geração, FSRS nem verificação de fonte:

1. **Tempo de estudo**: medir quanto tempo a pessoa de fato estuda (revisão de cartões, resolução de questões e leitura de materiais), de forma automática e também manual, e mostrar isso com metas e estatísticas. [src: Original request]
2. **Leitor de PDF no app**: hoje o app guarda o arquivo original de cada material, mas só exibe o texto extraído em blocos (`MaterialPreviewPage`). A pessoa passa a abrir o PDF de verdade, com layout, imagens e fórmulas, para usar como consulta. [src: Original request; src/renderer/src/pages/MaterialPreviewPage.tsx]

**Problemas a resolver.**

- P1. Não existe noção de tempo de estudo; só contagens de cartões e questões. [src: Q1]
- P2. O texto cru extraído perde figuras, tabelas, fórmulas e a paginação; para consultar o material é preciso sair do app. [src: Original request]
- P3. Cartões e questões citam uma página de origem, mas não levam o leitor até lá no documento real. [src: Original request, inferido; a confirmar em 1.4]

**Decisões do autor (Q1–Q5, 2026-11-14).**

| ID | Decisão |
|---|---|
| D-1 | Contagem **automática + manual**: o app conta sozinho enquanto há atividade de estudo e há também um cronômetro manual iniciar/pausar/encerrar. [src: Q1] |
| D-2 | O tempo é guardado **por workspace, por tópico e no total global**. [src: Q2] |
| D-3 | O tempo aparece na **tela Hoje**, na **barra de status**, em **Estatísticas** e numa **meta diária** configurável. [src: Q3] |
| D-4 | O **PDF abre dentro da janela do app**, pode **abrir também em janela separada do app** e **no leitor padrão do sistema**. [src: Q4] |
| D-5 | Para materiais que não são PDF (DOCX, Markdown, texto, web) mantém-se a prévia de texto e acrescenta-se **abrir o arquivo original no app padrão do sistema**; sem leitor embutido de DOCX. [src: Q5] |
| D-6 | O contador **pausa após ~2 min sem interação ou quando a janela perde o foco** (limite configurável). [src: Q6] |

**Critérios de sucesso (mensuráveis).** [src: Q7]

| ID | Critério | Como verificar |
|---|---|---|
| SC-1 | O tempo registrado bate com o uso real (erro ≤ ±1 min por hora de estudo) | Testes com relógio simulado e conferência manual com cronômetro externo |
| SC-2 | Um PDF de ~200 páginas mostra a primeira página em < 2 s e tudo roda local, sem rede nem porta aberta | Medição manual e inspeção (`ss -ltnp`), CSP mantida |
| SC-3 | As sessões de tempo entram no backup e voltam na restauração do workspace | Teste de backup/restauração com sessões gravadas |
| SC-4 | Nenhuma regressão de testes nem de cobertura em relação ao limite atual do projeto | `pnpm test --coverage` verde |

**Partes interessadas.**

| Papel | Quem | Decide / afetado |
|---|---|---|
| Decisor e usuário principal | Autor do MIND | Decide escopo e aprova os gates |
| Usuários finais | Pessoas que estudam com os próprios materiais | Afetadas pelas telas novas e pelos dados de tempo |
| Comunidade open source | Contribuidores futuros | Consultados: licença AGPL-3.0 e novas dependências (M-6) |

**Não objetivos.** Anotações, marcações e notas dentro do PDF; leitor embutido de DOCX, Markdown ou web; sincronização entre dispositivos; relatórios de produtividade além de dia/semana/tópico; mudar geração, FSRS ou verificação de fonte.

### Assumptions & open questions

- A1 (1.1): "Atividade de estudo" automática inclui revisão de cartões, resolução de questões e leitura de material no app; o chat e as configurações não contam. — confirmed: no (a confirmar em 2.3)
- A2 (1.1): O tempo de leitura de um PDF é atribuído ao material e, quando houver tópico associado, também ao tópico. — confirmed: no (a confirmar em 2.3)
- A3 (1.1): O tempo em janela separada do leitor conta igual ao da janela principal. — confirmed: no

## 1.3 Feasibility, constraints & RAID

**Avaliação.** Viável. O núcleo já tem o que falta: o arquivo original fica em `<workspace>/files/` (`material.stored_path`), entra no backup, o `mupdf` (WASM, AGPL) já é dependência e a UI já tem rotas, estatísticas e barra de status. [src: src/core/db/workspace-schema.ts; src/core/workspaces/archive.ts; package.json]

**Restrições.**

| ID | Restrição | Origem |
|---|---|---|
| C-1 | Nenhuma porta de rede; o renderer só fala com o núcleo por IPC tipado e validado com zod | [mem: M-9] |
| C-2 | Dependências novas compatíveis com AGPL-3.0 | [mem: M-6] |
| C-3 | CSP atual (`default-src 'self'`, `img-src 'self' data:`, sem `blob:`) só pode ser relaxada com justificativa e teste | [src: src/main/security.ts] |
| C-4 | Dados do usuário ficam fora da instalação e mudanças de esquema entram como migração Drizzle | [mem: M-10; src: src/core/db/migrations] |
| C-5 | Código, comentários e commits em inglês; textos da UI em pt-BR; cabeçalho de arquivo; Conventional Commits; nada de dados pessoais nos arquivos | [mem: M-3, M-8] |
| C-6 | Verificação: lint, format, typecheck e testes com cobertura; LLM sempre mockado | [mem: M-5] |

**RAID.**

| ID | Tipo | Item | Mitigação |
|---|---|---|---|
| R-1 | Risco | PDF grande ou escaneado lento ou pesado em memória | Renderizar por página sob demanda; medir SC-2 |
| R-2 | Risco | Entregar bytes do PDF ao renderer pode violar C-1/C-3 se feito de forma frouxa | Decidir em 2.6 (ADR): leitor no renderer com bytes por IPC, ou páginas renderizadas pelo `mupdf` no núcleo |
| R-3 | Risco | Contagem de tempo imprecisa (suspensão do computador, relógio, várias janelas) | Intervalos fechados por eventos, limite de ociosidade e teste com relógio simulado |
| R-4 | Risco | Abrir arquivo no app do sistema expõe um caminho arbitrário | Abrir só o `stored_path` de um material existente, resolvido dentro do workspace |
| A-1 | Premissa | Os PDFs originais continuam guardados (já é assim) | Confirmado no código |
| D-A | Dependência | Biblioteca de visualização de PDF (a escolher em 2.6) | ADR com licença e CSP |

**Recomendação: GO.**

### Assumptions & open questions

- A4 (1.3): O app pode usar a API do Electron para abrir arquivos no aplicativo padrão (`shell.openPath`) sem violar a política de segurança do app. — confirmed: no

## 1.4 Scope

**Dentro (MVP).**

- Sessões de estudo: gravar, listar e somar; cronômetro manual; contagem automática por atividade com pausa por ociosidade ou perda de foco; atribuição a workspace e tópico; meta diária. [D-1, D-2, D-6]
- Exibição: cartão na tela Hoje, indicador na barra de status, gráficos por dia e por tópico em Estatísticas. [D-3]
- Leitor de PDF na janela do app, em janela separada e no app padrão do sistema; abrir direto na página citada por um cartão, questão ou trecho. [D-4, P3]
- Para qualquer material: botão "abrir arquivo original" no app padrão do sistema. [D-5]
- Sessões incluídas no backup e na restauração. [SC-3]

**Fora.** Ver "Não objetivos" em 1.1.

**Fronteira do MVP.** Sessões automáticas e manuais, uma meta diária e as três visões (Hoje, barra, Estatísticas); leitor com navegação por página, zoom, busca e cópia de texto, nos três modos de abertura.

**Backlog priorizado.**

1. Anotações e destaques em PDF.
2. Metas semanais e sequências de dias estudados.
3. Leitor de DOCX/Markdown embutido.
4. Exportar o histórico de tempo.

### Assumptions & open questions

- A5 (1.4): "Abrir na página citada" vale para cartões, questões e resultados de busca/chat que tenham `page` e `chunk`. — confirmed: no

## 2.3 Requirements

Prioridade MoSCoW: **M** deve · **S** deveria · **C** poderia. Todos testáveis; critérios em formato verificável. [src: 1.1, 1.4, Q8–Q10 de 2.3]

### Tempo de estudo

| ID | Requisito | Critério de aceite | P | Origem |
|---|---|---|---|---|
| FR-1 | O app registra **sessões** de estudo: intervalo com início, fim, origem (automática ou manual), workspace e, quando existirem, material e tópico | Após estudar 5 min, existe um intervalo gravado com esses campos | M | D-1, D-2 |
| FR-2 | **Cronômetro manual** com iniciar, pausar, retomar e encerrar; ao iniciar pode-se escolher um tópico | Iniciar → 10 s → pausar → 10 s → retomar → encerrar registra 20 s em dois intervalos ou um, sem o tempo pausado | M | D-1 |
| FR-3 | **Contagem automática** enquanto a pessoa revisa cartões, pratica questões ou lê um PDF ou prévia de material dentro do app | Abrir Estudar, avaliar um cartão e esperar 30 s gera intervalo automático com origem "cartões" | M | D-1, Q8 |
| FR-4 | A contagem automática **pausa** após o limite de ociosidade (padrão 120 s, configurável de 30 s a 10 min) ou quando a janela perde o foco, e retoma na próxima interação; o tempo ocioso não é contado (o intervalo termina na última interação) | Sem interação por 130 s com limite 120 s, o intervalo termina em t=interação+0, não em t+120 | M | D-6 |
| FR-5 | Há **no máximo uma sessão ativa**; automática e manual no mesmo instante não contam duas vezes | Cronômetro manual ligado durante revisão de cartões soma o tempo uma vez só | M | SC-1 |
| FR-6 | Fechar o app, trocar de workspace ou suspender o computador **fecha o intervalo** com segurança; um travamento perde no máximo o último minuto | Matar o processo durante a contagem preserva o tempo até o último gravado (≤ 60 s de perda) | M | SC-1 |
| FR-7 | **Tela Hoje** mostra o tempo estudado hoje, o progresso da meta e o controle do cronômetro | Hoje exibe `hh:mm:ss`, barra de meta e botão iniciar/pausar | M | D-3 |
| FR-8 | **Barra de status** mostra o cronômetro ativo (tempo, tópico, estado) e permite pausar/encerrar | Visível em todas as telas do workspace enquanto houver sessão | M | D-3 |
| FR-9 | **Meta diária de tempo** por workspace (minutos), padrão 60, editável em Configurações, separada da meta de cartões atual | Alterar para 90 reflete na barra de Hoje; a meta de cartões não muda | M | D-3, Q10 |
| FR-10 | **Estatísticas > Tempo**: total e média por dia no período (7/30 dias), tempo por dia, por tópico e por material | Dados de teste conhecidos produzem totais exatos nos três recortes | M | D-3 |
| FR-11 | As sessões entram no **backup** e voltam na **restauração**; backups antigos sem sessões continuam importáveis | Exportar, restaurar em outro workspace e comparar totais; importar um `.zip` antigo funciona | M | SC-3 |
| FR-12 | O "dia" de uma sessão segue a mesma regra do dia de estudo já usada (`day`, fuso local) | Sessão após meia-noite local cai no dia seguinte | M | codekb |
| FR-13 | Atribuição: revisão/prática → tópico do item; leitura → material (sem tópico); cronômetro manual → tópico escolhido (opcional) | Cada origem grava só os campos que conhece | M | Q9 |
| FR-14 | Excluir uma sessão registrada (histórico simples em Estatísticas) | Excluir remove o intervalo e atualiza totais | C | inferido |

### Leitor de PDF e arquivos originais

| ID | Requisito | Critério de aceite | P | Origem |
|---|---|---|---|---|
| FR-15 | **Abrir o PDF original** dentro da janela do app a partir da Biblioteca, mostrando o layout real (imagens, tabelas, fórmulas, fontes) | Abrir um PDF com figura exibe a figura; a página mostrada é igual à do arquivo | M | D-4 |
| FR-16 | Navegar por página (anterior, próxima, ir para N), rolar e dar zoom (de 50% a 300% e "ajustar à largura") | Ir para a página 37 mostra a 37; zoom 200% amplia | M | D-4 |
| FR-17 | **Buscar texto** no PDF, listar ocorrências e saltar entre elas | Buscar um termo presente na p. 12 leva à p. 12 | M | D-4 |
| FR-18 | **Selecionar e copiar texto** do PDF | Selecionar um parágrafo e copiar coloca o texto na área de transferência | S | D-4 |
| FR-19 | **Abrir em janela separada** do app (leitor com a mesma navegação) sem fechar a janela principal | Janela nova abre o mesmo PDF na mesma página; a principal continua usável | M | D-4 |
| FR-20 | **Abrir no aplicativo padrão do sistema** | O arquivo abre no visualizador do sistema; erro claro se não houver | M | D-4 |
| FR-21 | Para **qualquer material** (DOCX, MD, texto, web), "Abrir original" usa o aplicativo padrão do sistema; a prévia de texto atual permanece | Botão presente nos materiais não-PDF e abre o arquivo salvo | M | D-5 |
| FR-22 | **Abrir na página citada**: de um cartão, questão, resultado de busca ou citação do chat, "Ver no PDF" abre o leitor na página da fonte; destaca o trecho citado quando localizável | Cartão com fonte p. 37 abre na p. 37; trecho destacado se encontrado | M (página) · S (destaque) | P3 |
| FR-23 | Lembrar a **última página lida** por material e retomar dela | Reabrir o PDF volta à última página | C | inferido |
| FR-24 | **Erros**: arquivo ausente, corrompido ou protegido por senha mostram mensagem em pt-BR e oferecem a alternativa possível (abrir no sistema, reimportar) | Remover o arquivo do disco e abrir mostra o erro, sem travar | M | codekb |

### Não funcionais

| ID | Requisito | Critério | P |
|---|---|---|---|
| NFR-1 | **Precisão do tempo** | Erro ≤ ±1 min por hora em teste com relógio simulado e conferência manual | M |
| NFR-2 | **Desempenho do leitor** | Primeira página de um PDF de ~200 páginas em < 2 s; troca de página em < 500 ms; só páginas visíveis e vizinhas ficam renderizadas | M |
| NFR-3 | **Local e sem rede** | Nenhuma porta aberta nem chamada de rede nova; qualquer mudança na CSP é mínima, justificada em ADR e testada | M |
| NFR-4 | **Segurança de caminhos** | Abrir arquivo e janela do leitor só resolvem arquivos de materiais existentes dentro da pasta do workspace; entradas com `..` ou caminhos absolutos são rejeitadas | M |
| NFR-5 | **Privacidade** | Dados de tempo ficam só no computador; não entram em prompts do LLM nem em logs com nome de arquivo ou conteúdo | M |
| NFR-6 | **Acessibilidade** | Cronômetro e leitor operáveis por teclado, com rótulos acessíveis; estado do cronômetro não depende só de cor | S |
| NFR-7 | **Testabilidade** | Relógio e fonte de atividade injetáveis; cobertura ≥ limite atual (80% e baseline 95,5% linhas) | M |
| NFR-8 | **Compatibilidade de dados** | Migração do `workspace.db` preserva dados existentes; sem perda em workspaces atuais | M |
| NFR-9 | **Licença** | Dependências novas compatíveis com AGPL-3.0 | M |
| NFR-10 | **Empacotamento** | O `.deb` continua dentro dos limites do build anterior (≤ 500 MB, ≤ 1 GB instalado) | S |

**Restrições.** C-1 a C-6 de 1.3. **Fora do escopo.** Ver 1.4.

**Glossário.** *Sessão/intervalo*: período contínuo de estudo; *origem*: cartões, prática, leitura ou manual; *ociosidade*: tempo sem interação; *dia de estudo*: dia local usado em `review_log.day`.

### Assumptions & open questions

- A10 (2.3): Atividades automáticas = cartões, prática e leitura no app; Erros, Gerar/revisar e Chat não contam. — confirmed: yes (Q8)
- A11 (2.3): Nada de tópico para leitura; cronômetro manual pode escolher tópico. — confirmed: yes (Q9)
- A12 (2.3): Meta de tempo é por workspace, padrão 60 min, separada da de cartões. — confirmed: yes (Q10)
- A13 (2.3): Abrir "original" de material web abre o arquivo salvo (HTML/texto) e não a URL; a verificar em 2.6. — confirmed: no
- A14 (2.3): Várias janelas de leitor podem coexistir (uma por material); o tempo conta uma vez só (FR-5). — confirmed: no
- A15 (2.3): FR-23 e FR-14 entram só se couberem sem estourar o MVP. — confirmed: no
## 2.4 User stories

**Persona P1 — Estudante.** Pessoa que importa os próprios materiais, gera e revisa cartões e questões e quer saber quanto estuda e consultar o material original sem sair do app. [src: 1.1]

| ID | História | FR | Cenário de aceite (Given / When / Then) |
|---|---|---|---|
| US-1 | Como estudante, quero iniciar, pausar e encerrar um cronômetro, opcionalmente em um tópico, para medir uma sessão que não é revisão no app (ex.: leitura de livro). | FR-2, FR-5 | Dado um workspace sem sessão ativa, quando inicio o cronômetro no tópico T, pauso após 10 s e retomo, então a barra de status mostra o tempo sem contar a pausa e, ao encerrar, a sessão fica gravada em T. |
| US-2 | Como estudante, quero que o app conte sozinho o tempo em que reviso cartões, pratico questões ou leio no app, para não depender de lembrar de ligar o cronômetro. | FR-1, FR-3, FR-12, FR-13 | Dado que abri Estudar, quando avalio cartões por 3 min, então um intervalo "cartões" de ~3 min é gravado com o tópico do item. |
| US-3 | Como estudante, quero que o tempo pare quando eu me afasto, para que o total reflita o estudo real. | FR-4, FR-6 | Dado contagem ativa e limite 120 s, quando fico 150 s sem interagir, então o intervalo termina na última interação e volta a contar quando eu interagir. |
| US-4 | Como estudante, quero ver na tela Hoje quanto estudei e quanto falta para a meta do dia, para me manter no ritmo. | FR-7, FR-9 | Dado meta 60 min e 36 min estudados, quando abro Hoje, então vejo 00:36:00 e 60% de progresso. |
| US-5 | Como estudante, quero ver o cronômetro na barra de status em qualquer tela, para controlá-lo sem voltar a Hoje. | FR-8 | Dado sessão ativa, quando navego entre telas, então o cronômetro continua visível e permite pausar. |
| US-6 | Como estudante, quero gráficos de tempo por dia, tópico e material, para saber onde invisto meu tempo. | FR-10, FR-14 | Dados 3 sessões em 2 dias e 2 tópicos, quando abro Estatísticas > Tempo, então vejo os totais exatos por dia e por tópico. |
| US-7 | Como estudante, quero que meu histórico de tempo entre no backup e volte na restauração. | FR-11 | Dado um workspace com sessões, quando exporto e importo o backup, então os totais são idênticos. |
| US-8 | Como estudante, quero abrir o PDF original no app, navegar por páginas e dar zoom, para consultar o material com figuras e fórmulas. | FR-15, FR-16, FR-24 | Dado um PDF indexado, quando clico em "Ler", então a primeira página aparece fiel ao arquivo; se o arquivo sumiu, vejo uma mensagem clara. |
| US-9 | Como estudante, quero buscar e copiar texto no PDF, para achar e reaproveitar trechos. | FR-17, FR-18 | Dado um PDF aberto, quando busco um termo, então salto entre ocorrências e posso copiar o texto selecionado. |
| US-10 | Como estudante, quero abrir o PDF em uma janela separada, para ler ao lado de uma sessão de estudo. | FR-19 | Dado um PDF, quando escolho "Nova janela", então outra janela do leitor abre e a principal segue usável. |
| US-11 | Como estudante, quero abrir qualquer material no aplicativo padrão do sistema. | FR-20, FR-21 | Dado um DOCX ou PDF, quando clico em "Abrir original", então o sistema abre o arquivo; se não houver aplicativo, vejo um erro claro. |
| US-12 | Como estudante, quero ir de um cartão ou resposta do chat direto à página citada no PDF, para conferir a fonte. | FR-22 | Dado um cartão com fonte p. 37, quando clico "Ver no PDF", então o leitor abre na p. 37 com o trecho destacado se localizável. |
| US-13 | Como estudante, quero retomar o PDF da última página lida. | FR-23 | Dado que li até a p. 80, quando reabro o PDF, então ele abre na p. 80. |

**Notas da mob.** *Design (UX):* estados vazios e de erro conforme 1.6; cronômetro e leitor sem depender só de cor. *Developer:* leitura em janela separada exige o mesmo relógio de atividade (FR-5); o destaque do trecho depende de achar o `quote` na página. *Quality:* testar tempo com relógio simulado; leitor com PDF de fixture pequeno e um corrompido.

**Cobertura.** Todo FR de 2.3 está em ≥ 1 história: FR-1 a FR-14 em US-1 a US-7; FR-15 a FR-24 em US-8 a US-13. FR-14 em US-6 (Could), FR-23 em US-13 (Could).

### Assumptions & open questions

- A16 (2.4): US-6 inclui a exclusão de sessão como Could; US-13 é Could. — confirmed: no
