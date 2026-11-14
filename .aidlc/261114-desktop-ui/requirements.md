# Requirements — desktop-ui

## Original request

> Quero mudar a interface da app. A atual não é visualmente agradável e executar no navegador é ruim. Acredito que uma app desktop seja mais ideal, que possa ser empacotada com apt para instalação em debian e derivados. Quais tecnologias podemos utilizar? gostaria de uma interface no estilo/padrão do moinex, mas não necessariamente em java.

## 1.1 Intent & stakeholders

> Revisado em 2026-11-14 (v2): o autor decidiu **reescrever a aplicação inteira em TypeScript + Electron**. A v1 (backend Python mantido, pywebview) está em `archive/requirements.v1-pywebview.md`.

**Intenção (negócio).** Transformar o MIND, hoje um servidor Python aberto no navegador, em um **aplicativo desktop** de um processo só (Electron), com visual polido, janela própria, sem servidor nem porta de rede, instalável em Debian e derivados com `apt install ./mind.deb`. Ao final, todo o código Python é apagado. [src: Original request, Q2.3, gate 1.3]

**Problemas a resolver.** [src: Q1.1]

- P1. Visual datado e pouco polido.
- P2. Precisar abrir o navegador (sem janela própria, ícone ou entrada de menu).
- P3. Sem integração com o sistema (`.desktop`, instalação e atualização pelo gerenciador de pacotes).
- P4. Arquitetura com servidor HTTP interno só para alimentar uma janela; o desejado é um único processo, como um app desktop nativo. [src: gate 2.3]

**Referência de estilo.** Aplicativo desktop com barra lateral de navegação, cartões de conteúdo, tema claro e escuro e ícones consistentes (captura de referência fornecida pelo autor). A tecnologia da referência (JavaFX) não é exigida. [src: Original request]

**Decisões de tecnologia do autor.** [src: gates 1.3 e 2.3]

| ID | Decisão |
|---|---|
| T-1 | Reescrever tudo em **TypeScript** (strict), runtime **Electron** |
| T-2 | UI do renderer em **React + Vite + TypeScript** |
| T-3 | Núcleo no processo principal; a janela o chama por **IPC**; sem porta de rede |
| T-4 | Mesmo repositório; o Python vira especificação até a paridade e depois é **apagado**; os commits Python são colapsados em um só |
| T-5 | Entrega por **esqueleto ambulante** e depois por fatias de módulos |
| T-6 | Remover a API `/api/v1`, o `/api/docs`, o Dockerfile e o modo navegador |
| T-7 | Portar a busca semântica com **transformers.js**; OCR e demais recursos **embutidos** sempre que possível |
| T-8 | PDF com o pacote oficial **`mupdf`** (WASM, AGPL) |

**Plataformas.** `.deb` amd64 é o alvo de primeira classe; o código deve ser portável para Windows e macOS (instaladores depois). [src: Q4.1]

**Critérios de sucesso (mensuráveis).** [src: Q3.1]

| ID | Critério | Como verificar |
|---|---|---|
| SC-1 | `apt install ./mind.deb` instala sem passos manuais, com entrada no menu e ícone | Instalação limpa em Debian/Ubuntu e abertura pelo menu |
| SC-2 | Abre em janela própria, sem navegador e **sem nenhuma porta de rede aberta** | Inspeção manual e `ss -ltnp` sem listener do app |
| SC-3 | O visual segue o padrão de referência (barra lateral, cartões, tema claro/escuro) | Aprovação do autor nos mockups (1.6/2.5) e no app |
| SC-4 | Paridade funcional: todas as telas e regras atuais funcionam; os testes do Python são portados como especificação e passam | Suíte nova com cobertura mínima equivalente, checklist por tela |
| SC-5 | Nenhum arquivo Python resta no repositório ao final | `git ls-files '*.py'` vazio |

**Partes interessadas.**

| Papel | Quem | Decide / afetado |
|---|---|---|
| Decisor e usuário principal | Autor do MIND | Decide stack, escopo e aprova os gates |
| Usuários finais | Pessoas que estudam com os próprios materiais (Debian/Ubuntu primeiro) | Afetados pela nova instalação e interface |
| Comunidade open source | Contribuidores futuros | Consultados: licença AGPL e dependências (M-6) |

**Não objetivos.** Mudar regras de geração, FSRS, verificação de fonte, prompts e esquema lógico dos dados; publicar em repositório apt; instaladores Windows/macOS agora.

### Assumptions & open questions

- A1 (1.1): Como não há dados reais em uso, o novo banco não precisa ler bancos SQLite nem backups `.zip` do Python. — confirmed: yes
- A2 (1.1): Novos testes usam o Python como especificação (mesmos casos e valores de referência); o LLM continua sempre mockado. — confirmed: yes
- A12 (1.1): As práticas M-4 (Python, uv, mypy strict) e M-5 (pytest) são substituídas por equivalentes em TypeScript; precisam de nova memória no fim da Inception. — confirmed: yes

