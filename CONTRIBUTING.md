# Contributing to TanStack AI

Thanks for contributing! This guide covers everything you need to get from a fresh clone to a merged PR.

## Prerequisites

- **pnpm**: 10.17.0 or newer. Use the version pinned in `packageManager` (`pnpm@11.1.1`).
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
packages/typescript/    # Public, published packages (@tanstack/ai, @tanstack/ai-openai, etc.)
testing/                # Internal test harnesses — NOT published
  e2e/                  # Playwright + aimock E2E suite (mandatory coverage for all changes)
  panel/                # Stream processor visualisation panel
examples/               # Example apps (React, Solid, Vue, Svelte, PHP, Python, vanilla)
codemods/               # Internal codemods (not published)
docs/                   # Documentation source
scripts/                # Repo-level scripts (doc generation, model sync, link verification)
```

- Direct children of `packages/typescript/` are public packages (published to npm).
- Everything under `examples/`, `testing/`, and `codemods/` is `"private": true` and excluded from build/publish.
- The build system is **Nx** with affected-target detection.
- The package manager is **pnpm** with workspace + catalog protocols.

For deeper architecture details (adapter system, isomorphic tools, framework integrations), see `CLAUDE.md` at the repo root.

## Day-to-day commands

All commands are run from the repo root. Nx handles affected detection and caching.

| Goal                          | Command             |
| ----------------------------- | ------------------- |
| Run unit tests (affected)     | `pnpm test:lib`     |
| Watch unit tests              | `pnpm test:lib:dev` |
| Type-check (affected)         | `pnpm test:types`   |
| Lint (affected)               | `pnpm test:eslint`  |
| Verify build artifacts        | `pnpm test:build`   |
| Format the repo               | `pnpm format`       |
| Build (affected)              | `pnpm build`        |
| Build everything              | `pnpm build:all`    |
| Run the full CI suite locally | `pnpm test`         |
| Run the affected-PR check     | `pnpm test:pr`      |
| E2E suite                     | `pnpm test:e2e`     |
| E2E with Playwright UI        | `pnpm test:e2e:ui`  |

Working on a single package? `cd packages/typescript/<pkg>` and use its scripts directly (`pnpm test:lib`, `pnpm test:types`, etc.).

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

- Place tests under `packages/typescript/<pkg>/tests/` with the suffix `.test.ts` (or `.test.tsx` for JSX).
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

## Changesets

Any change that ships in a published package requires a changeset. Examples, internal test harnesses, codemods, and docs do not.

```bash
pnpm changeset
```

Pick the affected packages and the bump type:

- **patch**: bug fix, internal refactor, perf, docs in package, no API change.
- **minor**: new public API, new opt-in behaviour, backwards-compatible enhancement.
- **major**: breaking change to a published API surface. Coordinate with maintainers first.

The defensive `ignore` list in `.changeset/config.json` blocks accidental publication from examples/testing/codemods even if `"private": true` is ever dropped.

## Branches and commits

- Branch off `main`. Name the branch after the change (`fix/openai-streaming-eof`, `feat/anthropic-cache-control`).
- Conventional Commits aren't strictly enforced, but follow the prefixes you see in `git log`: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `ci:`.
- Keep commits logical. The repo prefers a few coherent commits over one giant squash.

## Pull request flow

1. Push your branch and open a PR against `main`.
2. CI runs: `pnpm test:pr` (sherif workspace check, knip dead-code, docs link verification, ESLint, unit tests, typecheck, build artifacts, build) + the full E2E suite.
3. Address review comments.
4. A maintainer merges. Releases are cut via Changesets — your changeset entry lands in the next release.

The PR template lists the steps. The `Test plan` section is required — describe how a reviewer can verify your change.

## Adding a new provider adapter

The pattern lives in `packages/typescript/ai-openai/`, `packages/typescript/ai-anthropic/`, `packages/typescript/ai-gemini/`, etc. New core adapters typically:

1. Create `packages/typescript/ai-<provider>/` with `package.json`, `tsconfig.json`, `src/`, `tests/`, `README.md`. Copy structure from an existing adapter.
2. Implement tree-shakeable adapter exports under `src/adapters/` (`text.ts`, `embed.ts`, `summarize.ts`, etc.).
3. Add `model-meta.ts` so per-model type safety works.
4. Wire the provider into `testing/e2e/feature-support.ts` and `testing/e2e/test-matrix.ts`. Existing provider-coverage tests pick it up automatically.
5. Record fixtures (`OPENAI_API_KEY=... pnpm --filter @tanstack/ai-e2e record`) — or write deterministic ones by hand. **No real API keys at test time.**
6. Add a `pnpm changeset` entry.

If you're building a community/third-party adapter that lives outside this repo, follow `docs/community-adapters/guide.md` instead.

## Known gaps

- **Vue/Svelte SFCs are not currently linted.** Our linter doesn't yet support `.vue`/`.svelte` parsers in the toolchain we use; the script blocks inside those files rely on TypeScript and tests for safety. If you're touching a `.svelte` or `.vue` file, lean on `tsc` / `svelte-check` / `vue-tsc` and explicit tests.
- **Build configs (`vite.config.ts`, `vitest.config.ts`) are not in the `tsc` typecheck pass.** They're typechecked at build time by vite/vitest themselves. If you make changes there, run `pnpm build` or `pnpm test:lib` to surface issues.

## Reporting issues / getting help

- Bugs: open a GitHub issue with a minimal repro (the bug report template in `.github/issue_template/bug_report.yml` walks you through it).
- Questions / discussions: [TanStack Discord](https://tlinz.com/discord).
- Security: follow the disclosure process in `SECURITY.md` (if applicable) or email the maintainers directly.

## Code of Conduct

By participating you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).
