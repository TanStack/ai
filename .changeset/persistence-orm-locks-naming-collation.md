---
'@tanstack/ai-persistence-drizzle': patch
'@tanstack/ai-persistence-prisma': patch
'@tanstack/ai-persistence-cloudflare': patch
---

Persistence ORM backends: safer locks and clearer SQLite naming.

- `drizzlePersistence` and `prismaPersistence` no longer return a `locks` store.
  Bundling an `InMemoryLockStore` silently handed multi-instance deployments a
  lock that does not lock across instances. Consumers that need a lock (e.g.
  `withSandbox`) transparently fall back to an in-process lock; use a
  distributed backend such as the Cloudflare Durable Object lock for
  cross-instance locking.
- `@tanstack/ai-persistence-drizzle` renames `TanstackAiSchema` →
  `TanstackAiSqliteSchema` and `DrizzleDb` → `DrizzleSqliteDb` to make the
  SQLite-only surface explicit. The old names remain as `@deprecated` aliases.
- `metadata.set` with a nullish value now throws a clear error on both SQL
  backends (a NOT NULL JSON column cannot store `undefined`/`null`) instead of a
  cryptic driver failure — use `delete` to clear a value.
