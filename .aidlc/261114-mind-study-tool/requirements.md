# Requirements — mind-study-tool

## Original request
> (Texto original omitido a pedido do autor, pois estes arquivos serão públicos e continham dados pessoais e a finalidade de uso.) Resumo neutro: criar uma ferramenta que gere flashcards e questões a partir de uma base de conhecimento (PDFs e outros materiais), semelhante ao NotebookLM, com uma interface mínima para interagir com os itens gerados, funcionalidades que otimizem o desempenho de estudo e possibilidade de ser disponibilizada a outras pessoas, usando a API do Claude ou do OpenRouter para a geração.

Comando: `/ai-dlc` (criar a pasta do projeto em ~/Projects e iniciar o discovery)

Esclarecimentos na criação do intent:
- Idioma: pt-BR (chat e arquivos).
- Nome: **MIND**. Deve ser uma ferramenta de estudo geral, sem foco em um tipo específico de prova ou área.

## 1.1 Intent & stakeholders

**Intenção (negócio):** o MIND é uma ferramenta de estudo local-first que transforma a base de conhecimento do próprio usuário (PDFs e outros materiais) em treino ativo: flashcards e questões com fonte citada, estudados em uma interface própria com repetição espaçada e foco nos pontos fracos. [src: Original request, Q-nome]

**Problema** (todos pesam): [src: Q1]
1. Criar flashcards e questões à mão consome tempo de estudo.
2. Falta reter melhor o que já foi estudado (revisão no momento certo).
3. Falta atacar pontos fracos com treino direcionado (caderno de erros automático).
4. Hoje o fluxo é fragmentado (NotebookLM + Anki + anotações); a meta é um lugar só.

**Usuários:** [src: Q2]
- MVP: apenas o autor (uso pessoal, uma pessoa, máquina local).
- Depois: terceiros, via código aberto. Por isso nada pessoal pode ficar acoplado ao software.

**Medidas de sucesso do MVP:** [src: Q3]

| ID | Medida | Alvo inicial (a refinar em 2.3) |
|---|---|---|
| SM-1 | Qualidade da geração | ≥90% dos itens de uma amostra aprovados sem edição, todos com fonte conferida |
| SM-2 | Tempo economizado | Baralho de um capítulo gerado e revisado em < 5 min (a confirmar a linha de base manual) |
| SM-3 | Pronto para abrir o código | Um terceiro instala e roda com a própria chave, seguindo só o README |

Fora das medidas do MVP (o autor não selecionou): uso diário por 2 semanas.

**Restrições duras:** [src: Q4]
- Local-first: PDFs, banco e progresso ficam no disco do usuário; sem servidor próprio.
- BYOK: chave própria do OpenRouter e/ou da API Anthropic; nenhum custo de infra para o autor.
- Não hospeda nem redistribui conteúdo protegido (ex.: PDFs pagos de terceiros); processa só o que o usuário fornece.

**Não-objetivos (provisórios, fechados em 1.4):** SaaS hospedado, contas de usuário, marketplace de baralhos, conteúdo oficial de provas de terceiros.

**Mapa de stakeholders**

| Parte | Papel | Interesse |
|---|---|---|
| Autor | Decisor e usuário único do MVP | Estudar com eficiência; poder abrir o projeto depois |
| Futuros usuários | Afetados (pós-MVP) | Instalar fácil, controlar custo e dados |
| Provedores de LLM (OpenRouter/Anthropic) | Dependência externa | Termos de uso, custo, disponibilidade |
| Titulares de conteúdo (editoras, cursos) | Consultados indiretamente | Direitos autorais; motivo da restrição de não redistribuir |

### Assumptions & open questions
- A1: "Tempo economizado" tem linha de base desconhecida; medir uma geração manual para comparar. (confirmed: no)
- A2: Idioma do produto/UI no MVP: pt-BR. Internacionalização fica para depois. (confirmed: no)
- A3: O nome "MIND" é provisório até checar colisão de nome ao abrir o código. (confirmed: no)

## 1.3 Feasibility, constraints & RAID

**Decisões de viabilidade (confirmadas):** [src: Q5–Q8]

