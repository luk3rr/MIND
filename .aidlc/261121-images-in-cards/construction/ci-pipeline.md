# Pipeline de CI — images-in-cards (3.7)

O repositório já tem o pipeline `.github/workflows/ci.yml` (jobs `verify`, `package` e `package-windows`). Esta intent **não alterou o arquivo**: tudo o que ela acrescentou já é coberto pelos passos existentes. Nada foi enviado ao GitHub (sem `git push`, M-7).

| Passo | O que cobre desta intent |
|---|---|
| `pnpm lint` | cabeçalho de arquivo novo (`scripts/check-headers.mjs` lê só `.ts`, `.tsx`, `.js`, `.mjs`, `.py`: as fixtures binárias de imagem ficam de fora) |
| `pnpm format:check` | formatação dos arquivos novos; o Prettier não toca imagens |
| `pnpm typecheck` | os cinco projetos TypeScript |
| `pnpm test --coverage` | 153 arquivos e 1621 testes, mínimo de 80% |
| `xvfb-run -a pnpm e2e` | `tests/e2e/images.spec.ts` (6 fluxos no Electron real) |
| job `package` | `.deb`, `verify-deb.sh`, instalação e os mesmos e2e contra o app instalado (`MIND_E2E_EXECUTABLE`) |

**Pontos de atenção para quem rodar o CI.**
- As fixtures de imagem ficam em `src/core/images/fixtures/` (binários pequenos, poucos KB), geradas por `scripts/make-image-fixtures.ts`; o e2e lê esse caminho a partir da raiz do projeto, também no job `package` (o repositório está presente).
- O e2e do recorte do PDF usa `fixtures/pdfs/three-pages.pdf`, que já era usado pelos specs do leitor.
- Nenhuma dependência de produção nova: o lockfile não mudou.
- A migração `0008_item_images` foi gerada com `pnpm db:generate`; se a intent import-exam-questions for construída depois, ela deve gerar a sua com o próximo número livre.

Gates (todos obrigatórios no `verify`): lint, format, tipos, testes com cobertura, e2e. Cache: `pnpm` via `setup-node`. Gatilhos: `push` em `main` e `pull_request`.
