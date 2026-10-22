import type {
  InterruptCommitEntry,
  InterruptRecord,
  InterruptStore,
  RunRecord,
  RunStore,
} from '@tanstack/ai-persistence'
import type { LogWriter } from './log'
import type { ClearableRunField, RunPatch } from './log-records'

/** What the stores need of a session's view of its log. */
type LogView = Pick<LogWriter, 'state' | 'append'>

// The fields that a `RunStore.update` can remove, with `undefined`. A record
// keyed by the union: a new field of `update` is a compile error here.
const CLEARABLE: Record<ClearableRunField, true> = {
  finishedAt: true,
  error: true,
  usage: true,
  sandboxKey: true,
  detachedSince: true,
  cancelRequested: true,
  driverEpoch: true,
  result: true,
  artifacts: true,
  leaseOwner: true,
  leaseExpiresAt: true,
  checkpoint: true,
}

const isClearable = (field: string): field is ClearableRunField =>
  Object.hasOwn(CLEARABLE, field)

/** The fields that `patch` sets to `undefined`, so the change removes them. */
function clearedFields(patch: RunPatch) {
  return Object.keys(patch)
    .filter(isClearable)
    .filter((field) => patch[field] === undefined)
}

const byStartedAt = (a: RunRecord, b: RunRecord) => a.startedAt - b.startedAt
const byRequestedAt = (a: InterruptRecord, b: InterruptRecord) =>
  a.requestedAt - b.requestedAt

/**
 * The newest run of `threadId` that is `'running'`, or `null`. "Newest" is
 * the greatest `startedAt`, as `RunStore.findActiveRun` says.
 */
export function activeRunIn(
  runs: ReadonlyMap<string, RunRecord>,
  threadId: string,
) {
  let active: RunRecord | null = null
  for (const run of runs.values()) {
    if (run.threadId !== threadId || run.status !== 'running') continue
    if (active === null || run.startedAt > active.startedAt) active = run
  }
  return active
}

/**
 * The `RunStore` and the `InterruptStore` of a session, on its log. Core
 * `withPersistence` and the checkpoints take them. Each write is a log
 * record that the session's writer appends, with its ownership epoch. Each
 * read comes from the fold of the session, so a new host that folds the log
 * has every run and interrupt, with no other store.
 *
 * The records keep the thread id of the app. The log id has the tenant
 * already, so one run id in two tenants is two runs.
 *
 * @example
 * ```ts
 * const { runs, interrupts } = logChatStores(writer)
 * withPersistence({ stores: { messages, runs, interrupts } })
 * ```
 */
export function logChatStores(writer: LogView) {
  const runsOf = () => writer.state.thread.runs
  const interruptsOf = () => writer.state.thread.interrupts
  const listRuns = (keep: (run: RunRecord) => boolean) =>
    Promise.resolve([...runsOf().values()].filter(keep).sort(byStartedAt))
  const listInterrupts = (keep: (record: InterruptRecord) => boolean) =>
    Promise.resolve(
      [...interruptsOf().values()].filter(keep).sort(byRequestedAt),
    )

  const runs: RunStore = {
    createOrResume: async (input) => {
      const known = runsOf().get(input.runId)
      if (known) return known
      const { status, ...fields } = input
      const run: RunRecord = { ...fields, status: status ?? 'running' }
      await writer.append([{ type: 'harness.run', run }])
      // A closed view writes nothing, so the fold can be without it.
      return runsOf().get(input.runId) ?? run
    },
    update: async (runId, patch) => {
      if (!runsOf().has(runId)) return
      const unset = clearedFields(patch)
      await writer.append([
        {
          type: 'harness.run.update',
          runId,
          patch,
          ...(unset.length > 0 ? { unset } : {}),
        },
      ])
    },
    get: (runId) => Promise.resolve(runsOf().get(runId) ?? null),
    findActiveRun: (threadId) =>
      Promise.resolve(activeRunIn(runsOf(), threadId)),
    listByThread: (threadId) => listRuns((run) => run.threadId === threadId),
    listByParentRun: (parentRunId) =>
      listRuns((run) => run.parentRunId === parentRunId),
  }

  /** Append the ends of known interrupts. An unknown id writes nothing. */
  const end = async (entries: ReadonlyArray<InterruptCommitEntry>) => {
    const at = Date.now()
    const known = entries.filter((entry) =>
      interruptsOf().has(entry.interruptId),
    )
    if (known.length === 0) return
    await writer.append(
      known.map((entry) => ({
        type: 'harness.interrupt.end',
        at,
        ...entry,
      })),
    )
  }

  const interrupts: InterruptStore = {
    create: async (record) => {
      if (interruptsOf().has(record.interruptId)) return
      await writer.append([{ type: 'harness.interrupt', interrupt: record }])
    },
    resolve: (interruptId, response) =>
      end([{ interruptId, status: 'resolved', response }]),
    cancel: (interruptId) => end([{ interruptId, status: 'cancelled' }]),
    // One append, so every entry lands or none does.
    commitBatch: async (entries) => {
      const seen = new Set<string>()
      for (const { interruptId } of entries) {
        if (seen.has(interruptId)) {
          throw new Error(`Interrupt batch has the id ${interruptId} twice.`)
        }
        seen.add(interruptId)
        const status = interruptsOf().get(interruptId)?.status
        if (status !== 'pending') {
          throw new Error(
            `Interrupt batch names ${interruptId}, which is ${status ?? 'not known'}, not pending.`,
          )
        }
      }
      await end(entries)
    },
    get: (interruptId) =>
      Promise.resolve(interruptsOf().get(interruptId) ?? null),
    list: (threadId) =>
      listInterrupts((record) => record.threadId === threadId),
    listPending: (threadId) =>
      listInterrupts(
        (record) => record.threadId === threadId && record.status === 'pending',
      ),
    listByRun: (runId) => listInterrupts((record) => record.runId === runId),
    listPendingByRun: (runId) =>
      listInterrupts(
        (record) => record.runId === runId && record.status === 'pending',
      ),
  }
  return { runs, interrupts }
}
