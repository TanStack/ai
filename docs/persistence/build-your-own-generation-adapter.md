---
title: Build a Generation Adapter (Advanced)
id: build-your-own-generation-adapter
description: "SQLite: generationRuns (required), artifacts + blobs (optional pair) for media persistence."
---

# Build a Generation Adapter

If you need generation jobs (and media bytes) in your DB → implement the three stores below against `node:sqlite`.

Read first: [Build your own adapter](./build-your-own-adapter). Contracts: [store reference](./store-reference). Differs from chat: **no** chat `runs` store — [Generation persistence](./generation-persistence).

| Store | Role |
| --- | --- |
| `generationRuns` | **Required.** Keyed by `runId`; `threadId` is the slot |
| `artifacts` + `blobs` | **Optional pair.** Metadata + bytes for durable media |

## Schema

```sql
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
CREATE TABLE IF NOT EXISTS blobs (
  key text PRIMARY KEY NOT NULL,
  bytes blob NOT NULL,
  size integer NOT NULL,
  etag text NOT NULL,
  content_type text,
  custom_metadata_json text,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
```

## 1. Generation runs

**Required methods:**

1. `createOrResume` — idempotent; existing `runId` unchanged
2. `update` — unknown `runId` = no-op
3. `get`
4. `findLatestForThread` — greatest `startedAt` for slot (hydrate uses this)

