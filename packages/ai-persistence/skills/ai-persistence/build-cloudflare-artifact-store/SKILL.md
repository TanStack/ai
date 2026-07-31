---
name: ai-persistence/build-cloudflare-artifact-store
description: Use when a Cloudflare Worker needs durable byte storage for TanStack AI generated media (images, audio, video, transcripts) — writes a BlobStore backed by R2 and an ArtifactStore backed by D1 (or KV), composes them onto the generation persistence so withGenerationPersistence persists artifact bytes, and serves them back from a Worker GET route. Includes one-line sketches for S3, GCS, Vercel Blob, Supabase, and a dev filesystem BlobStore.
---

# Cloudflare Artifact + Blob Store

`withGenerationPersistence(persistence)` needs only `stores.generationRuns` to track a
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
  // metadata + byte accessors; `options.range` reads one slice (for `206`s)
  get(key: string, options?: BlobGetOptions): Promise<BlobObject | null>
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
string | Blob`. The non-stream shapes flow straight into `R2Bucket.put`
unchanged — but a `ReadableStream` body does **not**, in the general case:
workerd's `put` requires a stream with a known length (a `Response` body or the
readable half of a `FixedLengthStream`), and the artifact middleware hands you a
`TransformStream`-wrapped body whenever it had to cap a fetched body as it
drains. Passing that stream to `bucket.put` throws `TypeError: Provided readable
stream must have a known length`.

**When does that actually happen?** The wrapper only exists to enforce
`maxArtifactBytes` during the drain, so the middleware applies it only when
nothing else bounds the transfer:

| Provider response                       | Body handed to `put`              | R2 path             |
| --------------------------------------- | --------------------------------- | ------------------- |
| `content-length`, no `content-encoding` | untouched, declared length intact | `bucket.put` direct |
| chunked (no declared length)            | wrapped, length-less              | multipart           |
| `content-encoding: gzip`                | wrapped, length-less              | multipart           |

A provider CDN normally sends `content-length`, so the first row is the common
case and `bucket.put(key, body)` just works. The recipe below is what makes the
other two rows work: it re-declares the length from
`BlobPutOptions.expectedLength` when the middleware could vouch for one, and
otherwise streams through a multipart upload (one 8 MiB part at a time — flat
memory at any artifact size). Write it once and every response shape is
covered.

`withGenerationPersistence(persistence, { maxArtifactBytes: false })` drops the
ceiling and the wrapper altogether, so even a chunked reply arrives untouched.
It buys nothing extra for R2 (a chunked body has no length to preserve), so
choose it on its own merits: no _application_ limit on what an origin can
stream into your bucket. R2's own limits still apply — 5 GiB per single-shot
put, and 10,000 multipart parts (~80 GiB at the 8 MiB part size below). Keep
the cap when `allowInputUrl` lets callers name the URL.

`BlobPutOptions` is
`{ contentType?, customMetadata?, expectedLength? }`; `BlobGetOptions` is
`{ range?: { offset: number, length?: number } }` and maps onto R2's own
`range`; `BlobListOptions` is `{ prefix?, cursor?, limit? }`; `BlobListPage` is
`{ objects: BlobRecord[], cursor?, truncated? }`.

## 1. BlobStore backed by R2

`R2Object` carries `size`, `etag`, `httpMetadata.contentType`, `customMetadata`,
and `uploaded` (a `Date`). `BlobRecord` wants `createdAt` / `updatedAt` as epoch
ms — R2 tracks only the single `uploaded` instant, so map it to both. `get` /
`head` are the byte-body vs metadata-only split; `R2ObjectBody` already exposes
`body`, `arrayBuffer()`, and `text()`, so a `BlobObject` is essentially the R2
object plus the mapped metadata.

```ts ignore
import { defineBlobStore, resolveBlobRange } from '@tanstack/ai-persistence'
import type { BlobObject, BlobRecord } from '@tanstack/ai-persistence'

// R2 multipart parts must be ≥ 5 MiB and — except for the last — all exactly
// the SAME size, so a part reader has to cut on an exact boundary and carry the
// remainder. 8 MiB × the 10,000-part ceiling puts the multipart path's limit at
// ~80 GiB; raise this for larger objects, and check R2's current object-size
// limits before promising more.
const MULTIPART_PART_SIZE = 8 * 1024 * 1024

/**
 * Cut exactly `limit` bytes off the stream (fewer only at EOF), carrying any
 * overshoot into the next part.
 *
 * `carry` is the leftover from the previous call. Chunks are collected by
 * reference and copied once per part: growing a `Uint8Array` chunk-by-chunk
 * instead would re-copy the whole part on every read — quadratic work for a
 * part built from hundreds of small chunks.
 */
