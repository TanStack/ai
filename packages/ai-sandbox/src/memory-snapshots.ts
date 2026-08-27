import type { ModelMessage } from '@tanstack/ai'
import type {
  MemoryArtifactRecord as ArtifactRecord,
  MemoryBlobBody as BlobBody,
  MemoryBlobRecord as BlobRecord,
  MemoryGenerationRunRecord as GenerationRunRecord,
  MemoryInterruptRecord as InterruptRecord,
  MemoryRunRecord as RunRecord,
  MemorySnapshotPersistence,
} from './memory-snapshot-types'
import {
  SandboxCheckpointConflictError,
  SandboxCheckpointDuplicateIdError,
  SandboxCheckpointError,
  SandboxCheckpointInvalidEntryError,
  SandboxCheckpointInvalidIdError,
  SandboxCheckpointNotHeadError,
  SandboxCheckpointParentMismatchError,
  SandboxCheckpointWriterConflictError,
  SandboxCheckpointWriterLostError,
} from './checkpoint-store'
import type {
  ForkCapableSandboxCheckpointStore,
  SandboxCheckpoint,
  SandboxCheckpointWriter,
  SandboxCheckpointWriterLease,
  SandboxCheckpointForkInput,
} from './checkpoint-store'
import { createSandboxSnapshots } from './snapshot-operations'
import type {
  CreateSandboxSnapshotsInput,
  SandboxSnapshots,
} from './snapshot-operations'

type BlobGetOptions = { range?: { offset: number; length?: number } }

function resolveBlobRange(
  size: number,
  range: { offset: number; length?: number },
): { offset: number; length: number } {
  const isInvalidBlobOffset =
    !Number.isInteger(range.offset) || range.offset < 0 || range.offset >= size
  if (isInvalidBlobOffset) {
    throw new RangeError(
      `Blob range offset ${range.offset} is outside the object (size ${size}).`,
    )
  }
  const remaining = size - range.offset
  if (range.length === undefined) {
    return { offset: range.offset, length: remaining }
  }
  const isInvalidBlobLength =
    !Number.isInteger(range.length) || range.length < 0
  if (isInvalidBlobLength) {
    throw new RangeError(`Blob range length ${range.length} is not valid.`)
  }
  return {
    offset: range.offset,
    length: Math.min(range.length, remaining),
  }
}

export type MemorySandboxSnapshots = SandboxSnapshots<
  MemorySnapshotPersistence,
  ForkCapableSandboxCheckpointStore
>

export type MemorySandboxSnapshotsOptions = Omit<
  CreateSandboxSnapshotsInput<
    MemorySnapshotPersistence,
    ForkCapableSandboxCheckpointStore
  >,
  'persistence' | 'checkpoints'
>

const encoder = new TextEncoder()
const compare = (a: string, b: string) => {
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const leftByte = left[i]
    const rightByte = right[i]
    if (leftByte !== rightByte) return (leftByte ?? 0) - (rightByte ?? 0)
  }
  return left.length - right.length
}
const clone = <T>(value: T): T => structuredClone(value)

interface MemoryCheckpointState {
  checkpoints: Map<string, SandboxCheckpoint>
  heads: Map<string, string>
  writers: Map<string, { ownerToken: string; fence: number; expiresAt: number }>
  fences: Map<string, number>
  references: Map<string, number>
}

interface MemorySnapshotState extends MemoryCheckpointState {
  messages: Map<string, Array<ModelMessage>>
  runs: Map<string, RunRecord>
  generations: Map<string, GenerationRunRecord>
  interrupts: Map<string, InterruptRecord>
  metadata: Map<string, Map<string, unknown>>
  artifacts: Map<string, ArtifactRecord>
  blobs: Map<string, { record: BlobRecord; bytes: Uint8Array }>
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    const isHighSurrogate = code >= 0xd800 && code <= 0xdbff
    if (isHighSurrogate) {
      const next = value.charCodeAt(index + 1)
      const isInvalidLowSurrogate =
        Number.isNaN(next) || next < 0xdc00 || next > 0xdfff
      if (isInvalidLowSurrogate) return true
      index++
    } else {
      const isLowSurrogate = code >= 0xdc00 && code <= 0xdfff
      if (isLowSurrogate) {
        return true
      }
    }
  }
  return false
}

