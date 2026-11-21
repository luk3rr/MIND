# Modelo de dados

Status: human-reviewed (2026-11-14) · Confiança: alta

```mermaid
erDiagram
  workspace_app ||--o{ material : "pasta workspaces/uuid"
  material ||--o{ chunk : contém
  material ||--o{ generation_run : origem
  generation_run ||--o{ item : gera
  topic ||--o{ item : rotula
  chunk ||--o{ item : "fonte (chunk_id, source_page, quote)"
  item ||--o| card_state : FSRS
  item ||--o{ review_log : revisões
  item ||--o{ attempt : respostas
  chunk ||--o| chunk_embedding : vetor
```

- **`app.db`** (global): `workspace`, `setting`, `consent`, `cost_ledger`, `model_price`. [src: src/core/db/app-schema.ts]
- **`workspaces/<uuid>/workspace.db`**: `job`, `material`, `chunk` (+FTS), `topic`, `generation_run`, `item`, `card_state`, `review_log` (`duration_ms`, `day`), `attempt` (`seconds`, `day`), `meta` (chave/valor por workspace), `chat_message`, `chunk_embedding`. [src: src/core/db/workspace-schema.ts]
- **Arquivos**: `workspaces/<uuid>/files/<…>/<original>`; `material.stored_path` é relativo à raiz do workspace e a exclusão do material remove a pasta. [src: src/core/ingestion/service.ts:182,224,411]
- **Backup**: `.zip` com manifesto, snapshot do banco e `files/`. [src: src/core/workspaces/archive.ts:78-84]
- **Migrações**: Drizzle em `src/core/db/migrations/{app,workspace}` (workspace: 0000 init, 0001 índice de chunk, 0002 FTS). [src: db/migrations]
- `material` não tem `topic_id`; o tópico vem de `item` e `generation_run`. `day` é o dia local de estudo.
- Não existe hoje nenhuma tabela de sessões de estudo; a meta diária atual é em número de cartões (`study settings.dailyGoal`). [src: src/renderer/src/pages/TodayPage.tsx]

**Adições do intent study-time-pdf-viewer (2026-11-14).** Tabela `study_session` (migração `workspace/0003_study_session.sql`): `started_at`, `ended_at`, `seconds`, `source` (`cards|practice|reading|manual`), `day` (dia de estudo local), `material_id` e `topic_id` (ambos `ON DELETE SET NULL`); índices por `day` e `source`. Cada **intervalo** é uma linha (pausar fecha, retomar abre outro); o aberto é regravado a cada 30 s. Chaves novas em `meta`: `time.dailyGoalMin` (60), `time.idleSeconds` (120), `time.autoEnabled` (1) e `reader.lastPage.<materialId>`. O backup leva tudo (banco inteiro); backups sem a `0003` migram ao importar. [src: src/core/time/service.ts; src/core/reader/service.ts]

**Itens sem geração (verificado em 2026-11-16, commit 240ed43).** [user: sem certeza se a run sintética é o padrão certo; "se funcionar, pode seguir esse padrão" — decisão final em 2.6 (ADR)] `item.run_id` é `NOT NULL` e aponta para `generation_run`; o caderno de erros já cria itens sem geração usando uma **run sintética** única por workspace (`kind = "notebook"`, `subtype = "error_note"`, `model = "-"`, `requested = 0`, `status = "done"`) e `item.origin = "error_note"`, `origin_item_id` = questão de origem, `status = "approved"`, `approved_at` preenchido. [src: src/core/notebook/service.ts:16-17,86-106,149-165] `item.origin` tem padrão `"generated"`. O estado FSRS (`card_state`) **não** é criado na aprovação: a primeira avaliação em `StudyService.rate` insere a linha; cartão aprovado sem `card_state` já é servido como novo. [src: src/core/study/service.ts:477-505] Contadores de `generation_run` (`approved`, `approved_unedited`, `discarded_review`) só se movem em `ReviewService.review`; `catalog()` e `stats:materials` fazem `innerJoin` com `generation_run`. [src: src/core/review/service.ts:342-388,160; src/core/stats/service.ts:272-276]

**Migrações do workspace**: 0000 init, 0001 índice de chunk, 0002 FTS, 0003 `study_session`. Nada novo desde ced33fa. [src: src/core/db/migrations/workspace]

