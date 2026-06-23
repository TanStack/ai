---
name: kiira-ci-setup
description: Use when running, configuring, or debugging kiira (docs code type-checker) in tanstack/ai — config, CI wiring, package resolution, and reading its errors
tags: [kiira, ci, documentation, nx, tooling]
scope: repo
source:
  type: experience
  created: 2026-06-23T00:00:00Z
related_skill: null
related: [authoring-kiira-doc-snippets]
---

# Kiira: How It Resolves, How It's Wired, and How to Read It

**Rule:** kiira type-checks `docs/**` code fences against package **source**. Know
its resolution model and always read errors with `--verbose` before acting.

**Why:** Setting up `test:kiira` burned time on two wrong turns — a misread error
("zod mismatch") and a CI-only failure (`@tanstack/ai-angular`). Both are
explained by how kiira resolves and reports.

**How it's wired (the working setup):**
- `kiira` devDep + `kiira.config.ts` (no `tsconfig.docs.json`). Config:
  `include: ['docs/**/*.md']`, `exclude` for `docs/reference/**` (TypeDoc-
  generated — regenerating overwrites fixes) and the two Angular docs (see
  below), per-glob `overrides` enabling JSX (`react-jsx`; solid/preact variants)
  and `noImplicitReturns: false` for illustrative callbacks.
- `test:kiira` script (`kiira check`) is in `nx.includedScripts`, the
  `test:pr`/`test:ci` target lists, and an nx cache target (inputs:
  `docs/**`, `packages/*/src/**`, `kiira.config.ts`). `knip.json` ignores
  `kiira.config.ts` (consumed by the binary, not imported). No CI workflow edit
  needed — `pr.yml` already runs `test:pr`.

**Resolution gotchas:**
- kiira maps `@tanstack/*` to **source** via a `dist→src` heuristic
  (`replace(/dist\/(esm|cjs|es|lib)\//,'/src/')` on the package's resolved entry).
  So most packages need **no build** — even subpath types resolve from src.
- **`@tanstack/ai-angular` is the exception:** it's an ng-packagr bundle whose
  only entry is `dist/types/*.d.ts`, which the heuristic maps to a non-existent
  `src/types/*.ts`, so it falls back to `dist` — absent during a source check.
  This fails in CI (and any docs-only PR, which builds nothing). Both Angular
  docs are `exclude`d for this reason. Revisit only if ai-angular exposes a
  source-resolvable entry.
- A run only passes against an **unbuilt** tree if it doesn't depend on any
  dist-only package. Verify fixes against a clean tree (`pnpm clean` then
  `pnpm kiira check`) to mirror CI, not against your locally-built dist.

**Reading errors — ALWAYS use `--verbose`:** without it, kiira truncates to a
misleading first line. The "zod 4.2.1 vs 4.3.6 dual-package mismatch" that looked
systemic was actually `--verbose` showing the real cause: `toolDefinition`
*requires* a `description`. The `z.core.$strip` vs `$strip` text was just TS
printing the same type two ways. Don't chase a resolution theory before seeing
the full message.

**How to apply:**
1. `pnpm kiira check <files> --reporter pretty --raw --static --verbose` for any
   investigation; `pnpm test:kiira` (or `nx run root:test:kiira`) for the gate.
2. If a package's imports won't resolve, check whether its published entry maps
   to a real `src/` file under the dist→src heuristic before assuming a build is
   needed.
3. Keep `exclude` honest — only auto-generated docs and genuinely
   source-unresolvable packages. Everything else should type-check from source.
