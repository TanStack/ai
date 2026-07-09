---
title: SQL Backends
id: sql-backends
---

Use a SQL backend when your app runs in Node or another server runtime with a
database connection. The raw SQLite and Postgres packages expose the same
`AIPersistence` stores to `withChatPersistence(...)`. The shared SQL core also
supports MySQL DDL for custom drivers, but there is no standalone MySQL backend
package.

For production, treat the SQL schema as part of your app-owned persistence
boundary. Generate or copy the TanStack AI DDL into your normal migration
system, review it like any other schema change, and deploy it before traffic
uses the persistence stores. Use lazy migration only when you intentionally want
the backend to create tables at runtime. See [Migrations](./migrations) for the
full CLI reference.

## Raw SQL backends

SQLite is file-backed and works well for local apps, prototypes, and single-node
deployments. Fresh development examples can set `migrate: true` explicitly so a
new local database creates its tables on first use.

```ts
import { sqlitePersistence } from '@tanstack/ai-persistence-sqlite'

export const persistence = sqlitePersistence({
  path: '.tanstack-ai/state.sqlite',
  migrate: true,
})
```

Postgres is the usual durable choice for replicated server deployments.

```ts
import { postgresPersistence } from '@tanstack/ai-persistence-postgres'

export const persistence = postgresPersistence({
  connectionString: process.env.DATABASE_URL ?? '',
  migrate: true,
})
```

Both raw backends use the shared SQL core. They do not create persistence
tables by default. `migrate` is `false` unless you pass `migrate: true`, which
opts into lazy table creation on first use.

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

## Own migrations

If your deployment applies migrations separately, leave `migrate` unset or set
it to `false`, and run the exported DDL yourself.

```ts
import { ddl } from '@tanstack/ai-persistence-sql'
import { postgresPersistence } from '@tanstack/ai-persistence-postgres'

export const persistence = postgresPersistence({
  connectionString: process.env.DATABASE_URL ?? '',
})

export const migrationStatements = ddl('postgres')
```

Apply those statements with your normal migration system before traffic reaches
the app.

## Generate SQL migrations

Use the generic SQL CLI when you want a migration file without importing DDL in
application code. It emits the shared SQL persistence schema for every SQL
dialect supported by the core generator: SQLite, Postgres, and MySQL.

```sh
pnpm exec tanstack-ai-persistence-sql --dialect sqlite --out migrations/001_tanstack_ai.sql
pnpm exec tanstack-ai-persistence-sql --dialect postgres --stdout
pnpm exec tanstack-ai-persistence-sql --dialect mysql --out migrations/001_tanstack_ai.sql
```

Options:

| Option | Purpose |
| --- | --- |
| `--dialect sqlite\|postgres\|mysql` | Choose the SQL dialect to generate. |
| `--out <path>` | Write SQL to a migration file. |
| `--stdout` | Print SQL instead of writing a file. |
| `--timestamp <yyyymmddhhmmss>` | Use a deterministic timestamp in generated default names. |
| `--name <name>` | Use a deterministic migration name. |
| `--force` | Overwrite an existing output file. |

The generic CLI writes only the shared SQL persistence schema. Cloudflare R2
artifact indexes, ORM-specific migration folder layouts, and app-owned tables
remain separate.

## ORM-backed SQL

Use [Prisma](./prisma) or [Drizzle](./drizzle) when those clients already own
your SQLite or Postgres database access and migration workflow. They use the
same shared SQL stores and feature behavior as the raw SQL backends.

## MySQL-compatible deployments

There is no `@tanstack/ai-persistence-mysql` package today. If your app needs a
MySQL-compatible database, use the shared SQL core from
`@tanstack/ai-persistence-sql` through an adapter that provides a `SqlDriver`
with `dialect: 'mysql'`. The Prisma and Drizzle persistence adapters currently
support SQLite and Postgres.

```ts
import { ddl } from '@tanstack/ai-persistence-sql'
export const migrationStatements = ddl('mysql')
```

You can also generate the same MySQL DDL with the generic CLI:

```sh
pnpm exec tanstack-ai-persistence-sql --dialect mysql --out migrations/tanstack_ai.sql
```

## Choosing a backend

Use SQLite when one process owns the database file. Use Postgres when multiple
app instances need the same durable run state. Use Prisma or Drizzle when those
clients are already how your application accesses a SQLite or Postgres
database. Use the shared SQL core when you need a MySQL-compatible custom
driver. Use [Cloudflare](./cloudflare) instead of the Node SQL backends when
your runtime is Workers and your database is D1.