## 1.3 Feasibility & Constraints

Verificado em 2026-11-14 (fontes ao fim). O que não foi verificado está marcado.

### Contexto técnico atual [src: codekb/MIND]

~12.100 linhas Python em `src/mind`, 642 testes com 97,38% de cobertura. Núcleo independente de HTTP; web e API são bordas finas. O comportamento está descrito no kb e nos testes, que servem de especificação da reescrita.

### Mapa de portabilidade (Python → TypeScript)

Risco: B baixo, M médio, A alto.

| Hoje | Alvo | Risco | Observações |
|---|---|---|---|
| FastAPI + Jinja + HTMX | Processo principal Electron + preload + React (IPC) | M | Reescrever as 11 telas; sem rotas HTTP |
| SQLAlchemy + Alembic + SQLite | Camada SQLite em TypeScript com migrações (candidatos: better-sqlite3, `node:sqlite`; ORM ou query builder) | M | Módulo nativo exige rebuild para o Electron (não verificado); decide-se em ADR |
| Pydantic | zod (ou equivalente) nas bordas e nas saídas do LLM | B | |
| fsrs | ts-fsrs, mantido pela organização open-spaced-repetition, Node 20+ | M | Implementação diferente pode divergir nos intervalos: validar com valores de referência do Python [fonte 2] |
| PyMuPDF | `mupdf` oficial da Artifex (WASM, AGPL ou comercial) | M | Extração de texto estruturada existe; a conferência de citações precisa ser revalidada com os PDFs de amostra [fonte 3] |
| python-docx | Biblioteca DOCX para JS (candidata: mammoth; não verificado) | M | |
| trafilatura | Extração de página web (candidato: @mozilla/readability + jsdom; não verificado) | A | Qualidade de extração pode diferir; páginas de amostra no teste |
| Tesseract (binário do sistema) | tesseract.js (WASM) embutido com os dados de idioma pt e en (decisão T-7; não verificado em detalhe) | M | Mais lento que o binário e aumenta o pacote |
| sentence-transformers (opcional) | transformers.js com ONNX (decisão T-7; não verificado) | A | Download do modelo na primeira ativação; desempenho no processo principal |
| httpx (OpenRouter) | `fetch` do Node | B | |
| KaTeX, HTMX | KaTeX no renderer; HTMX sai | B | |
| Gráficos gerados no servidor | Biblioteca de gráficos no renderer (a escolher em 2.5/2.6) | B | |
| Jobs com fila e limite de concorrência | Fila no processo principal (ou worker threads para PDF/OCR/embeddings) | M | Trabalho pesado não pode travar a janela |
| pytest, ruff, mypy, coverage | Vitest, ESLint, `tsc --strict`, cobertura V8 | B | |
| uv, hatchling | npm/pnpm, Vite, electron-builder | B | |

### Empacotamento `.deb`

O `electron-builder` tem alvo `deb` (lista `deb` em `linux.target`, `deb.depends` para dependências de sistema, compressão xz). Como o Electron embute Chromium e Node, o pacote não depende do Python nem do WebKitGTK; só de bibliotecas gráficas comuns (por exemplo GTK 3 e libnotify). Isso remove o problema do Python 3.11 do Debian 12 da v1. Tamanho esperado: centenas de MB (não medido). [fonte 1]

### Fatos que mudam a decisão

1. **Versão do Electron.** As fontes divergem: uma indica 44.x como estável (44.7.0, 07/10/2026) com 45 em beta; outra lista 43.x como a mais recente e com fim de suporte em 05/01/2027. Fixar a versão estável vigente no início da Construction. [fonte 4]
2. **Licença.** `mupdf` é AGPL ou comercial; o MIND é AGPL, então é compatível (M-6). Dependências novas precisam ser checadas uma a uma (transformers.js, tesseract.js, mammoth, readability).
3. **Segurança do Electron.** Sem porta de rede, a superfície cai, mas é preciso `contextIsolation`, `sandbox`, sem `nodeIntegration`, CSP estrita, API do preload mínima e validada com zod, e nenhuma navegação externa. Isso substitui o `security.py` atual.
4. **Custo.** A reescrita é a maior parte do trabalho: núcleo, UI e testes. Em compensação a arquitetura final é a mais simples (um runtime, um processo de negócio, sem porta).
5. **Duas funcionalidades de maior risco de paridade:** extração de página web (trafilatura) e busca semântica (embeddings). São as primeiras a prototipar depois do esqueleto.

### Registro de restrições

