import { cloneAndDeepFreezeJson } from '@tanstack/ai'
import type {
  CommitInterruptResolutionsInput,
  Interrupt,
  InterruptRecoveryQuery,
  InterruptRecoveryStateV1,
  OpenInterruptBatchInput,
} from '@tanstack/ai'
import type {
  InterruptBatchRecord,
  InterruptRecord,
  InterruptStore,
} from './types'

export class InterruptStoreCorruptionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'InterruptStoreCorruptionError'
  }
}

export function hasExactInterruptIds(
  expected: ReadonlyArray<string>,
  actual: ReadonlyArray<string>,
): boolean {
  const left = [...new Set(expected)].sort()
  const right = [...new Set(actual)].sort()
  return (
    left.length === expected.length &&
    right.length === actual.length &&
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  )
}

export function projectInterruptRecovery(input: {
  query: InterruptRecoveryQuery
  rows: ReadonlyArray<InterruptRecord>
  batch: InterruptBatchRecord | null
  now: number
  includeResolutions: boolean
}): InterruptRecoveryStateV1 {
  const correlation = {
    schemaVersion: 1 as const,
    threadId: input.query.threadId,
    interruptedRunId: input.query.interruptedRunId,
    generation:
      input.batch?.generation ??
      input.rows[0]?.generation ??
      input.query.knownGeneration,
    pendingInterrupts: [] as ReadonlyArray<Interrupt>,
  }

  if (input.batch) {
    return cloneAndDeepFreezeJson({
      ...correlation,
      state: 'committed',
      committed: {
        fingerprint: input.batch.fingerprint,
        ...(input.includeResolutions && {
          resolutions: input.batch.resolutions,
        }),
        continuationRunId: input.batch.continuationRunId,
        committedAt: new Date(input.batch.committedAt).toISOString(),
      },
    })
  }
  if (input.rows.length === 0) {
    return cloneAndDeepFreezeJson({ ...correlation, state: 'missing' })
  }

  const pending = input.rows.filter((row) => row.status === 'pending')
  if (pending.length > 0) {
    const expired = pending.some(
      (row) =>
        row.binding.expiresAt !== undefined &&
        Date.parse(row.binding.expiresAt) <= input.now,
    )
    return cloneAndDeepFreezeJson({
      ...correlation,
      state: expired ? 'expired' : 'pending',
      pendingInterrupts: expired
        ? []
        : pending.map((row) => row.payload as Interrupt),
    })
  }

  return cloneAndDeepFreezeJson({
    ...correlation,
    state: 'legacy-committed',
  })
}

export interface InterruptController {
  openInterruptBatch: InterruptStore['openInterruptBatch']
  commitInterruptResolutions: InterruptStore['commitInterruptResolutions']
  getInterruptRecoveryState: InterruptStore['getInterruptRecoveryState']
  listPending: InterruptStore['listPending']
  listPendingByRun: InterruptStore['listPendingByRun']
}

export function createInterruptController(opts: {
  store: InterruptStore
}): InterruptController {
  const { store } = opts
  return {
    openInterruptBatch: (input: OpenInterruptBatchInput) =>
      store.openInterruptBatch(input),
    commitInterruptResolutions: (input: CommitInterruptResolutionsInput) =>
      store.commitInterruptResolutions(input),
    getInterruptRecoveryState: (input: InterruptRecoveryQuery) =>
      store.getInterruptRecoveryState(input),
    listPending: (threadId) => store.listPending(threadId),
    listPendingByRun: (runId) => store.listPendingByRun(runId),
  }
}
