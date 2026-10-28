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

**Always write all four tables (or collections) and all four stores: thread, run, interrupt,
metadata.** The docs call `interrupts` and `metadata` optional for a
hand-rolled adapter; this recipe is not that case. `withPersistence` needs
all four to type-check as `ChatPersistence`, and the conformance suite fails
without them. Do not stop at a thread table and a run table.

**Route first.** If the app already runs one of these, stop and use that skill —
it has the driver-specific code:

| App runs                  | Use                                     |
| ------------------------- | --------------------------------------- |
| Drizzle ORM (any dialect) | ai-persistence/build-drizzle-adapter    |
| Prisma                    | ai-persistence/build-prisma-adapter     |
| Cloudflare Workers + D1   | ai-persistence/build-cloudflare-adapter |

Everything else lands here. The full contracts and their invariants are in
**ai-persistence/stores** and `docs/persistence/store-reference.md`; the
complete worked `node:sqlite` walkthrough is
`docs/persistence/build-your-own-chat-adapter.md` and
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

| Record    | Key                | Fields                                                                                                                                                                               |
| --------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| thread    | `threadId`         | `messages` (array, full transcript)                                                                                                                                                  |
| run       | `runId`            | `threadId`, `status`, `startedAt`, `finishedAt?`, `error?`, `usage?`, `parentRunId?`, `subagentRunId?`, `name?`, `sandboxKey?`, `detachedSince?`, `cancelRequested?`, `driverEpoch?` |
| interrupt | `interruptId`      | `runId`, `threadId`, `status`, `requestedAt`, `resolvedAt?`, `payload`, `response?`                                                                                                  |
| metadata  | `(namespace, key)` | `value`                                                                                                                                                                              |

- Timestamps are **epoch milliseconds** (`number`) in records. Store them
  however the engine prefers and convert in the mapper.
- `(namespace, key)` is a **composite** key. Never join with a separator —
  `('a:b','c')` and `('a','b:c')` must stay distinct records, and the
  conformance suite checks it.
- Index `runs(threadId, status)`, `runs(threadId, startedAt)`, and
  `interrupts(threadId, requestedAt)` for the listing paths. If the backend
  implements `listReclaimable`, also index `runs(status, detachedSince)`. If it
  implements `listByParentRun`, also index `runs(parentRunId, startedAt)`.
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
   `runs.listByThread`, `runs.listByParentRun`, and `runs.listReclaimable` are
   optional: implement only what the app needs and leave the rest off the object.
   `listByParentRun` returns the child runs for one `parentRunId`, oldest
   `startedAt` first. `reconstructChat` uses that list to put subagent cards
   back. `createOrResume` copies `parentRunId`, `subagentRunId`, and `name` on
   the first insert and leaves them unchanged on resume.

Row mappers omit absent optionals
(`...(row.sandbox_key != null ? { sandboxKey: row.sandbox_key } : {})`) so
records compare cleanly against the reference in-memory backend. For a
two-column `error`/`error_code` layout, the mapper is
`...(row.error != null ? { error: { message: row.error, ...(row.error_code != null ? { code: row.error_code } : {}) } } : {})`.

## 4. Write `src/lib/chat-persistence.ts`

Four factories and one assembly. Postgres via `pg` shown here; the shape is the
same for any driver.

<!-- fence: custom-chat-persistence -->

