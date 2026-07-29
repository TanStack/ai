/**
 * A self-contained SQLite persistence backend for TanStack AI, built directly
 * on the `@tanstack/ai-persistence` **core** store contracts and Node's built-in
 * `node:sqlite` driver. No ORM, no extra dependencies — this is the whole thing.
 *
 * It exists as a worked demonstration of "rolling your own" concrete persistence
 * on the core: the four store interfaces (`MessageStore`, `RunStore`,
 * `InterruptStore`, `MetadataStore`) are implemented here against raw SQL, and
 * the result is a standard `AIPersistence` you hand to `withPersistence(...)`.
 *
 * The store semantics mirror the reference in-memory backend shipped in
 * `@tanstack/ai-persistence` (`memory.ts`) exactly — the shared conformance
 * testkit (`sqlite-persistence.test.ts`) is the proof. If you copy this file
 * into your own app, keep those invariants intact and the testkit green.
 *
 * Requires Node 22.5+ (for `node:sqlite`). The TanStack Start server this
 * example runs on is a Node runtime, so `DatabaseSync` is available server-side.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import {
  defineAIPersistence,
  defineInterruptStore,
  defineMessageStore,
  defineMetadataStore,
  defineRunStore,
} from '@tanstack/ai-persistence'
import type { ModelMessage, TokenUsage } from '@tanstack/ai'
import type {
  ChatPersistence,
  InterruptRecord,
  RunRecord,
  RunStatus,
} from '@tanstack/ai-persistence'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
//
// The canonical TanStack AI table layout: one row per thread transcript, plus
// run/interrupt lifecycle rows and a scoped key/value table. JSON payloads live
// in `text` columns (raw SQLite has no JSON column mode, so we serialize with
// `JSON.stringify`/`JSON.parse` at the edges). Timestamps are epoch milliseconds
// stored as `integer`. `CREATE TABLE IF NOT EXISTS` makes `migrate: true`
// idempotent — a real adapter would track versioned migrations instead.
const SCHEMA_SQL = `
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
`

// Row shapes as SQLite hands them back (JSON columns are still text here).
interface MessagesRow {
  messages_json: string
}
interface RunRow {
  run_id: string
  thread_id: string
  status: string
  started_at: number
  finished_at: number | null
  error: string | null
  error_code: string | null
  usage_json: string | null
  sandbox_key: string | null
  detached_since: number | null
  cancel_requested: number | null
  driver_epoch: number | null
}
interface InterruptRow {
  interrupt_id: string
  run_id: string
  thread_id: string
  status: string
  requested_at: number
  resolved_at: number | null
  payload_json: string
  response_json: string | null
}
interface MetadataRow {
  value_json: string
}

function parseJson<T>(text: string): T {
  return JSON.parse(text) as T
}

// ---------------------------------------------------------------------------
// MessageStore — full-transcript overwrite, keyed by thread.
// ---------------------------------------------------------------------------
function createMessageStore(db: DatabaseSync) {
  const selectStmt = db.prepare(
    'SELECT messages_json FROM messages WHERE thread_id = ?',
  )
  const upsertStmt = db.prepare(
    `INSERT INTO messages (thread_id, messages_json) VALUES (?, ?)
     ON CONFLICT(thread_id) DO UPDATE SET messages_json = excluded.messages_json`,
  )
  return defineMessageStore({
    loadThread(threadId) {
      const row = selectStmt.get(threadId) as MessagesRow | undefined
      // INVARIANT: unknown thread returns [] (never null).
      return Promise.resolve(
        row ? parseJson<Array<ModelMessage>>(row.messages_json) : [],
      )
    },
    saveThread(threadId, messages) {
      // Full replace, not append — `messages` is the authoritative history.
      upsertStmt.run(threadId, JSON.stringify(messages))
      return Promise.resolve()
    },
  })
}

// ---------------------------------------------------------------------------
// RunStore — idempotent create/resume + patch.
// ---------------------------------------------------------------------------
// `status` is stored verbatim as text, so the whole `RunStatus` union round-trips
// — including `'aborted'` — without a schema change. The durable-agent-runs
// fields (`sandboxKey`, `detachedSince`, `cancelRequested`, `driverEpoch`) each
// get their own column: `sandbox_key`/`driver_epoch`/`detached_since` are plain
// scalars (text / integer / integer epoch-ms, matching `finished_at`), and
// `cancel_requested` is an `integer` 0/1 flag — SQLite has no native boolean, so
// this file's convention is the same "integer used as a boolean" SQLite itself
// uses internally.
//
// `RunRecord.error` is the structured `RunError` (`{ message, code? }`) and gets
// two columns rather than one JSON blob: `error` for the provider's prose and
// `error_code` for the stable classification. `code` is precisely the field an
// operator filters and groups by (`WHERE error_code = 'rate_limited'`), which a
// JSON blob would bury, and this file's convention reserves the `_json` suffix
// for columns that really do hold serialized JSON.
function mapRun(row: RunRow): RunRecord {
  return {
    runId: row.run_id,
    threadId: row.thread_id,
    status: row.status as RunStatus,
    startedAt: row.started_at,
    ...(row.finished_at != null ? { finishedAt: row.finished_at } : {}),
    ...(row.error != null
      ? {
          error: {
            message: row.error,
            ...(row.error_code != null ? { code: row.error_code } : {}),
          },
        }
      : {}),
    ...(row.usage_json != null
      ? { usage: parseJson<TokenUsage>(row.usage_json) }
      : {}),
    // Each column is omitted entirely (not surfaced as `null`/coerced `false`)
    // when NULL: `undefined` and `false` mean different things for
    // `cancelRequested`, and a spurious `detachedSince` would make a live run
    // look detached to the reaper.
    ...(row.sandbox_key != null ? { sandboxKey: row.sandbox_key } : {}),
    ...(row.detached_since != null
      ? { detachedSince: row.detached_since }
      : {}),
    ...(row.cancel_requested != null
      ? { cancelRequested: row.cancel_requested !== 0 }
      : {}),
    ...(row.driver_epoch != null ? { driverEpoch: row.driver_epoch } : {}),
  }
}

function createRunStore(db: DatabaseSync) {
  const selectStmt = db.prepare('SELECT * FROM runs WHERE run_id = ?')
  const insertStmt = db.prepare(
    `INSERT INTO runs (run_id, thread_id, status, started_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(run_id) DO NOTHING`,
  )
  const activeStmt = db.prepare(
    `SELECT * FROM runs WHERE thread_id = ? AND status = 'running'
     ORDER BY started_at DESC LIMIT 1`,
  )
  return defineRunStore({
    createOrResume(input) {
      // INVARIANT (idempotency): an existing run is returned unchanged; the
      // insert is a no-op on conflict so startedAt/threadId/status never move.
      const existing = selectStmt.get(input.runId) as RunRow | undefined
      if (existing) return Promise.resolve(mapRun(existing))
      const status: RunStatus = input.status ?? 'running'
      insertStmt.run(input.runId, input.threadId, status, input.startedAt)
      const created = selectStmt.get(input.runId) as RunRow | undefined
      return Promise.resolve(
        created
          ? mapRun(created)
          : {
              runId: input.runId,
              threadId: input.threadId,
              status,
              startedAt: input.startedAt,
            },
      )
    },
    update(runId, patch) {
      // Build a dynamic SET from only the provided fields; empty patch is a
      // no-op, and a missing run_id simply updates zero rows (no throw/create).
      //
      // All eight columns this schema has are mapped here. Never splice a
      // patch key into SQL directly — the column name always comes from this
      // fixed literal set, never from an object key the caller controls.
      //
      // `detachedSince`/`sandboxKey`/`cancelRequested`/`driverEpoch` use
      // `'key' in patch` rather than `patch.key !== undefined`: a reattach
      // clears `detachedSince` by passing it explicitly as `undefined`, which
      // must write NULL, not be filtered out of the SET clause (a filtered-out
      // clear would leave the old value and make every re-attached run look
      // permanently detached to the reaper).
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
        // Both halves of the structured error move together, so a later failure
        // with no `code` cannot leave a stale code from an earlier one behind.
        sets.push('error = ?', 'error_code = ?')
        params.push(patch.error.message, patch.error.code ?? null)
      }
      if (patch.usage !== undefined) {
        sets.push('usage_json = ?')
        params.push(JSON.stringify(patch.usage))
      }
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
      if (sets.length === 0) return Promise.resolve()
      params.push(runId)
      db.prepare(`UPDATE runs SET ${sets.join(', ')} WHERE run_id = ?`).run(
        ...params,
      )
      return Promise.resolve()
    },
    get(runId) {
      const row = selectStmt.get(runId) as RunRow | undefined
      return Promise.resolve(row ? mapRun(row) : null)
    },
    // The most recent still-running run for the thread, so `reconstructChat`
    // reports `activeRun` and a hydrating client (reload / another device /
    // switching back to this thread) tails it via the durability replay. Without
    // this method the contract treats the thread as having no live run.
    findActiveRun(threadId) {
      const row = activeStmt.get(threadId) as RunRow | undefined
      return Promise.resolve(row ? mapRun(row) : null)
    },
  })
}

// ---------------------------------------------------------------------------
// InterruptStore — insert-if-absent, ordered listings.
// ---------------------------------------------------------------------------
function mapInterrupt(row: InterruptRow): InterruptRecord {
  return {
    interruptId: row.interrupt_id,
    runId: row.run_id,
    threadId: row.thread_id,
    status: row.status as InterruptRecord['status'],
    requestedAt: row.requested_at,
    ...(row.resolved_at != null ? { resolvedAt: row.resolved_at } : {}),
    payload: parseJson<Record<string, unknown>>(row.payload_json),
    ...(row.response_json != null
      ? { response: parseJson<unknown>(row.response_json) }
      : {}),
  }
}

function createInterruptStore(db: DatabaseSync) {
  const insertStmt = db.prepare(
    `INSERT INTO interrupts
       (interrupt_id, run_id, thread_id, status, requested_at, payload_json, response_json)
     VALUES (?, ?, ?, 'pending', ?, ?, ?)
     ON CONFLICT(interrupt_id) DO NOTHING`,
  )
  const resolveStmt = db.prepare(
    `UPDATE interrupts SET status = 'resolved', resolved_at = ?, response_json = ?
     WHERE interrupt_id = ?`,
  )
  const cancelStmt = db.prepare(
    `UPDATE interrupts SET status = 'cancelled', resolved_at = ? WHERE interrupt_id = ?`,
  )
  const getStmt = db.prepare('SELECT * FROM interrupts WHERE interrupt_id = ?')
  // Every listing is ORDER BY requested_at ASC — the middleware and testkit
  // rely on this stable ordering.
  const listByThreadStmt = db.prepare(
    'SELECT * FROM interrupts WHERE thread_id = ? ORDER BY requested_at ASC',
  )
  const listPendingByThreadStmt = db.prepare(
    `SELECT * FROM interrupts WHERE thread_id = ? AND status = 'pending'
     ORDER BY requested_at ASC`,
  )
  const listByRunStmt = db.prepare(
    'SELECT * FROM interrupts WHERE run_id = ? ORDER BY requested_at ASC',
  )
  const listPendingByRunStmt = db.prepare(
    `SELECT * FROM interrupts WHERE run_id = ? AND status = 'pending'
     ORDER BY requested_at ASC`,
  )
  const mapRows = (rows: Array<unknown>): Array<InterruptRecord> =>
    (rows as Array<InterruptRow>).map(mapInterrupt)
  return defineInterruptStore({
    create(record) {
      // Insert-if-absent: a duplicate id must never clobber an already-resolved
      // interrupt back to pending.
      insertStmt.run(
        record.interruptId,
        record.runId,
        record.threadId,
        record.requestedAt,
        JSON.stringify(record.payload),
        record.response === undefined ? null : JSON.stringify(record.response),
      )
      return Promise.resolve()
    },
    resolve(interruptId, response) {
      resolveStmt.run(
        Date.now(),
        response === undefined ? null : JSON.stringify(response),
        interruptId,
      )
      return Promise.resolve()
    },
    cancel(interruptId) {
      cancelStmt.run(Date.now(), interruptId)
      return Promise.resolve()
    },
    get(interruptId) {
      const row = getStmt.get(interruptId) as InterruptRow | undefined
      return Promise.resolve(row ? mapInterrupt(row) : null)
    },
    list(threadId) {
      return Promise.resolve(mapRows(listByThreadStmt.all(threadId)))
    },
    listPending(threadId) {
      return Promise.resolve(mapRows(listPendingByThreadStmt.all(threadId)))
    },
    listByRun(runId) {
      return Promise.resolve(mapRows(listByRunStmt.all(runId)))
    },
    listPendingByRun(runId) {
      return Promise.resolve(mapRows(listPendingByRunStmt.all(runId)))
    },
  })
}

// ---------------------------------------------------------------------------
// MetadataStore — scoped key/value JSON.
// ---------------------------------------------------------------------------
function assertStorableMetadata(value: unknown): void {
  // SQL backends store JSON text in a NOT NULL column and cannot persist a
  // nullish value. Reject it with a clear error (matching the sibling backends)
  // instead of a cryptic driver failure; use `delete` to clear a value.
  if (value == null) {
    throw new TypeError(
      `TanStack AI metadata values must be defined, non-null JSON; received ${
        value === undefined ? '`undefined`' : '`null`'
      }. Use \`delete(scope, key)\` to clear a value.`,
    )
  }
}

function createMetadataStore(db: DatabaseSync) {
  const selectStmt = db.prepare(
    'SELECT value_json FROM metadata WHERE scope = ? AND key = ?',
  )
  const upsertStmt = db.prepare(
    `INSERT INTO metadata (scope, key, value_json) VALUES (?, ?, ?)
     ON CONFLICT(scope, key) DO UPDATE SET value_json = excluded.value_json`,
  )
  const deleteStmt = db.prepare(
    'DELETE FROM metadata WHERE scope = ? AND key = ?',
  )
  return defineMetadataStore({
    get(scope, key) {
      const row = selectStmt.get(scope, key) as MetadataRow | undefined
      return Promise.resolve(row ? parseJson<unknown>(row.value_json) : null)
    },
    set(scope, key, value) {
      assertStorableMetadata(value)
      upsertStmt.run(scope, key, JSON.stringify(value))
      return Promise.resolve()
    },
    delete(scope, key) {
      deleteStmt.run(scope, key)
      return Promise.resolve()
    },
  })
}

export interface SqlitePersistenceOptions {
  /** `:memory:`, a filesystem path, or a `file:`-prefixed filesystem path. */
  url: string
  /** Create the TanStack AI tables on open (idempotent). */
  migrate?: boolean
}

