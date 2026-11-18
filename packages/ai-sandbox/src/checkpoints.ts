import {
  captureSandboxFiles,
  restoreSandboxFiles,
  SandboxSnapshotError,
} from './snapshots'
import { withWriterLease } from './snapshot-operations'
import type { ModelMessage } from '@tanstack/ai'
import type { SandboxHandle } from './contracts'
import type {
  SandboxCheckpoint,
  SandboxCheckpointStore,
} from './checkpoint-store'
import type { SandboxSnapshotBundle, SandboxSnapshotPolicy } from './snapshots'

export interface CaptureSandboxCheckpointInput {
  /** The sandbox to read the files from. */
  handle: SandboxHandle
  /** Where the checkpoint is stored. */
  checkpoints: SandboxCheckpointStore
  /** Where the file bytes are stored. */
  blobs: SandboxSnapshotBundle['blobs']
  /** The thread that gets the new checkpoint. */
  threadId: string
  /** Checkpoint id. Default: `checkpoint-<random UUID>`. */
  id?: string
  /** The folder to capture. Default: `/workspace`. */
  workspaceRoot?: string
  /** Which files to keep. Default: all files except `.git`, `node_modules` and `.env*`. */
  policy?: SandboxSnapshotPolicy
  /** A name for the checkpoint. With a label, the reason is `named`. */
  label?: string
  /** The messages to keep with the files. Default: `[]`. */
  conversation?: ReadonlyArray<ModelMessage>
  /** Secret values. The capture replaces them with zero bytes in the stored files. */
  secrets?: Readonly<Record<string, string>>
  /** Stops the capture before it writes the checkpoint. */
  signal?: AbortSignal
}

export interface RestoreSandboxCheckpointInput {
  /** The sandbox to write the files into. */
  handle: SandboxHandle
  /** Where the checkpoint is stored. */
  checkpoints: SandboxCheckpointStore
  /** Where the file bytes are stored. */
  blobs: SandboxSnapshotBundle['blobs']
  /** The thread of the checkpoint. */
  threadId: string
  /** The checkpoint to restore. Default: the head of the thread. */
  checkpointId?: string
  /** The folder to restore into. Default: `/workspace`. */
  workspaceRoot?: string
  /** Use the same policy as the capture. */
  policy?: SandboxSnapshotPolicy
}

export interface SweepSandboxBlobsInput {
  /** The store that counts which blobs a checkpoint uses. */
  checkpoints: SandboxCheckpointStore
  /** The blob storage to clean. */
  blobs: {
    /**
     * All stored keys that start with `prefix`, with the upload time in
     * milliseconds. Collect all pages before you return. With R2, use
     * `objects[].key` and `objects[].uploaded.getTime()` from each page.
     */
    list: (
      prefix: string,
    ) => Promise<ReadonlyArray<{ key: string; uploadedAt: number }>>
    delete: (key: string) => Promise<unknown>
  }
  /** Keep blobs that are younger than this, in milliseconds. */
  olderThanMs: number
  /** The clock. Default: `Date.now`. */
  now?: () => number
}

/**
 * Saves the files of a sandbox as a new checkpoint at the head of a thread.
 * It works on any `SandboxHandle`, also outside `withSandbox`.
 *
 * It takes the writer lease of the thread for the full capture. If another
 * writer holds the lease, it throws `SandboxCheckpointWriterConflictError`.
 * If the head moves during the capture, the store throws
 * `SandboxCheckpointConflictError`. A bad file in the sandbox throws
 * `SandboxSnapshotError`.
 *
 * ```ts
 * const checkpoint = await captureSandboxCheckpoint({
 *   handle,
 *   checkpoints,
 *   blobs,
 *   threadId,
 *   label: 'before-migration',
 * })
 * ```
 */
export async function captureSandboxCheckpoint(
  input: CaptureSandboxCheckpointInput,
) {
  const { handle, checkpoints, blobs, threadId, label, signal } = input
  signal?.throwIfAborted()
  return withWriterLease(
    () => checkpoints.acquireWriter(threadId),
    true,
    async (writer, throwIfLost) => {
      const files = await captureSandboxFiles(
        handle,
        { blobs, workspaceRoot: input.workspaceRoot },
        input.policy,
        input.secrets,
      )
      signal?.throwIfAborted()
      const head = await checkpoints.getHead(threadId)
      signal?.throwIfAborted()
      const checkpoint: SandboxCheckpoint = {
        id: input.id ?? `checkpoint-${crypto.randomUUID()}`,
        threadId,
        parentCheckpointId: head,
        createdAt: Date.now(),
        reason: label === undefined ? 'automatic' : 'named',
        ...(label === undefined ? {} : { label }),
        files: files.files,
        conversation: input.conversation ?? [],
        artifacts: [],
      }
      await throwIfLost()
      await checkpoints.append({ checkpoint, expectedHeadId: head, writer })
      return checkpoint
    },
  )
}

