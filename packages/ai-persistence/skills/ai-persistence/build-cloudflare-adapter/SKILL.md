---
name: ai-persistence/build-cloudflare-adapter
description: Use when a Cloudflare Worker needs TanStack AI chat persistence — writes a chat-persistence.ts into the app against its D1 binding (raw or via Drizzle), plus a Durable Object LockStore. Covers per-request bindings, wrangler config, D1 migrations, and lease-based locks.
---

# Cloudflare Chat Persistence

The deliverable is **one file in the Worker** — `src/lib/chat-persistence.ts` —
exporting a factory that builds a `ChatPersistence` from the request's D1
binding, plus (when the app needs coordination) a Durable Object lock store.
Tables go into the app's existing `migrations/` directory and are applied with
`wrangler d1 migrations apply`.

Do not create a package or a migration runner. Wrangler already tracks applied
migrations; a second bookkeeping table only creates drift.

Read the **Build Your Own Adapter** guide
(`docs/persistence/build-your-own-adapter.md`) for the store contracts, and
**ai-persistence/stores** for the shape rules. This skill covers only
the Cloudflare-specific parts.

## 1. Read the app before writing anything

| Find                   | Where to look                                                                                    | What it decides                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| D1 binding name        | `wrangler.jsonc` `d1_databases[].binding`                                                        | `env.DB` vs `env.AI_STATE` in the factory         |
| How `env` reaches code | the Worker `fetch(request, env)`, or an async-local helper (`getDb()`, `getCloudflareContext()`) | Whether the factory takes `env` or reads a helper |
| Drizzle or raw D1      | `drizzle-orm` in `package.json`, a `src/db/schema.ts`                                            | Which recipe below to follow                      |
| Migrations dir         | `wrangler.jsonc` `migrations_dir`, default `migrations/`                                         | Where the new `.sql` file goes                    |
| Existing table names   | the current migrations / schema                                                                  | Prefix (`chat_*`) so nothing collides             |

## 2. Two independent pieces

```
D1 database      -> messages, runs, interrupts, metadata   (AIPersistence.stores)
Durable Object   -> LockStore                              (withLocks — NOT a store)
```

These do not compose into one object. `AIPersistence.stores` accepts exactly
four keys; putting `locks` in the map — or in a `composePersistence` override —
throws `Unknown AIPersistence store key: locks` and fails to type-check. Return
the state persistence from one factory and the lock store from another, then
wire them as two middlewares.

Most apps need only the first piece. Add the Durable Object when other
middleware genuinely needs mutual exclusion across isolates —
`InMemoryLockStore` gives none, because a Worker runs on many isolates at once.

## 3. Bindings are per-request

This is the one rule that separates Cloudflare from every other backend. A D1
binding does not exist at module scope, so `chat-persistence.ts` **must export a
factory**, not a const:

```ts ignore
import { defineAIPersistence } from '@tanstack/ai-persistence'
import type { ChatPersistence } from '@tanstack/ai-persistence'

/** Call inside a request handler — `env` is not available at module scope. */
export function chatPersistence(d1: D1Database): ChatPersistence {
  return defineAIPersistence({
    stores: {
      messages: createMessageStore(d1),
      runs: createRunStore(d1),
      interrupts: createInterruptStore(d1),
      metadata: createMetadataStore(d1),
    },
  })
}
```

Annotate `ChatPersistence` — bare `AIPersistence` is the all-optional bag and
`withPersistence` rejects it. Building it per request is cheap: the stores hold
no state beyond the binding.

## 4. The stores

Two routes, same invariants:

