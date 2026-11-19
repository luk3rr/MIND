# Code KB — MIND
- Repo path: ~/Projects/MIND   Remote: git@github.com:luk3rr/MIND.git
- Analysed commit: 0c425b9 (2026-11-19; v0.8.2; áreas de geração e ingestão revistas, o restante vale como em 4e7cc4e)   Branch: main   Anterior: 240ed43 (v0.6.0) + manual-cards-import; antes 101d3e6, estendido até ced33fa
- Depth: Standard (focado: arquitetura, dados, IPC, ingestão de PDF, estudo/estatísticas, janelas/segurança, testes)   Scope: src/, tests/, scripts/, electron-builder.yml, .github/workflows; excluídos: node_modules, out, dist, coverage
- Last full pass: 2026-11-16 (atualizado para o intent manual-cards-import; antes 2026-11-14, reescrito; a versão Python anterior, commit 7a16826, ficou em `.aidlc/261114-study-time-pdf-viewer/archive/codekb-python/`)   Updated after study-techniques (2026-11-19, rascunho): api, data-model, interactions. Last review with user: 2026-11-17 (mudanças desde 240ed43, baseline e a regra "questões fora do FSRS"); anterior 2026-11-16 (dados, convenções, leitor e baseline; arquitetura e dados confirmados em 2026-11-14)

| File | Status | Confidence | Notes |
|---|---|---|---|
| overview.md | draft | high | |
| areas/generation.md | human-reviewed (2026-11-19) | high | geração, juiz, lotes e trechos; intent generation-relevance |
| architecture.md | human-reviewed (2026-11-14) | high | |
| code-structure.md | human-reviewed (2026-11-17, mudanças) | high | |
| technology-stack.md | human-reviewed (2026-11-17, mudanças) | high | versões em package.json |
| data-model.md | human-reviewed (2026-11-14); adições de 2026-11-16 e 2026-11-17 em draft | high | itens sem geração: padrão da run sintética a decidir em 2.6 |
| api.md | draft | high | canais IPC; `early` e `waiting` de `study:next` acrescentados em 2026-11-17 |
| interactions.md | human-reviewed (2026-11-17, mudanças) | medium | fila de Estudar, resposta de questão e `attempt` |
| conventions.md | human-reviewed (2026-11-17, hook de pre-commit) | medium | |
| operations.md | human-reviewed (2026-11-17, mudanças) | medium | |
| quality-and-risks.md | human-reviewed (2026-11-17) | high | baseline: 1192 testes ok, 96,45% linhas |
