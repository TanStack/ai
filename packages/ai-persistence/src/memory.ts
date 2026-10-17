import {
  LogConflictError,
  LogTruncatedError,
  OwnershipLostError,
  UNOWNED_EPOCH,
  defineAIPersistence,
} from './types'
import { resolveBlobRange } from './blob-range'
import type { ActivityRecord, ModelMessage } from '@tanstack/ai'
import type {
  ActivityStore,
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
  InboxEntry,
  InboxStore,
  InterruptCommitEntry,
  InterruptRecord,
  InterruptStore,
  LogRecord,
  LogSnapshot,
  LogStore,
  OrphanedLog,
  MessageStore,
  MetadataStore,
  RunRecord,
  RunStore,
  SessionIndexEntry,
  SessionIndexKey,
  SessionIndexListOptions,
  SessionIndexStore,
  WorkClaimStore,
  LeaseStore,
  TurnLease,
  TurnLeaseKey,
} from './types'

const compareUtf8Bytes = (left: string, right: string): number => {
  const leftBytes = new TextEncoder().encode(left)
  const rightBytes = new TextEncoder().encode(right)
  const length = Math.min(leftBytes.length, rightBytes.length)

  for (let index = 0; index < length; index++) {
    const leftByte = leftBytes[index]
    const rightByte = rightBytes[index]
    if (leftByte !== rightByte) {
      return (leftByte ?? 0) - (rightByte ?? 0)
    }
  }

  return leftBytes.length - rightBytes.length
}

class MemoryMessageStore implements MessageStore {
  private readonly threads = new Map<string, Array<ModelMessage>>()
  loadThread(
    threadId: string,
    _options?: { limit?: number; before?: string },
  ): Promise<Array<ModelMessage>> {
    return Promise.resolve(this.threads.get(threadId)?.slice() ?? [])
  }
  saveThread(threadId: string, messages: Array<ModelMessage>): Promise<void> {
    this.threads.set(threadId, messages.slice())
    return Promise.resolve()
  }
}

class MemoryActivityStore implements ActivityStore {
  private readonly threads = new Map<string, Array<ActivityRecord>>()
  loadActivities(threadId: string): Promise<Array<ActivityRecord>> {
    return Promise.resolve(this.threads.get(threadId)?.slice() ?? [])
  }
  saveActivities(
    threadId: string,
    activities: Array<ActivityRecord>,
  ): Promise<void> {
    this.threads.set(threadId, activities.slice())
    return Promise.resolve()
  }
}

