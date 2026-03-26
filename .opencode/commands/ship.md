---
description: Commit changes, push to master, and create a release
agent: build
---

Analyze all staged and unstaged changes, commit directly to master, push, and create a GitHub release.

## Steps

1. Run `git status` and `git diff HEAD` to understand what has changed.
2. Run `git log --oneline -10` to understand the commit style used in this repo.
3. Stage all changed tracked files with `git add -u`. Do NOT use `git add -A` or `git add .` — untracked files should not be committed unless the user explicitly mentions them.
4. Write a commit message that:
   - Has a short imperative subject line (≤72 chars) summarising *why* the change exists, not just what files changed
   - Includes a blank line followed by a bullet-point body that explains the key changes if the diff is non-trivial
   - Ends with `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
5. Commit using a HEREDOC so formatting is preserved exactly.
6. If not already on `master`, switch to master and merge: `git checkout master && git merge --ff-only -`.
7. Push directly to master: `git push origin master`.
8. Determine the next version by reading the current version from `package.json` and incrementing the patch number (e.g. `0.1.0` → `0.1.1`). If the changes include new features, increment the minor number instead (e.g. `0.1.0` → `0.2.0`).
9. Run the release script: `node scripts/release.mjs v<new-version>`. This bumps all package.json files and docker-compose.yml, commits, tags, and pushes — which triggers the CI release workflow to build desktop apps, push the Docker image to ghcr.io, and create the GitHub Release.
10. Report the new version and confirm the release tag was pushed.

## Important rules

- Never force-push or use `--no-verify`.
- Never commit files that look like secrets (`.env`, credentials, private keys). Warn the user if any are staged.
- If there is nothing to commit (clean working tree), skip straight to step 8 and cut a release from the current HEAD.
- If `scripts/release.mjs` fails, report the error and do not push a broken tag.
