# CI (3.7) — 2026-11-14

`.github/workflows/ci.yml` (criado na UNIT-1) roda em `push` na `main` e em pull requests: `uv sync --frozen`, `ruff check`, `ruff format --check`, `mypy` e `pytest --cov --cov-fail-under=80`, o mesmo comando aprovado. Ainda não foi executado no GitHub (nada foi enviado). Sugestão para depois do primeiro push: conferir que o job passa sem o Tesseract (os testes de OCR real são pulados sem ele) e, se quiser, adicionar um job com `apt install tesseract-ocr tesseract-ocr-por`.
