# Build and test — desktop-ui

Data: 2026-11-14 · Commits de referência: 18 (testes) e 19 (remoção do Python) · Resultado: **PASS**, com três itens que dependem de ação do autor (ver "Não verificado").

## Comandos e resultados

| Comando | Resultado |
|---|---|
| `pnpm lint` (ESLint + cabeçalhos de arquivo) | exit 0 |
| `pnpm format:check` | exit 0 |
| `pnpm typecheck` (core, main, preload, renderer, ferramentas) | exit 0 |
| `pnpm test --coverage` | **592 testes** em 62 arquivos, exit 0 |
| Cobertura | linhas **95,5%**, ramos **85,9%**, funções 93,9%, instruções 94,3% (limite configurado: 80%) |
| `pnpm e2e` (Playwright dirigindo o Electron) | **34 passaram**, 1 ignorado (modelo real, atrás de `MIND_E2E_REAL_EMBEDDINGS=1`) |
| `pnpm package` + `scripts/verify-deb.sh` | `.deb` **180 MB** (limite 500 MB), **521 MB instalado** (limite 1 GB), `desktop-file-validate` e `lintian` sem erros |
| E2E contra o app empacotado (`MIND_E2E_EXECUTABLE`) | 22 passaram, 13 ignorados (os que exigem o provedor roteirizado, só do app em desenvolvimento) |
| `git ls-files '*.py'` | vazio (SC-5) |

## Medições (NFR-3, NFR-4, NFR-5)

Teste `tests/e2e/nfr.spec.ts`, com 40 cards e 10 questões aprovados e a rede do Electron desligada:

| Medida | Resultado | Limite |
|---|---|---|
| Próximo card + avaliação (ida e volta IPC), p95 de 30 amostras | 4,7 ms | 300 ms |
| Navegação entre as 7 telas de dados (28 trocas), p95 | 39 a 88 ms | 300 ms |
| Memória da árvore de processos após a jornada | 881 a 895 MB | 4 GB livres (teste usa 1,5 GB) |
| `fetch` externo com a rede desligada | bloqueado; estudo, estatísticas e biblioteca seguem funcionando | |

## Matriz requisito → teste

| Requisitos | Onde são verificados |
|---|---|
| FR-1, FR-25 a FR-29, FR-32 | `App.test.tsx`, `shell.spec`, `ui.spec`, `hooks.test.tsx`, `theme.test.ts`, `window-bounds.test.ts` |
| FR-2 a FR-5 | `extractors.test.ts`, `docx-web-ocr.test.ts`, `chunker.test.ts` (fixtures), `library.spec`, `library.test.tsx` |
| FR-6 a FR-11 | `generation.test.ts`, `questions.test.ts`, `source-checker.test.ts`, `prompts.test.ts` (fixtures), `generation.spec`, `sample-flow.spec` |
| FR-12, FR-13 | `scheduler.test.ts` (fixtures FSRS), `study.test.ts`, `study.test.tsx`, `study.spec` |
| FR-14, FR-15 | `practice.test.ts`, `notebook.test.ts` (fixtures), `errors-stats.spec` |
| FR-16, FR-17 | `stats.test.ts` (fixtures), `topics.test.ts`, `training.test.ts`, `errors-stats.spec` |
| FR-18 | `chat.test.ts`, `embeddings.test.ts`, `chat.spec` (e o modelo real, rodado à mão) |
| FR-19 a FR-21 | `secrets.test.ts`, `guarded.test.ts`, `costs.test.ts`, `openrouter.test.ts`, `provider.spec` |
| FR-22 | `archive.test.ts`, `backup-handlers.test.ts`, `backup.spec` |
| FR-23 | `math.test.tsx` |
| FR-30 | `scripts/verify-deb.sh`, job `package` do CI |
| FR-31 | `security.test.ts`, `channels.test.ts`, `router.test.ts`, `shell.spec` |
| NFR-1, NFR-14, NFR-18 | `library.spec` (PDF de 100 páginas), `shell.spec` (3 s), `worker-pool.test.ts` |
| NFR-3, NFR-4, NFR-5 | `nfr.spec` |
| NFR-6, NFR-7 | `guarded.test.ts`, `redaction.test.ts`, `secrets.test.ts`, `provider.spec` |
| NFR-10 | `pnpm lint`, `typecheck` e cobertura |
| NFR-11, NFR-15 | `shell.spec` |
| NFR-12, NFR-17 | `db.test.ts`, `registry.test.ts`, job `package` (atualização e remoção preservam os dados) |
| NFR-13 | `strings.test.ts`, `language.test.ts` |
| NFR-16 | `scripts/verify-deb.sh` |
| SC-2 | `shell.spec` (porta de rede) |
| SC-4 | `construction/parity-checklist.md` |
| SC-5 | `git ls-files '*.py'` e o passo "No Python" do CI |

## Não verificado (precisa de ação do autor ou de chave real)

| Item | Por quê | Como fechar |
|---|---|---|
| NFR-2 e NFR-8 (tempo e qualidade da geração com o modelo real) | Exigem a chave do OpenRouter e custo; o CI usa o provedor roteirizado | `OPENROUTER_API_KEY=... pnpm sm1` sobre o material de amostra |
| SC-1 e NFR-9 (instalação limpa) | O CI instala o `.deb` num Ubuntu limpo, mas a instalação real na máquina do autor não foi feita aqui (exige `sudo`) | `sudo apt install ./dist/mind-study_0.1.0_amd64.deb` e abrir pelo menu |
| SC-3 (aprovação visual do app final) | Os mockups foram aprovados; a avaliação do app pronto é do autor | Abrir o app e aprovar ou pedir ajustes |

## Riscos residuais

- O `.deb` foi verificado só em amd64; `arm64` não está no escopo.
- O `onnxruntime-node` (busca semântica) é nativo: validado no app empacotado em Linux x64 com o modelo real baixado; outras distribuições não foram testadas.
- Os valores de referência do Python estão congelados em `fixtures/`; o gerador só existe na tag `legacy-python`.
- Um intervalo de revisão FSRS (boa depois de reaprendizado) difere em 1 dia entre ts-fsrs e a biblioteca do Python (R-1), aceito no teste.
