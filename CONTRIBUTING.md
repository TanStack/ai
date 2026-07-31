# Contributing to TanStack AI

Thanks for contributing! This guide covers everything you need to get from a fresh clone to a merged PR.

## Before you start

- Search the [open and closed issues](https://github.com/TanStack/ai/issues?q=is%3Aissue) and [open and closed pull requests](https://github.com/TanStack/ai/pulls?q=is%3Apr) before starting work to avoid duplicating an existing report or contribution.
- Keep each pull request focused on one change or topic. Pull requests that combine unrelated changes will be closed with a request to split them into separately reviewable contributions.
- Every pull request must follow the [TanStack AI pull request template](.github/pull_request_template.md). Write a concise description that clearly explains what changed and why, and complete the template without removing or bypassing its required sections.
- You may use AI tools to help generate code, but you remain responsible for understanding, testing, and verifying every submitted change. Do not submit unreviewed, low-quality, or irrelevant generated code.
- Do not mass-submit unrelated or low-quality AI-generated pull requests. We treat that behavior as spam and may close the pull requests, block the contributor, and report the GitHub account.

## Prerequisites

- **pnpm**: 11.9.0 or newer. Use the version pinned in `packageManager` (`pnpm@11.9.0`).
  - Recommended: install via [Corepack](https://nodejs.org/api/corepack.html). Run `corepack enable` once and pnpm is managed automatically.
- **Git**.

## Initial setup

```bash
git clone https://github.com/TanStack/ai.git
cd ai
pnpm install
pnpm run build:all   # build all public packages once so workspace deps resolve
```

`pnpm install` runs Playwright's chromium download (used by the E2E suite). If you don't need E2E, you can skip it via `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install`.

## Repository layout

```
packages/    # Public, published packages (@tanstack/ai, @tanstack/ai-openai, etc.)
testing/                # Internal test harnesses — NOT published
  e2e/                  # Playwright + aimock E2E suite (mandatory coverage for all changes)
  panel/                # Stream processor visualisation panel
examples/               # Example apps (React, Solid, Vue, Svelte, vanilla)
codemods/               # Internal codemods (not published)
docs/                   # Documentation source
scripts/                # Repo-level scripts (doc generation, model sync, link verification, maintainer sweep)
agent-scripts/          # Repo GitHub agents (PR review bot)
```

- Direct children of `packages/` are public packages (published to npm).
- Everything under `examples/`, `testing/`, and `codemods/` is `"private": true` and excluded from build/publish.
- The build system is **Nx** with affected-target detection.
- The package manager is **pnpm** with workspace + catalog protocols.

For deeper architecture details (adapter system, isomorphic tools, framework integrations), see `CLAUDE.md` at the repo root.

## Syncing model metadata

`pnpm generate:models` is the maintainer command behind the daily **Sync Model Metadata** workflow (branch `automated/sync-models`). It:

1. Fetches OpenRouter, Vercel AI Gateway, and Lovable AI Gateway catalogs.
2. Regenerates `packages/ai-openrouter/src/model-meta.ts` and the Vercel Gateway model list.
3. Inserts **new** native-provider models into `packages/ai-openai`, `ai-anthropic`, `ai-gemini`, and `ai-grok`.
4. Writes a patch changeset for the packages that changed.

Rules the generator follows:

- Keep OpenRouter routing aliases (ids that start with `~`) in the OpenRouter catalog. Users can pass `chat({ model: '~anthropic/claude-haiku-latest' })`. The generated constant name maps `~` to `_`.
- Do **not** copy those aliases into native provider files (`ai-openai`, `ai-anthropic`, `ai-gemini`, `ai-grok`). Those adapters only accept the provider's own ids.
- For a new native-provider model, write id, modalities, and pricing. Infer features from OpenRouter `supported_parameters` when that field exists. Do **not** copy another model's tool list (`computer_use`, `google_search`, `x_search`, and similar).
- Leave curated tools and flags on existing models alone. Edit those by hand after the sync PR opens.

Do not rebase or hand-edit `automated/sync-models`. The next scheduled run force-pushes that branch from `main`. Merge generator fixes to `main` first, then let the workflow rebuild the sync PR.

The workflow pushes with `GITHUB_TOKEN`, so GitHub does not start Test / E2E on that push. After a sync, a maintainer with write access can run the PR checks from the Actions tab, or push an empty commit to `automated/sync-models`.

## Day-to-day commands

All commands are run from the repo root. Nx handles affected detection and caching.

| Goal                          | Command                     |
| ----------------------------- | --------------------------- |
| Run unit tests (affected)     | `pnpm test:lib`             |
| Watch unit tests              | `pnpm test:lib:dev`         |
| Coverage (affected)           | `pnpm test:coverage`        |
| Coverage for every package    | `pnpm test:coverage:all`    |
| Coverage + regression check   | `pnpm test:coverage:check`  |
| Re-baseline coverage          | `pnpm test:coverage:update` |
| Type-check (affected)         | `pnpm test:types`           |
| Lint (affected)               | `pnpm test:eslint`          |
| Verify build artifacts        | `pnpm test:build`           |
| Format the repo               | `pnpm format`               |
| Build (affected)              | `pnpm build`                |
| Build everything              | `pnpm build:all`            |
| Run the full CI suite locally | `pnpm test`                 |
| Run the affected-PR check     | `pnpm test:pr`              |
| E2E suite                     | `pnpm test:e2e`             |
| E2E with Playwright UI        | `pnpm test:e2e:ui`          |

Working on a single package? `cd packages/<pkg>` and use its scripts directly (`pnpm test:lib`, `pnpm test:types`, etc.).

## Coverage

Every package has a `test:coverage` script (`vitest run --coverage`, measured over `src/**` with the v8 provider). Per-package percentages are committed to `coverage-baseline.json` at the repo root.

The `Coverage` job on every PR runs `pnpm test:coverage:check`, which measures the affected packages and fails if any metric (statements, branches, functions, lines) drops more than 0.5 percentage points below the baseline. Packages that weren't affected are skipped, not treated as 0%.

When a drop is intentional — deleting well-tested code, for instance — re-baseline and commit the result:

```bash
pnpm test:coverage:update
```

Two known limitations:

- Uncovered `.tsx` files can't be remapped by the coverage provider and are dropped from the report with a `Failed to parse ... Excluding it from coverage` warning. `.tsx` files that tests _do_ load are measured normally, so the UI packages read higher than their real coverage.
- `preact-ai-devtools`, `react-ai-devtools`, and `solid-ai-devtools` have no tests and sit at 0%.

## TypeScript configuration

There is a single `tsconfig.base.json` at the repo root with the shared `compilerOptions`. Every package extends it and overrides only what's unique to that package (e.g. `outDir`, JSX runtime, framework lib).

The standardised per-package shape is:

```jsonc
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    // + package-specific overrides only
  },
  "include": ["src", "tests"],
  "exclude": ["node_modules", "dist"],
}
```

Tests are included in typecheck. `vite.config.ts` / `vitest.config.ts` are not — they're tooling configs typechecked by the build tools themselves.

## Adding a unit test

- Place tests under `packages/<pkg>/tests/` with the suffix `.test.ts` (or `.test.tsx` for JSX).
- Vitest's defaults discover anything matching `**/*.{test,spec}.?(c|m)[jt]s?(x)` — no per-package config is needed.
- Tests are typechecked by `tsc` and linted by ESLint.

## Adding E2E test coverage (required)

**Every feature, bug fix, or behaviour change MUST have E2E coverage.** See `testing/e2e/README.md` for the full guide. Quick reference:

| Change type                            | What to add                                                              |
| -------------------------------------- | ------------------------------------------------------------------------ |
| New provider adapter                   | Add provider to `feature-support.ts` + `test-matrix.ts`. Tests auto-run. |
| New feature (e.g. new generation type) | Add to types, feature config, support matrix, fixture, spec file.        |
| Chat / streaming bug fix               | Test case in `chat.spec.ts` or `tools-test/`.                            |
| Tool system change                     | Scenario in `tools-test-scenarios.ts` + spec.                            |
| Middleware change                      | Test in `middleware.spec.ts`.                                            |
| Client-side change (useChat etc.)      | Test covering the observable behavior change.                            |

Run the suite locally with `pnpm test:e2e`. Record real LLM fixtures with `OPENAI_API_KEY=sk-... pnpm --filter @tanstack/ai-e2e record`.

## Documentation (required when relevant)

If the change is user-facing, update `docs/` in the same PR. Do not ship the code now and the docs later.

User-facing means a caller can see or do something new or different:

- New or changed public API (exports, types, flags, env vars)
- New or changed behaviour
- New adapter capability
- Changed defaults, errors, or documented contracts

Skip docs only when nothing user-facing changed (CI, internal tests, same-behaviour refactors, agent files). Write that reason in the PR body.

## Changesets (required on the PR)

Any PR that changes a published package MUST include a changeset file on that PR. Run this before you open the PR:

```bash
pnpm changeset
```

Pick the affected packages and the bump type:

- **patch**: bug fix, internal refactor, perf, docs in package, no API change.
- **minor**: new public API, new opt-in behaviour, backwards-compatible enhancement.
- **major**: breaking change to a published API surface. Coordinate with maintainers first.

Do not add the changeset after review as a follow-up. It belongs in the first push of the PR.

Skip a changeset only when the PR does not change published packages (docs, CI, examples, testing, contributing). Tick the docs/CI/dev-only box on the PR template.

The defensive `ignore` list in `.changeset/config.json` blocks accidental publication from examples/testing/codemods even if `"private": true` is ever dropped.

## Branches and commits

- Branch off `main`. Name the branch after the change (`fix/openai-streaming-eof`, `feat/anthropic-cache-control`).
- Conventional Commits aren't strictly enforced, but follow the prefixes you see in `git log`: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `ci:`.
- Keep commits logical. The repo prefers a few coherent commits over one giant squash.

## Pull request flow

1. Push your branch and open a PR against `main`.
2. Fill the PR template. Tick **docs** and **changeset** honestly, or say why you skipped them.
3. CI runs: `pnpm test:pr` (sherif workspace check, knip dead-code, docs link verification, ESLint, unit tests, typecheck, build artifacts, build) + the full E2E suite.
4. Address review comments.
5. A maintainer merges. Releases are cut via Changesets. Your changeset entry lands in the next release.

### Automated Grok review

A Grok agent comments on open, non-draft PRs. The first lines of that comment say it is automated. It is not a maintainer review.

The bot sets exactly one of these labels:

- `ai-rejected` — the change is not useful, or it does not fix the claimed bug.
- `ai-needs-work` — the review listed fixes, but they are not on the branch yet (often a fork with maintainer edits off).
- `ai-ready` — the bot thinks a maintainer can merge after they Approve.

The bot never GitHub-approves and never merges. The `ready-to-merge` label still means a human approval plus green CI.

If the bot pushes, it only commits bugs and suggestions the review listed. Maintainers start a new run with a `/ai-review` comment, or from Actions (`workflow_dispatch`).

## Adding a new provider adapter

The pattern lives in `packages/ai-openai/`, `packages/ai-anthropic/`, `packages/ai-gemini/`, etc. New core adapters typically:

1. Create `packages/ai-<provider>/` with `package.json`, `tsconfig.json`, `src/`, `tests/`, `README.md`. Copy structure from an existing adapter.
2. Implement tree-shakeable adapter exports under `src/adapters/` (`text.ts`, `embed.ts`, `summarize.ts`, etc.).
3. Add `model-meta.ts` so per-model type safety works.
4. Wire the provider into `testing/e2e/feature-support.ts` and `testing/e2e/test-matrix.ts`. Existing provider-coverage tests pick it up automatically.
5. Record fixtures (`OPENAI_API_KEY=... pnpm --filter @tanstack/ai-e2e record`) — or write deterministic ones by hand. **No real API keys at test time.**
6. Update `docs/` for the adapter, and add a `pnpm changeset` entry on the same PR.

If you're building a community/third-party adapter that lives outside this repo, follow `docs/community-adapters/guide.md` instead.

## Known gaps

- **Vue/Svelte SFCs are not currently linted.** Our linter doesn't yet support `.vue`/`.svelte` parsers in the toolchain we use; the script blocks inside those files rely on TypeScript and tests for safety. If you're touching a `.svelte` or `.vue` file, lean on `tsc` / `svelte-check` / `vue-tsc` and explicit tests.
- **Build configs (`vite.config.ts`, `vitest.config.ts`) are not in the `tsc` typecheck pass.** They're typechecked at build time by vite/vitest themselves. If you make changes there, run `pnpm build` or `pnpm test:lib` to surface issues.

## Reporting issues / getting help

- Bugs: first search the [open and closed issues](https://github.com/TanStack/ai/issues?q=is%3Aissue), then use the [bug report template](https://github.com/TanStack/ai/issues/new?template=bug_report.yml) with a minimal reproduction if the bug has not already been reported.
- Questions / discussions: [TanStack Discord](https://tlinz.com/discord).
- Security: follow the disclosure process in `SECURITY.md` (if applicable) or email the maintainers directly.

## Code of Conduct

By participating you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).
