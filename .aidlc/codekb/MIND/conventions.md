# Conventions — MIND
Status: human-reviewed (2026-11-14) · Confidence: high

- Código, comentários, logs, commits em inglês; textos da UI em pt-BR; cabeçalho `Filename/Created on/Author` em todo arquivo novo. [src: .aidlc/memory/project.md M-8]
- ruff (linha 100, regras E,F,W,I,B,UP,SIM,C4,PT,RUF,S,ASYNC), mypy strict, Pydantic nas bordas. [src: pyproject.toml:52-70]
- Testes pytest espelhando os pacotes; LLM sempre mockado; cobertura mínima 80%; marcadores `perf` e `real_llm` fora do padrão. [src: pyproject.toml:80-90]
- Commits convencionais direto na `main`; nenhum `git push` sem pedido explícito. [src: M-5, M-7]
- Licenças de dependências compatíveis com AGPL. [src: M-6]
- Textos de UI em `web/strings.py`; HTML em templates Jinja com `autoescape`; CSP proíbe script e estilo inline (`script-src 'self'`). [src: src/mind/web/security.py:19-22]
- Acessibilidade e contraste são testados (`test_a11y_basics`, `test_theme_contrast`). [src: tests/web]