**Origens e runs sintéticas (verificado em 2026-11-16, intent manual-cards-import).** Decisão do ADR-1: itens criados fora da geração continuam com `run_id` obrigatório e apontam para uma run sintética por origem, criada na primeira vez (`kind` = `manual`, `reader` ou `import`, além de `notebook` do caderno de erros; `model = "-"`, `status = "done"`, contadores zerados). `item.origin` assume `generated`, `manual`, `reader`, `import` ou `error_note`. Itens manuais e importados nascem `approved` com `approved_at`, sem `chunk_id` e sem `quote`; os do leitor levam `chunk_id`, página, título e citação quando o trecho é achado no material. Nenhuma migração foi necessária (`workspace` continua em 0003). As listas de gerações ignoram essas runs; `stats:materials` só conta itens de runs com `material_id`, então itens manuais, do leitor e importados não aparecem por material. [src: src/core/authoring/service.ts; src/core/db/run-kinds.ts] [user: ADR-1 aprovado no gate 2.6]

**Tabela `attempt` e o agendamento (verificado em 2026-11-17, commit 4e7cc4e).** `attempt` guarda uma resposta de questão por linha: `item_id`, `answer`, `correct` (calculado na gravação), `seconds`, `answered_at` e `day`, com índices por `(item_id, answered_at)` e por `day`. Não há coluna de fase, de confiança nem de momento do feedback. `card_state` e `review_log` existem só para cards: as questões **não** passam pelo FSRS. As migrações do workspace continuam em `0003_study_session` (nada novo desde ced33fa). [src: src/core/db/workspace-schema.ts; src/core/db/migrations/workspace]

**Migração `0004_study_practices` (2026-11-19).** `attempt` ganha `confidence` (1 a 3), `release_at` e `seen_at` (o feedback é visível quando `release_at` passou e "pendente" quando `seen_at` é nulo; respostas antigas foram marcadas como vistas) e índice `ix_attempt_pending`. Nova tabela `pretest_attempt` (`item_id`, `round_id`, `answer`, `correct`, `confidence`, `seconds`, `answered_at`, `day`): o pré-teste nunca toca `attempt`, então nenhum consumidor de `attempt` o vê. Chaves novas em `meta`: `practice.feedback` (`immediate`, `block`, `next_day`), `practice.confidence`, `study.interleave`. [src: src/core/db/migrations/workspace/0004_study_practices.sql; src/core/practice/settings.ts]

**Migrações `0005` a `0007` (verificado em 2026-11-19, commit c69c420).** `0005_item_runs_by_material`; `0006_run_out_of_scope` acrescenta a `generation_run` `discarded_out_of_scope`, `rounds` e `with_analysis`; `0007_material_analysis` acrescenta a `chunk` `role`, `starts_unit` e `unit`, e a `material` `subject_user`, `subject_inferred`, `analysis_job_id` e `analyzed_at` (todas anuláveis). [src: src/core/db/migrations/workspace/]

**Imagens de itens (intent images-in-cards, 2026-11-21, commit e972c48).** Migração `0008_item_images` cria a tabela `image` (`hash` sha-256 como chave, `ext`, `mime`, `bytes`, `width`, `height`, `animated`, `created_at`); o arquivo fica em `workspaces/<uuid>/files/images/<hash>.<ext>` (escrita atômica; a mesma imagem é um arquivo só). O item guarda as referências em `payload_json.images`, um mapa opcional por campo (`front`, `back`, `statement`, `explanation`, `option.A` a `option.E`) de `{hash, source?, alt?}`; `source` é o original quando a imagem foi cortada ou girada. Nada conta referências: `ImageService.sweep` lê todos os payloads e apaga os arquivos sem uso (carência de 1 h; "Limpar agora" usa 0), `reindex` devolve a linha de um arquivo que não a tem (backup antigo). O tipo vem da assinatura (`probeImage`: PNG, JPEG, GIF, WebP; SVG recusado), com teto de 100 MB e 100 megapixels e aviso a partir de 20 MB. A prática só envia ao renderer as imagens do enunciado e das alternativas antes de responder; as do comentário vão com o feedback. [src: src/core/images/; src/core/practice/service.ts]
