---
description: Commit all changes and open a pull request
agent: build
---

Analyze all staged and unstaged changes, create a descriptive commit, then open a pull request.

## Steps

1. Run `git status` and `git diff HEAD` to understand what has changed.
2. Run `git log --oneline -10` to understand the commit style used in this repo.
3. Stage all changed tracked files with `git add -u`. Do NOT use `git add -A` or `git add .` — untracked files should not be committed unless the user explicitly mentions them.
4. Write a commit message that:
   - Has a short imperative subject line (≤72 chars) summarising *why* the change exists, not just what files changed
   - Includes a blank line followed by a bullet-point body that explains the key changes if the diff is non-trivial
   - Ends with `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
5. Commit using a HEREDOC so formatting is preserved exactly.
6. Push the branch to origin (`git push -u origin HEAD`).
7. Create a pull request with `gh pr create` targeting the `master` branch. The PR body must include:
   - A **Summary** section (2–4 bullet points describing what changed and why)
   - A **Test plan** section (checklist of things to verify)
   - `🤖 Generated with [OpenCode](https://opencode.ai)` footer
8. Return the PR URL to the user.

## Important rules

- Never force-push or use `--no-verify`.
- Never commit files that look like secrets (`.env`, credentials, private keys). Warn the user if any are staged.
- If the branch is already `master`, create a new branch named after the change (e.g. `feat/add-voice-mute`) before committing so the PR has somewhere to go.
- If `gh` is not authenticated or unavailable, commit and push anyway and tell the user to open the PR manually.
