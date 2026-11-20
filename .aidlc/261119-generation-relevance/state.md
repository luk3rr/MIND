# AI-DLC State — generation-relevance

- Intent: 261119-generation-relevance
- Status: IN_PROGRESS
- Profile: mvp   Depth: Standard   Tests: Standard
- Project type: brownfield   Repos: ~/Projects/MIND
- Switches: collaborators=off reviewers=off plan_approval=off walking_skeleton=on autonomy=autonomous (esqueleto UNIT-1 aprovado antes de seguir; falhas e ações irreversíveis ainda param) iteration=unit-major
- Verification command: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test --coverage` (approved 2026-11-19; UNIT-6 e UNIT-7 somam `xvfb-run -a pnpm e2e`; pnpm em ~/.local/share/pnpm/bin)
- Language: chat=pt-BR files=pt-BR
- Current: phase=construction stage=3.5 Code Generation (UNIT-5)   Updated: 2026-11-19T21:02:27-03:00

## Route
Legend: [x] done · [>] current · [ ] pending · [S] skipped (reason) · [!] needs redo
### Inception
- [x] 0.1–0.3 Initialization
- [x] 1.1 Intent Capture & Framing
- [x] 1.3 Feasibility & Constraints (GO)
- [x] 1.4 Scope Definition
- [x] 1.6 Rough Mockups (mockups/rough.html)
- [x] 2.1 Reverse Engineering (codekb atualizado para 0c425b9)
- [x] 2.2 Practices Discovery
- [x] 2.3 Requirements Analysis (FR-1..18, NFR-1..8)
- [x] 2.4 User Stories (US-1..9)
- [x] 2.5 Refined Mockups (mockups/refined.html)
- [x] 2.6 Domain Design (ADR-1..8)
- [x] 2.7 Units Generation (7 Units)
- [x] 2.8 Contract Design (aditivo, versão 2)
- [x] 2.9 Delivery Planning (tasks.md, 55 tarefas, 4 bolts)
### Construction
- [ ] 3.1 Functional Design
- [ ] 3.2 NFR Requirements
- [ ] 3.3 NFR Design
- [ ] 3.4 Infrastructure Design
- [ ] 3.5 Code Generation
- [ ] 3.6 Build & Test
- [ ] 3.7 CI Pipeline
### Operations
- [S] 4.1–4.7 (perfil mvp não inclui Operations)

## Units (filled by 2.7)
| Unit | Depends on | Status | Verified |
|---|---|---|---|
| UNIT-1 Prompts, escopo e "até N" | — | verified (esqueleto aprovado) | 2026-11-19, exit 0 |
| UNIT-2 Juiz de relevância, resumo e segunda rodada | UNIT-1 | verified | 2026-11-19, exit 0 |
| UNIT-3 Fixtures e avaliação | UNIT-2 | verified (T-3.4 baseline real pendente do usuário) | 2026-11-19, exit 0 |
| UNIT-4 Análise dos trechos | — | verified | 2026-11-19, exit 0 |
| UNIT-5 Lotes por unidade e papéis | UNIT-1, UNIT-2, UNIT-4 | pending | |
| UNIT-6 Disciplina na tela | UNIT-4, UNIT-5 | pending | |
| UNIT-7 Verificação final | UNIT-3, UNIT-6 | pending | |

## Open assumptions
- A1 (0.2): escopo A+B+C; D (importar questões do documento) e o pedido de contexto pelo modelo vão para o backlog (BL-7, BL-8) — confirmed: yes (escolha no início da intent)
- A2 (1.1): o texto motivador pode ser contexto de uma questão quando a habilidade depende dele, nunca fonte de card — confirmed: no
- A3 (1.1): a disciplina vale por material, não por geração — confirmed: no
- A4 (1.3): um trecho tem um papel dominante; a continuidade cobre unidades que o cruzam — confirmed: no
- A5 (1.3): a classificação roda em janelas deslizantes com sobreposição — confirmed: no
- A6 (1.4): a disciplina do estudante vale por material e prevalece sobre a inferida — confirmed: no
- A7 (1.4): o campo fica no envio e na edição do material; a tela de gerar mostra a disciplina vigente — confirmed: no
- A8 (1.6): a classificação começa depois da indexação e não bloqueia o uso do material — confirmed: no
- A9 (1.6): "Alterar" na tela de gerar abre o mesmo diálogo da Biblioteca — confirmed: no
- A10 (2.1): suíte completa e e2e rodam como baseline antes do primeiro commit da Construção — confirmed: no
- A11 (2.1): material anterior à migration: analisado ao abrir Gerar com ele (ADR-7) — confirmed: yes (gate 2.6)
- A12 (2.2): nota de divergência e script de regeneração dos prompts no mesmo commit da mudança — confirmed: no
- A13 (2.3): a avaliação com o modelo real é um script manual, fora do CI — confirmed: no
- A14 (2.3): o conjunto de fixtures é pequeno (algumas dezenas de trechos); tamanho final em 2.9 — confirmed: no
- A15 (2.3): a segunda rodada de FR-4 só roda se faltar item e houver lotes não usados — confirmed: no
- A16 (2.5): o banner de fallback aparece também sem provedor configurado — confirmed: no
- A17 (2.5): a linha da segunda rodada só aparece quando ela rodou — confirmed: no
- A18 (2.6): janelas de ~12 trechos com 2 de sobreposição — confirmed: no
- A19 (2.6): lote por unidade até 9000 caracteres; unidades maiores se dividem na fronteira de um trecho — confirmed: no
- A20 (2.6): a disciplina inferida vem da primeira janela — confirmed: no
- A21 (2.7): migration dividida em 0006 (UNIT-2) e 0007 (UNIT-4) — confirmed: no
- A22 (2.7): FR-9, FR-12 e FR-13 têm exibição entregue na UNIT-6 — confirmed: no
- A23 (2.7): UNIT-3 e UNIT-4 podem trocar de ordem — confirmed: no
- A24 (2.8): rounds e with_analysis entram na migration 0006 — confirmed: no
- A25 (2.8): CONTRACT_VERSION continua 2 (mudanças aditivas) — confirmed: no

## Memory candidates  (proposed, not yet approved — see protocols.md §Memory)
- C1 (gate 2.2, não aprovada na retrospectiva de 2026-11-19; reavaliar na Construção): "Quando os prompts de geração mudam por decisão, regenerar as entradas de cards, questões e juiz de fixtures/prompts.json por script TS e anotar a divergência em fixtures/README.md" — scope guess: project (emenda da M-11)
- C3 (retrospectiva da Inception, não aprovada): "Trabalho de IA em segundo plano deriva o estado do job, sem coluna de status" — scope guess: project
