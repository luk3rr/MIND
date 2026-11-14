# Memória do projeto (regras aprovadas)

- M-1: Todo flashcard ou questão gerado cita um trecho fonte verificável; item sem fonte é descartado. [gate 1.7]
- M-2: O MIND nunca lê, copia ou referencia dados pessoais do autor nem de outros projetos dele. [gate 1.7]
- M-3: Arquivos de `.aidlc/` e o repositório são públicos: não citar o nome do autor nem sua finalidade pessoal de uso; manter exemplos e textos genéricos. [gate 1.7, pedido do autor]
- M-4: Python 3.12+ com uv; código totalmente tipado (`mypy --strict`), dados e saídas do LLM em Pydantic; lint e formato com ruff. [gate 2.2]
- M-5: Testes com pytest; o LLM é sempre mockado nos testes. Commits convencionais direto na `main`; CI no GitHub Actions. [gate 2.2]
- M-6: O MIND é licenciado em AGPL-3.0 e usa PyMuPDF para PDF; novas dependências devem ter licença compatível com AGPL. [gate 2.9]
- M-7: Commits atômicos e contidos sempre que possível; nenhum `git push` até o fim da Construction, salvo pedido explícito. [pedido do autor, início da Construction]
