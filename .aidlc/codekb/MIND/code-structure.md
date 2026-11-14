# Code structure — MIND
Status: human-reviewed (2026-11-14) · Confidence: high

```text
src/mind/
  __main__.py        entrada: `mind` sobe o uvicorn; subcomando `sm1`
  config.py          Settings (MIND_HOST, MIND_PORT, MIND_DATA_DIR ...)
  services.py        composição de serviços compartilhados
  web/               páginas: app.py, *_pages.py (um por seção), security.py, rendering.py, strings.py
    templates/       ~35 templates Jinja (base.html + telas + fragmentos _*.html)
    static/          app.css (557 linhas), theme.js, study.js, practice.js, math.js, vendor/ (htmx, katex, swagger, fontes)
  api/               app.py, schemas.py, problems.py, v1/ (58 rotas)
  db/                modelos SQLAlchemy (app e workspace), migrate.py, migrations/ (alembic)
  workspaces/        registry.py (um SQLite por workspace), archive.py (backup zip)
  ingestion/ generation/ verification/ study/ practice/ stats/ chat/ retrieval/
  error_notebook/ review/ llm/ jobs/ secrets.py redaction.py
tests/               espelha os pacotes; tests/web (páginas), tests/e2e, tests/perf, tests/eval
```

**Pontos de entrada.** `mind = mind.__main__:main` [src: pyproject.toml:30-31]; `create_app` [src: src/mind/web/app.py:63].

**Onde adicionar.**

| O quê | Onde |
|---|---|
| Nova tela | `web/<x>_pages.py` + `templates/<x>.html`, registrar o router em `app.py`, rótulo em `strings.SECTIONS` |
| Nova rota da API | `api/v1/<x>.py` + schemas em `api/schemas.py` |
| Novo texto da UI | `web/strings.py` (dicionário `T`) |
| Nova tabela | modelo em `db/*_models.py` + migração em `db/migrations/` |

**Evitar editar.** `static/vendor/` (terceiros), `__pycache__`, `uv.lock` à mão.
