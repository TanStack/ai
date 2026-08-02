import { defineAIPersistence } from './types'
import { resolveBlobRange } from './blob-range'
import type { ModelMessage } from '@tanstack/ai'
import type {
  ArtifactRecord,
  ArtifactStore,
  BlobBody,
  BlobGetOptions,
  BlobListOptions,
  BlobObject,
  BlobPutOptions,
  BlobRange,
  BlobRecord,
  BlobStore,
  GenerationRunRecord,
  GenerationRunStore,
  InterruptRecord,
  InterruptStore,
  MessageStore,
  MetadataStore,
  RunRecord,
  RunStore,
} from './types'

class MemoryMessageStore implements MessageStore {
  private readonly threads = new Map<string, Array<ModelMessage>>()
  loadThread(threadId: string): Promise<Array<ModelMessage>> {
    return Promise.resolve(this.threads.get(threadId)?.slice() ?? [])
  }
  saveThread(threadId: string, messages: Array<ModelMessage>): Promise<void> {
    this.threads.set(threadId, messages.slice())
    return Promise.resolve()
  }
}

class MemoryRunStore implements RunStore {
  private readonly runs = new Map<string, RunRecord>()
  createOrResume(input: {
    runId: string
    threadId: string
    status?: RunRecord['status']
    startedAt: number
  }): Promise<RunRecord> {
    const existing = this.runs.get(input.runId)
    if (existing) return Promise.resolve(existing)
    const record: RunRecord = {
      runId: input.runId,
      threadId: input.threadId,
      status: input.status ?? 'running',
      startedAt: input.startedAt,
    }
    this.runs.set(record.runId, record)
    return Promise.resolve(record)
  }
  update(
    runId: string,
    patch: Partial<
      Pick<RunRecord, 'status' | 'finishedAt' | 'error' | 'usage'>
    >,
  ): Promise<void> {
    const existing = this.runs.get(runId)
    if (existing) this.runs.set(runId, { ...existing, ...patch })
    return Promise.resolve()
  }
  get(runId: string): Promise<RunRecord | null> {
    return Promise.resolve(this.runs.get(runId) ?? null)
  }
  findActiveRun(threadId: string): Promise<RunRecord | null> {
    const active = [...this.runs.values()]
      .filter((run) => run.threadId === threadId && run.status === 'running')
      .sort((a, b) => b.startedAt - a.startedAt)
    return Promise.resolve(active[0] ?? null)
  }
}

class MemoryGenerationRunStore implements GenerationRunStore {
  private readonly generationRuns = new Map<string, GenerationRunRecord>()
  createOrResume(
    input: Pick<
      GenerationRunRecord,
      'runId' | 'threadId' | 'activity' | 'provider' | 'model' | 'startedAt'
    > & { status?: GenerationRunRecord['status'] },
  ): Promise<GenerationRunRecord> {
    const existing = this.generationRuns.get(input.runId)
    if (existing) return Promise.resolve(existing)
    const record: GenerationRunRecord = {
      runId: input.runId,
      threadId: input.threadId,
      activity: input.activity,
      provider: input.provider,
      model: input.model,
      status: input.status ?? 'running',
      startedAt: input.startedAt,
    }
    this.generationRuns.set(record.runId, record)
    return Promise.resolve(record)
  }
  update(
    runId: string,
    patch: Partial<
      Pick<
        GenerationRunRecord,
        'status' | 'finishedAt' | 'error' | 'result' | 'artifacts' | 'usage'
      >
    >,
  ): Promise<void> {
    const existing = this.generationRuns.get(runId)
    if (existing) this.generationRuns.set(runId, { ...existing, ...patch })
    return Promise.resolve()
  }
  get(runId: string): Promise<GenerationRunRecord | null> {
    return Promise.resolve(this.generationRuns.get(runId) ?? null)
  }
  findLatestForThread(threadId: string): Promise<GenerationRunRecord | null> {
    const linked = [...this.generationRuns.values()]
      .filter((run) => run.threadId === threadId)
      .sort((a, b) => b.startedAt - a.startedAt)
    return Promise.resolve(linked[0] ?? null)
  }
}

function byRequestedAt(a: InterruptRecord, b: InterruptRecord): number {
  return a.requestedAt - b.requestedAt
}