class MemoryRunStore implements RunStore {
  private readonly runs = new Map<string, RunRecord>()
  createOrResume(
    input: Parameters<RunStore['createOrResume']>[0],
  ): Promise<RunRecord> {
    const existing = this.runs.get(input.runId)
    if (existing) return Promise.resolve(existing)
    const record: RunRecord = {
      runId: input.runId,
      threadId: input.threadId,
      status: input.status ?? 'running',
      startedAt: input.startedAt,
      ...(input.parentRunId !== undefined
        ? { parentRunId: input.parentRunId }
        : {}),
      ...(input.subagentRunId !== undefined
        ? { subagentRunId: input.subagentRunId }
        : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.activity !== undefined ? { activity: input.activity } : {}),
      ...(input.agent !== undefined ? { agent: input.agent } : {}),
      ...(input.principal !== undefined ? { principal: input.principal } : {}),
    }
    this.runs.set(record.runId, record)
    return Promise.resolve(record)
  }
  update(
    runId: string,
    patch: Parameters<RunStore['update']>[1],
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
  listByThread(threadId: string): Promise<Array<RunRecord>> {
    const matching = [...this.runs.values()]
      .filter((run) => run.threadId === threadId)
      .sort((a, b) => a.startedAt - b.startedAt)
    return Promise.resolve(matching)
  }
  listByParentRun(parentRunId: string): Promise<Array<RunRecord>> {
    const matching = [...this.runs.values()]
      .filter((run) => run.parentRunId === parentRunId)
      .sort((a, b) => a.startedAt - b.startedAt)
    return Promise.resolve(matching)
  }
  listReclaimable(opts: {
    now: number
    ttlMs: number
  }): Promise<Array<RunRecord>> {
    const cutoff = opts.now - opts.ttlMs
    const matching = [...this.runs.values()].filter(
      (run) =>
        run.status === 'running' &&
        run.detachedSince !== undefined &&
        run.detachedSince <= cutoff,
    )
    return Promise.resolve(matching)
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
  async commitBatch(
    entries: ReadonlyArray<InterruptCommitEntry>,
  ): Promise<void> {
    const ids = new Set<string>()
    for (const entry of entries) {
      if (ids.has(entry.interruptId)) {
        throw new Error(
          `Interrupt batch contains duplicate id: ${entry.interruptId}.`,
        )
      }
      ids.add(entry.interruptId)
      const existing = this.interrupts.get(entry.interruptId)
      if (!existing) {
        throw new Error(
          `Interrupt batch references missing id: ${entry.interruptId}.`,
        )
      }
      if (existing.status !== 'pending') {
        throw new Error(
          `Interrupt batch references non-pending id: ${entry.interruptId}.`,
        )
      }
    }
    const resolvedAt = Date.now()
    for (const entry of entries) {
      const existing = this.interrupts.get(entry.interruptId)
      if (!existing) continue
      if (entry.status === 'resolved') {
        this.interrupts.set(entry.interruptId, {
          ...existing,
          status: 'resolved',
          resolvedAt,
          response: entry.response,
        })
      } else {
        this.interrupts.set(entry.interruptId, {
          ...existing,
          status: 'cancelled',
          resolvedAt,
        })
      }
    }
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
  private readonly values = new Map<
    string,
    Map<string, { value: unknown; revision: string }>
  >()
  // One counter for the whole store, so a key that is deleted and set again
  // never gets a revision that an earlier reader saw.
  private lastRevision = 0
  get(namespace: string, key: string): Promise<unknown | null> {
    const entry = this.values.get(namespace)?.get(key)
    return Promise.resolve(entry ? entry.value : null)
  }
  getVersioned(
    namespace: string,
    key: string,
  ): Promise<{ value: unknown; revision: string } | null> {
    const entry = this.values.get(namespace)?.get(key)
    return Promise.resolve(entry ? { ...entry } : null)
  }
  set(namespace: string, key: string, value: unknown): Promise<void> {
    this.write(namespace, key, value)
    return Promise.resolve()
  }
  setIf(
    namespace: string,
    key: string,
    value: unknown,
    expectedRevision: string | null,
  ): Promise<
    { ok: true; revision: string } | { ok: false; reason: 'conflict' }
  > {
    const current = this.values.get(namespace)?.get(key)?.revision ?? null
    if (current !== expectedRevision) {
      return Promise.resolve({ ok: false, reason: 'conflict' })
    }
    return Promise.resolve({
      ok: true,
      revision: this.write(namespace, key, value),
    })
  }
  private write(namespace: string, key: string, value: unknown): string {
    let bucket = this.values.get(namespace)
    if (!bucket) {
      bucket = new Map()
      this.values.set(namespace, bucket)
    }
    const revision = String(++this.lastRevision)
    bucket.set(key, { value, revision })
    return revision
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
      [...this.artifacts.values()]
        .filter((a) => a.runId === runId)
        .sort(
          (a, b) =>
            a.createdAt - b.createdAt ||
            compareUtf8Bytes(a.artifactId, b.artifactId),
        ),
    )
  }
  listForThread(threadId: string): Promise<Array<ArtifactRecord>> {
    return Promise.resolve(
      [...this.artifacts.values()]
        .filter((a) => a.threadId === threadId)
        .sort(
          (a, b) =>
            a.createdAt - b.createdAt ||
            compareUtf8Bytes(a.artifactId, b.artifactId),
        ),
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

class MemoryInboxStore implements InboxStore {
  private readonly entries = new Map<string, InboxEntry>()
  append(entry: Omit<InboxEntry, 'status'>): Promise<InboxEntry> {
    // Copies in and out, so a caller never changes a stored entry.
    const existing = this.entries.get(entry.inputId)
    if (existing) return Promise.resolve(structuredClone(existing))
    const stored: InboxEntry = { ...entry, status: 'pending' }
    this.entries.set(entry.inputId, structuredClone(stored))
    return Promise.resolve(stored)
  }
  listPending(threadId: string): Promise<Array<InboxEntry>> {
    // Map iteration keeps insertion order. The stable sort keeps it for ties.
    const pending = [...this.entries.values()]
      .filter(
        (entry) => entry.threadId === threadId && entry.status === 'pending',
      )
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((entry) => structuredClone(entry))
    return Promise.resolve(pending)
  }
  markApplied({
    threadId,
    inputId,
    operationId,
  }: {
    threadId: string
    inputId: string
    operationId: string
  }): Promise<void> {
    const existing = this.of(threadId, inputId)
    if (existing) {
      this.entries.set(inputId, { ...existing, status: 'applied', operationId })
    }
    return Promise.resolve()
  }
  markRejected({
    threadId,
    inputId,
    reason,
  }: {
    threadId: string
    inputId: string
    reason: string
  }): Promise<void> {
    const existing = this.of(threadId, inputId)
    if (existing) {
      this.entries.set(inputId, { ...existing, status: 'rejected', reason })
    }
    return Promise.resolve()
  }
  get({
    threadId,
    inputId,
  }: {
    threadId: string
    inputId: string
  }): Promise<InboxEntry | null> {
    const existing = this.of(threadId, inputId)
    return Promise.resolve(existing ? structuredClone(existing) : null)
  }
  delete({
    threadId,
    inputId,
  }: {
    threadId: string
    inputId: string
  }): Promise<void> {
    if (this.of(threadId, inputId)) this.entries.delete(inputId)
    return Promise.resolve()
  }
  private of(threadId: string, inputId: string) {
    const existing = this.entries.get(inputId)
    return existing?.threadId === threadId ? existing : undefined
  }
}

/**
 * A JSON copy, so a store never shares an object with a caller. Throws when
 * the value cannot become JSON (a `BigInt`, a cycle).
 */
function copyJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

/**
 * Throw a `RangeError` for a duration that the log contract refuses: a value
 * below 0, `NaN`, or 0 when `allowZero` is false.
 */
function assertMs({
  name,
  value,
  allowZero,
}: {
  name: string
  value: number
  allowZero: boolean
}) {
  const isValid = allowZero ? value >= 0 : value > 0
  if (!isValid) {
    const rule = allowZero ? '0 or more' : 'more than 0'
    throw new RangeError(`${name} must be ${rule}, got ${value}.`)
  }
}

/**
 * The ownership record of a log that a host acquired. The record stays after
 * a release, because the epoch never goes down.
 */
interface Ownership {
  harness: string
  ownerId: string
  epoch: number
  /** Epoch milliseconds, from the store clock. */
  expiresAt: number
  released: boolean
  /** Epoch milliseconds, from `release({ wakeInMs })`. */
  wakeAt?: number
}

/** An input that a host offered to a log. */
interface Offer {
  record: LogRecord
  /** Epoch milliseconds, from the store clock. */
  offeredAt: number
  /** True after an append consumed it. The id stays, so a retry is a duplicate. */
  consumed: boolean
}

/** The offers of one log. */
interface Lane {
  /** The harness of the latest offer, for `listOrphaned`. */
  harness: string
  /** By input id, in offer order. */
  inputs: Map<string, Offer>
}

/** The records that a log keeps. A truncate drops the first ones. */
interface KeptLog {
  /** The position of `records[0]`. A truncate moves it up. */
  firstSeq: number
  records: Array<LogRecord>
}

/**
 * The last position of the log, or 0 for a log with no records. A truncate
 * does not change it.
 */
function headOf(log: KeptLog) {
  return log.firstSeq - 1 + log.records.length
}

/** The listeners of one store instance, by log id. */
type Listeners = Map<string, Set<() => void>>

/**
 * A shared log state for {@link memoryLogStore}. It is a handle only: make one
 * with {@link memoryLogBackend}, and pass it to `memoryLogStore({ backend })`.
 */
export interface MemoryLogBackend {
  readonly kind: 'memory-log-backend'
}

/**
 * The state of the memory log, shared by every store instance on it. Two
 * instances on one state act as two machines on one database: they see the
 * same records, owners, offers, and snapshots, and a write on one calls the
 * listeners of both.
 */
class LogBackendState {
  readonly logs = new Map<string, KeptLog>()
  readonly snapshots = new Map<string, LogSnapshot>()
  readonly owners = new Map<string, Ownership>()
  // Kept apart from `owners`, because a log that no host acquired can have a
  // pin too (`setAffinity` with UNOWNED_EPOCH).
  readonly affinities = new Map<string, string>()
  // Kept apart from `owners`, because any machine can offer to a log that no
  // host acquired.
  readonly lanes = new Map<string, Lane>()
  /** The listeners of each store instance on this backend. */
  readonly instances = new Set<Listeners>()

  /**
   * Call the listeners of `logId` on every store instance. The write is done,
   * so a listener error must not fail it or stop the other listeners.
   */
  notify(logId: string) {
    const instances = [...this.instances]
    const listeners = instances.flatMap((instance) => [
      ...(instance.get(logId) ?? []),
    ])
    for (const listener of listeners) {
      try {
        listener()
      } catch (error) {
        console.error('[ai-persistence] log listener failed', error)
      }
    }
  }
}

// The state behind each handle from `memoryLogBackend()`. The handle shows no
// state, so the public type stays opaque.
const backendStates = new WeakMap<MemoryLogBackend, LogBackendState>()

// The methods are `async`, so a thrown error becomes a rejection. They never
// await, so each call runs to its end before the next one starts, also across
// the store instances on one backend.
class MemoryLogStore implements LogStore {
  private readonly backend: LogBackendState
  private readonly listeners: Listeners = new Map()

  constructor(backend: LogBackendState) {
    this.backend = backend
    backend.instances.add(this.listeners)
  }

  /**
   * The fence of every fenced write. A log that a host acquired needs the
   * current epoch and an owner that did not release it. A log that no host
   * acquired needs UNOWNED_EPOCH.
   */
  private canWrite(logId: string, epoch: number) {
    const owner = this.backend.owners.get(logId)
    if (owner === undefined) return epoch === UNOWNED_EPOCH
    return owner.epoch === epoch && !owner.released
  }

  /** The record, when `ownerId` holds the log at `epoch` and did not release it. */
  private heldBy(logId: string, ownerId: string, epoch: number) {
    const owner = this.backend.owners.get(logId)
    const isHolder =
      owner?.ownerId === ownerId && owner.epoch === epoch && !owner.released
    return isHolder ? owner : undefined
  }

  /** The kept records of `logId`, or an empty log that is not stored yet. */
  private logOf(logId: string) {
    return this.backend.logs.get(logId) ?? { firstSeq: 1, records: [] }
  }

  /** The offers of `logId` that no append consumed, in offer order. */
  private pending(logId: string) {
    const inputs = this.backend.lanes.get(logId)?.inputs ?? []
    return [...inputs].filter(([, offer]) => !offer.consumed)
  }

  async append({
    logId,
    seq,
    epoch,
    records,
    consumes = [],
  }: Parameters<LogStore['append']>[0]) {
    const isNoop = records.length === 0 && consumes.length === 0
    if (isNoop) return
    // The fence comes first, so a stale writer gets OwnershipLostError, also
    // at a taken position.
    if (!this.canWrite(logId, epoch)) {
      throw new OwnershipLostError(logId, epoch)
    }
    const log = this.logOf(logId)
    // The position check comes before the consumes check, so the writer that
    // lost a race gets LogConflictError, also when the winner consumed the
    // same offers.
    if (seq !== headOf(log) + 1) throw new LogConflictError(logId, seq)
    const inputs = this.backend.lanes.get(logId)?.inputs
    const offers = consumes.map((inputId) => {
      const offer = inputs?.get(inputId)
      const isPending = offer !== undefined && !offer.consumed
      if (!isPending) {
        throw new TypeError(
          `Input ${JSON.stringify(inputId)} is not a pending offer of log ${JSON.stringify(logId)}.`,
        )
      }
      return offer
    })
    // Copy the whole batch before the write, so a record that cannot become
    // JSON rejects the batch with nothing written and nothing consumed.
    const copies = records.map(copyJson)
    log.records.push(...copies)
    this.backend.logs.set(logId, log)
    for (const offer of offers) offer.consumed = true
    this.backend.notify(logId)
  }

  async read({ logId, after = 0, limit }: Parameters<LogStore['read']>[0]) {
    const log = this.logOf(logId)
    // The record at `after + 1` is dropped, so the page would have a hole.
    if (after < log.firstSeq - 1) {
      throw new LogTruncatedError(logId, log.firstSeq)
    }
    const start = after - (log.firstSeq - 1)
    const end = limit === undefined ? log.records.length : start + limit
    return log.records.slice(start, end).map((record, index) => ({
      seq: after + index + 1,
      record: copyJson(record),
    }))
  }

  subscribe({ logId, listener }: Parameters<LogStore['subscribe']>[0]) {
    let set = this.listeners.get(logId)
    if (!set) {
      set = new Set()
      this.listeners.set(logId, set)
    }
    set.add(listener)
    return () => {
      set.delete(listener)
    }
  }

  async acquire({
    logId,
    harness,
    ownerId,
    ttlMs,
    affinity,
  }: Parameters<LogStore['acquire']>[0]) {
    assertMs({ name: 'ttlMs', value: ttlMs, allowZero: false })
    const now = Date.now()
    const owner = this.backend.owners.get(logId)
    const isLive =
      owner !== undefined && !owner.released && owner.expiresAt > now
    if (isLive && owner.ownerId !== ownerId) return null
    const pin = this.backend.affinities.get(logId)
    if (pin !== undefined && pin !== affinity) return null
    // The caller holds the log already: extend it at the same epoch.
    if (isLive) {
      owner.expiresAt = now + ttlMs
      return { epoch: owner.epoch }
    }
    const epoch = (owner?.epoch ?? UNOWNED_EPOCH) + 1
    this.backend.owners.set(logId, {
      harness,
      ownerId,
      epoch,
      expiresAt: now + ttlMs,
      released: false,
    })
    return { epoch }
  }

  async renew({
    logId,
    ownerId,
    epoch,
    ttlMs,
  }: Parameters<LogStore['renew']>[0]) {
    assertMs({ name: 'ttlMs', value: ttlMs, allowZero: false })
    // An expired owner can renew. A new acquire would have changed the epoch.
    const owner = this.heldBy(logId, ownerId, epoch)
    if (owner === undefined) return false
    owner.expiresAt = Date.now() + ttlMs
    return true
  }

  async release({
    logId,
    ownerId,
    epoch,
    wakeInMs,
  }: Parameters<LogStore['release']>[0]) {
    if (wakeInMs !== undefined) {
      assertMs({ name: 'wakeInMs', value: wakeInMs, allowZero: true })
    }
    const owner = this.heldBy(logId, ownerId, epoch)
    if (owner === undefined) return
    owner.released = true
    if (wakeInMs !== undefined) owner.wakeAt = Date.now() + wakeInMs
  }

  async setAffinity({
    logId,
    epoch,
    affinity,
  }: Parameters<LogStore['setAffinity']>[0]) {
    if (!this.canWrite(logId, epoch)) {
      throw new OwnershipLostError(logId, epoch)
    }
    if (affinity === null) this.backend.affinities.delete(logId)
    else this.backend.affinities.set(logId, affinity)
  }

  async listOrphaned({
    limit,
    harnesses,
    affinity,
  }: Parameters<LogStore['listOrphaned']>[0]) {
    const now = Date.now()
    // A log with offers can have no ownership record, so look in both maps.
    const logIds = new Set([
      ...this.backend.owners.keys(),
      ...this.backend.lanes.keys(),
    ])
    const due: Array<{ orphan: OrphanedLog; dueAt: number }> = []
    for (const logId of logIds) {
      const found = this.orphanOf(logId, now)
      if (found === undefined) continue
      const pin = this.backend.affinities.get(logId)
      const isOtherHarness =
        harnesses !== undefined && !harnesses.includes(found.orphan.harness)
      const isOtherAffinity = pin !== undefined && pin !== affinity
      if (isOtherHarness || isOtherAffinity) continue
      due.push(found)
    }
    // The log that is due first comes first.
    due.sort((left, right) => left.dueAt - right.dueAt)
    return due.slice(0, limit).map(({ orphan }) => orphan)
  }

  /**
   * Why `logId` is orphaned and when it became due, or `undefined` when it
   * has no work. The first reason that applies wins: `'expired'`, then
   * `'offered'`, then `'wake'`.
   */
  private orphanOf(logId: string, now: number) {
    const owner = this.backend.owners.get(logId)
    const lane = this.backend.lanes.get(logId)
    const [firstPending] = this.pending(logId)
    const found = (
      reason: OrphanedLog['reason'],
      harness: string,
      dueAt: number,
    ) => ({ orphan: { logId, harness, reason }, dueAt })
    // An owner that did not release the log has the work until it expires.
    const isHeld = owner !== undefined && !owner.released
    if (isHeld) {
      const isExpired = owner.expiresAt <= now
      return isExpired
        ? found('expired', owner.harness, owner.expiresAt)
        : undefined
    }
    if (lane !== undefined && firstPending !== undefined) {
      const [, offer] = firstPending
      return found('offered', lane.harness, offer.offeredAt)
    }
    const wakeAt = owner?.wakeAt
    const isWakeDue = owner !== undefined && wakeAt !== undefined
    if (isWakeDue && wakeAt <= now) {
      return found('wake', owner.harness, wakeAt)
    }
    return undefined
  }

  async offer({
    logId,
    harness,
    inputId,
    record,
  }: Parameters<LogStore['offer']>[0]) {
    // Copy first, so a record that cannot become JSON stores nothing.
    const copy = copyJson(record)
    const inputs =
      this.backend.lanes.get(logId)?.inputs ?? new Map<string, Offer>()
    // A consumed id stays taken too.
    const previous = inputs.get(inputId)
    if (previous !== undefined) {
      const isEqual = JSON.stringify(previous.record) === JSON.stringify(copy)
      return isEqual ? 'duplicate' : 'conflict'
    }
    inputs.set(inputId, {
      record: copy,
      offeredAt: Date.now(),
      consumed: false,
    })
    // The latest offer names the harness of the log.
    this.backend.lanes.set(logId, { harness, inputs })
    this.backend.notify(logId)
    return 'offered'
  }

  async offered({ logId }: Parameters<LogStore['offered']>[0]) {
    return this.pending(logId).map(([inputId, offer]) => ({
      inputId,
      record: copyJson(offer.record),
      offeredAt: offer.offeredAt,
    }))
  }

  async getSnapshot({ logId }: Parameters<LogStore['getSnapshot']>[0]) {
    const snapshot = this.backend.snapshots.get(logId)
    return snapshot === undefined ? null : copyJson(snapshot)
  }

  async putSnapshot({
    logId,
    epoch,
    seq,
    version,
    state,
  }: Parameters<LogStore['putSnapshot']>[0]) {
    if (!this.canWrite(logId, epoch)) {
      throw new OwnershipLostError(logId, epoch)
    }
    const log = this.logOf(logId)
    const head = headOf(log)
    if (seq > head) {
      throw new RangeError(
        `Snapshot position ${seq} is after the last position ${head} of log ${JSON.stringify(logId)}.`,
      )
    }
    // A reader replays the records after the snapshot. The records before
    // `firstSeq` are dropped, so the lowest snapshot is at `firstSeq - 1`.
    const lowest = log.firstSeq - 1
    if (seq < lowest) {
      throw new RangeError(
        `Snapshot position ${seq} is before position ${lowest} of log ${JSON.stringify(logId)}. The log dropped the records before ${log.firstSeq}.`,
      )
    }
    // Copy last, so a state that cannot become JSON keeps the old snapshot.
    this.backend.snapshots.set(logId, copyJson({ seq, version, state }))
  }

  async truncate({
    logId,
    epoch,
    beforeSeq,
  }: Parameters<LogStore['truncate']>[0]) {
    if (!this.canWrite(logId, epoch)) {
      throw new OwnershipLostError(logId, epoch)
    }
    // A reader that gets LogTruncatedError loads the snapshot, so the
    // snapshot must hold every record that the cut drops.
    const snapshot = this.backend.snapshots.get(logId)
    const isCovered = snapshot !== undefined && snapshot.seq >= beforeSeq - 1
    if (!isCovered) {
      throw new RangeError(
        `Log ${JSON.stringify(logId)} has no snapshot at position ${beforeSeq - 1} or later, so it keeps the records before ${beforeSeq}.`,
      )
    }
    // A snapshot is never after the head, so the cut drops kept records
    // only. A cut before `firstSeq` drops nothing.
    const log = this.logOf(logId)
    const dropCount = beforeSeq - log.firstSeq
    if (dropCount <= 0) return
    log.records.splice(0, dropCount)
    log.firstSeq = beforeSeq
  }

  async deleteLog({ logId }: Parameters<LogStore['deleteLog']>[0]) {
    this.backend.logs.delete(logId)
    this.backend.snapshots.delete(logId)
    this.backend.lanes.delete(logId)
    this.backend.affinities.delete(logId)
    // Keep the epoch counter, so a write with an old epoch still fails. The
    // log has no owner now, as after a release with no wake.
    const owner = this.backend.owners.get(logId)
    if (owner !== undefined) {
      owner.released = true
      owner.wakeAt = undefined
    }
    this.backend.notify(logId)
  }
}

/**
 * In-process reference {@link LogStore}, for tests and one-process hosts. The
 * log is lost when the process stops. Records are JSON-copied in and out.
 *
 * Not part of `memoryPersistence()`: add it yourself. A durable harness host
 * keeps the transcript and the inputs in the log, so leave out `messages`
 * and `inbox`.
 *
 * @param options.backend - The log state to use. Pass one
 *   {@link memoryLogBackend} to two stores, and they act as two machines on
 *   one database. Without it, the store makes its own state.
 * @throws {TypeError} When `backend` was not made by {@link memoryLogBackend}.
 *
 * @example
 * ```ts
 * const { runs, metadata, workClaims, sessions } = memoryPersistence().stores
 * const persistence = defineAIPersistence({
 *   stores: { log: memoryLogStore(), runs, metadata, workClaims, sessions },
 * })
 * ```
 */
export function memoryLogStore({
  backend,
}: { backend?: MemoryLogBackend } = {}): LogStore {
  if (backend === undefined) return new MemoryLogStore(new LogBackendState())
  const state = backendStates.get(backend)
  if (state === undefined) {
    throw new TypeError(
      'memoryLogStore: this backend was not made by memoryLogBackend().',
    )
  }
  return new MemoryLogStore(state)
}

/**
 * A new log state for {@link memoryLogStore}. Give one backend to two stores
 * to test two hosts in one process: an append on one store calls the
 * listeners on the other, and both see one owner per log.
 *
 * @example
 * ```ts
 * const backend = memoryLogBackend()
 * const hostA = memoryLogStore({ backend })
 * const hostB = memoryLogStore({ backend })
 * hostB.subscribe({ logId: 'session-1', listener: () => console.log('new') })
 * await hostA.append({
 *   logId: 'session-1',
 *   seq: 1,
 *   epoch: UNOWNED_EPOCH,
 *   records: [{ type: 'hello' }],
 * })
 * // The listener on hostB ran.
 * ```
 */
export function memoryLogBackend() {
  const handle: MemoryLogBackend = Object.freeze({
    kind: 'memory-log-backend',
  })
  backendStates.set(handle, new LogBackendState())
  return handle
}

type WorkClaim = Parameters<WorkClaimStore['claim']>[0]

class MemoryWorkClaimStore implements WorkClaimStore {
  private readonly claims = new Map<string, WorkClaim>()
  claim(entry: WorkClaim): Promise<boolean> {
    // Synchronous, so two claims in one process never both win.
    const held = this.claims.get(entry.threadId)
    const isTaken =
      held !== undefined &&
      held.ownerId !== entry.ownerId &&
      held.until > Date.now()
    if (isTaken) return Promise.resolve(false)
    this.claims.set(entry.threadId, { ...entry })
    return Promise.resolve(true)
  }
  release({
    threadId,
    ownerId,
  }: {
    threadId: string
    ownerId: string
  }): Promise<void> {
    if (this.claims.get(threadId)?.ownerId === ownerId) {
      this.claims.delete(threadId)
    }
    return Promise.resolve()
  }
  get(threadId: string) {
    const held = this.claims.get(threadId)
    return Promise.resolve(
      held ? { ownerId: held.ownerId, until: held.until } : null,
    )
  }
  listExpired(options: {
    now: number
    limit?: number
  }): Promise<Array<{ threadId: string; harness: string }>> {
    const expired = [...this.claims.values()]
      .filter((claim) => claim.until <= options.now)
      .sort((a, b) => a.until - b.until)
      .slice(0, options.limit)
      .map(({ threadId, harness }) => ({ threadId, harness }))
    return Promise.resolve(expired)
  }
}

// Newest `updatedAt` first, then `threadId` order. The cursor uses it too.
const bySessionOrder = (
  a: Pick<SessionIndexEntry, 'updatedAt' | 'threadId'>,
  b: Pick<SessionIndexEntry, 'updatedAt' | 'threadId'>,
) => b.updatedAt - a.updatedAt || compareUtf8Bytes(a.threadId, b.threadId)

// The cursor is `<updatedAt>:<threadId>` of the last entry of a page.
function parseSessionCursor(cursor: string) {
  const split = cursor.indexOf(':')
  const updatedAt = Number(cursor.slice(0, split))
  if (split <= 0 || !Number.isFinite(updatedAt)) {
    throw new Error(`Invalid session index cursor: ${cursor}`)
  }
  return { updatedAt, threadId: cursor.slice(split + 1) }
}

class MemorySessionIndexStore implements SessionIndexStore {
  // Nested maps, tenant then thread. A joined `${tenant}:${thread}` key would
  // make `('a:b', 'c')` and `('a', 'b:c')` the same entry. A missing tenant is
  // the default tenant, `''`.
  private readonly tenants = new Map<
    string,
    Map<string, { entry: SessionIndexEntry; revision: string }>
  >()
  // One counter for the whole store, so an entry that is deleted and written
  // again never gets a revision that an earlier reader saw.
  private lastRevision = 0
  get(key: SessionIndexKey) {
    const stored = this.find(key)
    return Promise.resolve(stored && structuredClone(stored.entry))
  }
  getVersioned(key: SessionIndexKey) {
    const stored = this.find(key)
    return Promise.resolve(stored && structuredClone(stored))
  }
  upsert(entry: SessionIndexEntry) {
    this.write(entry)
    return Promise.resolve()
  }
  upsertIf({
    entry,
    revision,
  }: {
    entry: SessionIndexEntry
    revision: string | null
  }) {
    const current = this.find(entry)?.revision ?? null
    if (current !== revision) {
      return Promise.resolve({ ok: false, reason: 'conflict' } as const)
    }
    return Promise.resolve({ ok: true, revision: this.write(entry) } as const)
  }
  list(options: SessionIndexListOptions = {}) {
    const { limit, cursor, parentThreadId, memberId, search, harness } = options
    const after = cursor === undefined ? undefined : parseSessionCursor(cursor)
    const needle = search?.toLowerCase()
    const metadata = Object.entries(options.metadata ?? {})
    const tenant = this.tenants.get(options.tenantId ?? '')
    const stored = [...(tenant?.values() ?? [])]
    const matching = stored
      .map(({ entry }) => entry)
      .filter((entry) => {
        // `null` asks for the entries with no parent.
        const isChild =
          parentThreadId === undefined ||
          (entry.parentThreadId ?? null) === parentThreadId
        const isMember =
          memberId === undefined ||
          entry.members.some((member) => member.userId === memberId)
        const isAfterCursor =
          after === undefined || bySessionOrder(after, entry) < 0
        const isFound =
          needle === undefined ||
          (entry.title?.toLowerCase().includes(needle) ?? false)
        const isHarness = harness === undefined || entry.harness === harness
        const hasMetadata = metadata.every(
          ([key, value]) => entry.metadata?.[key] === value,
        )
        return (
          isChild &&
          isMember &&
          isFound &&
          isHarness &&
          hasMetadata &&
          isAfterCursor
        )
      })
      .sort(bySessionOrder)
    const page = limit === undefined ? matching : matching.slice(0, limit)
    const last = page.at(-1)
    const hasMore =
      limit !== undefined && matching.length > limit && last !== undefined
    return Promise.resolve({
      entries: page.map((entry) => structuredClone(entry)),
      ...(hasMore
        ? { cursor: `${last.updatedAt}:${last.threadId}`, truncated: true }
        : {}),
    })
  }
  delete(key: SessionIndexKey) {
    const tenantId = key.tenantId ?? ''
    const tenant = this.tenants.get(tenantId)
    if (!tenant) return Promise.resolve()
    tenant.delete(key.threadId)
    if (tenant.size === 0) this.tenants.delete(tenantId)
    return Promise.resolve()
  }
  private find(key: SessionIndexKey) {
    return this.tenants.get(key.tenantId ?? '')?.get(key.threadId)
  }
  // Copies in and out, so a caller never changes a stored entry.
  private write(entry: SessionIndexEntry) {
    const tenantId = entry.tenantId ?? ''
    let tenant = this.tenants.get(tenantId)
    if (!tenant) {
      tenant = new Map()
      this.tenants.set(tenantId, tenant)
    }
    const revision = String(++this.lastRevision)
    tenant.set(entry.threadId, { entry: structuredClone(entry), revision })
    return revision
  }
}

interface MemoryPersistenceStores {
  messages: MessageStore
  activities: ActivityStore
  runs: RunStore
  generationRuns: GenerationRunStore
  interrupts: InterruptStore
  metadata: MetadataStore
  artifacts: ArtifactStore
  blobs: BlobStore
  inbox: InboxStore
  workClaims: WorkClaimStore
  sessions: SessionIndexStore
}

/**
 * In-process reference backend for the full state + generation store set.
 *
 * Returns messages + activities + runs + generationRuns + interrupts +
 * metadata + artifacts + blobs + inbox + workClaims + sessions.
 * The session log is not included: a host can turn on more behavior when
 * `stores.log` is present, so add `memoryLogStore()` yourself (see its
 * example: a durable harness host takes no `messages` or `inbox`). Locks are not
 * included either. Use `InMemoryLockStore` + `withLocks` from `@tanstack/ai`
 * when a test or single-process app needs coordination.
 */
export function memoryPersistence() {
  const stores: MemoryPersistenceStores = {
    messages: new MemoryMessageStore(),
    activities: new MemoryActivityStore(),
    runs: new MemoryRunStore(),
    generationRuns: new MemoryGenerationRunStore(),
    interrupts: new MemoryInterruptStore(),
    metadata: new MemoryMetadataStore(),
    artifacts: new MemoryArtifactStore(),
    blobs: new MemoryBlobStore(),
    inbox: new MemoryInboxStore(),
    workClaims: new MemoryWorkClaimStore(),
    sessions: new MemorySessionIndexStore(),
  }
  return defineAIPersistence({ stores })
}

/**
 * In-process {@link LeaseStore}, for tests and single-process hosts. A real
 * backend puts the lease in the system that already has one (a job queue).
 *
 * @example
 * ```ts
 * const { metadata, workClaims, sessions } = memoryPersistence().stores
 * const persistence = defineAIPersistence({
 *   stores: { log: memoryLogStore(), leases: memoryLeaseStore(), metadata, workClaims, sessions },
 * })
 * ```
 */
export function memoryLeaseStore(): LeaseStore {
  const leases = new Map<string, TurnLease>()
  const keyOf = (key: TurnLeaseKey) =>
    `${key.threadId}\u0000${key.inputId}\u0000${key.operationId}\u0000${key.attempt}`
  return {
    acquire: (lease) => {
      leases.set(keyOf(lease), { ...lease })
      return Promise.resolve()
    },
    renew: (lease) => {
      const held = leases.get(keyOf(lease))
      // Only the owner renews. Another host's expired lease is taken over.
      if (
        !held ||
        held.ownerId === lease.ownerId ||
        held.expiresAt <= Date.now()
      ) {
        leases.set(keyOf(lease), { ...lease })
      }
      return Promise.resolve()
    },
    release: (lease) => {
      if (leases.get(keyOf(lease))?.ownerId === lease.ownerId) {
        leases.delete(keyOf(lease))
      }
      return Promise.resolve()
    },
    isAlive: (key) => {
      const held = leases.get(keyOf(key))
      return Promise.resolve(held !== undefined && held.expiresAt > Date.now())
    },
  }
}
