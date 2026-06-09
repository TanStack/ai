# AGENTS.md

Cross-agent guidance for this repository. See `CLAUDE.md` for the full project
overview, architecture, and conventions — this file mirrors the rules that
apply to every coding agent regardless of tool.

## Dependency Install

Run `pnpm install` before starting any task and again after every merge with
`main`.

## Adding a New Library

When you add a new library under `packages/`, add a `workspace:*` override for
it in `pnpm-workspace.yaml` under `overrides:` (e.g.
`'@tanstack/ai-foo': workspace:*`) and run `pnpm install`. Every `packages/`
library must have an entry — this forces any transitive or example dependency
that references a published version onto the local workspace copy. Use
`workspace:*` for internal deps in `package.json` as usual.

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
- **Maintain `addedAt` / `updatedAt` on docs entries in `docs/config.json`.**
  Every page entry carries an `addedAt` (ISO `YYYY-MM-DD`) and, once edited, an
  `updatedAt`. When you touch a docs page, update its entry: add a new entry
  with `addedAt` set to today's date for a **new page**, or set/refresh
  `updatedAt` to today's date when you make a **content change** to an existing
  page (new section, capability, reworked guidance, new examples). **Bug fixes
  don't bump anything** — typos, broken links, code-fence languages,
  formatting, and factual fixes must not touch `addedAt` or `updatedAt`.
- Run `pnpm test:docs` (link verification) before pushing.

## Everything Else

For package manager (`pnpm@10.17.0`), monorepo layout, adapter architecture,
tool system, framework integrations, E2E requirements, and all other
conventions, read `CLAUDE.md` in this directory.
