# MIND

A desktop study tool that lives on your computer. Import your own materials (PDF, Word, Markdown,
text and web pages) and MIND generates flashcards and exam-style questions that **quote the source
passage**, then helps you study them with spaced repetition (FSRS).

- **Your material, your machine.** Everything is stored locally. Only short excerpts go to the AI
  provider you configure, and only after you accept the notice that says which provider receives
  them. Nothing runs as a server: the app opens no network port.
- **Every item cites its source.** A card or question is kept only if its quote is found in the
  passage it came from; questions also pass a second check by another model.
- **Study offline.** Reviewing, practicing, statistics and the library work without a network. Only
  generation, verification and chat need one.
- **Interface in Brazilian Portuguese** (the materials may be in any language).

## Install

Download `mind-study_<version>_amd64.deb` and install it on Debian, Ubuntu or a derivative:

```bash
sudo apt install ./mind-study_0.1.0_amd64.deb
```

MIND then appears in the application menu. Removing the package (`sudo apt remove mind-study`)
never deletes your data. To build the package yourself, see [Development](#development).

## First steps

1. Open MIND and create a workspace (one per subject or exam).
2. In **Settings** (or the first-run assistant) paste your [OpenRouter](https://openrouter.ai) API
   key and read the notice about what is sent. The key can also come from the
   `OPENROUTER_API_KEY` environment variable.
3. In **Library** import a file or a web page. `samples/fotossintese.md` is a short text to try.
4. In **Generate** choose the material, the kind (cards or questions) and how many; the estimated
   cost is shown before you start. Review the drafts and approve the ones you want.
5. **Study** the day's queue (Space reveals, 1 to 4 rate, Ctrl+Z undoes) and **Practice** questions.
6. Follow your progress in **Statistics**, revisit mistakes in **Errors**, train weak topics from
   **Today**, and ask the **Chat** about your own material.

Optional semantic search (Chat panel) downloads a small multilingual model (about 130 MB, once) and
runs it on your computer.

## Where the data lives

Per user, under the application data folder (`~/.config/mind` on Linux): `app.db` (settings, costs,
consent), one folder per workspace with its `workspace.db` and the original files, and caches for the
OCR language data and the search model. The API key is stored encrypted with a mode `0600` file.
Export a workspace to a `.zip` (and import it elsewhere) from the workspace menu.

## Development

Requirements: Node.js 22+ and [pnpm](https://pnpm.io) 10 (`corepack enable` provides it).

```bash
pnpm install
pnpm dev                 # run the app with hot reload
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test --coverage
pnpm e2e                 # end-to-end tests with Playwright driving Electron (needs a display or xvfb)
pnpm package             # builds the .deb in dist/ (needs lintian and desktop-file-utils to verify it)
scripts/verify-deb.sh    # checks metadata, contents, size limits and lintian
```

The code is a single package:

| Folder         | What it holds                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core`     | The application logic with no Electron dependency: SQLite and Drizzle, ingestion, generation, verification, study, statistics, chat, backup |
| `src/main`     | The Electron main process: window, native dialogs, typed IPC router and handlers, worker threads                                            |
| `src/preload`  | The minimal, validated bridge exposed to the window                                                                                         |
| `src/renderer` | The React interface (Vite): pages, components, design tokens                                                                                |
| `tests/e2e`    | Playwright tests of the whole app, also run against the installed `.deb`                                                                    |
| `fixtures`     | Frozen reference values from the original Python version (see its README)                                                                   |

The window talks to the core through a single IPC channel with schemas shared by both sides (zod);
there is no HTTP server. Security settings: context isolation, sandbox, strict CSP, blocked
navigation and no Node access in the renderer.

MIND was first written in Python; that implementation is kept in the git history under the tag
`legacy-python`.

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
