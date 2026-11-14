# Reference fixtures

The JSON files and the PDFs/DOCX in this folder are **frozen reference values** produced by the
original Python implementation of MIND (FSRS schedules, text chunking, quote verification, prompt
texts, text extraction, statistics and the error-card texts). The TypeScript tests compare the new
implementation with them (`tests/fixtures/fixtures.test.ts` checks that they are intact), so they
are the executable specification the rewrite had to match.

The Python code and the script that generated the files were removed from the tree when the
rewrite reached feature parity. They are still in the repository history:

```bash
git show legacy-python:scripts/extract-fixtures/extract_fixtures.py   # the generator
git show legacy-python:legacy/pyproject.toml                          # the Python project
git worktree add ../mind-legacy legacy-python                          # a full checkout
```

To regenerate a file, check out the `legacy-python` tag and run the generator there with `uv`
(`uv run --project legacy python scripts/extract-fixtures/extract_fixtures.py`). Do not edit the
fixtures by hand: a change here means the behavior of MIND changed on purpose and the test
expectations must be updated with it.
