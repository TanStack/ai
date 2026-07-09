---
title: Persistence with Drizzle
id: drizzle
---

`@tanstack/ai-persistence-drizzle` is the batteries-included SQL backend for
TanStack AI **state** persistence. It ships a Drizzle schema, drizzle-kit
migrations, and two entry points that both return the same `AIPersistence`
contract consumed by `withChatPersistence(...)` and `withGenerationPersistence(...)`.

- `sqlPersistence({ dialect, url, migrate })` — **batteries-included.** Give it a
  dialect and a URL; it builds the database and applies the migrations bundled
  in the package.
- `drizzlePersistence(db)` — **bring your own.** Pass a Drizzle database you
  already constructed and migrated against the exported `schema`.

```sh
pnpm add @tanstack/ai-persistence @tanstack/ai-persistence-drizzle drizzle-orm
```

## Batteries-included: `sqlPersistence`

For local development and single-node deployments, `sqlPersistence` is the
fastest path. The `sqlite` dialect is bundled with pre-generated migrations, so
`migrate: true` creates the schema on first use.

```ts
import { sqlPersistence } from '@tanstack/ai-persistence-drizzle'
import { withChatPersistence } from '@tanstack/ai-persistence'

export const persistence = sqlPersistence({
  dialect: 'sqlite',
  url: 'file:./.tanstack-ai/state.sqlite',
  migrate: true,
})

export const middleware = withChatPersistence(persistence)
```

Use `url: ':memory:'` for tests. For production, generate and review the
migrations ahead of time (see below) and leave `migrate` unset so the schema is
deployed by your own pipeline rather than lazily at runtime.

## Bring your own: `drizzlePersistence`

When Drizzle already owns your database connection and migration workflow, pass
your `db` directly. This works with any Drizzle sqlite driver
(`better-sqlite3`, `libsql`/Turso, D1, `node:sqlite`).

```ts ignore
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { drizzlePersistence, schema } from '@tanstack/ai-persistence-drizzle'
import { withChatPersistence } from '@tanstack/ai-persistence'

const db = drizzle(new Database('state.sqlite'), { schema })

export const persistence = drizzlePersistence(db)
export const middleware = withChatPersistence(persistence)
```

The package re-exports the `schema` (and each table) so you can compose it into
your own Drizzle schema and drive migrations from your existing setup.

## Generate migrations with drizzle-kit

The schema is the single source of truth for migrations. The package ships a
`drizzle.config.ts`; regenerate the SQL under `drizzle/` after any schema change:

```sh
pnpm --filter @tanstack/ai-persistence-drizzle db:generate
```

For a bring-your-own database, point drizzle-kit at the exported schema in your
own `drizzle.config.ts` and run `drizzle-kit generate` / `drizzle-kit migrate`
through your normal workflow. See [Migrations](./migrations) for the full flow.

## What is persisted

The schema mirrors the `AIPersistence` state records column-for-column:

- `messages` — thread message history
- `runs` — run lifecycle (status, usage, timing)
- `interrupts` — interrupts / approvals
- `metadata` — scoped key/value metadata
- `artifacts` — generation artifact references
- `blobs` — generic blob objects

Delivery durability (resuming an interrupted stream) is a **transport** concern
and is not stored here. Locks are not part of the SQL schema; an in-memory lock
is provided as a dev default. Swap in a distributed lock for multi-process
deployments via [Custom Stores](./custom-stores).

## Use it across the guides

The same Drizzle-backed `AIPersistence` object works across the topic guides:

- [Chat Persistence](./chat-persistence) for server-owned transcripts.
- [Persistence Controls](./controls) when you need to choose a feature list.
- [Custom Stores](./custom-stores) when you want Drizzle for SQL state but a
  separate object store for blobs.

Other dialects (`postgres`, `mysql`) are bring-your-own today: construct a
Drizzle db with your own driver and use `drizzlePersistence(db)` with migrations
generated from the exported `schema`.
