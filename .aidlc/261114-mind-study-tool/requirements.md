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
| C-6 | O MIND é licenciado em AGPL-3.0 (necessário para usar PyMuPDF) | 2.9, A34 |

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

Fonte das decisões novas: [src: Q21–Q24]. Prioridade em MoSCoW. A coluna "Escopo" liga ao item S-n de 1.4.

### Functional

| ID | Requisito | Escopo | Critério de aceitação | Prioridade |
|---|---|---|---|---|
| FR-1 | O sistema permite criar, renomear, trocar e excluir workspaces, com dados isolados entre eles | S-8 | Dado dois workspaces, quando listo materiais no A, então nenhum item do B aparece; excluir um workspace remove só os seus dados após confirmação | Must |
| FR-2 | O sistema importa materiais em PDF com texto nativo e em Markdown/texto | S-1, S-7 | Dado um PDF de 100 páginas, quando importo, então o texto é extraído por página e o material aparece como "indexado" | Must |
| FR-3 | O sistema importa PDF escaneado por OCR e mostra a confiança | S-7 | Dado um PDF sem texto, quando importo, então o OCR roda, a confiança é exibida e a prévia do texto é consultável | Must |
| FR-4 | O sistema importa conteúdo de uma URL e de arquivos DOCX | S-7 | Dada uma URL pública ou um .docx, quando importo, então o texto principal é extraído e indexado | Must |
| FR-5 | O sistema divide o material em trechos com metadados (arquivo, página/seção) e permite busca por trecho | S-1, S-6 | Dado um material indexado, quando consulto um termo, então recebo trechos com referência de origem | Must |
| FR-6 | O usuário solicita a geração de flashcards escolhendo o material (ou intervalo de páginas), a quantidade e o **tipo**: Pergunta/Resposta, Cloze, Comparativo (X vs Y) ou Verdadeiro/Falso | S-1 | Dado um intervalo e um tipo, quando solicito, então recebo itens do tipo escolhido com o custo estimado exibido antes de gerar | Must |
| FR-7 | Todo item gerado (card ou questão) traz um trecho-fonte verificável (arquivo, página e texto exato); item sem fonte válida é descartado automaticamente | S-1, S-2 | Dado um item gerado, quando o trecho citado não existe no material, então o item é descartado e contado no relatório da geração | Must |
| FR-8 | O usuário revisa os itens gerados em lista com o trecho-fonte ao lado e pode aprovar, editar ou descartar, individualmente ou em lote; só itens aprovados entram no baralho | S-1 | Dado 20 itens gerados, quando aprovo 15, então 15 entram no baralho e 5 não | Must |
| FR-9 | O usuário solicita questões Certo/Errado ou múltipla escolha (4 ou 5 alternativas), com gabarito e comentário que explica também por que cada alternativa errada está errada | S-2 | Dada uma questão de múltipla escolha, quando respondo, então vejo o gabarito, o comentário e a fonte | Must |
| FR-10 | Cada questão gerada passa por uma segunda verificação por LLM que confere se o gabarito é sustentado pelo trecho-fonte; questões não sustentadas são descartadas | S-2 | Dado um gabarito não sustentado pela fonte, quando a verificação roda, então a questão não chega à revisão | Must |
| FR-11 | O usuário escolhe o estilo da questão por perfil de prova configurável (ex.: Certo/Errado, múltipla escolha com 4 ou 5 alternativas) | S-2 | Dado um perfil, quando gero, então o formato respeita o perfil | Should |
| FR-12 | O sistema agenda revisões de flashcards com o algoritmo FSRS e registra a avaliação (Errei, Difícil, Bom, Fácil) | S-3 | Dado um card avaliado "Bom", quando consulto o agendamento, então o próximo vencimento é posterior ao anterior conforme o FSRS | Must |
| FR-13 | O usuário estuda a fila do dia com um card por vez, usando atalhos de teclado e botões | S-3 | Dada a fila, quando pressiono Espaço e depois 1–4, então o card é revelado e avaliado; os mesmos passos funcionam por clique | Must |
| FR-14 | O usuário responde questões e vê acerto, tempo e correção; o sistema registra cada tentativa | S-2, S-4 | Dada uma resposta, quando envio, então a tentativa é gravada com resultado e tempo | Must |
| FR-15 | Cada erro em questão (e cada card avaliado como "Errei") gera um card no caderno de erros, ligado ao tópico e à fonte | S-4 | Dado um erro, quando confirmo "virar card", então o card existe no baralho com a fonte da questão | Must |
| FR-16 | Os itens recebem tópico (extraído do material ou editável) e o sistema mostra o acerto por tópico, a retenção, a meta diária e a sequência de dias | S-4 | Dadas tentativas em dois tópicos, quando abro Estatísticas, então vejo o acerto por tópico e a meta do dia | Must |
| FR-17 | O usuário pede geração direcionada aos pontos fracos; o sistema escolhe tópicos de menor acerto e gera itens novos sobre eles | S-5 | Dado um tópico com acerto baixo, quando clico "Treinar", então a geração é pré-configurada para o tópico | Should |
| FR-18 | O chat com a base responde perguntas usando só os trechos recuperados do workspace, citando a fonte; sem trecho relevante, responde que não encontrou | S-6 | Dada uma pergunta fora do material, quando pergunto, então a resposta informa que não há suporte no material | Should |
| FR-19 | O usuário configura o provedor (OpenRouter por padrão), a chave e os modelos de geração e de verificação; o código chama o LLM só por uma interface de provedor | S-7, C-2 | Dado um provedor falso, quando gero, então o fluxo funciona sem chave real | Must |
| FR-20 | Antes do primeiro envio ao provedor, o sistema avisa quais trechos do material são enviados e a qual provedor, e guarda o aceite localmente; nunca envia o arquivo inteiro de uma vez | C-1, R-5 | Dado o primeiro uso, quando solicito geração, então vejo o aviso e só prossigo após aceitar | Must |
| FR-21 | O sistema exibe o custo estimado antes de gerar e o custo acumulado do mês, com limite mensal configurável que bloqueia novas gerações ao ser atingido | R-4 | Dado o limite atingido, quando solicito geração, então ela é bloqueada com mensagem clara | Must |
| FR-22 | O sistema exporta e importa o workspace (dados e progresso) em arquivo local | C-1 | Dado um workspace exportado, quando importo em outra instalação, então materiais, cards e histórico são restaurados | Should |
| FR-23 | O sistema renderiza fórmulas em LaTeX (inline `$…$` e em bloco `$$…$$`) em cards, questões, comentários, chat e prévias, e os prompts de geração orientam o LLM a escrever fórmulas em LaTeX | S-1, S-2, S-6 | Dado um card com `$E=mc^2$`, quando o exibo, então a fórmula é renderizada; dada uma fórmula inválida, então o texto bruto aparece sem quebrar a tela | Must |
| FR-24 | O sistema expõe, além das telas HTML, uma API JSON versionada em `/api/v1`, documentada em OpenAPI, para os recursos principais (workspaces, materiais, jobs, geração, itens, revisão, estudo, estatísticas, chat e configurações sem segredos), com um modelo de erro padronizado | S-7 (decisão do autor em 2.8) | Dado um cliente HTTP, quando listo workspaces em `/api/v1/workspaces`, então recebo JSON conforme o OpenAPI; dado um erro, então recebo `application/problem+json` com código estável | Should |

