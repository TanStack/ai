import type { ApprovalRecord, ApprovalStore, InterruptStore } from './types'

/** @deprecated Use InterruptController. */
export interface ApprovalController {
  resolve: (approvalId: string, granted: boolean) => Promise<void>
  request: (
    record: Omit<ApprovalRecord, 'status' | 'resolvedAt'>,
  ) => Promise<void>
  decisionsForThread: (threadId: string) => Promise<Map<string, boolean>>
}

/** @deprecated Use createInterruptController. */
export function createApprovalController(opts: {
  store: InterruptStore
}): ApprovalController
/** @deprecated Use createInterruptController. */
export function createApprovalController(opts: {
  store: ApprovalStore
}): ApprovalController
export function createApprovalController(opts: {
  store: ApprovalStore | InterruptStore
}): ApprovalController {
  const { store } = opts
  if ('decisionsForThread' in store) {
    return {
      resolve: (approvalId, granted) => store.resolve(approvalId, granted),
      request: (record) =>
        store.create({
          ...record,
          status: 'pending',
        }),
      decisionsForThread: (threadId) => store.decisionsForThread(threadId),
    }
  }

  return {
    async resolve(approvalId, granted) {
      if (granted) {
        await store.resolve(approvalId, { granted: true })
      } else {
        await store.cancel(approvalId)
      }
    },
    async request(record) {
      await store.create({
        interruptId: record.approvalId,
        runId: record.runId,
        threadId: record.threadId,
        status: 'pending',
        requestedAt: record.requestedAt,
        payload: {
          ...record.payload,
          approvalId: record.approvalId,
          compatibility: 'approval',
        },
      })
    },
    async decisionsForThread(threadId) {
      const decisions = new Map<string, boolean>()
      for (const record of await store.list(threadId)) {
        if (record.payload.compatibility !== 'approval') continue
        if (record.status === 'resolved') {
          decisions.set(record.interruptId, true)
        } else if (record.status === 'cancelled') {
          decisions.set(record.interruptId, false)
        }
      }
      return decisions
    },
  }
}