/**
 * Build a `ChatPersistence` over a `node:sqlite` database. The returned object
 * also exposes `close()` to release the file handle.
 *
 * Provides all four state stores (`messages`, `runs`, `interrupts`,
 * `metadata`). Cross-worker coordination is a separate seam — a `LockStore`
 * wired with `withLocks`, not a fifth entry in `stores`.
 *
 * Annotate the return as `ChatPersistence`, not bare `AIPersistence`: the
 * unparameterized type is the all-optional store bag, and `withPersistence`
 * rejects it because `stores.messages` is possibly `undefined`.
 */
export function sqlitePersistence(
  options: SqlitePersistenceOptions,
): ChatPersistence & { close: () => void } {
  const filename = normalizeSqliteUrl(options.url)
  ensureParentDirectory(filename)
  const db = new DatabaseSync(filename)
  try {
    if (options.migrate) db.exec(SCHEMA_SQL)
  } catch (error) {
    db.close()
    throw error
  }

  const persistence = defineAIPersistence({
    stores: {
      messages: createMessageStore(db),
      runs: createRunStore(db),
      interrupts: createInterruptStore(db),
      metadata: createMetadataStore(db),
    },
  })

  let closed = false
  return {
    ...persistence,
    close() {
      if (closed) return
      db.close()
      closed = true
    },
  }
}

// ---------------------------------------------------------------------------
// URL / path helpers (kept identical to the packaged Node SQLite factory so the
// `{ url, migrate }` call site is a drop-in).
// ---------------------------------------------------------------------------
function normalizeSqliteUrl(url: string): string {
  if (url === ':memory:' || url === 'file::memory:') return ':memory:'
  if (url.startsWith('file://')) return validateFilename(fileURLToPath(url))
  if (url.startsWith('file:')) {
    return validateFilename(url.slice('file:'.length))
  }
  const isWindowsPath = /^[A-Za-z]:[\\/]/.test(url)
  if (!isWindowsPath && /^[A-Za-z][A-Za-z\d+.-]*:/.test(url)) {
    throw new Error(`Unsupported SQLite URL scheme: ${url}`)
  }
  return validateFilename(url)
}

function validateFilename(filename: string): string {
  if (filename.length === 0 || filename.includes('\0')) {
    throw new Error('SQLite URL must identify a non-empty filesystem path')
  }
  return filename
}

function ensureParentDirectory(filename: string): void {
  if (filename === ':memory:') return
  const parent = dirname(filename)
  if (parent !== '.') mkdirSync(parent, { recursive: true })
}
