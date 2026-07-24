---
title: Persistence with Drizzle
id: drizzle
---

# Persistence with Drizzle

`@tanstack/ai-persistence-drizzle` is **schema-first**. It does not ship SQL
migrations. You own the schema file (or accept stock defaults), generate DDL
with **your** drizzle-kit journal, and pass the schema into the runtime.

Two entry points:

- the package root accepts an already-created, migrated `DrizzleSqliteDb` plus
  a required `schema` and is safe to import in edge runtimes;
- `/sqlite` is a Node-only convenience factory built on `node:sqlite` with stock
  defaults and optional runtime table bootstrap for local/dev.

## Schema first

Emit a starter schema into your project:

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

export const persistence = drizzlePersistence(db, { schema })
```

Because the runtime operates on the table objects you pass, the file is yours
to shape:

- **Rename tables and columns**, or drop the explicit column names and rely on
  your drizzle `casing` configuration — the stores read database names from
  your objects, so the generated SQL follows your conventions.
- **Add app-owned columns** — for example a `userId` column on `messages` to
  scope threads to users. Keep added columns nullable or defaulted so the
  store inserts succeed; the TanStack AI stores never read or write them.
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
  return drizzlePersistence(db, { schema })
}
```

Prefer emitting and owning the schema in production. The root entry does not
import Node built-ins and works with Cloudflare D1 and other SQLite-compatible
Drizzle drivers. The application owns connection lifecycle and migration timing.

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
