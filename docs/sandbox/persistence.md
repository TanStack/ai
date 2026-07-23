---
title: Sandbox Persistence
id: sandbox-persistence
order: 9
description: "Make sandbox resume durable across processes and instances by giving withPersistence a backend that carries a sandbox store."
---

Your agent runs behind more than one server instance, or at the edge. A run
spins up a sandbox, clones the repo, installs deps, does its work. The next run
for the same thread should pick that sandbox back up. Instead it builds a fresh
one every time and pays the whole cold-start cost again.

[Lifecycle & Snapshots](./lifecycle) already knows how to resume, but its
bookkeeping is in-memory, so it only holds within one process. The moment a run
lands on a different replica (or a fresh isolate), that instance has never seen
the sandbox and re-creates it.

Sandbox persistence makes resume durable across instances. You do not add a
sandbox-specific middleware: the same `withPersistence` you use for chat carries
two durable stores `withSandbox` reads:

- `SandboxStore`: the record of which provider sandbox (and snapshot) to resume
  for a given key. Durable, shared across instances.
- `LockStore`: mutual exclusion around resume-or-create, so two runs for the
  same thread don't both create a sandbox. Across instances this has to be a
  distributed lock.

## Wire it up

Give `withPersistence` a backend that carries a sandbox store (all of them do),
and put it before `withSandbox` in the chain:

```ts
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import { withSandbox } from '@tanstack/ai-sandbox'
import { withPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'
import { sandbox } from './sandbox'
import { messages } from './chat-context'

const persistence = sqlitePersistence({ url: './state.db', migrate: true })

chat({
  adapter: grokBuildText('grok-build'),
  messages,
  middleware: [withPersistence(persistence), withSandbox(sandbox)],
})
```

With `reuse: 'thread'` (the default), the first run creates and records the
sandbox. A later run for the same `threadId` resumes it, even on a different
instance.

If you already run `withPersistence` for chat history, you are done: the same
persistence carries the sandbox store, so those two middlewares cover both. And
because the `sandbox` store and the chat stores share one backend and one
migration bundle, an app that persists chat and one that persists sandboxes look
identical to set up.

## Choose a backend

Each [persistence backend](../persistence/sql-backends) carries a durable
`SandboxStore` next to its chat stores. The `sandboxes` table (or model) ships
in the same schema and migration bundle, so migrating for persistence creates it
too. `withSandbox` uses whichever store the persistence carries.

### SQLite / Drizzle (Node)

`sqlitePersistence` opens Node's built-in SQLite, applies the bundled
migrations, and hands back a persistence carrying every store:

```ts
import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'

export const persistence = sqlitePersistence({
  url: './state.db',
  migrate: true,
})
```

Have your own Drizzle SQLite database (libsql, better-sqlite3, D1)? Build the
persistence with `drizzlePersistence(db)`; it carries the sandbox store the same
way.

### Prisma

`prismaPersistence` wraps a migrated `PrismaClient` whose schema includes the
models from the [Prisma fragment](../persistence/prisma) (chat models plus
`Sandbox`):

```ts
import { prismaPersistence } from '@tanstack/ai-persistence-prisma'
import { prisma } from './prisma'

export const persistence = prismaPersistence(prisma)
```

A chat-only client that never adds `withSandbox` does not need the `Sandbox`
model; the sandbox store is resolved lazily, on first use.

### Cloudflare (edge)

At the edge every run can hit a different isolate, so the distributed lock earns
its keep. D1 carries the stores (including sandbox), and Durable Objects provide
the lock:

```ts
import { cloudflarePersistence } from '@tanstack/ai-persistence-cloudflare'
import { env } from './env'

export const persistence = cloudflarePersistence({
  d1: env.DB,
  durableObjects: env.SANDBOX_LOCKS,
})
```

```ts
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import { withSandbox } from '@tanstack/ai-sandbox'
import { withPersistence } from '@tanstack/ai-persistence'
import { sandbox } from './sandbox'
import { messages } from './chat-context'
import { persistence } from './persistence'

chat({
  adapter: grokBuildText('grok-build'),
  messages,
  middleware: [withPersistence(persistence), withSandbox(sandbox)],
})
```

Bind the Durable Object and apply D1 migrations exactly as for
[chat persistence](../persistence/cloudflare): re-export
`CloudflareLockDurableObject` from your Worker entry, add the namespace binding
in `wrangler.toml`, and run `d1Migrations` (they already include the `sandboxes`
table).

## Write your own store

A `SandboxStore` is three methods: `get`, `upsert`, `delete`. Build one over any
backend, put it on a persistence under `stores.sandbox`, and hold it to the same
contract the built-in stores pass with `runSandboxStoreConformance` from
`@tanstack/ai-sandbox/testkit`:

```ts
import { runSandboxStoreConformance } from '@tanstack/ai-sandbox/testkit'
import { createMySandboxStore } from './my-sandbox-store'

runSandboxStoreConformance('my-store', () => createMySandboxStore())
```
