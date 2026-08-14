/**
 * A self-contained SQLite persistence backend for TanStack AI, built directly
 * on the `@tanstack/ai-persistence` **core** store contracts and Node's built-in
 * `node:sqlite` driver. No ORM, no extra dependencies — this is the whole thing.
 *
 * It exists as a worked demonstration of "rolling your own" concrete persistence
 * on the core: the four chat state stores (`MessageStore`, `RunStore`,
 * `InterruptStore`, `MetadataStore`) and the three generation stores
 * (`GenerationRunStore`, `ArtifactStore`, `BlobStore`) are implemented here
 * against raw SQL, and the result is a standard `AIPersistence` you hand to
 * `withPersistence(...)` and `withGenerationPersistence(...)`.
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
  defineArtifactStore,
  defineBlobStore,
  defineGenerationRunStore,
  defineInterruptStore,
  defineMessageStore,
  defineMetadataStore,
  defineRunStore,
  resolveBlobRange,
} from '@tanstack/ai-persistence'
import type {
  ModelMessage,
  PersistedArtifactRef,
  TokenUsage,
} from '@tanstack/ai'
import type {
  AIPersistence,
  ArtifactRecord,
  ArtifactStore,
  BlobBody,
  BlobListOptions,
  BlobListPage,
  BlobObject,
  BlobRecord,
  BlobStore,
  GenerationRunRecord,
  GenerationRunStatus,
  GenerationRunStore,
  InterruptRecord,
  InterruptStore,
  MessageStore,
  MetadataStore,
  RunRecord,
  RunStatus,
  RunStore,
} from '@tanstack/ai-persistence'
import {
  SandboxCheckpointConflictError,
  SandboxCheckpointDuplicateIdError,
  SandboxCheckpointError,
  SandboxCheckpointInvalidEntryError,
  SandboxCheckpointInvalidIdError,
  SandboxCheckpointNotHeadError,
  SandboxCheckpointParentMismatchError,
  SandboxCheckpointWriterConflictError,
  SandboxCheckpointWriterLostError,
} from '@tanstack/ai-sandbox'
import type {
  ForkCapableSandboxCheckpointStore,
  SandboxCheckpoint,
  SandboxCheckpointStoreOptions,
  SandboxCheckpointWriter,
  SandboxSnapshotArtifact,
  SandboxSnapshotEntry,
} from '@tanstack/ai-sandbox'

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
CREATE TABLE IF NOT EXISTS generation_runs (
  run_id text PRIMARY KEY NOT NULL,
  thread_id text NOT NULL,
  activity text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  status text NOT NULL,
  started_at integer NOT NULL,
  finished_at integer,
  error_json text,
  result_json text,
  artifacts_json text,
  usage_json text
);
-- findLatestForThread orders by started_at within a thread.
CREATE INDEX IF NOT EXISTS generation_runs_thread_started
  ON generation_runs (thread_id, started_at DESC);
CREATE TABLE IF NOT EXISTS artifacts (
  artifact_id text PRIMARY KEY NOT NULL,
  run_id text NOT NULL,
  thread_id text NOT NULL,
  blob_key text,
  name text NOT NULL,
  mime_type text NOT NULL,
  size integer NOT NULL,
  source_url text,
  created_at integer NOT NULL
);
CREATE INDEX IF NOT EXISTS artifacts_run_order
  ON artifacts (run_id, created_at ASC, artifact_id ASC);
CREATE INDEX IF NOT EXISTS artifacts_thread_order
  ON artifacts (thread_id, created_at ASC, artifact_id ASC);
-- The bytes themselves. \`body\` is a BLOB column, so this file IS the object
-- store; a production adapter would keep metadata here and put bytes in S3/R2.
CREATE TABLE IF NOT EXISTS blobs (
  key text PRIMARY KEY NOT NULL,
  body blob NOT NULL,
  size integer NOT NULL,
  etag text NOT NULL,
  content_type text,
  custom_metadata_json text,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
CREATE TABLE IF NOT EXISTS sandbox_checkpoints (
  checkpoint_id text PRIMARY KEY NOT NULL,
  thread_id text NOT NULL,
  parent_checkpoint_id text,
  created_at integer NOT NULL,
  reason text NOT NULL,
  label text,
  source_run_id text,
  conversation_json text NOT NULL
);
CREATE INDEX IF NOT EXISTS sandbox_checkpoints_thread_order
  ON sandbox_checkpoints (thread_id, created_at ASC, checkpoint_id COLLATE BINARY ASC);
CREATE TABLE IF NOT EXISTS sandbox_checkpoint_entries (
  checkpoint_id text NOT NULL,
  entry_index integer NOT NULL,
  path text NOT NULL,
  kind text NOT NULL,
  blob_key text,
  size integer,
  PRIMARY KEY (checkpoint_id, entry_index)
);
CREATE INDEX IF NOT EXISTS sandbox_checkpoint_entries_checkpoint
  ON sandbox_checkpoint_entries (checkpoint_id, entry_index ASC);
CREATE TABLE IF NOT EXISTS sandbox_checkpoint_artifacts (
  checkpoint_id text NOT NULL,
  artifact_index integer NOT NULL,
  artifact_id text NOT NULL,
  name text NOT NULL,
  mime_type text NOT NULL,
  size integer NOT NULL,
  blob_key text NOT NULL,
  created_at integer NOT NULL,
  PRIMARY KEY (checkpoint_id, artifact_index)
);
CREATE INDEX IF NOT EXISTS sandbox_checkpoint_artifacts_checkpoint
  ON sandbox_checkpoint_artifacts (checkpoint_id, artifact_index ASC);
CREATE TABLE IF NOT EXISTS sandbox_checkpoint_heads (
  thread_id text PRIMARY KEY NOT NULL,
  checkpoint_id text NOT NULL
);
CREATE TABLE IF NOT EXISTS sandbox_checkpoint_writers (
  thread_id text PRIMARY KEY NOT NULL,
  owner_token text NOT NULL,
  fence integer NOT NULL,
  expires_at integer NOT NULL
);
CREATE TABLE IF NOT EXISTS sandbox_checkpoint_fences (
  thread_id text PRIMARY KEY NOT NULL,
  fence integer NOT NULL
);
CREATE TABLE IF NOT EXISTS sandbox_checkpoint_blob_references (
  blob_key text PRIMARY KEY NOT NULL,
  reference_count integer NOT NULL
);
`

/**
 * Columns added to `runs` after the table first shipped.
 *
 * `CREATE TABLE IF NOT EXISTS` does NOT alter a table that already exists, so a
 * `.data/*.db` written by an earlier version of this example has none of these.
 * Without an additive migration that file breaks hard, and early: `createRunStore`
 * prepares its `listReclaimable` statement eagerly, and `node:sqlite` resolves
 * column names at prepare time, so `sqlitePersistence()` itself throws
 * `no such column: detached_since` before a single request is served — `update`
 * would fail the same way.
 *
 * SQLite has no `ADD COLUMN IF NOT EXISTS`, so {@link addMissingColumns} consults
 * `PRAGMA table_info` instead of relying on a caught error. Adding a nullable
 * column needs no table rewrite. A production adapter would keep versioned
 * migration files; this stays honest about being an example.
 */