```ts
import { DatabaseSync } from 'node:sqlite'
import { defineGenerationRunStore } from '@tanstack/ai-persistence'
import type {
  GenerationRunRecord,
  GenerationRunStatus,
} from '@tanstack/ai-persistence'

function toGenerationRunStatus(value: unknown): GenerationRunStatus {
  switch (value) {
    case 'running':
    case 'completed':
    case 'failed':
    case 'interrupted':
      return value
    default:
      throw new TypeError(`Unexpected generation run status: ${String(value)}`)
  }
}

function mapGenerationRun(row: Record<string, unknown>): GenerationRunRecord {
  return {
    runId: String(row.run_id),
    threadId: String(row.thread_id),
    activity: String(row.activity),
    provider: String(row.provider),
    model: String(row.model),
    status: toGenerationRunStatus(row.status),
    startedAt: Number(row.started_at),
    ...(row.finished_at != null ? { finishedAt: Number(row.finished_at) } : {}),
    ...(typeof row.error_json === 'string'
      ? { error: JSON.parse(row.error_json) }
      : {}),
    ...(typeof row.result_json === 'string'
      ? { result: JSON.parse(row.result_json) }
      : {}),
    ...(typeof row.artifacts_json === 'string'
      ? { artifacts: JSON.parse(row.artifacts_json) }
      : {}),
    ...(typeof row.usage_json === 'string'
      ? { usage: JSON.parse(row.usage_json) }
      : {}),
  }
}

function createGenerationRunStore(db: DatabaseSync) {
  const select = db.prepare('SELECT * FROM generation_runs WHERE run_id = ?')
  const insert = db.prepare(
    `INSERT INTO generation_runs
       (run_id, thread_id, activity, provider, model, status, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(run_id) DO NOTHING`,
  )
  const latest = db.prepare(
    `SELECT * FROM generation_runs WHERE thread_id = ?
     ORDER BY started_at DESC LIMIT 1`,
  )
  return defineGenerationRunStore({
    async createOrResume(input) {
      const existing = select.get(input.runId)
      if (existing) return mapGenerationRun(existing)
      const status: GenerationRunStatus = input.status ?? 'running'
      insert.run(
        input.runId,
        input.threadId,
        input.activity,
        input.provider,
        input.model,
        status,
        input.startedAt,
      )
      return {
        runId: input.runId,
        threadId: input.threadId,
        activity: input.activity,
        provider: input.provider,
        model: input.model,
        status,
        startedAt: input.startedAt,
      }
    },
    async update(runId, patch) {
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
      if (sets.length === 0) return
      params.push(runId)
      db.prepare(
        `UPDATE generation_runs SET ${sets.join(', ')} WHERE run_id = ?`,
      ).run(...params)
    },
    async get(runId) {
      const row = select.get(runId)
      return row ? mapGenerationRun(row) : null
    },
    async findLatestForThread(threadId) {
      const row = latest.get(threadId)
      return row ? mapGenerationRun(row) : null
    },
  })
}
```

## 2. Artifacts (metadata)

**Required methods:** `save` (upsert), `get`, `list(runId)` → `[]` if none, `delete`, `deleteForRun`.

Persist `blobKey` verbatim — custom `storageKey` paths cannot be recomputed.

```ts
import { DatabaseSync } from 'node:sqlite'
import { defineArtifactStore } from '@tanstack/ai-persistence'
import type { ArtifactRecord } from '@tanstack/ai-persistence'

function mapArtifact(row: Record<string, unknown>): ArtifactRecord {
  return {
    artifactId: String(row.artifact_id),
    runId: String(row.run_id),
    threadId: String(row.thread_id),
    ...(typeof row.blob_key === 'string' ? { blobKey: row.blob_key } : {}),
    name: String(row.name),
    mimeType: String(row.mime_type),
    size: Number(row.size),
    ...(typeof row.source_url === 'string'
      ? { sourceUrl: row.source_url }
      : {}),
    createdAt: Number(row.created_at),
  }
}

function createArtifactStore(db: DatabaseSync) {
  const upsert = db.prepare(
    `INSERT INTO artifacts
       (artifact_id, run_id, thread_id, blob_key, name, mime_type, size, source_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(artifact_id) DO UPDATE SET
       run_id = excluded.run_id, thread_id = excluded.thread_id,
       blob_key = excluded.blob_key, name = excluded.name,
       mime_type = excluded.mime_type, size = excluded.size,
       source_url = excluded.source_url, created_at = excluded.created_at`,
  )
  const selectOne = db.prepare('SELECT * FROM artifacts WHERE artifact_id = ?')
  const byRun = db.prepare(
    'SELECT * FROM artifacts WHERE run_id = ? ORDER BY created_at ASC',
  )
  return defineArtifactStore({
    async save(record) {
      upsert.run(
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
    },
    async get(artifactId) {
      const row = selectOne.get(artifactId)
      return row ? mapArtifact(row) : null
    },
    async list(runId) {
      return byRun.all(runId).map(mapArtifact)
    },
    async delete(artifactId) {
      db.prepare('DELETE FROM artifacts WHERE artifact_id = ?').run(artifactId)
    },
    async deleteForRun(runId) {
      db.prepare('DELETE FROM artifacts WHERE run_id = ?').run(runId)
    },
  })
}
```

## 3. Blobs (bytes)

Default write key from middleware: `artifacts/<runId>/<artifactId>`.

**Required methods:**

1. `put` — any `BlobBody` (stream/buffer/string/Blob); drain length-less streams
2. `get` — honour `options.range` (slice only); use `resolveBlobRange`
3. `head` — metadata without bytes
4. `delete`
5. `list` — literal case-sensitive `prefix`; page with cursor; `limit: 0` → empty untruncated

```ts
import { DatabaseSync } from 'node:sqlite'
import { defineBlobStore, resolveBlobRange } from '@tanstack/ai-persistence'
import type {
  BlobBody,
  BlobObject,
  BlobRecord,
} from '@tanstack/ai-persistence'

async function toBytes(body: BlobBody): Promise<Uint8Array> {
  if (typeof body === 'string') return new TextEncoder().encode(body)
  if (body instanceof ArrayBuffer) return new Uint8Array(body.slice(0))
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength).slice()
  }
  if (body instanceof Blob) {
    return new Uint8Array(await body.arrayBuffer())
  }
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

function mapBlobRecord(row: Record<string, unknown>): BlobRecord {
  return {
    key: String(row.key),
    ...(row.size != null ? { size: Number(row.size) } : {}),
    ...(typeof row.etag === 'string' ? { etag: row.etag } : {}),
    ...(typeof row.content_type === 'string'
      ? { contentType: row.content_type }
      : {}),
    ...(typeof row.custom_metadata_json === 'string'
      ? { customMetadata: JSON.parse(row.custom_metadata_json) }
      : {}),
    ...(row.created_at != null ? { createdAt: Number(row.created_at) } : {}),
    ...(row.updated_at != null ? { updatedAt: Number(row.updated_at) } : {}),
  }
}

function blobObject(
  record: BlobRecord,
  bytes: Uint8Array,
  range?: { offset: number; length: number },
): BlobObject {
  return {
    ...record,
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
    text: () => Promise.resolve(new TextDecoder().decode(bytes)),
  }
}

function createBlobStore(db: DatabaseSync) {
  const upsert = db.prepare(
    `INSERT INTO blobs
       (key, bytes, size, etag, content_type, custom_metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       bytes = excluded.bytes, size = excluded.size, etag = excluded.etag,
       content_type = excluded.content_type,
       custom_metadata_json = excluded.custom_metadata_json,
       updated_at = excluded.updated_at`,
  )
  const selectCreated = db.prepare('SELECT created_at FROM blobs WHERE key = ?')
  const selectOne = db.prepare('SELECT * FROM blobs WHERE key = ?')
  const selectMeta = db.prepare(
    `SELECT key, size, etag, content_type, custom_metadata_json,
            created_at, updated_at
       FROM blobs WHERE key = ?`,
  )
  const selectSlice = db.prepare(
    'SELECT substr(bytes, ?, ?) AS bytes FROM blobs WHERE key = ?',
  )
  return defineBlobStore({
    async put(key, body, options) {
      const bytes = await toBytes(body)
      const now = Date.now()
      const prior = selectCreated.get(key)
      const createdAt =
        prior && prior.created_at != null ? Number(prior.created_at) : now
      const etag = String(now)
      upsert.run(
        key,
        bytes,
        bytes.byteLength,
        etag,
        options?.contentType ?? null,
        options?.customMetadata ? JSON.stringify(options.customMetadata) : null,
        createdAt,
        now,
      )
      return {
        key,
        size: bytes.byteLength,
        etag,
        createdAt,
        updatedAt: now,
        ...(options?.contentType !== undefined
          ? { contentType: options.contentType }
          : {}),
        ...(options?.customMetadata !== undefined
          ? { customMetadata: options.customMetadata }
          : {}),
      }
    },
    async get(key, options) {
      if (!options?.range) {
        const row = selectOne.get(key)
        if (!row) return null
        const bytes =
          row.bytes instanceof Uint8Array ? row.bytes : new Uint8Array()
        return blobObject(mapBlobRecord(row), bytes)
      }
      const meta = selectMeta.get(key)
      if (!meta) return null
      const served = resolveBlobRange(Number(meta.size), options.range)
      const slice = selectSlice.get(served.offset + 1, served.length, key)
      if (!slice) return null
      const bytes =
        slice.bytes instanceof Uint8Array ? slice.bytes : new Uint8Array()
      return blobObject(mapBlobRecord(meta), bytes, served)
    },
    async head(key) {
      const row = selectMeta.get(key)
      return row ? mapBlobRecord(row) : null
    },
    async delete(key) {
      db.prepare('DELETE FROM blobs WHERE key = ?').run(key)
    },
    async list(options) {
      if (options?.limit === 0) return { objects: [], truncated: false }
      // substr, not LIKE: case-sensitive literal prefix
      const prefix = options?.prefix ?? ''
      const params: Array<string | number> = [prefix, prefix]
      let where = 'substr(key, 1, length(?)) = ?'
      if (options?.cursor !== undefined) {
        where += ' AND key > ?'
        params.push(options.cursor)
      }
      let sql = `SELECT * FROM blobs WHERE ${where} ORDER BY key ASC`
      const limit = options?.limit
      if (limit !== undefined) {
        sql += ' LIMIT ?'
        params.push(limit + 1)
      }
      const rows = db
        .prepare(sql)
        .all(...params)
        .map(mapBlobRecord)
      if (limit !== undefined && rows.length > limit) {
        const page = rows.slice(0, limit)
        const cursor = page.at(-1)?.key
        return {
          objects: page,
          truncated: true,
          ...(cursor !== undefined ? { cursor } : {}),
        }
      }
      return { objects: rows, truncated: false }
    },
  })
}
```

## 4. Assemble

`generationRuns` alone is valid. Add `artifacts` + `blobs` together for media.

```ts
import { DatabaseSync } from 'node:sqlite'
import { defineAIPersistence } from '@tanstack/ai-persistence'
import { createArtifactStore } from './artifact-store'
import { createBlobStore } from './blob-store'
import { createGenerationRunStore } from './generation-run-store'
import { GENERATION_SCHEMA_SQL } from './generation-schema'

export function generationPersistence(options: {
  url: string
  migrate?: boolean
}) {
  const db = new DatabaseSync(options.url)
  if (options.migrate) db.exec(GENERATION_SCHEMA_SQL)
  return defineAIPersistence({
    stores: {
      generationRuns: createGenerationRunStore(db),
      artifacts: createArtifactStore(db),
      blobs: createBlobStore(db),
    },
  })
}
```

Pass to `withGenerationPersistence` on `generateImage` / `generateVideo` / … — [Generation persistence](./generation-persistence). Fold into chat backend with `composePersistence`.

## Next

- [Generation persistence](./generation-persistence) — route wiring
- [Keep generated files](./keep-generated-files) — serve stored bytes
- [Conformance](./build-your-own-adapter#prove-with-conformance)
