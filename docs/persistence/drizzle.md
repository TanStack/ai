---
title: Persistence with Drizzle
id: drizzle
---

Use Drizzle persistence when Drizzle already owns your SQLite or Postgres
database connection and migration workflow. The adapter unwraps Drizzle's
underlying client and exposes the shared SQL-backed `AIPersistence` stores to
`withPersistence(...)`.

By the end, your Drizzle-backed server can persist chat messages, replay
events, interrupts, metadata, and other SQL-backed stores while keeping schema
deployment in your existing Drizzle workflow.

## Generate the migration

Create a Drizzle migration file for your dialect.

```sh
pnpm exec tanstack-ai-persistence-drizzle --dialect postgres
```

The default output path is `drizzle/<timestamp>_tanstack_ai_persistence.sql`.
You can also pass `--out`, `--stdout`, `--timestamp`, `--name`, and `--force`.

Run the generated SQL through your Drizzle migration workflow before deploying.
Lazy migrations are opt-in; use `migrate: true` only for local or development
databases.

## Create the persistence object

Pass your Drizzle database and dialect to `drizzlePersistence(...)`.

```ts
import { drizzlePersistence } from '@tanstack/ai-persistence-drizzle'
import { withPersistence } from '@tanstack/ai-persistence'
import { db } from './db'

export const persistence = drizzlePersistence({
  db,
  dialect: 'postgres',
})

export const middleware = withPersistence(persistence, {
  features: ['messages', 'durable-replay', 'interrupts', 'metadata'],
})
```

The adapter supports SQLite and Postgres workflows. It uses the shared SQL
stores, so the feature behavior matches the raw SQL and Prisma backends.

## Use it for different persistence goals

Use the same Drizzle-backed `AIPersistence` object across the topic guides:

- [Chat Persistence](./chat-persistence) for server-owned transcripts and
  replay cursors.
- [Persistence Controls](./controls) when you need to choose a feature list.
- [MCP Persistence](./mcp-persistence) when MCP session ids or tool-call
  correlation should live in metadata and internal events.
- [Custom Stores](./custom-stores) when you want Drizzle for SQL state but a
  separate object store for blobs.

If generated media or file artifacts must be durable, Drizzle can own the SQL
state, but you still need `stores.artifacts` and `stores.blobs`. Implement that
hybrid shape with [Custom Stores](./custom-stores), or use [Cloudflare](./cloudflare)
when D1 plus R2 fits your deployment.