const RUNS_ADDED_COLUMNS: ReadonlyArray<{ name: string; type: string }> = [
  { name: 'error_code', type: 'text' },
  { name: 'usage_json', type: 'text' },
  { name: 'sandbox_key', type: 'text' },
  { name: 'detached_since', type: 'integer' },
  { name: 'cancel_requested', type: 'integer' },
  { name: 'driver_epoch', type: 'integer' },
]

/** `PRAGMA table_info` row, narrowed to the one field this uses. */
interface TableInfoRow {
  name: string
}

function hasName(value: unknown): value is TableInfoRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof (value as { name: unknown }).name === 'string'
  )
}

/** Bring an existing `runs` table up to the current schema. Idempotent. */
function addMissingColumns(db: DatabaseSync): void {
  const existing = new Set(
    db
      .prepare(`PRAGMA table_info(runs)`)
      .all()
      .filter(hasName)
      .map((row) => row.name),
  )
  // An empty set means the table does not exist at all, in which case SCHEMA_SQL
  // just created it complete and there is nothing to add.
  if (existing.size === 0) return
  for (const column of RUNS_ADDED_COLUMNS) {
    if (existing.has(column.name)) continue
    db.exec(`ALTER TABLE runs ADD COLUMN ${column.name} ${column.type}`)
  }
}

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
interface GenerationRunRow {
  run_id: string
  thread_id: string
  activity: string
  provider: string
  model: string
  status: string
  started_at: number
  finished_at: number | null
  error_json: string | null
  result_json: string | null
  artifacts_json: string | null
  usage_json: string | null
}
interface ArtifactRow {
  artifact_id: string
  run_id: string
  thread_id: string
  blob_key: string | null
  name: string
  mime_type: string
  size: number
  source_url: string | null
  created_at: number
}
/** A `blobs` row without the bytes — what a metadata read selects. */
interface BlobMetaRow {
  key: string
  size: number
  etag: string
  content_type: string | null
  custom_metadata_json: string | null
  created_at: number
  updated_at: number
}
interface BlobRow extends BlobMetaRow {
  body: Uint8Array
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
  // Reclaim candidates: ALL THREE of status === 'running', detachedSince set,
  // and detachedSince <= now - ttlMs (inclusive cutoff — a run detached at
  // exactly the boundary IS reclaimable, so this is `<=` not `<`). `cutoff` is
  // computed in JS and bound as a single `?` parameter; the column names and
  // comparison are fixed literals, so no patch/caller value ever reaches the
  // SQL text itself.
  //
  // `detached_since IS NOT NULL` is written explicitly rather than relied on
  // implicitly: SQLite's `NULL <= ?` already evaluates to NULL (excluding the
  // row), but spelling out the NULL guard keeps the intent legible if this
  // query is ever rewritten to a form where that implicit behavior doesn't
  // hold.
  const reclaimableStmt = db.prepare(
    `SELECT * FROM runs WHERE status = 'running'
       AND detached_since IS NOT NULL
       AND detached_since <= ?`,
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
    // Reclaim candidates for a sandbox reaper to sweep. Not thread-scoped —
    // callers filter the result themselves when they need a subset.
    listReclaimable(opts) {
      const cutoff = opts.now - opts.ttlMs
      const rows = reclaimableStmt.all(
        cutoff,
      ) as Array<unknown> as Array<RunRow>
      return Promise.resolve(rows.map(mapRun))
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

// ---------------------------------------------------------------------------
// GenerationRunStore — the generation counterpart to RunStore.
// ---------------------------------------------------------------------------
//
// Keyed by its own `runId` (the id the generation activity mints), with
// `thread_id` the stable slot successive runs fill. `thread_id` is NOT NULL:
// `findLatestForThread` is the only query that hydrates a run, so a row without
// one could be written and then never read back. This stays a separate table
// from `runs` rather than a status column on it because a generation run
// carries its own activity/provider/model and its own artifacts.
function mapGenerationRun(row: GenerationRunRow): GenerationRunRecord {
  return {
    runId: row.run_id,
    threadId: row.thread_id,
    activity: row.activity,
    provider: row.provider,
    model: row.model,
    status: row.status as GenerationRunStatus,
    startedAt: row.started_at,
    ...(row.finished_at != null ? { finishedAt: row.finished_at } : {}),
    ...(row.error_json != null
      ? { error: parseJson<GenerationRunRecord['error']>(row.error_json) }
      : {}),
    ...(row.result_json != null
      ? { result: parseJson<unknown>(row.result_json) }
      : {}),
    ...(row.artifacts_json != null
      ? {
          artifacts: parseJson<Array<PersistedArtifactRef>>(row.artifacts_json),
        }
      : {}),
    ...(row.usage_json != null
      ? { usage: parseJson<TokenUsage>(row.usage_json) }
      : {}),
  }
}

function createGenerationRunStore(db: DatabaseSync) {
  const selectStmt = db.prepare(
    'SELECT * FROM generation_runs WHERE run_id = ?',
  )
  const insertStmt = db.prepare(
    `INSERT INTO generation_runs
       (run_id, thread_id, activity, provider, model, status, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(run_id) DO NOTHING`,
  )
  const latestStmt = db.prepare(
    `SELECT * FROM generation_runs WHERE thread_id = ?
     ORDER BY started_at DESC LIMIT 1`,
  )
  return defineGenerationRunStore({
    createOrResume(input) {
      // INVARIANT (idempotency): same as the chat RunStore — a second call for
      // a runId returns the stored record and mutates nothing.
      const existing = selectStmt.get(input.runId) as
        | GenerationRunRow
        | undefined
      if (existing) return Promise.resolve(mapGenerationRun(existing))
      const status: GenerationRunStatus = input.status ?? 'running'
      insertStmt.run(
        input.runId,
        input.threadId,
        input.activity,
        input.provider,
        input.model,
        status,
        input.startedAt,
      )
      const created = selectStmt.get(input.runId) as
        | GenerationRunRow
        | undefined
      return Promise.resolve(
        created
          ? mapGenerationRun(created)
          : {
              runId: input.runId,
              threadId: input.threadId,
              activity: input.activity,
              provider: input.provider,
              model: input.model,
              status,
              startedAt: input.startedAt,
            },
      )
    },
    update(runId, patch) {
      // Same dynamic-SET shape as the chat RunStore; `error`, `result`,
      // `artifacts` and `usage` are JSON columns rather than scalars.
      const sets: Array<string> = []
      const params: Array<string | number> = []
      if (patch.status !== undefined) {
        sets.push('status = ?')
        params.push(patch.status)
      }
      if (patch.finishedAt !== undefined) {
        sets.push('finished_at = ?')
        params.push(patch.finishedAt)
      }
      if (patch.error !== undefined) {
        sets.push('error_json = ?')
        params.push(JSON.stringify(patch.error))
      }
      if (patch.result !== undefined) {
        sets.push('result_json = ?')
        params.push(JSON.stringify(patch.result))
      }
      if (patch.artifacts !== undefined) {
        sets.push('artifacts_json = ?')
        params.push(JSON.stringify(patch.artifacts))
      }
      if (patch.usage !== undefined) {
        sets.push('usage_json = ?')
        params.push(JSON.stringify(patch.usage))
      }
      if (sets.length === 0) return Promise.resolve()
      params.push(runId)
      db.prepare(
        `UPDATE generation_runs SET ${sets.join(', ')} WHERE run_id = ?`,
      ).run(...params)
      return Promise.resolve()
    },
    get(runId) {
      const row = selectStmt.get(runId) as GenerationRunRow | undefined
      return Promise.resolve(row ? mapGenerationRun(row) : null)
    },
    // The most recent run linked to a thread. `reconstructGeneration` calls
    // this so a `persistence: true` client hydrates the last generation for its
    // thread from the stable thread id alone, with no run id to hand.
    findLatestForThread(threadId) {
      const row = latestStmt.get(threadId) as GenerationRunRow | undefined
      return Promise.resolve(row ? mapGenerationRun(row) : null)
    },
  })
}

// ---------------------------------------------------------------------------
// ArtifactStore — one metadata row per generated file.
// ---------------------------------------------------------------------------
function mapArtifact(row: ArtifactRow): ArtifactRecord {
  return {
    artifactId: row.artifact_id,
    runId: row.run_id,
    threadId: row.thread_id,
    ...(row.blob_key != null ? { blobKey: row.blob_key } : {}),
    name: row.name,
    mimeType: row.mime_type,
    size: row.size,
    ...(row.source_url != null ? { sourceUrl: row.source_url } : {}),
    createdAt: row.created_at,
  }
}

function createArtifactStore(db: DatabaseSync) {
  const upsertStmt = db.prepare(
    `INSERT INTO artifacts
       (artifact_id, run_id, thread_id, blob_key, name, mime_type, size, source_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(artifact_id) DO UPDATE SET
       run_id = excluded.run_id, thread_id = excluded.thread_id,
       blob_key = excluded.blob_key, name = excluded.name,
       mime_type = excluded.mime_type, size = excluded.size,
       source_url = excluded.source_url, created_at = excluded.created_at`,
  )
  const selectStmt = db.prepare('SELECT * FROM artifacts WHERE artifact_id = ?')
  const byRunStmt = db.prepare(
    'SELECT * FROM artifacts WHERE run_id = ? ORDER BY created_at ASC, artifact_id ASC',
  )
  const byThreadStmt = db.prepare(
    'SELECT * FROM artifacts WHERE thread_id = ? ORDER BY created_at ASC, artifact_id ASC',
  )
  const deleteStmt = db.prepare('DELETE FROM artifacts WHERE artifact_id = ?')
  const deleteForRunStmt = db.prepare('DELETE FROM artifacts WHERE run_id = ?')
  return defineArtifactStore({
    save(record) {
      // Upsert, not insert-if-absent: unlike an interrupt, re-saving an
      // artifact is a correction of its own metadata, never a state rollback.
      upsertStmt.run(
        record.artifactId,
        record.runId,
        record.threadId,
        record.blobKey ?? null,
        record.name,
        record.mimeType,
        record.size,
        record.sourceUrl ?? null,
        record.createdAt,
      )
      return Promise.resolve()
    },
    get(artifactId) {
      const row = selectStmt.get(artifactId) as ArtifactRow | undefined
      return Promise.resolve(row ? mapArtifact(row) : null)
    },
    list(runId) {
      const rows: Array<unknown> = byRunStmt.all(runId)
      return Promise.resolve((rows as Array<ArtifactRow>).map(mapArtifact))
    },
    listForThread(threadId) {
      const rows: Array<unknown> = byThreadStmt.all(threadId)
      return Promise.resolve((rows as Array<ArtifactRow>).map(mapArtifact))
    },
    delete(artifactId) {
      deleteStmt.run(artifactId)
      return Promise.resolve()
    },
    deleteForRun(runId) {
      deleteForRunStmt.run(runId)
      return Promise.resolve()
    },
  })
}

// ---------------------------------------------------------------------------
// BlobStore — the bytes, in a BLOB column.
// ---------------------------------------------------------------------------
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

async function bytesFromBlobBody(body: BlobBody): Promise<Uint8Array> {
  if (typeof body === 'string') return textEncoder.encode(body)
  if (body instanceof ArrayBuffer) return new Uint8Array(body.slice(0))
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(
      body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    )
  }
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer())

  // ReadableStream<Uint8Array>: drain it into one buffer.
  const reader = body.getReader()
  const chunks: Array<Uint8Array> = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.byteLength
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function mapBlobRecord(row: BlobMetaRow): BlobRecord {
  return {
    key: row.key,
    size: row.size,
    etag: row.etag,
    ...(row.content_type != null ? { contentType: row.content_type } : {}),
    ...(row.custom_metadata_json != null
      ? {
          customMetadata: parseJson<Record<string, string>>(
            row.custom_metadata_json,
          ),
        }
      : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function blobObject(
  record: BlobRecord,
  bytes: Uint8Array,
  range?: { offset: number; length: number },
): BlobObject {
  return {
    ...record,
    // `size` keeps describing the whole object; `range` describes these bytes.
    ...(range ? { range } : {}),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice())
        controller.close()
      },
    }),
    arrayBuffer() {
      const copy = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(copy).set(bytes)
      return Promise.resolve(copy)
    },
    text: () => Promise.resolve(textDecoder.decode(bytes)),
  }
}

function createBlobStore(db: DatabaseSync) {
  const upsertStmt = db.prepare(
    `INSERT INTO blobs
       (key, body, size, etag, content_type, custom_metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       body = excluded.body, size = excluded.size, etag = excluded.etag,
       content_type = excluded.content_type,
       custom_metadata_json = excluded.custom_metadata_json,
       updated_at = excluded.updated_at`,
  )
  const selectStmt = db.prepare('SELECT * FROM blobs WHERE key = ?')
  // Everything EXCEPT `body`. A ranged read needs the metadata to clamp
  // against, and `SELECT *` would materialize the whole object just to hand
  // back a slice of it — the cost a range request exists to avoid.
  const selectMetaStmt = db.prepare(
    `SELECT key, size, etag, content_type, custom_metadata_json,
            created_at, updated_at
       FROM blobs WHERE key = ?`,
  )
  const rangeStmt = db.prepare(
    'SELECT substr(body, ?, ?) AS body FROM blobs WHERE key = ?',
  )
  const createdAtStmt = db.prepare('SELECT created_at FROM blobs WHERE key = ?')
  const deleteStmt = db.prepare('DELETE FROM blobs WHERE key = ?')
  // Prefix match via `substr(...) = ?` rather than LIKE: SQLite's LIKE is
  // case-INsensitive for ASCII and treats `%`/`_` as wildcards, and the
  // contract says a prefix matches literally and case-sensitively. Letting
  // SQLite compute `length(?)` keeps the character count in SQLite's terms
  // instead of JS UTF-16 code units.
  const PREFIX_WHERE = 'substr(key, 1, length(?)) = ?'
  // Etags only have to change when the bytes do; a per-put counter keeps them
  // distinct even for two writes inside the same millisecond.
  let putSequence = 0

  return defineBlobStore({
    async put(key, body, options) {
      const bytes = await bytesFromBlobBody(body)
      const now = Date.now()
      const prior = createdAtStmt.get(key) as { created_at: number } | undefined
      // First write stamps createdAt; an overwrite keeps it and moves updatedAt.
      const createdAt = prior?.created_at ?? now
      const etag = `${now}-${putSequence++}`
      const contentType =
        options?.contentType ?? (body instanceof Blob ? body.type : '')
      const record: BlobRecord = {
        key,
        size: bytes.byteLength,
        etag,
        ...(contentType ? { contentType } : {}),
        ...(options?.customMetadata
          ? { customMetadata: { ...options.customMetadata } }
          : {}),
        createdAt,
        updatedAt: now,
      }
      upsertStmt.run(
        key,
        bytes,
        record.size ?? bytes.byteLength,
        etag,
        record.contentType ?? null,
        record.customMetadata ? JSON.stringify(record.customMetadata) : null,
        createdAt,
        now,
      )
      return record
    },
    get(key, options) {
      if (!options?.range) {
        const row = selectStmt.get(key) as BlobRow | undefined
        return Promise.resolve(
          row ? blobObject(mapBlobRecord(row), row.body) : null,
        )
      }
      // Metadata WITHOUT the bytes, then the slice: clamp the request to the
      // object the way every byte-storing backend must. `resolveBlobRange` is
      // the shared implementation, and it throws on an offset past the end so
      // an unsatisfiable range can't be served as a 206 — a route answers 416
      // from `record.size` before getting here.
      const meta = selectMetaStmt.get(key) as BlobMetaRow | undefined
      if (!meta) return Promise.resolve(null)
      const served = resolveBlobRange(meta.size, options.range)
      // Slice in SQLite (1-based, byte-wise over a BLOB), so seeking inside a
      // video reads a few hundred KB and not the whole clip. Reading the row
      // with `SELECT *` first would have loaded it anyway, which is the whole
      // cost a range request exists to avoid.
      const sliced = rangeStmt.get(served.offset + 1, served.length, key) as
        | Pick<BlobRow, 'body'>
        | undefined
      if (!sliced) return Promise.resolve(null)
      return Promise.resolve(
        blobObject(mapBlobRecord(meta), sliced.body, served),
      )
    },
    head(key) {
      // Metadata only: never pull the bytes for a question about the object.
      const row = selectMetaStmt.get(key) as BlobMetaRow | undefined
      return Promise.resolve(row ? mapBlobRecord(row) : null)
    },
    delete(key) {
      deleteStmt.run(key)
      return Promise.resolve()
    },
    list(options?: BlobListOptions): Promise<BlobListPage> {
      if (options?.limit === 0) {
        return Promise.resolve({ objects: [], truncated: false })
      }
      const prefix = options?.prefix ?? ''
      const params: Array<string | number> = [prefix, prefix]
      let where = PREFIX_WHERE
      if (options?.cursor !== undefined) {
        // Keyset paging: strictly-following keys, in the same byte order as the
        // sort, so a full scan visits every key exactly once.
        where += ' AND key > ?'
        params.push(options.cursor)
      }
      let sql = `SELECT * FROM blobs WHERE ${where} ORDER BY key ASC`
      const limit = options?.limit
      // One extra row detects truncation without a second COUNT query.
      if (limit !== undefined) {
        sql += ' LIMIT ?'
        params.push(limit + 1)
      }
      const selected: Array<unknown> = db.prepare(sql).all(...params)
      const rows = (selected as Array<BlobRow>).map(mapBlobRecord)
      if (limit !== undefined && rows.length > limit) {
        const objects = rows.slice(0, limit)
        const cursor = objects.at(-1)?.key
        return Promise.resolve({
          objects,
          truncated: true,
          ...(cursor !== undefined ? { cursor } : {}),
        })
      }
      return Promise.resolve({ objects: rows, truncated: false })
    },
  })
}

export interface SqlitePersistenceOptions {
  /** `:memory:`, a filesystem path, or a `file:`-prefixed filesystem path. */
  url: string
  /** Create the TanStack AI tables on open (idempotent). */
  migrate?: boolean
}

function checkpointError(
  code: ConstructorParameters<typeof SandboxCheckpointError>[0],
  message: string,
): never {
  throw new SandboxCheckpointError(code, message)
}

function cloneCheckpoint<T>(value: T): T {
  return structuredClone(value)
}

function checkpointKeys(checkpoint: SandboxCheckpoint): Array<string> {
  return [
    ...new Set([
      ...checkpoint.files.flatMap((entry) =>
        entry.kind === 'file' ? [entry.blobKey] : [],
      ),
      ...checkpoint.artifacts.map((artifact) => artifact.blobKey),
    ]),
  ]
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) return true
      index++
    } else if (code >= 0xdc00 && code <= 0xdfff) return true
  }
  return false
}