### Non-functional

| ID | Categoria | Alvo mensurável | Verificação | Prioridade |
|---|---|---|---|---|
| NFR-1 | Desempenho | Importar e indexar PDF nativo de 100 páginas em < 60 s em laptop comum | Teste de desempenho com PDF de amostra | Must |
| NFR-2 | Desempenho | Gerar 20 itens em < 60 s, dependente do provedor; a interface mostra progresso e não trava | Teste com provedor falso com latência controlada | Must |
| NFR-3 | Desempenho | Telas de estudo e navegação respondem em < 300 ms (p95), sem contar chamadas ao LLM | Teste de latência local | Must |
| NFR-4 | Recursos | Roda com até 4 GB de memória livre e sem GPU | Medição na execução do teste NFR-1 | Must |
| NFR-5 | Disponibilidade offline | Estudo, revisão, estatísticas e biblioteca funcionam sem rede; só geração, verificação e chat exigem rede | Teste com rede desligada | Must |
| NFR-6 | Privacidade | Nenhum dado é enviado a servidor do projeto; fora o LLM escolhido, nenhuma telemetria; nenhum envio sem o aceite de FR-20 | Revisão de tráfego de saída em teste | Must |
| NFR-7 | Segurança | A chave de API fica só em variável de ambiente/`.env`; não aparece em log, banco nem resposta HTTP; o servidor escuta só em `127.0.0.1` por padrão | Teste automatizado de logs e configuração | Must |
| NFR-8 | Qualidade da geração | ≥ 90% dos itens de uma amostra aprovados sem edição, todos com fonte conferida (SM-1) | Script de avaliação com conjunto fixo, fora do CI | Must |
| NFR-9 | Portabilidade | Um terceiro instala e roda com `uv`/`uvx` e uma chave própria seguindo só o README, em Linux, macOS e Windows (SM-3) | Teste de instalação limpa | Must |
| NFR-10 | Manutenibilidade | Código 100% anotado, `mypy --strict`, `ruff` sem erros e cobertura mínima de 80% no CI (M-4, M-5) | Pipeline de CI | Must |
| NFR-11 | Usabilidade | Interface responsiva (usável a partir de 360 px de largura), tema claro/escuro (escuro em Dracula) e conteúdo navegável por teclado | Teste manual e checagem de contraste | Should |
| NFR-12 | Dados | Todos os dados em um único arquivo SQLite por instalação, com migrações versionadas; backup é copiar o arquivo | Teste de migração entre versões | Must |
| NFR-13 | Idioma | Interface e mensagens em pt-BR; o texto dos materiais pode estar em qualquer idioma | Revisão de textos da UI | Should |