- **Drizzle over D1** — if the app already runs Drizzle, wrap the binding with
  `drizzle(env.DB, { schema })` and follow
  **ai-persistence/build-drizzle-adapter** verbatim (its "if `db` is
  per-request" section is exactly this case). Stop reading here.
- **Raw D1** — implement the four stores against `d1.prepare(sql).bind(...)`:
  `.first()` for `get`, `.all()` for `list*`, `.run()` for writes. D1 speaks
  SQLite, so this mirrors the `node:sqlite` walkthrough in the guide one-for-one;
  everything is already async, so no `Promise.resolve` wrapping.

The invariants are the whole game, whichever route you take:

| Store        | Rule                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `messages`   | `saveThread` is a full replace (`INSERT … ON CONFLICT(thread_id) DO UPDATE`)                                      |
| `runs`       | `createOrResume` reads first, else `INSERT … ON CONFLICT DO NOTHING`, then re-reads                               |
| `runs`       | `update` on an unknown id is a silent no-op — never throws, never inserts                                         |
| `runs`       | `findActiveRun` returns the latest `'running'` run for the thread, else null — required for reload/switch tailing |
| `interrupts` | `create` is insert-if-absent; never clobber a resolved interrupt back to pending                                  |
| `interrupts` | every `list*` ends `ORDER BY requested_at ASC`                                                                    |
| `metadata`   | reject nullish `set` with a clear `TypeError`; tell callers to use `delete`                                       |

Row mappers omit absent optionals (`...(row.error != null ? { error: row.error } : {})`)
so records compare cleanly against the reference in-memory backend. JSON columns
are `text` — `JSON.parse` on read, `JSON.stringify` on write. Timestamps are
`integer` epoch ms.

## 5. The migration

Write the tables into the app's `migrations/` directory as a new numbered file:

```sql
CREATE TABLE IF NOT EXISTS chat_threads (
  thread_id text PRIMARY KEY NOT NULL,
  messages_json text NOT NULL,
  updated_at integer NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_runs (
  run_id text PRIMARY KEY NOT NULL,
  thread_id text NOT NULL,
  status text NOT NULL,
  started_at integer NOT NULL,
  finished_at integer,
  error text,
  usage_json text
);
CREATE INDEX IF NOT EXISTS chat_runs_thread_status ON chat_runs (thread_id, status);
CREATE TABLE IF NOT EXISTS chat_interrupts (
  interrupt_id text PRIMARY KEY NOT NULL,
  run_id text NOT NULL,
  thread_id text NOT NULL,
  status text NOT NULL,
  requested_at integer NOT NULL,
  resolved_at integer,
  payload_json text NOT NULL,
  response_json text
);
CREATE INDEX IF NOT EXISTS chat_interrupts_thread ON chat_interrupts (thread_id, requested_at);
CREATE TABLE IF NOT EXISTS chat_metadata (
  namespace text NOT NULL,
  key text NOT NULL,
  value_json text NOT NULL,
  PRIMARY KEY (namespace, key)
);
```

Apply with `wrangler d1 migrations apply <database-name>` (`--local` first, then
`--remote`). If the app also uses Drizzle, generate this file with
`drizzle-kit generate` instead of hand-writing it — the SQL and the Drizzle
table definitions must agree, so let one of them own the other.

## 6. Wire it into the chat route

```ts ignore
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withPersistence } from '@tanstack/ai-persistence'
import { chatPersistence } from './lib/chat-persistence'

export default {
  async fetch(request: Request, env: Env) {
    const params = await chatParamsFromRequest(request)
    const stream = chat({
      adapter: openaiText('gpt-5.5'),
      messages: params.messages,
      threadId: params.threadId,
      runId: params.runId,
      ...(params.resume ? { resume: params.resume } : {}),
      middleware: [withPersistence(chatPersistence(env.DB))],
    })
    return toServerSentEventsResponse(stream)
  },
}
```

`threadId` is a bare string to the stores. **Authorize thread access at the
route** — derive the user from the session, never trust a client-supplied id.

## 7. Durable Object lock store (only if needed)

Implement `LockStore` from `@tanstack/ai/locks`. `withLock(key, fn)`
routes each key to a Durable Object instance (`idFromName(key)`) that serializes
owners. Use **leases** so a crashed owner cannot block forever: the DO grants a
lease with an expiry, an alarm reclaims it, and the lock passes the callback an
`AbortSignal` that fires when ownership can no longer be guaranteed. Callbacks
must stop starting external mutations once the signal aborts.

Export the DO class from the Worker entry so wrangler can bind it:

```ts ignore
export { ChatLockDurableObject } from './locks'
```

Then wire both middlewares:

```ts ignore
import { withLocks } from '@tanstack/ai/locks'
import { withPersistence } from '@tanstack/ai-persistence'

const middleware = [
  withPersistence(chatPersistence(env.AI_STATE)),
  withLocks(createDurableObjectLockStore(env.AI_LOCKS)),
]
```

## wrangler bindings

```jsonc
{
  "d1_databases": [
    {
      "binding": "AI_STATE",
      "database_name": "tanstack-ai-state",
      "database_id": "<id>",
      "migrations_dir": "migrations",
    },
  ],
  "durable_objects": {
    "bindings": [{ "name": "AI_LOCKS", "class_name": "ChatLockDurableObject" }],
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["ChatLockDurableObject"] },
  ],
}
```

Durable Object locks do not use the D1 table migration set; their state is
configured through the migration tags above.

## Verify

```ts ignore
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { env } from 'cloudflare:test'
import { chatPersistence } from '../src/lib/chat-persistence'

runPersistenceConformance('app-d1', () => chatPersistence(env.AI_STATE), {
  skip: ['generationRuns', 'artifacts', 'blobs'],
})
```

Run it against a Miniflare D1 binding with the migration applied, reset between
runs. All four state stores are provided; the suite also covers the three
generation stores, so a chat-only adapter declares them skipped (drop the `skip`
once you add the R2-backed set from
**ai-persistence/build-cloudflare-artifact-store**). `skip` never accepts
`'locks'`, which is not a store.

The lock store needs its **own** tests, because nothing in the conformance suite
touches it. Cover at minimum: two concurrent `withLock` calls on the same key
serialize; different keys do not block each other; a lease that expires aborts
the signal handed to the critical section; and a callback that throws still
releases the lock.

## Only if you are publishing this as a package

For a reusable npm adapter rather than a file in the app: peer-dep
`@cloudflare/workers-types >=4.x`, and prepend
`/// <reference types="@cloudflare/workers-types" />` to the generated
`index.d.ts` so consumers get the D1/DurableObject types. Emit the table SQL
into the consumer's `migrations/` directory rather than shipping a runner, and
if you offer both raw-D1 and Drizzle paths, guard with a test that the emitted
SQL and the Drizzle tables describe the same schema.
