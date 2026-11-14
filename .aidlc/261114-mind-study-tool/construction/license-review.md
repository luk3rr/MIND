# Revisão de licenças (T-11.5, A21, A34) — 2026-11-14

Projeto: **AGPL-3.0-or-later** (arquivo `LICENSE` com o texto oficial; `NOTICE` com os avisos).

| Componente | Licença | Compatível com AGPL-3.0? | Observação |
|---|---|---|---|
| PyMuPDF 1.x | AGPL-3.0 ou comercial | sim | motivo da escolha da AGPL (A21); fixado em `<2` |
| fastapi, pydantic, alembic, sqlalchemy, platformdirs, python-docx, fsrs | MIT | sim | |
| httpx, uvicorn, lxml, jinja2, justext | BSD | sim | |
| trafilatura, courlan, htmldate, python-multipart | Apache-2.0 | sim (Apache-2.0 é compatível com GPLv3/AGPLv3) | |
| htmx 2.0.11 | 0BSD | sim | empacotado |
| KaTeX 0.19.1 | MIT | sim | empacotado, com `LICENSE` |
| Inter, JetBrains Mono | OFL-1.1 | sim (fontes embutidas como arquivos, sem alterar) | empacotadas, com `LICENSE` |
| swagger-ui-dist 5.35.0 | Apache-2.0 | sim | empacotado, com `LICENSE` |
| sentence-transformers (extra opcional) | Apache-2.0 | sim | não instalado por padrão; o modelo baixa só quando você ativa |
| Tesseract (programa externo) | Apache-2.0 | sim | não é distribuído com o MIND; só é chamado como subprocesso |

Conclusão: sem conflito de licenças. Conferido com os metadados dos pacotes instalados e com os arquivos de licença empacotados. Se o projeto for usado como serviço de rede por terceiros, a AGPL exige oferecer o código-fonte aos usuários.
