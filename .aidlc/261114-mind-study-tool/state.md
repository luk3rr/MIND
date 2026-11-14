# AI-DLC State — mind-study-tool

- Intent: 261114-mind-study-tool
- Status: IN_PROGRESS
- Profile: mvp   Depth: Standard   Tests: Standard
- Project type: greenfield   Repos: ~/Projects/MIND
- Switches: collaborators=off reviewers=off plan_approval=off walking_skeleton=on autonomy=autonomous-through-BOLT-4 (design gates waived by the user on 2026-11-14) iteration=unit-major
- Verification command: `uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest --cov --cov-fail-under=80` (approved 2026-11-14)
- Language: chat=pt-BR files=pt-BR
- Current: phase=construction stage=3.1 Functional Design (Inception concluída, aguardando início da Construction)   Updated: 2026-11-14T00:00:00

## Route
Legend: [x] done · [>] current · [ ] pending · [S] skipped (reason) · [!] needs redo
### Inception
- [x] 0.1–0.3 Initialization
- [x] 1.1 Intent Capture & Framing
- [x] 1.3 Feasibility & Constraints
- [x] 1.4 Scope Definition
- [x] 1.6 Rough Mockups
- [x] 1.7 Approval & Handoff (discovery concluído)
- [S] 2.1 Reverse Engineering (greenfield)
- [x] 2.2 Practices Discovery
- [x] 2.3 Requirements Analysis
- [x] 2.4 User Stories
- [x] 2.5 Refined Mockups
- [x] 2.6 Domain Design
- [x] 2.7 Units Generation
- [x] 2.8 Contract Design
- [x] 2.9 Delivery Planning
### Construction
- [x] 3.1 Functional Design (nota de design por Unit, funde 3.1–3.3)
- [S] 3.2 NFR Requirements (fundida em 3.1 por Unit)
- [S] 3.3 NFR Design (fundida em 3.1 por Unit)
- [S] 3.4 Infrastructure Design (sem nuvem; Docker na UNIT-11)
- [x] 3.5 Code Generation
- [x] 3.6 Build & Test
- [x] 3.7 CI Pipeline

## Units (filled by 2.7)
| Unit | Depends on | Status | Verified |
|---|---|---|---|
| UNIT-1 Fundação e workspaces (+ API v1 base) | — | verified | yes |
| UNIT-2 Provedor LLM, configurações e custo | UNIT-1 | verified | yes |
| UNIT-3 Ingestão PDF/MD, busca e biblioteca | UNIT-1 | verified | yes |
| UNIT-4 Flashcards com fonte e revisão | UNIT-2, UNIT-3 | verified (SM-1 pendente) | yes |
| UNIT-5 Estudo FSRS e Hoje | UNIT-4 | verified | yes |
| UNIT-6 Questões verificadas | UNIT-4 | verified (qualidade com modelo real pendente) | yes |
| UNIT-7 Caderno de erros e estatísticas | UNIT-5, UNIT-6 | verified | yes |
| UNIT-8 OCR, URL e DOCX | UNIT-3 | verified (OCR real pendente) | yes |
| UNIT-9 Treino de pontos fracos | UNIT-4, UNIT-7 | verified | yes |
| UNIT-10 Chat e embeddings opcionais | UNIT-2, UNIT-3 | verified (embeddings reais pendentes) | yes |
| UNIT-11 Backup e distribuição | UNIT-1, UNIT-4 | verified (Docker e 2ª plataforma pendentes) | yes |

## Open assumptions

## Memory candidates

## Notes
- Projeto independente: não deve ler nem copiar dados pessoais do autor de outros projetos.