async function readPart(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  limit: number,
  carry: Uint8Array,
): Promise<{ bytes: Uint8Array; carry: Uint8Array; eof: boolean }> {
  const chunks: Array<Uint8Array> = carry.byteLength > 0 ? [carry] : []
  let total = carry.byteLength
  let eof = false
  while (total < limit) {
    const { value, done } = await reader.read()
    if (done) {
      eof = true
      break
    }
    chunks.push(value)
    total += value.byteLength
  }
  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  // Equal-sized parts: hand back exactly `limit` and keep the rest for next
  // time. At EOF the last part is whatever is left, which R2 allows.
  if (!eof && total > limit) {
    return {
      bytes: joined.subarray(0, limit),
      carry: joined.subarray(limit),
      eof,
    }
  }
  return { bytes: joined, carry: new Uint8Array(0), eof }
}

// R2 takes a single-shot put up to 5 GiB. Above that the upload has to be
// multipart even when the length is known.
const MAX_SINGLE_SHOT_BYTES = 5 * 1024 * 1024 * 1024

/**
 * `R2Bucket.put` requires a stream with a known length; a pass-through
 * TransformStream (what the middleware sends when it had to cap the body) has
 * none. Re-declare the length when `expectedLength` provides it — the
 * middleware only sets it when it is the exact decoded byte count — and
 * otherwise stream through a multipart upload, one buffered part at a time.
 */
