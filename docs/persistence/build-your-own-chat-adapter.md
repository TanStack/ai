---
title: Build a Chat Adapter (Advanced)
id: build-your-own-chat-adapter
description: "SQLite walkthrough: messages, runs, interrupts, metadata — method checklists and working stubs."
---

# Build a Chat Adapter

If you need transcript + run lifecycle + durable approvals in your DB → implement four stores. This page builds them against Node `node:sqlite`.

Read first: [Build your own adapter](./build-your-own-adapter) (shape + which stores). Signatures: [store reference](./store-reference). Runnable copy: `examples/ts-react-chat` → `src/lib/sqlite-persistence.ts`.

## 1. Schema

JSON as text; timestamps epoch ms.

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

## 2. Messages

**Required methods:**

1. `loadThread(threadId)` → `[]` if never saved (never `null`)
2. `saveThread(threadId, messages)` → full replace, not append

```ts
import { DatabaseSync } from 'node:sqlite'
import { defineMessageStore } from '@tanstack/ai-persistence'
import type { ModelMessage } from '@tanstack/ai'

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

`async` methods wrap sync `node:sqlite` without `Promise.resolve`. On async drivers, `await` queries.

## 3. Runs

**Required methods:**

1. `createOrResume` — idempotent; existing `runId` returns stored record unchanged (`INSERT … ON CONFLICT DO NOTHING`)
2. `update` — unknown `runId` = no-op
3. `get`
4. `findActiveRun(threadId)` — newest `status = 'running'` by `startedAt`, or `null` (do **not** stub null always)

**Optional:** `listByThread`, `listReclaimable`

**Patch rule:** omitted key = leave column; key present with `undefined` = clear. Sandbox fields use `'field' in patch`.

```ts
import { DatabaseSync } from 'node:sqlite'
import { defineRunStore } from '@tanstack/ai-persistence'
import type { RunRecord, RunStatus } from '@tanstack/ai-persistence'

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

function mapRun(row: Record<string, unknown>): RunRecord {
  return {
    runId: String(row.run_id),
    threadId: String(row.thread_id),
    status: toRunStatus(row.status),
    startedAt: Number(row.started_at),
    ...(row.finished_at != null ? { finishedAt: Number(row.finished_at) } : {}),
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
    ...(row.cancel_requested != null
      ? { cancelRequested: Boolean(row.cancel_requested) }
      : {}),
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
        sets.push('error = ?', 'error_code = ?')
        params.push(patch.error.message, patch.error.code ?? null)
      }
      if (patch.usage !== undefined) {
        sets.push('usage_json = ?')
        params.push(JSON.stringify(patch.usage))
      }
      // Sandbox-only fields — see build-a-sandbox-adapter
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
    async findActiveRun(threadId) {
      const row = active.get(threadId)
      return row ? mapRun(row) : null
    },
    async listByThread(threadId) {
      return byThread.all(threadId).map(mapRun)
    },
    async listReclaimable({ now, ttlMs }) {
      return reclaimable.all(now - ttlMs).map(mapRun)
    },
  })
}
```

Index `runs(status, detached_since)` if you sweep `listReclaimable`.

## 4. Interrupts

**Required methods:**

1. `create` — insert-if-absent; never clobber resolved
2. `resolve` / `cancel`
3. `get`
4. All `list*` ordered by `requested_at` ASC

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

## 5. Metadata

**Required methods:** `get` / `set` / `delete`. Identity: `(scope, key)`. Reject nullish on `set`; clear via `delete`.

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

## 6. Assemble

```ts
import { DatabaseSync } from 'node:sqlite'
import { defineAIPersistence } from '@tanstack/ai-persistence'
import type { ChatPersistence } from '@tanstack/ai-persistence'
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

Mutex across workers → [Locks](../advanced/locks).

Wire into `chat()`:

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

## Next

- [Build a generation adapter](./build-your-own-generation-adapter)
- [Conformance suite](./build-your-own-adapter#prove-with-conformance)
- [Migrations](./migrations)
