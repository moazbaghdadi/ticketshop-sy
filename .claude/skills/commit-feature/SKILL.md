---
name: commit-feature
description: Commit the current completed feature or step to git as a separate commit. Use proactively after finishing a logical unit of work (e.g., a backend step, a frontend page, a refactor), without waiting to be asked. Do not batch unrelated changes into one commit.
allowed-tools: Bash(git status) Bash(git diff *) Bash(git log *) Bash(git add *) Bash(git commit *)
---

Commit the completed work as a focused, atomic git commit.

## Steps

1. Run `git status` and `git diff --staged` to understand what has changed.
2. Identify the logical scope of the change — is this one feature/step, or multiple unrelated changes? If multiple, stage and commit them separately.
3. Stage only the files relevant to the completed feature. Prefer named files over `git add .` to avoid accidentally including unrelated files (e.g. `.env`, build artifacts).
4. Craft a commit message following the repo's conventional-commits style:
   - Format: `<type>(<scope>): <short description>`
   - Types: `feat`, `fix`, `chore`, `refactor`, `style`, `test`, `docs`
   - Keep the subject line under 72 characters
   - Use the imperative mood ("add", "fix", "remove", not "added", "fixes")
   - Body (optional): explain *why* if the reason isn't obvious from the diff
   - Examples from this repo: `feat(bookings): add POST /bookings endpoint with gender validation`, `chore: upgrade TypeScript to v5.9.0`
5. Create the commit. End the message with:
   ```
   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
   ```
6. Run `git status` after the commit to confirm it succeeded.

## Rules

- **Never** commit `.env` files, build artifacts (`dist/`, `apps/*/dist/`), or unrelated work-in-progress files.
- **Never** amend a previous commit — always create a new one.
- **Never** force-push or use `--no-verify`.
- If the working tree has changes that belong to a *future* step, leave them unstaged.
- If nothing is staged and there is nothing relevant to commit, skip and say so.