async function putStream(
  bucket: R2Bucket,
  key: string,
  body: ReadableStream<Uint8Array>,
  options: R2PutOptions,
  expectedLength: number | undefined,
): Promise<R2Object | null> {
  if (expectedLength !== undefined && expectedLength <= MAX_SINGLE_SHOT_BYTES) {
    return bucket.put(
      key,
      body.pipeThrough(new FixedLengthStream(expectedLength)),
      options,
    )
  }
  // Unknown length, or too big for one shot: multipart, one part at a time.
  const reader = body.getReader()
  const first = await readPart(reader, MULTIPART_PART_SIZE, new Uint8Array(0))
  if (first.eof) {
    // The whole body fit in one part — a plain put is enough.
    return bucket.put(key, first.bytes, options)
  }
  const upload = await bucket.createMultipartUpload(key, options)
  try {
    const parts: Array<R2UploadedPart> = [
      await upload.uploadPart(1, first.bytes),
    ]
    let carry = first.carry
    let partNumber = 2
    for (;;) {
      const part = await readPart(reader, MULTIPART_PART_SIZE, carry)
      carry = part.carry
      if (part.bytes.byteLength > 0) {
        // 10,000 parts is R2's ceiling; failing here beats a confusing error
        // from `complete` after uploading gigabytes.
        if (partNumber > 10_000) {
          throw new Error(
            `Artifact at ${key} exceeds the multipart part limit — raise MULTIPART_PART_SIZE.`,
          )
        }
        parts.push(await upload.uploadPart(partNumber, part.bytes))
        partNumber += 1
      }
      if (part.eof) break
    }
    return await upload.complete(parts)
  } catch (error) {
    await upload.abort().catch(() => undefined)
    throw error
  }
}

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
      const r2Options = {
        ...(options?.contentType
          ? { httpMetadata: { contentType: options.contentType } }
          : {}),
        ...(options?.customMetadata
          ? { customMetadata: options.customMetadata }
          : {}),
      }
      const obj =
        body instanceof ReadableStream
          ? await putStream(
              bucket,
              key,
              body,
              r2Options,
              options?.expectedLength,
            )
          : await bucket.put(key, body, r2Options)
      // R2.put returns null only when an onlyIf precondition fails — not used here.
      if (!obj) throw new Error(`R2 put failed for ${key}`)
      return toRecord(obj)
    },

    async get(key, options): Promise<BlobObject | null> {
      if (!options?.range) {
        const whole = await bucket.get(key)
        if (!whole) return null
        return {
          ...toRecord(whole),
          body: whole.body,
          arrayBuffer: () => whole.arrayBuffer(),
          text: () => whole.text(),
        }
      }
      // A ranged read is what a serve route turns into `206` — R2 slices in
      // the bucket, so a seek never streams the whole object. `resolveBlobRange`
      // clamps a too-long length and throws on an offset past the end (the
      // route answers `416` from `record.size` before ever calling in). The
      // `head` buys that clamp deterministically — one class-B op against
      // bytes you did not need to send.
      //
      // Retry a bounded number of times: each attempt measures the object and
      // reads a slice of THAT version, and only an overwrite landing between
      // the two calls costs another lap.
      for (let attempt = 0; attempt < 3; attempt++) {
        const head = await bucket.head(key)
        // A ranged read of a key that is not there is a miss, not a
        // whole-object read: falling through to an un-ranged `get` would
        // answer a `206` carrying the entire file.
        if (!head) return null
        const served = resolveBlobRange(head.size, options.range)
        const obj = await bucket.get(key, {
          range: { offset: served.offset, length: served.length },
          // Tie the slice to the version `head` measured. Without this, a
          // `put` landing between the two calls yields a `Content-Range`
          // computed from one object and bytes from another.
          onlyIf: { etagMatches: head.etag },
        })
        // No body means the precondition failed — the object changed under us.
        if (!obj) return null
        if (!('body' in obj)) continue
        return {
          // `toRecord(obj)` reports the WHOLE object's size even on a ranged
          // read — R2's `R2Object.size` is the object, not the slice — which
          // is exactly the contract, and what `Content-Range`'s total needs.
          ...toRecord(obj),
          range: served,
          body: obj.body,
          arrayBuffer: () => obj.arrayBuffer(),
          text: () => obj.text(),
        }
      }
      throw new Error(`R2 object ${key} changed under every ranged read.`)
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
- `put` accepts a `ReadableStream` body with **no declared length** — the
  middleware streams URL-fetched artifacts as exactly that. This is where the
  naive "pass the body straight to `bucket.put`" recipe fails at runtime
  (workerd requires a known length), which is what `putStream` above handles.
- `get` honours `options.range`: it returns **only** that slice, reports it as
  `range`, and keeps `size` on the whole object. That is the `206` a video
  player's seeking depends on, and R2 slices in the bucket so the bytes never
  cross the Worker.
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
        // Nothing is buffered: the artifact streams from the provider CDN
        // into R2. Add `maxArtifactBytes: false` if you want no ceiling at
        // all on what an origin can stream into your bucket (the default is
        // 1 GiB); it is not needed for the streaming itself.
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
resolve the blob key from the record internally, so you never build the key
yourself.

Honour `Range` requests: `<video>` seeking is built on `206` / `Content-Range`,
and Safari refuses to play a source that ignores `Range` entirely. Images never
notice; a few-hundred-MB clip is unwatchable without it. Pass `range` to
`retrieveBlob` — the store slices in R2 — rather than reaching into the bucket
binding from the route, which would tie the route to R2 and bypass the store's
own key resolution.

```ts ignore
import {
  parseRangeHeader,
  retrieveArtifact,
  retrieveBlob,
} from '@tanstack/ai-persistence'
import { generationPersistence } from './lib/generation-persistence'

export async function GET(request: Request, env: Env) {
  const artifactId = new URL(request.url).searchParams.get('id') ?? ''
  const persistence = generationPersistence(env)

  // Authorize before serving — derive the owner from the session, never trust
  // a client-supplied id. (The record carries runId/threadId to check against.)
  const record = await retrieveArtifact(persistence, artifactId)
  if (!record) return new Response('Not found', { status: 404 })

  // `parseRangeHeader` resolves the header against the size on the record —
  // suffix ranges included — so an unsatisfiable range is a 416 here and the
  // store only ever sees a range it can serve.
  const range = parseRangeHeader(request.headers.get('range'), record.size)
  if (range === 'unsatisfiable') {
    return new Response('Range not satisfiable', {
      status: 416,
      headers: { 'content-range': `bytes */${record.size}` },
    })
  }

  // Pass the record, not the id: no second metadata lookup.
  const blob = await retrieveBlob(
    persistence,
    record,
    range ? { range } : undefined,
  )
  if (!blob?.body) return new Response('Not found', { status: 404 })

  // `accept-ranges` on every response, including the whole-file one: it is how
  // a player learns it may seek at all.
  const headers = {
    'content-type': record.mimeType,
    'accept-ranges': 'bytes',
  }
  if (!blob.range) {
    return new Response(blob.body, {
      headers: { ...headers, 'content-length': String(record.size) },
    })
  }
  const { offset, length } = blob.range
  return new Response(blob.body, {
    status: 206,
    headers: {
      ...headers,
      'content-length': String(length),
      'content-range': `bytes ${offset}-${offset + length - 1}/${record.size}`,
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
- `put` accepts a `ReadableStream` body with no declared length (a
  `TransformStream`-wrapped stream) and records the real drained size — the
  shape every URL-fetched artifact arrives in.
- `get` with a `range` returns just that slice, reports it as `range`, and
  still reports the whole object's `size` — what a `206` / `Content-Range`
  response is built from.
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
