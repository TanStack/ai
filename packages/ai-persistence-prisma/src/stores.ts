/**
 * AIPersistence store implementations over a Prisma `PrismaClient`.
 *
 * Each method mirrors the reference in-memory backend
 * (`@tanstack/ai-persistence`'s `memory.ts`) and the sibling Drizzle backend
 * (`@tanstack/ai-persistence-drizzle`'s `stores.ts`), including the
 * insert-if-absent `InterruptStore.create` and `RunStore.createOrResume`
 * semantics (`upsert` with an empty `update`). JSON-valued columns use
 * provider-neutral Prisma `String` fields, so they are serialized with
 * `JSON.stringify`/`JSON.parse` here; blob bytes use Prisma's `Bytes`.
 */
import type {
  ArtifactRow,
  BlobRow,
  InterruptRow,
  RunRow,
  TanstackAiDelegates,
} from './model-contract'
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
  RunStatus,
  RunStore,
} from '@tanstack/ai-persistence'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

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

export function createMessageStore({
  message,
}: TanstackAiDelegates): MessageStore {
  return {
    async loadThread(threadId) {
      const row = await message.findUnique({ where: { threadId } })
      if (!row) return []
      return JSON.parse(row.messagesJson) as Array<ModelMessage>
    },
    async saveThread(threadId, msgs: Array<ModelMessage>) {
      const messagesJson = JSON.stringify(msgs)
      await message.upsert({
        where: { threadId },
        create: { threadId, messagesJson },
        update: { messagesJson },
      })
    },
  }
}

function mapRun(row: RunRow): RunRecord {
  return {
    runId: row.runId,
    threadId: row.threadId,
    status: row.status as RunStatus,
    startedAt: Number(row.startedAt),
    ...(row.finishedAt != null ? { finishedAt: Number(row.finishedAt) } : {}),
    ...(row.error != null ? { error: row.error } : {}),
    ...(row.usageJson != null
      ? { usage: JSON.parse(row.usageJson) as RunRecord['usage'] }
      : {}),
  }
}

export function createRunStore({ run }: TanstackAiDelegates): RunStore {
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
      // Upsert with an empty update = insert-if-absent (never overwrites an
      // existing run), matching the reference createOrResume semantics.
      await run.upsert({
        where: { runId: record.runId },
        create: {
          runId: record.runId,
          threadId: record.threadId,
          status: record.status,
          startedAt: BigInt(record.startedAt),
        },
        update: {},
      })
      return (await store.get(input.runId)) ?? record
    },
    async update(runId, patch) {
      const data: {
        status?: RunStatus
        finishedAt?: bigint
        error?: string
        usageJson?: string
      } = {}
      if (patch.status !== undefined) data.status = patch.status
      if (patch.finishedAt !== undefined)
        data.finishedAt = BigInt(patch.finishedAt)
      if (patch.error !== undefined) data.error = patch.error
      if (patch.usage !== undefined)
        data.usageJson = JSON.stringify(patch.usage)
      if (Object.keys(data).length === 0) return
      // updateMany no-ops (does not throw) when the run does not exist.
      await run.updateMany({ where: { runId }, data })
    },
    async get(runId) {
      const row = await run.findUnique({ where: { runId } })
      return row ? mapRun(row) : null
    },
  }
  return store
}

function mapInterrupt(row: InterruptRow): InterruptRecord {
  return {
    interruptId: row.interruptId,
    runId: row.runId,
    threadId: row.threadId,
    status: row.status as InterruptRecord['status'],
    requestedAt: Number(row.requestedAt),
    ...(row.resolvedAt != null ? { resolvedAt: Number(row.resolvedAt) } : {}),
    payload: JSON.parse(row.payloadJson) as Record<string, unknown>,
    ...(row.responseJson != null
      ? { response: JSON.parse(row.responseJson) as unknown }
      : {}),
  }
}