### Constraints
C-1 a C-5 de 1.3 (local-first, BYOK, sem redistribuir conteúdo protegido, nada pessoal no repositório, stack fixa).

### Out of scope
Contas e multiusuário, versão hospedada, app mobile nativo, banco de questões reais de provas de terceiros e compartilhamento de baralhos (ver 1.4); simulado, exportação Anki e demais itens de `backlog.md`.

### Glossary
- **Workspace:** base de conhecimento isolada, com materiais, itens e estatísticas próprios.
- **Material:** arquivo ou URL importado a um workspace.
- **Trecho:** unidade indexada de um material, com referência de arquivo e página.
- **Item:** flashcard ou questão gerados.
- **Baralho:** conjunto de cards aprovados de um workspace.
- **Fonte:** trecho exato que sustenta um item.
- **FSRS:** algoritmo de repetição espaçada baseado em memória.

### Assumptions & open questions
- A13: "Comparativo (X vs Y)" é um card de frente com dois conceitos e verso em tabela curta de diferenças. (confirmed: no)
- A14: A correção por IA de questões discursivas e os formatos de associação e ordenação ficam fora do MVP, pois o autor os deixou de fora. (confirmed: yes)
- A15: O custo estimado antes de gerar (FR-6, FR-21) usa uma tabela de preço por modelo obtida do provedor, tratada como aproximação. (confirmed: no)
- A16: FR-22 (exportar/importar workspace) foi incluído como Should a partir do requisito de local-first e backup, sem pedido explícito do autor. (confirmed: no)
- A17: A cobertura mínima de 80% em NFR-10 é proposta minha. (confirmed: no)

## 2.4 User stories

### Personas
- **Estudante** (usuário único do MVP): estuda por conta própria com poucas horas por semana; quer gerar treino a partir do próprio material, estudar rápido e saber onde erra.
- **Instalador** (terceiro, pós-MVP): pessoa técnica que baixa o projeto aberto, usa a própria chave de API e quer entender para onde seus dados vão.

### Histórias

#### US-1 Organizar em workspaces (FR-1) · Persona: Estudante
Como estudante, quero criar e alternar entre workspaces, para manter cada assunto separado.
- AC1: Dado dois workspaces, quando alterno pelo seletor da barra lateral, então vejo apenas os materiais e o progresso do escolhido.
- AC2: Dado um workspace, quando o excluo, então peço confirmação e apago só os dados dele.

