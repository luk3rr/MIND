# Qualidade e riscos

Status: draft · Confiança: alta

**Baseline (2026-11-14, commit 101d3e6).** `pnpm lint` exit 0 · `pnpm format:check` exit 0 · `pnpm typecheck` exit 0 · `pnpm test --coverage`: **66 arquivos, 614 testes, todos passam**; cobertura: instruções 94,37% · ramos 86,2% · funções 93,73% · linhas 95,52% (limite 80%). `pnpm e2e` não foi rodado. Sem falhas pré-existentes.

**Riscos e pontos frágeis** (todos [inferred], não confirmados):

- CSP sem `blob:` e uma só janela com abertura de novas janelas negada: qualquer leitor de PDF ou janela extra exige decisão explícita. [src: security.ts; index.ts:56]
- PDFs grandes: o único caminho atual para o arquivo é o extrator em worker, sem renderização sob demanda para a UI. [src: src/core/ingestion/pdf.ts]
- Dados de tempo de estudo não existem: `review_log.duration_ms` e `attempt.seconds` são medidas por item, não sessões. [src: workspace-schema.ts]
- Backup só inclui o que está no banco do workspace e em `files/`; tabelas novas entram sozinhas no snapshot, mas a importação precisa de migração compatível. [src: archive.ts]

## Open questions

- Regras de convenção marcadas [inferred] em `conventions.md`: não foram confirmadas pelo autor.
