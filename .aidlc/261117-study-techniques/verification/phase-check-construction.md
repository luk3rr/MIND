# Phase check — Construction (study-techniques)

Data: 2026-11-18.

## 1. Artifact inventory

| Artefato | Situação |
|---|---|
| Código das UNIT-1 a UNIT-7 (commits locais na `main`) | ✓ |
| Testes de unidade, de componente e e2e por prática (M-15) | ✓ |
| `tasks.md` com tarefas marcadas e resumo por Unit | ✓ |
| `construction/build-and-test.md` | ✓ |
| Estágio 3.7 (CI) | Pulado: o CI existente já cobre lint, formato, tipos, testes, e2e e pacote |

## 2. Traceability (Unit → código → testes → resultado)

| Unit | Resultado | Testes principais |
|---|---|---|
| UNIT-1 Base e configurações | verificada | `db.test.ts`, `settings.test.ts`, `practice-settings.test.tsx`, `practice-settings.spec.ts` |
| UNIT-2 Intercalação | verificada | `interleave.test.ts`, `study-mix.test.ts`, `practice-mix.test.ts`, `mix.test.tsx`, `interleave.spec.ts` |
| UNIT-3 Feedback ao fim do bloco | verificada | `practice-feedback*.test.*`, `feedback-block.spec.ts` |
| UNIT-4 Feedback no dia seguinte | verificada | `feedback-policy.test.ts`, `feedback-pending.test.tsx`, `feedback-pending.spec.ts` |
| UNIT-5 Calibração | verificada | `calibration.test.ts`, `calibration.test.tsx`, `calibration.spec.ts` |
| UNIT-6 Pré-teste | verificada | `pretest.test.ts`, `pretest.test.tsx`, `pretest.spec.ts` |
| UNIT-7 Verificação final e guia | verificada | `practices.integration.test.ts` |

Cada NFR tem projeto e validação: NFR-1 e NFR-10 (migração e backup), NFR-2 (padrões preservados, testes antigos sem mudança de comportamento), NFR-3 e NFR-4 (rodízio), NFR-5 (acessibilidade em componentes), NFR-6 (teste estático de rede), NFR-7 (contrato v2), NFR-8 (pt-BR), NFR-9 (cobertura 96,4%, um e2e por prática).

## 3. Consistency

Sem contradições abertas. Desvios do plano registrados em `tasks.md` por Unit (rota de feedback pendente em `/w/:id/study/feedback`; e2e do dia seguinte com relógio adiantado; `pretest:answer` sem registro de rodadas; botão de pré-teste abre diálogo de explicação).

## 4. Pontos de atenção

- O contraste das faixas nos temas claro e escuro não foi revisado visualmente.
- Os mockups nunca foram renderizados por um navegador aqui.
- `practice-session.test.tsx` mostrou instabilidade uma vez sob carga.
- Correções pós-verificação feitas a pedido do usuário: botão de pré-teste sem questões, perda da rodada ao sair, aviso de confiança, voltar às puladas e remoção do "Virar card" no pré-teste.

## 5. Verdict

**PASS.** Último resultado completo: 1342 testes e 61 specs e2e passando (1 pulado), lint, tipos e formato com exit 0.
