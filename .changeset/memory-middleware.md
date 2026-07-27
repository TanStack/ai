---
'@tanstack/ai': minor
'@tanstack/ai-event-client': minor
'@tanstack/ai-memory': minor
---

**Add server-side memory via a `recall`/`save` adapter contract in `@tanstack/ai-memory`.**

Memory is now a single, provider-agnostic contract with two verbs — `recall` and
`save` — which is the shape every memory backend (in-process, Redis, and hosted
vendors) naturally exposes. `memoryMiddleware` recalls relevant memory into the
system prompt (and optionally injects vendor tools) before the model runs, then
defers `save` of the finished turn via `ctx.defer` so streaming is never blocked.
Extraction, ranking, and rendering live inside each adapter — the middleware is thin.

`@tanstack/ai-memory` (new package) — everything ships here:

- Root: `memoryMiddleware`, the `MemoryAdapter` contract
  (`recall` / `save` / optional `inspect` / `listFacts`), and the `MemoryScope` /
  `MemoryTurn` / `RecallResult` / `SaveReceipt` types.
- `@tanstack/ai-memory/in-memory` → `inMemory()` — zero-dependency adapter for dev,
  tests, and single-process demos. Pass an `embedder` for semantic scoring and/or an
  `extract` function to persist derived facts.
- `@tanstack/ai-memory/redis` → `redis({ redis, prefix? })` — production adapter for
  plain Redis. `ioredis` wires in directly; `redis` (node-redis v4+) via the
  `fromNodeRedis(client)` wrapper. Both are optional peer dependencies.
- `@tanstack/ai-memory/hindsight` → `hindsight()`, `@tanstack/ai-memory/mem0` →
  `mem0()`, `@tanstack/ai-memory/honcho` → `honcho()` — hosted-vendor adapters. Their
  SDKs (`@vectorize-io/hindsight-client`, `@honcho-ai/sdk`) are optional peers loaded
  lazily; mem0 talks to its server over plain HTTP (no SDK). Vendors can expose LLM
  tools through `recall` (e.g. hindsight's retain/recall/reflect).
- A shared `recall`/`save` contract-test suite (`@tanstack/ai-memory/tests/contract`)
  that any adapter — including third-party ones — can run.

`@tanstack/ai`:

- **Removes the (unreleased) `@tanstack/ai/memory` subpath.** The middleware,
  contract, and helpers all moved to `@tanstack/ai-memory`.

`@tanstack/ai-event-client`:

- The five `memory:*` devtools events (`memory:retrieve:started` / `:completed`,
  `memory:persist:started` / `:completed`, `memory:error`) now carry recall/save
  payloads (adapter id, fragment/receipt counts, `phase: 'recall' | 'save'`).
