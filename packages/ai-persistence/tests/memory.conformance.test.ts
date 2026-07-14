import {
  runInterruptStoreConformance,
  runPersistenceConformance,
  type InterruptConformanceHarness,
} from '../src/testkit/conformance'
import { memoryPersistence } from '../src/memory'
import type { InterruptStore } from '../src/types'

runPersistenceConformance('memory', () => memoryPersistence())

runInterruptStoreConformance(async (): Promise<InterruptConformanceHarness> => {
  let now = Date.parse('2026-07-13T10:00:00.000Z')
  let failNextTransition = false
  const persistence = memoryPersistence({ clock: () => now })
  const base = persistence.stores.interrupts
  const store: InterruptStore = {
    create: (record) => base.create(record),
    resolve: (interruptId, response) => base.resolve(interruptId, response),
    cancel: (interruptId) => base.cancel(interruptId),
    get: (interruptId) => base.get(interruptId),
    list: (threadId) => base.list(threadId),
    listPending: (threadId) => base.listPending(threadId),
    listByRun: (runId) => base.listByRun(runId),
    listPendingByRun: (runId) => base.listPendingByRun(runId),
    openInterruptBatch: (input) => base.openInterruptBatch(input),
    commitInterruptResolutions: (input) => {
      if (failNextTransition) {
        failNextTransition = false
        return Promise.reject(new Error('Injected transition failure'))
      }
      return base.commitInterruptResolutions(input)
    },
    getInterruptRecoveryState: (input) => base.getInterruptRecoveryState(input),
  }

  return {
    getStore: () => store,
    advanceBy: (milliseconds) => {
      now += milliseconds
    },
    inspect: async (interruptedRunId) => {
      const rows = await base.listByRun(interruptedRunId)
      const recovery = await base.getInterruptRecoveryState({
        threadId: rows[0]?.threadId ?? 'thread-cas',
        interruptedRunId,
        knownGeneration: rows[0]?.generation ?? 1,
      })
      return {
        statuses: rows.map((row) => row.status).sort(),
        batchCount: recovery.state === 'committed' ? 1 : 0,
      }
    },
    failTransitionOnce: () => {
      failNextTransition = true
    },
  }
})
