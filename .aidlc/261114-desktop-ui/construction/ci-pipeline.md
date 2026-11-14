# CI pipeline — desktop-ui

Arquivo: `.github/workflows/ci.yml`. Gatilhos: `push` em `main` e `pull_request`. Nada é publicado: não há deploy nem push automático.

| Job | Passos | Falha quando |
|---|---|---|
| `verify` (ubuntu-latest) | checkout, **"No Python is left"** (`git ls-files '*.py'` vazio), pnpm 10 + Node 22 com cache, `pnpm install --frozen-lockfile`, `lint`, `format:check`, `typecheck`, `test --coverage` (limite de 80%), instalar Xvfb, `xvfb-run -a pnpm e2e` | Qualquer comando sai diferente de 0, cobertura abaixo de 80% ou aparece um `.py` |
| `package` (depois de `verify`) | `pnpm package`, `scripts/verify-deb.sh` (metadados, conteúdo, limites de 500 MB e 1 GB, `lintian`, `desktop-file-validate`), `apt install` do `.deb`, E2E contra `/opt/MIND/mind`, reinstalação e remoção conferindo que os dados do usuário continuam, upload do `.deb` como artefato | O pacote passa dos limites, o `lintian` acusa erro, a instalação falha ou os dados somem |

**Cache.** Só o cache do pnpm (`actions/setup-node` com `cache: pnpm`). Os binários do Electron e o modelo de busca semântica não são baixados no CI (o E2E usa o embedder sem modelo).

**Segredos.** Nenhum. O CI não tem chave de API; a avaliação de qualidade (NFR-8) é manual (`pnpm sm1`).

**Limitações.** O workflow nunca rodou no GitHub (não há push, A6); foi validado localmente comando a comando e pela sintaxe. O primeiro push exige reconciliar com o commit inicial da `main` remota.
