---
title: Persistence with Drizzle
id: drizzle
---

# Persistence with Drizzle

`@tanstack/ai-persistence-drizzle` supports SQLite-family Drizzle databases.
It has two entry points:

- the package root accepts an already-created, migrated `DrizzleDb` and is
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

```ts
import { drizzle } from 'drizzle-orm/d1'
import {
  drizzlePersistence,
  schema,
} from '@tanstack/ai-persistence-drizzle'

declare const env: { AI_STATE: D1Database }

const db = drizzle(env.AI_STATE, { schema })
export const persistence = drizzlePersistence(db)
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
import { withChatPersistence } from '@tanstack/ai-persistence'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.resume ? { resume: params.resume } : {}),
    middleware: [withChatPersistence(persistence)],
  })

  return toServerSentEventsResponse(stream)
}
```

`drizzlePersistence` provides all state stores. Its lock store is in-process;
use `composePersistence` to replace `locks` when multiple workers need a shared
lock service.

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

The exported `schema` contains `messages`, `runs`, `interrupts`, `metadata`,
`artifacts`, and `blobs`. Artifact rows contain metadata; blob bodies are stored
in the separate blob table. Application tables may live beside these tables in
the same database.
