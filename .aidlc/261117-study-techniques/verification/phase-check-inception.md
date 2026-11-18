# Phase check — Inception (study-techniques)

Data: 2026-11-18 · Verificação feita pela leitura dos três arquivos do plano, com um script que cruza IDs.

## 1. Artifact inventory

| Artefato | Situação |
|---|---|
| `requirements.md` (Original request, 1.1, 1.3, 1.4, 2.3, 2.4) | ✓ |
| `design.md` (1.6, 2.1, 2.2, 2.5, 2.6, 2.7, 2.8) | ✓ |
| `tasks.md` (2.9: comando de verificação aprovado, bolts, tarefas) | ✓ |
| `mockups/rough.html` e `mockups/refined.html` (M-12) | ✓ |
| `.aidlc/codekb/MIND/` atualizado para o commit `4e7cc4e` | ✓ |
| `state.md` (rota, Units, suposições, interruptores) e `audit.md` | ✓ |
| Estágios 1.2, 1.5 e 1.7 | Fora da rota do perfil `mvp` |

## 2. Traceability (FR/NFR → história → Unit → tarefa)

| Verificação | Resultado |
|---|---|
| FR sem história | Nenhum (23 FR cobertos por 9 histórias) |
| Histórias sem FR | Nenhuma |
| FR sem Unit | Nenhum |
| FR com mais de uma Unit | Nenhum (FR-17 pertence à UNIT-5; a parte do pré-teste é entregue na UNIT-6, anotado em A20) |
| Histórias sem Unit ou com mais de uma | Nenhuma |
| NFR sem Unit ou fase de Construção | Nenhum (NFR-1 a NFR-10 aparecem na Definição de Pronto de alguma Unit) |
| Unit sem tarefa | Nenhuma (59 tarefas: 10, 8, 10, 7, 9, 9 e 6) |
| Tarefa sem `covers`, arquivos ou teste | Nenhuma |
| FR sem nenhuma tarefa | Nenhum |
| Grafo de Units | Acíclico: UNIT-1 → UNIT-2, UNIT-3; UNIT-3 → UNIT-4, UNIT-5; UNIT-1 e UNIT-5 → UNIT-6; UNIT-2, UNIT-4 e UNIT-6 → UNIT-7 |

## 3. Consistency

Contradições encontradas e já corrigidas nesta verificação:

- `requirements.md § 1.3` e o FR-4 falavam em "coluna de fase em `attempt`", mas o ADR-1 (2.6) escolheu a tabela própria `pretest_attempt`; os dois textos foram ajustados.
- O NFR-1 dizia que as respostas antigas passam à "fase prática"; passou a dizer "já vistas", como na migração `0004`.
- `material:list` (`pretestEligible`) estava na UNIT-1 em 2.8 e na UNIT-6 em `tasks.md`; ficou na UNIT-6 nos dois.
- O ADR-3 supunha a fila inteira em memória, mas as filas entregam um item por chamada; o ADR e a tabela de componentes passaram ao rodízio sem estado (`pick` com `afterKey` e `mixKey`).

Sem contradições restantes conhecidas. Termos, IDs e interfaces (canais, colunas, chaves de `meta`) conferem entre os três arquivos.

## 4. Pontos de atenção para a Construção

- BOLT-2 tem a maior incerteza: a mudança de contrato de `practice:next` e `practice:answer` (A21) toca a `PracticePage` e muitos testes.
- O e2e do baseline ainda não foi rodado (T-1.1, A11).
- O e2e do dia seguinte insere dados no banco em vez de simular o relógio no Electron (A24).
- Os limiares de excesso de confiança (80%, 60%, mínimo de 5 respostas) vieram de uma escolha razoável, não do livro.

## 5. Verdict

**PASS.** Nenhum órfão em nenhum sentido, nenhum ciclo e nenhuma contradição aberta. A intent está pronta para a Construção, que só começa com a sua ordem.
