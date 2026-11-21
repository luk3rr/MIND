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
| BL-7 | Importar as questões do próprio documento (modo de transcrever, não de criar) | 261119-generation-relevance, 0.2 | Should | Em intent: 261120-import-exam-questions | Extrai enunciado, texto motivador, alternativas e gabarito fielmente; sem gabarito, o item entra como rascunho para revisão. Depende da classificação de trechos por unidade (C) |
| BL-8 | O modelo pedir o trecho anterior ou seguinte quando precisar de contexto | 261119-generation-relevance, 0.2 | Could | Aberto | Uma rodada por lote, como último recurso na importação de questões (BL-7); a classificação por unidade e o contexto vizinho rotulado cobrem a maior parte dos casos |
| BL-9 | Reavaliar itens já gerados com o juiz de relevância e sugerir descartes | 261119-generation-relevance, 1.4 | Could | Aberto | Fora do escopo por decisão do autor (só novas gerações); a revisão atual já permite descartar à mão |
| BL-10 | Exportar as questões e os cards para arquivo (Markdown, CSV, JSON ou Anki) | 261120-import-exam-questions, 1.4 | Could | Aberto | Saída do app, útil para levar as questões importadas para fora do MIND |
| BL-11 | Tipo de item discursivo (enunciado e resposta esperada, sem alternativas) | 261120-import-exam-questions, 1.4 | Could | Aberto | Exige mudança no estudo e na prática; hoje a importação ignora questões discursivas |
| BL-12 | Imagens em cards e questões | pedido do autor, 2026-11-21 | Should | Em intent: 261121-images-in-cards | UNIT-1 a UNIT-6 feitas e verificadas (anexar, recortar, ampliar, recorte do PDF, backup, planilha em zip); falta a UNIT-7 (figuras sugeridas na importação de provas), que depende da import-exam-questions |
| BL-13 | Geração usar figuras do material (o modelo escolhe qual figura acompanha o item) | 261121-images-in-cards, 1.4 | Could | Aberto | Hoje a geração é só texto; exigiria enviar imagem ao provedor ou indicar a região por regra |
| BL-14 | Oclusão de imagem como novo tipo de card | 261121-images-in-cards, 1.4 | Could | Aberto | Esconder regiões da figura e pedir o rótulo; muda o tipo de card, não só anexa imagem |

## Como usar

- Ao fechar o escopo de uma intent, o que ficou de fora e vale lembrar entra aqui com um ID `BL-n` novo (nunca reaproveitar IDs).
- Ao abrir uma intent a partir de um item, trocar a situação para `Em intent: <pasta>` e, ao concluir, para `Feito`.
- Itens descartados ficam com a situação `Descartado` e o motivo nas observações, para não serem propostos de novo.
