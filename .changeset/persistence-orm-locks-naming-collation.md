---
'@tanstack/ai-persistence-drizzle': patch
'@tanstack/ai-persistence-prisma': patch
'@tanstack/ai-persistence-cloudflare': patch
---

Persistence ORM backends: safer locks, clearer SQLite naming, and
collation-agnostic blob listing.

- `drizzlePersistence` and `prismaPersistence` no longer return a `locks` store.
  Bundling an `InMemoryLockStore` silently handed multi-instance deployments a
  lock that does not lock across instances. Consumers that need a lock (e.g.
  `withSandbox`) transparently fall back to an in-process lock; use a
  distributed backend such as the Cloudflare Durable Object lock for
  cross-instance locking.
- `@tanstack/ai-persistence-drizzle` renames `TanstackAiSchema` →
  `TanstackAiSqliteSchema` and `DrizzleDb` → `DrizzleSqliteDb` to make the
  SQLite-only surface explicit. The old names remain as `@deprecated` aliases.
- `@tanstack/ai-persistence-prisma` blob `list()` is now correct under any
  provider collation (Postgres locale collations, MySQL
  `utf8mb4_0900_ai_ci`): prefix membership, ordering, and cursor pagination are
  computed in JS, with only a coarse `startsWith` prefilter pushed to SQL.
  `metadata.set` with a nullish value now throws a clear error on both SQL
  backends (a NOT NULL JSON column cannot store `undefined`/`null`) instead of a
  cryptic driver failure — use `delete` to clear a value.
- `@tanstack/ai-persistence-cloudflare` R2 `get()` now exposes `body` for parity
  with the other backends.
