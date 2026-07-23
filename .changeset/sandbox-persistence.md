---
'@tanstack/ai': minor
'@tanstack/ai-sandbox': minor
'@tanstack/ai-persistence': minor
'@tanstack/ai-persistence-drizzle': minor
'@tanstack/ai-persistence-prisma': minor
'@tanstack/ai-persistence-cloudflare': minor
---

Add durable **sandbox persistence**: cross-process / multi-instance resume for `@tanstack/ai-sandbox`, provided by the same `withPersistence` used for chat.

`withSandbox` consumes `SandboxStore` (which sandbox to resume) and `LockStore` (mutual exclusion around ensure) as optional capabilities, defaulting to in-memory (single-process). This makes them durable without a sandbox-specific middleware:

- `withPersistence` now provides the `SandboxStoreCapability` (and the shared `LocksCapability`) whenever its store set includes them. Compose `[withPersistence(persistence), withSandbox(sandbox)]`.
- `AIPersistenceStores` gains an optional `sandbox?: SandboxStore`. The backends carry it out of the box: `sqlitePersistence` / `drizzlePersistence(db)` (new `sandboxes` table in the shipped schema + migration), `prismaPersistence(prisma)` (new `Sandbox` model; the delegate resolves lazily so chat-only clients without it keep working), and `cloudflarePersistence({ d1 })` (D1, delegating to Drizzle). `memoryPersistence()` includes an in-memory sandbox store.
- The Cloudflare Durable-Object lock (`durableObjects`) doubles as the distributed sandbox lock.

**Shared tokens in core.** `SandboxStore` / `SandboxRecord` / `SandboxStoreCapability` / `InMemorySandboxStore` and the `LockStore` / `LocksCapability` / `InMemoryLockStore` primitives now live in core `@tanstack/ai` (their neutral home). `@tanstack/ai-sandbox` and `@tanstack/ai-persistence` re-export them, so one shared token reference lets a persistence-provided store and lock reach `withSandbox` with no dependency between the two packages. A `SandboxStore` conformance testkit is exported from `@tanstack/ai-sandbox/testkit` (`runSandboxStoreConformance`); every backend runs it.
