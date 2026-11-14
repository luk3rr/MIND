# Technology stack — MIND
Status: human-reviewed (2026-11-14) · Confidence: high

| Item | Detalhe | Fonte |
|---|---|---|
| Linguagem | Python 3.12+ | pyproject.toml:10 |
| Web | FastAPI, uvicorn, Jinja2, python-multipart | pyproject.toml:13-17,22 |
| UI | HTMX (vendor), KaTeX (vendor), CSS próprio, fontes Inter e JetBrains Mono locais | src/mind/web/static/vendor |
| Dados | SQLAlchemy 2, Alembic, SQLite | pyproject.toml:16-17 |
| Domínio | fsrs, pymupdf (PDF), python-docx, trafilatura (web), pydantic 2 | pyproject.toml:19-26 |
| HTTP/LLM | httpx para OpenRouter | pyproject.toml:21 |
| Opcional | sentence-transformers (busca semântica), Tesseract (OCR, sistema) | pyproject.toml:33 |
| Build | hatchling, uv; script `mind` | pyproject.toml:40-50 |
| Qualidade | pytest (+cov, asyncio), ruff, mypy strict | pyproject.toml:35-46 |
| Licença | AGPL-3.0-or-later | pyproject.toml:9 |

Dependências desatualizadas ou vulneráveis: não verificado nesta passada.
