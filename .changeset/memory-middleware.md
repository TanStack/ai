---
'@tanstack/ai': minor
'@tanstack/ai-event-client': minor
'@tanstack/ai-memory': minor
---

**Add server-side memory support via `memoryMiddleware`.**

A new `memoryMiddleware` from `@tanstack/ai/memory` retrieves relevant memories at chat init and persists user/assistant turns + tool results at finish. The middleware injects a rendered system prompt before the model call and runs persistence via `ctx.defer` so streaming is never blocked.

`@tanstack/ai`:

- New subpath `@tanstack/ai/memory` exporting `memoryMiddleware`, the `MemoryAdapter` / `MemoryRecord` / `MemoryScope` types, the `MemoryOp` union, helpers (`scopeMatches`, `cosine`, `lexicalOverlap`, `recencyScore`, `defaultRenderMemory`, `defaultScoreHit`, `isExpired`).
- Middleware extension hooks: `shouldRetrieve`, `rerank`, `shouldRemember`, `extractMemories`, `onToolResult`, `afterPersist`, plus app-level `events.*` callbacks and a `strict` mode.

`@tanstack/ai-event-client`:

- Five new events on `AIDevtoolsEventMap`: `memory:retrieve:started`, `memory:retrieve:completed`, `memory:persist:started`, `memory:persist:completed`, `memory:error`.

`@tanstack/ai-memory` (new package):

- `inMemoryMemoryAdapter()` — zero-dep adapter for dev/tests.
- `redisMemoryAdapter({ redis, prefix? })` — production adapter for plain Redis. `ioredis` and `redis` (node-redis v4+) are both supported as optional peer dependencies.
- `nodeRedisAsRedisLike(client)` — helper for users wiring `redis` (node-redis v4+) without `legacyMode`; translates the camelCase API into the lowercase `RedisLike` shape the adapter expects. `ioredis` clients wire in directly without a wrapper.
- Both adapters pass a shared contract suite covering scope isolation, expiry, cursor pagination, kinds filtering, lexical-only ranking, semantic ranking with embeddings, and serialization round-trip (Redis).
