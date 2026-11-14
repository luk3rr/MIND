# Interactions — MIND
Status: draft · Confidence: medium

**Abertura hoje.**

```mermaid
sequenceDiagram
  actor U as Usuário
  participant CLI as mind (__main__)
  participant UV as uvicorn :8000
  participant APP as create_app
  participant B as Navegador
  U->>CLI: uv run mind
  CLI->>UV: uvicorn.run(create_app)
  UV->>APP: lifespan: registry, fila, serviços
  U->>B: abre 127.0.0.1:8000 manualmente
  B->>APP: GET / -> redireciona para /w/1/today
```

**Fluxo de estudo.**

```mermaid
sequenceDiagram
  participant B as Janela
  participant W as web/study_pages
  participant S as study/service
  participant DB as SQLite
  B->>W: GET /w/1/study/next (HTMX)
  W->>S: próximo card
  S->>DB: lê card_state
  W-->>B: fragmento HTML _study_card
  B->>W: POST /rate
  W->>S: FSRS agenda
  S->>DB: grava review_log
  W-->>B: próximo fragmento
```

**Geração.** POST `/generate` cria um job; a fila executa com limite de concorrência; o provedor devolve JSON validado em Pydantic; cada citação é conferida pelo `source_checker` e o item sem fonte é descartado. [src: src/mind/jobs/queue.py, src/mind/verification/source_checker.py]
