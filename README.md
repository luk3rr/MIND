# MIND

Local-first study tool: you import your own materials (PDF, Word, Markdown, web pages) and MIND generates flashcards and questions that cite the source passage, then helps you study them with spaced repetition (FSRS).

> **Status: rewrite in progress.** MIND is being rewritten as a desktop application (TypeScript + Electron, installable as a `.deb`). The original Python implementation lives in [`legacy/`](legacy/) and is the executable specification of the rewrite; it is removed once feature parity is reached.

## Development

Requirements: Node.js 22+ and [pnpm](https://pnpm.io) 10 (`corepack enable` provides it).

```bash
pnpm install
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test --coverage
```

Reference values for the port are extracted from the Python implementation into `fixtures/` with `uv run --project legacy python scripts/extract-fixtures/extract_fixtures.py`.

## License

AGPL-3.0-or-later.
