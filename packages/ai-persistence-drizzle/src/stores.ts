/**
 * AIPersistence store implementations over a Drizzle sqlite database.
 *
 * Each method mirrors the semantics of the reference in-memory backend
 * (`@tanstack/ai-persistence`'s `memory.ts`). JSON columns are handled by
 * Drizzle's `text({ mode: 'json' })`; blob bytes by `blob({ mode: 'buffer' })`.
 */
import { and, asc, eq, gt, gte, lt } from 'drizzle-orm'
import {
  artifacts,
  blobs,
  interrupts,
  messages,
  metadata,
  runs,
} from './schema'
import type { SQL } from 'drizzle-orm'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import type { ModelMessage } from '@tanstack/ai'
import type {
  ArtifactRecord,
  ArtifactStore,
  BlobBody,
  BlobListOptions,
  BlobListPage,
  BlobObject,
  BlobRecord,
  BlobStore,
  InterruptRecord,
  InterruptStore,
  MessageStore,
  MetadataStore,
  RunRecord,
  RunStore,
} from '@tanstack/ai-persistence'

/**
 * Any Drizzle sqlite database (better-sqlite3, libsql, node:sqlite proxy, D1, …).
 *
 * Typed as the schema-agnostic slice of the query builder we actually use, so a
 * BYO `db` constructed with any `{ schema }` is assignable regardless of its
 * `TFullSchema` (which is invariant on the full `BaseSQLiteDatabase`).
 */
export type DrizzleDb = Pick<
  BaseSQLiteDatabase<'sync' | 'async', unknown>,
  'select' | 'insert' | 'update' | 'delete'
>

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/**
 * Smallest string strictly greater than every string that starts with `prefix`,
 * used as the exclusive upper bound of a literal prefix range scan. Increments
 * the last non-`U+FFFF` UTF-16 code unit (carrying over trailing `U+FFFF`s).
 * Returns `undefined` when no finite bound exists — an empty prefix, or a prefix
 * consisting solely of `U+FFFF` — in which case the caller omits the upper bound.
 */
function prefixUpperBound(prefix: string): string | undefined {
  let i = prefix.length - 1
  while (i >= 0 && prefix.charCodeAt(i) === 0xffff) i--
  if (i < 0) return undefined
  return prefix.slice(0, i) + String.fromCharCode(prefix.charCodeAt(i) + 1)
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength))
  copy.set(bytes)
  return copy
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

async function bytesFromStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader()
  const chunks: Array<Uint8Array> = []
  let total = 0
  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(copyBytes(value))
      total += value.byteLength
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(new ArrayBuffer(total))
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function bytesFromBlobBody(
  body: BlobBody,
): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof body === 'string') return textEncoder.encode(body)
  if (body instanceof ArrayBuffer) return new Uint8Array(body.slice(0))
  if (ArrayBuffer.isView(body)) {
    return copyBytes(
      new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
    )
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return new Uint8Array(await body.arrayBuffer())
  }
  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    return bytesFromStream(body)
  }
  throw new TypeError('Unsupported blob body.')
}

export function createMessageStore(db: DrizzleDb): MessageStore {
  return {
    async loadThread(threadId) {
      const rows = await db
        .select({ messagesJson: messages.messagesJson })
        .from(messages)
        .where(eq(messages.threadId, threadId))
      return rows[0]?.messagesJson ?? []
    },
    async saveThread(threadId, msgs: Array<ModelMessage>) {
      await db
        .insert(messages)
        .values({ threadId, messagesJson: msgs })
        .onConflictDoUpdate({
          target: messages.threadId,
          set: { messagesJson: msgs },
        })
    },
  }
}

function mapRun(row: typeof runs.$inferSelect): RunRecord {
  return {
    runId: row.runId,
    threadId: row.threadId,
    status: row.status,
    startedAt: row.startedAt,
    ...(row.finishedAt != null ? { finishedAt: row.finishedAt } : {}),
    ...(row.error != null ? { error: row.error } : {}),
    ...(row.usageJson != null ? { usage: row.usageJson } : {}),
  }
}

export function createRunStore(db: DrizzleDb): RunStore {
  const store: RunStore = {
    async createOrResume(input) {
      const existing = await store.get(input.runId)
      if (existing) return existing
      const record: RunRecord = {
        runId: input.runId,
        threadId: input.threadId,
        status: input.status ?? 'running',
        startedAt: input.startedAt,
      }
      await db
        .insert(runs)
        .values({
          runId: record.runId,
          threadId: record.threadId,
          status: record.status,
          startedAt: record.startedAt,
        })
        .onConflictDoNothing({ target: runs.runId })
      return (await store.get(input.runId)) ?? record
    },
    async update(runId, patch) {
      const set: Partial<typeof runs.$inferInsert> = {}
      if (patch.status !== undefined) set.status = patch.status
      if (patch.finishedAt !== undefined) set.finishedAt = patch.finishedAt
      if (patch.error !== undefined) set.error = patch.error
      if (patch.usage !== undefined) set.usageJson = patch.usage
      if (Object.keys(set).length === 0) return
      await db.update(runs).set(set).where(eq(runs.runId, runId))
    },
    async get(runId) {
      const rows = await db.select().from(runs).where(eq(runs.runId, runId))
      const row = rows[0]
      return row ? mapRun(row) : null
    },
  }
  return store
}

