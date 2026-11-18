# AI-DLC State — study-techniques

- Intent: 261117-study-techniques
- Status: IN_PROGRESS
- Profile: mvp   Depth: Standard   Tests: Standard
- Project type: brownfield   Repos: ~/Projects/MIND
- Switches: collaborators=off reviewers=off plan_approval=off walking_skeleton=on autonomy=autonomous (esqueleto UNIT-1 aprovado em 2026-11-18; checkpoints comuns dispensados; falhas e ações irreversíveis ainda param) iteration=unit-major
- Verification command: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test --coverage` (approved 2026-11-18; Units com fluxo de tela somam `xvfb-run -a pnpm e2e`; pnpm em ~/.local/share/pnpm/bin)
- Language: chat=pt-BR files=pt-BR
- Current: phase=construction COMPLETE (UNIT-1 a UNIT-7 verificadas); falta a revisão do usuário e commits dos arquivos de docs   Updated: 2026-11-19T16:00:00-03:00

## Route
Legend: [x] done · [>] current · [ ] pending · [S] skipped (reason) · [!] needs redo
### Inception
- [x] 0.1–0.3 Initialization
- [x] 1.1 Intent Capture & Framing
- [x] 1.3 Feasibility & Constraints
- [x] 1.4 Scope Definition
- [x] 1.6 Rough Mockups
- [x] 2.1 Reverse Engineering (codekb atualizado para 4e7cc4e, baseline registrado)
- [x] 2.2 Practices Discovery
- [x] 2.3 Requirements Analysis
- [x] 2.4 User Stories
- [x] 2.5 Refined Mockups (HTML refinado)
- [x] 2.6 Domain Design
- [x] 2.7 Units Generation
- [x] 2.8 Contract Design
- [x] 2.9 Delivery Planning
### Construction
- [x] 3.1 Functional Design (nota por Unit)
- [x] 3.2 NFR Requirements (na nota por Unit)
- [x] 3.3 NFR Design (na nota por Unit)
- [S] 3.4 Infrastructure Design (sem infraestrutura)
- [x] 3.5 Code Generation
- [x] 3.6 Build & Test (construction/build-and-test.md)
- [S] 3.7 CI Pipeline (o CI existente já roda lint, formato, tipos, testes, e2e e pacote)
### Operations
- [S] 4.1–4.7 (perfil mvp não inclui Operations)

## Units (filled by 2.7)

| Unit | Depends on | Status | Verified |
|---|---|---|---|
| UNIT-1 Base e configurações | — | verified | 2026-11-18, exit 0 |
| UNIT-2 Intercalação | UNIT-1 | verified | 2026-11-18, exit 0 |
| UNIT-3 Feedback ao fim do bloco | UNIT-1 | verified | 2026-11-18, exit 0 |
| UNIT-4 Feedback no dia seguinte | UNIT-3 | verified | 2026-11-18, exit 0 |
| UNIT-5 Calibração | UNIT-3 | verified | 2026-11-19, exit 0 |
| UNIT-6 Pré-teste | UNIT-1, UNIT-5 | verified | 2026-11-19, exit 0 |
| UNIT-7 Verificação final e guia | UNIT-2, UNIT-4, UNIT-6 | verified | 2026-11-19, exit 0 |

## Open assumptions
- A1 (0.2): a divisão em uma ou duas intents foi decidida pelo usuário: **uma intent só**, com os quatro itens em Units separadas. A divisão em Units é revista em 2.7.
- A2 (1.1): não há prazo definido — confirmed: no
- A3 (1.1): pré-teste e feedback postergado valem para as questões; cards ficam com feedback imediato — confirmed: no
- A4 (1.1): intercalação vale para Estudar e Praticar; granularidade decidida em 2.3 — confirmed: no
- A5 (1.3): o pré-teste é iniciado pelo estudante em cada material; o app não rastreia leitura — confirmed: yes (gate 1.3)
- A6 (1.3): erros do pré-teste não contam em estatísticas, tópicos fracos, treino nem caderno de erros; a questão continua "não vista" na prática normal — confirmed: yes (gate 1.3)
- A7 (1.4): "bloco" do feedback ao fim do bloco é uma sessão de prática; definição exata em 2.3 — confirmed: yes (2.3)
- A8 (1.4): intercalação é opção por sessão, padrão desligado; granularidade em 2.3 — confirmed: yes (2.3)
- A9 (1.6): intercalação como opção "Misturar tópicos" por sessão, alternando por tópico ou material — confirmed: no
- A10 (1.6): o bloco da prática é a fila carregada (até 20 questões) — confirmed: no
- A11 (2.1): o e2e não foi rodado no baseline; roda antes do primeiro commit de código da Construção — confirmed: yes (T-1.1: e2e baseline 54 ok, 1 pulado)
- A12 (2.1): o contrato de practice:answer pode mudar de forma incompatível (sobe CONTRACT_VERSION) — confirmed: no
- A13 (2.3): a rodada de pré-teste usa as questões aprovadas do material nunca respondidas na prática; padrão de 10 questões — confirmed: yes (UNIT-6)
- A14 (2.3): o teto de 5.000 itens aprovados do NFR-3 é uma estimativa — confirmed: no
- A15 (2.3): excesso de confiança quando o acerto de "tenho certeza" < 80% ou o de "acho que sei" < 60% — confirmed: yes (2.6, limiares 80% e 60%)
- A16 (2.5): o aviso de pendentes fica em Hoje e a tela de feedback pendente abre dele e de Praticar, sem item próprio na barra lateral — confirmed: yes (gate 2.6)
- A17 (2.5): "Alternar por tópico ou material" vale só enquanto a sessão durar — confirmed: yes (gate 2.6)
- A18 (2.6): mínimo de 5 respostas por nível para exibir o aviso de excesso de confiança — confirmed: yes (gate 2.6)
- A19 (2.7): UNIT-2 e UNIT-3 são independentes e podem trocar de ordem na Construção — confirmed: yes (gate 2.7)
- A20 (2.7): o FR-17 (confiança no pré-teste) é entregue em UNIT-6, apesar de pertencer a UNIT-5 — confirmed: yes (gate 2.7)
- A21 (2.8): practice:next deixa de enviar a chave, o comentário e a citação antes da resposta, em todos os modos (amplia a UNIT-3) — confirmed: yes (gate 2.8)
- A22 (2.8): o rodízio sem estado usa mixKey devolvido pelo servidor; recarregar reinicia o rodízio — confirmed: yes (gate 2.8)
- A23 (2.8): material:list calcula pretestEligible por material, abaixo de 50 ms para 100 materiais — confirmed: yes (gate 2.8)
- A24 (2.9): o e2e da UNIT-4 insere tentativas com release_at no passado direto no banco; a virada das 4h fica nos testes de núcleo — confirmed: yes (gate 2.9)
- A25 (2.9): o pnpm e2e usa xvfb-run -a, como no CI e no make e2e — confirmed: yes (gate 2.9)
- A26 (3.1): "Restaurar padrões" só preenche o formulário, e Salvar grava (como em StudySettingsForm) — confirmed: yes (gate UNIT-1)
- A27 (3.1): a chave de material do rodízio vem de generation_run.material_id; itens manuais, do leitor e importados formam o grupo none — confirmed: no
- A28 (3.1): ItemActions continua funcionando em Praticar com questionView; confirmado na UNIT-3 — confirmed: yes (UNIT-3: aparece só depois do feedback)

## Notes
- Material de entrada: `reference/technique-audit.md` (conferência técnica do app contra as técnicas do livro, feita em 2026-11-17 sobre a versão 0.7.0). Os arquivos de `docs/` e o `README.md` desta sessão ainda não foram commitados, por pedido do usuário.
- Regras da memória aplicáveis desde já: M-1/M-13 (fonte dos itens gerados), M-4/M-5 (stack e testes), M-7 (sem `git push`), M-8 (idioma do código e cabeçalho), M-12 (mockups em HTML autocontido), M-14 (e2e no Electron real para fluxos de seleção, diálogos e arquivos).

## Memory candidates  (proposed, not yet approved)
