# Checklist de paridade por tela (SC-4)

Cada linha liga uma tela ou rota do app em Python (`legacy/src/mind/web/*_pages.py`, congelado na tag
`legacy-python`) ao componente novo e aos testes que o cobrem. Os testes de serviço do Python foram
portados para Vitest; onde havia valores de referência, o teste compara com `fixtures/*.json`
(extraídos do Python).

Legenda: **V** = teste Vitest, **E** = teste de ponta a ponta (Playwright/Electron), **F** = fixture do Python.

## Telas

| Tela (Python) | Tela (Electron) | Testes |
|---|---|---|
| Boas-vindas (`welcome`) | `WelcomePage` | V `App.test.tsx`, `backup.test.tsx`; E `shell`, `backup` |
| Assistente inicial: chave e consentimento (`setup`) | `SetupPage`, `ProviderForm` | V `provider.test.tsx`; E `provider` |
| Hoje (`today`): resumo da biblioteca, estudo, meta, pontos fracos | `TodayPage`, `WeakTopics` | V `study.test.tsx`, `training.test.tsx`, `App.test.tsx`; E `sample-flow` |
| Biblioteca (`library`): importar arquivo e URL, busca, excluir | `LibraryPage` | V `library.test.tsx`; E `library` |
| Prévia do material (`library_preview`) | `MaterialPreviewPage` | V `library.test.tsx`; E `library` |
| Gerar (`generate`): material, páginas, tipo, quantidade, custo, execuções | `GeneratePage` | V `generate.test.tsx`, `study.test.tsx`, `training.test.tsx`; E `generation`, `sample-flow` |
| Gerar para treinar um tópico (`?topic=`) | `GeneratePage` (modo treino), rota `?topic=&subtype=` | V `training.test.tsx`, `training.test.ts`; E `errors-stats` |
| Revisar itens gerados (`review`): editar, aprovar, descartar | `ReviewPage` | V `generate.test.tsx`, `study.test.tsx`, `review.test.ts`; E `generation` |
| Estudar (`study`): fila, filtro, revelar, avaliar 1 a 4, desfazer, meta | `StudyPage` | V `study.test.tsx`, `scheduler.test.ts` (F `fsrs`); E `study`, `sample-flow`, `nfr` |
| Praticar (`practice`): questão, correção, comentário, fonte, tempo | `PracticePage` | V `study.test.tsx`, `practice.test.ts`; E `study`, `errors-stats` |
| Caderno de erros (`errors`): lista, filtro, virar card | `ErrorsPage`, botão em `PracticePage` | V `stats.test.tsx`, `notebook.test.ts` (F `stats`); E `errors-stats` |
| Estatísticas (`stats`): resumo, retenção, atividade, tópicos, meta | `StatsPage` | V `stats.test.tsx`, `stats.test.ts` (F `stats`); E `errors-stats`, `nfr` |
| Chat com a base (`chat`): perguntar, citações, histórico, limpar | `ChatPage` | V `chat.test.tsx`, `chat.test.ts` (F `prompts`); E `chat` |
| Busca semântica opcional (painel do chat) | `SemanticPanel` | V `chat.test.tsx`, `embeddings.test.ts`; E `chat` (e o modelo real, à mão) |
| Configurações (`settings`): provedor, modelos, limite, consentimento | `SettingsPage`, `ProviderForm` | V `provider.test.tsx`, `costs.test.ts`; E `provider` |
| Exportar e importar workspace | menu do workspace, `BackupDialog` | V `backup.test.tsx`, `archive.test.ts`, `backup-handlers.test.ts`; E `backup` |
| Janela, tema, atalhos, trocador de workspace, Ctrl+K | `Shell`, `QuickSwitcher`, `WorkspaceSwitcher` | V `App.test.tsx`, `hooks.test.tsx`, `theme.test.ts`, `contrast.test.ts`, `security.test.ts`, `window-bounds.test.ts`; E `ui`, `shell` |

## Regras de domínio (serviços)

| Regra | Teste | Valores de referência |
|---|---|---|
| Divisão em trechos, mínimos e sobreposição | V `chunker.test.ts` | F `chunker` |
| Extração de PDF, DOCX, Markdown, texto e páginas web; OCR | V `extractors.test.ts`, `docx-web-ocr.test.ts`; E `library` | F `extractors`, `docx-and-scanned` |
| Citação verificada contra o trecho | V `source-checker.test.ts` | F `source-checker` |
| Prompts de cards, questões, juiz e chat | V `prompts.test.ts`, `generation.test.ts`, `questions.test.ts`, `chat.test.ts` | F `prompts` |
| Geração: lotes, descartes, custo, limite mensal, consentimento | V `generation.test.ts`, `questions.test.ts`, `costs.test.ts`, `guarded.test.ts` | |
| FSRS: agendamento, prévias, dia de estudo | V `scheduler.test.ts`, `study.test.ts` | F `fsrs` |
| Estatísticas, sequência, retenção, texto dos cards de erro | V `stats.test.ts`, `notebook.test.ts` | F `stats` |
| Treino de pontos fracos | V `training.test.ts` | |
| Backup: formato, validação, zip slip | V `archive.test.ts` | |

## Removido por decisão (não é lacuna)

| Item | Motivo |
|---|---|
| API JSON `/api/v1` e OpenAPI | Decisão do autor (FR-24 removido, T-6): a casca desktop não abre porta de rede |
| Modo navegador, `pywebview` e `uvx` | O app é desktop (`.deb`); SC-2 exige nenhuma porta aberta |
| Docker e CI do Python | Sem Python no repositório (SC-5) |
| Backups do app em Python | O formato novo usa a revisão de esquema do app TypeScript (A52); sem dados em uso |

## Mudou (comportamento equivalente, mecanismo novo)

| Item | Antes | Agora |
|---|---|---|
| Dados | pasta `~/.local/share/mind` | pasta de dados do usuário do Electron (`userData`), fora da instalação (NFR-17) |
| Chave de API | variável de ambiente ou arquivo | variável de ambiente ou arquivo `0600` cifrado com AES-256-GCM |
| Embeddings | extra `mind[embeddings]` (sentence-transformers) | transformers.js, modelo quantizado baixado só ao ativar |
| Atualização do banco | Alembic | migrações SQL próprias (`_migrations`) |
