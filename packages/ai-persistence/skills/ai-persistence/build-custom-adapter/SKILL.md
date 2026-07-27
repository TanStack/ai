---
name: ai-persistence/build-custom-adapter
description: Use when an app needs TanStack AI chat persistence on a database with no dedicated recipe — raw Postgres (pg/postgres.js), Kysely, node:sqlite, MongoDB, Supabase, Redis. Writes a chat-persistence.ts against the app's existing client, covering the four stores, the idempotency invariants, and the conformance gate. Route to the Drizzle, Prisma, or Cloudflare skills instead when one of those matches.
---

# Custom Chat Persistence

The deliverable is **one file in the app** — `src/lib/chat-persistence.ts` —
exporting a `ChatPersistence` built from the database client the app already
has. Plus whatever DDL that database needs, added through the app's existing
migration flow.

Do not create a package, a second client, or a migration runner.

**Route first.** If the app already runs one of these, stop and use that skill —
it has the driver-specific code:

| App runs                  | Use                                     |
| ------------------------- | --------------------------------------- |
| Drizzle ORM (any dialect) | ai-persistence/build-drizzle-adapter    |
| Prisma                    | ai-persistence/build-prisma-adapter     |
| Cloudflare Workers + D1   | ai-persistence/build-cloudflare-adapter |

Everything else lands here. The full contracts and their invariants are in
**ai-persistence/stores**; the complete worked `node:sqlite` walkthrough
is `docs/persistence/build-your-own-adapter.md` and
`examples/ts-react-chat/src/lib/sqlite-persistence.ts`.

## 1. Read the app before writing anything

| Find               | Where to look                                                 | What it decides                                        |
| ------------------ | ------------------------------------------------------------- | ------------------------------------------------------ |
| The client         | `src/db.ts`, `src/lib/db.ts`, `src/server/db.ts`              | What the file imports — never construct a second pool  |
| Client lifetime    | module singleton vs per-request factory (`getDb()`, bindings) | `export const chatPersistence` vs `export function`    |
| Migration flow     | `migrations/`, `drizzle/`, `supabase/migrations/`, an ORM CLI | How the DDL gets applied — use theirs, add nothing new |
| Naming conventions | existing tables/collections                                   | Prefix (`chat_*`) so nothing collides                  |
| JSON support       | `jsonb` (Postgres), `json` (MySQL 5.7+), text (SQLite)        | Whether mappers stringify/parse                        |
| Import alias       | `tsconfig.json` `paths`                                       | `@/db`, `~/db`, `#/db`, or a relative path             |

## 2. Shape the storage

Four logical records. Whatever the engine, keep these keys — the store methods
look records up by exactly these:

| Record    | Key                | Fields                                                                              |
| --------- | ------------------ | ----------------------------------------------------------------------------------- |
| thread    | `threadId`         | `messages` (array, full transcript)                                                 |
| run       | `runId`            | `threadId`, `status`, `startedAt`, `finishedAt?`, `error?`, `usage?`                |
| interrupt | `interruptId`      | `runId`, `threadId`, `status`, `requestedAt`, `resolvedAt?`, `payload`, `response?` |
| metadata  | `(namespace, key)` | `value`                                                                             |

- Timestamps are **epoch milliseconds** (`number`) in records. Store them
  however the engine prefers and convert in the mapper.
- `(namespace, key)` is a **composite** key. Never join with a separator —
  `('a:b','c')` and `('a','b:c')` must stay distinct records, and the
  conformance suite checks it.
- Index `runs(threadId, status)` and `interrupts(threadId, requestedAt)` — those
  are the two listing paths.
- Extra app-owned columns are fine (a `userId`, audit columns) as long as they
  are nullable or defaulted. The stores never read columns they do not know
  about.

## 3. The five invariants

Getting one of these wrong is the usual source of stuck approvals and wiped
history. They are engine-independent:

1. **`saveThread` is a full overwrite**, never an append. The argument is the
   complete authoritative transcript.
2. **`loadThread` returns `[]`** for an unknown thread, never `null`.
3. **`createOrResume` is insert-if-absent** — an existing `runId` comes back
   _unchanged_, ignoring the new field values. Resume and double-submit depend
   on it. After a racy insert, re-read rather than trusting your own write.
4. **`runs.update` on an unknown id is a silent no-op** — it must not throw and
   must not insert. (Drivers that throw on zero rows affected need the
   `updateMany`-style call, not the `update`-one-or-throw call.)
5. **`interrupts.create` is insert-if-absent** — never clobber a resolved
   interrupt back to pending. Every `list*` is ordered by `requestedAt`
   ascending.

Row mappers omit absent optionals
(`...(row.error != null ? { error: row.error } : {})`) so records compare
cleanly against the reference in-memory backend.

## 4. Write `src/lib/chat-persistence.ts`

Four factories and one assembly. Postgres via `pg` shown here; the shape is the
same for any driver.

