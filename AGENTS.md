# AGENTS.md

Cross-agent guidance for this repository. See `CLAUDE.md` for the full project
overview, architecture, and conventions — this file mirrors the rules that
apply to every coding agent regardless of tool.

## Dependency Install

Run `pnpm install` before starting any task and again after every merge with
`main`.

## Pre-PR Quality Gate (MANDATORY)

**Before committing, run the narrowest meaningful quality checks for your
changes and confirm they pass locally. Before opening a PR or pushing changes
intended for review, run the same checks CI runs.** If you make post-commit
changes, rebase, or merge before pushing to a PR, rerun the relevant checks
first.

Use the repo-preferred package manager, scripts, and Nx targets where
applicable. Do **not** commit or push while quality checks are failing unless
the user explicitly instructs otherwise; report the exact failing command and
failure instead.

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

## Documentation

When editing docs under `docs/`:

- **No `as` type-assertion casts in code samples.** Examples must type-check
  without `as SomeType` — narrow `unknown` values with `typeof` / `in`
  checks, type guards, or Standard Schema validation instead. (`as const` is
  fine — it's a const assertion, not a type cast.)
- **Show both sides of the coin.** When a doc spans server and client,
  include snippets for both halves (server endpoint AND client consumption).
- **Use the latest model per provider**, sourced from each adapter's
  `model-meta.ts` (newest `gpt-*`, `claude-*`, `gemini-*`, …), in example code.
- Run `pnpm test:docs` (link verification) before pushing.

## Everything Else

For package manager (`pnpm@10.17.0`), monorepo layout, adapter architecture,
tool system, framework integrations, E2E requirements, and all other
conventions, read `CLAUDE.md` in this directory.