/**
 * Writes the files of a checkpoint into a sandbox. The sandbox can be a new
 * one, for example a new container after a crash.
 *
 * Without `checkpointId`, it restores the head of the thread. When the thread
 * has no checkpoint, it returns `null` and does not touch the sandbox.
 * When `checkpointId` does not exist or is on another thread, it throws
 * `SandboxSnapshotError` with code `SANDBOX_SNAPSHOT_MISSING_CHECKPOINT`.
 *
 * Restore only into a sandbox that no other process writes to during the
 * restore. Files in the folder that are not in the checkpoint are removed.
 *
 * ```ts
 * const restored = await restoreSandboxCheckpoint({
 *   handle: newHandle,
 *   checkpoints,
 *   blobs,
 *   threadId,
 * })
 * if (restored === null) {
 *   // First run of this thread. Nothing to restore.
 * }
 * ```
 */
export async function restoreSandboxCheckpoint(
  input: RestoreSandboxCheckpointInput,
) {
  const { checkpoints, threadId } = input
  const checkpointId =
    input.checkpointId ?? (await checkpoints.getHead(threadId))
  if (checkpointId === null) return null
  const checkpoint = await checkpoints.get(checkpointId)
  if (checkpoint === null || checkpoint.threadId !== threadId)
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_MISSING_CHECKPOINT',
      `Checkpoint '${checkpointId}' does not exist on thread '${threadId}'`,
    )
  await restoreSandboxFiles(
    input.handle,
    { blobs: input.blobs, workspaceRoot: input.workspaceRoot },
    checkpoint,
    input.policy,
  )
  return checkpoint
}

const SWEPT_PREFIXES = ['sandbox-files/', 'sandbox-artifacts/']

/**
 * Deletes stored blobs that no checkpoint uses. It looks only at keys under
 * `sandbox-files/` and `sandbox-artifacts/`, and returns the deleted keys,
 * sorted.
 *
 * A capture puts its blobs first and appends the checkpoint after. Until the
 * append, a new blob has no reference. So the sweep keeps every blob that is
 * younger than `olderThanMs`. Make `olderThanMs` longer than your longest
 * capture.
 *
 * A capture does not upload a blob that already exists. So a capture that
 * runs during the sweep can use an old blob that the sweep deletes. Run the
 * sweep when no capture runs, for example from a nightly job.
 *
 * Throws `RangeError` when `olderThanMs` is not a finite number of 0 or more.
 *
 * ```ts
 * const deleted = await sweepSandboxBlobs({
 *   checkpoints,
 *   blobs: { list: listAllKeys, delete: (key) => bucket.delete(key) },
 *   olderThanMs: 24 * 60 * 60 * 1000,
 * })
 * ```
 */
export async function sweepSandboxBlobs(input: SweepSandboxBlobsInput) {
  const { checkpoints, blobs, olderThanMs } = input
  const isValidAge = Number.isFinite(olderThanMs) && olderThanMs >= 0
  if (!isValidAge)
    throw new RangeError('olderThanMs must be a finite number of 0 or more')
  const now = input.now ?? (() => Date.now())
  const cutoff = now() - olderThanMs
  const listed = await Promise.all(
    SWEPT_PREFIXES.map(async (prefix) =>
      (await blobs.list(prefix)).filter((blob) => blob.key.startsWith(prefix)),
    ),
  )
  // Read the references after the list, so a checkpoint appended during the
  // list still protects its blobs.
  const references = await checkpoints.listBlobReferences()
  const referenced = new Set(
    references.filter((ref) => ref.references > 0).map((ref) => ref.key),
  )
  const deleted: Array<string> = []
  const candidates = listed.flat()
  for (const blob of candidates) {
    const isUnusedAndOld =
      !referenced.has(blob.key) && blob.uploadedAt <= cutoff
    if (!isUnusedAndOld) continue
    await blobs.delete(blob.key)
    deleted.push(blob.key)
  }
  return deleted.sort()
}
