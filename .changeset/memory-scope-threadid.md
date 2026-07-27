---
'@tanstack/ai-memory': minor
'@tanstack/ai-event-client': minor
'@tanstack/ai-client': minor
'@tanstack/ai-devtools-core': minor
---

**Align `MemoryScope` to the shared `Scope` type (`threadId`).**

`MemoryScope` is now an alias of `Scope` from `@tanstack/ai` so memory and
persistence share one isolation vocabulary. The conversation key is
`threadId` (required); optional dims are `userId`, `tenantId`, and reserved
`namespace`. There is no public `sessionId` on memory scope — hard cut while
`@tanstack/ai-memory` is still `0.x` / unreleased.

- `@tanstack/ai-memory` — `export type MemoryScope = Scope`. Built-in adapters
  (`inMemory`, `redis`) and middleware use `threadId`; `sameScope` also matches
  `tenantId` when present on the query. Redis index keys are now
  `{prefix}:index:{tenantId|_}:{userId|_}:{threadId}` (escaped). Hindsight banks
  use `{user}__{threadId}`. Anyone who wrote Redis rows under the pre-rename
  layout needs to reindex or wipe — keys are not dual-read.
- `@tanstack/ai-event-client` — `MemoryScopeLite` is
  `{ threadId?, userId?, tenantId? }` (devtools telemetry; not an isolation
  authority).
- `@tanstack/ai-client` / `@tanstack/ai-devtools-core` — memory event payloads
  and the Memory panel registry follow the same `threadId` field names.
