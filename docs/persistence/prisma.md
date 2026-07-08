---
title: Persistence with Prisma
id: prisma
---

Use Prisma persistence when Prisma already owns your SQLite or Postgres
database connection and migration workflow. The adapter wraps Prisma's raw SQL
methods and exposes the same `AIPersistence` stores used by
`withPersistence(...)`.

By the end, your Prisma-backed server can persist chat messages, replay events,
interrupts, metadata, and other SQL-backed stores without adding a second
database client.

## Generate the migration

Create a Prisma migration file for your dialect.

```sh
pnpm exec tanstack-ai-persistence-prisma --dialect postgres
```

The default output path is
`prisma/migrations/<timestamp>_tanstack_ai_persistence/migration.sql`. You can
also pass `--out`, `--stdout`, `--timestamp`, `--name`, and `--force`.

Run the generated migration with your normal Prisma workflow before deploying.
Lazy migrations are opt-in; use `migrate: true` only for local or development
databases.

## Create the persistence object

Pass your Prisma client and dialect to `prismaPersistence(...)`.

```ts
import { prismaPersistence } from '@tanstack/ai-persistence-prisma'
import { withPersistence } from '@tanstack/ai-persistence'
import { prisma } from './prisma'

export const persistence = prismaPersistence({
  prisma,
  dialect: 'postgres',
})

export const middleware = withPersistence(persistence, {
  features: ['messages', 'durable-replay', 'interrupts', 'metadata'],
})
```

The adapter uses Prisma's `$queryRawUnsafe`, `$executeRawUnsafe`, and
`$transaction` methods behind the `SqlDriver` contract. It supports SQLite and
Postgres.

## Use it for different persistence goals

Use the same Prisma-backed `AIPersistence` object across the topic guides:

- [Chat Persistence](./chat-persistence) for server-owned transcripts and
  replay cursors.
- [Persistence Controls](./controls) when you need to choose a feature list.
- [MCP Persistence](./mcp-persistence) when MCP session ids or tool-call
  correlation should live in metadata and internal events.
- [Custom Stores](./custom-stores) when you want to keep Prisma for SQL state
  but provide a separate object store for blobs.

If generated media or file artifacts must be durable, Prisma can own the SQL
state, but you still need `stores.artifacts` and `stores.blobs`. Implement that
hybrid shape with [Custom Stores](./custom-stores), or use a backend such as
[Cloudflare](./cloudflare) when D1 plus R2 fits your deployment.
