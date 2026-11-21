# Verificação de fase — Inception (images-in-cards)

Data: 2026-11-21 · Veredito: **PASS**

## 1. Inventário de artefatos

| Artefato | Situação |
|---|---|
| `requirements.md` (Original request, 1.1, 1.3, 1.4, 2.3, 2.4) | ✓ |
| `design.md` (1.6, 2.1, 2.2, 2.5, 2.6, 2.7, 2.8) | ✓ |
| `tasks.md` (2.9, 4 bolts, 49 tarefas, verificação aprovada) | ✓ |
| `mockups/rough.html` e `mockups/refined.html` | ✓ (render checado em jsdom: 54 e 70 estados) |
| `state.md` e `audit.md` | ✓ |
| Codekb `fe5170d` | ✓ vigente |

## 2. Rastreio

- FR-1..19 → US-1..7: todo FR tem ≥1 história e toda história liga a ≥1 FR (tabela de 2.4).
- FR → Unit: cada FR tem uma só Unit dona (mapa de 2.7); FR-1..19 aparecem em tarefas de `tasks.md` (verificado por script: nenhum FR sem tarefa).
- Unit → tarefa: UNIT-1..7 têm tarefas; as 49 tarefas nomeiam FR/NFR e um teste.
- NFR → Unit/DoD: NFR-1, 2, 5, 6, 8 (UNIT-1); NFR-3, 7 (UNIT-2 e 3); NFR-4 (UNIT-4); NFR-9 (todas, fechamento na UNIT-7).
- DAG: UNIT-1 → UNIT-2 → {3, 4, 5, 6}; UNIT-5 → UNIT-7; sem ciclos.

| FR | US | Unit | Tarefas |
|---|---|---|---|
| 1, 4, 5, 6 | US-1 | UNIT-1 | T-1.2 a T-1.11 |
| 2, 3, 8, 9, 11, 18, 19 | US-1, US-3 | UNIT-2 | T-2.1 a T-2.9 |
| 7, 10 | US-2, US-3 | UNIT-3 | T-3.1 a T-3.4 |
| 13, 14, 17 | US-5 | UNIT-4 | T-4.1 a T-4.5 |
| 12 | US-4 | UNIT-5 | T-5.1 a T-5.4 |
| 15 | US-6 | UNIT-6 | T-6.1 a T-6.4 |
| 16 | US-7 | UNIT-7 | T-7.1 a T-7.4 |

## 3. Consistência

- A3 de 1.1 (planilha sem imagem) foi revista em 1.4 (planilha em zip); o texto de A3 já registra a revisão.
- Os canais e erros de 2.8 batem com as tarefas T-1.6, T-4.3, T-5.2 e T-7.2; `CONTRACT_VERSION` fica em 2 em todos os documentos.
- Migração: a import-exam-questions usa `0008`; esta intent usa o próximo número livre na T-1.4 (nenhum número fixo contradiz).
- Sem contradições abertas.

## 4. Riscos e suposições aceitos

- A26 (IPC com bytes grandes), A21 (probe de WebP sem biblioteca) e a heurística de figuras vetoriais (ADR-5) são as maiores incertezas; mitigações registradas.
- UNIT-7 depende de intent externa (import-exam-questions) ainda em Construction.
- Suposições A1..A27 seguem `confirmed: no` até serem exercidas na Construction.
- Nenhuma regra nova de memória foi promovida (decisão do autor na retrospectiva).
