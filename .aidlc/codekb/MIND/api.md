# API — MIND
Status: draft · Confidence: medium

**Páginas HTML** (`mind.web`, sem autenticação, mesma origem): `/`, `/welcome`, `/setup`, `/settings`, `/w/{id}/{today|library|generate|review|study|practice|stats|errors|chat|settings}`, além de ações POST (importar, gerar, aprovar, avaliar, exportar, renomear, excluir). ~50 rotas. [src: src/mind/web/*_pages.py, app.py]

**API JSON** em `/api/v1` (58 rotas): backup, chat, custos, erros, gerações, itens, jobs, materiais, prática, configurações, estatísticas, estudo, tópicos, workspaces. Documentação em `/api/docs`. [src: src/mind/api/v1/]

**Versionamento.** Prefixo `/v1`; erros em problem+json. **Autenticação:** nenhuma, só Host/Origin e CSP. [src: src/mind/web/security.py, src/mind/api/problems.py]

**Consumida de terceiros.** OpenRouter (HTTPS) para geração e chat. [src: src/mind/llm/openrouter.py]
