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
}

export interface SandboxSnapshotDirectoryEntry {
  path: string
  kind: 'dir'
}

export type SandboxSnapshotEntry =
  | SandboxSnapshotFileEntry
  | SandboxSnapshotDirectoryEntry

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

export interface SandboxCheckpointStore {
  get: (id: string) => Promise<SandboxCheckpoint | null>
  list: (threadId: string) => Promise<Array<SandboxCheckpoint>>
  getHead: (threadId: string) => Promise<string | null>
  append: (input: {
    checkpoint: SandboxCheckpoint
    expectedHeadId: string | null
    writer: SandboxCheckpointWriter
  }) => Promise<{ headId: string }>
  deleteHead: (input: {
    threadId: string
    checkpointId: string
    writer: SandboxCheckpointWriter
  }) => Promise<void>
  acquireWriter: (threadId: string) => Promise<SandboxCheckpointWriterLease>
  listBlobReferences: () => Promise<Array<{ key: string; references: number }>>
  /** Optional atomic fork capability. Stores without this method cannot fork. */
  forkFromCheckpoint?: SandboxCheckpointForkCapability['forkFromCheckpoint']
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

export interface SandboxCheckpointWriter {
  threadId: string
  ownerToken: string
  fence: number
}

export interface SandboxCheckpointWriterLease extends SandboxCheckpointWriter {
  expiresAt: number
  renewAfterMs: number
  renew: () => Promise<{ expiresAt: number }>
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
      'File entries require a non-empty blobKey',
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

function assertAppendCheckpointIds(
  checkpoint: SandboxCheckpoint,
  expectedHeadId: string | null,
  writer: SandboxCheckpointWriter,
): void {
  assertValidIdentifier(checkpoint.threadId, 'Checkpoint thread id')
  assertValidIdentifier(writer.threadId, 'Writer thread id')
  assertValidIdentifier(checkpoint.id, 'Checkpoint id')
  if (expectedHeadId !== null) {
    assertValidIdentifier(expectedHeadId, 'Expected head id')
  }
  if (checkpoint.parentCheckpointId != null) {
    assertValidIdentifier(checkpoint.parentCheckpointId, 'Parent checkpoint id')
  }
  if (writer.threadId !== checkpoint.threadId) {
    throw new SandboxCheckpointWriterLostError(
      'Checkpoint writer thread does not match checkpoint thread',
    )
  }
  const isInvalidCheckpointId =
    typeof checkpoint.id !== 'string' || checkpoint.id.length === 0
  if (isInvalidCheckpointId) {
    throw new SandboxCheckpointInvalidIdError('Checkpoint id must be non-empty')
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
  const isInvalidCreatedAt =
    typeof checkpoint.createdAt !== 'number' ||
    !Number.isFinite(checkpoint.createdAt)
  if (isInvalidCreatedAt) {
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
  const hasUnpairedExpectedHead =
    expectedHeadId !== null && hasUnpairedSurrogate(expectedHeadId)
  if (hasUnpairedExpectedHead) {
    throw new SandboxCheckpointInvalidIdError(
      'Expected head id must contain valid Unicode',
    )
  }
  const hasUnpairedParentId =
    parentCheckpointId !== null && hasUnpairedSurrogate(parentCheckpointId)
  if (hasUnpairedParentId) {
    throw new SandboxCheckpointInvalidIdError(
      'Parent checkpoint id must contain valid Unicode',
    )
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
    const isInvalidLeaseDuration =
      !Number.isFinite(this.leaseDurationMs) || this.leaseDurationMs <= 0
    if (isInvalidLeaseDuration) {
      throw new Error('leaseDurationMs must be finite and positive')
    }
    const isInvalidRenewAfter =
      !Number.isFinite(this.renewAfterMs) ||
      this.renewAfterMs <= 0 ||
      this.renewAfterMs >= this.leaseDurationMs
    if (isInvalidRenewAfter) {
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
    assertAppendCheckpointIds(checkpoint, expectedHeadId, writer)
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
        if (isMatchingLease) this.state.writers.delete(threadId)
      },
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

  async listBlobReferences(): Promise<
    Array<{ key: string; references: number }>
  > {
    return Array.from(this.state.references.entries())
      .sort(([a], [b]) => compareUtf8Bytes(a, b))
      .map(([key, references]) => ({ key, references }))
  }
}
