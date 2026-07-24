---
title: Persistence with Drizzle
id: drizzle
---

# Persistence with Drizzle

`@tanstack/ai-persistence-drizzle` is **schema-first**. It does not ship SQL
migrations. You own the schema file (or accept stock defaults), generate DDL
with **your** drizzle-kit journal, and pass the schema into the runtime.

> **Runnable example:** `examples/persistent-chat-drizzle` in this repo is this
> guide end to end — the persistent-chat demo (streaming, tool calls, durable
> approval interrupts) backed by SQLite with an emitted schema, committed
> drizzle-kit migrations, and `ensureTables: false`.

Two entry points:

- the package root accepts an already-created, migrated Drizzle database plus
  a required `provider` (`'sqlite'` or `'pg'`) and matching `schema`, and is
  safe to import in edge runtimes;
- `/sqlite` is a Node-only convenience factory built on `node:sqlite` with stock
  defaults and optional runtime table bootstrap for local/dev.

The `provider` discriminates the whole call: with `provider: 'sqlite'` the
compiler only accepts a SQLite Drizzle database and a SQLite schema, with
`provider: 'pg'` only a Postgres database and schema, and the runtime assert
verifies the passed tables really are that dialect.

## Schema first

There are two ways to get the tables into **your** drizzle-kit journal:

### Stock tables: re-export the package schema

If you don't need to rename or extend the tables, don't copy anything — create
a one-line module the package keeps up to date across upgrades:

```ts
// src/db/tanstack-ai-schema.ts
export * from '@tanstack/ai-persistence-drizzle/sqlite-schema'
```

Add that file to your drizzle-kit `schema` paths and generate migrations as
usual. When a package upgrade adds a column or index, `drizzle-kit generate`
picks it up automatically — there is no copied file to go stale. Use
`@tanstack/ai-persistence-drizzle/pg-schema` for Postgres.

### Custom tables: emit an owned starter

To rename tables or columns, add app-owned columns, or tune indexes, own the
definition instead. Emit a starter schema into your project:

```bash
pnpm exec tanstack-ai-drizzle-schema --out src/db
```

Add it to drizzle-kit so **your** journal owns the DDL:

```ts ignore
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: ['./src/db/schema.ts', './src/db/tanstack-ai-schema.ts'],
  out: './drizzle',
})
```

```bash
pnpm exec drizzle-kit generate
pnpm exec drizzle-kit migrate
```

Then wire the runtime:

```ts
import { drizzlePersistence } from '@tanstack/ai-persistence-drizzle'
import { schema } from './db/tanstack-ai-schema'
import { db } from './db'

export const persistence = drizzlePersistence(db, {
  provider: 'sqlite',
  schema,
})
```

Because the runtime operates on the table objects you pass, the file is yours
to shape:

- **Rename tables and columns**, or drop the explicit column names and rely on
  your drizzle `casing` configuration — the stores read database names from
  your objects, so the generated SQL follows your conventions.
- **Add app-owned columns** — for example a `userId` column on `messages` to
  scope threads to users. Keep added columns nullable or defaulted so the
  store inserts succeed; the TanStack AI stores never read or write them.
- **Tune indexes** — the starter ships lookup indexes on
  `interrupts.thread_id` and `interrupts.run_id` (the columns the stores list
  by); add composite or partial indexes as your query patterns demand.
- **Keep the contract columns** with their data shapes. The
  `TanstackAiSqliteSchema` type enforces the shapes at compile time, and
  `drizzlePersistence` validates the tables and columns exist at construction.

## Node SQLite convenience

For local development without a project schema file yet:

```ts
import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'

export const persistence = sqlitePersistence({
  url: 'file:.tanstack-ai/state.sqlite',
})
```

This uses `createDefaultSqliteSchema()` and, by default, creates missing tables
with `CREATE TABLE IF NOT EXISTS` derived from that schema. That is a **bootstrap
convenience**, not a migration system — for production, emit the schema, migrate
with drizzle-kit, and pass your schema with `ensureTables: false`:

```ts
import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'
import { schema } from './db/tanstack-ai-schema'

export const persistence = sqlitePersistence({
  url: 'file:.tanstack-ai/state.sqlite',
  schema,
  ensureTables: false,
})
```

`url` may be `:memory:`, a filesystem path, or a `file:`-prefixed path.

## Bring your own SQLite Drizzle database

```ts ignore
import { drizzle } from 'drizzle-orm/d1'
import {
  createDefaultSqliteSchema,
  drizzlePersistence,
} from '@tanstack/ai-persistence-drizzle'

export function createPersistence(state: D1Database) {
  const schema = createDefaultSqliteSchema()
  const db = drizzle(state, { schema })
  return drizzlePersistence(db, { provider: 'sqlite', schema })
}
```

Prefer emitting and owning the schema in production. The root entry does not
import Node built-ins and works with Cloudflare D1 and other SQLite-compatible
Drizzle drivers. The application owns connection lifecycle and migration timing.

## Postgres

Postgres uses the same root entry with `provider: 'pg'`: bring your own
migrated Drizzle Postgres database (node-postgres, postgres.js, Neon,
PGlite, …) and your schema. For stock tables, re-export
`@tanstack/ai-persistence-drizzle/pg-schema` as shown above; to own the
definition, emit the Postgres starter:

```bash
pnpm exec tanstack-ai-drizzle-schema --out src/db --dialect pg
```

Add it to your drizzle-kit config (`dialect: 'postgresql'`), generate and run
migrations, then wire the runtime:

```ts ignore
import { drizzle } from 'drizzle-orm/node-postgres'
import { drizzlePersistence } from '@tanstack/ai-persistence-drizzle'
import { schema } from './db/tanstack-ai-schema'

const db = drizzle(process.env.DATABASE_URL!)
export const persistence = drizzlePersistence(db, { provider: 'pg', schema })
```

The same schema freedoms apply: rename tables and columns, lean on drizzle
`casing`, and add nullable or defaulted app-owned columns. The
`TanstackAiPgSchema` type enforces the contract's column data shapes at compile
time. For local development without migrations, `createDefaultPgSchema()`
provides the stock tables and `ensurePgTables` bootstraps them with
`CREATE TABLE IF NOT EXISTS`:

```ts ignore
import { drizzle } from 'drizzle-orm/node-postgres'
import { pool } from './db'
import {
  createDefaultPgSchema,
  drizzlePersistence,
  ensurePgTables,
} from '@tanstack/ai-persistence-drizzle'

const schema = createDefaultPgSchema()
await ensurePgTables((sql) => pool.query(sql), schema)
export const persistence = drizzlePersistence(drizzle(pool), {
  provider: 'pg',
  schema,
})
```

## Use the middleware

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withPersistence } from '@tanstack/ai-persistence'
import { persistence } from './persistence'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.resume ? { resume: params.resume } : {}),
    middleware: [withPersistence(persistence)],
  })

  return toServerSentEventsResponse(stream)
}
```

`drizzlePersistence` provides all state stores except `locks`: this backend has
no distributed lock, so consumers that need one fall back to an in-process
lock. When multiple workers must share a lock service, use `composePersistence`
to add a distributed `locks` implementation — for example the Cloudflare
Durable Object lock from `@tanstack/ai-persistence-cloudflare`.