function assertCheckpointId(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\0') ||
    hasUnpairedSurrogate(value)
  ) {
    throw new SandboxCheckpointInvalidIdError(
      `${label} must be a non-empty well-formed Unicode string`,
    )
  }
}

function rollbackIfActive(db: DatabaseSync): void {
  try {
    db.exec('ROLLBACK')
  } catch {
    // SQLite can already abort the transaction. Keep the original error.
  }
}

function assertCheckpoint(checkpoint: SandboxCheckpoint): void {
  assertCheckpointId(checkpoint.id, 'Checkpoint id')
  assertCheckpointId(checkpoint.threadId, 'Checkpoint thread id')
  if (checkpoint.parentCheckpointId !== null)
    assertCheckpointId(checkpoint.parentCheckpointId, 'Parent checkpoint id')
  if (!Number.isFinite(checkpoint.createdAt))
    throw new SandboxCheckpointInvalidEntryError(
      'Checkpoint createdAt must be a finite number',
    )
  if (!Array.isArray(checkpoint.files))
    throw new SandboxCheckpointInvalidEntryError(
      'Checkpoint files must be an array',
    )
  if (!Array.isArray(checkpoint.artifacts))
    throw new SandboxCheckpointInvalidEntryError(
      'Checkpoint artifacts must be an array',
    )
  const files: ReadonlyArray<SandboxSnapshotEntry> = checkpoint.files
  const artifacts: ReadonlyArray<SandboxSnapshotArtifact> = checkpoint.artifacts
  const paths = new Set<string>()
  const kinds = new Map<string, 'file' | 'dir'>()
  for (const entry of files) {
    if (entry === null || typeof entry !== 'object')
      throw new SandboxCheckpointInvalidEntryError(
        'Checkpoint entry must be an object',
      )
    if (
      !entry.path ||
      paths.has(entry.path) ||
      entry.path.includes('\0') ||
      entry.path.startsWith('/') ||
      entry.path.startsWith('\\') ||
      /^[A-Za-z]:([\\/]|$)/.test(entry.path) ||
      entry.path.includes('\\') ||
      entry.path
        .split('/')
        .some((part) => !part || part === '.' || part === '..')
    )
      throw new SandboxCheckpointInvalidEntryError(
        'Checkpoint entry path must be a normalized workspace-relative path',
      )
    for (
      let separator = entry.path.indexOf('/');
      separator !== -1;
      separator = entry.path.indexOf('/', separator + 1)
    ) {
      if (kinds.get(entry.path.slice(0, separator)) === 'file')
        throw new SandboxCheckpointInvalidEntryError(
          'Checkpoint entry cannot be beneath a file',
        )
    }
    if (
      entry.kind === 'file' &&
      [...kinds.keys()].some((path) => path.startsWith(`${entry.path}/`))
    )
      throw new SandboxCheckpointInvalidEntryError(
        'Checkpoint file cannot be an ancestor of another entry',
      )
    paths.add(entry.path)
    if (entry.kind === 'file') {
      if (
        !/^sandbox-files\/sha256\/[0-9a-f]{64}$/.test(entry.blobKey) ||
        !Number.isSafeInteger(entry.size) ||
        entry.size < 0
      ) {
        throw new SandboxCheckpointInvalidEntryError(
          'File entries require a valid blobKey and size',
        )
      }
    } else if (entry.kind === 'dir') {
      if ('blobKey' in entry || 'size' in entry)
        throw new SandboxCheckpointInvalidEntryError(
          'Directory entries cannot contain file fields',
        )
    } else {
      throw new SandboxCheckpointInvalidEntryError(
        'Checkpoint entry kind must be file or dir',
      )
    }
    kinds.set(entry.path, entry.kind)
  }
  for (const artifact of artifacts) {
    if (artifact === null || typeof artifact !== 'object')
      throw new SandboxCheckpointInvalidEntryError(
        'Checkpoint artifact must be an object',
      )
    if (
      !artifact.artifactId ||
      !artifact.name ||
      !artifact.mimeType ||
      !/^sandbox-artifacts\/sha256\/[0-9a-f]{64}$/.test(artifact.blobKey) ||
      !Number.isSafeInteger(artifact.size) ||
      artifact.size < 0 ||
      !Number.isFinite(artifact.createdAt)
    )
      throw new SandboxCheckpointInvalidEntryError(
        'Checkpoint artifact has invalid fields',
      )
  }
}

