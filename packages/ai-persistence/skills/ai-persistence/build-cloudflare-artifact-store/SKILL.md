---
name: ai-persistence/build-cloudflare-artifact-store
description: Use when a Cloudflare Worker needs durable byte storage for TanStack AI generated media (images, audio, video, transcripts) — writes a BlobStore backed by R2 and an ArtifactStore backed by D1 (or KV), composes them onto the generation persistence so withGenerationPersistence persists artifact bytes, and serves them back from a Worker GET route. Includes one-line sketches for S3, GCS, Vercel Blob, Supabase, and a dev filesystem BlobStore.
---

# Cloudflare Artifact + Blob Store

`withGenerationPersistence(persistence, { threadId })` needs only `stores.generationRuns` to track a
generation's lifecycle. Add `stores.artifacts` (metadata) **and** `stores.blobs`
(the bytes) — both, or neither — and the middleware also persists the generated
media: image/audio/TTS/video/transcription bytes land at blob key
`artifacts/<runId>/<artifactId>`, with an `ArtifactRecord` row describing each.

The deliverable is **one file in the Worker** — e.g.
`src/lib/generation-persistence.ts` — exporting a factory that builds an
`AIPersistence` from the request's R2 + D1 bindings, plus a GET route that serves
artifact bytes with `retrieveArtifact` / `retrieveBlob`.

Read the sibling **ai-persistence/build-cloudflare-adapter** skill for the
per-request-binding rule, `wrangler` config shape, D1 migration workflow, and the
chat (generation-run/message) side. This skill covers only the two byte-storage stores and
how to compose them.

## The two contracts, verbatim

Both come from `@tanstack/ai-persistence`. `defineBlobStore` / `defineArtifactStore`
type an object literal inline (autocomplete + contract checking, no separate
annotation).

```ts
// BlobStore — the byte layer. R2 backs it.
interface BlobStore {
  put(
    key: string,
    body: BlobBody,
    options?: BlobPutOptions,
  ): Promise<BlobRecord>
  get(key: string): Promise<BlobObject | null> // metadata + byte accessors
  head(key: string): Promise<BlobRecord | null> // metadata only
  delete(key: string): Promise<void> // no-op if absent
  list(options?: BlobListOptions): Promise<BlobListPage>
}

// ArtifactStore — the metadata layer. D1 (or KV) backs it.
interface ArtifactStore {
  save(record: ArtifactRecord): Promise<void> // insert or overwrite
  get(artifactId: string): Promise<ArtifactRecord | null>
  list(runId: string): Promise<Array<ArtifactRecord>> // [] when none
  delete(artifactId: string): Promise<void>
  deleteForRun(runId: string): Promise<void>
}
```

`BlobBody` is `ReadableStream<Uint8Array> | ArrayBuffer | ArrayBufferView |
string | Blob` — which is exactly what `R2Bucket.put` accepts, so the body flows
straight through with no conversion. `BlobPutOptions` is
`{ contentType?, customMetadata? }`; `BlobListOptions` is
`{ prefix?, cursor?, limit? }`; `BlobListPage` is
`{ objects: BlobRecord[], cursor?, truncated? }`.

## 1. BlobStore backed by R2

`R2Object` carries `size`, `etag`, `httpMetadata.contentType`, `customMetadata`,
and `uploaded` (a `Date`). `BlobRecord` wants `createdAt` / `updatedAt` as epoch
ms — R2 tracks only the single `uploaded` instant, so map it to both. `get` /
`head` are the byte-body vs metadata-only split; `R2ObjectBody` already exposes
`body`, `arrayBuffer()`, and `text()`, so a `BlobObject` is essentially the R2
object plus the mapped metadata.

