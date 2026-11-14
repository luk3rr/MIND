# Memória do projeto (regras aprovadas)

- M-1: Todo flashcard ou questão gerado cita um trecho fonte verificável; item sem fonte é descartado. [gate 1.7]
- M-2: O MIND nunca lê, copia ou referencia dados pessoais do autor nem de outros projetos dele. [gate 1.7]
- M-3: Arquivos de `.aidlc/` e o repositório são públicos: não citar o nome do autor nem sua finalidade pessoal de uso; manter exemplos e textos genéricos. [gate 1.7, pedido do autor]
- M-4: TypeScript `strict` com pnpm; Electron + React + Vite; ESLint e Prettier; dados, IPC e saídas do LLM validados com zod. (Substitui a regra de Python, que não vale mais.) [gate 2.2, retrospectiva da Construction]
- M-5: Testes com Vitest (unidade) e Playwright dirigindo o Electron (ponta a ponta); o LLM é sempre mockado nos testes. Commits convencionais direto na `main`; CI no GitHub Actions. [gate 2.2, retrospectiva da Construction]
- M-6: O MIND é licenciado em AGPL-3.0 e usa PyMuPDF para PDF; novas dependências devem ter licença compatível com AGPL. [gate 2.9]
- M-7: Commits atômicos e contidos sempre que possível; nenhum `git push` até o fim da Construction, salvo pedido explícito. [pedido do autor, início da Construction]
- M-8: Regras globais do usuário valem em todo código do MIND: código, comentários, docstrings, logs, nomes de arquivo e mensagens de commit em inglês; textos exibidos ao usuário em pt-BR; cabeçalho `Filename/Created on/Author` em todo arquivo de código novo; Conventional Commits. [pedido do autor, ~/.claude/CLAUDE.md]
- M-9: O app nunca abre porta de rede; o renderer só fala com o núcleo por IPC tipado e validado (um único canal, esquemas zod compartilhados). [retrospectiva da Construction]
- M-10: Os dados do usuário ficam fora da instalação; instalar, atualizar ou remover o pacote nunca os apaga. [retrospectiva da Construction]
- M-11: O Python original existe só na tag `legacy-python`; os arquivos de `fixtures/` são referência congelada e não se editam à mão (ver `fixtures/README.md`). [retrospectiva da Construction]
