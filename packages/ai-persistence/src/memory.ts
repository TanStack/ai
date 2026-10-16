import {
  LogConflictError,
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
  LogStore,
  MessageStore,
  MetadataStore,
  RunRecord,
  RunStore,
  SessionIndexEntry,
  SessionIndexListOptions,
  SessionIndexPage,
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

class MemoryLogStore implements LogStore {
  private readonly logs = new Map<string, Array<LogRecord>>()
  private readonly listeners = new Map<string, Set<() => void>>()

  append({
    logId,
    seq,
    epoch,
    records,
    consumes = [],
  }: Parameters<LogStore['append']>[0]) {
    const isNoop = records.length === 0 && consumes.length === 0
    if (isNoop) return Promise.resolve()
    // The fence. This store has no owners yet, so every log is unowned.
    if (epoch !== UNOWNED_EPOCH) {
      return Promise.reject(new OwnershipLostError(logId, epoch))
    }
    const log = this.logs.get(logId) ?? []
    if (seq !== log.length + 1) {
      return Promise.reject(new LogConflictError(logId, seq))
    }
    if (consumes.length > 0) {
      return Promise.reject(new Error('not implemented'))
    }
    // Copy the whole batch before the push, so a record that cannot become
    // JSON rejects the batch with nothing written.
    let copies: Array<LogRecord>
    try {
      copies = records.map(copyJson)
    } catch (error) {
      return Promise.reject(error)
    }
    log.push(...copies)
    this.logs.set(logId, log)
    for (const listener of [...(this.listeners.get(logId) ?? [])]) {
      // The batch is written. A listener error must not fail the append.
      try {
        listener()
      } catch (error) {
        console.error('[ai-persistence] log listener failed', error)
      }
    }
    return Promise.resolve()
  }

  read({ logId, after = 0, limit }: Parameters<LogStore['read']>[0]) {
    const log = this.logs.get(logId) ?? []
    const end = limit === undefined ? log.length : after + limit
    const entries = log.slice(after, end).map((record, index) => ({
      seq: after + index + 1,
      record: copyJson(record),
    }))
    return Promise.resolve(entries)
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

  acquire() {
    return Promise.reject(new Error('not implemented'))
  }

  renew() {
    return Promise.reject(new Error('not implemented'))
  }

  release() {
    return Promise.reject(new Error('not implemented'))
  }

  setAffinity() {
    return Promise.reject(new Error('not implemented'))
  }

  listOrphaned() {
    return Promise.reject(new Error('not implemented'))
  }

  offer() {
    return Promise.reject(new Error('not implemented'))
  }

  offered() {
    return Promise.reject(new Error('not implemented'))
  }

  getSnapshot() {
    return Promise.reject(new Error('not implemented'))
  }

  putSnapshot() {
    return Promise.reject(new Error('not implemented'))
  }

  truncate() {
    return Promise.reject(new Error('not implemented'))
  }

  deleteLog() {
    return Promise.reject(new Error('not implemented'))
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
 * @example
 * ```ts
 * const { runs, metadata, workClaims, sessions } = memoryPersistence().stores
 * const persistence = defineAIPersistence({
 *   stores: { log: memoryLogStore(), runs, metadata, workClaims, sessions },
 * })
 * ```
 */
export function memoryLogStore(): LogStore {
  return new MemoryLogStore()
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
  private readonly entries = new Map<
    string,
    { entry: SessionIndexEntry; revision: string }
  >()
  // One counter for the whole store, so an entry that is deleted and written
  // again never gets a revision that an earlier reader saw.
  private lastRevision = 0
  upsert(entry: SessionIndexEntry): Promise<void> {
    this.write(entry)
    return Promise.resolve()
  }
  get(threadId: string): Promise<SessionIndexEntry | undefined> {
    const stored = this.entries.get(threadId)
    return Promise.resolve(stored && structuredClone(stored.entry))
  }
  getVersioned(
    threadId: string,
  ): Promise<{ entry: SessionIndexEntry; revision: string } | undefined> {
    const stored = this.entries.get(threadId)
    return Promise.resolve(stored && structuredClone(stored))
  }
  upsertIf({
    entry,
    expectedRevision,
  }: {
    entry: SessionIndexEntry
    expectedRevision: string | null
  }): Promise<
    { ok: true; revision: string } | { ok: false; reason: 'conflict' }
  > {
    const current = this.entries.get(entry.threadId)?.revision ?? null
    if (current !== expectedRevision) {
      return Promise.resolve({ ok: false, reason: 'conflict' })
    }
    return Promise.resolve({ ok: true, revision: this.write(entry) })
  }
  list(options: SessionIndexListOptions = {}): Promise<SessionIndexPage> {
    const { limit, cursor, parentThreadId, principal, search, harness } =
      options
    const after = cursor === undefined ? undefined : parseSessionCursor(cursor)
    const needle = search?.toLowerCase()
    const metadata = Object.entries(options.metadata ?? {})
    const matching = [...this.entries.values()]
      .map((stored) => stored.entry)
      .filter((entry) => {
        // `null` asks for the entries with no parent.
        const isChild =
          parentThreadId === undefined ||
          (entry.parentThreadId ?? null) === parentThreadId
        const isSameTenant =
          principal?.tenantId === undefined ||
          entry.principal?.tenantId === principal.tenantId
        const isOwned =
          principal === undefined ||
          (entry.principal?.id === principal.id && isSameTenant)
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
          isOwned &&
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
  delete(threadId: string): Promise<void> {
    this.entries.delete(threadId)
    return Promise.resolve()
  }
  // Copies in and out, so a caller never changes a stored entry.
  private write(entry: SessionIndexEntry): string {
    const revision = String(++this.lastRevision)
    this.entries.set(entry.threadId, {
      entry: structuredClone(entry),
      revision,
    })
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
