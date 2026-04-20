---
name: verify
description: Run the standard verification suite for this project — lint, tests, and build — to confirm no regressions before committing. Use after completing backend changes, or when asked to check the project is clean.
allowed-tools: Bash(npm run *)
---

Run the full verification suite for the area that was changed.

## Backend verification

```bash
npm run lint -w backend
npx jest --passWithNoTests 2>&1 | tail -15
npm run build:backend 2>&1 | tail -10
```

All three must pass. If any fail, fix the issues before committing.

## Frontend verification

```bash
npm run build:app 2>&1 | tail -10
```

## Full stack (both changed)

Run all of the above in sequence.

## What counts as passing

- **Lint**: exits with code 0 (no errors or warnings)
- **Tests**: all suites pass (`X passed, X total`)
- **Build**: "Application bundle generation complete" or "nest build" exits 0

If any check fails, report the error output and fix it rather than skipping.
