---
title: Build Your Own Adapter
id: build-your-own-adapter
---

# Build Your Own Persistence Adapter

You want server-side chat persistence, but your data lives in your own database:
Postgres behind Prisma, a SQLite file, Cloudflare D1, Mongo, whatever you already
run. TanStack AI does not ship a backend for your exact stack, and you would
rather not add one more service just for chat history.

You do not need a packaged backend. Server persistence is a small set of plain
store interfaces from `@tanstack/ai-persistence`. Implement the ones you want
against your database, hand the result to `withPersistence`, and you are done.
The core never inspects your tables, so the schema is yours to shape.

This guide builds a complete SQLite adapter on Node's built-in `node:sqlite`, end
to end, then shows how to map the same contracts onto a database schema you
already have. The runnable version of everything here lives in the
`examples/ts-react-chat` app (`src/lib/sqlite-persistence.ts`).

## What an adapter is

An adapter is an object with a `stores` map:

```ts
import type { ChatTranscriptPersistence } from '@tanstack/ai-persistence'
// `messages` and `runs` are your store implementations (built below); import
// them from your own modules.
import { messages } from './message-store'
import { runs } from './run-store'

const persistence: ChatTranscriptPersistence = {
  stores: { messages, runs },
}
```

Each store is independent. Provide only the ones you need: `messages` for the
transcript, `runs` for run lifecycle, `interrupts` for durable approvals (needs
`runs`), `metadata` for namespaced key/value state. The middleware turns on
behavior for whatever stores it finds, so a `messages`-only adapter is a valid
adapter.

Those four are the *only* keys `stores` accepts — anything else throws
`Unknown AIPersistence store key` at construction. Need a mutex across
instances? That is `withLocks`; see [Locks](../advanced/locks).

Type each store with its `define*Store` helper — `defineMessageStore`,
`defineRunStore`, `defineInterruptStore`, `defineMetadataStore` — as the sections
below do. Each checks the object against the contract inline (autocomplete, no
`: MessageStore` annotation) and composes into `defineAIPersistence`, which
tracks **exact presence**: the stores you pass are defined, autocompleted keys on
`persistence.stores`, and accessing one you did not pass is a compile error.

Annotate the value with a named shape — `ChatPersistence` for all four,
`ChatTranscriptPersistence` for the floor. Bare `AIPersistence` is the
all-optional bag, and `withPersistence` rejects it because `stores.messages` is
possibly `undefined`.

