# Quality and risks — MIND
Status: draft · Confidence: medium

**Baseline de testes.** `uv run pytest --cov --cov-fail-under=80`, 2026-11-14, commit 7a16826: 642 passaram, 6 desmarcados (`perf`/`real_llm`), 1 aviso, cobertura 97,38%, nenhuma falha pré-existente. [user: autorizou a execução]

**Pontos sensíveis para a mudança de UI.**

| Risco | Evidência |
|---|---|
| CSP `script-src 'self'` e `style-src 'self'` podem barrar scripts injetados pela casca e qualquer estilo inline | src/mind/web/security.py:19-22 |
| Checagem de origem espera `Host` loopback em porta fixa; com porta aleatória e token, o `TrustedHost` e o `Origin` precisam ser revistos | src/mind/web/security.py:28-38 |
| API sem autenticação: hoje só o loopback a protege; qualquer processo local acessa a porta | src/mind/api/ |
| Estado da UI no HTMX e em `study.js`/`practice.js` depende de recargas parciais | src/mind/web/static/ |
| Fórmulas (KaTeX) e gráficos gerados no servidor precisam renderizar no WebKitGTK | static/vendor/katex, src/mind/web/charts.py |
| Dependências de sistema opcionais (Tesseract) não vêm no `.deb` por padrão | README.md:34-40 |
| Código a remover (S-6): `Dockerfile`, texto de `uvx` e `--host`/`--port` do CLI | Dockerfile, README.md, __main__.py:24-28 |

**Segurança.** Chave só em `.env` do diretório de dados; redação de log. Sem autenticação por desenho.

## Open questions

- Q-1: Onde ficam hoje `app.db` e o `.env` no Linux (`~/.local/share/mind`)? Confirmar no `.deb`, que não deve apagar dados do usuário ao atualizar.

- Nenhum dado real em uso nem scripts externos na API ainda `[user]`: há liberdade para mudar caminhos, portas e o diretório de dados sem migração de usuários.