#### US-2 Importar PDF nativo e Markdown (FR-2, FR-5) · Estudante
Como estudante, quero importar PDFs e arquivos de texto, para tê-los indexados na biblioteca.
- AC1: Dado um PDF de 100 páginas, quando importo, então vejo o progresso e o status "indexado".
- AC2: Dado um material indexado, quando busco um termo, então vejo trechos com arquivo e página.

#### US-3 Importar escaneado, URL e DOCX (FR-3, FR-4) · Estudante
Como estudante, quero importar PDFs escaneados, páginas web e documentos Word, para usar qualquer material que eu tenha.
- AC1: Dado um PDF escaneado, quando importo, então vejo a confiança do OCR e posso ver a prévia do texto extraído.
- AC2: Dada uma URL ou um .docx, quando importo, então o texto principal é extraído e indexado.

#### US-4 Gerar flashcards por tipo (FR-6, FR-7, FR-21) · Estudante
Como estudante, quero escolher o material, a quantidade e o tipo de card (P/R, cloze, comparativo ou V/F) ao gerar, para treinar do jeito que me convém.
- AC1: Dado um intervalo de páginas e um tipo, quando solicito, então vejo o custo estimado antes de confirmar.
- AC2: Dado um item cujo trecho-fonte não existe no material, quando a geração termina, então ele é descartado e o relatório informa quantos foram.

#### US-5 Revisar antes de salvar (FR-8, FR-7) · Estudante
Como estudante, quero ver cada item gerado ao lado do trecho-fonte e aprovar, editar ou descartar, para só guardar o que está correto.
- AC1: Dados 20 itens, quando aprovo 15 e descarto 5, então só os 15 entram no baralho.
- AC2: Dado um item, quando edito o texto, então o trecho-fonte continua vinculado.

#### US-6 Gerar questões verificadas (FR-9, FR-10, FR-11) · Estudante
Como estudante, quero questões Certo/Errado ou de múltipla escolha com gabarito e comentário, para praticar no formato de prova.
- AC1: Dada uma questão de múltipla escolha, quando respondo, então vejo o gabarito, o comentário por alternativa e a fonte.
- AC2: Dado um gabarito não sustentado pela fonte, quando a verificação roda, então a questão não chega à revisão.
- AC3: Dado um perfil de prova, quando gero, então o formato respeita o perfil.

#### US-7 Estudar a fila do dia (FR-12, FR-13) · Estudante
Como estudante, quero estudar os cards vencidos um por vez com atalhos ou botões, para revisar no momento certo.
- AC1: Dado a fila, quando pressiono Espaço e depois 1–4, então o card é revelado e avaliado e o próximo aparece.
- AC2: Dado um card avaliado, quando consulto o agendamento, então a próxima data segue o FSRS.

#### US-8 Responder questões (FR-14) · Estudante
Como estudante, quero responder questões e ver o resultado na hora, para treinar com feedback imediato.
- AC1: Dada uma resposta, quando envio, então vejo certo/errado, o comentário e o tempo gasto, e a tentativa é gravada.

#### US-9 Caderno de erros automático (FR-15) · Estudante
Como estudante, quero que meus erros virem cards, para revisá-los até acertar.
- AC1: Dado um erro, quando escolho "virar card", então o card entra no baralho com o tópico e a fonte.
- AC2: Dado um card avaliado "Errei", quando consulto o caderno de erros, então ele aparece lá.

#### US-10 Acompanhar o desempenho (FR-16) · Estudante
Como estudante, quero ver acerto por tópico, retenção, meta diária e sequência de dias, para saber onde estou.
- AC1: Dadas tentativas em dois tópicos, quando abro Estatísticas, então vejo o acerto de cada um.
- AC2: Dado o dia corrente, quando abro "Hoje", então vejo o progresso da meta diária.

#### US-11 Treinar pontos fracos (FR-17) · Estudante
Como estudante, quero gerar treino a partir dos tópicos em que mais erro, para melhorar onde preciso.
- AC1: Dado um tópico com acerto baixo, quando clico "Treinar", então a geração abre pré-configurada para o tópico.

