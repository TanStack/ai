/**
 * Best-effort deletion of native provider snapshots that core no longer
 * references.
 *
 * A snapshot is recorded as the instance record's `latestSnapshotId`, so it
 * goes stale in two ways: the id is replaced by a newer snapshot, or the record
 * is deleted with its sandbox. Some providers keep snapshots after the sandbox
 * is gone, so an unreferenced snapshot stays until something deletes it.
 */
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { SandboxProvider } from './contracts'

/**
 * Bound for one delete call. Like teardown `destroy`, the delete is not fenced
 * by the caller's signal (cleanup must outlive whatever cancelled the run), so
 * this keeps a wedged provider from pinning the caller.
 */
const DELETE_SNAPSHOT_TIMEOUT_MS = 60 * 1000

/**
 * Delete `snapshotId` through `provider.deleteSnapshot`, if the provider has
 * one. Never throws: a failure is logged at warn level and swallowed, because
 * a leaked snapshot must not fail the run or the teardown that dropped it.
 */
export async function deleteSnapshotQuietly(
  provider: SandboxProvider,
  snapshotId: string | undefined,
  options: {
    logger?: InternalLogger
    meta?: Record<string, unknown>
  } = {},
): Promise<void> {
  const deleteSnapshot = provider.deleteSnapshot?.bind(provider)
  if (snapshotId === undefined || !deleteSnapshot) return
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  // Settles on its own, so a provider that ignores the signal still cannot
  // hold up the caller (or the `ensure()` key lock) past the bound.
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const reason = new Error(
        `deleteSnapshot timed out after ${DELETE_SNAPSHOT_TIMEOUT_MS}ms`,
      )
      controller.abort(reason)
      reject(reason)
    }, DELETE_SNAPSHOT_TIMEOUT_MS)
  })
  const deletion = Promise.resolve().then(() =>
    deleteSnapshot({ snapshotId, signal: controller.signal }),
  )
  // A rejection that lands after the timeout has nobody awaiting it.
  deletion.catch(() => undefined)
  try {
    await Promise.race([deletion, timedOut])
  } catch (error) {
    options.logger?.warn('sandbox snapshot delete failed; it is now leaked', {
      ...options.meta,
      provider: provider.name,
      snapshotId,
      error,
    })
  } finally {
    clearTimeout(timer)
  }
}
