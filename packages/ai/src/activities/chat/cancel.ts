/**
 * Out-of-band run cancellation.
 *
 * `ChatClient.stop()` only aborts a local `AbortController`; it sends nothing to
 * the server. A user pressing Stop and a user refreshing the page produce the
 * IDENTICAL TCP close, so intent is **not inferable** from a disconnect. It has
 * to arrive out of band, and there are exactly two bands:
 *
 * 1. **Durable** — {@link requestRunCancel} records the intent on the run's
 *    `RunRecord`. This is the only channel that works when the run is being
 *    driven by a DIFFERENT host than the one the cancel request reached, which
 *    is the normal case for a detached run.
 * 2. **In-process** — abort the run's signal with {@link RUN_CANCEL_REASON}.
 *    Core reads the reason back when it builds `AbortInfo`, so
 *    `AbortInfo.cancelRequested` is `true` for that abort and `false` for a
 *    disconnect. This is the fast path when the cancel reaches the driving host.
 *
 * A cancel endpoint SHOULD do both: record it (so a remote driver observes it)
 * and abort locally (so a co-located driver stops immediately).
 */
import type { RunStore } from './middleware/run-store'

/**
 * Abort reason that marks an abort as an explicit cancellation.
 *
 * Namespaced so an application's own reason string cannot collide with it by
 * accident, and matched with `===` (never a substring test) so an arbitrary
 * provider error message can never be read as a deliberate cancel.
 */
export const RUN_CANCEL_REASON = 'tanstack-ai:cancel-requested'

/** Whether an abort reason means "the user explicitly cancelled this run". */
export function isCancelRequestedReason(reason: string | undefined): boolean {
  return reason === RUN_CANCEL_REASON
}

/**
 * Record an explicit cancel on the run record.
 *
 * Deliberately does NOT set a status. The driver is the only actor that knows
 * when the agent has actually stopped and the sandbox has been torn down, so it
 * owns the transition to `'aborted'`. Writing a terminal status here would tell
 * every reader the run is over while the agent is still burning tokens.
 *
 * A no-op for an unknown `runId`, inheriting `RunStore.update`'s documented
 * invariant.
 */
export async function requestRunCancel(
  runs: RunStore,
  runId: string,
): Promise<void> {
  await runs.update(runId, { cancelRequested: true })
}

/**
 * Whether an explicit cancel has been recorded for `runId`.
 *
 * Answers `false` rather than throwing when the store cannot be read. Callers
 * are middleware abort hooks and the reaper: both are already on a teardown
 * path, and a store failure there must not replace the caller's own reason for
 * tearing down with a store error. The cost of a false negative is that a
 * cancel degrades into a detach, which the `detachedRunTtl` reaper still
 * reclaims — strictly better than failing the teardown.
 */
export async function wasCancelRequested(
  runs: RunStore,
  runId: string,
): Promise<boolean> {
  try {
    const record = await runs.get(runId)
    return record?.cancelRequested === true
  } catch {
    return false
  }
}