```ts ignore
import { defineBlobStore } from '@tanstack/ai-persistence'
import type { BlobObject, BlobRecord } from '@tanstack/ai-persistence'

function toRecord(obj: R2Object): BlobRecord {
  const uploaded = obj.uploaded.getTime()
  return {
    key: obj.key,
    size: obj.size,
    etag: obj.etag,
    ...(obj.httpMetadata?.contentType
      ? { contentType: obj.httpMetadata.contentType }
      : {}),
    ...(obj.customMetadata ? { customMetadata: obj.customMetadata } : {}),
    createdAt: uploaded,
    updatedAt: uploaded,
  }
}

export function r2BlobStore(bucket: R2Bucket) {
  return defineBlobStore({
    async put(key, body, options) {
      const obj = await bucket.put(key, body, {
        ...(options?.contentType
          ? { httpMetadata: { contentType: options.contentType } }
          : {}),
        ...(options?.customMetadata
          ? { customMetadata: options.customMetadata }
          : {}),
      })
      // R2.put returns null only when an onlyIf precondition fails — not used here.
      if (!obj) throw new Error(`R2 put failed for ${key}`)
      return toRecord(obj)
    },

    async get(key): Promise<BlobObject | null> {
      const obj = await bucket.get(key)
      if (!obj) return null
      return {
        ...toRecord(obj),
        body: obj.body,
        arrayBuffer: () => obj.arrayBuffer(),
        text: () => obj.text(),
      }
    },

    async head(key) {
      const obj = await bucket.head(key)
      return obj ? toRecord(obj) : null
    },

    async delete(key) {
      await bucket.delete(key)
    },

    async list(options) {
      // R2 reads `limit: 0` as "use the default", so short-circuit it.
      if (options?.limit === 0) {
        return { objects: [] }
      }
      const page = await bucket.list({
        ...(options?.prefix !== undefined ? { prefix: options.prefix } : {}),
        ...(options?.cursor !== undefined ? { cursor: options.cursor } : {}),
        ...(options?.limit !== undefined ? { limit: options.limit } : {}),
        // R2 omits httpMetadata/customMetadata from list rows unless asked.
        include: ['httpMetadata', 'customMetadata'],
      })
      return {
        objects: page.objects.map(toRecord),
        ...(page.truncated ? { cursor: page.cursor, truncated: true } : {}),
      }
    },
  })
}
```

Invariants that matter (asserted by the conformance testkit):

- `get` / `head` return `null` for a missing key; `delete` is a silent no-op.
- `put` **overwrites** an existing key.
- `list` filters by `prefix` literally (R2 prefix is a literal byte prefix — no
  glob), returns keys in ascending order, and pages via the opaque `cursor` when
  `truncated`. R2's own cursor is opaque and satisfies this directly. `limit: 0`
  must yield an empty, untruncated page — R2 treats `limit: 0` as "use the
  default", so special-case it: `if (options?.limit === 0) return { objects: [] }`.

## 2. ArtifactStore backed by D1

`ArtifactRecord` is `{ artifactId, runId, threadId, name, mimeType, size,
sourceUrl?, createdAt }` (`createdAt` epoch ms). One flat table, keyed by
`artifact_id`, indexed by `run_id` for `list`.

```sql
CREATE TABLE IF NOT EXISTS generation_artifacts (
  artifact_id  text PRIMARY KEY NOT NULL,
  run_id       text NOT NULL,
  thread_id    text NOT NULL,
  blob_key     text,
  name         text NOT NULL,
  mime_type    text NOT NULL,
  size         integer NOT NULL,
  source_url   text,
  created_at   integer NOT NULL
);
CREATE INDEX IF NOT EXISTS generation_artifacts_run ON generation_artifacts (run_id);
```

