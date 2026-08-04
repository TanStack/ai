---
title: Build a Chat Adapter (Advanced)
id: build-your-own-chat-adapter
---

# Build a Chat Adapter

You want the transcript, the run lifecycle, and durable approvals in your own
database, and you would rather write four small stores than add a service. This
page builds all of them against SQLite (Node's built-in `node:sqlite`), start to
finish, in the order an app usually grows into them.

Read [Build your own adapter](./build-your-own-adapter) first for the shape of an
adapter and which stores your app needs. Every method signature and invariant is
in the [store reference](./store-reference). The runnable version of this
walkthrough lives in the `examples/ts-react-chat` app
(`src/lib/sqlite-persistence.ts`).

## 1. The schema

Four tables. JSON payloads are stored as text (SQLite has no JSON column type),
timestamps as integers (epoch milliseconds), everything keyed the way the store
methods look records up.

```sql
CREATE TABLE IF NOT EXISTS messages (
  thread_id text PRIMARY KEY NOT NULL,
  messages_json text NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  run_id text PRIMARY KEY NOT NULL,
  thread_id text NOT NULL,
  status text NOT NULL,
  started_at integer NOT NULL,
  finished_at integer,
  error text,
  error_code text,
  usage_json text,
  sandbox_key text,
  detached_since integer,
  cancel_requested integer,
  driver_epoch integer
);
CREATE TABLE IF NOT EXISTS interrupts (
  interrupt_id text PRIMARY KEY NOT NULL,
  run_id text NOT NULL,
  thread_id text NOT NULL,
  status text NOT NULL,
  requested_at integer NOT NULL,
  resolved_at integer,
  payload_json text NOT NULL,
  response_json text
);
CREATE TABLE IF NOT EXISTS metadata (
  scope text NOT NULL,
  key text NOT NULL,
  value_json text NOT NULL,
  PRIMARY KEY (scope, key)
);
```

## 2. Messages: full-transcript overwrite

Two contracts to hold:

- `saveThread` always receives the complete, authoritative history. It is a
  replace, not an append.
- `loadThread` returns `[]` for a thread that was never saved, never `null`.

```ts
import { DatabaseSync } from 'node:sqlite'
import { defineMessageStore } from '@tanstack/ai-persistence'
import type { ModelMessage } from '@tanstack/ai'

// `defineMessageStore` types the object inline against the contract, so you get
// autocomplete and checking with no separate `: MessageStore` annotation.
function createMessageStore(db: DatabaseSync) {
  const select = db.prepare(
    'SELECT messages_json FROM messages WHERE thread_id = ?',
  )
  const upsert = db.prepare(
    `INSERT INTO messages (thread_id, messages_json) VALUES (?, ?)
     ON CONFLICT(thread_id) DO UPDATE SET messages_json = excluded.messages_json`,
  )
  return defineMessageStore({
    async loadThread(threadId) {
      const json = select.get(threadId)?.messages_json
      // Unknown thread → [] (never null). `node:sqlite` types columns as a
      // SQL-value union, so narrow to string before parsing (no cast).
      if (typeof json !== 'string') return []
      const parsed: Array<ModelMessage> = JSON.parse(json)
      return parsed
    },
    async saveThread(threadId, messages) {
      upsert.run(threadId, JSON.stringify(messages))
    },
  })
}
```

The methods are `async`, so `node:sqlite` (a synchronous driver) needs no
`Promise.resolve` wrapper: `async` promotes the returned value to a promise, and
a method that returns nothing resolves to `void`. On an async driver, `await` the
query instead.

## 3. Runs: idempotent create, patch, get

Two contracts to hold:

- `createOrResume` must be idempotent. If the run id already exists, return the
  stored record unchanged, so resuming a run never resets its `startedAt` or
  status. `INSERT ... ON CONFLICT DO NOTHING` gives you that in one statement.
- `update` on an unknown run id is a no-op.

```ts
import { DatabaseSync } from 'node:sqlite'
import { defineRunStore } from '@tanstack/ai-persistence'
import type { RunRecord, RunStatus } from '@tanstack/ai-persistence'

// The `status` column is text; validate it back into the union (no cast).
function toRunStatus(value: unknown): RunStatus {
  switch (value) {
    case 'running':
    case 'interrupted':
    case 'completed':
    case 'failed':
    case 'aborted':
      return value
    default:
      throw new TypeError(`Unexpected run status: ${String(value)}`)
  }
}

// `node:sqlite` types columns as a SQL-value union, so coerce/narrow each field
// (String / Number / typeof) rather than casting the whole row.
function mapRun(row: Record<string, unknown>): RunRecord {
  return {
    runId: String(row.run_id),
    threadId: String(row.thread_id),
    status: toRunStatus(row.status),
    startedAt: Number(row.started_at),
    ...(row.finished_at != null ? { finishedAt: Number(row.finished_at) } : {}),
    // `error` is a `RunError`: the provider's prose in `error`, its stable
    // classification in `error_code`. Two columns rather than one JSON blob,
    // because `code` is the field an operator filters and groups by
    // (`WHERE error_code = 'rate_limited'`), and this schema keeps the `_json`
    // suffix for columns that really hold serialized JSON. Omit `code` when the
    // column is NULL so the record matches an error that carried no code.
    ...(typeof row.error === 'string'
      ? {
          error: {
            message: row.error,
            ...(typeof row.error_code === 'string'
              ? { code: row.error_code }
              : {}),
          },
        }
      : {}),
    ...(typeof row.usage_json === 'string'
      ? { usage: JSON.parse(row.usage_json) }
      : {}),
    ...(typeof row.sandbox_key === 'string'
      ? { sandboxKey: row.sandbox_key }
      : {}),
    ...(row.detached_since != null
      ? { detachedSince: Number(row.detached_since) }
      : {}),
    // SQLite has no boolean column type; store it as 0/1 in an integer column
    // and convert back here, the same way `detached_since` round-trips epoch ms.
    ...(row.cancel_requested != null
      ? { cancelRequested: Boolean(row.cancel_requested) }
      : {}),
    // The fencing token a takeover bumps. Round-trip it or single-writer
    // fencing silently does nothing: a superseded host re-reads its own epoch,
    // never sees a higher one, and keeps appending to a log it no longer owns.
    ...(row.driver_epoch != null
      ? { driverEpoch: Number(row.driver_epoch) }
      : {}),
  }
}

function createRunStore(db: DatabaseSync) {
  const select = db.prepare('SELECT * FROM runs WHERE run_id = ?')
  const insert = db.prepare(
    `INSERT INTO runs (run_id, thread_id, status, started_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(run_id) DO NOTHING`,
  )
  const active = db.prepare(
    `SELECT * FROM runs WHERE thread_id = ? AND status = 'running'
     ORDER BY started_at DESC LIMIT 1`,
  )
  const byThread = db.prepare(
    'SELECT * FROM runs WHERE thread_id = ? ORDER BY started_at ASC',
  )
  const reclaimable = db.prepare(
    `SELECT * FROM runs WHERE status = 'running' AND detached_since IS NOT NULL
     AND detached_since <= ? ORDER BY started_at ASC`,
  )
  return defineRunStore({
    async createOrResume(input) {
      const existing = select.get(input.runId)
      if (existing) return mapRun(existing)
      const status: RunStatus = input.status ?? 'running'
      insert.run(input.runId, input.threadId, status, input.startedAt)
      return {
        runId: input.runId,
        threadId: input.threadId,
        status,
        startedAt: input.startedAt,
      }
    },
    async update(runId, patch) {
      const sets: Array<string> = []
      const params: Array<string | number | null> = []
      if (patch.status !== undefined) {
        sets.push('status = ?')
        params.push(patch.status)
      }
      if (patch.finishedAt !== undefined) {
        sets.push('finished_at = ?')
        params.push(patch.finishedAt)
      }
      if (patch.error !== undefined) {
        // Write both halves together, so a later failure that carries no `code`
        // cannot leave the previous failure's code behind.
        sets.push('error = ?', 'error_code = ?')
        params.push(patch.error.message, patch.error.code ?? null)
      }
      if (patch.usage !== undefined) {
        sets.push('usage_json = ?')
        params.push(JSON.stringify(patch.usage))
      }
      // SANDBOX ONLY, skip these four unless you run durable sandboxed runs:
      // https://tanstack.com/ai/latest/docs/persistence/build-a-sandbox-adapter
      // A chat app never writes them and nothing here reads them.
      //
      // They are the fields a caller CLEARS by writing `undefined` explicitly, so
      // these branches key off key presence (`'field' in patch`), not
      // `!== undefined`.
      if ('sandboxKey' in patch) {
        sets.push('sandbox_key = ?')
        params.push(patch.sandboxKey ?? null)
      }
      if ('detachedSince' in patch) {
        sets.push('detached_since = ?')
        params.push(patch.detachedSince ?? null)
      }
      if ('cancelRequested' in patch) {
        sets.push('cancel_requested = ?')
        params.push(
          patch.cancelRequested === undefined
            ? null
            : patch.cancelRequested
              ? 1
              : 0,
        )
      }
      if ('driverEpoch' in patch) {
        sets.push('driver_epoch = ?')
        params.push(patch.driverEpoch ?? null)
      }
      if (sets.length === 0) return
      params.push(runId)
      db.prepare(`UPDATE runs SET ${sets.join(', ')} WHERE run_id = ?`).run(
        ...params,
      )
    },
    async get(runId) {
      const row = select.get(runId)
      return row ? mapRun(row) : null
    },
    // The most recent still-running run for a thread. `reconstructChat` calls
    // this so a hydrating client (a reload, another device, or switching back to
    // a generating thread) learns there is a live run and tails it. Stub it to
    // null and the thread always looks idle on hydrate: the transcript restores,
    // but a reply that was mid-stream never resumes.
    async findActiveRun(threadId) {
      const row = active.get(threadId)
      return row ? mapRun(row) : null
    },
    // Every run for a thread, oldest first. Optional: only needed to render a
    // thread's past agent activity.
    async listByThread(threadId) {
      return byThread.all(threadId).map(mapRun)
    },
    // Runs the reaper sweeps: still `running`, and detached since before
    // `now - ttlMs`. `withSandbox`'s detach path sets `detachedSince` for you,
    // and `reapDetachedRuns` from `@tanstack/ai-sandbox` consumes this list;
    // this method only answers the query, scheduling that sweep is the app's
    // job. Optional, like the others above.
    async listReclaimable({ now, ttlMs }) {
      return reclaimable.all(now - ttlMs).map(mapRun)
    },
  })
}
```

`update` builds its `SET` list from only the fields present in the patch, so an
empty patch touches nothing and a partial patch leaves other columns alone. Map
each row back with a small helper that omits absent optional fields and parses
the JSON columns.

**Absent is not the same as explicitly `undefined`.** A patch that omits a key
must leave the column alone; a patch that carries the key with the value
`undefined` must **clear** it. Only `detachedSince` is cleared that way today
(the takeover path writes `{ detachedSince: undefined }` when a viewer
re-attaches), but the distinction is easy to lose in whatever your ORM's "set"
builder does with `undefined` (Drizzle's `.set()`, for instance, drops such
columns). Get it wrong and nothing throws: the run simply looks detached
forever. Index `runs(status, detached_since)` if you plan to sweep on
`listReclaimable`.

## 4. Interrupts: insert-if-absent, ordered listings

`create` is insert-if-absent: a duplicate interrupt id must never overwrite an
interrupt that was already resolved. Every `list*` method returns records ordered
by `requested_at` ascending, which the middleware relies on.

```ts
import { DatabaseSync } from 'node:sqlite'
import { defineInterruptStore } from '@tanstack/ai-persistence'
import type {
  InterruptRecord,
  InterruptStatus,
} from '@tanstack/ai-persistence'

function toInterruptStatus(value: unknown): InterruptStatus {
  switch (value) {
    case 'pending':
    case 'resolved':
    case 'cancelled':
      return value
    default:
      throw new TypeError(`Unexpected interrupt status: ${String(value)}`)
  }
}

function mapInterrupt(row: Record<string, unknown>): InterruptRecord {
  return {
    interruptId: String(row.interrupt_id),
    runId: String(row.run_id),
    threadId: String(row.thread_id),
    status: toInterruptStatus(row.status),
    requestedAt: Number(row.requested_at),
    ...(row.resolved_at != null ? { resolvedAt: Number(row.resolved_at) } : {}),
    payload:
      typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : {},
    ...(typeof row.response_json === 'string'
      ? { response: JSON.parse(row.response_json) }
      : {}),
  }
}

function createInterruptStore(db: DatabaseSync) {
  const insert = db.prepare(
    `INSERT INTO interrupts
       (interrupt_id, run_id, thread_id, status, requested_at, payload_json, response_json)
     VALUES (?, ?, ?, 'pending', ?, ?, ?)
     ON CONFLICT(interrupt_id) DO NOTHING`,
  )
  const resolveRow = db.prepare(
    `UPDATE interrupts SET status = 'resolved', resolved_at = ?, response_json = ?
     WHERE interrupt_id = ?`,
  )
  const cancelRow = db.prepare(
    `UPDATE interrupts SET status = 'cancelled', resolved_at = ? WHERE interrupt_id = ?`,
  )
  const selectOne = db.prepare('SELECT * FROM interrupts WHERE interrupt_id = ?')
  // Every listing is ORDER BY requested_at ASC, which the middleware relies on.
  const byThread = db.prepare(
    'SELECT * FROM interrupts WHERE thread_id = ? ORDER BY requested_at ASC',
  )
  const pendingByThread = db.prepare(
    `SELECT * FROM interrupts WHERE thread_id = ? AND status = 'pending'
     ORDER BY requested_at ASC`,
  )
  const byRun = db.prepare(
    'SELECT * FROM interrupts WHERE run_id = ? ORDER BY requested_at ASC',
  )
  const pendingByRun = db.prepare(
    `SELECT * FROM interrupts WHERE run_id = ? AND status = 'pending'
     ORDER BY requested_at ASC`,
  )
  return defineInterruptStore({
    async create(record) {
      // Insert-if-absent: a duplicate id must never clobber an already-resolved
      // interrupt back to pending.
      insert.run(
        record.interruptId,
        record.runId,
        record.threadId,
        record.requestedAt,
        JSON.stringify(record.payload),
        record.response === undefined ? null : JSON.stringify(record.response),
      )
    },
    async resolve(interruptId, response) {
      resolveRow.run(
        Date.now(),
        response === undefined ? null : JSON.stringify(response),
        interruptId,
      )
    },
    async cancel(interruptId) {
      cancelRow.run(Date.now(), interruptId)
    },
    async get(interruptId) {
      const row = selectOne.get(interruptId)
      return row ? mapInterrupt(row) : null
    },
    async list(threadId) {
      return byThread.all(threadId).map(mapInterrupt)
    },
    async listPending(threadId) {
      return pendingByThread.all(threadId).map(mapInterrupt)
    },
    async listByRun(runId) {
      return byRun.all(runId).map(mapInterrupt)
    },
    async listPendingByRun(runId) {
      return pendingByRun.all(runId).map(mapInterrupt)
    },
  })
}
```

## 5. Metadata: reject nullish

`(scope, key)` is the composite identity. A SQL backend cannot store a nullish
value in a `NOT NULL` text column, so reject `null` and `undefined` with a clear
error instead of a cryptic driver failure. Callers clear a value with `delete`.

```ts
import { DatabaseSync } from 'node:sqlite'
import { defineMetadataStore } from '@tanstack/ai-persistence'

function createMetadataStore(db: DatabaseSync) {
  const select = db.prepare(
    'SELECT value_json FROM metadata WHERE scope = ? AND key = ?',
  )
  const upsert = db.prepare(
    `INSERT INTO metadata (scope, key, value_json) VALUES (?, ?, ?)
     ON CONFLICT(scope, key) DO UPDATE SET value_json = excluded.value_json`,
  )
  return defineMetadataStore({
    async get(scope, key) {
      const json = select.get(scope, key)?.value_json
      return typeof json === 'string' ? JSON.parse(json) : null
    },
    async set(scope, key, value) {
      if (value == null) {
        throw new TypeError(
          'Metadata values must be defined, non-null JSON. Use delete() to clear.',
        )
      }
      upsert.run(scope, key, JSON.stringify(value))
    },
    async delete(scope, key) {
      db.prepare('DELETE FROM metadata WHERE scope = ? AND key = ?').run(
        scope,
        key,
      )
    },
  })
}
```

## 6. Assemble the adapter

Open the database, create the tables, and return the stores as an
`AIPersistence`. `defineAIPersistence` keeps the exact store keys in the type and
rejects unknown keys at runtime.

```ts
import { DatabaseSync } from 'node:sqlite'
import { defineAIPersistence } from '@tanstack/ai-persistence'
import type { ChatPersistence } from '@tanstack/ai-persistence'
// The four store factories and the schema string, each from your own module.
import { createInterruptStore } from './interrupt-store'
import { createMessageStore } from './message-store'
import { createMetadataStore } from './metadata-store'
import { createRunStore } from './run-store'
import { SCHEMA_SQL } from './schema'

export function sqlitePersistence(options: {
  url: string
  migrate?: boolean
}): ChatPersistence {
  const db = new DatabaseSync(options.url)
  if (options.migrate) db.exec(SCHEMA_SQL)
  return defineAIPersistence({
    stores: {
      messages: createMessageStore(db),
      runs: createRunStore(db),
      interrupts: createInterruptStore(db),
      metadata: createMetadataStore(db),
    },
  })
}
```

That is a complete backend. If you also need a mutex across workers, add
`withLocks` alongside it; see [Locks](../advanced/locks).

Wire it into `chat()` exactly like any other persistence:

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withPersistence } from '@tanstack/ai-persistence'
import { persistence } from './persistence'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.resume ? { resume: params.resume } : {}),
    middleware: [withPersistence(persistence)],
  })
  return toServerSentEventsResponse(stream)
}
```

## Where to go next

- [Build a generation adapter](./build-your-own-generation-adapter): generation runs, artifacts, and blobs, for media generation.
- [Build your own adapter](./build-your-own-adapter#verify-with-the-conformance-suite): run the conformance suite against what you just built.
- [Migrations](./migrations): who owns the schema and when to apply changes.
