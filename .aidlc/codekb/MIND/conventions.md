# Convenções

Status: draft · Confiança: média (regras [inferred] não confirmadas pelo autor)

- Código, comentários, logs, commits em inglês; textos da UI em pt-BR (`src/renderer/src/strings.ts`); cabeçalho `Filename/Created on/Author` em todo arquivo, checado por `scripts/check-headers.mjs`. [mem: M-8; src: package.json lint]
- Commits convencionais, atômicos, sem push até pedido. [mem: M-5, M-7]
- Mudar um canal: esquema zod em `channels.ts` + nome em `channel-names.ts` + handler em `handlers.ts` + chamada via `useInvoke`; mudança incompatível sobe `CONTRACT_VERSION`. [inferred: src/preload/index.ts importa só channel-names]
- O núcleo não importa Electron; diálogos e janelas via `UiBridge`/ganchos no `main`. [inferred: handlers.ts]
- Esquema: alteração no Drizzle + `pnpm db:generate` gera migração em `migrations/{app,workspace}`. [src: package.json:db:generate]
- Testes ao lado do código (`*.test.ts[x]`), e2e em `tests/e2e`, LLM sempre mockado, relógio injetável (`clock.ts`). [mem: M-5; src: src/core/clock.ts]
- `fixtures/` congeladas; dados do usuário fora da instalação; novas dependências compatíveis com AGPL. [mem: M-10, M-11, M-6]
- Dependência nativa ou worker em pacote precisa de `asarUnpack` no `electron-builder.yml`. [inferred: electron-builder.yml]