| Tema | Decisão |
|---|---|
| Stack | Python + FastAPI + HTMX + SQLite |
| Execução | App web local no navegador (localhost); empacotamento via Docker ou pipx/uvx |
| LLM | OpenRouter, orçamento de ~US$ 5/mês; modelo barato para gerar, mais forte para verificar. Interface de provedor mantém a troca possível (Anthropic direto, Ollama) sem comprometer o MVP |
| Entrada | PDF com texto nativo, PDF escaneado (OCR), Markdown/texto, URL e DOCX |

**Avaliação de viabilidade:** viável. Cada peça tem biblioteca madura: PyMuPDF/pdfplumber (PDF), Tesseract (OCR), py-fsrs (repetição espaçada), genanki (exportação Anki), sqlite-vec ou FTS5 (busca). O risco está na qualidade da geração e no escopo, não na tecnologia. Estimativa de custo: gerar por trecho com modelo barato custa centavos por PDF; o orçamento de US$ 5/mês cobre dezenas de PDFs.

**Registro de restrições**

| ID | Restrição | Origem |
|---|---|---|
| C-1 | Local-first; sem servidor próprio | 1.1 |
| C-2 | BYOK; custo de API fica com o usuário (meta do autor: ≤ US$ 5/mês) | 1.1, Q7 |
| C-3 | Não hospedar nem redistribuir conteúdo protegido | 1.1 |
| C-4 | Nenhum dado ou caminho pessoal do autor no repositório do MIND | pedido original |
| C-5 | Stack fixada em Python/FastAPI/HTMX/SQLite | Q5 |

**RAID**

| ID | Tipo | Item | Mitigação |
|---|---|---|---|
| R-1 | Risco | LLM erra literalidade de lei ou inventa fatos | Toda questão cita trecho exato da fonte; segunda chamada "juiz" verifica; item sem sustentação é descartado; revisão humana antes de entrar no baralho |
| R-2 | Risco | Escopo cresce: 5 formatos de entrada + gerar + estudar + estatísticas, com tempo de desenvolvimento limitado | Ordenar entrada por prioridade em 1.4 (texto nativo/MD primeiro; OCR, URL e DOCX como incrementos); MVP com um fluxo ponta a ponta antes de ampliar |
| R-3 | Risco | OCR com baixa qualidade gera cards ruins | Mostrar prévia do texto extraído; avisar quando a confiança for baixa |
| R-4 | Risco | Custo de API passa de US$ 5/mês | Contador de custo por geração; limite configurável; modelo barato como padrão |
| R-5 | Risco | Direitos autorais dos materiais dos usuários | Processamento local; README explícito; sem upload para servidor do projeto (o texto vai ao provedor de LLM escolhido pelo usuário, e isso deve ser dito) |
| R-6 | Risco | Colisão do nome "MIND" | Checar antes de publicar (A3 de 1.1) |
| A-1 | Suposição | Os materiais de exemplo têm texto nativo na maioria | Validar na 1ª amostra |
| A-2 | Suposição | Modelo barato do OpenRouter atinge ≥90% de aprovação com verificação | Medir em prova de conceito (SM-1) |
| I-1 | Issue | Selecionou todos os formatos de entrada, o que conflita com o escopo enxuto | Decidir a ordem em 1.4 |
| D-1 | Dependência | Disponibilidade e termos de OpenRouter | Interface de provedor |

**Recomendação go/no-go:** **GO**, com condição: validar SM-1 e A-2 cedo (um fluxo mínimo de PDF → cards com fonte, medido numa amostra) antes de construir a interface completa.

### Assumptions & open questions
- A4: Todos os formatos de entrada entram no escopo do produto, mas a entrega no MVP é priorizada em 1.4. (confirmed: no)
- A5: O app roda em localhost sem autenticação (usuário único, C-1). Se for exposto na rede, exige autenticação, tratado em 2.3. (confirmed: no)
## 1.4 Scope

**Fronteira do MVP** (confirmada pelo autor): [src: Q9–Q12]

