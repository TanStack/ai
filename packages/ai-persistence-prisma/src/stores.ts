/**
 * AIPersistence store implementations over a Prisma `PrismaClient`.
 *
 * Each method mirrors the semantics of the reference in-memory backend
 * (`@tanstack/ai-persistence`'s `memory.ts`) and the sibling Drizzle backend
 * (`@tanstack/ai-persistence-drizzle`'s `stores.ts`). JSON-valued columns are
 * TEXT (Prisma's `Json` type is unavailable on sqlite), so they are serialized
 * with `JSON.stringify`/`JSON.parse` here; blob bytes use Prisma's `Bytes`.
 */
import type { PrismaClient } from '@prisma/client'
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

function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes)
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

async function bytesFromStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
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
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function bytesFromBlobBody(body: BlobBody): Promise<Uint8Array> {
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

export function createMessageStore(prisma: PrismaClient): MessageStore {
  return {
    async loadThread(threadId) {
      const row = await prisma.message.findUnique({ where: { threadId } })
      if (!row) return []
      return JSON.parse(row.messagesJson) as Array<ModelMessage>
    },
    async saveThread(threadId, msgs: Array<ModelMessage>) {
      const messagesJson = JSON.stringify(msgs)
      await prisma.message.upsert({
        where: { threadId },
        create: { threadId, messagesJson },
        update: { messagesJson },
      })
    },
  }
}

interface RunRow {
  runId: string
  threadId: string
  status: string
  startedAt: bigint
  finishedAt: bigint | null
  error: string | null
  usageJson: string | null
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

export function createRunStore(prisma: PrismaClient): RunStore {
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
      await prisma.run.upsert({
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
      await prisma.run.updateMany({ where: { runId }, data })
    },
    async get(runId) {
      const row = await prisma.run.findUnique({ where: { runId } })
      return row ? mapRun(row) : null
    },
  }
  return store
}

interface InterruptRow {
  interruptId: string
  runId: string
  threadId: string
  status: string
  requestedAt: bigint
  resolvedAt: bigint | null
  payloadJson: string
  responseJson: string | null
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

export function createInterruptStore(prisma: PrismaClient): InterruptStore {
  return {
    async create(record) {
      await prisma.interrupt.upsert({
        where: { interruptId: record.interruptId },
        create: {
          interruptId: record.interruptId,
          runId: record.runId,
          threadId: record.threadId,
          status: record.status,
          requestedAt: BigInt(record.requestedAt),
          payloadJson: JSON.stringify(record.payload),
          responseJson:
            record.response == null ? null : JSON.stringify(record.response),
        },
        update: {},
      })
    },
    async resolve(interruptId, response) {
      await prisma.interrupt.updateMany({
        where: { interruptId },
        data: {
          status: 'resolved',
          resolvedAt: BigInt(Date.now()),
          responseJson: response == null ? null : JSON.stringify(response),
        },
      })
    },
    async cancel(interruptId) {
      await prisma.interrupt.updateMany({
        where: { interruptId },
        data: { status: 'cancelled', resolvedAt: BigInt(Date.now()) },
      })
    },
    async get(interruptId) {
      const row = await prisma.interrupt.findUnique({ where: { interruptId } })
      return row ? mapInterrupt(row) : null
    },
    async list(threadId) {
      const rows = await prisma.interrupt.findMany({
        where: { threadId },
        orderBy: { requestedAt: 'asc' },
      })
      return rows.map(mapInterrupt)
    },
    async listPending(threadId) {
      const rows = await prisma.interrupt.findMany({
        where: { threadId, status: 'pending' },
        orderBy: { requestedAt: 'asc' },
      })
      return rows.map(mapInterrupt)
    },
    async listByRun(runId) {
      const rows = await prisma.interrupt.findMany({
        where: { runId },
        orderBy: { requestedAt: 'asc' },
      })
      return rows.map(mapInterrupt)
    },
    async listPendingByRun(runId) {
      const rows = await prisma.interrupt.findMany({
        where: { runId, status: 'pending' },
        orderBy: { requestedAt: 'asc' },
      })
      return rows.map(mapInterrupt)
    },
  }
}

export function createMetadataStore(prisma: PrismaClient): MetadataStore {
  return {
    async get(scope, key) {
      const row = await prisma.metadata.findUnique({
        where: { scope_key: { scope, key } },
      })
      return row ? (JSON.parse(row.valueJson) as unknown) : null
    },
    async set(scope, key, value) {
      const valueJson = JSON.stringify(value)
      await prisma.metadata.upsert({
        where: { scope_key: { scope, key } },
        create: { scope, key, valueJson },
        update: { valueJson },
      })
    },
    async delete(scope, key) {
      await prisma.metadata.deleteMany({ where: { scope, key } })
    },
  }
}

interface ArtifactRow {
  artifactId: string
  runId: string
  threadId: string
  name: string
  mimeType: string
  size: bigint
  externalUrl: string | null
  createdAt: bigint
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

export function createArtifactStore(prisma: PrismaClient): ArtifactStore {
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
      await prisma.artifact.upsert({
        where: { artifactId: record.artifactId },
        create: { artifactId: record.artifactId, ...data },
        update: data,
      })
    },
    async get(artifactId) {
      const row = await prisma.artifact.findUnique({ where: { artifactId } })
      return row ? mapArtifact(row) : null
    },
    async list(runId) {
      const rows = await prisma.artifact.findMany({
        where: { runId },
        orderBy: [{ createdAt: 'asc' }, { artifactId: 'asc' }],
      })
      return rows.map(mapArtifact)
    },
    async delete(artifactId) {
      await prisma.artifact.deleteMany({ where: { artifactId } })
    },
    async deleteForRun(runId) {
      await prisma.artifact.deleteMany({ where: { runId } })
    },
  }
}

interface BlobRow {
  key: string
  contentType: string | null
  size: bigint | null
  etag: string | null
  customMetadataJson: string | null
  createdAt: bigint | null
  updatedAt: bigint | null
  body: Uint8Array | null
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

export function createBlobStore(prisma: PrismaClient): BlobStore {
  const readRow = (key: string): Promise<BlobRow | null> =>
    prisma.blob.findUnique({ where: { key } })
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
        body: Buffer.from(bytes),
      }
      const stored = await prisma.blob.upsert({
        where: { key },
        create: { key, ...record },
        update: record,
      })
      return blobRecordSnapshot(stored)
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
      await prisma.blob.deleteMany({ where: { key } })
    },
    async list(options?: BlobListOptions): Promise<BlobListPage> {
      const limit = options?.limit
      if (limit === 0) return { objects: [], truncated: false }
      const prefix = options?.prefix ?? ''
      // Match the prefix LITERALLY and case-sensitively to mirror the reference
      // in-memory backend's `key.startsWith(prefix)`. Prisma's `startsWith`
      // compiles to a SQL `LIKE` on sqlite, which treats `_`/`%` in the prefix
      // as wildcards and matches case-insensitively for ASCII. Instead use a
      // half-open range on the (BINARY-collated) key column — `key >= prefix AND
      // key < upperBound` — which contains no LIKE metacharacters and relies on
      // binary/byte ordering, giving literal, case-sensitive matching.
      const upperBound = prefixUpperBound(prefix)
      const rows = await prisma.blob.findMany({
        where: {
          key: {
            gte: prefix,
            ...(upperBound !== undefined ? { lt: upperBound } : {}),
            ...(options?.cursor !== undefined ? { gt: options.cursor } : {}),
          },
        },
        orderBy: { key: 'asc' },
        ...(limit === undefined ? {} : { take: limit + 1 }),
      })
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
