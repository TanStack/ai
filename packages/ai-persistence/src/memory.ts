import { InMemoryLockStore } from '@tanstack/ai'
import { encodeCursor } from './cursor'
import { AppendConflictError, defineAIPersistence } from './types'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'
import type {
  AIPersistence,
  ArtifactRecord,
  ArtifactStore,
  BlobBody,
  BlobListOptions,
  BlobObject,
  BlobRecord,
  BlobStore,
  InternalEventStore,
  InterruptRecord,
  InterruptStore,
  MessageStore,
  MetadataStore,
  PersistedInternalEvent,
  PersistedPublicEvent,
  PublicEventStore,
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
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableJsonValue(item))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableJsonValue(item)]),
    )
  }
  return value
}

function sameJsonValue(a: unknown, b: unknown): boolean {
  return (
    JSON.stringify(stableJsonValue(a)) === JSON.stringify(stableJsonValue(b))
  )
}

class MemoryPublicEventStore implements PublicEventStore {
  private readonly logs = new Map<string, Array<PersistedPublicEvent>>()
  append(input: {
    runId: string
    expectedSeq: number
    event: StreamChunk
  }): Promise<PersistedPublicEvent> {
    const log = this.logs.get(input.runId) ?? []
    const targetSeq = input.expectedSeq + 1
    const existingAtTarget = log.find((e) => e.seq === targetSeq)
    if (existingAtTarget) {
      if (sameJsonValue(existingAtTarget.event, input.event)) {
        return Promise.resolve(existingAtTarget)
      }
      return Promise.reject(
        new AppendConflictError(
          `Public event append conflict for run ${input.runId} at seq ${targetSeq}`,
        ),
      )
    }

    const latest = log.at(-1)?.seq ?? 0
    if (latest !== input.expectedSeq) {
      return Promise.reject(
        new AppendConflictError(
          `Public event append conflict for run ${input.runId}: expected latest seq ${input.expectedSeq}, got ${latest}`,
        ),
      )
    }

    const persisted = {
      seq: targetSeq,
      event: input.event,
      cursor: input.event.cursor ?? encodeCursor(input.runId, targetSeq),
    }
    log.push(persisted)
    this.logs.set(input.runId, log)
    return Promise.resolve(persisted)
  }
  read(
    runId: string,
    opts?: { afterSeq?: number },
  ): AsyncIterable<PersistedPublicEvent> {
    const after = opts?.afterSeq ?? -Infinity
    const events = (this.logs.get(runId) ?? []).filter((e) => e.seq > after)
    return (async function* () {
      await Promise.resolve()
      for (const e of events) yield e
    })()
  }
  hasRun(runId: string): Promise<boolean> {
    return Promise.resolve((this.logs.get(runId)?.length ?? 0) > 0)
  }
  latestSeq(runId: string): Promise<number> {
    return Promise.resolve(this.logs.get(runId)?.at(-1)?.seq ?? 0)
  }
}