class MemoryInterruptStore implements InterruptStore {
  private readonly interrupts = new Map<string, InterruptRecord>()
  create(
    record: Omit<InterruptRecord, 'status' | 'resolvedAt'>,
  ): Promise<void> {
    // Insert-if-absent (canonical semantics, matching the SQL backends'
    // ON CONFLICT DO NOTHING): a duplicate id must never clobber an existing —
    // possibly already resolved — interrupt back to pending.
    if (!this.interrupts.has(record.interruptId)) {
      this.interrupts.set(record.interruptId, { ...record, status: 'pending' })
    }
    return Promise.resolve()
  }
  resolve(interruptId: string, response?: unknown): Promise<void> {
    const existing = this.interrupts.get(interruptId)
    if (existing) {
      this.interrupts.set(interruptId, {
        ...existing,
        status: 'resolved',
        resolvedAt: Date.now(),
        response,
      })
    }
    return Promise.resolve()
  }
  cancel(interruptId: string): Promise<void> {
    const existing = this.interrupts.get(interruptId)
    if (existing) {
      this.interrupts.set(interruptId, {
        ...existing,
        status: 'cancelled',
        resolvedAt: Date.now(),
      })
    }
    return Promise.resolve()
  }
  get(interruptId: string): Promise<InterruptRecord | null> {
    return Promise.resolve(this.interrupts.get(interruptId) ?? null)
  }
  list(threadId: string): Promise<Array<InterruptRecord>> {
    return Promise.resolve(
      [...this.interrupts.values()]
        .filter((interrupt) => interrupt.threadId === threadId)
        .sort(byRequestedAt),
    )
  }
  listPending(threadId: string): Promise<Array<InterruptRecord>> {
    return Promise.resolve(
      [...this.interrupts.values()]
        .filter(
          (interrupt) =>
            interrupt.threadId === threadId && interrupt.status === 'pending',
        )
        .sort(byRequestedAt),
    )
  }
  listByRun(runId: string): Promise<Array<InterruptRecord>> {
    return Promise.resolve(
      [...this.interrupts.values()]
        .filter((interrupt) => interrupt.runId === runId)
        .sort(byRequestedAt),
    )
  }
  listPendingByRun(runId: string): Promise<Array<InterruptRecord>> {
    return Promise.resolve(
      [...this.interrupts.values()]
        .filter(
          (interrupt) =>
            interrupt.runId === runId && interrupt.status === 'pending',
        )
        .sort(byRequestedAt),
    )
  }
}

class MemoryMetadataStore implements MetadataStore {
  // Nested maps so composite identity is `(namespace, key)` without the
  // `${namespace}:${key}` collision where `('a:b','c')` aliases `('a','b:c')`.
  // (This parameter is an app-defined metadata namespace string — not the
  // shared `Scope` identity type from `@tanstack/ai`.)
  private readonly values = new Map<string, Map<string, unknown>>()
  get(namespace: string, key: string): Promise<unknown | null> {
    const bucket = this.values.get(namespace)
    if (!bucket || !bucket.has(key)) return Promise.resolve(null)
    return Promise.resolve(bucket.get(key))
  }
  set(namespace: string, key: string, value: unknown): Promise<void> {
    let bucket = this.values.get(namespace)
    if (!bucket) {
      bucket = new Map()
      this.values.set(namespace, bucket)
    }
    bucket.set(key, value)
    return Promise.resolve()
  }
  delete(namespace: string, key: string): Promise<void> {
    const bucket = this.values.get(namespace)
    if (!bucket) return Promise.resolve()
    bucket.delete(key)
    if (bucket.size === 0) this.values.delete(namespace)
    return Promise.resolve()
  }
}

class MemoryArtifactStore implements ArtifactStore {
  private readonly artifacts = new Map<string, ArtifactRecord>()
  save(record: ArtifactRecord): Promise<void> {
    this.artifacts.set(record.artifactId, { ...record })
    return Promise.resolve()
  }
  get(artifactId: string): Promise<ArtifactRecord | null> {
    return Promise.resolve(this.artifacts.get(artifactId) ?? null)
  }
  list(runId: string): Promise<Array<ArtifactRecord>> {
    return Promise.resolve(
      [...this.artifacts.values()].filter((a) => a.runId === runId),
    )
  }
  delete(artifactId: string): Promise<void> {
    this.artifacts.delete(artifactId)
    return Promise.resolve()
  }
  deleteForRun(runId: string): Promise<void> {
    for (const artifact of this.artifacts.values()) {
      if (artifact.runId === runId) this.artifacts.delete(artifact.artifactId)
    }
    return Promise.resolve()
  }
}

