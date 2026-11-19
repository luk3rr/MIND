# Qualidade e riscos

Status: human-reviewed (2026-11-16) · Confiança: alta

**Baseline atual (2026-11-17, commit 4e7cc4e, v0.7.0).** `pnpm lint` exit 0 (cabeçalhos ok em 320 arquivos) · `pnpm format:check` exit 0 · `pnpm typecheck` exit 0 · `pnpm test --coverage`: **112 arquivos, 1192 testes, todos passam**; cobertura: instruções 95,15% · ramos 87,06% · funções 94,74% · linhas 96,45% (limite 80%). `pnpm e2e` não foi rodado. Sem falhas pré-existentes. [user: autorizou rodar o baseline em 2026-11-17]

**Baseline anterior (2026-11-16, commit 240ed43, v0.6.0).** `pnpm lint` exit 0 (cabeçalhos ok em 278 arquivos) · `pnpm format:check` exit 0 · `pnpm typecheck` exit 0 · `pnpm test`: **96 arquivos, 956 testes, todos passam**; cobertura: instruções 94,87% · ramos 87,15% · funções 93,97% · linhas 96,15% (limite 80%). `pnpm e2e` não foi rodado. Sem falhas pré-existentes. [user: autorizou rodar o baseline]

**Baseline anterior (2026-11-14, commit 101d3e6).** `pnpm lint` exit 0 · `pnpm format:check` exit 0 · `pnpm typecheck` exit 0 · `pnpm test --coverage`: **66 arquivos, 614 testes, todos passam**; cobertura: instruções 94,37% · ramos 86,2% · funções 93,73% · linhas 95,52% (limite 80%). `pnpm e2e` não foi rodado. Sem falhas pré-existentes.

**Riscos e pontos frágeis** (todos [inferred], não confirmados):

- CSP sem `blob:` e uma só janela com abertura de novas janelas negada: qualquer leitor de PDF ou janela extra exige decisão explícita. [src: security.ts; index.ts:56]
- PDFs grandes: o único caminho atual para o arquivo é o extrator em worker, sem renderização sob demanda para a UI. [src: src/core/ingestion/pdf.ts]
- Dados de tempo de estudo não existem: `review_log.duration_ms` e `attempt.seconds` são medidas por item, não sessões. [src: workspace-schema.ts]
- Backup só inclui o que está no banco do workspace e em `files/`; tabelas novas entram sozinhas no snapshot, mas a importação precisa de migração compatível. [src: archive.ts]

**Riscos relevantes para criação e importação manual (2026-11-16).**

- Seleção de texto no leitor: boa na maioria dos PDFs com texto, com limitações conhecidas (colunas, escaneados dependem de OCR, hifenização); o usuário deve poder editar o trecho. [user] [src: src/renderer/src/pages/ReaderPage.tsx:130-190]
- `ReviewService.review` e `generationRun` contam aprovações por run; itens manuais não devem distorcer essas métricas nem as de `stats:materials` (join com `generation_run` por `material_id`). [src: src/core/review/service.ts:342-388; src/core/stats/service.ts:272-276]
- `items:list` não devolve fonte nem origem; a lista precisa distinguir manual, importado e gerado. [src: src/core/contracts/channels.ts:545-565]
- Não há biblioteca de planilhas instalada. [src: package.json]
- Cobertura baixa em `ItemsPage.tsx` (84,7% instruções, 73,8% funções) e `WorkspaceSwitcher.tsx` (78%): a feature vai mexer na primeira. [src: coverage 2026-11-16]

**Atualização após o intent manual-cards-import (2026-11-16).** `pnpm lint`, `format:check`, `typecheck` exit 0; `pnpm test --coverage`: 110 arquivos, 1142 testes, linhas 96,44%. `pnpm e2e` coberto pelos três specs novos (`authoring`, `reader-items`, `import`) e pela suíte antiga. Riscos novos: um zip que mente sobre os tamanhos no diretório central passa pela checagem de cabeçalho (defesa restante: limite de 10 MB e as bibliotecas); itens do leitor e importados não entram em `stats:materials`; a seleção de texto do leitor depende da camada de texto do PDF (escaneados dependem de OCR).

**Verificação parcial em 2026-11-19 (HEAD 0c425b9, intent generation-relevance).** `typecheck` exit 0; `vitest run src/renderer`: 39 arquivos, 410 testes ok; `vitest run` de study, mix e `src/main/ipc`: 18 arquivos, 119 testes ok. A suíte completa e o e2e não foram reexecutados; o baseline completo continua o de 2026-11-17 (1192 testes, 96,45% linhas) e será refeito antes do primeiro commit de código da Construção.

## Open questions

- (nenhuma pendente de convenções; a escolha da run sintética para itens manuais e importados fica para o ADR em 2.6)
