# Backlog de intents

Ideias de intents futuras do MIND que ficaram fora do escopo de uma intent em andamento. Não são compromissos: cada item vira uma intent (`/ai-dlc`) quando o autor decidir. Regra do projeto: toda ideia de intent futura entra neste arquivo, e não nas seções de escopo de cada intent (ver M-16 em `memory/project.md`).

Prioridade em MoSCoW. Situação: `Aberto`, `Em intent` (com o nome da pasta) ou `Feito`.

| ID | Ideia | Origem | Prioridade | Situação | Observações |
|---|---|---|---|---|---|
| BL-1 | Calibração (confiança antes de revelar) nos cards | 261117-study-techniques, 1.4 | Could | Aberto | Hoje a confiança vale só para questões; nos cards seria pedida antes de revelar e comparada à nota (Errei a Fácil). Exige dado em `review_log` e mais atrito no estudo diário |
| BL-2 | Rastreio de leitura por material e sugestão automática de pré-teste em material não lido | 261117-study-techniques, 1.4 | Could | Aberto | Hoje o pré-teste é iniciado pelo estudante; não há progresso de leitura por material |
| BL-3 | Geração: digitar a resposta do card antes de revelar o verso | 261117-study-techniques, 1.4 | Could | Aberto | Técnica de geração do livro "Fixe o Conhecimento" |
| BL-4 | Reflexão ao fim da sessão (resumo e anotação opcional) | 261117-study-techniques, 1.4 | Could | Aberto | |
| BL-5 | Reabrir o relatório de um pré-teste já feito (última rodada de cada material, ou histórico) | 261117-study-techniques, pós-Construção | Could | Aberto | Os dados já ficam em `pretest_attempt`; hoje o resumo só aparece uma vez, ao fim da rodada |
| BL-6 | Comparar o pré-teste com o desempenho posterior no mesmo material | 261117-study-techniques, pós-Construção | Could | Aberto | O que errava antes de estudar contra o acerto em Praticar depois; não exige migração nova |
| BL-7 | Importar as questões do próprio documento (modo de transcrever, não de criar) | 261119-generation-relevance, 0.2 | Should | Aberto | Extrai enunciado, texto motivador, alternativas e gabarito fielmente; sem gabarito, o item entra como rascunho para revisão. Depende da classificação de trechos por unidade (C) |
| BL-8 | O modelo pedir o trecho anterior ou seguinte quando precisar de contexto | 261119-generation-relevance, 0.2 | Could | Aberto | Uma rodada por lote, como último recurso na importação de questões (BL-7); a classificação por unidade e o contexto vizinho rotulado cobrem a maior parte dos casos |
| BL-9 | Reavaliar itens já gerados com o juiz de relevância e sugerir descartes | 261119-generation-relevance, 1.4 | Could | Aberto | Fora do escopo por decisão do autor (só novas gerações); a revisão atual já permite descartar à mão |

## Como usar

- Ao fechar o escopo de uma intent, o que ficou de fora e vale lembrar entra aqui com um ID `BL-n` novo (nunca reaproveitar IDs).
- Ao abrir uma intent a partir de um item, trocar a situação para `Em intent: <pasta>` e, ao concluir, para `Feito`.
- Itens descartados ficam com a situação `Descartado` e o motivo nas observações, para não serem propostos de novo.