class MemoryInternalEventStore implements InternalEventStore {
  private readonly logs = new Map<string, Array<PersistedInternalEvent>>()
  append(input: {
    runId: string
    expectedSeq: number
    namespace: string
    type: string
    payload: unknown
  }): Promise<PersistedInternalEvent> {
    const log = this.logs.get(input.runId) ?? []
    const targetSeq = input.expectedSeq + 1
    const existingAtTarget = log.find(
      (e) => e.namespace === input.namespace && e.seq === targetSeq,
    )
    if (existingAtTarget) {
      if (
        existingAtTarget.type === input.type &&
        sameJsonValue(existingAtTarget.payload, input.payload)
      ) {
        return Promise.resolve(existingAtTarget)
      }
      return Promise.reject(
        new AppendConflictError(
          `Internal event append conflict for run ${input.runId} namespace ${input.namespace} at seq ${targetSeq}`,
        ),
      )
    }

    const latest =
      log.filter((e) => e.namespace === input.namespace).at(-1)?.seq ?? 0
    if (latest !== input.expectedSeq) {
      return Promise.reject(
        new AppendConflictError(
          `Internal event append conflict for run ${input.runId} namespace ${input.namespace}: expected latest seq ${input.expectedSeq}, got ${latest}`,
        ),
      )
    }

    const persisted = {
      seq: targetSeq,
      namespace: input.namespace,
      type: input.type,
      payload: input.payload,
      cursor: encodeCursor(input.runId, targetSeq),
    }
    log.push(persisted)
    this.logs.set(input.runId, log)
    return Promise.resolve(persisted)
  }
  read(
    runId: string,
    opts?: { namespace?: string; afterSeq?: number },
  ): AsyncIterable<PersistedInternalEvent> {
    const after = opts?.afterSeq ?? -Infinity
    const events = (this.logs.get(runId) ?? []).filter(
      (e) =>
        e.seq > after &&
        (opts?.namespace === undefined || e.namespace === opts.namespace),
    )
    return (async function* () {
      await Promise.resolve()
      for (const e of events) yield e
    })()
  }
  latestSeq(runId: string, namespace?: string): Promise<number> {
    const log = this.logs.get(runId) ?? []
    const filtered =
      namespace === undefined
        ? log
        : log.filter((event) => event.namespace === namespace)
    return Promise.resolve(filtered.at(-1)?.seq ?? 0)
  }
}

class MemoryInterruptStore implements InterruptStore {
  private readonly interrupts = new Map<string, InterruptRecord>()
  create(record: Omit<InterruptRecord, 'resolvedAt'>): Promise<void> {
    this.interrupts.set(record.interruptId, { ...record })
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
      [...this.interrupts.values()].filter(
        (interrupt) => interrupt.threadId === threadId,
      ),
    )
  }
  listPending(threadId: string): Promise<Array<InterruptRecord>> {
    return Promise.resolve(
      [...this.interrupts.values()].filter(
        (interrupt) =>
          interrupt.threadId === threadId && interrupt.status === 'pending',
      ),
    )
  }
  listByRun(runId: string): Promise<Array<InterruptRecord>> {
    return Promise.resolve(
      [...this.interrupts.values()].filter(
        (interrupt) => interrupt.runId === runId,
      ),
    )
  }
  listPendingByRun(runId: string): Promise<Array<InterruptRecord>> {
    return Promise.resolve(
      [...this.interrupts.values()].filter(
        (interrupt) =>
          interrupt.runId === runId && interrupt.status === 'pending',
      ),
    )
  }
}

class MemoryMetadataStore implements MetadataStore {
  private readonly values = new Map<string, unknown>()
  get(scope: string, key: string): Promise<unknown | null> {
    const storageKey = `${scope}:${key}`
    return Promise.resolve(
      this.values.has(storageKey) ? this.values.get(storageKey) : null,
    )
  }
  set(scope: string, key: string, value: unknown): Promise<void> {
    this.values.set(`${scope}:${key}`, value)
    return Promise.resolve()
  }
  delete(scope: string, key: string): Promise<void> {
    this.values.delete(`${scope}:${key}`)
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

function blobObject(record: BlobRecord, bytes: Uint8Array): BlobObject {
  const copied = copyBytes(bytes)
  return {
    ...blobRecordSnapshot(record),
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
    options?: {
      contentType?: string
      customMetadata?: Record<string, string>
    },
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

  get(key: string): Promise<BlobObject | null> {
    const entry = this.blobs.get(key)
    return Promise.resolve(entry ? blobObject(entry.record, entry.bytes) : null)
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

export function memoryPersistence(): AIPersistence {
  return defineAIPersistence({
    stores: {
      messages: new MemoryMessageStore(),
      runs: new MemoryRunStore(),
      publicEvents: new MemoryPublicEventStore(),
      internalEvents: new MemoryInternalEventStore(),
      interrupts: new MemoryInterruptStore(),
      metadata: new MemoryMetadataStore(),
      artifacts: new MemoryArtifactStore(),
      blobs: new MemoryBlobStore(),
      locks: new InMemoryLockStore(),
    },
  })
}
