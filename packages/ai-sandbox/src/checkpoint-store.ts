import type { ModelMessage } from '@tanstack/ai'

// Compare strings by their UTF-8 bytes so ordering does not depend on locale.
const utf8Encoder = new TextEncoder()

const compareUtf8Bytes = (left: string, right: string): number => {
  const leftBytes = utf8Encoder.encode(left)
  const rightBytes = utf8Encoder.encode(right)
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

export interface SandboxSnapshotFileEntry {
  path: string
  kind: 'file'
  blobKey: string
  size: number
  /** Permission bits of the file (`mode & 0o777`). Old snapshots have none. */
  mode?: number
}

export interface SandboxSnapshotDirectoryEntry {
  path: string
  kind: 'dir'
}

/** A symbolic link. `target` is the link text as `readlink` gives it. */
export interface SandboxSnapshotSymlinkEntry {
  path: string
  kind: 'symlink'
  target: string
}

export type SandboxSnapshotEntry =
  | SandboxSnapshotFileEntry
  | SandboxSnapshotDirectoryEntry
  | SandboxSnapshotSymlinkEntry

export interface SandboxSnapshotArtifact {
  artifactId: string
  name: string
  mimeType: string
  size: number
  blobKey: string
  createdAt: number
}

export interface SandboxCheckpoint {
  id: string
  threadId: string
  parentCheckpointId: string | null
  createdAt: number
  reason: 'automatic' | 'named' | 'fork-root'
  label?: string
  sourceRunId?: string
  files: ReadonlyArray<SandboxSnapshotEntry>
  conversation: ReadonlyArray<ModelMessage>
  artifacts: ReadonlyArray<SandboxSnapshotArtifact>
}

/**
 * Stores the checkpoints of each thread, the head of each thread, the writer
 * leases, and a reference count for each blob key.
 *
 * Implement it against your own storage. For example, keep manifests, heads,
 * leases and counts in SQL, and keep blob bytes in R2. The store only counts
 * blob references. It never reads or deletes blob bytes.
 *
 * Rules for every method:
 *
 * - A thread is a chain. Each checkpoint points to its parent with
 *   `parentCheckpointId`. The head is the newest checkpoint of the chain.
 * - Checkpoint ids are unique across all threads.
 * - A stored checkpoint never changes. Reads return copies. A change to a
 *   returned value does not change the store.
 * - Thread ids and checkpoint ids are non-empty, well-formed Unicode strings.
 *   Other values throw `SandboxCheckpointInvalidIdError`.
 * - A write is all or nothing. Do the checks and the write in one
 *   transaction. When a write throws, the store does not change.
 * - A write checks its writer first. `writer.threadId` must be the thread of
 *   the write, and the lease must be current. Else the write throws
 *   `SandboxCheckpointWriterLostError`.
 *
 * Prove an implementation with `runSandboxCheckpointStoreConformance` from
 * `@tanstack/ai-sandbox/testkit`.
 */
export interface SandboxCheckpointStore {
  /**
   * Returns the checkpoint with this id, or `null` when there is none.
   * A missing id does not throw.
   */
  get: (id: string) => Promise<SandboxCheckpoint | null>
  /**
   * Returns all checkpoints of the thread, also the ones that are not on the
   * head chain. Sort by `createdAt` (oldest first), then by the UTF-8 bytes
   * of the id. An unknown thread returns `[]`.
   */
  list: (threadId: string) => Promise<Array<SandboxCheckpoint>>
  /** Returns the head id of the thread, or `null` when it has no head. */
  getHead: (threadId: string) => Promise<string | null>
  /**
   * Adds a checkpoint and makes it the head, as one compare-and-swap.
   *
   * Checks, in this order (each one throws and changes nothing):
   *
   * 1. Ids are valid: `SandboxCheckpointInvalidIdError`.
   * 2. `files`, `artifacts` and a finite `createdAt` are valid:
   *    `SandboxCheckpointInvalidEntryError`.
   * 3. The writer is current: `SandboxCheckpointWriterLostError`.
   * 4. The id is not used in any thread: `SandboxCheckpointDuplicateIdError`.
   * 5. The current head is `expectedHeadId` (`null` for an empty thread):
   *    `SandboxCheckpointConflictError`.
   * 6. `parentCheckpointId` is `expectedHeadId`. A missing parent id counts as
   *    `null`: `SandboxCheckpointParentMismatchError`.
   *
   * Then add 1 to the count of each distinct blob key of the checkpoint. The
   * keys are the `blobKey` of each `file` entry and of each artifact.
   * Directories and symlinks have no blob.
   */
  append: (input: {
    checkpoint: SandboxCheckpoint
    expectedHeadId: string | null
    writer: SandboxCheckpointWriter
  }) => Promise<{ headId: string }>
  /**
   * Removes the head checkpoint of the thread.
   *
   * The writer must be current. `checkpointId` must be the current head, else
   * it throws `SandboxCheckpointNotHeadError`. The head moves to the
   * `parentCheckpointId` of the removed checkpoint. The thread has no head
   * when that is `null`, or when that checkpoint was removed by
   * `deleteCheckpoints`. Subtract 1 from the count of each distinct blob key of
   * the removed checkpoint. Forget a key when its count gets to 0.
   */
  deleteHead: (input: {
    threadId: string
    checkpointId: string
    writer: SandboxCheckpointWriter
  }) => Promise<void>
  /**
   * Takes the writer lease of the thread. It does not wait.
   *
   * When an unexpired lease exists, it throws
   * `SandboxCheckpointWriterConflictError`. An expired lease can be taken
   * over. Each new lease gets a new `ownerToken` and a `fence` that is higher
   * than all earlier fences of the thread. Each thread has its own lease.
   */
  acquireWriter: (threadId: string) => Promise<SandboxCheckpointWriterLease>
  /**
   * Returns each blob key with a count above 0, for all threads. Sort by the
   * UTF-8 bytes of the key. Do not return keys with a count of 0.
   *
   * The count is the number of stored checkpoints that use the key. A
   * checkpoint that uses a key two times counts one time. A blob sweep
   * deletes only the blobs that are not in this list.
   */
  listBlobReferences: () => Promise<Array<{ key: string; references: number }>>
  /**
   * Optional. Copies one checkpoint into a new, empty thread as its root, in
   * one transaction. Stores without this method cannot fork.
   *
   * The new checkpoint has `reason: 'fork-root'` and `parentCheckpointId:
   * null`. It becomes the head of the new thread, and its blob keys get 1
   * more reference. The writer must be the current writer of the destination
   * thread. Errors are `SandboxCheckpointError` with these codes:
   *
   * - `SANDBOX_SNAPSHOT_FORK_SOURCE_NOT_FOUND`: no source checkpoint.
   * - `SANDBOX_SNAPSHOT_FORK_SOURCE_THREAD_MISMATCH`: the source is in another
   *   thread, or source and destination are the same thread.
   * - `SANDBOX_SNAPSHOT_FORK_DESTINATION_NOT_EMPTY`: the destination thread
   *   already has data, or the new id is used.
   *
   * Prove it with `runSandboxCheckpointForkConformance` from
   * `@tanstack/ai-sandbox/testkit`.
   */
  forkFromCheckpoint?: SandboxCheckpointForkCapability['forkFromCheckpoint']
  /**
   * Optional. Removes old checkpoints of a thread so that `keep` checkpoints
   * stay: the head and the newest ones before it.
   *
   * - `keep` is a safe integer of 1 or more. Else it throws
   *   `SandboxCheckpointInvalidEntryError`.
   * - The writer is checked like in `deleteHead`.
   * - "Newest" follows the parent chain from the head, not `createdAt`.
   * - Checkpoints of the thread that are not on the head chain stay as they
   *   are.
   * - For each removed checkpoint, subtract its blob references like
   *   `deleteHead` does.
   * - The oldest kept checkpoint keeps its `parentCheckpointId`. That id can
   *   point to a removed checkpoint, and `get` returns `null` for it. A
   *   later `deleteHead` of that checkpoint leaves the thread with no head.
   * - Remove all of them in one transaction, or none.
   *
   * Returns the removed ids, oldest first. A thread with `keep` or fewer
   * checkpoints on its chain returns `{ deleted: [] }`.
   */
  deleteCheckpoints?: (input: {
    threadId: string
    keep: number
    writer: SandboxCheckpointWriter
  }) => Promise<{ deleted: Array<string> }>
}

export interface SandboxCheckpointForkInput {
  sourceThreadId: string
  sourceCheckpointId: string
  destinationThreadId: string
  destinationCheckpointId: string
  createdAt: number
  writer: SandboxCheckpointWriter
}

export interface SandboxCheckpointForkCapability {
  forkFromCheckpoint: (input: SandboxCheckpointForkInput) => Promise<{
    checkpoint: SandboxCheckpoint
  }>
}

export type ForkCapableSandboxCheckpointStore = SandboxCheckpointStore &
  SandboxCheckpointForkCapability

export function isForkCapableSandboxCheckpointStore(
  store: SandboxCheckpointStore,
): store is ForkCapableSandboxCheckpointStore {
  return typeof store.forkFromCheckpoint === 'function'
}

/**
 * Proof that the caller holds the writer lease of a thread. Each write sends
 * it. The store compares all three fields with the current lease.
 */
export interface SandboxCheckpointWriter {
  /** The thread that this lease guards. */
  threadId: string
  /** A new random value for each `acquireWriter` call. */
  ownerToken: string
  /**
   * Goes up by at least 1 for each new lease of the thread. A write with an
   * older fence throws `SandboxCheckpointWriterLostError`.
   */
  fence: number
}

/** The lease that `acquireWriter` returns. */
export interface SandboxCheckpointWriterLease extends SandboxCheckpointWriter {
  /**
   * Epoch ms (store clock) when the lease ends. At or after this time, writes
   * with it throw `SandboxCheckpointWriterLostError`, and another caller can
   * take a new lease.
   */
  expiresAt: number
  /** Call `renew` after this many ms. It is less than the lease duration. */
  renewAfterMs: number
  /**
   * Moves `expiresAt` to now plus the lease duration. Throws
   * `SandboxCheckpointWriterLostError` when the lease expired or was replaced.
   */
  renew: () => Promise<{ expiresAt: number }>
  /**
   * Ends the lease. It does nothing when the lease is not the current one
   * (a newer lease replaced it). It does not throw.
   */
  release: () => Promise<void>
}

export interface SandboxCheckpointStoreOptions {
  now?: () => number
  leaseDurationMs?: number
  renewAfterMs?: number
}

interface InMemoryCheckpointState {
  checkpoints: Map<string, SandboxCheckpoint>
  heads: Map<string, string>
  writers: Map<string, { ownerToken: string; fence: number; expiresAt: number }>
  fences: Map<string, number>
  references: Map<string, number>
}

export type SandboxCheckpointErrorCode =
  | 'SANDBOX_SNAPSHOT_STALE_HEAD'
  | 'SANDBOX_SNAPSHOT_PARENT_MISMATCH'
  | 'SANDBOX_SNAPSHOT_DUPLICATE_ID'
  | 'SANDBOX_SNAPSHOT_NOT_HEAD'
  | 'SANDBOX_SNAPSHOT_WRITER_CONFLICT'
  | 'SANDBOX_SNAPSHOT_WRITER_LOST'
  | 'SANDBOX_SNAPSHOT_INVALID_ID'
  | 'SANDBOX_SNAPSHOT_INVALID_ENTRY'
  | 'SANDBOX_SNAPSHOT_CHECKPOINT_NOT_FOUND'
  | 'SANDBOX_SNAPSHOT_ATOMIC_FORK_REQUIRED'
  | 'SANDBOX_SNAPSHOT_FORK_SOURCE_NOT_FOUND'
  | 'SANDBOX_SNAPSHOT_FORK_SOURCE_THREAD_MISMATCH'
  | 'SANDBOX_SNAPSHOT_FORK_DESTINATION_NOT_EMPTY'

export class SandboxCheckpointError extends Error {
  readonly code: SandboxCheckpointErrorCode

  constructor(code: SandboxCheckpointErrorCode, message: string) {
    super(message)
    this.name = 'SandboxCheckpointError'
    this.code = code
  }
}

export class SandboxCheckpointConflictError extends SandboxCheckpointError {
  constructor(message: string) {
    super('SANDBOX_SNAPSHOT_STALE_HEAD', message)
    this.name = 'SandboxCheckpointConflictError'
  }
}

export class SandboxCheckpointDuplicateIdError extends SandboxCheckpointError {
  constructor(message: string) {
    super('SANDBOX_SNAPSHOT_DUPLICATE_ID', message)
    this.name = 'SandboxCheckpointDuplicateIdError'
  }
}

export class SandboxCheckpointInvalidIdError extends SandboxCheckpointError {
  constructor(message: string) {
    super('SANDBOX_SNAPSHOT_INVALID_ID', message)
    this.name = 'SandboxCheckpointInvalidIdError'
  }
}

export class SandboxCheckpointInvalidEntryError extends SandboxCheckpointError {
  constructor(message: string) {
    super('SANDBOX_SNAPSHOT_INVALID_ENTRY', message)
    this.name = 'SandboxCheckpointInvalidEntryError'
  }
}

export class SandboxCheckpointParentMismatchError extends SandboxCheckpointError {
  constructor(message: string) {
    super('SANDBOX_SNAPSHOT_PARENT_MISMATCH', message)
    this.name = 'SandboxCheckpointParentMismatchError'
  }
}

export class SandboxCheckpointNotHeadError extends SandboxCheckpointError {
  constructor(message: string) {
    super('SANDBOX_SNAPSHOT_NOT_HEAD', message)
    this.name = 'SandboxCheckpointNotHeadError'
  }
}

export class SandboxCheckpointWriterConflictError extends SandboxCheckpointError {
  constructor(message: string) {
    super('SANDBOX_SNAPSHOT_WRITER_CONFLICT', message)
    this.name = 'SandboxCheckpointWriterConflictError'
  }
}

export class SandboxCheckpointWriterLostError extends SandboxCheckpointError {
  constructor(message: string) {
    super('SANDBOX_SNAPSHOT_WRITER_LOST', message)
    this.name = 'SandboxCheckpointWriterLostError'
  }
}

export function defineSandboxCheckpointStore(
  store: SandboxCheckpointStore,
): SandboxCheckpointStore {
  return store
}

function copy<T>(value: T): T {
  return structuredClone(value)
}

function blobKeys(checkpoint: SandboxCheckpoint): Set<string> {
  const keys = new Set<string>()
  for (const entry of checkpoint.files) {
    if (entry.kind === 'file') keys.add(entry.blobKey)
  }
  for (const artifact of checkpoint.artifacts) keys.add(artifact.blobKey)
  return keys
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) return true
      index++
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

function assertValidIdentifier(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    hasUnpairedSurrogate(value)
  ) {
    throw new SandboxCheckpointInvalidIdError(
      `${label} must be a non-empty well-formed Unicode string`,
    )
  }
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

/**
 * Checks the `files` of a checkpoint before a store keeps it.
 * Throws `SandboxCheckpointInvalidEntryError` for a bad entry.
 */
export function validateEntries(checkpoint: SandboxCheckpoint): void {
  if (!Array.isArray(checkpoint.files)) {
    throw new SandboxCheckpointInvalidEntryError(
      'Checkpoint files must be an array',
    )
  }
  const paths = new Set<string>()
  const kinds = new Map<string, SandboxSnapshotEntry['kind']>()
  for (const entry of checkpoint.files as ReadonlyArray<unknown>) {
    if (entry === null || typeof entry !== 'object') {
      throw new SandboxCheckpointInvalidEntryError(
        'Checkpoint entry must be an object',
      )
    }
    const candidate = entry as Record<string, unknown>
    if (
      typeof candidate.path !== 'string' ||
      candidate.path.length === 0 ||
      candidate.path.includes('\0') ||
      candidate.path.startsWith('/') ||
      candidate.path.startsWith('\\') ||
      /^[A-Za-z]:([\\/]|$)/.test(candidate.path) ||
      candidate.path.includes('\\') ||
      candidate.path
        .split('/')
        .some((part) => part.length === 0 || part === '.' || part === '..')
    ) {
      throw new SandboxCheckpointInvalidEntryError(
        'Checkpoint entry path must be a normalized workspace-relative path',
      )
    }
    const path = candidate.path
    if (paths.has(path)) {
      throw new SandboxCheckpointInvalidEntryError(
        `Checkpoint contains duplicate entry path '${path}'`,
      )
    }
    // Files and links are leaves: no entry can be beneath them.
    for (
      let separator = path.indexOf('/');
      separator !== -1;
      separator = path.indexOf('/', separator + 1)
    ) {
      const ancestor = path.slice(0, separator)
      const ancestorKind = kinds.get(ancestor)
      if (ancestorKind === 'file' || ancestorKind === 'symlink') {
        throw new SandboxCheckpointInvalidEntryError(
          `Checkpoint entry '${path}' is beneath ${ancestorKind} '${ancestor}'`,
        )
      }
    }
    const isLeaf = candidate.kind === 'file' || candidate.kind === 'symlink'
    if (
      isLeaf &&
      Array.from(kinds.keys()).some((other) => other.startsWith(`${path}/`))
    ) {
      throw new SandboxCheckpointInvalidEntryError(
        `Checkpoint ${candidate.kind} '${path}' is an ancestor of another entry`,
      )
    }
    paths.add(path)
    if (candidate.kind === 'file') {
      if (
        typeof candidate.blobKey !== 'string' ||
        candidate.blobKey.length === 0 ||
        hasUnpairedSurrogate(candidate.blobKey) ||
        !/^sandbox-files\/sha256\/[0-9a-f]{64}$/.test(candidate.blobKey)
      ) {
        throw new SandboxCheckpointInvalidEntryError(
          'File entries require a valid content-addressed blobKey',
        )
      }
      if (
        !hasOwn(candidate, 'size') ||
        typeof candidate.size !== 'number' ||
        !Number.isSafeInteger(candidate.size) ||
        candidate.size < 0
      ) {
        throw new SandboxCheckpointInvalidEntryError(
          'File entry size must be a non-negative safe integer',
        )
      }
      const hasValidMode =
        !hasOwn(candidate, 'mode') ||
        (typeof candidate.mode === 'number' &&
          Number.isSafeInteger(candidate.mode) &&
          candidate.mode >= 0 &&
          candidate.mode <= 0o777)
      if (!hasValidMode) {
        throw new SandboxCheckpointInvalidEntryError(
          'File entry mode must be an integer from 0 to 0o777',
        )
      }
    } else if (candidate.kind === 'dir') {
      if (hasOwn(candidate, 'blobKey') || hasOwn(candidate, 'size')) {
        throw new SandboxCheckpointInvalidEntryError(
          'Directory entries cannot contain file fields',
        )
      }
    } else if (candidate.kind === 'symlink') {
      if (
        hasOwn(candidate, 'blobKey') ||
        hasOwn(candidate, 'size') ||
        hasOwn(candidate, 'mode')
      ) {
        throw new SandboxCheckpointInvalidEntryError(
          'Symlink entries cannot contain file fields',
        )
      }
      if (
        typeof candidate.target !== 'string' ||
        candidate.target.length === 0 ||
        candidate.target.includes('\0')
      ) {
        throw new SandboxCheckpointInvalidEntryError(
          'Symlink entries require a non-empty target without NUL',
        )
      }
    } else {
      throw new SandboxCheckpointInvalidEntryError(
        'Checkpoint entry kind must be file, dir, or symlink',
      )
    }
    kinds.set(path, candidate.kind)
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
    if (
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
    ) {
      throw new SandboxCheckpointInvalidEntryError(
        'Checkpoint artifact has invalid fields',
      )
    }
  }
}

export class InMemorySandboxCheckpointStore implements SandboxCheckpointStore {
  private readonly state: InMemoryCheckpointState
  private readonly now: () => number
  private readonly leaseDurationMs: number
  private readonly renewAfterMs: number

  constructor(options: SandboxCheckpointStoreOptions = {}) {
    const state: InMemoryCheckpointState = {
      checkpoints: new Map(),
      heads: new Map(),
      writers: new Map(),
      fences: new Map(),
      references: new Map(),
    }
    this.state = state
    this.now = options.now ?? (() => Date.now())
    this.leaseDurationMs = options.leaseDurationMs ?? 120_000
    this.renewAfterMs = options.renewAfterMs ?? 45_000
    if (!Number.isFinite(this.leaseDurationMs) || this.leaseDurationMs <= 0) {
      throw new Error('leaseDurationMs must be finite and positive')
    }
    if (
      !Number.isFinite(this.renewAfterMs) ||
      this.renewAfterMs <= 0 ||
      this.renewAfterMs >= this.leaseDurationMs
    ) {
      throw new Error(
        'renewAfterMs must be finite, positive, and less than leaseDurationMs',
      )
    }
  }

  async get(id: string): Promise<SandboxCheckpoint | null> {
    assertValidIdentifier(id, 'Checkpoint id')
    const checkpoint = this.state.checkpoints.get(id)
    return checkpoint ? copy(checkpoint) : null
  }

  async list(threadId: string): Promise<Array<SandboxCheckpoint>> {
    assertValidIdentifier(threadId, 'Thread id')
    return Array.from(this.state.checkpoints.values())
      .filter((checkpoint) => checkpoint.threadId === threadId)
      .sort((a, b) => a.createdAt - b.createdAt || compareUtf8Bytes(a.id, b.id))
      .map(copy)
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
    const checkpoint = copy(input.checkpoint)
    const { expectedHeadId, writer } = input
    assertValidIdentifier(checkpoint.threadId, 'Checkpoint thread id')
    assertValidIdentifier(writer.threadId, 'Writer thread id')
    assertValidIdentifier(checkpoint.id, 'Checkpoint id')
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
    if (typeof checkpoint.id !== 'string' || checkpoint.id.length === 0) {
      throw new SandboxCheckpointInvalidIdError(
        'Checkpoint id must be non-empty',
      )
    }
    if (hasUnpairedSurrogate(checkpoint.id)) {
      throw new SandboxCheckpointInvalidIdError(
        'Checkpoint id must contain valid Unicode',
      )
    }
    if (hasUnpairedSurrogate(checkpoint.threadId)) {
      throw new SandboxCheckpointInvalidIdError(
        'Checkpoint thread id must contain valid Unicode',
      )
    }
    if (
      typeof checkpoint.createdAt !== 'number' ||
      !Number.isFinite(checkpoint.createdAt)
    ) {
      throw new SandboxCheckpointInvalidEntryError(
        'Checkpoint createdAt must be a finite number',
      )
    }
    if (expectedHeadId === '') {
      throw new SandboxCheckpointInvalidIdError(
        'Expected head id must be null or non-empty',
      )
    }
    const parentCheckpointId = checkpoint.parentCheckpointId ?? null
    if (parentCheckpointId === '') {
      throw new SandboxCheckpointInvalidIdError(
        'Parent checkpoint id must be null or non-empty',
      )
    }
    if (expectedHeadId !== null && hasUnpairedSurrogate(expectedHeadId)) {
      throw new SandboxCheckpointInvalidIdError(
        'Expected head id must contain valid Unicode',
      )
    }
    if (
      parentCheckpointId !== null &&
      hasUnpairedSurrogate(parentCheckpointId)
    ) {
      throw new SandboxCheckpointInvalidIdError(
        'Parent checkpoint id must contain valid Unicode',
      )
    }
    validateEntries(checkpoint)
    validateArtifacts(checkpoint)

    // The caller can re-enter append while its checkpoint is staged. Recheck
    // live writer and CAS state immediately before publishing.
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
    const headId = this.state.heads.get(threadId) ?? null
    if (headId !== checkpointId) {
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
    // The parent can be gone after `deleteCheckpoints`. Then the thread has no head.
    if (
      checkpoint.parentCheckpointId &&
      this.state.checkpoints.has(checkpoint.parentCheckpointId)
    ) {
      this.state.heads.set(threadId, checkpoint.parentCheckpointId)
    } else {
      this.state.heads.delete(threadId)
    }
    this.releaseReferences(checkpoint)
  }

  async deleteCheckpoints(input: {
    threadId: string
    keep: number
    writer: SandboxCheckpointWriter
  }) {
    const { threadId, keep, writer } = input
    assertValidIdentifier(threadId, 'Thread id')
    assertValidIdentifier(writer.threadId, 'Writer thread id')
    if (!Number.isSafeInteger(keep) || keep < 1) {
      throw new SandboxCheckpointInvalidEntryError(
        'keep must be a safe integer of 1 or more',
      )
    }
    if (writer.threadId !== threadId) {
      throw new SandboxCheckpointWriterLostError(
        'Checkpoint writer thread does not match operation thread',
      )
    }
    this.assertWriter(writer, threadId)
    // Walk the parent chain from the head, newest first. The seen set stops
    // the walk when a removed id was used again by a newer checkpoint.
    const chain: Array<SandboxCheckpoint> = []
    const seen = new Set<string>()
    let id = this.state.heads.get(threadId) ?? null
    while (id !== null && !seen.has(id)) {
      seen.add(id)
      const checkpoint = this.state.checkpoints.get(id)
      if (!checkpoint || checkpoint.threadId !== threadId) break
      chain.push(checkpoint)
      id = checkpoint.parentCheckpointId
    }
    const removed = chain.slice(keep).reverse()
    for (const checkpoint of removed) {
      this.state.checkpoints.delete(checkpoint.id)
      this.releaseReferences(checkpoint)
    }
    return { deleted: removed.map((checkpoint) => checkpoint.id) }
  }

  private releaseReferences(checkpoint: SandboxCheckpoint): void {
    for (const key of blobKeys(checkpoint)) {
      const references = (this.state.references.get(key) ?? 0) - 1
      if (references > 0) this.state.references.set(key, references)
      else this.state.references.delete(key)
    }
  }

  async acquireWriter(threadId: string): Promise<SandboxCheckpointWriterLease> {
    assertValidIdentifier(threadId, 'Thread id')
    const current = this.state.writers.get(threadId)
    if (current && current.expiresAt > this.now()) {
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
        if (
          currentLease?.ownerToken === ownerToken &&
          currentLease.fence === fence
        )
          this.state.writers.delete(threadId)
      },
    }
  }

  private assertWriter(
    writer: SandboxCheckpointWriter,
    threadId: string,
  ): void {
    const current = this.state.writers.get(threadId)
    if (
      !current ||
      current.ownerToken !== writer.ownerToken ||
      current.fence !== writer.fence ||
      current.expiresAt <= this.now()
    ) {
      throw new SandboxCheckpointWriterLostError(
        `Checkpoint writer lease for thread '${threadId}' is no longer current`,
      )
    }
  }

  async listBlobReferences(): Promise<
    Array<{ key: string; references: number }>
  > {
    return Array.from(this.state.references.entries())
      .sort(([a], [b]) => compareUtf8Bytes(a, b))
      .map(([key, references]) => ({ key, references }))
  }
}
