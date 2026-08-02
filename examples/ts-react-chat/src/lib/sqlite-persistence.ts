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
  usage_json text
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
CREATE INDEX IF NOT EXISTS artifacts_run ON artifacts (run_id);
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
  usage_json: string | null
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
function mapRun(row: RunRow): RunRecord {
  return {
    runId: row.run_id,
    threadId: row.thread_id,
    status: row.status as RunStatus,
    startedAt: row.started_at,
    ...(row.finished_at != null ? { finishedAt: row.finished_at } : {}),
    ...(row.error != null ? { error: row.error } : {}),
    ...(row.usage_json != null
      ? { usage: parseJson<TokenUsage>(row.usage_json) }
      : {}),
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
        sets.push('error = ?')
        params.push(patch.error)
      }
      if (patch.usage !== undefined) {
        sets.push('usage_json = ?')
        params.push(JSON.stringify(patch.usage))
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
    'SELECT * FROM artifacts WHERE run_id = ? ORDER BY created_at ASC',
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