```ts
import { defineAIPersistence } from '@tanstack/ai-persistence'
import type { QueryResultRow } from 'pg'
import type { Pool } from 'pg'
import type { ModelMessage, TokenUsage } from '@tanstack/ai'
import type {
  ChatPersistence,
  InterruptRecord,
  InterruptStatus,
  InterruptStore,
  MessageStore,
  MetadataStore,
  RunRecord,
  RunStatus,
  RunStore,
} from '@tanstack/ai-persistence'

import { pool } from '@/db'

type SqlParam = string | number | boolean | null

const RUN_STATUSES: ReadonlyArray<RunStatus> = [
  'running',
  'interrupted',
  'completed',
  'failed',
  'aborted',
]
const INTERRUPT_STATUSES: ReadonlyArray<InterruptStatus> = [
  'pending',
  'resolved',
  'cancelled',
]

function toRunStatus(value: string): RunStatus {
  const status = RUN_STATUSES.find((candidate) => candidate === value)
  if (!status) throw new Error(`Unknown run status: ${value}`)
  return status
}

function toInterruptStatus(value: string): InterruptStatus {
  const status = INTERRUPT_STATUSES.find((candidate) => candidate === value)
  if (!status) throw new Error(`Unknown interrupt status: ${value}`)
  return status
}

function epochMs(value: string | number): number {
  return typeof value === 'number' ? value : Number(value)
}

// `pg` parses jsonb into a value, so a JSON string is already a string.
// A text column still holds JSON source (`{`, `[`, or a quoted string).
// Re-encode a decoded string before parsing: JSON.parse("left") throws.
function readJson<T>(value: T | string): T {
  if (typeof value !== 'string') return value
  const first = value.trimStart()[0]
  const source =
    first === '{' || first === '[' || first === '"'
      ? value
      : JSON.stringify(value)
  return JSON.parse(source)
}

interface ThreadRow extends QueryResultRow {
  messages_json: Array<ModelMessage> | string
}

interface RunRow extends QueryResultRow {
  run_id: string
  thread_id: string
  status: string
  started_at: string | number
  finished_at: string | number | null
  error: string | null
  error_code: string | null
  usage_json: TokenUsage | string | null
  sandbox_key: string | null
  detached_since: string | number | null
  cancel_requested: boolean | null
  driver_epoch: number | null
  parent_run_id: string | null
  subagent_run_id: string | null
  name: string | null
}

interface InterruptRow extends QueryResultRow {
  interrupt_id: string
  run_id: string
  thread_id: string
  status: string
  requested_at: string | number
  resolved_at: string | number | null
  payload_json: Record<string, unknown> | string
  response_json: unknown
}

interface MetadataRow extends QueryResultRow {
  value_json: unknown
}

async function rowsOf<T extends QueryResultRow>(
  db: Pool,
  sql: string,
  params: Array<SqlParam> = [],
): Promise<Array<T>> {
  const result = await db.query<T>(sql, params)
  return result.rows
}

function mapRun(row: RunRow): RunRecord {
  return {
    runId: row.run_id,
    threadId: row.thread_id,
    status: toRunStatus(row.status),
    startedAt: epochMs(row.started_at),
    ...(row.finished_at != null
      ? { finishedAt: epochMs(row.finished_at) }
      : {}),
    ...(row.error != null
      ? {
          error: {
            message: row.error,
            ...(row.error_code != null ? { code: row.error_code } : {}),
          },
        }
      : {}),
    ...(row.usage_json != null ? { usage: readJson(row.usage_json) } : {}),
    ...(row.sandbox_key != null ? { sandboxKey: row.sandbox_key } : {}),
    ...(row.detached_since != null
      ? { detachedSince: epochMs(row.detached_since) }
      : {}),
    ...(row.cancel_requested != null
      ? { cancelRequested: row.cancel_requested }
      : {}),
    ...(row.driver_epoch != null ? { driverEpoch: row.driver_epoch } : {}),
    ...(row.parent_run_id != null ? { parentRunId: row.parent_run_id } : {}),
    ...(row.subagent_run_id != null
      ? { subagentRunId: row.subagent_run_id }
      : {}),
    ...(row.name != null ? { name: row.name } : {}),
  }
}

function mapInterrupt(row: InterruptRow): InterruptRecord {
  return {
    interruptId: row.interrupt_id,
    runId: row.run_id,
    threadId: row.thread_id,
    status: toInterruptStatus(row.status),
    requestedAt: epochMs(row.requested_at),
    payload: readJson(row.payload_json),
    ...(row.resolved_at != null
      ? { resolvedAt: epochMs(row.resolved_at) }
      : {}),
    ...(row.response_json != null
      ? { response: readJson(row.response_json) }
      : {}),
  }
}

function createMessageStore(db: Pool): MessageStore {
  return {
    async loadThread(threadId) {
      const rows = await rowsOf<ThreadRow>(
        db,
        'SELECT messages_json FROM chat_threads WHERE thread_id = $1',
        [threadId],
      )
      const row = rows[0]
      // Unknown thread is [], never null.
      return row ? readJson(row.messages_json) : []
    },
    // Full overwrite — `messages` is the complete authoritative transcript.
    async saveThread(threadId, messages) {
      await db.query(
        `INSERT INTO chat_threads (thread_id, messages_json, updated_at)
         VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (thread_id) DO UPDATE
         SET messages_json = EXCLUDED.messages_json,
             updated_at = EXCLUDED.updated_at`,
        [threadId, JSON.stringify(messages), Date.now()],
      )
    },
  }
}

function createRunStore(db: Pool): RunStore {
  async function get(runId: string) {
    const rows = await rowsOf<RunRow>(
      db,
      'SELECT * FROM chat_runs WHERE run_id = $1',
      [runId],
    )
    const row = rows[0]
    return row ? mapRun(row) : null
  }

  return {
    get,
    // Idempotent: an existing runId is returned untouched.
    async createOrResume(input) {
      const { runId, threadId, startedAt, status } = input
      const existing = await get(runId)
      if (existing) return existing

      await db.query(
        `INSERT INTO chat_runs (
           run_id, thread_id, status, started_at,
           parent_run_id, subagent_run_id, name
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (run_id) DO NOTHING`,
        [
          runId,
          threadId,
          status ?? 'running',
          startedAt,
          input.parentRunId ?? null,
          input.subagentRunId ?? null,
          input.name ?? null,
        ],
      )
      // Re-read: a concurrent createOrResume may have won the race, and that
      // row is the authoritative one.
      const stored = await get(runId)
      return (
        stored ?? {
          runId,
          threadId,
          status: status ?? 'running',
          startedAt,
          ...(input.parentRunId !== undefined
            ? { parentRunId: input.parentRunId }
            : {}),
          ...(input.subagentRunId !== undefined
            ? { subagentRunId: input.subagentRunId }
            : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
        }
      )
    },
    // Patching an unknown runId is a no-op: never throws, never inserts.
    async update(runId, patch) {
      const sets: Array<string> = []
      const params: Array<SqlParam> = []
      const set = (column: string, value: SqlParam, cast?: 'jsonb') => {
        params.push(value)
        const ref = cast ? `$${params.length}::${cast}` : `$${params.length}`
        sets.push(`${column} = ${ref}`)
      }
      if (patch.status !== undefined) set('status', patch.status)
      if (patch.finishedAt !== undefined) set('finished_at', patch.finishedAt)
      // Both columns move together, so a later code-less failure cannot
      // leave a stale error_code from an earlier one behind.
      if (patch.error !== undefined) {
        set('error', patch.error.message)
        set('error_code', patch.error.code ?? null)
      }
      if (patch.usage !== undefined) {
        set('usage_json', JSON.stringify(patch.usage), 'jsonb')
      }
      // The four durable-run fields use `'field' in patch`, NOT
      // `!== undefined`: a reattach clears `detachedSince` by passing it
      // explicitly as `undefined`, and that must still write NULL.
      if ('sandboxKey' in patch) set('sandbox_key', patch.sandboxKey ?? null)
      if ('detachedSince' in patch) {
        set('detached_since', patch.detachedSince ?? null)
      }
      if ('cancelRequested' in patch) {
        set('cancel_requested', patch.cancelRequested ?? null)
      }
      if ('driverEpoch' in patch) set('driver_epoch', patch.driverEpoch ?? null)
      if (sets.length === 0) return

      params.push(runId)
      await db.query(
        `UPDATE chat_runs SET ${sets.join(', ')} WHERE run_id = $${params.length}`,
        params,
      )
    },
    async findActiveRun(threadId) {
      const rows = await rowsOf<RunRow>(
        db,
        `SELECT * FROM chat_runs
         WHERE thread_id = $1 AND status = 'running'
         ORDER BY started_at DESC
         LIMIT 1`,
        [threadId],
      )
      const row = rows[0]
      return row ? mapRun(row) : null
    },
    async listByThread(threadId) {
      const rows = await rowsOf<RunRow>(
        db,
        `SELECT * FROM chat_runs
         WHERE thread_id = $1
         ORDER BY started_at ASC`,
        [threadId],
      )
      return rows.map(mapRun)
    },
    async listByParentRun(parentRunId) {
      const rows = await rowsOf<RunRow>(
        db,
        `SELECT * FROM chat_runs
         WHERE parent_run_id = $1
         ORDER BY started_at ASC`,
        [parentRunId],
      )
      return rows.map(mapRun)
    },
    async listReclaimable({ now, ttlMs }) {
      const rows = await rowsOf<RunRow>(
        db,
        `SELECT * FROM chat_runs
         WHERE status = 'running'
           AND detached_since IS NOT NULL
           AND detached_since <= $1`,
        [now - ttlMs],
      )
      return rows.map(mapRun)
    },
  }
}

function createInterruptStore(db: Pool): InterruptStore {
  const listWhere = async (clause: string, params: Array<SqlParam>) => {
    const rows = await rowsOf<InterruptRow>(
      db,
      `SELECT * FROM chat_interrupts
       WHERE ${clause}
       ORDER BY requested_at ASC`,
      params,
    )
    return rows.map(mapInterrupt)
  }

  return {
    // Insert-if-absent: a duplicate create must never clobber a resolved
    // interrupt back to pending.
    async create(record) {
      await db.query(
        `INSERT INTO chat_interrupts (
           interrupt_id, run_id, thread_id, status, requested_at,
           payload_json, response_json
         ) VALUES ($1, $2, $3, 'pending', $4, $5::jsonb, $6::jsonb)
         ON CONFLICT (interrupt_id) DO NOTHING`,
        [
          record.interruptId,
          record.runId,
          record.threadId,
          record.requestedAt,
          JSON.stringify(record.payload),
          record.response === undefined
            ? null
            : JSON.stringify(record.response),
        ],
      )
    },
    async resolve(interruptId, response) {
      if (response !== undefined) {
        await db.query(
          `UPDATE chat_interrupts
           SET status = 'resolved', resolved_at = $2, response_json = $3::jsonb
           WHERE interrupt_id = $1`,
          [interruptId, Date.now(), JSON.stringify(response)],
        )
        return
      }
      await db.query(
        `UPDATE chat_interrupts
         SET status = 'resolved', resolved_at = $2
         WHERE interrupt_id = $1`,
        [interruptId, Date.now()],
      )
    },
    async cancel(interruptId) {
      await db.query(
        `UPDATE chat_interrupts
         SET status = 'cancelled', resolved_at = $2
         WHERE interrupt_id = $1`,
        [interruptId, Date.now()],
      )
    },
    async get(interruptId) {
      const rows = await rowsOf<InterruptRow>(
        db,
        'SELECT * FROM chat_interrupts WHERE interrupt_id = $1',
        [interruptId],
      )
      const row = rows[0]
      return row ? mapInterrupt(row) : null
    },
    list: (threadId) => listWhere('thread_id = $1', [threadId]),
    listPending: (threadId) =>
      listWhere(`thread_id = $1 AND status = 'pending'`, [threadId]),
    listByRun: (runId) => listWhere('run_id = $1', [runId]),
    listPendingByRun: (runId) =>
      listWhere(`run_id = $1 AND status = 'pending'`, [runId]),
  }
}

function createMetadataStore(db: Pool): MetadataStore {
  return {
    async get(namespace, key) {
      const rows = await rowsOf<MetadataRow>(
        db,
        `SELECT value_json FROM chat_metadata
         WHERE namespace = $1 AND key = $2`,
        [namespace, key],
      )
      const row = rows[0]
      return row ? readJson(row.value_json) : null
    },
    async set(namespace, key, value) {
      // JSON.stringify(undefined) is undefined, which a NOT NULL column rejects
      // with an opaque driver error. Fail clearly instead.
      if (value == null) {
        throw new TypeError(
          `Cannot store ${value} for (${namespace}, ${key}) — use delete() to clear metadata.`,
        )
      }
      await db.query(
        `INSERT INTO chat_metadata (namespace, key, value_json)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (namespace, key) DO UPDATE
         SET value_json = EXCLUDED.value_json`,
        [namespace, key, JSON.stringify(value)],
      )
    },
    async delete(namespace, key) {
      await db.query(
        'DELETE FROM chat_metadata WHERE namespace = $1 AND key = $2',
        [namespace, key],
      )
    },
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

**Redis / Upstash** — all four stores fit, and Redis is excellent for
`LockStore` too. Store each record as one JSON document (RedisJSON, or a JSON
string) and list `runs` and `interrupts` through sorted-set indexes: one per
thread and one per run, scored by `startedAt` / `requestedAt`. Those indexes
are only safe when the record and every index it joins are written by **one
Lua script** (`EVAL`), never as separate commands: insert the record if absent
(`JSON.SET ... NX` or `SET ... NX`), `ZADD` each index only when that insert
happened, and return the stored record. Pass every key the script touches in
`KEYS`, so it also works on a cluster. That one script is `createOrResume`
and `interrupts.create` (invariants 3 and 6), and it stays correct across
instances. `interrupts.commitBatch` is one script too: check every id exists
and is pending, then write them all, or write nothing. If `listReclaimable`
reads a sorted set of detached runs, the `runs.update` that changes `status` or
`detachedSince` must move the run in or out of it in the same script; as two
commands, a crash between them hides a detached run from the reaper. `ZRANGE` on the index
gives the `requestedAt` ordering for free. For `metadata`, build the key so
`('a:b','c')` and `('a','b:c')` stay distinct, for example by escaping the
delimiter. `@upstash/agentkit-tanstack-ai` (`upstashPersistence()`) is a
published implementation of this layout that passes the conformance suite with
all seven stores; on Upstash the app can use it instead of writing this file.

**Anything else** — you only need the seven invariants above. The core never
inspects your storage.

## Adopt part of it

You rarely need all four stores at once. Implement what you own and fill the
rest from another base:

```ts
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

```ts
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { chatPersistence } from '../src/lib/chat-persistence'

runPersistenceConformance('app-custom', () => chatPersistence, {
  skip: ['activities', 'generationRuns', 'artifacts', 'blobs'],
})
```

Point it at a throwaway database and reset between runs. The suite covers
every store, so declare every intentional omission: a chat adapter skips the
optional `activities` store and the generation half, as above. `skip`
never accepts `'locks'`, which is not a store.

If your recipe leaves `listByThread` or `listReclaimable` unimplemented,
declare it separately with `skipMethods`, for example
`{ skipMethods: ['runs.listByThread'] }`. An omitted method that is not declared
fails the suite instead of silently passing. Subagent support is optional: when
`listByParentRun` is absent, the subagent checks skip on their own. `findActiveRun` is **not** in that
set — it is required, so there is nothing to declare.
