# Data model — MIND
Status: draft · Confidence: medium

**Armazenamento.** `app.db` (workspaces, configurações, consentimento, custos) e um `workspace.db` por workspace; migrações Alembic separadas (`migrations/app` e `migrations/workspace`). A chave da API fica em `.env` no diretório de dados, nunca na UI. [src: src/mind/config.py:30-37, src/mind/secrets.py]

```mermaid
erDiagram
  WORKSPACE ||--o{ MATERIAL : "tem (workspace.db)"
  MATERIAL ||--o{ CHUNK : contem
  MATERIAL ||--o{ GENERATION_RUN : alimenta
  GENERATION_RUN ||--o{ ITEM : produz
  TOPIC ||--o{ ITEM : classifica
  ITEM ||--o| CARD_STATE : agenda
  ITEM ||--o{ REVIEW_LOG : registra
  ITEM ||--o{ ATTEMPT : responde
  CHUNK ||--o| CHUNK_EMBEDDING : indexa
  JOB }o--|| MATERIAL : processa
  CHAT_MESSAGE }o--|| WORKSPACE : pertence
```

Entidades: `Job, Material, Chunk, Topic, GenerationRun, Item, CardState, ReviewLog, Meta, Attempt, ChatMessage, ChunkEmbedding` por workspace; `Workspace, Setting, Consent, CostEntry, ModelPrice` no app. [src: src/mind/db/workspace_models.py, app_models.py]

**PII.** O conteúdo dos materiais é do usuário; só trechos usados na geração vão ao provedor, após consentimento. [src: README.md:7-8]

**Diretório de dados.** `platformdirs.user_data_dir("mind")`, ou `MIND_DATA_DIR`. [src: src/mind/config.py:63-67]
