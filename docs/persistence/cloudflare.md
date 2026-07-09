---
title: Cloudflare Persistence
id: cloudflare
---

Run `chat()` in Workers and keep **state durability** on Cloudflare primitives.
D1 is SQLite-compatible, so the Drizzle D1 adapter satisfies the state store
contract directly — there is no dedicated first-party Cloudflare persistence
package. Point [`drizzlePersistence`](./drizzle) at a Drizzle D1 database and you
get messages, runs, interrupts, metadata, artifacts, and blobs backed by D1.

Delivery durability (replaying an in-flight stream after a disconnect) is a
separate transport concern — see [Delivery Durability](./delivery-durability).

## Bind D1 with drizzlePersistence

```ts ignore
import { drizzlePersistence } from '@tanstack/ai-persistence-drizzle'
import { drizzle } from 'drizzle-orm/d1'

interface Env {
  AI_D1: D1Database
}

export function persistence(env: Env) {
  // D1 is SQLite-compatible; the Drizzle D1 adapter is a BaseSQLiteDatabase and
  // is assignable to drizzlePersistence's `db`. Generate/apply migrations from
  // the exported `schema` with drizzle-kit (see the Drizzle guide).
  return drizzlePersistence(drizzle(env.AI_D1))
}
```

D1 backs every state store, including `stores.artifacts` (metadata rows) and
`stores.blobs` (byte payloads in a SQLite blob column). If you need generated
bytes in R2 instead of D1, keep run/message/artifact-index state in D1 and
implement an R2-backed blob store via [Custom Stores](./custom-stores).

For generated media hooks backed by artifact refs, see
[Generation Persistence](./generation-persistence). For sandbox workspace
checkpoints, see [Sandbox Persistence](./sandbox-persistence).

## Migrations

`drizzlePersistence` is bring-your-own: generate migrations from the exported
`schema` with drizzle-kit and apply them to D1 (`wrangler d1 migrations`). Unlike
the batteries-included `sqlPersistence` (Node SQLite only), the D1 path does not
bundle migrations — you own the D1 schema lifecycle. See the
[Drizzle guide](./drizzle) for the schema export and the drizzle-kit flow.

## Locks

The state backends ship an in-memory lock as a dev default. For cross-isolate
mutual exclusion in Workers (sandbox resume, workflow coordination), provide a
Durable Object–backed lock store that implements the `LockStore` contract and
pass it as `stores.locks` via [Custom Stores](./custom-stores). Bind the Durable
Object class in your Worker config as usual.

For the state store method contracts, see
[Persistence Internals](./internals).
