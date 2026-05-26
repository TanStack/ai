# AGENTS.md

Cross-agent guidance for this repository. See `CLAUDE.md` for the full project
overview, architecture, and conventions — this file mirrors the rules that
apply to every coding agent regardless of tool.

## Pre-PR Quality Gate (MANDATORY)

**Before opening a PR or pushing changes intended for review, you MUST run the
same checks CI runs and confirm they pass locally.** Pushing without running
these is not acceptable — CI will fail and waste review cycles.

The single canonical command is:

```bash
pnpm test:pr
```

This runs the exact target set the `PR` workflow runs in CI
(`nx affected --targets=test:sherif,test:knip,test:docs,test:eslint,test:lib,test:types,test:build,build --exclude=examples/**,testing/**`).

If you can't run `test:pr` (e.g. it's too slow on your machine), at minimum run
each of these and confirm they're green before pushing:

- `pnpm test:sherif` — workspace consistency
- `pnpm test:knip` — unused dependencies
- `pnpm test:docs` — doc link verification
- `pnpm test:eslint` — lint
- `pnpm test:types` — typecheck
- `pnpm test:lib` — unit tests
- `pnpm test:build` — build artifact verification
- `pnpm build` — build all affected packages
- `pnpm --filter @tanstack/ai-e2e test:e2e` — E2E suite (mandatory for any
  behavior change; see `testing/e2e/README.md`)

Do **not** rely on CI as your first signal. Run locally, fix, then push.

## Everything Else

For package manager (`pnpm@10.17.0`), monorepo layout, adapter architecture,
tool system, framework integrations, E2E requirements, and all other
conventions, read `CLAUDE.md` in this directory.
