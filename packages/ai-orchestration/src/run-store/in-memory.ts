import {
  LogConflictError as CoreLogConflictError,
  inMemoryRunStore as workflowCoreInMemoryRunStore,
} from '@tanstack/workflow-core'
import { LogConflictError } from '../types'
import {
  stepRecordToWorkflowEvent,
  workflowEventToStepRecord,
  workflowEventsToStepRecords,
} from './compat-events'
import type {
  DeleteReason as CoreDeleteReason,
  InMemoryRunStoreOptions,
  InMemoryRunStore as WorkflowCoreInMemoryRunStore,
} from '@tanstack/workflow-core'
import type {
  DeleteReason as LegacyDeleteReason,
  LiveRun,
  StepRecord,
} from '../types'

export type { InMemoryRunStoreOptions }

export interface InMemoryRunStore extends WorkflowCoreInMemoryRunStore {
  appendStep: (
    runId: string,
    expectedNextIndex: number,
    record: StepRecord,
  ) => Promise<void>
  getSteps: (runId: string) => Promise<ReadonlyArray<StepRecord>>
  getLive: (runId: string) => LiveRun | undefined
  setLive: (runId: string, live: LiveRun) => void
}

export function inMemoryRunStore(
  options: InMemoryRunStoreOptions = {},
): InMemoryRunStore {
  const store = workflowCoreInMemoryRunStore(options)
  const liveRuns = new Map<string, LiveRun>()

  return {
    ...store,
    async appendStep(runId, expectedNextIndex, record) {
      try {
        await store.appendEvent(
          runId,
          expectedNextIndex,
          stepRecordToWorkflowEvent({ ...record, index: expectedNextIndex }),
        )
      } catch (err) {
        if (err instanceof CoreLogConflictError) {
          throw new LogConflictError(
            err.runId,
            err.attemptedIndex,
            err.existing ? workflowEventToStepRecord(err.existing) : undefined,
          )
        }
        throw err
      }
    },
    async deleteRun(runId, reason: CoreDeleteReason | LegacyDeleteReason) {
      const live = liveRuns.get(runId)
      if (live) {
        live.abortController.abort()
        live.approvalResolver?.({
          approvalId:
            live.runState.pendingApproval?.approvalId ??
            live.pendingApprovalStepId ??
            'aborted',
          approved: false,
        })
        liveRuns.delete(runId)
      }
      const coreReason: CoreDeleteReason =
        reason === 'error' ? 'errored' : reason
      await store.deleteRun(runId, coreReason)
    },
    async getSteps(runId) {
      const events = await store.getEvents(runId)
      return workflowEventsToStepRecords(events)
    },
    getLive(runId) {
      return liveRuns.get(runId)
    },
    setLive(runId, live) {
      liveRuns.set(runId, live)
    },
  }
}
