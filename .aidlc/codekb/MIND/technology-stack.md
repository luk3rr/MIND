# Stack tecnológica

Status: draft · Confiança: alta

| Camada | Tecnologia | Fonte |
|---|---|---|
| Runtime | Electron ~45.3, Node ≥ 22, TypeScript 6 strict, pnpm 10 (app v0.7.0) | package.json |
| Build | electron-vite 6, Vite 8, electron-builder 26 (.deb amd64 e instalador Windows) | package.json; electron-builder.yml |
| UI | React 19, lucide-react, KaTeX; CSS próprio com tema claro/escuro | package.json |
| Dados | better-sqlite3 13 + drizzle-orm 0.45 (WAL, FTS5 em `chunk`); agendamento com ts-fsrs 6 | src/core/db; package.json |
| Validação | zod (IPC, saídas do LLM, dados) | src/core/contracts |
| PDF | `mupdf` 1.28 (WASM, AGPL) para extrair texto e renderizar páginas para OCR | package.json:78; src/core/ingestion/pdf.ts |
| OCR / busca | tesseract.js; BM25 + embeddings (transformers.js / onnxruntime-node) | electron-builder.yml |
| Testes | Vitest 5 + Testing Library, Playwright 1.65, cobertura v8 (mín. 80%) | vitest.config.ts |
| Qualidade | ESLint 10 (+security), Prettier, `scripts/check-headers.mjs` | package.json |
| CI | GitHub Actions: verify (lint, format, typecheck, testes, e2e com xvfb) e package | .github/workflows/ci.yml |
| Licença | AGPL-3.0-or-later | package.json |

**Leitura de planilhas.** CSV e XLSX (adicionados em 2026-11-16, ADR-2, todas MIT): `papaparse` 5.7 (CSV), `read-excel-file` 9.3 (lê só os valores do XLSX; fórmulas nunca são calculadas) e `write-excel-file` 4.1 (gera o template XLSX; depende só de `fflate`). Importadas no processo principal; o `.deb` as leva dentro do `app.asar`. [src: package.json; src/core/importing] [mem: M-6]
