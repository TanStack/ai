---
title: Persistence Migrations
id: migrations
---

The Drizzle backend owns its schema and migrations through drizzle-kit — there
is no hand-authored DDL. The default is production-safe: the packaged backend
does not create tables unless you opt in with `migrate: true` or apply the
generated migrations through your own workflow.

By the end, you can regenerate migrations after a schema change and know when
lazy migration is appropriate.

## Use lazy migration only for local development

Pass `migrate: true` when a local or development database should apply the
bundled migrations on first use.

```ts
import { sqlPersistence } from '@tanstack/ai-persistence-drizzle'

export const persistence = sqlPersistence({
  dialect: 'sqlite',
  url: 'file:./.tanstack-ai/state.sqlite',
  migrate: true,
})
```

For production, leave `migrate` unset, apply the migrations with your own
pipeline, and deploy them before traffic uses the persistence stores.

## Regenerate the bundled migrations

The schema in `src/schema.ts` is the single source of truth. After changing it,
regenerate the SQL under `drizzle/` with drizzle-kit:

```sh
pnpm --filter @tanstack/ai-persistence-drizzle db:generate
```

This runs `drizzle-kit generate` against the package's `drizzle.config.ts`,
diffing the schema and emitting a new migration file. Commit the generated
`drizzle/` output alongside the schema change.

## Bring-your-own migrations

When you construct your own Drizzle database and use `drizzlePersistence(db)`,
drive migrations from the exported `schema` with your own drizzle-kit config:

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './node_modules/@tanstack/ai-persistence-drizzle/dist/esm/schema.js',
  out: './drizzle',
})
```

```sh
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

Compose the exported tables into your own schema file when you want TanStack AI
state to live in the same migration history as the rest of your app. See
[Drizzle](./drizzle) for adapter wiring and [Prisma](./prisma) for the peer
Prisma backend.