```ts ignore
import { defineAIPersistence } from '@tanstack/ai-persistence'
import type { Pool } from 'pg'
import type {
  ChatPersistence,
  MessageStore,
  RunStore,
} from '@tanstack/ai-persistence'

import { pool } from '@/db'

function createMessageStore(db: Pool): MessageStore {
  return {
    async loadThread(threadId) {
      const { rows } = await db.query(
        'SELECT messages_json FROM chat_threads WHERE thread_id = $1',
        [threadId],
      )
      return rows[0]?.messages_json ?? []
    },
    // Full overwrite — `messages` is the complete authoritative transcript.
    async saveThread(threadId, messages) {
      await db.query(
        `INSERT INTO chat_threads (thread_id, messages_json, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (thread_id)
         DO UPDATE SET messages_json = EXCLUDED.messages_json,
                       updated_at = EXCLUDED.updated_at`,
        [threadId, JSON.stringify(messages), Date.now()],
      )
    },
  }
}

function createRunStore(db: Pool): RunStore {
  async function get(runId: string) {
    const { rows } = await db.query(
      'SELECT * FROM chat_runs WHERE run_id = $1',
      [runId],
    )
    return rows[0] ? mapRun(rows[0]) : null
  }

  return {
    get,
    // Idempotent: an existing runId is returned untouched.
    async createOrResume({ runId, threadId, startedAt, status }) {
      const existing = await get(runId)
      if (existing) return existing

      await db.query(
        `INSERT INTO chat_runs (run_id, thread_id, status, started_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (run_id) DO NOTHING`,
        [runId, threadId, status ?? 'running', startedAt],
      )
      // Re-read: a concurrent createOrResume may have won the race, and that
      // row is the authoritative one.
      const stored = await get(runId)
      return (
        stored ?? { runId, threadId, status: status ?? 'running', startedAt }
      )
    },
    // ... update (no-op on unknown id), findActiveRun (latest 'running')
  }
}

/** The four chat state stores backed by the app's database. */
export const chatPersistence: ChatPersistence = defineAIPersistence({
  stores: {
    messages: createMessageStore(pool),
    runs: createRunStore(pool),
    interrupts: createInterruptStore(pool),
    metadata: createMetadataStore(pool),
  },
})
```

Annotate `ChatPersistence` — bare `AIPersistence` is the all-optional bag and
`withPersistence` rejects it. There is no `locks` store: `stores` accepts only
`messages`, `runs`, `interrupts`, `metadata`, and anything else throws
`Unknown AIPersistence store key`. Coordination is wired separately with
`withLocks` (see **ai-core/locks**).

If the client is per-request (Workers bindings, request-scoped transactions),
export a `chatPersistence()` factory instead of a const and call it inside the
handler.

## Engine notes

**Postgres (`pg`, `postgres.js`, Neon, Supabase)** — `jsonb` columns round-trip
objects, so skip the `JSON.stringify` on read paths (`pg` parses `jsonb` for
you; check what the driver returns before assuming). `bigint` columns come back
as strings in `pg` — use `bigint` with an explicit `Number()` in the mapper, or
store epoch ms in a `double precision`/`bigint` and convert once. Composite key
is `PRIMARY KEY (namespace, key)`.

**Kysely** — define the four tables in the app's `Database` interface, then the
stores are `db.insertInto('chat_runs').values(...).onConflict((oc) => oc.column('run_id').doNothing())`
and `.executeTakeFirst()`. `updateTable(...).execute()` is already a no-op on
zero matches, so invariant 4 comes free.

**node:sqlite / better-sqlite3** — the complete implementation is in the guide
and in `examples/ts-react-chat/src/lib/sqlite-persistence.ts`. Prepared
statements at factory scope, `INSERT ... ON CONFLICT`, JSON as `text`, epoch ms
as `integer`. Wrap sync calls in `async` methods; the contracts are promise-based.

**MongoDB** — one collection per record type, `_id` set to the natural key
(`threadId`, `runId`, `interruptId`, and `` `${namespace}�${key}` `` or a
compound unique index on `{ namespace, key }` — never a `:`-joined string).
`createOrResume` is `updateOne({ _id }, { $setOnInsert: doc }, { upsert: true })`
then a `findOne` — `$setOnInsert` is the insert-if-absent primitive. Guard the
`E11000` duplicate-key race and re-read. `list*` need `.sort({ requestedAt: 1 })`.

**Redis / Upstash** — workable for `metadata` and excellent for `LockStore`, but
think before putting `interrupts` there: the listings need ordered secondary
indexes you have to maintain by hand (a sorted set per thread and per run,
scored by `requestedAt`). A common split is Postgres for `messages`/`runs`/
`interrupts` and Redis for locks; compose them with `composePersistence`.

**Anything else** — you only need the five invariants above. The core never
inspects your storage.

## Adopt part of it

You rarely need all four stores at once. Implement what you own and fill the
rest from another base:

```ts ignore
import { composePersistence, memoryPersistence } from '@tanstack/ai-persistence'
import { messages, runs } from './my-stores'

export const chatPersistence = composePersistence(memoryPersistence(), {
  overrides: { messages, runs },
})
```

Only listed keys move. There is **no cross-store transaction** — if `messages`
lives in Postgres and `interrupts` in Redis, a write touching both is two
writes. The idempotency invariants are exactly what make those retries safe.

## Wire it into the chat route

```ts ignore
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withPersistence } from '@tanstack/ai-persistence'
import { chatPersistence } from '@/lib/chat-persistence'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.resume ? { resume: params.resume } : {}),
    middleware: [withPersistence(chatPersistence)],
  })
  return toServerSentEventsResponse(stream)
}
```

`threadId` is a bare string to the stores. **Authorize thread access at the
route** — derive the user from the session, never trust a client-supplied id.

## Verify (required)

This matters more here than anywhere else: there is no reference driver to
compare against, so the testkit is the only thing standing between a subtle
idempotency bug and stuck approvals in production.

```ts ignore
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { chatPersistence } from '../src/lib/chat-persistence'

runPersistenceConformance('app-custom', () => chatPersistence)
```

Point it at a throwaway database and reset between runs. Declare intentional
omissions with `skip: ['metadata']` — it accepts only
`'messages' | 'runs' | 'interrupts' | 'metadata'`, never `'locks'`, which is not
a state store.
