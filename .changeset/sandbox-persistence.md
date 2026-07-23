---
'@tanstack/ai': minor
'@tanstack/ai-sandbox': minor
'@tanstack/ai-persistence': minor
'@tanstack/ai-persistence-drizzle': minor
'@tanstack/ai-persistence-prisma': minor
'@tanstack/ai-persistence-cloudflare': minor
---

Add durable **sandbox persistence**: cross-process / multi-instance resume for `@tanstack/ai-sandbox`.

`withSandbox` already consumes `SandboxStore` (which sandbox to resume) and `LockStore` (mutual exclusion around ensure) as optional capabilities, defaulting to in-memory (single-process). This lands the durable half:

- `withSandboxPersistence({ store, locks? })` (`@tanstack/ai-sandbox`) — a chat middleware that provides a durable `SandboxStore` (and an optional distributed lock) to `withSandbox`. Compose it before `withSandbox`.
- Durable `SandboxStore` backends: `createDrizzleSandboxStore(db)` (`@tanstack/ai-persistence-drizzle`, backed by a new `sandboxes` table in the shipped schema/migration), `createPrismaSandboxStore(prisma)` (`@tanstack/ai-persistence-prisma`, via a new `Sandbox` model), and `createD1SandboxStore(d1)` (`@tanstack/ai-persistence-cloudflare`, delegating to Drizzle over D1).
- The Cloudflare Durable-Object lock (`createDurableObjectLockStore`) doubles as the distributed sandbox lock.
- A `SandboxStore` conformance testkit is exported from `@tanstack/ai-sandbox/testkit` (`runSandboxStoreConformance`); every backend runs it.

**Unified locks token.** The `'locks'` capability now lives in core `@tanstack/ai` (`LocksCapability`, `LockStore`, `InMemoryLockStore`, `getLocks`, `provideLocks`); `@tanstack/ai-sandbox` and `@tanstack/ai-persistence` re-export it. Because it is one shared token, a `withPersistence({ stores: { locks } })` already in the chain feeds the sandbox lock automatically — no sandbox-specific wiring. `@tanstack/ai-persistence-{drizzle,prisma,cloudflare}` add `@tanstack/ai-sandbox` as an optional peer dependency.
