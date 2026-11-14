# Backlog — próximos intents e bolts sugeridos

Itens fora do MVP, registrados durante o discovery (1.4). Cada um pode virar um novo intent (`/ai-dlc`) ou um bolt posterior.

| ID | Sugestão | Origem | Notas |
|---|---|---|---|
| B-1 | **Simulado cronometrado**: prova montada por peso de tópico, com tempo por questão e relatório ao final | Pedido do autor em 1.4 | Depende de S-2 (questões) e S-4 (estatísticas). Primeiro candidato a próximo intent |
| B-2 | Exportação para Anki (.apkg via genanki) | Ideias iniciais | Barata; saída de emergência e ajuda na adoção |
| B-3 | Mapa de currículo: cola o conteúdo programático e mostra cobertura (tópicos com material, cards e questões) | Ideias iniciais | Mantém o produto genérico |
| B-4 | Modo sessão curta (ex.: 20 min): cards vencidos + poucas questões | Ideias iniciais | Depende de S-3 |
| B-5 | Detector de duplicatas entre materiais | Ideias iniciais | Embeddings ou hash de texto |
| B-6 | Perfis de prova configuráveis (estilos de questão: Certo/Errado, múltipla escolha, discursiva) | 1.1 (produto genérico) | Pode ser parte de S-2 como configuração de prompt |
| B-7 | Operações: empacotamento Docker, release e documentação para open source | 1.1 (SM-3) | Fora do perfil mvp (sem fase Operations); tratar em intent próprio |
| B-8 | Editar o card durante o estudo (tecla `E`) | 3.1 UNIT-5 | Reaproveitar o formulário de edição da Revisão |
| B-9 | Otimização dos parâmetros do FSRS por usuário | 3.1 UNIT-5 | Pacote opcional `fsrs[optimizer]` (torch) é pesado; avaliar depois |
| B-10 | Editar as alternativas de uma questão na revisão | 3.1 UNIT-6 | Hoje só enunciado, comentário e tópico |
| B-11 | Sugerir a mesclagem de tópicos parecidos | 3.1 UNIT-7 | Comparar nomes normalizados ou usar embeddings (UNIT-10) |
| B-12 | Estudar só os cards do caderno de erros com um filtro dedicado | 3.1 UNIT-7 | Hoje o seletor filtra por tópico, material e tipo |
| B-13 | Busca vetorial com sqlite-vec no lugar da similaridade em memória | BOLT-4 A61 | Só vale com dezenas de milhares de trechos |
| B-14 | Memória de conversa no chat | BOLT-4 A60 | Reescrever a pergunta com os turnos anteriores |
