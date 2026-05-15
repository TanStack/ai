---
name: build-before-running-examples
description: Use when starting any tanstack/ai example dev server — build workspace packages first
tags: [monorepo, examples, dev-workflow, build]
scope: repo
source:
  type: auto-captured
  created: 2026-05-14T13:05:00Z
related_skill: null
related: []
---

# Build Workspace Packages Before Running Examples

**Rule:** Run `pnpm -w run build:all` from the repo root before starting any example dev server (`examples/ts-react-chat`, `ts-solid-chat`, `ts-vue-chat`, `ts-svelte-chat`, `vanilla-chat`, `php-slim`, `python-fastapi`, `ts-group-chat`).

**Why:** "this was a mistake by you, you should always build packages inside of this repo before you run the examples" — examples import workspace packages (`@tanstack/ai`, `@tanstack/react-ai-devtools`, `@tanstack/ai-devtools-core`, etc.) via `workspace:*` and resolve through each package's `exports` field pointing at `dist/`. If `dist/` is missing for any package — including transitive ones — vite's dep-scan fails and SSR returns a 500. Fixing the first missing package one at a time wastes round-trips: I tried `pnpm --filter @tanstack/react-ai-devtools build`, hit a missing `@tanstack/ai-devtools-core`, etc. The cure is one command up front.

**How to apply:** Before any `pnpm --filter "<example-name>" dev` (or running an example via its own directory), run `pnpm -w run build:all` from the worktree root. Nx caches the build so re-runs are cheap. Skip only if the user has just explicitly said the workspace is freshly built.
