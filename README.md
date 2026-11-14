# MIND

Ferramenta de estudo local-first: gera flashcards e questões com fonte citada a partir dos seus próprios materiais e ajuda a estudá-los com repetição espaçada.

> Em construção. A documentação de instalação e uso será escrita na UNIT-11.

## Desenvolvimento

```bash
uv sync
uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest --cov --cov-fail-under=80
```

## Licença

AGPL-3.0-or-later.