function assertValidIdentifier(
  value: unknown,
  label: string,
): asserts value is string {
  const isInvalidId =
    typeof value !== 'string' ||
    value.length === 0 ||
    hasUnpairedSurrogate(value)
  if (isInvalidId) {
    throw new SandboxCheckpointInvalidIdError(
      `${label} must be a non-empty well-formed Unicode string`,
    )
  }
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function assertNormalizedEntryPath(path: unknown): asserts path is string {
  const isInvalidRelPath =
    typeof path !== 'string' ||
    path.length === 0 ||
    path.includes('\0') ||
    path.startsWith('/') ||
    path.startsWith('\\') ||
    /^[A-Za-z]:([\\/]|$)/.test(path) ||
    path.includes('\\') ||
    path
      .split('/')
      .some((part) => part.length === 0 || part === '.' || part === '..')
  if (isInvalidRelPath) {
    throw new SandboxCheckpointInvalidEntryError(
      'Checkpoint entry path must be a normalized workspace-relative path',
    )
  }
}

function assertEntryNotBeneathFile(
  path: string,
  kinds: Map<string, 'file' | 'dir'>,
): void {
  for (
    let separator = path.indexOf('/');
    separator !== -1;
    separator = path.indexOf('/', separator + 1)
  ) {
    const ancestor = path.slice(0, separator)
    if (kinds.get(ancestor) === 'file') {
      throw new SandboxCheckpointInvalidEntryError(
        `Checkpoint entry '${path}' is beneath file '${ancestor}'`,
      )
    }
  }
}

function assertFileNotAncestorOfExisting(
  path: string,
  kinds: Map<string, 'file' | 'dir'>,
): void {
  if (Array.from(kinds.keys()).some((other) => other.startsWith(`${path}/`))) {
    throw new SandboxCheckpointInvalidEntryError(
      `Checkpoint file '${path}' is an ancestor of another entry`,
    )
  }
}

function assertFileEntryFields(candidate: Record<string, unknown>): void {
  const isInvalidFileBlobKey =
    typeof candidate.blobKey !== 'string' ||
    candidate.blobKey.length === 0 ||
    hasUnpairedSurrogate(candidate.blobKey) ||
    !/^sandbox-files\/sha256\/[0-9a-f]{64}$/.test(candidate.blobKey)
  if (isInvalidFileBlobKey) {
    throw new SandboxCheckpointInvalidEntryError(
      'File entries require a valid content-addressed blobKey',
    )
  }
  const isInvalidFileSize =
    !hasOwn(candidate, 'size') ||
    typeof candidate.size !== 'number' ||
    !Number.isSafeInteger(candidate.size) ||
    candidate.size < 0
  if (isInvalidFileSize) {
    throw new SandboxCheckpointInvalidEntryError(
      'File entry size must be a non-negative safe integer',
    )
  }
}

function assertDirEntryFields(candidate: Record<string, unknown>): void {
  const isFileEntryShape =
    hasOwn(candidate, 'blobKey') || hasOwn(candidate, 'size')
  if (isFileEntryShape) {
    throw new SandboxCheckpointInvalidEntryError(
      'Directory entries cannot contain file fields',
    )
  }
}

function validateEntries(checkpoint: SandboxCheckpoint): void {
  if (!Array.isArray(checkpoint.files)) {
    throw new SandboxCheckpointInvalidEntryError(
      'Checkpoint files must be an array',
    )
  }
  const paths = new Set<string>()
  const kinds = new Map<string, 'file' | 'dir'>()
  for (const entry of checkpoint.files as ReadonlyArray<unknown>) {
    if (entry === null || typeof entry !== 'object') {
      throw new SandboxCheckpointInvalidEntryError(
        'Checkpoint entry must be an object',
      )
    }
    const candidate = entry as Record<string, unknown>
    assertNormalizedEntryPath(candidate.path)
    const path = candidate.path
    if (paths.has(path)) {
      throw new SandboxCheckpointInvalidEntryError(
        `Checkpoint contains duplicate entry path '${path}'`,
      )
    }
    assertEntryNotBeneathFile(path, kinds)
    if (candidate.kind === 'file') {
      assertFileNotAncestorOfExisting(path, kinds)
    }
    paths.add(path)
    if (candidate.kind === 'file') {
      assertFileEntryFields(candidate)
    } else if (candidate.kind === 'dir') {
      assertDirEntryFields(candidate)
    } else {
      throw new SandboxCheckpointInvalidEntryError(
        'Checkpoint entry kind must be file or dir',
      )
    }
    kinds.set(path, candidate.kind)
  }
}

function assertValidArtifactFields(candidate: Record<string, unknown>): void {
  const isInvalidArtifact =
    typeof candidate.artifactId !== 'string' ||
    candidate.artifactId.length === 0 ||
    hasUnpairedSurrogate(candidate.artifactId) ||
    typeof candidate.name !== 'string' ||
    candidate.name.length === 0 ||
    typeof candidate.mimeType !== 'string' ||
    candidate.mimeType.length === 0 ||
    typeof candidate.blobKey !== 'string' ||
    candidate.blobKey.length === 0 ||
    hasUnpairedSurrogate(candidate.blobKey) ||
    !/^sandbox-artifacts\/sha256\/[0-9a-f]{64}$/.test(candidate.blobKey) ||
    typeof candidate.size !== 'number' ||
    !Number.isSafeInteger(candidate.size) ||
    candidate.size < 0 ||
    typeof candidate.createdAt !== 'number' ||
    !Number.isFinite(candidate.createdAt)
  if (isInvalidArtifact) {
    throw new SandboxCheckpointInvalidEntryError(
      'Checkpoint artifact has invalid fields',
    )
  }
}

function validateArtifacts(checkpoint: SandboxCheckpoint): void {
  if (!Array.isArray(checkpoint.artifacts)) {
    throw new SandboxCheckpointInvalidEntryError(
      'Checkpoint artifacts must be an array',
    )
  }
  for (const artifact of checkpoint.artifacts as ReadonlyArray<unknown>) {
    if (artifact === null || typeof artifact !== 'object') {
      throw new SandboxCheckpointInvalidEntryError(
        'Checkpoint artifact must be an object',
      )
    }
    const candidate = artifact as Record<string, unknown>
    assertValidArtifactFields(candidate)
  }
}

function validateCheckpoint(checkpoint: SandboxCheckpoint): void {
  assertValidIdentifier(checkpoint.id, 'Checkpoint id')
  assertValidIdentifier(checkpoint.threadId, 'Checkpoint thread id')
  if (checkpoint.parentCheckpointId !== null) {
    assertValidIdentifier(checkpoint.parentCheckpointId, 'Parent checkpoint id')
  }
  if (!Number.isFinite(checkpoint.createdAt)) {
    throw new SandboxCheckpointInvalidEntryError(
      'Checkpoint createdAt must be a finite number',
    )
  }
  validateEntries(checkpoint)
  validateArtifacts(checkpoint)
}

function blobKeys(checkpoint: SandboxCheckpoint): Set<string> {
  const keys = new Set<string>()
  for (const entry of checkpoint.files) {
    if (entry.kind === 'file') keys.add(entry.blobKey)
  }
  for (const artifact of checkpoint.artifacts) keys.add(artifact.blobKey)
  return keys
}

class MemorySnapshotCheckpointStore implements ForkCapableSandboxCheckpointStore {
  private readonly now = () => Date.now()
  private readonly leaseDurationMs = 120_000
  private readonly renewAfterMs = 45_000

  constructor(private readonly state: MemorySnapshotState) {}

  async get(id: string): Promise<SandboxCheckpoint | null> {
    assertValidIdentifier(id, 'Checkpoint id')
    const checkpoint = this.state.checkpoints.get(id)
    return checkpoint ? clone(checkpoint) : null
  }

  async list(threadId: string): Promise<Array<SandboxCheckpoint>> {
    assertValidIdentifier(threadId, 'Thread id')
    return [...this.state.checkpoints.values()]
      .filter((checkpoint) => checkpoint.threadId === threadId)
      .sort((a, b) => a.createdAt - b.createdAt || compare(a.id, b.id))
      .map(clone)
  }

  async getHead(threadId: string): Promise<string | null> {
    assertValidIdentifier(threadId, 'Thread id')
    return this.state.heads.get(threadId) ?? null
  }

  async append(input: {
    checkpoint: SandboxCheckpoint
    expectedHeadId: string | null
    writer: SandboxCheckpointWriter
  }): Promise<{ headId: string }> {
    const checkpoint = clone(input.checkpoint)
    const { expectedHeadId, writer } = input
    assertValidIdentifier(checkpoint.id, 'Checkpoint id')
    assertValidIdentifier(checkpoint.threadId, 'Checkpoint thread id')
    assertValidIdentifier(writer.threadId, 'Writer thread id')
    if (expectedHeadId !== null) {
      assertValidIdentifier(expectedHeadId, 'Expected head id')
    }
    if (checkpoint.parentCheckpointId != null) {
      assertValidIdentifier(
        checkpoint.parentCheckpointId,
        'Parent checkpoint id',
      )
    }
    if (writer.threadId !== checkpoint.threadId) {
      throw new SandboxCheckpointWriterLostError(
        'Checkpoint writer thread does not match checkpoint thread',
      )
    }
    validateCheckpoint(checkpoint)

    // Re-check live state after staging because cloning caller data may
    // re-enter append and advance this thread's head.
    this.assertWriter(writer, checkpoint.threadId)
    if (this.state.checkpoints.has(checkpoint.id)) {
      throw new SandboxCheckpointDuplicateIdError(
        `Checkpoint '${checkpoint.id}' already exists`,
      )
    }
    const actualHeadId = this.state.heads.get(checkpoint.threadId) ?? null
    if (actualHeadId !== expectedHeadId) {
      throw new SandboxCheckpointConflictError(
        `Expected head '${expectedHeadId}', but thread '${checkpoint.threadId}' is at '${actualHeadId}'`,
      )
    }
    const parentCheckpointId = checkpoint.parentCheckpointId ?? null
    if (parentCheckpointId !== expectedHeadId) {
      throw new SandboxCheckpointParentMismatchError(
        `Checkpoint '${checkpoint.id}' parent does not match expected head`,
      )
    }
    const stored = { ...checkpoint, parentCheckpointId }
    const keys = blobKeys(stored)
    this.state.checkpoints.set(stored.id, stored)
    this.state.heads.set(stored.threadId, stored.id)
    for (const key of keys) {
      this.state.references.set(key, (this.state.references.get(key) ?? 0) + 1)
    }
    return { headId: stored.id }
  }

  async deleteHead(input: {
    threadId: string
    checkpointId: string
    writer: SandboxCheckpointWriter
  }): Promise<void> {
    const { threadId, checkpointId, writer } = input
    assertValidIdentifier(threadId, 'Thread id')
    assertValidIdentifier(checkpointId, 'Checkpoint id')
    assertValidIdentifier(writer.threadId, 'Writer thread id')
    if (writer.threadId !== threadId) {
      throw new SandboxCheckpointWriterLostError(
        'Checkpoint writer thread does not match operation thread',
      )
    }
    this.assertWriter(writer, threadId)
    if ((this.state.heads.get(threadId) ?? null) !== checkpointId) {
      throw new SandboxCheckpointNotHeadError(
        `Checkpoint '${checkpointId}' is not the current head of thread '${threadId}'`,
      )
    }
    const checkpoint = this.state.checkpoints.get(checkpointId)
    if (!checkpoint) {
      throw new SandboxCheckpointNotHeadError(
        `Checkpoint '${checkpointId}' does not exist`,
      )
    }
    this.state.checkpoints.delete(checkpointId)
    if (checkpoint.parentCheckpointId) {
      this.state.heads.set(threadId, checkpoint.parentCheckpointId)
    } else {
      this.state.heads.delete(threadId)
    }
    const checkpointBlobKeys = blobKeys(checkpoint)
    for (const key of checkpointBlobKeys) {
      const references = (this.state.references.get(key) ?? 0) - 1
      if (references > 0) this.state.references.set(key, references)
      else this.state.references.delete(key)
    }
  }

  async acquireWriter(threadId: string): Promise<SandboxCheckpointWriterLease> {
    assertValidIdentifier(threadId, 'Thread id')
    const current = this.state.writers.get(threadId)
    const hasActiveWriterLease = current && current.expiresAt > this.now()
    if (hasActiveWriterLease) {
      throw new SandboxCheckpointWriterConflictError(
        `Thread '${threadId}' already has an active checkpoint writer`,
      )
    }
    const fence = (this.state.fences.get(threadId) ?? 0) + 1
    this.state.fences.set(threadId, fence)
    const ownerToken = globalThis.crypto.randomUUID()
    const lease = {
      threadId,
      ownerToken,
      fence,
      expiresAt: this.now() + this.leaseDurationMs,
    }
    this.state.writers.set(threadId, lease)
    return {
      ...lease,
      get expiresAt() {
        return lease.expiresAt
      },
      renewAfterMs: this.renewAfterMs,
      renew: async () => {
        this.assertWriter(lease, threadId)
        lease.expiresAt = this.now() + this.leaseDurationMs
        return { expiresAt: lease.expiresAt }
      },
      release: async () => {
        const currentLease = this.state.writers.get(threadId)
        const isMatchingLease =
          currentLease?.ownerToken === ownerToken &&
          currentLease.fence === fence
        if (isMatchingLease) {
          this.state.writers.delete(threadId)
        }
      },
    }
  }

  async listBlobReferences(): Promise<
    Array<{ key: string; references: number }>
  > {
    return [...this.state.references.entries()]
      .sort(([a], [b]) => compare(a, b))
      .map(([key, references]) => ({ key, references }))
  }

  async forkFromCheckpoint(
    input: SandboxCheckpointForkInput,
  ): Promise<{ checkpoint: SandboxCheckpoint }> {
    const sourceThreadId = input.sourceThreadId
    const sourceCheckpointId = input.sourceCheckpointId
    const destinationThreadId = input.destinationThreadId
    const destinationCheckpointId = input.destinationCheckpointId
    const createdAt = input.createdAt
    const suppliedWriter = input.writer
    const writer: SandboxCheckpointWriter = {
      threadId: suppliedWriter.threadId,
      ownerToken: suppliedWriter.ownerToken,
      fence: suppliedWriter.fence,
    }

    assertValidIdentifier(sourceThreadId, 'Source thread id')
    assertValidIdentifier(sourceCheckpointId, 'Source checkpoint id')
    assertValidIdentifier(destinationThreadId, 'Destination thread id')
    assertValidIdentifier(destinationCheckpointId, 'Destination checkpoint id')
    assertValidIdentifier(writer.threadId, 'Writer thread id')
    if (!Number.isFinite(createdAt)) {
      throw new SandboxCheckpointInvalidEntryError(
        'Fork checkpoint createdAt must be a finite number',
      )
    }
    if (sourceThreadId === destinationThreadId) {
      throw new SandboxCheckpointError(
        'SANDBOX_SNAPSHOT_FORK_SOURCE_THREAD_MISMATCH',
        'Source and destination threads must differ',
      )
    }
    const source = this.state.checkpoints.get(sourceCheckpointId)
    if (!source) {
      throw new SandboxCheckpointError(
        'SANDBOX_SNAPSHOT_FORK_SOURCE_NOT_FOUND',
        'Source checkpoint was not found',
      )
    }
    if (source.threadId !== sourceThreadId) {
      throw new SandboxCheckpointError(
        'SANDBOX_SNAPSHOT_FORK_SOURCE_THREAD_MISMATCH',
        'Source checkpoint belongs to another thread',
      )
    }
    if (writer.threadId !== destinationThreadId) {
      throw new SandboxCheckpointWriterLostError(
        'Checkpoint writer thread does not match destination thread',
      )
    }
    this.assertWriter(writer, destinationThreadId)
    this.assertDestinationEmpty(destinationThreadId, destinationCheckpointId)

    const stagedCheckpoint: SandboxCheckpoint = clone({
      id: destinationCheckpointId,
      threadId: destinationThreadId,
      parentCheckpointId: null,
      createdAt,
      reason: 'fork-root',
      files: source.files,
      conversation: source.conversation,
      artifacts: source.artifacts,
    })
    validateCheckpoint(stagedCheckpoint)
    const stagedTranscript = clone([...stagedCheckpoint.conversation])
    const result = { checkpoint: clone(stagedCheckpoint) }
    const stagedReferences = [...blobKeys(stagedCheckpoint)].map((key) => ({
      key,
      references: (this.state.references.get(key) ?? 0) + 1,
    }))

    // Cloning can invoke user-defined getters. Revalidate immediately before
    // the synchronous publication block so a reentrant save is never lost.
    this.assertWriter(writer, destinationThreadId)
    this.assertDestinationEmpty(destinationThreadId, destinationCheckpointId)

    this.state.messages.set(stagedCheckpoint.threadId, stagedTranscript)
    this.state.checkpoints.set(stagedCheckpoint.id, stagedCheckpoint)
    this.state.heads.set(stagedCheckpoint.threadId, stagedCheckpoint.id)
    for (const reference of stagedReferences) {
      this.state.references.set(reference.key, reference.references)
    }
    return result
  }

  private assertDestinationEmpty(
    destinationThreadId: string,
    destinationCheckpointId: string,
  ): void {
    const isDestinationOccupied =
      this.state.messages.has(destinationThreadId) ||
      [...this.state.runs.values()].some(
        (value) => value.threadId === destinationThreadId,
      ) ||
      [...this.state.generations.values()].some(
        (value) => value.threadId === destinationThreadId,
      ) ||
      [...this.state.interrupts.values()].some(
        (value) => value.threadId === destinationThreadId,
      ) ||
      [...this.state.artifacts.values()].some(
        (value) => value.threadId === destinationThreadId,
      ) ||
      [...this.state.checkpoints.values()].some(
        (value) => value.threadId === destinationThreadId,
      ) ||
      this.state.heads.has(destinationThreadId) ||
      this.state.checkpoints.has(destinationCheckpointId)
    if (isDestinationOccupied) {
      throw new SandboxCheckpointError(
        'SANDBOX_SNAPSHOT_FORK_DESTINATION_NOT_EMPTY',
        'Destination thread is not empty',
      )
    }
  }

  private assertWriter(
    writer: SandboxCheckpointWriter,
    threadId: string,
  ): void {
    const current = this.state.writers.get(threadId)
    const isWriterLeaseLost =
      !current ||
      current.ownerToken !== writer.ownerToken ||
      current.fence !== writer.fence ||
      current.expiresAt <= this.now()
    if (isWriterLeaseLost) {
      throw new SandboxCheckpointWriterLostError(
        `Checkpoint writer lease for thread '${threadId}' is no longer current`,
      )
    }
  }
}

async function bodyBytes(body: BlobBody): Promise<Uint8Array> {
  if (typeof body === 'string') return encoder.encode(body)
  if (body instanceof ArrayBuffer) return new Uint8Array(body.slice(0))
  if (ArrayBuffer.isView(body))
    return new Uint8Array(
      body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    )
  const isBlobBody = typeof Blob !== 'undefined' && body instanceof Blob
  if (isBlobBody) return new Uint8Array(await body.arrayBuffer())
  const isReadableStreamBody =
    typeof ReadableStream !== 'undefined' && body instanceof ReadableStream
  if (isReadableStreamBody) {
    const reader = body.getReader()
    const parts: Array<Uint8Array> = []
    try {
      for (;;) {
        const next = await reader.read()
        if (next.done) break
        parts.push(new Uint8Array(next.value))
      }
    } finally {
      reader.releaseLock()
    }
    const result = new Uint8Array(
      parts.reduce((total, part) => total + part.byteLength, 0),
    )
    let offset = 0
    for (const part of parts) {
      result.set(part, offset)
      offset += part.byteLength
    }
    return result
  }
  throw new TypeError('Unsupported blob body.')
}

export async function memorySandboxSnapshots(
  options: MemorySandboxSnapshotsOptions = {},
): Promise<MemorySandboxSnapshots> {
  const { persistence, checkpoints } = await createMemorySandboxSnapshots()
  return createSandboxSnapshots({
    persistence,
    checkpoints,
    ...options,
  })
}

async function createMemorySandboxSnapshots(): Promise<{
  persistence: MemorySnapshotPersistence
  checkpoints: ForkCapableSandboxCheckpointStore
}> {
  const messages = new Map<string, Array<ModelMessage>>()
  const runs = new Map<string, RunRecord>()
  const generations = new Map<string, GenerationRunRecord>()
  const interrupts = new Map<string, InterruptRecord>()
  const metadata = new Map<string, Map<string, unknown>>()
  const artifacts = new Map<string, ArtifactRecord>()
  const blobs = new Map<string, { record: BlobRecord; bytes: Uint8Array }>()
  const state: MemorySnapshotState = {
    messages,
    runs,
    generations,
    interrupts,
    metadata,
    artifacts,
    blobs,
    checkpoints: new Map(),
    heads: new Map(),
    writers: new Map(),
    fences: new Map(),
    references: new Map(),
  }
  let etag = 0
  const persistence: MemorySnapshotPersistence = {
    stores: {
      messages: {
        loadThread: async (threadId: string) =>
          messages.get(threadId)?.slice() ?? [],
        saveThread: async (threadId: string, value: Array<ModelMessage>) => {
          messages.set(threadId, value.slice())
        },
      },
      runs: {
        createOrResume: async (input: {
          runId: string
          threadId: string
          status?: RunRecord['status']
          startedAt: number
        }) => {
          const existing = runs.get(input.runId)
          if (existing) return existing
          const record: RunRecord = {
            ...input,
            status: input.status ?? 'running',
          }
          runs.set(record.runId, record)
          return record
        },
        update: async (runId: string, patch: Partial<RunRecord>) => {
          const value = runs.get(runId)
          if (value) runs.set(runId, { ...value, ...patch })
        },
        get: async (runId: string) => runs.get(runId) ?? null,
        findActiveRun: async (threadId: string) =>
          [...runs.values()]
            .filter(
              (run) => run.threadId === threadId && run.status === 'running',
            )
            .sort((a, b) => b.startedAt - a.startedAt)[0] ?? null,
        listByThread: async (threadId: string) =>
          [...runs.values()]
            .filter((run) => run.threadId === threadId)
            .sort((a, b) => a.startedAt - b.startedAt),
        listReclaimable: async (input: { now: number; ttlMs: number }) =>
          [...runs.values()].filter(
            (run) =>
              run.status === 'running' &&
              run.detachedSince !== undefined &&
              run.detachedSince <= input.now - input.ttlMs,
          ),
      },
      generationRuns: {
        createOrResume: async (
          input: Pick<
            GenerationRunRecord,
            | 'runId'
            | 'threadId'
            | 'activity'
            | 'provider'
            | 'model'
            | 'startedAt'
          > & { status?: GenerationRunRecord['status'] },
        ) => {
          const value = generations.get(input.runId) ?? {
            ...input,
            status: input.status ?? 'running',
          }
          generations.set(input.runId, value)
          return value
        },
        update: async (runId: string, patch: Partial<GenerationRunRecord>) => {
          const value = generations.get(runId)
          if (value) generations.set(runId, { ...value, ...patch })
        },
        get: async (runId: string) => generations.get(runId) ?? null,
        findLatestForThread: async (threadId: string) =>
          [...generations.values()]
            .filter((run) => run.threadId === threadId)
            .sort((a, b) => b.startedAt - a.startedAt)[0] ?? null,
      },
      interrupts: {
        create: async (
          record: Omit<InterruptRecord, 'status' | 'resolvedAt'>,
        ) => {
          if (!interrupts.has(record.interruptId))
            interrupts.set(record.interruptId, { ...record, status: 'pending' })
        },
        resolve: async (id: string, response?: unknown) => {
          const value = interrupts.get(id)
          if (value)
            interrupts.set(id, {
              ...value,
              status: 'resolved',
              resolvedAt: Date.now(),
              response,
            })
        },
        cancel: async (id: string) => {
          const value = interrupts.get(id)
          if (value)
            interrupts.set(id, {
              ...value,
              status: 'cancelled',
              resolvedAt: Date.now(),
            })
        },
        get: async (id: string) => interrupts.get(id) ?? null,
        list: async (threadId: string) =>
          [...interrupts.values()]
            .filter((value) => value.threadId === threadId)
            .sort((a, b) => a.requestedAt - b.requestedAt),
        listPending: async (threadId: string) =>
          [...interrupts.values()]
            .filter(
              (value) =>
                value.threadId === threadId && value.status === 'pending',
            )
            .sort((a, b) => a.requestedAt - b.requestedAt),
        listByRun: async (runId: string) =>
          [...interrupts.values()]
            .filter((value) => value.runId === runId)
            .sort((a, b) => a.requestedAt - b.requestedAt),
        listPendingByRun: async (runId: string) =>
          [...interrupts.values()]
            .filter(
              (value) => value.runId === runId && value.status === 'pending',
            )
            .sort((a, b) => a.requestedAt - b.requestedAt),
      },
      metadata: {
        get: async (namespace: string, key: string) => {
          const bucket = metadata.get(namespace)
          return bucket?.has(key) ? bucket.get(key) : null
        },
        set: async (namespace: string, key: string, value: unknown) => {
          let bucket = metadata.get(namespace)
          if (!bucket) {
            bucket = new Map()
            metadata.set(namespace, bucket)
          }
          bucket.set(key, value)
        },
        delete: async (namespace: string, key: string) => {
          metadata.get(namespace)?.delete(key)
        },
      },
      artifacts: {
        save: async (value: ArtifactRecord) => {
          artifacts.set(value.artifactId, { ...value })
        },
        get: async (id: string) => artifacts.get(id) ?? null,
        list: async (runId: string) =>
          [...artifacts.values()]
            .filter((value) => value.runId === runId)
            .sort(
              (a, b) =>
                a.createdAt - b.createdAt ||
                compare(a.artifactId, b.artifactId),
            ),

        listForThread: async (threadId: string) =>
          [...artifacts.values()]
            .filter((value) => value.threadId === threadId)
            .sort(
              (a, b) =>
                a.createdAt - b.createdAt ||
                compare(a.artifactId, b.artifactId),
            ),

        delete: async (id: string) => {
          artifacts.delete(id)
        },
        deleteForRun: async (runId: string) => {
          for (const [id, value] of artifacts)
            if (value.runId === runId) artifacts.delete(id)
        },
      },
      blobs: {
        put: async (
          key: string,
          body: BlobBody,
          putOptions?: {
            contentType?: string
            customMetadata?: Record<string, string>
          },
        ) => {
          const bytes = await bodyBytes(body)
          const now = Date.now()
          const record: BlobRecord = {
            key,
            size: bytes.byteLength,
            etag: String(++etag),
            contentType:
              putOptions?.contentType ??
              (typeof Blob !== 'undefined' && body instanceof Blob
                ? body.type || undefined
                : undefined),
            customMetadata: putOptions?.customMetadata
              ? { ...putOptions.customMetadata }
              : undefined,
            createdAt: blobs.get(key)?.record.createdAt ?? now,
            updatedAt: now,
          }
          blobs.set(key, { record, bytes: new Uint8Array(bytes) })
          return clone(record)
        },
        get: async (key: string, getOptions?: BlobGetOptions) => {
          const value = blobs.get(key)
          if (!value) return null
          const range = getOptions?.range
            ? resolveBlobRange(value.bytes.byteLength, getOptions.range)
            : { offset: 0, length: value.bytes.byteLength }
          const bytes = value.bytes.slice(
            range.offset,
            range.offset + range.length,
          )
          return {
            ...clone(value.record),
            ...(getOptions?.range ? { range } : {}),
            body: new Blob([bytes]).stream(),
            arrayBuffer: async () =>
              bytes.buffer.slice(
                bytes.byteOffset,
                bytes.byteOffset + bytes.byteLength,
              ),
            text: async () => new TextDecoder().decode(bytes),
          }
        },
        head: async (key: string) => clone(blobs.get(key)?.record ?? null),
        delete: async (key: string) => {
          blobs.delete(key)
        },
        list: async (listOptions?: {
          prefix?: string
          cursor?: string
          limit?: number
        }) => {
          const keys = [...blobs.keys()]
            .filter((key) => key.startsWith(listOptions?.prefix ?? ''))
            .filter(
              (key) =>
                listOptions?.cursor === undefined || key > listOptions.cursor,
            )
            .sort()
          if (listOptions?.limit === 0) return { objects: [], truncated: false }
          const page =
            listOptions?.limit === undefined
              ? keys
              : keys.slice(0, listOptions.limit)
          const truncated =
            listOptions?.limit !== undefined && keys.length > page.length
          const objects = page.map((key) => {
            const value = blobs.get(key)
            if (!value) throw new Error(`Missing blob for listed key: ${key}`)
            return value.record
          })
          return {
            objects: clone(objects),
            ...(truncated ? { cursor: page.at(-1), truncated: true } : {}),
          }
        },
      },
    },
  }
  const checkpointStore = new MemorySnapshotCheckpointStore(state)
  return {
    persistence,
    checkpoints: checkpointStore,
  }
}
