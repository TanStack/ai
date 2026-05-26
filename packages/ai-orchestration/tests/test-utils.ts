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
