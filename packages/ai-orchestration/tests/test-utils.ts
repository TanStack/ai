/**
 * Shared helpers for the engine test suite. Keep this lean — only add
 * functions that genuinely appear in multiple files. Test-specific
 * scaffolding (agent factories, workflow shapes used by a single spec)
 * stays in the test file that owns it.
 */

import type { StreamChunk } from '@tanstack/ai'
import type { InMemoryRunStore } from '../src/run-store/in-memory'

/** Drain an async iterable into an array. */
export async function collect<T>(iter: AsyncIterable<T>): Promise<Array<T>> {
  const out: Array<T> = []
  for await (const c of iter) out.push(c)
  return out
}

/**
 * Type guard for the RUN_STARTED chunk. Uses `Extract` to pick the variant
 * out of the `StreamChunk` discriminated union — the variant carries `runId`
 * via its `RunStartedEvent` shape from `@tanstack/ai`.
 */
function isRunStartedChunk(
  chunk: StreamChunk,
): chunk is Extract<StreamChunk, { type: 'RUN_STARTED' }> {
  return chunk.type === 'RUN_STARTED'
}

/**
 * Pull the runId off the RUN_STARTED chunk a workflow emits. Throws if the
 * stream didn't start a run — which always indicates a bug in the calling
 * test, not a recoverable condition.
 */
export function findRunId(events: ReadonlyArray<StreamChunk>): string {
  const started = events.find(isRunStartedChunk)
  if (!started) {
    throw new Error('findRunId: no RUN_STARTED chunk in events')
  }
  return started.runId
}

/**
 * Pull the approvalId off the approval-requested CUSTOM chunk a paused
 * workflow emits. workflow-core@0.0.2 strictly matches approval deliveries
 * against the persisted `pendingApproval.approvalId`, so tests resuming an
 * approval run must use the same id that workflow-core generated rather
 * than hard-coding one. Throws if the stream didn't emit an approval
 * request — that indicates a bug in the calling test.
 */
export function findApprovalId(events: ReadonlyArray<StreamChunk>): string {
  const requested = events.find(
    (e): e is Extract<StreamChunk, { type: 'CUSTOM' }> =>
      e.type === 'CUSTOM' &&
      (e as { name?: string }).name === 'approval-requested',
  ) as
    | { value?: { approvalId?: string } }
    | undefined
  const approvalId = requested?.value?.approvalId
  if (!approvalId) {
    throw new Error('findApprovalId: no approval-requested chunk in events')
  }
  return approvalId
}

/**
 * Drop the in-memory store's live generator handle so the engine takes the
 * replay-from-log path on the next resume. Simulates a process restart
 * (in production durable stores can't surface the live generator anyway —
 * this is the same path real deployments hit).
 *
 * `getLive` is declared on `InMemoryRunStore` as a writable function-typed
 * property, so reassigning it is a plain property write — no cast needed.
 */
export function simulateRestart(store: InMemoryRunStore): void {
  store.getLive = () => undefined
}
