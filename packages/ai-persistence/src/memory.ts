import {
  InMemoryLockStore,
  canonicalInterruptJson,
  canonicalizeInterruptResolutions,
  cloneAndDeepFreezeJson,
} from '@tanstack/ai'
import { defineAIPersistence } from './types'
import { hasExactInterruptIds, projectInterruptRecovery } from './interrupts'
import type {
  CommitInterruptResolutionsInput,
  InterruptCommitResult,
  InterruptRecoveryQuery,
  InterruptRecoveryStateV1,
  LockStore,
  ModelMessage,
  OpenInterruptBatchInput,
} from '@tanstack/ai'
import type {
  ArtifactRecord,
  ArtifactStore,
  BlobBody,
  BlobListOptions,
  BlobObject,
  BlobRecord,
  BlobStore,
  InterruptBatchRecord,
  InterruptRecord,
  InterruptStore,
  LegacyInterruptRecordInput,
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
}

class MemoryInterruptStore implements InterruptStore {
  private interrupts = new Map<string, InterruptRecord>()
  private batches = new Map<string, InterruptBatchRecord>()
  private readonly interruptLocks = new Map<string, Promise<void>>()

  constructor(private readonly clock: () => number) {}

  private async withInterruptLock<T>(
    interruptedRunId: string,
    operation: () => Promise<T> | T,
  ): Promise<T> {
    const previous =
      this.interruptLocks.get(interruptedRunId) ?? Promise.resolve()
    let release = (): void => undefined
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    const queued = previous.then(() => current)
    this.interruptLocks.set(interruptedRunId, queued)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (this.interruptLocks.get(interruptedRunId) === queued) {
        this.interruptLocks.delete(interruptedRunId)
      }
    }
  }

  private rowsForRun(interruptedRunId: string): Array<InterruptRecord> {
    return [...this.interrupts.values()].filter(
      (record) => record.runId === interruptedRunId,
    )
  }

  private recoveryForRun(input: {
    threadId: string
    interruptedRunId: string
    expectedGeneration: number
  }): InterruptRecoveryStateV1 {
    const rows = this.rowsForRun(input.interruptedRunId).filter(
      (record) => record.threadId === input.threadId,
    )
    const batch = this.batches.get(input.interruptedRunId)
    return projectInterruptRecovery({
      query: {
        threadId: input.threadId,
        interruptedRunId: input.interruptedRunId,
        knownGeneration: input.expectedGeneration,
      },
      rows,
      batch: batch?.threadId === input.threadId ? batch : null,
      now: this.clock(),
      includeResolutions: true,
    })
  }

  create(record: LegacyInterruptRecordInput): Promise<void> {
    const generation = record.generation ?? 0
    const binding =
      record.binding ??
      ({
        kind: 'generic',
        interruptId: record.interruptId,
        interruptedRunId: record.runId,
        generation,
        responseSchemaHash: 'legacy:unknown',
      } as const)
    this.interrupts.set(
      record.interruptId,
      cloneAndDeepFreezeJson({
        ...record,
        generation,
        binding,
      }),
    )
    return Promise.resolve()
  }

  resolve(interruptId: string, response?: unknown): Promise<void> {
    const existing = this.interrupts.get(interruptId)
    if (existing) {
      this.interrupts.set(
        interruptId,
        cloneAndDeepFreezeJson({
          ...existing,
          status: 'resolved',
          resolvedAt: this.clock(),
          ...(response !== undefined && { response }),
        }),
      )
    }
    return Promise.resolve()
  }

  cancel(interruptId: string): Promise<void> {
    const existing = this.interrupts.get(interruptId)
    if (existing) {
      this.interrupts.set(
        interruptId,
        cloneAndDeepFreezeJson({
          ...existing,
          status: 'cancelled',
          resolvedAt: this.clock(),
        }),
      )
    }
    return Promise.resolve()
  }

  openInterruptBatch(input: OpenInterruptBatchInput): Promise<{
    generation: number
    descriptors: OpenInterruptBatchInput['descriptors']
  }> {
    return this.withInterruptLock(input.interruptedRunId, () => {
      const descriptorIds = input.descriptors.map((descriptor) => descriptor.id)
      const bindingIds = input.bindings.map((binding) => binding.interruptId)
      if (
        descriptorIds.length === 0 ||
        !hasExactInterruptIds(descriptorIds, bindingIds)
      ) {
        throw new TypeError(
          'Interrupt descriptors and bindings must contain the same exact nonempty IDs.',
        )
      }
      if (this.batches.has(input.interruptedRunId)) {
        throw new Error('Cannot reopen a committed interrupt batch.')
      }

      const existing = this.rowsForRun(input.interruptedRunId)
      if (existing.length > 0) {
        const generation = existing[0]?.generation
        const existingDescriptors = [...existing]
          .sort((left, right) =>
            left.interruptId.localeCompare(right.interruptId),
          )
          .map((record) => record.payload)
        const requestedDescriptors = [...input.descriptors].sort(
          (left, right) => left.id.localeCompare(right.id),
        )
        const existingBindings = [...existing]
          .map((record) => record.binding)
          .sort((left, right) =>
            left.interruptId.localeCompare(right.interruptId),
          )
        const requestedBindings = [...input.bindings]
          .map((binding) => ({
            ...binding,
            interruptedRunId: input.interruptedRunId,
            generation,
          }))
          .sort((left, right) =>
            left.interruptId.localeCompare(right.interruptId),
          )
        const sameDescriptors =
          hasExactInterruptIds(
            descriptorIds,
            existing.map((record) => record.interruptId),
          ) &&
          canonicalInterruptJson(existingDescriptors) ===
            canonicalInterruptJson(requestedDescriptors)
        const sameBindings =
          canonicalInterruptJson(existingBindings) ===
          canonicalInterruptJson(requestedBindings)
        if (
          sameDescriptors &&
          sameBindings &&
          generation !== undefined &&
          existing.every(
            (record) =>
              record.status === 'pending' &&
              record.threadId === input.threadId &&
              record.generation === generation,
          )
        ) {
          return {
            generation,
            descriptors: cloneAndDeepFreezeJson(input.descriptors),
          }
        }
        throw new Error('An incompatible interrupt batch is already open.')
      }

      const generation = 1
      const bindings = new Map(
        input.bindings.map((binding) => [binding.interruptId, binding]),
      )
      const nextInterrupts = new Map(this.interrupts)
      const descriptors = cloneAndDeepFreezeJson(input.descriptors)
      for (const descriptor of descriptors) {
        if (nextInterrupts.has(descriptor.id)) {
          throw new Error(`Interrupt ID already exists: ${descriptor.id}`)
        }
        const unopened = bindings.get(descriptor.id)
        if (!unopened) {
          throw new Error(`Missing binding for interrupt: ${descriptor.id}`)
        }
        const binding = cloneAndDeepFreezeJson({
          ...unopened,
          interruptedRunId: input.interruptedRunId,
          generation,
        })
        nextInterrupts.set(
          descriptor.id,
          cloneAndDeepFreezeJson({
            interruptId: descriptor.id,
            runId: input.interruptedRunId,
            threadId: input.threadId,
            generation,
            status: 'pending',
            requestedAt: this.clock(),
            payload: descriptor,
            binding,
          }),
        )
      }
      this.interrupts = nextInterrupts
      return { generation, descriptors }
    })
  }

  commitInterruptResolutions(
    input: CommitInterruptResolutionsInput,
  ): Promise<InterruptCommitResult> {
    return this.withInterruptLock(input.interruptedRunId, () => {
      const candidate = canonicalizeInterruptResolutions(input.resolutions)
      if (
        candidate.fingerprint !== input.fingerprint ||
        candidate.canonicalResolutions !== input.canonicalResolutions
      ) {
        throw new TypeError(
          'Interrupt batch identity does not match its resolutions.',
        )
      }

      const winner = this.batches.get(input.interruptedRunId)
      if (winner) {
        return winner.threadId === input.threadId &&
          winner.fingerprint === input.fingerprint &&
          winner.canonicalResolutions === input.canonicalResolutions
          ? {
              status: 'replayed',
              continuationRunId: winner.continuationRunId,
            }
          : {
              status: 'conflict',
              authoritativeState: this.recoveryForRun(input),
            }
      }

      const pending = this.rowsForRun(input.interruptedRunId).filter(
        (record) => record.status === 'pending',
      )
      const resolutionIds = candidate.resolutions.map(
        (resolution) => resolution.interruptId,
      )
      if (
        !hasExactInterruptIds(
          input.expectedInterruptIds,
          pending.map((record) => record.interruptId),
        ) ||
        !hasExactInterruptIds(input.expectedInterruptIds, resolutionIds) ||
        pending.some((record) => record.threadId !== input.threadId) ||
        pending.some(
          (record) => record.generation !== input.expectedGeneration,
        ) ||
        pending.some(
          (record) =>
            record.binding.expiresAt !== undefined &&
            Date.parse(record.binding.expiresAt) <= this.clock(),
        )
      ) {
        return {
          status: 'conflict',
          authoritativeState: this.recoveryForRun(input),
        }
      }

      const committedAt = this.clock()
      const nextInterrupts = new Map(this.interrupts)
      for (const resolution of candidate.resolutions) {
        const current = nextInterrupts.get(resolution.interruptId)
        if (
          !current ||
          current.runId !== input.interruptedRunId ||
          current.status !== 'pending' ||
          current.generation !== input.expectedGeneration
        ) {
          throw new Error(
            `Pending interrupt changed: ${resolution.interruptId}`,
          )
        }
        nextInterrupts.set(
          resolution.interruptId,
          cloneAndDeepFreezeJson({
            ...current,
            status:
              resolution.status === 'cancelled' ? 'cancelled' : 'resolved',
            response: resolution,
            resolvedAt: committedAt,
          }),
        )
      }

      const immutableWinner = cloneAndDeepFreezeJson({
        threadId: input.threadId,
        interruptedRunId: input.interruptedRunId,
        generation: input.expectedGeneration,
        expectedInterruptIds: [...input.expectedInterruptIds],
        fingerprint: candidate.fingerprint,
        canonicalResolutions: candidate.canonicalResolutions,
        resolutions: candidate.resolutions,
        continuationRunId: input.continuationRunId,
        committedAt,
      })
      const nextBatches = new Map(this.batches)
      nextBatches.set(input.interruptedRunId, immutableWinner)

      this.interrupts = nextInterrupts
      this.batches = nextBatches
      return {
        status: 'committed',
        continuationRunId: input.continuationRunId,
      }
    })
  }

  getInterruptRecoveryState(
    input: InterruptRecoveryQuery,
  ): Promise<InterruptRecoveryStateV1> {
    return this.withInterruptLock(input.interruptedRunId, () => {
      const rows = this.rowsForRun(input.interruptedRunId).filter(
        (record) => record.threadId === input.threadId,
      )
      const batch = this.batches.get(input.interruptedRunId)
      return projectInterruptRecovery({
        query: input,
        rows,
        batch: batch?.threadId === input.threadId ? batch : null,
        now: this.clock(),
        includeResolutions: true,
      })
    })
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

interface MemoryPersistenceStores {
  messages: MessageStore
  runs: RunStore
  interrupts: InterruptStore
  metadata: MetadataStore
  artifacts: ArtifactStore
  blobs: BlobStore
  locks: LockStore
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

export function memoryPersistence(options?: { clock?: () => number }) {
  const stores: MemoryPersistenceStores = {
    messages: new MemoryMessageStore(),
    runs: new MemoryRunStore(),
    interrupts: new MemoryInterruptStore(options?.clock ?? Date.now),
    metadata: new MemoryMetadataStore(),
    artifacts: new MemoryArtifactStore(),
    blobs: new MemoryBlobStore(),
    locks: new InMemoryLockStore(),
  }
  return defineAIPersistence({ stores })
}
