import type { InterruptRecord, InterruptStore } from './types'

export interface InterruptController {
  resolve: (interruptId: string, response?: unknown) => Promise<void>
  cancel: (interruptId: string) => Promise<void>
  request: (
    record: Omit<InterruptRecord, 'status' | 'resolvedAt'>,
  ) => Promise<void>
  listPending: (threadId: string) => Promise<Array<InterruptRecord>>
  listPendingByRun: (runId: string) => Promise<Array<InterruptRecord>>
}

export function createInterruptController(opts: {
  store: InterruptStore
}): InterruptController {
  const { store } = opts
  return {
    resolve: (interruptId, response) => store.resolve(interruptId, response),
    cancel: (interruptId) => store.cancel(interruptId),
    request: (record) =>
      store.create({
        ...record,
        status: 'pending',
      }),
    listPending: (threadId) => store.listPending(threadId),
    listPendingByRun: (runId) => store.listPendingByRun(runId),
  }
}