interface MemoryBlobEntry {
  record: BlobRecord
  bytes: Uint8Array
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

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
  if (typeof body === 'string') {
    return textEncoder.encode(body)
  }
  if (body instanceof ArrayBuffer) {
    return new Uint8Array(body.slice(0))
  }
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

function blobRecordSnapshot(record: BlobRecord): BlobRecord {
  return {
    ...record,
    ...(record.customMetadata
      ? { customMetadata: { ...record.customMetadata } }
      : {}),
  }
}

function blobObject(
  record: BlobRecord,
  bytes: Uint8Array,
  range?: BlobRange,
): BlobObject {
  // `size` keeps reporting the whole object; only the bytes narrow.
  const served = range
    ? resolveBlobRange(bytes.byteLength, range)
    : { offset: 0, length: bytes.byteLength }
  const copied = copyBytes(
    bytes.subarray(served.offset, served.offset + served.length),
  )
  return {
    ...blobRecordSnapshot(record),
    ...(range ? { range: served } : {}),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(copyBytes(copied))
        controller.close()
      },
    }),
    arrayBuffer: () => Promise.resolve(bytesToArrayBuffer(copied)),
    text: () => Promise.resolve(textDecoder.decode(copied)),
  }
}

class MemoryBlobStore implements BlobStore {
  private readonly blobs = new Map<string, MemoryBlobEntry>()
  private nextEtag = 1

  async put(
    key: string,
    body: BlobBody,
    options?: BlobPutOptions,
  ): Promise<BlobRecord> {
    const bytes = await bytesFromBlobBody(body)
    const existing = this.blobs.get(key)
    const now = Date.now()
    const record: BlobRecord = {
      key,
      size: bytes.byteLength,
      etag: String(this.nextEtag++),
      contentType:
        options?.contentType ??
        (typeof Blob !== 'undefined' && body instanceof Blob
          ? body.type || undefined
          : undefined),
      customMetadata: options?.customMetadata
        ? { ...options.customMetadata }
        : undefined,
      createdAt: existing?.record.createdAt ?? now,
      updatedAt: now,
    }
    this.blobs.set(key, { record, bytes: copyBytes(bytes) })
    return blobRecordSnapshot(record)
  }

  get(key: string, options?: BlobGetOptions): Promise<BlobObject | null> {
    const entry = this.blobs.get(key)
    return Promise.resolve(
      entry ? blobObject(entry.record, entry.bytes, options?.range) : null,
    )
  }

  head(key: string): Promise<BlobRecord | null> {
    const entry = this.blobs.get(key)
    return Promise.resolve(entry ? blobRecordSnapshot(entry.record) : null)
  }

  delete(key: string): Promise<void> {
    this.blobs.delete(key)
    return Promise.resolve()
  }

  list(options?: BlobListOptions): Promise<{
    objects: Array<BlobRecord>
    cursor?: string
    truncated?: boolean
  }> {
    const limit = options?.limit
    if (limit === 0) {
      return Promise.resolve({ objects: [], truncated: false })
    }
    const keys = [...this.blobs.keys()]
      .filter((key) => key.startsWith(options?.prefix ?? ''))
      .filter((key) => options?.cursor === undefined || key > options.cursor)
      .sort()
    const pageKeys = limit === undefined ? keys : keys.slice(0, limit)
    const objects = pageKeys.map((key) => {
      const blob = this.blobs.get(key)
      if (blob === undefined) {
        throw new Error(`Missing blob for listed key: ${key}`)
      }
      return blobRecordSnapshot(blob.record)
    })
    const truncated = limit !== undefined && keys.length > limit
    return Promise.resolve({
      objects,
      ...(truncated ? { cursor: pageKeys.at(-1), truncated } : {}),
    })
  }
}

interface MemoryPersistenceStores {
  messages: MessageStore
  runs: RunStore
  generationRuns: GenerationRunStore
  interrupts: InterruptStore
  metadata: MetadataStore
  artifacts: ArtifactStore
  blobs: BlobStore
}

/**
 * In-process reference backend for the full state + generation store set.
 *
 * Returns messages + runs + generationRuns + interrupts + metadata + artifacts
 * + blobs. Locks are not included — use `InMemoryLockStore` + `withLocks` from
 * `@tanstack/ai` when a test or single-process app needs coordination.
 */
export function memoryPersistence() {
  const stores: MemoryPersistenceStores = {
    messages: new MemoryMessageStore(),
    runs: new MemoryRunStore(),
    generationRuns: new MemoryGenerationRunStore(),
    interrupts: new MemoryInterruptStore(),
    metadata: new MemoryMetadataStore(),
    artifacts: new MemoryArtifactStore(),
    blobs: new MemoryBlobStore(),
  }
  return defineAIPersistence({ stores })
}