#### US-12 Conversar com a base (FR-18) · Estudante
Como estudante, quero perguntar à minha base e receber respostas com fonte, para tirar dúvidas sem reler tudo.
- AC1: Dada uma pergunta coberta pelo material, quando pergunto, então a resposta cita arquivo e página.
- AC2: Dada uma pergunta sem suporte no material, quando pergunto, então a resposta diz que não encontrou.

#### US-13 Configurar o provedor com ciência do envio (FR-19, FR-20) · Estudante, Instalador
Como usuário, quero informar minha chave e escolher os modelos, e saber o que será enviado ao provedor, para controlar custo e privacidade.
- AC1: Dado o primeiro uso, quando solicito geração, então vejo o aviso de quais trechos vão a qual provedor e só prossigo após aceitar.
- AC2: Dado um provedor falso configurado, quando gero, então o fluxo funciona sem chave real.

#### US-14 Controlar custos (FR-21) · Estudante, Instalador
Como usuário, quero um limite mensal e ver o custo acumulado, para não ter surpresa na fatura.
- AC1: Dado o limite atingido, quando solicito geração, então ela é bloqueada com mensagem clara e o gasto do mês é exibido.

#### US-15 Exportar e importar um workspace (FR-22) · Estudante
Como estudante, quero exportar e importar meu workspace, para fazer backup ou mudar de máquina.
- AC1: Dado um workspace exportado, quando importo em outra instalação, então materiais, cards e histórico voltam.

#### US-16 Instalar e rodar (NFR-9, FR-19) · Instalador
Como instalador, quero seguir o README e rodar o app com minha chave, para usar sem ajuda.
- AC1: Dada uma máquina limpa, quando sigo o README com `uv`/`uvx`, então o app abre em localhost e gera um primeiro baralho de amostra.

#### US-17 Ler fórmulas e código com boa tipografia (FR-23, NFR-11) · Estudante
Como estudante, quero ver fórmulas em LaTeX renderizadas e fontes com ligaduras, para estudar matérias com matemática e código sem perder legibilidade.
- AC1: Dado um card ou questão com fórmula em LaTeX, quando o exibo, então a fórmula aparece renderizada, inclusive sem rede.
- AC2: Dada uma fórmula inválida, quando exibo o item, então vejo o texto bruto e a tela não quebra.
- AC3: Dado texto em fonte monoespaçada (cloze, código), quando exibo, então as ligaduras da fonte estão ativas.

#### US-18 Automatizar por API (FR-24) · Instalador, Estudante
Como usuário técnico, quero uma API JSON documentada, para automatizar tarefas (importar materiais, gerar itens, ler estatísticas) com scripts.
- AC1: Dado o app em execução, quando abro `/api/docs`, então vejo a documentação OpenAPI da versão `v1`.
- AC2: Dada uma requisição inválida, quando a envio, então recebo `application/problem+json` com um código de erro estável.

### Matriz de cobertura FR → US

| FR | US | FR | US |
|---|---|---|---|
| FR-1 | US-1 | FR-12 | US-7 |
| FR-2 | US-2 | FR-13 | US-7 |
| FR-3 | US-3 | FR-14 | US-8 |
| FR-4 | US-3 | FR-15 | US-9 |
| FR-5 | US-2 | FR-16 | US-10 |
| FR-6 | US-4 | FR-17 | US-11 |
| FR-7 | US-4, US-5 | FR-18 | US-12 |
| FR-8 | US-5 | FR-19 | US-13, US-16 |
| FR-9 | US-6 | FR-20 | US-13 |
| FR-10 | US-6 | FR-21 | US-4, US-14 |
| FR-11 | US-6 | FR-22 | US-15 |
| FR-23 | US-17 | FR-24 | US-18 |

Todos os 24 FR têm ao menos uma história e toda história liga a ao menos um FR (ou NFR-9, no caso de US-16).

### Assumptions & open questions
- A18: Mesmo a persona "Estudante" sendo o único usuário do MVP, "Instalador" entra para dar sentido a SM-3 e aos requisitos de privacidade. (confirmed: no)
- A19: US-16 é a única história sem FR próprio; ela cobre NFR-9 e a experiência de primeira execução. (confirmed: no)