| ID | Restrição | Origem |
|---|---|---|
| C-1 | TypeScript strict e Electron; React + Vite no renderer; o Python é apagado ao final | T-1..T-4 |
| C-2 | Novas dependências com licença compatível com AGPL | M-6 |
| C-3 | `.deb` amd64 instalável com `apt install ./mind.deb` | SC-1 |
| C-4 | Código portável para Windows e macOS; instaladores depois | 1.1 |
| C-5 | Nenhum arquivo do repositório cita o autor nem sua finalidade pessoal | M-3 |
| C-6 | Textos da UI em pt-BR; código, comentários e commits em inglês; cabeçalho de arquivo em todo arquivo novo | M-8 |
| C-7 | O LLM é sempre mockado nos testes | M-5 |
| C-8 | Nenhuma porta de rede aberta pelo app | SC-2 |

### RAID

| Tipo | ID | Item | Mitigação |
|---|---|---|---|
| Risco | R-1 | Divergência numérica do ts-fsrs em relação ao Python | Valores de referência extraídos dos testes Python; teste dourado |
| Risco | R-2 | Extração de PDF e de página web com qualidade diferente, quebrando a verificação de citações | Protótipo com os PDFs e páginas de amostra logo após o esqueleto; ADR em 2.6 |
| Risco | R-3 | Módulos nativos (SQLite) e WASM pesado travam a janela ou falham no empacotamento | Worker threads; build do `.deb` no esqueleto ambulante |
| Risco | R-4 | Tamanho do `.deb` (Chromium + modelos + dados de OCR) | Medir no esqueleto; modelos baixados sob demanda |
| Risco | R-5 | A reescrita estoura o prazo e atrasa o `.deb` | Esqueleto ambulante e fatias; paridade só ao final |
| Risco | R-6 | Segurança do Electron mal configurada | Checklist de segurança como NFR e teste automatizado das opções da janela |
| Premissa | A3 | O autor aceita o custo de reescrever o núcleo | confirmado (gate 2.3) |
| Premissa | A4 | O alvo mínimo do `.deb` é Ubuntu 22.04+/Debian 12+ (a validar, pois o Electron define as bibliotecas exigidas) | confirmar em 1.4 |
| Dependência | D-1 | Ícones, fontes e dados de idioma do OCR com licença livre | decidir em 2.5/2.6 |

### Recomendação (go / no-go)

**GO.** A reescrita é viável: toda dependência do Python tem equivalente em TypeScript, e o `.deb` com electron-builder é caminho conhecido. O custo é alto e se concentra em núcleo, UI e testes. Mitigação principal: construir primeiro um esqueleto ambulante (janela Electron, banco, uma tela, `.deb`) e prototipar logo em seguida PDF, página web e embeddings, que são os pontos de maior risco de paridade (R-1, R-2).