Every method signature and invariant is in the
[store interface reference](#store-interface-reference) at the end of this page.
The invariants (idempotent creates, insert-if-absent, ordered listings) are what
the shared conformance suite checks, and getting one wrong is the usual source of
subtle bugs.

## New database: a SQLite adapter start to finish

### 1. The schema

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

### 2. Messages: full-transcript overwrite

`saveThread` always receives the complete, authoritative history. It is a
replace, not an append. `loadThread` returns `[]` for a thread that was never
saved, never `null`.

```ts
import { DatabaseSync } from 'node:sqlite'
import { defineMessageStore } from '@tanstack/ai-persistence'
import type { ModelMessage } from '@tanstack/ai'

// `defineMessageStore` types the object inline against the contract — you get
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

### 3. Runs: idempotent create, patch, get

`createOrResume` must be idempotent. If the run id already exists, return the
stored record unchanged, so resuming a run never resets its `startedAt` or
status. `INSERT ... ON CONFLICT DO NOTHING` gives you that in one statement.
`update` on an unknown run id is a no-op.

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
      if (patch.sandboxKey !== undefined) {
        sets.push('sandbox_key = ?')
        params.push(patch.sandboxKey)
      }
      // `detachedSince` is the one field callers CLEAR by writing `undefined`:
      // a takeover does exactly that when a viewer re-attaches. So this branch
      // keys off key presence, not `!== undefined`. Filter `undefined` out here
      // and a re-attached run reads as permanently detached, so a TTL sweep
      // reclaims a sandbox someone is actively watching.
      if ('detachedSince' in patch) {
        sets.push('detached_since = ?')
        params.push(patch.detachedSince ?? null)
      }
      if (patch.cancelRequested !== undefined) {
        sets.push('cancel_requested = ?')
        params.push(patch.cancelRequested ? 1 : 0)
      }
      if (patch.driverEpoch !== undefined) {
        sets.push('driver_epoch = ?')
        params.push(patch.driverEpoch)
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
    // a generating thread) learns there is a live run and tails it. Skip it and
    // the thread always looks idle on hydrate: the transcript restores, but a
    // reply that was mid-stream never resumes.
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
    // and `reapDetachedRuns` from `@tanstack/ai-sandbox` consumes this list —
    // this method only answers the query; scheduling that sweep is the app's
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
`undefined` must **clear** it. Only `detachedSince` is cleared that way today —
the takeover path writes `{ detachedSince: undefined }` when a viewer re-attaches
— but the distinction is easy to lose in whatever your ORM's "set" builder does
with `undefined` (Drizzle's `.set()`, for instance, drops such columns). Get it
wrong and nothing throws: the run simply looks detached forever. Index
`runs(status, detached_since)` if you plan to sweep on `listReclaimable`.

### 4. Interrupts: insert-if-absent, ordered listings

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
  // Every listing is ORDER BY requested_at ASC — the middleware relies on it.
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

### 5. Metadata: reject nullish

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

### 6. Assemble the adapter

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

## Existing database: map the contracts onto your schema

You do not have to create the four tables above. If you already have a database,
map each store method onto the tables and columns you already run. Three things
change from the from-scratch version.

**Your column names, your types.** The core reads and writes only through your
store methods, so name columns whatever you like and use your database's native
types. Store `messages_json` as a real `jsonb` column on Postgres, use a
`timestamptz` for `started_at` and convert to epoch milliseconds in your row
mapper, split `usage` into real columns if you want to query it. The record shape
the methods return is fixed; how you store it is not.

**Extra columns are fine.** Add a `user_id` to the messages table to scope
threads per user, add `created_at`/`updated_at` audit columns, add a tenant id.
Keep added columns nullable or defaulted so the store's inserts still succeed. The
TanStack AI stores never read or write columns they do not know about.

**Adopt part of it.** You rarely need all four stores in the same database. Put
`messages` and `runs` in your primary database and nothing else, then fill the
rest from another source with `composePersistence`:

```ts
import { composePersistence, memoryPersistence } from '@tanstack/ai-persistence'
import { messages, runs } from './my-postgres-stores'

// Start from any base and replace the stores you own.
export const persistence = composePersistence(memoryPersistence(), {
  overrides: { messages, runs },
})
```

One caveat: `composePersistence` does not add a transaction across different
systems. If `messages` lives in Postgres and `interrupts` in Redis, a write that
must touch both is two writes; design retries and idempotency for that yourself.
The store invariants (idempotent `createOrResume`, insert-if-absent `create`) are
what make those retries safe, which is exactly why they are invariants.

## Verify with the conformance suite

Do not eyeball it. `@tanstack/ai-persistence` ships the same conformance test
suite every packaged backend runs. Point it at your factory and it exercises
every method of every store you provide, including the ordering and idempotency
rules that are easy to get subtly wrong.

```ts
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { sqlitePersistence } from './sqlite-persistence'

runPersistenceConformance('my sqlite adapter', () =>
  sqlitePersistence({ url: ':memory:', migrate: true }),
)
```

The adapter above provides all four stores and all six `runs` methods, so there
is nothing to declare. Most adapters are less complete than that, and every
omission has to be declared, in one of two places.

A store you deliberately do not provide goes in `skip`:

```ts
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { transcriptOnlyPersistence } from './transcript-only'

runPersistenceConformance(
  'transcript-only adapter',
  () => transcriptOnlyPersistence(),
  { skip: ['runs', 'interrupts', 'metadata'] },
)
```

An optional `RunStore` method you do not implement goes in `skipMethods`, keyed
`runs.<method>`:

```ts
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
// A leaner build of the SQLite adapter: all four stores, but only the three
// required `runs` methods plus `findActiveRun`.
import { leanSqlitePersistence } from './lean-sqlite-persistence'

// Nothing renders a thread's past runs here and nothing schedules
// `reapDetachedRuns`, so `listByThread` and `listReclaimable` are absent by
// choice — this app accepts that its detached runs are never reaped.
// `findActiveRun` is
// implemented, so it stays under test.
runPersistenceConformance(
  'lean sqlite adapter',
  () => leanSqlitePersistence({ url: ':memory:', migrate: true }),
  { skipMethods: ['runs.listByThread', 'runs.listReclaimable'] },
)
```

`skip` accepts only the four state store keys, and `skipMethods` only the
optional `runs` methods. Anything absent and not declared fails the suite with a
message naming exactly what to add, so a half-wired adapter cannot report a
pass, and a declared omission shows up in the test output as a skipped case
rather than as nothing at all. When this is green, your adapter is a drop-in for
`withPersistence`. The `examples/ts-react-chat` app runs this suite against its
SQLite backend and declares those same two omissions.

## Let your coding agent write it

You do not have to type this page out. `@tanstack/ai-persistence` ships
[Agent Skills](../getting-started/agent-skills) that turn it into a recipe your
assistant follows against **your** stack: it reads your existing ORM config,
schema file, and database handle, appends the four tables to the schema you
already have, and writes a single `src/lib/chat-persistence.ts` exporting the
`ChatPersistence` — no new package, no second database client, and no migration
mechanism competing with the one you run.

Install the skills with [TanStack Intent](https://tanstack.com/intent/latest/docs/overview),
which scans `node_modules` for packages that ship skills and writes the mappings
into your agent's config (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, …):

```bash
pnpm add @tanstack/ai-persistence
npx @tanstack/intent@latest install
```

Then ask for what you want — "add chat persistence to this app" — and the
matching skill loads itself into context:

| Skill                                     | Covers                                                              |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `ai-persistence`                          | Entry point — routes to everything below                            |
| `ai-persistence/server`                   | `withPersistence`, run lifecycle, interrupts, `reconstructChat`     |
| `ai-persistence/stores`                   | The store contracts and their invariants                            |
| `ai-core/locks`                           | `LockStore` / `withLocks` coordination (ships in `@tanstack/ai/locks`) |
| `ai-persistence/build-drizzle-adapter`    | `chat-persistence.ts` for a Drizzle app (SQLite / Postgres / MySQL) |
| `ai-persistence/build-prisma-adapter`     | `chat-persistence.ts` for a Prisma app                              |
| `ai-persistence/build-cloudflare-adapter` | `chat-persistence.ts` for a Worker on D1, plus Durable Object locks |
| `ai-persistence/build-custom-adapter`     | `chat-persistence.ts` for anything else — raw `pg`, Kysely, SQLite, Mongo, Supabase |

Browser-side persistence is not in this package — its skill ships with
`@tanstack/ai` as `ai-core/client-persistence`, alongside the framework code it
teaches.

They are plain Markdown at
`node_modules/@tanstack/ai-persistence/skills/<skill-name>/SKILL.md` if you
prefer to read or follow them yourself.

## Store interface reference

These are the public contracts from `@tanstack/ai-persistence`. Implement only
the stores you need.

### MessageStore

```ts
import type { ModelMessage } from '@tanstack/ai'

interface MessageStore {
  loadThread(threadId: string): Promise<Array<ModelMessage>>
  saveThread(threadId: string, messages: Array<ModelMessage>): Promise<void>
}
```

`saveThread` receives the full authoritative model-message history, not a delta.
`loadThread` returns `[]` (never `null`) for a thread that was never saved.

### RunStore

`RunStore` and `RunRecord` come from `@tanstack/ai`; `@tanstack/ai-persistence`
re-exports both, which is why the samples on this page import them from either
package. `RunError` is exported from `@tanstack/ai` only.

```ts
import type { TokenUsage } from '@tanstack/ai'

type TerminalRunStatus = 'completed' | 'failed' | 'aborted'
type RunStatus = 'running' | 'interrupted' | TerminalRunStatus

// Why a run failed. `message` is the provider's prose, which changes between
// model versions and cannot be branched on; `code` is the stable
// classification a consumer switches over to retry, escalate, or show a
// specific UI. Providers do not always supply one, so `code` is optional.
interface RunError {
  message: string
  code?: string
}

interface RunRecord {
  runId: string
  threadId: string
  status: RunStatus
  startedAt: number // epoch ms
  finishedAt?: number // epoch ms, set once the run reaches a terminal status
  error?: RunError
  usage?: TokenUsage // token counts, from @tanstack/ai
  // Compound sandbox key this run is bound to, if it ran in one. Written by
  // `withSandbox` when a run detaches, so a later host can find the sandbox to
  // take over or tear down without re-deriving the key.
  sandboxKey?: string
  // Epoch ms since the last viewer detached; absent while someone is attached.
  // Written by `withSandbox`'s detach path on a durable run.
  detachedSince?: number
  // Set by an out-of-band cancel (`requestRunCancel`), and read on teardown to
  // tell a real cancel apart from a client that merely disconnected. It is
  // deliberately not a status: recording intent is not the run having stopped.
  cancelRequested?: boolean
  // Monotonic fencing token, bumped by each host that claims the run. A
  // superseded host compares the stored value against the one it holds and
  // stops writing. Round-trip it or takeover has no fence.
  driverEpoch?: number
}

interface RunStore {
  // Required: insert-if-absent. An existing runId returns the stored record
  // unchanged, so resuming a run never resets its startedAt or status.
  createOrResume(input: {
    runId: string
    threadId: string
    status?: RunStatus
    startedAt: number
  }): Promise<RunRecord>
  // Required: patching an unknown runId is a no-op, not an error.
  update(
    runId: string,
    patch: Partial<
      Pick<
        RunRecord,
        | 'status'
        | 'finishedAt'
        | 'error'
        | 'usage'
        | 'sandboxKey'
        | 'detachedSince'
        | 'cancelRequested'
        | 'driverEpoch'
      >
    >,
  ): Promise<void>
  // Required.
  get(runId: string): Promise<RunRecord | null>
  // Optional. The most recent 'running' run for a thread (greatest
  // `startedAt` wins), or null when the thread is idle. `reconstructChat`
  // feature-detects it to report `activeRun`, which is how a hydrating client
  // tails a run that is still generating.
  findActiveRun?(threadId: string): Promise<RunRecord | null>
  // Optional. Every run for a thread, ascending by startedAt. Only needed to
  // render a thread's past agent activity.
  listByThread?(threadId: string): Promise<Array<RunRecord>>
  // Optional. Runs where status is 'running' and detachedSince <= now - ttlMs
  // (inclusive). This is the query `reapDetachedRuns` (@tanstack/ai-sandbox)
  // runs to find abandoned runs; scheduling that sweep is the app's job.
  listReclaimable?(opts: {
    now: number
    ttlMs: number
  }): Promise<Array<RunRecord>>
}
```

`createOrResume`, `update`, and `get` are the whole floor: a backend that
implements only those three is a valid `RunStore`. `findActiveRun`,
`listByThread`, and `listReclaimable` are genuinely optional, not
recommended-but-checked: consumers feature-detect each one
(`store.findActiveRun?.(...)`) and degrade gracefully when it is absent, and
the conformance suite (below) skips a method's test cases once you declare the
omission in `skipMethods`. Implement the ones your app needs:

- Skip `findActiveRun` and a client that reloads (or switches back to) a
  still-generating thread restores the transcript but never resumes the live
  reply, because `reconstructChat` always reports `activeRun: null`.
- Skip `listByThread` and you cannot render a thread's past runs.
- Skip `listReclaimable` and the store cannot be reaped: `reapDetachedRuns`
  feature-detects it, logs one line, and sweeps nothing — so detached runs are
  never finalized and their sandboxes never reclaimed. `detachedSince` *is*
  populated for you by `withSandbox`'s detach path, and note that the reaper is a
  function the application schedules, so implementing this method is necessary
  but not by itself sufficient. See
  [Takeover & Detached Runs](../sandbox/takeover#configuration).

The three fields a durable, reclaimable run depends on — `detachedSince`,
`cancelRequested`, and `driverEpoch` — are the ones a hand-written backend tends
to drop, and each omission breaks one mechanism silently rather than loudly: no
`driverEpoch` means takeover has no fence, no `cancelRequested` means a Stop
button cannot reach a run driven by another replica, and no `detachedSince` (or
`sandboxKey`) means nothing can find the detached sandbox again. `update` must
accept and round-trip all of them.

Two helpers travel with the contract, and both exist so a caller does not have
to reach for a cast:

- Deciding "can this run still emit events?" from a bare `RunStatus` string
  leaves you holding the wide union afterwards. `isTerminalRunStatus` is a type
  predicate, so inside the guard the status is a `TerminalRunStatus` and can be
  passed wherever one is required.

  ```ts
  import { isTerminalRunStatus } from '@tanstack/ai-persistence'
  import type { RunRecord, TerminalRunStatus } from '@tanstack/ai-persistence'

  function finalStatus(run: RunRecord): TerminalRunStatus | null {
    return isTerminalRunStatus(run.status) ? run.status : null
  }
  ```

- An optional method you did implement should not need a `?.` from inside your
  own code. `defineRunStore` is generic over the object you pass, so the result
  keeps that object's exact shape: `createRunStore(db).findActiveRun(threadId)`
  is a direct call on the store built above, while a consumer holding a bare
  `RunStore` still feature-detects the same method.

The reference implementation, `MemoryRunStore` in
`packages/ai-persistence/src/memory.ts`, implements all six. The
`examples/ts-react-chat` SQLite adapter (`src/lib/sqlite-persistence.ts`)
implements only the three required methods plus `findActiveRun`, which is a
fine illustration that the rest stay optional.

### InterruptStore

```ts
interface InterruptRecord {
  interruptId: string
  runId: string
  threadId: string
  status: 'pending' | 'resolved' | 'cancelled'
  requestedAt: number // epoch ms
  resolvedAt?: number // epoch ms, set once resolved or cancelled
  payload: Record<string, unknown>
  response?: unknown
}

interface InterruptStore {
  create(record: Omit<InterruptRecord, 'status' | 'resolvedAt'>): Promise<void>
  resolve(interruptId: string, response?: unknown): Promise<void>
  cancel(interruptId: string): Promise<void>
  get(interruptId: string): Promise<InterruptRecord | null>
  list(threadId: string): Promise<Array<InterruptRecord>>
  listPending(threadId: string): Promise<Array<InterruptRecord>>
  listByRun(runId: string): Promise<Array<InterruptRecord>>
  listPendingByRun(runId: string): Promise<Array<InterruptRecord>>
}
```

`create` accepts a record without `status`/`resolvedAt` so every interrupt is
born `'pending'`; it is insert-if-absent, so a duplicate `create` never clobbers
an already-resolved interrupt. The `list*` methods return records ordered by
`requestedAt` ascending. An `interrupts` store requires a `runs` store when used
with chat persistence.

### MetadataStore

```ts
interface MetadataStore {
  get(scope: string, key: string): Promise<unknown | null>
  set(scope: string, key: string, value: unknown): Promise<void>
  delete(scope: string, key: string): Promise<void>
}
```

Namespaces and value schemas are application-owned, and `(scope, key)` is the
composite identity. A stored `null` is indistinguishable from absence at the type
level, so wrap a value you must persist as `null` (e.g. `{ value: null }`), or
reject nullish values outright the way the SQLite store above does.

## Where to go next

- [Controls](./controls): compose stores from different systems.
- [Locks](../advanced/locks): `LockStore` / `withLocks` coordination.
- [Migrations](./migrations): who owns the schema and when to apply changes.
- [Internals](./internals): the middleware lifecycle your stores plug into.
