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

| Record    | Key                | Fields                                                                                                                                    |
| --------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| thread    | `threadId`         | `messages` (array, full transcript)                                                                                                       |
| run       | `runId`            | `threadId`, `status`, `startedAt`, `finishedAt?`, `error?`, `usage?`, `sandboxKey?`, `detachedSince?`, `cancelRequested?`, `driverEpoch?` |
| interrupt | `interruptId`      | `runId`, `threadId`, `status`, `requestedAt`, `resolvedAt?`, `payload`, `response?`                                                       |
| metadata  | `(namespace, key)` | `value`                                                                                                                                   |

- Timestamps are **epoch milliseconds** (`number`) in records. Store them
  however the engine prefers and convert in the mapper.
- `(namespace, key)` is a **composite** key. Never join with a separator —
  `('a:b','c')` and `('a','b:c')` must stay distinct records, and the
  conformance suite checks it.
- Index `runs(threadId, status)`, `runs(threadId, startedAt)`, and
  `interrupts(threadId, requestedAt)` for the listing paths. If the backend
  implements `listReclaimable`, also index `runs(status, detachedSince)`; that
  is the query it runs.
- `run.error` is a structured `RunError` (`{ message: string, code?: string }`),
  not a bare string. `message` is the provider's prose; `code` is the stable,
  machine-branchable classification an operator filters and groups by. In a
  SQL-backed table, store it as two columns (`error`, `error_code`) rather than
  one JSON blob, moved together in `update` so a later code-less failure can
  never leave a stale `code` from an earlier one behind. `run.status` is one of
  `'running' | 'interrupted' | 'completed' | 'failed' | 'aborted'`;
  `'interrupted'` is a pause, not terminal, and only
  `'completed' | 'failed' | 'aborted'` are terminal.
- Extra app-owned columns are fine (a `userId`, audit columns) as long as they
  are nullable or defaulted. The stores never read columns they do not know
  about.

## 3. The invariants

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
5. **`runs.update` distinguishes "field omitted" from "field explicitly
   cleared" for the durable-run fields** (`sandboxKey`, `detachedSince`,
   `cancelRequested`, `driverEpoch`). A reattach clears `detachedSince` by
   passing it explicitly as `undefined` — `update(runId, { detachedSince: undefined })`
   — and that must write `NULL`, not be silently dropped. Check
   `'detachedSince' in patch`, never `patch.detachedSince !== undefined`; the
   latter cannot tell a clear from an omission and leaves every reattached run
   looking permanently detached to the reaper. Same rule for
   `cancelRequested` (`false` is a real value, not "unset") and for
   `sandboxKey` / `driverEpoch`. See
   `examples/ts-react-chat/src/lib/sqlite-persistence.ts` for the pattern.
6. **`interrupts.create` is insert-if-absent** — never clobber a resolved
   interrupt back to pending. Every `list*` is ordered by `requestedAt`
   ascending.
7. **`runs.listReclaimable` uses an inclusive cutoff** (if implemented):
   `status === 'running' AND detachedSince <= now - ttlMs`. It is a query, not
   automatic reclamation: `reapDetachedRuns` from `@tanstack/ai-sandbox` is the
   sweep that consumes it, and the application schedules that sweep. A store
   without this method cannot be reaped. `runs.findActiveRun` is required;
   `runs.listByThread` / `runs.listReclaimable` are optional: implement only
   what the app needs and leave the rest off the object.

Row mappers omit absent optionals
(`...(row.sandbox_key != null ? { sandboxKey: row.sandbox_key } : {})`) so
records compare cleanly against the reference in-memory backend. For a
two-column `error`/`error_code` layout, the mapper is
`...(row.error != null ? { error: { message: row.error, ...(row.error_code != null ? { code: row.error_code } : {}) } } : {})`.

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
    // ... update (no-op on unknown id; sandboxKey/detachedSince/
    // cancelRequested/driverEpoch are checked with `'field' in patch`, not
    // `patch.field !== undefined`, so an explicit `undefined` (a clear) still
    // writes NULL instead of being silently dropped — status/finishedAt/usage
    // can use the simpler `!== undefined` check since they are never
    // explicitly cleared; writes patch.error as two columns,
    // error = patch.error.message and error_code = patch.error.code ?? null,
    // together in the same call),
    // findActiveRun (latest 'running', required), listByThread (ascending
    // by startedAt, optional), listReclaimable (status = 'running' AND
    // detachedSince <= now - ttlMs, inclusive cutoff, optional)
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
(`threadId`, `runId`, `interruptId`). For `metadata`, use `_id: { namespace, key }`
— a compound `_id` subdocument, or a unique index on `{ namespace, key }` — never
a delimiter-joined string. Invariant: `('a:b','c')` and `('a','b:c')` must stay
distinct records, and the conformance suite checks it.
`createOrResume` is `updateOne({ _id }, { $setOnInsert: doc }, { upsert: true })`
then a `findOne` — `$setOnInsert` is the insert-if-absent primitive. Guard the
`E11000` duplicate-key race and re-read. `list*` need `.sort({ requestedAt: 1 })`.

**Redis / Upstash** — workable for `metadata` and excellent for `LockStore`, but
think before putting `interrupts` there: the listings need ordered secondary
indexes you have to maintain by hand (a sorted set per thread and per run,
scored by `requestedAt`). A common split is Postgres for `messages`/`runs`/
`interrupts` and Redis for locks; compose them with `composePersistence`.

**Anything else** — you only need the seven invariants above. The core never
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

runPersistenceConformance('app-custom', () => chatPersistence, {
  skip: ['generationRuns', 'artifacts', 'blobs'],
})
```

Point it at a throwaway database and reset between runs. The suite covers all
seven stores, so declare every intentional omission — a chat adapter skips the
generation half above, and adds e.g. `'metadata'` if it drops that too. `skip`
never accepts `'locks'`, which is not a store.

If your recipe leaves an optional `runs` method (`listByThread`/
`listReclaimable`) unimplemented, declare it separately with `skipMethods`, e.g.
`{ skipMethods: ['runs.listByThread'] }`. An omitted method that is not declared
fails the suite instead of silently passing. `findActiveRun` is **not** in that
set — it is required, so there is nothing to declare.
