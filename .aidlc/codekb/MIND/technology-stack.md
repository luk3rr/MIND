# Stack tecnológica

Status: draft · Confiança: alta

| Camada | Tecnologia | Fonte |
|---|---|---|
| Runtime | Electron ~45, Node ≥ 22, TypeScript 6 strict, pnpm 10 | package.json |
| Build | electron-vite 6, Vite 8, electron-builder 26 (.deb amd64) | package.json; electron-builder.yml |
| UI | React 19, lucide-react, KaTeX; CSS próprio com tema claro/escuro | package.json |
| Dados | better-sqlite3 + drizzle-orm (WAL, FTS5 em `chunk`) | src/core/db |
| Validação | zod (IPC, saídas do LLM, dados) | src/core/contracts |
| PDF | `mupdf` 1.28 (WASM, AGPL) para extrair texto e renderizar páginas para OCR | package.json:78; src/core/ingestion/pdf.ts |
| OCR / busca | tesseract.js; BM25 + embeddings (transformers.js / onnxruntime-node) | electron-builder.yml |
| Testes | Vitest 5 + Testing Library, Playwright 1.65, cobertura v8 (mín. 80%) | vitest.config.ts |
| Qualidade | ESLint 10 (+security), Prettier, `scripts/check-headers.mjs` | package.json |
| CI | GitHub Actions: verify (lint, format, typecheck, testes, e2e com xvfb) e package | .github/workflows/ci.yml |
| Licença | AGPL-3.0-or-later | package.json |