export function createInterruptStore({
  interrupt,
}: TanstackAiDelegates): InterruptStore {
  return {
    async create(record) {
      await interrupt.upsert({
        where: { interruptId: record.interruptId },
        create: {
          interruptId: record.interruptId,
          runId: record.runId,
          threadId: record.threadId,
          status: 'pending',
          requestedAt: BigInt(record.requestedAt),
          payloadJson: JSON.stringify(record.payload),
          responseJson:
            record.response == null ? null : JSON.stringify(record.response),
        },
        update: {},
      })
    },
    async resolve(interruptId, response) {
      await interrupt.updateMany({
        where: { interruptId },
        data: {
          status: 'resolved',
          resolvedAt: BigInt(Date.now()),
          responseJson: response == null ? null : JSON.stringify(response),
        },
      })
    },
    async cancel(interruptId) {
      await interrupt.updateMany({
        where: { interruptId },
        data: { status: 'cancelled', resolvedAt: BigInt(Date.now()) },
      })
    },
    async get(interruptId) {
      const row = await interrupt.findUnique({ where: { interruptId } })
      return row ? mapInterrupt(row) : null
    },
    async list(threadId) {
      const rows = await interrupt.findMany({
        where: { threadId },
        orderBy: { requestedAt: 'asc' },
      })
      return rows.map(mapInterrupt)
    },
    async listPending(threadId) {
      const rows = await interrupt.findMany({
        where: { threadId, status: 'pending' },
        orderBy: { requestedAt: 'asc' },
      })
      return rows.map(mapInterrupt)
    },
    async listByRun(runId) {
      const rows = await interrupt.findMany({
        where: { runId },
        orderBy: { requestedAt: 'asc' },
      })
      return rows.map(mapInterrupt)
    },
    async listPendingByRun(runId) {
      const rows = await interrupt.findMany({
        where: { runId, status: 'pending' },
        orderBy: { requestedAt: 'asc' },
      })
      return rows.map(mapInterrupt)
    },
  }
}

function assertStorableMetadata(value: unknown): void {
  if (value == null) {
    throw new TypeError(
      `TanStack AI metadata values must be defined, non-null JSON; received ${
        value === undefined ? '`undefined`' : '`null`'
      }. Use \`delete(scope, key)\` to clear a value.`,
    )
  }
}

export function createMetadataStore({
  metadata,
}: TanstackAiDelegates): MetadataStore {
  return {
    async get(scope, key) {
      const row = await metadata.findUnique({
        where: { scope_key: { scope, key } },
      })
      return row ? (JSON.parse(row.valueJson) as unknown) : null
    },
    async set(scope, key, value) {
      // SQL backends store JSON text in a NOT NULL column and cannot persist a
      // nullish value: `JSON.stringify(undefined)` is `undefined` (no string),
      // and the sibling Drizzle backend binds a JS `null` as SQL NULL — both
      // violate NOT NULL. Reject nullish with a clear error (consistent across
      // the SQL backends) instead of a cryptic driver failure. Unlike the
      // in-memory reference, which round-trips nullish; use `delete` to clear.
      assertStorableMetadata(value)
      const valueJson = JSON.stringify(value)
      await metadata.upsert({
        where: { scope_key: { scope, key } },
        create: { scope, key, valueJson },
        update: { valueJson },
      })
    },
    async delete(scope, key) {
      await metadata.deleteMany({ where: { scope, key } })
    },
  }
}

function mapArtifact(row: ArtifactRow): ArtifactRecord {
  return {
    artifactId: row.artifactId,
    runId: row.runId,
    threadId: row.threadId,
    name: row.name,
    mimeType: row.mimeType,
    size: Number(row.size),
    ...(row.externalUrl != null ? { externalUrl: row.externalUrl } : {}),
    createdAt: Number(row.createdAt),
  }
}

