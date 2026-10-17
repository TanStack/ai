import { logIdOf, parseLogId } from './log'
import type {
  InterruptStore,
  MessageStore,
  RunStore,
} from '@tanstack/ai-persistence'

/** The stores that `withPersistence` keys by the thread id of `chat()`. */
interface ChatThreadStores {
  messages?: MessageStore
  runs?: RunStore
  interrupts?: InterruptStore
}

/**
 * `stores` in the tenant `tenantId`. `withPersistence`, the checkpoints, and
 * the session read and write these stores with the thread id of the app,
 * which is also the thread id on the events. Here each thread id becomes its
 * store key, `logIdOf({ tenantId, logId: threadId })`, and each record that
 * comes back has the thread id of the app again. A record of another tenant
 * reads as not found. So one thread id in two tenants is two threads.
 *
 * Only the stores in `stores` come back.
 */
export function tenantStores(
  stores: ChatThreadStores,
  tenantId: string | undefined,
) {
  const { messages, runs, interrupts } = stores
  const keyOf = (threadId: string) => logIdOf({ tenantId, logId: threadId })
  /** `record` with the thread id of the app, or `null` in another tenant. */
  const own = <T extends { threadId: string }>(record: T | null) => {
    if (record === null) return null
    const key = parseLogId(record.threadId)
    return key.tenantId === tenantId ? { ...record, threadId: key.logId } : null
  }
  const ownAll = <T extends { threadId: string }>(
    records: ReadonlyArray<T> | undefined,
  ) => (records ?? []).flatMap((record) => own(record) ?? [])

  const messageView: MessageStore | undefined = messages && {
    loadThread: (threadId: string) => messages.loadThread(keyOf(threadId)),
    saveThread: (threadId, list) => messages.saveThread(keyOf(threadId), list),
  }
  const runView: RunStore | undefined = runs && {
    createOrResume: async (input) => {
      const record = own(
        await runs.createOrResume({
          ...input,
          threadId: keyOf(input.threadId),
        }),
      )
      // A run id is one key for all tenants: a run of another tenant does
      // not go on here.
      if (!record) throw new Error(`Run ${input.runId} is in another tenant.`)
      return record
    },
    update: (runId, patch) => runs.update(runId, patch),
    get: async (runId) => own(await runs.get(runId)),
    findActiveRun: async (threadId) =>
      own(await runs.findActiveRun(keyOf(threadId))),
    listByThread:
      runs.listByThread &&
      (async (threadId) => ownAll(await runs.listByThread?.(keyOf(threadId)))),
    listByParentRun:
      runs.listByParentRun &&
      (async (parentRunId) =>
        ownAll(await runs.listByParentRun?.(parentRunId))),
    listReclaimable:
      runs.listReclaimable &&
      (async (options) => ownAll(await runs.listReclaimable?.(options))),
  }
  const interruptView: InterruptStore | undefined = interrupts && {
    create: (record) =>
      interrupts.create({ ...record, threadId: keyOf(record.threadId) }),
    resolve: (interruptId, response) =>
      interrupts.resolve(interruptId, response),
    cancel: (interruptId) => interrupts.cancel(interruptId),
    commitBatch:
      interrupts.commitBatch &&
      (async (entries) => {
        await interrupts.commitBatch?.(entries)
      }),
    get: async (interruptId) => own(await interrupts.get(interruptId)),
    list: async (threadId) => ownAll(await interrupts.list(keyOf(threadId))),
    listPending: async (threadId) =>
      ownAll(await interrupts.listPending(keyOf(threadId))),
    listByRun: async (runId) => ownAll(await interrupts.listByRun(runId)),
    listPendingByRun: async (runId) =>
      ownAll(await interrupts.listPendingByRun(runId)),
  }
  const view: ChatThreadStores = {
    ...(messageView && { messages: messageView }),
    ...(runView && { runs: runView }),
    ...(interruptView && { interrupts: interruptView }),
  }
  return view
}