function mapInterrupt(row: typeof interrupts.$inferSelect): InterruptRecord {
  return {
    interruptId: row.interruptId,
    runId: row.runId,
    threadId: row.threadId,
    status: row.status,
    requestedAt: row.requestedAt,
    ...(row.resolvedAt != null ? { resolvedAt: row.resolvedAt } : {}),
    payload: row.payloadJson,
    ...(row.responseJson != null ? { response: row.responseJson } : {}),
  }
}

export function createInterruptStore(db: DrizzleDb): InterruptStore {
  return {
    async create(record) {
      await db
        .insert(interrupts)
        .values({
          interruptId: record.interruptId,
          runId: record.runId,
          threadId: record.threadId,
          status: record.status,
          requestedAt: record.requestedAt,
          payloadJson: record.payload,
          responseJson: record.response ?? null,
        })
        .onConflictDoNothing({ target: interrupts.interruptId })
    },
    async resolve(interruptId, response) {
      await db
        .update(interrupts)
        .set({
          status: 'resolved',
          resolvedAt: Date.now(),
          responseJson: response ?? null,
        })
        .where(eq(interrupts.interruptId, interruptId))
    },
    async cancel(interruptId) {
      await db
        .update(interrupts)
        .set({ status: 'cancelled', resolvedAt: Date.now() })
        .where(eq(interrupts.interruptId, interruptId))
    },
    async get(interruptId) {
      const rows = await db
        .select()
        .from(interrupts)
        .where(eq(interrupts.interruptId, interruptId))
      const row = rows[0]
      return row ? mapInterrupt(row) : null
    },
    async list(threadId) {
      const rows = await db
        .select()
        .from(interrupts)
        .where(eq(interrupts.threadId, threadId))
        .orderBy(asc(interrupts.requestedAt))
      return rows.map(mapInterrupt)
    },
    async listPending(threadId) {
      const rows = await db
        .select()
        .from(interrupts)
        .where(
          and(
            eq(interrupts.threadId, threadId),
            eq(interrupts.status, 'pending'),
          ),
        )
        .orderBy(asc(interrupts.requestedAt))
      return rows.map(mapInterrupt)
    },
    async listByRun(runId) {
      const rows = await db
        .select()
        .from(interrupts)
        .where(eq(interrupts.runId, runId))
        .orderBy(asc(interrupts.requestedAt))
      return rows.map(mapInterrupt)
    },
    async listPendingByRun(runId) {
      const rows = await db
        .select()
        .from(interrupts)
        .where(
          and(eq(interrupts.runId, runId), eq(interrupts.status, 'pending')),
        )
        .orderBy(asc(interrupts.requestedAt))
      return rows.map(mapInterrupt)
    },
  }
}

export function createMetadataStore(db: DrizzleDb): MetadataStore {
  return {
    async get(scope, key) {
      const rows = await db
        .select({ valueJson: metadata.valueJson })
        .from(metadata)
        .where(and(eq(metadata.scope, scope), eq(metadata.key, key)))
      const row = rows[0]
      return row ? row.valueJson : null
    },
    async set(scope, key, value) {
      await db
        .insert(metadata)
        .values({ scope, key, valueJson: value })
        .onConflictDoUpdate({
          target: [metadata.scope, metadata.key],
          set: { valueJson: value },
        })
    },
    async delete(scope, key) {
      await db
        .delete(metadata)
        .where(and(eq(metadata.scope, scope), eq(metadata.key, key)))
    },
  }
}

function mapArtifact(row: typeof artifacts.$inferSelect): ArtifactRecord {
  return {
    artifactId: row.artifactId,
    runId: row.runId,
    threadId: row.threadId,
    name: row.name,
    mimeType: row.mimeType,
    size: row.size,
    ...(row.externalUrl != null ? { externalUrl: row.externalUrl } : {}),
    createdAt: row.createdAt,
  }
}

export function createArtifactStore(db: DrizzleDb): ArtifactStore {
  return {
    async save(record) {
      const values = {
        artifactId: record.artifactId,
        runId: record.runId,
        threadId: record.threadId,
        name: record.name,
        mimeType: record.mimeType,
        size: record.size,
        externalUrl: record.externalUrl ?? null,
        createdAt: record.createdAt,
      }
      await db
        .insert(artifacts)
        .values(values)
        .onConflictDoUpdate({
          target: artifacts.artifactId,
          set: {
            runId: values.runId,
            threadId: values.threadId,
            name: values.name,
            mimeType: values.mimeType,
            size: values.size,
            externalUrl: values.externalUrl,
            createdAt: values.createdAt,
          },
        })
    },
    async get(artifactId) {
      const rows = await db
        .select()
        .from(artifacts)
        .where(eq(artifacts.artifactId, artifactId))
      const row = rows[0]
      return row ? mapArtifact(row) : null
    },
    async list(runId) {
      const rows = await db
        .select()
        .from(artifacts)
        .where(eq(artifacts.runId, runId))
        .orderBy(asc(artifacts.createdAt), asc(artifacts.artifactId))
      return rows.map(mapArtifact)
    },
    async delete(artifactId) {
      await db.delete(artifacts).where(eq(artifacts.artifactId, artifactId))
    },
    async deleteForRun(runId) {
      await db.delete(artifacts).where(eq(artifacts.runId, runId))
    },
  }
}