Fontes:
1. [electron-builder: configuração Linux e alvo deb](https://www.electron.build/docs/linux)
2. [ts-fsrs (open-spaced-repetition)](https://open-spaced-repetition.github.io/ts-fsrs)
3. [mupdf (Artifex), AGPL ou comercial](https://www.npmjs.com/package/mupdf)
4. [Releases do Electron](https://releases.electronjs.org/) e [fim de suporte](https://endoflife.date/electron)

### Assumptions & open questions

- A3 — confirmed: yes (o autor escolheu a reescrita)
- A4 — confirmed: yes (alvo mínimo do `.deb`)
- I-1: Qual biblioteca de SQLite e de ORM/migrações? Vai para ADR em 2.6.

## 1.4 Scope

**Dentro do escopo.** [src: T-1..T-8, 1.1, 1.3]

| ID | Item | Critério |
|---|---|---|
| S-1 | App Electron com janela nativa, barra de título do sistema, tamanho mínimo 960x600, instância única, lembra tamanho, posição e última tela | SC-2 |
| S-2 | Núcleo reescrito em TypeScript, por módulos: banco e workspaces, jobs, LLM, ingestão (PDF, DOCX, Markdown, texto, web, OCR), geração e verificação de fonte, revisão, estudo (FSRS), prática, erros, estatísticas, chat e busca (palavras e semântica), backup `.zip` | SC-4 |
| S-3 | UI em React em **todas** as telas, no novo visual (barra lateral, cartões, tema claro/escuro com alternador salvo, ícones consistentes) | SC-3, SC-4 |
| S-4 | IPC tipado entre renderer e núcleo, validado nas duas pontas; nenhuma porta de rede | SC-2 |
| S-5 | `.deb` amd64 com electron-builder (entrada de menu, ícone, dependências de sistema) | SC-1 |
| S-6 | Testes portados do Python como especificação, mais testes da casca e do pacote | SC-4 |
| S-7 | Remover o Python, o Dockerfile, a API `/api/v1` e `/api/docs`, o `uvx` do README e o modo navegador; colapsar o histórico Python em um único commit antes de começar o código novo | SC-5 |

**Fora do escopo.**

- Repositório apt (PPA, assinatura, atualização automática): só o arquivo `.deb`.
- Instaladores Windows e macOS: o código não deve impedi-los.
- Mudar regras de geração, FSRS, verificação de fonte, prompts e o esquema lógico dos dados.
- Ler bancos ou backups do MIND em Python (A1).

**Backlog priorizado.**

| Prioridade | Item |
|---|---|
| Must | S-1 a S-7 |
| Should | Atalhos de teclado em Estudar e Praticar; busca global (Ctrl+K) |
| Could | Notificação nativa de cards vencidos; ícone na bandeja |
| Won't (agora) | Instaladores Windows/macOS, repositório apt |

**Limite do MVP.** Pronto quando o `.deb` instala em Ubuntu, abre a janela sem porta de rede, todas as telas funcionam com o visual aprovado, a suíte portada passa e não resta nenhum `.py` no repositório (SC-1 a SC-5).

### Assumptions & open questions

- A4 — alvo mínimo do `.deb`: Ubuntu 22.04+ e Debian 12+; confirmar no gate. — confirmed: yes
- A5 (1.4): A busca semântica entra na paridade (T-7), mas é a última fatia a ser portada. — confirmed: yes
- A6 (1.4): O histórico Python é colapsado em um commit local antes da Construction; a `main` remota tem 1 commit próprio e diverge, então o primeiro push exigirá reconciliar. — confirmed: yes

## 2.3 Requirements

Os requisitos de produto (FR-1 a FR-23 e NFR-1 a NFR-13) vêm do intent anterior `261114-mind-study-tool` (§ 2.3) e valem como **paridade**: o comportamento não muda, só a tecnologia. FR-24 (API JSON) foi removido por decisão do autor (T-6). Os requisitos FR-25 a FR-32 e NFR-14 a NFR-18 são novos (casca desktop e pacote). Prioridade em MoSCoW; a coluna "Escopo" liga a S-n de 1.4. [src: .aidlc/261114-mind-study-tool/requirements.md, 1.1, 1.4, Q2.3]

### Functional

| ID | Requisito | Escopo | Critério de aceitação | Prioridade |
|---|---|---|---|---|
| FR-1 | O sistema permite criar, renomear, trocar e excluir workspaces, com dados isolados entre eles | S-2, S-3 (paridade) | Dado dois workspaces, quando listo materiais no A, então nenhum item do B aparece; excluir um workspace remove só os seus dados após confirmação | Must |
| FR-2 | O sistema importa materiais em PDF com texto nativo e em Markdown/texto | S-2, S-3 (paridade) | Dado um PDF de 100 páginas, quando importo, então o texto é extraído por página e o material aparece como "indexado" | Must |
| FR-3 | O sistema importa PDF escaneado por OCR embutido no app, sem instalar nada e mostra a confiança | S-2, S-3 (paridade) | Dado um PDF sem texto, quando importo, então o OCR roda, a confiança é exibida e a prévia do texto é consultável | Must |
| FR-4 | O sistema importa conteúdo de uma URL e de arquivos DOCX | S-2, S-3 (paridade) | Dada uma URL pública ou um .docx, quando importo, então o texto principal é extraído e indexado | Must |
| FR-5 | O sistema divide o material em trechos com metadados (arquivo, página/seção) e permite busca por trecho | S-2, S-3 (paridade) | Dado um material indexado, quando consulto um termo, então recebo trechos com referência de origem | Must |
| FR-6 | O usuário solicita a geração de flashcards escolhendo o material (ou intervalo de páginas), a quantidade e o **tipo**: Pergunta/Resposta, Cloze, Comparativo (X vs Y) ou Verdadeiro/Falso | S-2, S-3 (paridade) | Dado um intervalo e um tipo, quando solicito, então recebo itens do tipo escolhido com o custo estimado exibido antes de gerar | Must |
| FR-7 | Todo item gerado (card ou questão) traz um trecho-fonte verificável (arquivo, página e texto exato); item sem fonte válida é descartado automaticamente | S-2, S-3 (paridade) | Dado um item gerado, quando o trecho citado não existe no material, então o item é descartado e contado no relatório da geração | Must |
| FR-8 | O usuário revisa os itens gerados em lista com o trecho-fonte ao lado e pode aprovar, editar ou descartar, individualmente ou em lote; só itens aprovados entram no baralho | S-2, S-3 (paridade) | Dado 20 itens gerados, quando aprovo 15, então 15 entram no baralho e 5 não | Must |
| FR-9 | O usuário solicita questões Certo/Errado ou múltipla escolha (4 ou 5 alternativas), com gabarito e comentário que explica também por que cada alternativa errada está errada | S-2, S-3 (paridade) | Dada uma questão de múltipla escolha, quando respondo, então vejo o gabarito, o comentário e a fonte | Must |
| FR-10 | Cada questão gerada passa por uma segunda verificação por LLM que confere se o gabarito é sustentado pelo trecho-fonte; questões não sustentadas são descartadas | S-2, S-3 (paridade) | Dado um gabarito não sustentado pela fonte, quando a verificação roda, então a questão não chega à revisão | Must |
| FR-11 | O usuário escolhe o estilo da questão por perfil de prova configurável (ex.: Certo/Errado, múltipla escolha com 4 ou 5 alternativas) | S-2, S-3 (paridade) | Dado um perfil, quando gero, então o formato respeita o perfil | Should |
| FR-12 | O sistema agenda revisões de flashcards com o algoritmo FSRS e registra a avaliação (Errei, Difícil, Bom, Fácil) | S-2, S-3 (paridade) | Dado um card avaliado "Bom", quando consulto o agendamento, então o próximo vencimento é posterior ao anterior conforme o FSRS | Must |
| FR-13 | O usuário estuda a fila do dia com um card por vez, usando atalhos de teclado e botões | S-2, S-3 (paridade) | Dada a fila, quando pressiono Espaço e depois 1–4, então o card é revelado e avaliado; os mesmos passos funcionam por clique | Must |
| FR-14 | O usuário responde questões e vê acerto, tempo e correção; o sistema registra cada tentativa | S-2, S-3 (paridade) | Dada uma resposta, quando envio, então a tentativa é gravada com resultado e tempo | Must |
| FR-15 | Cada erro em questão (e cada card avaliado como "Errei") gera um card no caderno de erros, ligado ao tópico e à fonte | S-2, S-3 (paridade) | Dado um erro, quando confirmo "virar card", então o card existe no baralho com a fonte da questão | Must |
| FR-16 | Os itens recebem tópico (extraído do material ou editável) e o sistema mostra o acerto por tópico, a retenção, a meta diária e a sequência de dias | S-2, S-3 (paridade) | Dadas tentativas em dois tópicos, quando abro Estatísticas, então vejo o acerto por tópico e a meta do dia | Must |
| FR-17 | O usuário pede geração direcionada aos pontos fracos; o sistema escolhe tópicos de menor acerto e gera itens novos sobre eles | S-2, S-3 (paridade) | Dado um tópico com acerto baixo, quando clico "Treinar", então a geração é pré-configurada para o tópico | Should |
| FR-18 | O chat com a base responde perguntas usando só os trechos recuperados do workspace, citando a fonte; sem trecho relevante, responde que não encontrou, com busca por palavras e busca semântica opcional (transformers.js) | S-2, S-3 (paridade) | Dada uma pergunta fora do material, quando pergunto, então a resposta informa que não há suporte no material | Should |
| FR-19 | O usuário configura o provedor (OpenRouter por padrão), a chave e os modelos de geração e de verificação; o código chama o LLM só por uma interface de provedor | S-2, S-3 (paridade) | Dado um provedor falso, quando gero, então o fluxo funciona sem chave real | Must |
| FR-20 | Antes do primeiro envio ao provedor, o sistema avisa quais trechos do material são enviados e a qual provedor, e guarda o aceite localmente; nunca envia o arquivo inteiro de uma vez | S-2, S-3 (paridade) | Dado o primeiro uso, quando solicito geração, então vejo o aviso e só prossigo após aceitar | Must |
| FR-21 | O sistema exibe o custo estimado antes de gerar e o custo acumulado do mês, com limite mensal configurável que bloqueia novas gerações ao ser atingido | S-2, S-3 (paridade) | Dado o limite atingido, quando solicito geração, então ela é bloqueada com mensagem clara | Must |
| FR-22 | O sistema exporta e importa o workspace (dados e progresso) em arquivo local | S-2, S-3 (paridade) | Dado um workspace exportado, quando importo em outra instalação, então materiais, cards e histórico são restaurados | Should |
| FR-23 | O sistema renderiza fórmulas em LaTeX (inline `$…$` e em bloco `$$…$$`) em cards, questões, comentários, chat e prévias, e os prompts de geração orientam o LLM a escrever fórmulas em LaTeX | S-2, S-3 (paridade) | Dado um card com `$E=mc^2$`, quando o exibo, então a fórmula é renderizada; dada uma fórmula inválida, então o texto bruto aparece sem quebrar a tela | Must |
| FR-25 | O app abre em janela própria do sistema (Electron), com barra de título nativa e tamanho mínimo de 960x600, sem navegador e sem abrir nenhuma porta de rede | S-1, S-4 | Dado o app instalado, quando o abro pelo menu, então vejo a janela do MIND; `ss -ltnp` não lista nenhum listener do app | Must |
| FR-26 | Só uma instância roda por usuário; abrir o app de novo traz a janela existente para a frente | S-1 | Dada uma instância aberta, quando executo `mind` outra vez, então nenhuma nova janela surge e a existente recebe foco | Must |
| FR-27 | O app lembra o tamanho, a posição da janela e a última tela aberta, por usuário | S-1 | Dado que fechei o app em uma posição e tela, quando o reabro, então a janela volta ao mesmo lugar, tamanho e tela | Should |
| FR-28 | A navegação usa barra lateral com as 8 seções (Hoje, Biblioteca, Gerar, Estudar, Estatísticas, Erros, Chat, Configurações), seletor de workspace no topo e rodapé de status (versão, estado do provedor, tema) | S-3 | Dado o app aberto, quando clico em cada seção, então a tela correspondente abre e o item ativo fica em destaque, conforme os mockups aprovados em 2.5 | Must |
| FR-29 | O tema padrão é escuro (Dracula); o usuário pode alternar para claro e a escolha é salva | S-3 | Dada a primeira abertura, quando a janela aparece, então o tema é escuro independentemente do sistema; dado que alternei para claro, quando reabro, então fica claro | Must |
| FR-30 | O pacote `.deb` instala o app com entrada de menu, ícone e categoria de aplicativo, e declara suas dependências de sistema; remover o pacote não apaga os dados do usuário | S-5 | Dado um Debian ou Ubuntu limpo, quando executo `apt install ./mind.deb`, então o MIND aparece no menu e abre; após `apt remove`, o diretório de dados continua | Must |
| FR-31 | A janela fala com o núcleo só por IPC tipado e validado; o renderer não acessa o sistema de arquivos nem a rede diretamente | S-4 | Dado o renderer, quando tenta usar `require`, `fs` ou `fetch` externo, então a ação é bloqueada; dada uma mensagem IPC inválida, então o núcleo a rejeita com erro estável | Must |
| FR-32 | Atalhos de teclado: Espaço e 1 a 4 em Estudar e Praticar, Ctrl+K para busca global, Ctrl+, para Configurações | S-3 | Dado o foco em Estudar, quando pressiono Espaço e 3, então o card é revelado e avaliado como "Bom" | Should |

### Non-functional

| ID | Categoria | Alvo mensurável | Verificação | Prioridade |
|---|---|---|---|---|
| NFR-1 | Desempenho | Importar e indexar PDF nativo de 100 páginas em < 60 s em laptop comum | Teste de desempenho com PDF de amostra | Must |
| NFR-2 | Desempenho | Gerar 20 itens em < 60 s, dependente do provedor; a interface mostra progresso e não trava | Teste com provedor falso com latência controlada | Must |
| NFR-3 | Desempenho | Telas de estudo e navegação respondem em < 300 ms (p95), sem contar chamadas ao LLM | Teste de latência local | Must |
| NFR-4 | Recursos | Roda com até 4 GB de memória livre e sem GPU | Medição na execução do teste NFR-1 | Must |
| NFR-5 | Disponibilidade offline | Estudo, revisão, estatísticas e biblioteca funcionam sem rede; só geração, verificação e chat exigem rede | Teste com rede desligada | Must |
| NFR-6 | Privacidade | Nenhum dado é enviado a servidor do projeto; fora o LLM escolhido, nenhuma telemetria; nenhum envio sem o aceite de FR-20 | Revisão de tráfego de saída em teste | Must |
| NFR-7 | Segurança | A chave de API fica só no armazenamento do app (arquivo no diretório de dados com permissão restrita ou cofre do sistema, a decidir em 2.6); não aparece em log, banco nem no renderer; o app não abre nenhuma porta de rede | Teste automatizado de logs e de configuração; `ss -ltnp` sem listener do app | Must |
| NFR-8 | Qualidade da geração | ≥ 90% dos itens de uma amostra aprovados sem edição, todos com fonte conferida (SM-1) | Script de avaliação com conjunto fixo, fora do CI | Must |
| NFR-9 | Instalação | Em uma máquina Debian ou Ubuntu limpa, `apt install ./mind.deb` instala o app sem passos manuais e o remove sem apagar os dados do usuário (SM-3) | Instalação e remoção em contêiner descartável, só para teste, no CI | Must |
| NFR-10 | Manutenibilidade | TypeScript `strict`, ESLint e Prettier sem erros, e cobertura V8 mínima de 80% no CI (M-4 e M-5 reescritas para TypeScript) | Pipeline de CI | Must |
| NFR-11 | Usabilidade | Janela com tamanho mínimo de 960x600, tema claro e escuro (escuro em Dracula), conteúdo navegável por teclado e contraste verificado | Teste manual, Playwright e checagem de contraste | Should |
| NFR-12 | Dados | Todos os dados em um único arquivo SQLite por instalação, com migrações versionadas; backup é copiar o arquivo | Teste de migração entre versões | Must |
| NFR-13 | Idioma | Interface e mensagens em pt-BR; o texto dos materiais pode estar em qualquer idioma | Revisão de textos da UI | Should |
| NFR-14 | Desempenho | Janela visível em até 3 s após abrir o app (arranque a frio, máquina comum); troca de tela em até 300 ms (NFR-3) | Teste de desempenho com Playwright sob o marcador `perf` | Must |
| NFR-15 | Segurança do Electron | Janela com `contextIsolation`, `sandbox` e sem `nodeIntegration`; CSP estrita; navegação e abertura de janelas externas bloqueadas; API do preload mínima e validada com zod | Teste automatizado das opções da janela e revisão do preload | Must |
| NFR-16 | Tamanho | `.deb` de até 500 MB e instalado de até 1 GB, sem contar modelos baixados sob demanda (A14, confirmada) | Medição no CI | Should |
| NFR-17 | Dados | Os dados do usuário ficam fora do diretório de instalação, no diretório de dados do usuário; instalar, atualizar ou remover o pacote nunca os apaga | Teste de instalação, atualização e remoção | Must |
| NFR-18 | Responsividade | Importação, geração, OCR e embeddings rodam fora da thread da janela; a interface continua respondendo | Teste com tarefa longa simulada e medição do atraso do renderer | Must |

### Constraints
C-1 a C-8 de 1.3 (TypeScript e Electron, licenças compatíveis com AGPL, `.deb` amd64, portabilidade, nada pessoal no repositório, idiomas, LLM mockado, nenhuma porta de rede), mais as decisões T-1 a T-8 de 1.1.

### Out of scope
Contas e multiusuário, versão hospedada, app mobile, banco de questões reais de provas de terceiros, compartilhamento de baralhos, repositório apt, instaladores Windows e macOS, leitura de dados do MIND em Python, simulado, exportação Anki e demais itens de `.aidlc/261114-mind-study-tool/backlog.md`.

### Glossary
- **Workspace:** base de conhecimento isolada, com materiais, itens e estatísticas próprios.
- **Material:** arquivo ou URL importado a um workspace.
- **Trecho:** unidade indexada de um material, com referência de arquivo e página.
- **Item:** flashcard ou questão gerados.
- **Baralho:** conjunto de cards aprovados de um workspace.
- **Fonte:** trecho exato que sustenta um item.
- **FSRS:** algoritmo de repetição espaçada baseado em memória.
- **Processo principal:** processo do Electron que hospeda o núcleo (dados, jobs, LLM).
- **Renderer:** a janela React; só fala com o processo principal por IPC.
- **Preload:** ponte mínima e validada entre renderer e processo principal.

### Assumptions & open questions
- A13: "Comparativo (X vs Y)" é um card de frente com dois conceitos e verso em tabela curta de diferenças (herdada). — confirmed: yes
- A14: O limite de 500 MB do `.deb` e 1 GB instalado (NFR-16) foi escolhido pelo autor no gate 2.3. — confirmed: yes
- A15: Tema padrão escuro (Dracula) com alternador salvo, por escolha do autor no gate 2.3 (FR-29). — confirmed: yes
- A16: A exportação e importação de workspace (FR-22) mantém o formato lógico, em novo `.zip` TypeScript; não precisa abrir `.zip` do Python (A1). — confirmed: yes
- A17: A cobertura mínima de 80% (NFR-10) é herdada de M-5. — confirmed: yes
- A18: "Instância única" usa o bloqueio de instância única do Electron; "lembrar a última tela" guarda a rota por workspace. — confirmed: yes

## 2.4 User stories

### Personas
- **Estudante** (usuário único do MVP): estuda por conta própria com poucas horas por semana; quer gerar treino a partir do próprio material, estudar rápido e saber onde erra.
- **Instalador** (terceiro): pessoa técnica que baixa o `.deb`, usa a própria chave de API e quer entender para onde seus dados vão.

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
- AC3 (adição de 2026-11-14, a pedido do autor): Dado que quero estudar só um assunto, quando escolho o conteúdo (flashcards, questões ou tudo), o tópico, o material ou o tipo de card, então a sessão mostra apenas os itens desse recorte, sem alterar o limite diário de novos.

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

#### US-16 Instalar e rodar (NFR-9, FR-30, FR-19) · Instalador
Como instalador, quero instalar o app com um pacote `.deb` e configurar a minha chave, para usar sem ajuda.
- AC1: Dada uma máquina Debian ou Ubuntu limpa, quando executo `apt install ./mind.deb`, então o MIND aparece no menu de aplicativos, com ícone, e abre.
- AC2: Dado o app recém-instalado, quando informo a minha chave e aceito o envio de trechos, então gero um primeiro baralho a partir do material de amostra.

#### US-17 Ler fórmulas e código com boa tipografia (FR-23, NFR-11) · Estudante
Como estudante, quero ver fórmulas em LaTeX renderizadas e fontes com ligaduras, para estudar matérias com matemática e código sem perder legibilidade.
- AC1: Dado um card ou questão com fórmula em LaTeX, quando o exibo, então a fórmula aparece renderizada, inclusive sem rede.
- AC2: Dada uma fórmula inválida, quando exibo o item, então vejo o texto bruto e a tela não quebra.
- AC3: Dado texto em fonte monoespaçada (cloze, código), quando exibo, então as ligaduras da fonte estão ativas.

#### US-19 Abrir o app em janela própria (FR-25, FR-26, FR-27, NFR-14) · Estudante
Como estudante, quero abrir o MIND como um aplicativo de janela própria, para estudar sem abrir o navegador.
- AC1: Dado o app instalado, quando o abro pelo menu, então a janela aparece em até 3 s, com a barra de título do sistema e tamanho mínimo de 960x600.
- AC2: Dado o app aberto, quando executo `mind` de novo, então a janela existente recebe foco e nenhuma outra surge.
- AC3: Dado que fechei o app, quando o reabro, então a janela volta ao mesmo tamanho, posição e tela.
- AC4: Dado o app em execução, quando listo as portas de rede em escuta, então nenhuma pertence ao MIND.

#### US-20 Navegar e personalizar a aparência (FR-28, FR-29, FR-32, NFR-11) · Estudante
Como estudante, quero uma barra lateral clara, tema escuro e atalhos, para chegar rápido a cada seção e estudar com conforto.
- AC1: Dada a primeira abertura, quando a janela aparece, então o tema é escuro e a barra lateral mostra as 8 seções e o seletor de workspace.
- AC2: Dado o tema escuro, quando alterno para claro, então a escolha persiste após reabrir.
- AC3: Dado o foco em Estudar, quando pressiono Espaço e depois 1 a 4, então o card é revelado e avaliado; Ctrl+K abre a busca global.

#### US-21 Atualizar e remover sem perder dados (FR-30, NFR-17) · Estudante, Instalador
Como usuário, quero atualizar ou remover o pacote sem perder meus estudos, para confiar no app com meu material.
- AC1: Dado um workspace com cards e histórico, quando instalo uma versão nova por cima, então os dados continuam intactos.
- AC2: Dado o app instalado, quando executo `apt remove`, então o diretório de dados do usuário permanece.

#### US-22 Janela segura e fluida (FR-31, NFR-15, NFR-18) · Instalador, Estudante
Como usuário, quero que a janela não acesse meu sistema além do necessário e não congele durante tarefas longas, para usar o app com segurança.
- AC1: Dado o renderer, quando uma página tenta usar `require`, `fs` ou abrir uma URL externa, então a ação é bloqueada.
- AC2: Dada uma importação de PDF ou uma geração em andamento, quando navego entre telas, então a interface continua respondendo.

### Matriz de cobertura FR → US

| FR | US | FR | US |
|---|---|---|---|
| FR-1 | US-1 | FR-17 | US-11 |
| FR-2 | US-2 | FR-18 | US-12 |
| FR-3 | US-3 | FR-19 | US-13, US-16 |
| FR-4 | US-3 | FR-20 | US-13 |
| FR-5 | US-2 | FR-21 | US-4, US-14 |
| FR-6 | US-4 | FR-22 | US-15 |
| FR-7 | US-4, US-5 | FR-23 | US-17 |
| FR-8 | US-5 | FR-25 | US-19 |
| FR-9 | US-6 | FR-26 | US-19 |
| FR-10 | US-6 | FR-27 | US-19 |
| FR-11 | US-6 | FR-28 | US-20 |
| FR-12 | US-7 | FR-29 | US-20 |
| FR-13 | US-7 | FR-30 | US-16, US-21 |
| FR-14 | US-8 | FR-31 | US-22 |
| FR-15 | US-9 | FR-32 | US-20 |
| FR-16 | US-10 |  |  |

Todos os 31 FR têm ao menos uma história e toda história liga a ao menos um FR. Os NFR-9, NFR-11, NFR-14, NFR-15, NFR-17 e NFR-18 aparecem nas histórias US-16, US-20, US-19, US-22, US-21 e US-22; os demais NFR são verificados nos Units (2.7).

### Assumptions & open questions
- A19 (2.4): As histórias US-1 a US-15 e US-17 são herdadas sem mudança de comportamento; US-18 (API) foi removida (T-6). — confirmed: yes
