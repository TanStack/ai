---
title: SQL Backends
id: sql-backends
---

Use a SQL backend when your app runs in Node or another server runtime with a
database connection. SQLite, Postgres, and higher-level Drizzle or Prisma
clients all expose the same `AIPersistence` stores to `withPersistence(...)`.
The shared SQL core includes a MySQL dialect for adapter authors, but the
published raw backend packages are SQLite and Postgres.

For production, treat the SQL schema as part of your app-owned persistence
boundary. Generate or copy the TanStack AI DDL into your normal migration
system, review it like any other schema change, and deploy it before traffic
uses the persistence stores. Use lazy migration only when you intentionally want
the backend to create tables at runtime.

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
migration workflow, which is the default. Both ORM packages ship a CLI that
writes the TanStack AI persistence DDL into a migration file for SQLite or
Postgres.

```sh
pnpm exec tanstack-ai-persistence-prisma --dialect postgres
pnpm exec tanstack-ai-persistence-drizzle --dialect postgres
```

Use the ORM-specific CLIs when you want their default migration layout. Use the
generic `tanstack-ai-persistence-sql` CLI when you only want SQL text or when
you are generating MySQL DDL for a custom adapter.

The default Prisma path is
`prisma/migrations/<timestamp>_tanstack_ai_persistence/migration.sql`. The
default Drizzle path is `drizzle/<timestamp>_tanstack_ai_persistence.sql`.
Use `--out <path>` for a custom migration file, `--stdout` to print the SQL, or
`--timestamp <yyyymmddhhmmss>` and `--name <name>` when you need deterministic
file names. CLIs refuse to overwrite an existing output file by default; pass
`--force` to replace it. Pass `--help` to print the full option reference.

```ts
import { drizzlePersistence } from '@tanstack/ai-persistence-drizzle'
import { prismaPersistence } from '@tanstack/ai-persistence-prisma'
import type { DrizzleDb } from '@tanstack/ai-persistence-drizzle'
import type { PrismaRawClient } from '@tanstack/ai-persistence-prisma'

declare const db: DrizzleDb
declare const prisma: PrismaRawClient

export const drizzle = drizzlePersistence({
  db,
  dialect: 'postgres',
})

export const prismaStore = prismaPersistence({
  prisma,
  dialect: 'postgres',
})
```

Run the generated file through `prisma migrate` or your Drizzle migration
workflow before traffic reaches the app.

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
app instances need the same durable run state. Use Drizzle or Prisma when those
clients are already how your application accesses a SQLite or Postgres
database. Use the shared SQL core when you need a MySQL-compatible deployment.
Use [Cloudflare](./cloudflare) instead of the Node SQL backends when your
runtime is Workers and your database is D1.