```ts ignore
import { defineArtifactStore } from '@tanstack/ai-persistence'
import type { ArtifactRecord } from '@tanstack/ai-persistence'

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

function fromRow(row: ArtifactRow): ArtifactRecord {
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

export function d1ArtifactStore(db: D1Database) {
  return defineArtifactStore({
    async save(record) {
      // Insert or overwrite (artifact ids are unique).
      await db
        .prepare(
          `INSERT INTO generation_artifacts
             (artifact_id, run_id, thread_id, blob_key, name, mime_type, size, source_url, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(artifact_id) DO UPDATE SET
             run_id = excluded.run_id, thread_id = excluded.thread_id,
             blob_key = excluded.blob_key, name = excluded.name,
             mime_type = excluded.mime_type, size = excluded.size,
             source_url = excluded.source_url, created_at = excluded.created_at`,
        )
        .bind(
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
        .run()
    },

    async get(artifactId) {
      const row = await db
        .prepare(`SELECT * FROM generation_artifacts WHERE artifact_id = ?`)
        .bind(artifactId)
        .first<ArtifactRow>()
      return row ? fromRow(row) : null
    },

    async list(runId) {
      const { results } = await db
        .prepare(`SELECT * FROM generation_artifacts WHERE run_id = ?`)
        .bind(runId)
        .all<ArtifactRow>()
      return results.map(fromRow)
    },

    async delete(artifactId) {
      await db
        .prepare(`DELETE FROM generation_artifacts WHERE artifact_id = ?`)
        .bind(artifactId)
        .run()
    },

    async deleteForRun(runId) {
      await db
        .prepare(`DELETE FROM generation_artifacts WHERE run_id = ?`)
        .bind(runId)
        .run()
    },
  })
}
```

Omitting `source_url` / `blob_key` from the record when the column is `NULL`
keeps records comparing cleanly against the reference in-memory store. Persist
`blob_key` verbatim: a `storageKey` mapper can put the bytes anywhere, so a
reader cannot recompute the path — `resolveArtifactBlobKey(record)` falls back
to the default convention only for rows written before the column existed.
**KV alternative:** if
you have no D1, back `save`/`get` with `KV.put(artifactId, JSON.stringify(record))`
/ `KV.get(artifactId, 'json')`, and maintain a `run:<runId>` index key (a JSON
array of artifact ids) for `list` — KV has no query, so `list` needs that
secondary index.

## 3. Compose and wire

Bindings are per-request on Workers, so export a **factory**. Combine the byte
stores with a generation-run store (and, if this Worker also does chat, the chat stores).
Either build the whole `AIPersistence` with `defineAIPersistence`, or layer the
artifact stores onto an existing chat persistence with `composePersistence`:

```ts ignore
import {
  defineAIPersistence,
  composePersistence,
  withGenerationPersistence,
} from '@tanstack/ai-persistence'
import { r2BlobStore } from './r2-blob-store'
import { d1ArtifactStore } from './d1-artifact-store'
import { d1GenerationRunStore } from './d1-job-store' // your GenerationRunStore

/** Call inside a request handler — bindings are not available at module scope. */
export function generationPersistence(env: Env) {
  return defineAIPersistence({
    stores: {
      generationRuns: d1GenerationRunStore(env.DB),
      artifacts: d1ArtifactStore(env.DB),
      blobs: r2BlobStore(env.ARTIFACTS_BUCKET),
    },
  })
}

// …or add bytes to a persistence that already has chat + generation runs:
// composePersistence(chatAndJobsPersistence(env), {
//   overrides: {
//     artifacts: d1ArtifactStore(env.DB),
//     blobs: r2BlobStore(env.ARTIFACTS_BUCKET),
//   },
// })
```

`withGenerationPersistence` throws if exactly one of `artifacts` / `blobs` is
present — provide both or neither. Wire it as generation middleware:

```ts ignore
import { generateImage, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'
import { withGenerationPersistence } from '@tanstack/ai-persistence'
import { generationPersistence } from './lib/generation-persistence'

export default {
  async fetch(request: Request, env: Env) {
    const { prompt, threadId } = await request.json()
    const stream = generateImage({
      adapter: openaiImage('gpt-image-1'),
      prompt,
      threadId, // the slot recorded on the job + artifacts
      stream: true,
      middleware: [
        withGenerationPersistence(generationPersistence(env), { threadId }),
      ],
    })
    return toServerSentEventsResponse(stream)
  },
}
```

## 4. Serve the bytes back

A GET route resolves an `artifactId` to its record and its stored bytes.
`retrieveArtifact` returns the `ArtifactRecord` (or `null` → 404);
`retrieveBlob` returns the `BlobObject` (metadata + a streamable `body`). Both
key off `artifactBlobKey({ runId, artifactId })` internally, so you never build
the key yourself.

```ts ignore
import { retrieveArtifact, retrieveBlob } from '@tanstack/ai-persistence'
import { generationPersistence } from './lib/generation-persistence'

export async function GET(request: Request, env: Env) {
  const artifactId = new URL(request.url).searchParams.get('id') ?? ''
  const persistence = generationPersistence(env)

  // Authorize before serving — derive the owner from the session, never trust
  // a client-supplied id. (The record carries runId/threadId to check against.)
  const record = await retrieveArtifact(persistence, artifactId)
  if (!record) return new Response('Not found', { status: 404 })

  const blob = await retrieveBlob(persistence, record) // pass the record: no 2nd lookup
  if (!blob?.body) return new Response('Not found', { status: 404 })

  return new Response(blob.body, {
    headers: {
      'content-type': record.mimeType,
      'content-length': String(record.size),
    },
  })
}
```

To hydrate a **server-driven generation client** (`persistence: true` + a stable
`threadId`) on mount, also expose `reconstructGeneration(persistence, request)`
on a GET that reads `?threadId=` / `?runId=` — see `ai-core/client-persistence`.

## Other backends — the contract is tiny, here's how each maps

`BlobStore` is five methods over an object store. Any of these backs it; swap the
factory, keep everything else. `put` maps to the SDK's upload, `get` to a
download that exposes `body`/`arrayBuffer`/`text`, `head` to a metadata fetch,
`delete` to a delete, `list` to a prefixed, cursor-paged list.

| Backend                   | npm                     | One-line sketch                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AWS S3**                | `@aws-sdk/client-s3`    | `put`→`PutObjectCommand`; `get`→`GetObjectCommand` (`Body` is a stream → `body`, `.transformToByteArray()`/`.transformToString()`); `head`→`HeadObjectCommand`; `delete`→`DeleteObjectCommand`; `list`→`ListObjectsV2Command` (`Prefix`, `ContinuationToken`↔`cursor`, `MaxKeys`↔`limit`, `IsTruncated`↔`truncated`).                                                     |
| **Google Cloud Storage**  | `@google-cloud/storage` | `bucket.file(key)`: `put`→`.save(body, { contentType, metadata })`; `get`→`.createReadStream()` for `body` + `.download()` for bytes; `head`→`.getMetadata()`; `delete`→`.delete({ ignoreNotFound: true })`; `list`→`bucket.getFiles({ prefix, maxResults, pageToken })`.                                                                                                 |
| **Vercel Blob**           | `@vercel/blob`          | `put`→`put(key, body, { access: 'public', contentType })`; `get`→`fetch(head(key).url)` (stream `res.body`); `head`→`head(key)` (returns `null`→catch as absent); `delete`→`del(key)`; `list`→`list({ prefix, cursor, limit })` (`hasMore`↔`truncated`).                                                                                                                  |
| **Supabase Storage**      | `@supabase/supabase-js` | `storage.from(bucket)`: `put`→`.upload(key, body, { contentType, upsert: true })`; `get`→`.download(key)` (returns a `Blob` → `body`/`arrayBuffer`/`text`); `head`→`.info(key)` or list-one; `delete`→`.remove([key])`; `list`→`.list(prefix, { limit })` (offset/limit paging → synthesize a `cursor`).                                                                  |
| **Filesystem (dev only)** | `node:fs/promises`      | Root each key under a dir: `put`→`mkdir(dirname, { recursive: true })` + `writeFile`; `get`→`createReadStream` for `body` + `readFile`; `head`→`stat` (`size`, `mtimeMs`→`updatedAt`); `delete`→`rm(path, { force: true })`; `list`→recursive `readdir` filtered by prefix, sorted, sliced by `limit`, cursor = last key. Not for production — no concurrency guarantees. |

For each: `contentType` and `customMetadata` ride the SDK's own metadata fields;
`BlobRecord.createdAt`/`updatedAt` come from the object's stored timestamps
(epoch ms); return `null` from `get`/`head` on a not-found rather than throwing.

## Verify

The shared `runPersistenceConformance` testkit covers all seven stores, including
`generationRuns`, `artifacts`, and `blobs` — point it at your factory rather than
hand-writing these assertions:

```ts ignore
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { env } from 'cloudflare:test'
import { generationPersistence } from '../src/lib/generation-persistence'

// A generation-only Worker declares the chat state stores it does not provide.
runPersistenceConformance('app-r2', () => generationPersistence(env), {
  skip: ['messages', 'runs', 'interrupts', 'metadata'],
})
```

Run it against a Miniflare R2 + D1 binding with the migration applied, reset
between runs (see **ai-persistence/build-cloudflare-adapter** for the
`cloudflare:test` harness pattern). It exercises, among the rest:

- `put` then `get` round-trips bytes and metadata; `get`/`head` return `null` for
  a missing key; `delete` is a silent no-op on an absent key.
- `put` overwrites an existing key (and its `contentType`/`customMetadata`).
- `list` filters by `prefix` **literally and case-sensitively**, returns
  ascending keys, pages through the `cursor` when `truncated` without gaps or
  repeats, and returns an empty untruncated page for `limit: 0`.
- The `ArtifactStore`: `save` is insert-or-overwrite, `get` returns `null` when
  absent, `list(runId)` returns `[]` for an unknown run, and `delete` /
  `deleteForRun` remove exactly the expected rows.
- The `GenerationRunStore`: `createOrResume` idempotency, no-op `update` on an
  unknown id, and `findLatestForThread` returning the most recently started
  linked run (terminal ones included).

An end-to-end check is the strongest signal: run `generateImage` through
`withGenerationPersistence(generationPersistence(env), { threadId })`, then confirm the blob
exists at `artifacts/<runId>/<artifactId>` and `retrieveBlob` streams it back.
