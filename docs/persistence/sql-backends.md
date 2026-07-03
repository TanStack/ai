---
title: SQL Backends
id: sql-backends
---

Use a SQL backend when your app runs in Node or another server runtime with a
database connection. SQLite, Postgres, and higher-level Drizzle or Prisma
clients all expose the same `AIPersistence` stores to `withPersistence(...)`.
The shared SQL core includes a MySQL dialect for adapter authors, but the
published raw backend packages are SQLite and Postgres.

## Raw SQL backends

SQLite is file-backed and works well for local apps, prototypes, and single-node
deployments.

```ts
import { sqlitePersistence } from '@tanstack/ai-persistence-sqlite'

export const persistence = sqlitePersistence({
  path: '.tanstack-ai/state.sqlite',
})
```

Postgres is the usual durable choice for replicated server deployments.

```ts
import { postgresPersistence } from '@tanstack/ai-persistence-postgres'

export const persistence = postgresPersistence({
  connectionString: process.env.DATABASE_URL ?? '',
})
```

Both raw backends use the shared SQL core. They create the persistence tables
lazily on first use by default.

## Shared schema

The base SQL schema is intentionally small:

- `runs`
- `public_events`
- `internal_events`
- `messages`
- `interrupts`
- `metadata`
- `_tanstack_ai_migrations`

Public events are the replayable AG-UI stream. Internal events are separate
package or app checkpoints and are not returned to reconnecting chat clients.

## Own migrations with `migrate: false`

If your deployment applies migrations separately, disable lazy migrations and
run the exported DDL yourself.

```ts
import { ddl } from '@tanstack/ai-persistence-sql'
import { postgresPersistence } from '@tanstack/ai-persistence-postgres'

export const persistence = postgresPersistence({
  connectionString: process.env.DATABASE_URL ?? '',
  migrate: false,
})

export const migrationStatements = ddl('postgres')
```

Apply those statements with your normal migration system before traffic reaches
the app.

## Drizzle and Prisma

Use the ORM-backed packages when your app already owns its database client and
schema lifecycle.

```ts
import { drizzlePersistence } from '@tanstack/ai-persistence-drizzle'
import { prismaPersistence } from '@tanstack/ai-persistence-prisma'
import type { DrizzleDb } from '@tanstack/ai-persistence-drizzle'
import type { PrismaRawClient } from '@tanstack/ai-persistence-prisma'

declare const db: DrizzleDb
declare const prisma: PrismaRawClient

export const drizzle = drizzlePersistence({ db, dialect: 'postgres' })
export const prismaStore = prismaPersistence({ prisma, dialect: 'postgres' })
```

Drizzle and Prisma users usually manage schema changes through their own
migration workflow. Pass `migrate: false` when you want that workflow to be the
only source of schema changes. Prisma can use the shared SQL dialects exposed
by `@tanstack/ai-persistence-sql`; Drizzle's built-in unwrapping currently
targets SQLite-shaped and node-postgres clients.

## MySQL-compatible deployments

There is no `@tanstack/ai-persistence-mysql` package today. If your app needs a
MySQL-compatible database, use the shared SQL core from
`@tanstack/ai-persistence-sql` through an adapter that provides a `SqlDriver`
with `dialect: 'mysql'`, or use `@tanstack/ai-persistence-prisma` with
`dialect: 'mysql'` and your own Prisma migration workflow.

```ts
import { ddl } from '@tanstack/ai-persistence-sql'
import { prismaPersistence } from '@tanstack/ai-persistence-prisma'
import type { PrismaRawClient } from '@tanstack/ai-persistence-prisma'

declare const prisma: PrismaRawClient

export const persistence = prismaPersistence({
  prisma,
  dialect: 'mysql',
  migrate: false,
})

export const migrationStatements = ddl('mysql')
```

## Choosing a backend

Use SQLite when one process owns the database file. Use Postgres when multiple
app instances need the same durable run state. Use Drizzle or Prisma when those
clients are already how your application accesses its database. Use the shared
SQL core or Prisma path when you need a MySQL-compatible deployment. Use
[Cloudflare](./cloudflare) instead of the Node SQL backends when your runtime is
Workers and your database is D1.