function createCheckpointStore(
  db: DatabaseSync,
  options: SandboxCheckpointStoreOptions = {},
): ForkCapableSandboxCheckpointStore {
  const now = options.now ?? (() => Date.now())
  const leaseDurationMs = options.leaseDurationMs ?? 120_000
  const renewAfterMs = options.renewAfterMs ?? 45_000
  if (
    !Number.isFinite(leaseDurationMs) ||
    leaseDurationMs <= 0 ||
    !Number.isFinite(renewAfterMs) ||
    renewAfterMs <= 0 ||
    renewAfterMs >= leaseDurationMs
  )
    throw new Error('Invalid checkpoint writer lease options')
  const getCheckpoint = (id: string): SandboxCheckpoint | null => {
    const header = db
      .prepare('SELECT * FROM sandbox_checkpoints WHERE checkpoint_id = ?')
      .get(id) as
      | {
          checkpoint_id: string
          thread_id: string
          parent_checkpoint_id: string | null
          created_at: number
          reason: SandboxCheckpoint['reason']
          label: string | null
          source_run_id: string | null
          conversation_json: string
        }
      | undefined
    if (!header) return null
    const files = db
      .prepare(
        'SELECT * FROM sandbox_checkpoint_entries WHERE checkpoint_id = ? ORDER BY entry_index ASC',
      )
      .all(id) as Array<{
      path: string
      kind: 'file' | 'dir'
      blob_key: string | null
      size: number | null
    }>
    const artifacts = db
      .prepare(
        'SELECT * FROM sandbox_checkpoint_artifacts WHERE checkpoint_id = ? ORDER BY artifact_index ASC',
      )
      .all(id) as Array<{
      artifact_id: string
      name: string
      mime_type: string
      size: number
      blob_key: string
      created_at: number
    }>
    return {
      id: header.checkpoint_id,
      threadId: header.thread_id,
      parentCheckpointId: header.parent_checkpoint_id,
      createdAt: header.created_at,
      reason: header.reason,
      ...(header.label === null ? {} : { label: header.label }),
      ...(header.source_run_id === null
        ? {}
        : { sourceRunId: header.source_run_id }),
      files: files.map(
        (row): SandboxSnapshotEntry =>
          row.kind === 'dir'
            ? { path: row.path, kind: 'dir' }
            : {
                path: row.path,
                kind: 'file',
                blobKey: row.blob_key!,
                size: row.size!,
              },
      ),
      conversation: JSON.parse(header.conversation_json),
      artifacts: artifacts.map(
        (row): SandboxSnapshotArtifact => ({
          artifactId: row.artifact_id,
          name: row.name,
          mimeType: row.mime_type,
          size: row.size,
          blobKey: row.blob_key,
          createdAt: row.created_at,
        }),
      ),
    }
  }
  const assertWriter = (writer: SandboxCheckpointWriter, threadId: string) => {
    const row = db
      .prepare(
        'SELECT owner_token, fence, expires_at FROM sandbox_checkpoint_writers WHERE thread_id = ?',
      )
      .get(threadId) as
      | { owner_token: string; fence: number; expires_at: number }
      | undefined
    if (
      !row ||
      writer.threadId !== threadId ||
      row.owner_token !== writer.ownerToken ||
      row.fence !== writer.fence ||
      row.expires_at <= now()
    )
      throw new SandboxCheckpointWriterLostError(
        `Checkpoint writer lease for thread '${threadId}' is no longer current`,
      )
  }
  const writeCheckpoint = (
    checkpoint: SandboxCheckpoint,
    conversationJson: string,
  ) => {
    db.prepare(
      'INSERT INTO sandbox_checkpoints (checkpoint_id, thread_id, parent_checkpoint_id, created_at, reason, label, source_run_id, conversation_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      checkpoint.id,
      checkpoint.threadId,
      checkpoint.parentCheckpointId,
      checkpoint.createdAt,
      checkpoint.reason,
      checkpoint.label ?? null,
      checkpoint.sourceRunId ?? null,
      conversationJson,
    )
    const entry = db.prepare(
      'INSERT INTO sandbox_checkpoint_entries (checkpoint_id, entry_index, path, kind, blob_key, size) VALUES (?, ?, ?, ?, ?, ?)',
    )
    checkpoint.files.forEach((value, index) =>
      entry.run(
        checkpoint.id,
        index,
        value.path,
        value.kind,
        value.kind === 'file' ? value.blobKey : null,
        value.kind === 'file' ? value.size : null,
      ),
    )
    const artifact = db.prepare(
      'INSERT INTO sandbox_checkpoint_artifacts (checkpoint_id, artifact_index, artifact_id, name, mime_type, size, blob_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    checkpoint.artifacts.forEach((value, index) =>
      artifact.run(
        checkpoint.id,
        index,
        value.artifactId,
        value.name,
        value.mimeType,
        value.size,
        value.blobKey,
        value.createdAt,
      ),
    )
  }
  const incrementReferences = (checkpoint: SandboxCheckpoint) => {
    const statement = db.prepare(
      'INSERT INTO sandbox_checkpoint_blob_references (blob_key, reference_count) VALUES (?, 1) ON CONFLICT(blob_key) DO UPDATE SET reference_count = reference_count + 1',
    )
    checkpointKeys(checkpoint).forEach((key) => statement.run(key))
  }
  return {
    async get(id) {
      assertCheckpointId(id, 'Checkpoint id')
      const value = getCheckpoint(id)
      return value && cloneCheckpoint(value)
    },
    async list(threadId) {
      assertCheckpointId(threadId, 'Thread id')
      const rows = db
        .prepare(
          'SELECT checkpoint_id FROM sandbox_checkpoints WHERE thread_id = ? ORDER BY created_at ASC, checkpoint_id COLLATE BINARY ASC',
        )
        .all(threadId) as Array<{ checkpoint_id: string }>
      return rows.map((row) =>
        cloneCheckpoint(getCheckpoint(row.checkpoint_id)!),
      )
    },
    async getHead(threadId) {
      assertCheckpointId(threadId, 'Thread id')
      const row = db
        .prepare(
          'SELECT checkpoint_id FROM sandbox_checkpoint_heads WHERE thread_id = ?',
        )
        .get(threadId) as { checkpoint_id: string } | undefined
      return row?.checkpoint_id ?? null
    },
    async append(input) {
      const checkpoint = cloneCheckpoint(input.checkpoint)
      assertCheckpoint(checkpoint)
      if (input.expectedHeadId !== null)
        assertCheckpointId(input.expectedHeadId, 'Expected head id')
      if (input.writer.threadId !== checkpoint.threadId)
        throw new SandboxCheckpointWriterLostError(
          'Checkpoint writer thread does not match checkpoint thread',
        )
      const conversationJson = JSON.stringify(checkpoint.conversation)
      db.exec('BEGIN IMMEDIATE')
      try {
        assertWriter(input.writer, checkpoint.threadId)
        if (getCheckpoint(checkpoint.id))
          throw new SandboxCheckpointDuplicateIdError(
            `Checkpoint '${checkpoint.id}' already exists`,
          )
        const head =
          (
            db
              .prepare(
                'SELECT checkpoint_id FROM sandbox_checkpoint_heads WHERE thread_id = ?',
              )
              .get(checkpoint.threadId) as { checkpoint_id: string } | undefined
          )?.checkpoint_id ?? null
        if (head !== input.expectedHeadId)
          throw new SandboxCheckpointConflictError(
            `Expected head '${input.expectedHeadId}', but thread '${checkpoint.threadId}' is at '${head}'`,
          )
        if (checkpoint.parentCheckpointId !== input.expectedHeadId)
          throw new SandboxCheckpointParentMismatchError(
            `Checkpoint '${checkpoint.id}' parent does not match expected head`,
          )
        writeCheckpoint(checkpoint, conversationJson)
        db.prepare(
          'INSERT INTO sandbox_checkpoint_heads (thread_id, checkpoint_id) VALUES (?, ?) ON CONFLICT(thread_id) DO UPDATE SET checkpoint_id = excluded.checkpoint_id',
        ).run(checkpoint.threadId, checkpoint.id)
        incrementReferences(checkpoint)
        db.exec('COMMIT')
      } catch (error) {
        rollbackIfActive(db)
        throw error
      }
      return { headId: checkpoint.id }
    },
    async deleteHead(input) {
      assertCheckpointId(input.threadId, 'Thread id')
      assertCheckpointId(input.checkpointId, 'Checkpoint id')
      db.exec('BEGIN IMMEDIATE')
      try {
        assertWriter(input.writer, input.threadId)
        const head =
          (
            db
              .prepare(
                'SELECT checkpoint_id FROM sandbox_checkpoint_heads WHERE thread_id = ?',
              )
              .get(input.threadId) as { checkpoint_id: string } | undefined
          )?.checkpoint_id ?? null
        if (head !== input.checkpointId)
          throw new SandboxCheckpointNotHeadError(
            `Checkpoint '${input.checkpointId}' is not the current head of thread '${input.threadId}'`,
          )
        const checkpoint = getCheckpoint(input.checkpointId)
        if (!checkpoint)
          throw new SandboxCheckpointNotHeadError(
            `Checkpoint '${input.checkpointId}' does not exist`,
          )
        db.prepare(
          'DELETE FROM sandbox_checkpoint_entries WHERE checkpoint_id = ?',
        ).run(checkpoint.id)
        db.prepare(
          'DELETE FROM sandbox_checkpoint_artifacts WHERE checkpoint_id = ?',
        ).run(checkpoint.id)
        db.prepare(
          'DELETE FROM sandbox_checkpoints WHERE checkpoint_id = ?',
        ).run(checkpoint.id)
        if (checkpoint.parentCheckpointId)
          db.prepare(
            'UPDATE sandbox_checkpoint_heads SET checkpoint_id = ? WHERE thread_id = ?',
          ).run(checkpoint.parentCheckpointId, input.threadId)
        else
          db.prepare(
            'DELETE FROM sandbox_checkpoint_heads WHERE thread_id = ?',
          ).run(input.threadId)
        const decrement = db.prepare(
          'UPDATE sandbox_checkpoint_blob_references SET reference_count = reference_count - 1 WHERE blob_key = ?',
        )
        checkpointKeys(checkpoint).forEach((key) => decrement.run(key))
        db.exec(
          'DELETE FROM sandbox_checkpoint_blob_references WHERE reference_count <= 0',
        )
        db.exec('COMMIT')
      } catch (error) {
        rollbackIfActive(db)
        throw error
      }
    },
    async acquireWriter(threadId) {
      assertCheckpointId(threadId, 'Thread id')
      db.exec('BEGIN IMMEDIATE')
      let lease: { ownerToken: string; fence: number; expiresAt: number }
      try {
        const current = db
          .prepare(
            'SELECT expires_at FROM sandbox_checkpoint_writers WHERE thread_id = ?',
          )
          .get(threadId) as { expires_at: number } | undefined
        if (current && current.expires_at > now())
          throw new SandboxCheckpointWriterConflictError(
            `Thread '${threadId}' already has an active checkpoint writer`,
          )
        const prior = db
          .prepare(
            'SELECT fence FROM sandbox_checkpoint_fences WHERE thread_id = ?',
          )
          .get(threadId) as { fence: number } | undefined
        const fence = (prior?.fence ?? 0) + 1
        db.prepare(
          'INSERT INTO sandbox_checkpoint_fences (thread_id, fence) VALUES (?, ?) ON CONFLICT(thread_id) DO UPDATE SET fence = excluded.fence',
        ).run(threadId, fence)
        lease = {
          ownerToken: crypto.randomUUID(),
          fence,
          expiresAt: now() + leaseDurationMs,
        }
        db.prepare(
          'INSERT INTO sandbox_checkpoint_writers (thread_id, owner_token, fence, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(thread_id) DO UPDATE SET owner_token = excluded.owner_token, fence = excluded.fence, expires_at = excluded.expires_at',
        ).run(threadId, lease.ownerToken, fence, lease.expiresAt)
        db.exec('COMMIT')
      } catch (error) {
        rollbackIfActive(db)
        throw error
      }
      return {
        threadId,
        ownerToken: lease!.ownerToken,
        fence: lease!.fence,
        get expiresAt() {
          return lease!.expiresAt
        },
        renewAfterMs,
        renew: async () => {
          db.exec('BEGIN IMMEDIATE')
          try {
            assertWriter(
              { threadId, ownerToken: lease!.ownerToken, fence: lease!.fence },
              threadId,
            )
            const expiresAt = now() + leaseDurationMs
            db.prepare(
              'UPDATE sandbox_checkpoint_writers SET expires_at = ? WHERE thread_id = ? AND owner_token = ? AND fence = ?',
            ).run(expiresAt, threadId, lease!.ownerToken, lease!.fence)
            lease!.expiresAt = expiresAt
            db.exec('COMMIT')
            return { expiresAt }
          } catch (error) {
            rollbackIfActive(db)
            throw error
          }
        },
        release: async () => {
          db.prepare(
            'DELETE FROM sandbox_checkpoint_writers WHERE thread_id = ? AND owner_token = ? AND fence = ?',
          ).run(threadId, lease!.ownerToken, lease!.fence)
        },
      }
    },
    async listBlobReferences() {
      return db
        .prepare(
          'SELECT blob_key AS key, reference_count AS "references" FROM sandbox_checkpoint_blob_references ORDER BY blob_key COLLATE BINARY ASC',
        )
        .all() as Array<{ key: string; references: number }>
    },
    async forkFromCheckpoint(input) {
      const staged = {
        sourceThreadId: input.sourceThreadId,
        sourceCheckpointId: input.sourceCheckpointId,
        destinationThreadId: input.destinationThreadId,
        destinationCheckpointId: input.destinationCheckpointId,
        createdAt: input.createdAt,
        writer: {
          threadId: input.writer.threadId,
          ownerToken: input.writer.ownerToken,
          fence: input.writer.fence,
        },
      }
      assertCheckpointId(staged.sourceThreadId, 'Source thread id')
      assertCheckpointId(staged.sourceCheckpointId, 'Source checkpoint id')
      assertCheckpointId(staged.destinationThreadId, 'Destination thread id')
      assertCheckpointId(
        staged.destinationCheckpointId,
        'Destination checkpoint id',
      )
      if (!Number.isFinite(staged.createdAt))
        throw new SandboxCheckpointInvalidEntryError(
          'Fork checkpoint createdAt must be a finite number',
        )
      db.exec('BEGIN IMMEDIATE')
      try {
        if (staged.sourceThreadId === staged.destinationThreadId)
          checkpointError(
            'SANDBOX_SNAPSHOT_FORK_SOURCE_THREAD_MISMATCH',
            'Source and destination threads must differ',
          )
        const source = getCheckpoint(staged.sourceCheckpointId)
        if (!source)
          checkpointError(
            'SANDBOX_SNAPSHOT_FORK_SOURCE_NOT_FOUND',
            'Source checkpoint was not found',
          )
        if (source.threadId !== staged.sourceThreadId)
          checkpointError(
            'SANDBOX_SNAPSHOT_FORK_SOURCE_THREAD_MISMATCH',
            'Source checkpoint belongs to another thread',
          )
        assertWriter(staged.writer, staged.destinationThreadId)
        const nonempty = db
          .prepare(
            'SELECT 1 FROM messages WHERE thread_id = ? UNION ALL SELECT 1 FROM runs WHERE thread_id = ? UNION ALL SELECT 1 FROM generation_runs WHERE thread_id = ? UNION ALL SELECT 1 FROM interrupts WHERE thread_id = ? UNION ALL SELECT 1 FROM artifacts WHERE thread_id = ? UNION ALL SELECT 1 FROM sandbox_checkpoints WHERE thread_id = ? UNION ALL SELECT 1 FROM sandbox_checkpoint_heads WHERE thread_id = ? UNION ALL SELECT 1 FROM sandbox_checkpoints WHERE checkpoint_id = ? LIMIT 1',
          )
          .get(
            staged.destinationThreadId,
            staged.destinationThreadId,
            staged.destinationThreadId,
            staged.destinationThreadId,
            staged.destinationThreadId,
            staged.destinationThreadId,
            staged.destinationThreadId,
            staged.destinationCheckpointId,
          )
        if (nonempty)
          checkpointError(
            'SANDBOX_SNAPSHOT_FORK_DESTINATION_NOT_EMPTY',
            'Destination thread is not empty',
          )
        const checkpoint: SandboxCheckpoint = cloneCheckpoint({
          id: staged.destinationCheckpointId,
          threadId: staged.destinationThreadId,
          parentCheckpointId: null,
          createdAt: staged.createdAt,
          reason: 'fork-root',
          files: source.files,
          conversation: source.conversation,
          artifacts: source.artifacts,
        })
        assertCheckpoint(checkpoint)
        const conversationJson = JSON.stringify(checkpoint.conversation)
        for (const key of checkpointKeys(source)) {
          const reference = db
            .prepare(
              'SELECT reference_count FROM sandbox_checkpoint_blob_references WHERE blob_key = ?',
            )
            .get(key) as { reference_count: number } | undefined
          if (!reference || reference.reference_count <= 0)
            throw new SandboxCheckpointInvalidEntryError(
              `Source checkpoint blob '${key}' has no positive reference count`,
            )
        }
        db.prepare(
          'INSERT INTO messages (thread_id, messages_json) VALUES (?, ?)',
        ).run(checkpoint.threadId, conversationJson)
        writeCheckpoint(checkpoint, conversationJson)
        db.prepare(
          'INSERT INTO sandbox_checkpoint_heads (thread_id, checkpoint_id) VALUES (?, ?)',
        ).run(checkpoint.threadId, checkpoint.id)
        incrementReferences(checkpoint)
        db.exec('COMMIT')
        return { checkpoint: cloneCheckpoint(checkpoint) }
      } catch (error) {
        rollbackIfActive(db)
        throw error
      }
    },
  }
}

