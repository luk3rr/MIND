# Convenções

Status: human-reviewed (2026-11-16) · Confiança: alta

- Código, comentários, logs, commits em inglês; textos da UI em pt-BR (`src/renderer/src/strings.ts`); cabeçalho `Filename/Created on/Author` em todo arquivo, checado por `scripts/check-headers.mjs`. [mem: M-8; src: package.json lint]
- Commits convencionais, atômicos, sem push até pedido. [mem: M-5, M-7]
- Mudar um canal: esquema zod em `channels.ts` + nome em `channel-names.ts` + handler em `handlers.ts` + chamada via `useInvoke`; mudança incompatível sobe `CONTRACT_VERSION`. [inferred: src/preload/index.ts importa só channel-names]
- O núcleo não importa Electron; diálogos e janelas via `UiBridge`/ganchos no `main`. [inferred: handlers.ts]
- Esquema: alteração no Drizzle + `pnpm db:generate` gera migração em `migrations/{app,workspace}`. [src: package.json:db:generate]
- Testes ao lado do código (`*.test.ts[x]`), e2e em `tests/e2e`, LLM sempre mockado, relógio injetável (`clock.ts`). [mem: M-5; src: src/core/clock.ts]
- `fixtures/` congeladas; dados do usuário fora da instalação; novas dependências compatíveis com AGPL. [mem: M-10, M-11, M-6]
- Dependência nativa ou worker em pacote precisa de `asarUnpack` no `electron-builder.yml`. [inferred: electron-builder.yml]

**Confirmado pelo autor em 2026-11-16** [user]: as quatro regras marcadas [inferred] acima (novo canal IPC em quatro passos, núcleo sem Electron, mudança de esquema por Drizzle + `pnpm db:generate`, `asarUnpack` para nativos e workers) estão corretas.

**Hook de pre-commit (2026-11-17, commit 4e7cc4e).** `.githooks/pre-commit` (ativado por `make install-hooks`, que define `core.hooksPath`) roda `scripts/pre-commit.ts` sobre os arquivos em stage: Prettier `--check`, ESLint nos arquivos de código e `scripts/check-headers.mjs` quando há código em `src`, `scripts`, `tests`. Typecheck e testes ficam fora (rodam em `make check` e no CI). Pula-se com `git commit --no-verify`. Os testes estão em `tests/pre-commit.test.ts`. [src: .githooks/pre-commit; scripts/pre-commit.ts; Makefile] [user: pedido do autor em 2026-11-17, depois de o pipeline falhar por formatação]
