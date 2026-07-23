---
title: Persistence with Drizzle
id: drizzle
---

# Persistence with Drizzle

`@tanstack/ai-persistence-drizzle` supports SQLite-family Drizzle databases.
It has two entry points:

- the package root accepts an already-created, migrated `DrizzleSqliteDb` and is
  safe to import in edge runtimes;
- `/sqlite` is a Node-only convenience factory built on `node:sqlite`.

There is no dialect option. For MySQL, PostgreSQL, or another Drizzle dialect,
implement the `AIPersistence` stores for that database or use the Prisma
backend.

## Node SQLite

```ts
import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'

export const persistence = sqlitePersistence({
  url: 'file:.tanstack-ai/state.sqlite',
  migrate: true,
})
```

`url` may be `:memory:`, a filesystem path, or a `file:`-prefixed path.
`migrate: true` applies the bundled migrations before creating stores. Prefer
deployment-time migrations in production.

## Bring your own SQLite Drizzle database

```ts ignore
import { drizzle } from 'drizzle-orm/d1'
import { drizzlePersistence, schema } from '@tanstack/ai-persistence-drizzle'

export function createPersistence(state: D1Database) {
  const db = drizzle(state, { schema })
  return drizzlePersistence(db)
}
```

The root entry does not import Node built-ins and works with Cloudflare D1 and
other SQLite-compatible Drizzle drivers. The application owns connection
lifecycle and migration timing.

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

## Get the migrations

The package exports the ordered `sqliteMigrations` manifest:

```ts
import { sqliteMigrations } from '@tanstack/ai-persistence-drizzle'

for (const migration of sqliteMigrations) {
  console.log(migration.id, migration.filename)
}
```

Or copy canonical SQL files with the CLI:

```bash
pnpm exec tanstack-ai-drizzle-migrations --out migrations/tanstack-ai
```

Use `--stdout` to print the SQL. The CLI refuses to replace a divergent file
unless `--force` is passed. Commit the copied files and apply them using your
normal SQLite, D1, or Drizzle deployment workflow.

## Schema ownership

The exported `schema` contains `messages`, `runs`, `interrupts`, and
`metadata`. Application tables may live beside these tables in the same
database.

## Own the schema

If your project already uses drizzle-kit, you can own the TanStack AI schema
outright instead of applying the bundled SQL. Emit the schema module into your
project:

```bash
pnpm exec tanstack-ai-drizzle-schema --out src/db
```

This writes `src/db/tanstack-ai-schema.ts` — a regular Drizzle schema file that
imports from **your** installed `drizzle-orm`. The CLI refuses to replace a
divergent file unless `--force` is passed; `--stdout` prints the module instead.

Add the file to your drizzle-kit schema paths so your own migration journal
owns the DDL:

```ts ignore
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: ['./src/db/schema.ts', './src/db/tanstack-ai-schema.ts'],
  out: './drizzle',
})
```

Then pass the schema back so the runtime reads and writes through your copy:

```ts
import { drizzlePersistence } from '@tanstack/ai-persistence-drizzle'
import { schema } from './tanstack-ai-schema'
import { db } from './db'

export const persistence = drizzlePersistence(db, { schema })
```

Because the runtime operates on the table objects you pass, the file is truly
yours to shape:

- **Rename tables and columns**, or drop the explicit column names and rely on
  your drizzle `casing` configuration — the stores read database names from
  your objects, so the generated SQL follows your conventions.
- **Add app-owned columns** — for example a `userId` column on `messages` to
  scope threads to users. Keep added columns nullable or defaulted so the
  store inserts succeed; the TanStack AI stores never read or write them.
- **Keep the contract columns** with their data shapes. The
  `TanstackAiSqliteSchema` type enforces the shapes at compile time, and
  `drizzlePersistence` validates the tables and columns exist at construction.

When you own the schema this way, migrations flow entirely through your
drizzle-kit journal — package upgrades that change the schema surface as
drizzle-kit diffs when you update the emitted file. Don't mix this with the
bundled SQL migrations: pick one DDL owner per database.