/**
 * Every store this backend provides, spelled out.
 *
 * Parameterize `AIPersistence` rather than leaving it bare: the unparameterized
 * type is the all-optional store bag, and `withPersistence` /
 * `withGenerationPersistence` reject it because `stores.messages` /
 * `stores.generationRuns` are possibly `undefined`. Spelling out all seven is
 * what makes one backend serve both middlewares — there is no packaged named
 * shape for "chat + generation" because the combination is a product choice.
 */
export type SqliteAIPersistence = AIPersistence<{
  messages: MessageStore
  runs: RunStore
  interrupts: InterruptStore
  metadata: MetadataStore
  generationRuns: GenerationRunStore
  artifacts: ArtifactStore
  blobs: BlobStore
}>

/**
 * Build an `AIPersistence` over a `node:sqlite` database. The returned object
 * also exposes `close()` to release the file handle.
 *
 * Provides all four state stores (`messages`, `runs`, `interrupts`, `metadata`)
 * AND all three generation stores (`generationRuns`, `artifacts`, `blobs`), so
 * the same instance backs `withPersistence` and `withGenerationPersistence`.
 * Cross-worker coordination is a separate seam — a `LockStore` wired with
 * `withLocks`, not an eighth entry in `stores`.
 */
export function sqlitePersistence(
  options: SqlitePersistenceOptions,
): SqliteAIPersistence & { close: () => void } {
  const filename = normalizeSqliteUrl(options.url)
  ensureParentDirectory(filename)
  const db = new DatabaseSync(filename)
  try {
    if (options.migrate) {
      db.exec(SCHEMA_SQL)
      addMissingColumns(db)
    }
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
      generationRuns: createGenerationRunStore(db),
      artifacts: createArtifactStore(db),
      blobs: createBlobStore(db),
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

/** Build the seven persistence stores and a durable SQLite checkpoint store. */
export function sqliteSandboxSnapshots(
  options: SqlitePersistenceOptions & SandboxCheckpointStoreOptions,
): {
  persistence: SqliteAIPersistence
  checkpoints: ForkCapableSandboxCheckpointStore
  close: () => void
} {
  const filename = normalizeSqliteUrl(options.url)
  ensureParentDirectory(filename)
  const db = new DatabaseSync(filename)
  try {
    if (options.migrate) {
      db.exec(SCHEMA_SQL)
      addMissingColumns(db)
    }
    const messages = createMessageStore(db)
    const persistence = defineAIPersistence({
      stores: {
        messages,
        runs: createRunStore(db),
        interrupts: createInterruptStore(db),
        metadata: createMetadataStore(db),
        generationRuns: createGenerationRunStore(db),
        artifacts: createArtifactStore(db),
        blobs: createBlobStore(db),
      },
    })
    const checkpoints = createCheckpointStore(db, options)
    let closed = false
    return {
      persistence,
      checkpoints,
      close() {
        if (closed) return
        db.close()
        closed = true
      },
    }
  } catch (error) {
    db.close()
    throw error
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
