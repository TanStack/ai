---
title: SQL Backends
id: sql-backends
---

Use a SQL backend when your app runs in Node or another server runtime with a
database connection. TanStack AI ships a single, Drizzle-backed SQL backend —
`@tanstack/ai-persistence-drizzle` — that exposes the `AIPersistence` state
stores to `withChatPersistence(...)` and `withGenerationPersistence(...)`.

There are two entry points, both returning the same contract:

- `sqlPersistence({ dialect, url, migrate })` — batteries-included: builds the
  database and applies the bundled migrations.
- `drizzlePersistence(db)` — bring your own Drizzle database and migration
  workflow, driven by the exported `schema`.

```sh
pnpm add @tanstack/ai-persistence @tanstack/ai-persistence-drizzle drizzle-orm
```

## Batteries-included

The `sqlite` dialect ships pre-generated migrations, so a fresh database can
create its tables on first use with `migrate: true`.

```ts
import { sqlPersistence } from '@tanstack/ai-persistence-drizzle'

export const persistence = sqlPersistence({
  dialect: 'sqlite',
  url: 'file:./.tanstack-ai/state.sqlite',
  migrate: true,
})
```

Use `url: ':memory:'` for tests. For production, generate and review the
migrations ahead of time and deploy them before traffic reaches the persistence
stores; leave `migrate` unset so tables are not created lazily at runtime.

## Bring your own Drizzle database

When Drizzle already owns your database access, pass your `db`. This works with
any Drizzle sqlite driver (`better-sqlite3`, `libsql`/Turso, D1, `node:sqlite`).

```ts ignore
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { drizzlePersistence, schema } from '@tanstack/ai-persistence-drizzle'

const db = drizzle(new Database('state.sqlite'), { schema })

export const persistence = drizzlePersistence(db)
```

See [Drizzle](./drizzle) for the full adapter guide and [Migrations](./migrations)
for the drizzle-kit workflow.

## Schema

The schema mirrors the `AIPersistence` state records column-for-column:

- `messages`
- `runs`
- `interrupts`
- `metadata`
- `artifacts`
- `blobs`

Delivery durability (replaying an interrupted stream) is a transport concern and
is not stored in these tables. Locks are not part of the SQL schema; an
in-memory lock is provided as a dev default — see [Custom Stores](./custom-stores)
to plug in a distributed lock.

## Other dialects

`sqlPersistence` bundles the `sqlite` dialect. For `postgres` or `mysql`,
construct a Drizzle database with your own driver and use `drizzlePersistence(db)`,
generating migrations from the exported `schema` with drizzle-kit. Prisma users
can use [Prisma](./prisma) as a peer backend.

## Choosing a backend

Use `sqlPersistence` with sqlite when one process owns the database file or for
local development. Use `drizzlePersistence(db)` when Drizzle already owns your
database connection — including Postgres, MySQL, libsql/Turso, or D1 — and you
manage migrations yourself.
