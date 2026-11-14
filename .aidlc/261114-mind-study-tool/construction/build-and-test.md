# Build & Test (3.6) — 2026-11-14

## Comando aprovado

`uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest --cov --cov-fail-under=80` → **exit 0**: 642 testes passaram, cobertura **97%**, `mypy --strict` sem erros, `ruff` limpo.

## Desempenho (`pytest -m perf`)

5 testes passaram (importação e indexação de PDF grande, busca, geração com latência simulada, estatísticas com 5 000 revisões, retenção) dentro dos limites de NFR.

## OCR real

Com o Tesseract 5.5.0 instalado (`por`, `eng`), o teste `test_real_tesseract_reads_an_image_only_pdf` roda de verdade e passa.

## Instalação limpa

Ver `clean-install.md`: wheel instalado em venv novo serve a interface, a API e os estáticos.

## O que os testes não cobrem

| Lacuna | Motivo | Como fechar |
|---|---|---|
| Qualidade de cards e questões com o modelo real (SM-1) | exige chave e uso seu | `uv run mind sm1` e `--kind question` depois de aprovar ~30 itens |
| Juiz de questões e chat com o modelo real | idem | usar a tela Gerar e Chat com a sua chave |
| Embeddings com o modelo real | extra pesado (torch) | `uv sync --extra embeddings` e ativar no Chat |
| Aparência no navegador (KaTeX, ligaduras, atalhos do estudo) | só visual | conferir à mão |
| macOS/Windows e Docker | indisponíveis aqui | ver `clean-install.md` |
| Varredura de vulnerabilidades das dependências | nenhuma ferramenta instalada | `uvx pip-audit` antes de publicar |
