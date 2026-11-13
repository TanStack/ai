/**
 * Best-effort deletion of native provider snapshots that core no longer
 * references.
 *
 * A snapshot is recorded as the instance record's `latestSnapshotId`, so it
 * goes stale in two ways: the id is replaced by a newer snapshot, or the record
 * is deleted with its sandbox. Some providers keep snapshots after the sandbox
 * is gone and cap how many may exist (Railway checkpoints are
 * environment-scoped and capped per plan), so an unreferenced snapshot is not
 * just storage: it eventually makes every new snapshot fail.
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
  if (snapshotId === undefined || !provider.deleteSnapshot) return
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DELETE_SNAPSHOT_TIMEOUT_MS)
  try {
    await provider.deleteSnapshot({ snapshotId, signal: controller.signal })
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