function blobRecordSnapshot(row: typeof blobs.$inferSelect): BlobRecord {
  return {
    key: row.key,
    ...(row.size != null ? { size: row.size } : {}),
    ...(row.etag != null ? { etag: row.etag } : {}),
    ...(row.contentType != null ? { contentType: row.contentType } : {}),
    ...(row.customMetadataJson != null
      ? { customMetadata: { ...row.customMetadataJson } }
      : {}),
    ...(row.createdAt != null ? { createdAt: row.createdAt } : {}),
    ...(row.updatedAt != null ? { updatedAt: row.updatedAt } : {}),
  }
}

function blobObject(row: typeof blobs.$inferSelect): BlobObject {
  const bytes = row.body
    ? copyBytes(new Uint8Array(row.body))
    : new Uint8Array()
  return {
    ...blobRecordSnapshot(row),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(copyBytes(bytes))
        controller.close()
      },
    }),
    arrayBuffer: () => Promise.resolve(bytesToArrayBuffer(bytes)),
    text: () => Promise.resolve(textDecoder.decode(bytes)),
  }
}

export function createBlobStore(db: DrizzleDb): BlobStore {
  const readRow = async (key: string) => {
    const rows = await db.select().from(blobs).where(eq(blobs.key, key))
    return rows[0] ?? null
  }
  return {
    async put(key, body, options) {
      const bytes = await bytesFromBlobBody(body)
      const existing = await readRow(key)
      const now = Date.now()
      const contentType =
        options?.contentType ??
        (typeof Blob !== 'undefined' && body instanceof Blob
          ? body.type || undefined
          : undefined)
      const customMetadata = options?.customMetadata
        ? { ...options.customMetadata }
        : undefined
      const record = {
        key,
        contentType: contentType ?? null,
        size: bytes.byteLength,
        etag: crypto.randomUUID(),
        customMetadataJson: customMetadata ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        body: bytes,
      }
      await db
        .insert(blobs)
        .values(record)
        .onConflictDoUpdate({
          target: blobs.key,
          set: {
            contentType: record.contentType,
            size: record.size,
            etag: record.etag,
            customMetadataJson: record.customMetadataJson,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            body: record.body,
          },
        })
      const stored = await readRow(key)
      return stored ? blobRecordSnapshot(stored) : blobRecordSnapshot(record)
    },
    async get(key) {
      const row = await readRow(key)
      return row ? blobObject(row) : null
    },
    async head(key) {
      const row = await readRow(key)
      return row ? blobRecordSnapshot(row) : null
    },
    async delete(key) {
      await db.delete(blobs).where(eq(blobs.key, key))
    },
    async list(options?: BlobListOptions): Promise<BlobListPage> {
      const limit = options?.limit
      if (limit === 0) return { objects: [], truncated: false }
      const prefix = options?.prefix ?? ''
      // Match the prefix LITERALLY and case-sensitively to mirror the reference
      // in-memory backend's `key.startsWith(prefix)`. A SQL `LIKE '${prefix}%'`
      // would treat `_`/`%` in the caller's prefix as wildcards and, on SQLite,
      // match case-insensitively for ASCII. Instead use a half-open range on the
      // (BINARY-collated) key column: `key >= prefix AND key < upperBound`, where
      // upperBound is the smallest string strictly greater than every key that
      // starts with `prefix`. This contains no LIKE metacharacters and relies on
      // the default binary/byte ordering, giving literal, case-sensitive matching.
      const conditions: Array<SQL> = []
      if (prefix !== '') {
        conditions.push(gte(blobs.key, prefix))
        const upperBound = prefixUpperBound(prefix)
        if (upperBound !== undefined) {
          conditions.push(lt(blobs.key, upperBound))
        }
      }
      if (options?.cursor !== undefined) {
        conditions.push(gt(blobs.key, options.cursor))
      }
      const base = db
        .select()
        .from(blobs)
        .where(and(...conditions))
        .orderBy(asc(blobs.key))
      const rows = await (limit === undefined ? base : base.limit(limit + 1))
      const pageRows = limit === undefined ? rows : rows.slice(0, limit)
      const objects = pageRows.map(blobRecordSnapshot)
      const truncated = limit !== undefined && rows.length > limit
      return {
        objects,
        ...(truncated ? { cursor: pageRows.at(-1)?.key, truncated } : {}),
      }
    },
  }
}
