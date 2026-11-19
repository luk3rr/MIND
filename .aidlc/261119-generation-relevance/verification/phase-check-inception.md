# Verificação da fase — Inception (generation-relevance)

Data: 2026-11-19T20:28:06-03:00

## 1. Inventário de artefatos

| Artefato | Caminho | Presente |
|---|---|---|
| requirements.md § Original request, 1.1, 1.3, 1.4, 2.3, 2.4 | `requirements.md` | ✓ |
| design.md § 1.6, 2.1, 2.2, 2.5, 2.6, 2.7, 2.8 | `design.md` | ✓ |
| tasks.md § 2.9 (verificação, bolts, tarefas) | `tasks.md` | ✓ |
| mockups rough.html e refined.html | `mockups/` | ✓ |
| state.md e audit.md | `.` | ✓ |
| codekb atualizado (areas/generation.md) | `../codekb/MIND/areas/generation.md` | ✓ |
| backlog BL-7 a BL-9 | `../backlog.md` | ✓ |

## 2. Rastreabilidade (requisito → história → Unit → tarefa)

18 FR, 9 histórias, 8 NFR, 7 Units, 4 bolts, 55 tarefas.

| FR | Histórias | Unit dona | Tarefas |
|---|---|---|---|
| FR-1 | US-1, US-2, US-5 | UNIT-5 | T-1.2, T-1.6, T-5.5 |
| FR-2 | US-1, US-2 | UNIT-1 | T-1.2, T-1.3, T-1.9 |
| FR-3 | US-1, US-8 | UNIT-1 | T-1.2, T-1.3, T-1.5, T-1.9, T-2.8 |
| FR-4 | US-8 | UNIT-2 | T-2.7 |
| FR-5 | US-1, US-2 | UNIT-1 | T-1.4 |
| FR-6 | US-3 | UNIT-2 | T-2.2, T-2.3 |
| FR-7 | US-2, US-3 | UNIT-2 | T-2.4 |
| FR-8 | US-4, US-6 | UNIT-4 | T-4.2, T-4.3, T-4.5 |
| FR-9 | US-6 | UNIT-4 | T-4.2, T-4.4, T-4.6, T-4.7, T-6.3, T-6.5 |
| FR-10 | US-4 | UNIT-5 | T-5.1, T-5.2, T-5.3 |
| FR-11 | US-1, US-3 | UNIT-5 | T-5.3, T-5.4 |
| FR-12 | US-7 | UNIT-5 | T-5.6, T-6.4 |
| FR-13 | US-4 | UNIT-5 | T-5.2, T-5.7, T-6.4 |
| FR-14 | US-5 | UNIT-6 | T-6.1, T-6.2, T-6.3, T-7.1 |
| FR-15 | US-8 | UNIT-2 | T-2.1, T-2.5, T-2.8 |
| FR-16 | US-6 | UNIT-4 | T-2.6, T-4.6, T-4.8, T-6.5 |
| FR-17 | US-9 | UNIT-3 | T-3.1, T-3.2, T-3.3 |
| FR-18 | US-9 | UNIT-1 | T-1.7, T-1.8 |

| História | FR | Unit dona | Tarefas |
|---|---|---|---|
| US-1 | FR-1, FR-2, FR-3, FR-5, FR-11 | UNIT-5 | T-5.5, T-5.8 |
| US-2 | FR-1, FR-2, FR-5, FR-7 | UNIT-5 | T-5.5, T-5.8 |
| US-3 | FR-6, FR-7, FR-11 | UNIT-5 | T-5.4, T-5.8 |
| US-4 | FR-8, FR-10, FR-13 | UNIT-5 | T-5.2, T-5.8 |
| US-5 | FR-1, FR-14 | UNIT-6 | T-6.2, T-7.1, T-7.3 |
| US-6 | FR-8, FR-9, FR-16 | UNIT-6 | T-6.3, T-6.5 |
| US-7 | FR-12 | UNIT-6 | T-6.4, T-7.1 |
| US-8 | FR-3, FR-4, FR-15 | UNIT-2 | T-2.8, T-7.3 |
| US-9 | FR-17, FR-18 | UNIT-3 | T-3.3, T-7.2 |

| NFR | Unit(s) na Definição de pronto | Tarefas |
|---|---|---|
| NFR-1 | UNIT-7 | T-3.3, T-3.4, T-7.2 |
| NFR-2 | UNIT-4 | T-4.7, T-4.8 |
| NFR-3 | UNIT-4 | T-4.3, T-4.5 |
| NFR-4 | UNIT-2, UNIT-4 | T-2.1, T-4.1, T-4.9 |
| NFR-5 | UNIT-4 | T-4.4 |
| NFR-6 | todas (fecho na UNIT-7) | T-7.4, T-7.5 |
| NFR-7 | UNIT-6 | T-6.2 |
| NFR-8 | UNIT-2, UNIT-4, UNIT-6 (fecho na UNIT-7) | T-2.5, T-2.9, T-4.7, T-6.1, T-7.5 |

### Verificações automáticas

| Verificação | Resultado |
|---|---|
| Todo FR tem ≥1 história | ✓ |
| Toda história liga a ≥1 FR | ✓ |
| Todo FR, história e NFR tem ≥1 tarefa | ✓ |
| Toda história e FR tem uma Unit dona e uma tarefa nessa Unit | ✓ |
| O DAG de Units é acíclico (ordem: 1 → 2 → 3 → 4 → 5 → 6 → 7) | ✓ |
| Toda tarefa nomeia FR/US/NFR e teste | ✓ |

Bolts: BOLT-1 (UNIT-1, UNIT-2), BOLT-2 (UNIT-3, UNIT-4), BOLT-3 (UNIT-5, UNIT-6), BOLT-4 (UNIT-7); cada Unit está em exatamente um bolt.

## 3. Consistência

- Termos e IDs concordam entre os três arquivos (FR, US, NFR, UNIT, ADR, A1 a A25).
- Contradição achada e corrigida durante a 2.7: a seção 2.6 citava uma migration `0006_material_analysis`; ela foi dividida em `0006_run_out_of_scope` (UNIT-2) e `0007_material_analysis` (UNIT-4), e a 2.6, a 2.8 e as tarefas usam os dois nomes.
- Defeitos achados e corrigidos neste gate: o texto da US-9 estava truncado por um erro de gravação (o shell executou um comando dentro do texto) e US-5 e US-9 não apareciam nas tarefas das suas Units donas; corrigidos em `requirements.md` e `tasks.md`.
- Exceção declarada à M-11 (regenerar `fixtures/prompts.json` por script), registrada em 2.2, ADR-6 e UNIT-1; a candidata C1 à memória não foi aprovada e será reavaliada na Construção.
- Nota: a seção 2.5 diz que o diálogo da disciplina salva com Enter (campo de uma linha); a M-17 trata só de campos de instrução ao modelo (várias linhas), então não há conflito.
- Pendência declarada: a suíte completa e o e2e do baseline (A10) ainda não foram rodados; a tarefa T-1.1 faz isso antes do primeiro commit de código.

## 4. Veredito

**PASS**
