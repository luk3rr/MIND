# AI-DLC State — manual-cards-import

- Intent: 261116-manual-cards-import
- Status: COMPLETE
- Profile: mvp   Depth: Standard   Tests: Standard
- Project type: brownfield   Repos: ~/Projects/MIND
- Switches: collaborators=off reviewers=off plan_approval=off walking_skeleton=on autonomy=autonomous (aprovação do esqueleto UNIT-1, falhas e ações irreversíveis ainda param) iteration=unit-major
- Verification command: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test --coverage` (approved 2026-11-16; UNIT-11 soma `pnpm e2e`; pnpm em ~/.local/share/pnpm/bin)
- Language: chat=pt-BR files=pt-BR
- Current: phase=construction COMPLETE (UNIT-1 a UNIT-11 verificadas)   Updated: 2026-11-16T21:20:00-03:00

## Route
Legend: [x] done · [>] current · [ ] pending · [S] skipped (reason) · [!] needs redo
### Inception
- [x] 0.1–0.3 Initialization
- [x] 1.1 Intent Capture & Framing
- [x] 1.3 Feasibility & Constraints
- [x] 1.4 Scope Definition
- [x] 1.6 Rough Mockups
- [x] 2.1 Reverse Engineering (codekb: revisão completa com o usuário; defasado vs HEAD 240ed43)
- [x] 2.2 Practices Discovery
- [x] 2.3 Requirements Analysis
- [x] 2.4 User Stories
- [x] 2.5 Refined Mockups (HTML, 2 revisões)
- [x] 2.6 Domain Design
- [x] 2.7 Units Generation
- [x] 2.8 Contract Design
- [x] 2.9 Delivery Planning
### Construction
- [x] 3.1 Functional Design (nota por Unit)
- [x] 3.2 NFR Requirements
- [x] 3.3 NFR Design
- [S] 3.4 Infrastructure Design (sem infraestrutura)
- [x] 3.5 Code Generation
- [x] 3.6 Build & Test
- [S] 3.7 CI Pipeline (o CI existente já roda lint, formato, tipos, testes, e2e e pacote; nada a mudar)
### Operations
- [S] 4.1–4.7 (perfil mvp não inclui Operations)

## Units (filled by 2.7)
| Unit | Depends on | Status | Verified |
|---|---|---|---|
| UNIT-1 Cartão manual (esqueleto) | n/a | verified (esqueleto aprovado) | yes (2026-11-16) |
| UNIT-2 Questão manual | UNIT-1 | verified | yes (2026-11-16) |
| UNIT-3 Origem na lista e filtro | UNIT-1 | verified | yes (2026-11-16) |
| UNIT-4 Fonte opcional | UNIT-1 | verified | yes (2026-11-16) |
| UNIT-5 Ajuda do modelo no editor | UNIT-2 | verified | yes (2026-11-16) |
| UNIT-6 Leitor: seleção e criar item | UNIT-4 | verified | yes (2026-11-16) |
| UNIT-7 Gerar itens do trecho | UNIT-2, UNIT-6 | verified | yes (2026-11-16) |
| UNIT-8 Templates de importação | UNIT-1 | verified | yes (2026-11-16) |
| UNIT-9 Importar: arquivo e prévia | UNIT-8 | verified | yes (2026-11-16) |
| UNIT-10 Importar: confirmar | UNIT-9 | verified | yes (2026-11-16) |
| UNIT-11 Ponta a ponta, backup e pacote | UNIT-3, UNIT-5, UNIT-7, UNIT-10 | verified | yes (2026-11-16) |

## Open assumptions
- A-1: o modelo da ajuda de texto é o provedor já configurado (OpenRouter), com o mesmo consentimento e custo.
- A-2: itens manuais entram no FSRS e nas estatísticas como os demais.
- A-3: itens manuais e importados usam uma run sintética por origem (decisão final em ADR no 2.6).
- A-4: "Melhorar com IA" fica no editor inteiro, também ao editar itens já salvos.
- A-5: questões manuais de múltipla escolha têm de 2 a 5 alternativas.
- A-6: itens criados no leitor ganham origin "reader".
- A-7: duplicata = texto normalizado da frente/enunciado entre itens não descartados.
- A-8: o formato do cloze manual segue o dos cartões gerados (conferir em cards.ts na Construção).
- A-9: selection:estimate calcula o custo pelo tamanho do trecho e pela tabela de preços existente.
- A-10: os templates não têm colunas de fonte; itens importados nascem sem fonte (fonte por planilha no backlog).

## Memory candidates  (proposed, not yet approved)
- (nenhuma ainda)

## Notes
- Intent 261114-mind-study-tool aparece como IN_PROGRESS em state.md, mas é a versão Python original (substituída pela reescrita TypeScript); não afeta este intent.
