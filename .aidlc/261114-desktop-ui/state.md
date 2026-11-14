# AI-DLC State — desktop-ui

- Intent: 261114-desktop-ui
- Status: IN_PROGRESS
- Profile: mvp   Depth: Standard   Tests: Standard
- Project type: brownfield   Repos: ~/Projects/MIND
- Switches: collaborators=off reviewers=off plan_approval=off walking_skeleton=on autonomy=autonomous-checkpoints (design gates e falhas seguem com aprovação) iteration=unit-major commits=max-20-total-até-o-fim (commit 16 com o UNIT-13)
- Verification command: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test --coverage` (approved 2026-11-14; válido após as ferramentas do UNIT-1)
- Language: chat=pt-BR files=pt-BR
- Current: phase=construction stage=3.5 Code Generation (UNIT-13 verificado; próximo UNIT-14)   Updated: 2026-11-14T18:06:49.037261-03:00

## Route
Legend: [x] done · [>] current · [ ] pending · [S] skipped (reason) · [!] needs redo
### Inception
- [x] 0.1–0.3 Initialization
- [x] 1.1 Intent Capture & Framing (v2: TypeScript + Electron)
- [x] 1.3 Feasibility & Constraints (v2: TypeScript + Electron, GO)
- [x] 1.4 Scope Definition (v2: inclui reescrever o núcleo)
- [x] 1.6 Rough Mockups (revisar se mudar o framework de UI)
- [x] 2.1 Reverse Engineering (codekb vale como especificação da reescrita)
- [x] 2.2 Practices Discovery (v2: práticas TypeScript)
- [x] 2.3 Requirements Analysis
- [x] 2.4 User Stories
- [x] 2.5 Refined Mockups
- [x] 2.6 Domain Design
- [x] 2.7 Units Generation
- [x] 2.8 Contract Design
- [x] 2.9 Delivery Planning
### Construction
- [>] 3.1 Functional Design (nota por Unit; UNIT-1 feita)
- [ ] 3.2 NFR Requirements
- [ ] 3.3 NFR Design
- [ ] 3.4 Infrastructure Design (empacotamento .deb)
- [ ] 3.5 Code Generation
- [ ] 3.6 Build & Test
- [ ] 3.7 CI Pipeline

## Units (filled by 2.7)
| Unit | Depends on | Status | Verified |
|---|---|---|---|
| UNIT-1 Fundação do repositório e ferramentas | — | verified | yes |
| UNIT-2 Casca Electron e IPC | UNIT-1 | verified | yes |
| UNIT-3 Dados, workspaces e jobs | UNIT-1 | verified | yes |
| UNIT-5 Casca de UI, tema e atalhos | UNIT-2, UNIT-3 | verified | yes |
| UNIT-6 Pacote `.deb` (esqueleto ambulante) | UNIT-2, UNIT-3, UNIT-5 | verified (instalação real pendente) | yes |
| UNIT-4 Provedor LLM, configurações e custo | UNIT-3 | verified | yes |
| UNIT-7 Ingestão, busca e biblioteca | UNIT-3, UNIT-5 | verified | yes |
| UNIT-8 OCR, URL e DOCX | UNIT-7 | verified | yes |
| UNIT-9 Flashcards com fonte e revisão | UNIT-4, UNIT-7 | verified | yes |
| UNIT-10 Estudo FSRS | UNIT-9 | verified | yes |
| UNIT-11 Questões verificadas e prática | UNIT-9 | verified | yes |
| UNIT-12 Caderno de erros e estatísticas | UNIT-10, UNIT-11 | verified | yes |
| UNIT-13 Treino de pontos fracos | UNIT-12 | verified | yes |
| UNIT-14 Chat e busca semântica | UNIT-4, UNIT-7 | not started | no |
| UNIT-15 Backup do workspace | UNIT-3 | not started | no |
| UNIT-16 Fechamento e remoção do Python | UNIT-6, UNIT-8, UNIT-12, UNIT-13, UNIT-14, UNIT-15 | not started | no |

## Open assumptions

## Memory candidates  (proposed, not yet approved — a pergunta da retrospectiva ficou sem resposta)
- C1 (Inception): Substituir M-4 e M-5 por TypeScript strict, Electron, React + Vite, pnpm, ESLint + Prettier, zod, Vitest, Playwright, LLM mockado — scope: project
- C2 (Inception): O app nunca abre porta de rede; o renderer só fala com o núcleo por IPC validado — scope: project
- C3 (Inception): O Python em `legacy/` e as fixtures são a especificação até a paridade e são apagados no UNIT-16 — scope: project
- C4 (Inception): Dados do usuário ficam fora da instalação; instalar, atualizar ou remover o pacote não os apaga — scope: project