export function createArtifactStore({
  artifact,
}: TanstackAiDelegates): ArtifactStore {
  return {
    async save(record) {
      const data = {
        runId: record.runId,
        threadId: record.threadId,
        name: record.name,
        mimeType: record.mimeType,
        size: BigInt(record.size),
        externalUrl: record.externalUrl ?? null,
        createdAt: BigInt(record.createdAt),
      }
      await artifact.upsert({
        where: { artifactId: record.artifactId },
        create: { artifactId: record.artifactId, ...data },
        update: data,
      })
    },
    async get(artifactId) {
      const row = await artifact.findUnique({ where: { artifactId } })
      return row ? mapArtifact(row) : null
    },
    async list(runId) {
      const rows = await artifact.findMany({
        where: { runId },
        orderBy: [{ createdAt: 'asc' }, { artifactId: 'asc' }],
      })
      return rows.map(mapArtifact)
    },
    async delete(artifactId) {
      await artifact.deleteMany({ where: { artifactId } })
    },
    async deleteForRun(runId) {
      await artifact.deleteMany({ where: { runId } })
    },
  }
}

function blobRecordSnapshot(row: BlobRow): BlobRecord {
  return {
    key: row.key,
    ...(row.size != null ? { size: Number(row.size) } : {}),
    ...(row.etag != null ? { etag: row.etag } : {}),
    ...(row.contentType != null ? { contentType: row.contentType } : {}),
    ...(row.customMetadataJson != null
      ? {
          customMetadata: JSON.parse(row.customMetadataJson) as Record<
            string,
            string
          >,
        }
      : {}),
    ...(row.createdAt != null ? { createdAt: Number(row.createdAt) } : {}),
    ...(row.updatedAt != null ? { updatedAt: Number(row.updatedAt) } : {}),
  }
}

function blobObject(row: BlobRow): BlobObject {
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

export function createBlobStore({ blob }: TanstackAiDelegates): BlobStore {
  const readRow = (key: string): Promise<BlobRow | null> =>
    blob.findUnique({ where: { key } })
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
        contentType: contentType ?? null,
        size: BigInt(bytes.byteLength),
        etag: crypto.randomUUID(),
        customMetadataJson: customMetadata
          ? JSON.stringify(customMetadata)
          : null,
        createdAt: existing?.createdAt ?? BigInt(now),
        updatedAt: BigInt(now),
        body: bytes,
      }
      await blob.upsert({
        where: { key },
        create: { key, ...record },
        update: record,
      })
      // Re-read like the Drizzle sibling: the structural delegate contract
      // types upsert's result as unknown so user-generated clients (with
      // renamed models / extra fields) stay assignable.
      const stored = await readRow(key)
      return blobRecordSnapshot(stored ?? { key, ...record })
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
      await blob.deleteMany({ where: { key } })
    },
    async list(options?: BlobListOptions): Promise<BlobListPage> {
      const limit = options?.limit
      if (limit === 0) return { objects: [], truncated: false }
      const prefix = options?.prefix ?? ''
      // Prefix matching, ordering, and cursor pagination are all done in JS to
      // stay CORRECT under any provider collation. A half-open range + `ORDER
      // BY key` would rely on the key column's collation matching JS byte/code-
      // unit order — false on Postgres locale collations and MySQL
      // `utf8mb4_0900_ai_ci` (case/accent-insensitive), where range bounds
      // include/exclude the wrong keys and `key > cursor` keyset paging skips
      // collation-equal rows. Prisma exposes no per-column `COLLATE`, so we push
      // only a coarse, index-usable `startsWith` (SQL `LIKE 'prefix%'`) as a
      // superset prefilter — LIKE is more permissive than byte equality, so
      // every byte-literal match is contained — then filter/sort/paginate in JS
      // exactly like the in-memory reference (`key.startsWith`, `key > cursor`,
      // code-unit sort). An empty prefix scans, matching the reference.
      const rows = await blob.findMany(
        prefix === '' ? {} : { where: { key: { startsWith: prefix } } },
      )
      const cursor = options?.cursor
      const matched = rows
        .filter((row) => row.key.startsWith(prefix))
        .filter((row) => cursor === undefined || row.key > cursor)
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      const pageRows = limit === undefined ? matched : matched.slice(0, limit)
      const objects = pageRows.map(blobRecordSnapshot)
      const truncated = limit !== undefined && matched.length > limit
      return {
        objects,
        ...(truncated ? { cursor: pageRows.at(-1)?.key, truncated } : {}),
      }
    },
  }
}
