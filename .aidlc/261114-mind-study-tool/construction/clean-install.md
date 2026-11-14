# Instalação limpa (T-11.7) — 2026-11-14

## Linux (feito)

1. `uv build` gerou `mind_study-0.1.0-py3-none-any.whl` e o `.tar.gz`.
2. Em um diretório temporário novo: `python3 -m venv venv && venv/bin/pip install <wheel>` instalou o pacote e as dependências do PyPI, sem o código-fonte do repositório.
3. `MIND_DATA_DIR=<tmp>/data venv/bin/mind --port 8765` subiu o servidor; respostas: `/` → 303 (assistente inicial), `/api/docs` → 200, `/static/app.css` → 200, `/static/vendor/katex/katex.min.js` → 200. Ou seja, templates, estáticos empacotados e migrações vieram dentro do wheel.

## Segunda plataforma (pendente)

Não há macOS nem Windows disponível nesta máquina. Passos para você repetir:

```bash
git clone https://github.com/luk3rr/MIND.git && cd MIND
uv sync && uv run mind
```

Abra <http://127.0.0.1:8000>, crie um workspace, importe `samples/fotossintese.md` e confirme que a Biblioteca mostra "Indexado". No Windows, confira também a importação de um PDF (PyMuPDF traz o binário no wheel).

## Docker (build não executado)

O `Dockerfile` foi escrito, mas o Docker não está disponível nesta máquina; o build e o `GET /api/docs` na imagem ficam para você rodar (`docker build -t mind . && docker run --rm -p 127.0.0.1:8000:8000 -v mind-data:/data mind`).
