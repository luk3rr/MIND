---
description: Bump the version, commit it and create the annotated release tag
argument-hint: "[major|minor|patch] (optional override)"
---

Create a new MIND release. It always runs every test before anything is bumped, committed or tagged.

1. Run `git status --short`. If there are uncommitted changes, stop and tell me; do not commit them on your own.
2. Run the whole test suite first, and stop at the first failure (show the output and do not bump, commit or tag anything): `make check` (lint, formatting, types and unit tests with coverage) and then `make e2e` (end-to-end tests; the real-model test stays skipped). A release is never created without both passing on the exact commit that will be tagged.
3. Find the last tag (`git tag --sort=-v:refname | head -1`) and list the commits since it (`git log <tag>..HEAD --oneline`). If there is no tag yet, this is the first release: keep the version already in `package.json` (no bump commit). If there are no new commits, stop.
4. Decide the bump from the most significant commit: `feat:` -> minor, `fix:`/`chore:`-only -> patch. If `$ARGUMENTS` is given, use it instead. If the choice is ambiguous (e.g. a `feat`/`fix` that is only internal tooling), ask me instead of bumping mechanically.
5. Set `"version": "X.Y.Z"` in `package.json` and commit it alone with the message `chore: bump version to X.Y.Z`.
6. Create the annotated tag `vX.Y.Z` with a short, human-readable title summarizing the release (not the raw commit message), e.g. `git tag -a v0.2.1 -m "Fix the study queue after midnight"`.
7. The `Co-Authored-By:` trailer is allowed on the commit; never add a session link (`Claude-Session:` or similar) to the commit or the tag.
8. Do not push on your own. Report the new version, the commit and the tag message, and offer to push `main` and the tag. Pushing the tag starts the `Release` workflow, which builds `mind_amd64.deb` and attaches it to the GitHub Release (creating it when missing); that is what makes the `curl` command in the README install the new version.
