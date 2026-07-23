---
title: Sandbox Persistence
id: sandbox-persistence
order: 9
description: "Make sandbox resume durable across processes and instances with a persisted SandboxStore and a distributed lock, wired through withSandboxPersistence."
---

Your agent runs behind more than one server instance, or at the edge. A run
spins up a sandbox, clones the repo, installs deps, does its work. The next run
for the same thread should pick that sandbox back up. Instead it builds a fresh
one every time and pays the whole cold-start cost again.

[Lifecycle & Snapshots](./lifecycle) already knows how to resume, but its
bookkeeping is in-memory, so it only holds within one process. The moment a run
lands on a different replica (or a fresh isolate), that instance has never seen
the sandbox and re-creates it.

Sandbox persistence makes resume durable across instances. You add one
middleware; the sandbox layer itself does not change. It fills two seams
`withSandbox` already reads:

- `SandboxStore`: the record of which provider sandbox (and snapshot) to resume
  for a given key. Durable, shared across instances.
- `LockStore`: mutual exclusion around resume-or-create, so two runs for the
  same thread don't both create a sandbox. Across instances this has to be a
  distributed lock.

## Add the middleware

`withSandboxPersistence({ store, locks? })` hands a durable store (and an
optional distributed lock) to `withSandbox`. Put it before `withSandbox` in the
chain:

```ts
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import { withSandbox, withSandboxPersistence } from '@tanstack/ai-sandbox'
import { sandbox } from './sandbox'
import { messages } from './chat-context'
import { sandboxStore } from './sandbox-store'

chat({
  adapter: grokBuildText('grok-build'),
  messages,
  middleware: [
    withSandboxPersistence({ store: sandboxStore }),
    withSandbox(sandbox),
  ],
})
```

With a durable `store` and `reuse: 'thread'` (the default), the first run
creates and records the sandbox. A later run for the same `threadId` resumes it,
even on a different instance.

`locks` is optional. Leave it off and `withSandbox` uses an in-process lock,
which is correct on a single instance. For more than one instance, pass a
distributed lock (see [Cloudflare](#cloudflare-edge) below).

> Already running chat persistence? The lock is the same shared `'locks'`
> capability. A `withPersistence({ stores: { locks } })` in the chain provides
> it, and `withSandbox` picks it up on its own. Pass `locks` to
> `withSandboxPersistence` only when the sandbox runs without chat persistence.

## Pick a store

You build `sandboxStore` from one of the
[persistence backends](../persistence/sql-backends). Each one exposes a durable
`SandboxStore` next to its chat stores. The `sandboxes` table (or model) ships
in the same schema and migration bundle, so migrating for chat persistence
creates it too.

### SQLite / Drizzle (Node)

On Node, `sqlitePersistence` opens the database and exposes it as `db`; pass
that to `createDrizzleSandboxStore`:

```ts
import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'
import { createDrizzleSandboxStore } from '@tanstack/ai-persistence-drizzle'

const persistence = sqlitePersistence({ url: './state.db', migrate: true })
export const sandboxStore = createDrizzleSandboxStore(persistence.db)
```

Have your own Drizzle SQLite database (libsql, better-sqlite3, D1)? Pass it
straight to `createDrizzleSandboxStore(db)`.

### Prisma

Point `createPrismaSandboxStore` at a migrated `PrismaClient` whose schema
includes the `Sandbox` model from the [Prisma fragment](../persistence/prisma):

```ts
import { createPrismaSandboxStore } from '@tanstack/ai-persistence-prisma'
import { prisma } from './prisma'

export const sandboxStore = createPrismaSandboxStore(prisma)
```

Renamed the model in your copy of the fragment? Pass the client accessor name:
`createPrismaSandboxStore(prisma, { model: 'agentSandbox' })`.

### Cloudflare (edge)

At the edge every run can hit a different isolate, so the distributed lock earns
its keep. `createD1SandboxStore` keeps the record in D1, and
`createDurableObjectLockStore` (a lease-backed
[Durable Object](../persistence/cloudflare) lock) serializes resume-or-create
across isolates:

```ts
import {
  createD1SandboxStore,
  createDurableObjectLockStore,
} from '@tanstack/ai-persistence-cloudflare'
import { env } from './env'

export const sandboxStore = createD1SandboxStore(env.DB)
export const sandboxLocks = createDurableObjectLockStore(env.SANDBOX_LOCKS)
```

```ts
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import { withSandbox, withSandboxPersistence } from '@tanstack/ai-sandbox'
import { sandbox } from './sandbox'
import { messages } from './chat-context'
import { sandboxStore, sandboxLocks } from './sandbox-store'

chat({
  adapter: grokBuildText('grok-build'),
  messages,
  middleware: [
    withSandboxPersistence({ store: sandboxStore, locks: sandboxLocks }),
    withSandbox(sandbox),
  ],
})
```

Bind the lock's Durable Object the same way as for
[chat-persistence locks](../persistence/cloudflare): re-export
`CloudflareLockDurableObject` from your Worker entry and add the namespace
binding in `wrangler.toml`. Apply D1 migrations with `d1Migrations` as usual;
they already include the `sandboxes` table.

## Write your own store

A `SandboxStore` is three methods: `get`, `upsert`, `delete`. Build one over any
backend and hold it to the same contract the built-in stores pass, with the
`runSandboxStoreConformance` suite from `@tanstack/ai-sandbox/testkit`:

```ts
import { runSandboxStoreConformance } from '@tanstack/ai-sandbox/testkit'
import { createMySandboxStore } from './my-sandbox-store'

runSandboxStoreConformance('my-store', () => createMySandboxStore())
```