| ID | Capacidade no MVP | Prioridade (MoSCoW) |
|---|---|---|
| S-1 | Biblioteca de materiais e geração de flashcards (P/R e cloze) com fonte (arquivo e página), revisão e aprovação antes de salvar | Must |
| S-2 | Geração de questões (Certo/Errado e múltipla escolha) com gabarito, comentário e verificação por segunda chamada | Must |
| S-3 | Estudo com repetição espaçada (FSRS) | Must |
| S-4 | Caderno de erros automático e estatísticas por tópico | Must |
| S-5 | Geração direcionada aos pontos fracos (usa o histórico de erros) | Should |
| S-6 | Chat com a base ("pergunte ao PDF") com citação da fonte | Should |
| S-7 | Entrada: PDF com texto nativo, PDF escaneado (OCR), Markdown/texto, URL e DOCX | Must (os cinco, por decisão do autor) |
| S-8 | Workspaces: bases de conhecimento isoladas (materiais, cards, questões, estatísticas e chat próprios), com seletor na UI. Não é multiusuário. Adicionado em 1.6 a pedido do autor | Must |

**Fora do escopo (não-objetivos):** contas, login e multiusuário; versão hospedada (SaaS); app mobile nativo (a UI web deve ser responsiva); biblioteca de questões reais de provas de terceiros e compartilhamento de baralhos. [src: Q12]

**Adiado (não entra no MVP, registrado em `backlog.md` como próximos intents/bolts):** simulado cronometrado (pedido explícito do autor), exportação Anki (.apkg), mapa de currículo, modo sessão curta e detector de duplicatas. [src: Q10]

**Prioridade e ordem de risco (recomendação, a refinar em 2.7 e 2.9):** o escopo de entrada é maior que o recomendado (R-2, I-1). A fronteira do MVP segue como o autor decidiu, mas a entrega será em bolts ordenados por risco: (1) PDF nativo/Markdown → cards com fonte e medição de SM-1; (2) estudo FSRS e caderno de erros; (3) questões com verificação; (4) OCR, URL e DOCX; (5) chat com a base e geração por fraqueza. Se o prazo apertar, S-5 e S-6 (Should) e os formatos OCR, URL e DOCX são os cortes naturais, e isso se decide no gate de cada bolt.

### Assumptions & open questions
- A6: S-5 e S-6 são "Should": podem sair do MVP sem invalidar o sucesso (SM-1 a SM-3). (confirmed: no)
- A7: Exportação Anki fica fora do MVP; o autor não a selecionou, apesar de ser barata. Reavaliar em `backlog.md`. (confirmed: no)
## 1.7 Initiative brief

**MIND** é uma ferramenta de estudo local-first (Python/FastAPI/HTMX/SQLite, app web em localhost) que gera flashcards e questões com fonte citada a partir de materiais do próprio usuário (PDF nativo e escaneado, Markdown, URL, DOCX), e os estuda com repetição espaçada (FSRS), caderno de erros automático, estatísticas por tópico, geração direcionada aos pontos fracos e chat com a base. Organiza o material em workspaces. BYOK via OpenRouter (~US$ 5/mês). O produto é genérico e pensado para ser aberto a terceiros.

**Decisões do discovery**

| Decisão | Valor | Etapa |
|---|---|---|
| Nome | MIND (provisório até checar colisão) | 0.1 |
| Perfil | mvp, Standard/Standard, sem Operations | 0.1 |
| Stack e execução | Python + FastAPI + HTMX + SQLite; app web local | 1.3 |
| LLM | OpenRouter, BYOK, interface de provedor | 1.3 |
| Escopo MVP | S-1 a S-8 (S-5 e S-6 Should) | 1.4 |
| Adiado | Simulado, Anki, mapa de currículo, sessão curta, duplicatas | 1.4 (`backlog.md`) |
| UI | Sidebar + workspaces, tema claro/escuro (Dracula) | 1.6 |

**Go/no-go:** GO, com condição de validar cedo SM-1 (qualidade da geração com fonte) antes de construir a UI completa.

**Pontos de atenção para a Inception:** escopo grande para o tempo disponível (R-2); a ordem dos bolts por risco está em 1.4; o requisito de privacidade é que o texto dos materiais vai ao provedor de LLM escolhido (R-5); a restrição de não incluir dados pessoais do autor no repositório (C-4).

**Próximo:** etapas 2.2 a 2.9 (práticas, requisitos, histórias, mockups refinados, domínio, units, contratos e plano de entrega), depois Construction.

## 2.3 Requirements
### Functional
### Non-functional
## 2.4 User stories
