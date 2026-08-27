import { createCapability } from './capabilities'
import type { TokenUsage } from '../../../types'

/** A terminal run status: no further events will be appended. */
export type TerminalRunStatus = 'completed' | 'failed' | 'aborted'

export type RunStatus = 'running' | 'interrupted' | TerminalRunStatus

const TERMINAL: Record<TerminalRunStatus, true> = {
  completed: true,
  failed: true,
  aborted: true,
}

// Same exhaustiveness trick over the FULL union, for {@link isRunStatus}.
const ALL_STATUSES: Record<RunStatus, true> = {
  running: true,
  interrupted: true,
  completed: true,
  failed: true,
  aborted: true,
}

export function isRunStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && Object.hasOwn(ALL_STATUSES, value)
}

export function isTerminalRunStatus(
  status: RunStatus,
): status is TerminalRunStatus {
  return Object.hasOwn(TERMINAL, status)
}

export interface RunError {
  message: string
  /** Stable, machine-branchable classification, when the provider supplies one. */
  code?: string
}

/** Durable bookkeeping for a single run. */
export interface RunRecord {
  runId: string
  threadId: string
  status: RunStatus
  startedAt: number
  finishedAt?: number
  error?: RunError
  usage?: TokenUsage
  sandboxKey?: string
  detachedSince?: number
  cancelRequested?: boolean
  driverEpoch?: number
}

export interface RunStore {
  createOrResume: (
    input: Pick<RunRecord, 'runId' | 'threadId' | 'startedAt'> & {
      status?: RunStatus
    },
  ) => Promise<RunRecord>
  update: (
    runId: string,
    patch: Partial<
      Pick<
        RunRecord,
        | 'status'
        | 'finishedAt'
        | 'error'
        | 'usage'
        | 'sandboxKey'
        | 'detachedSince'
        | 'cancelRequested'
        | 'driverEpoch'
      >
    >,
  ) => Promise<void>
  /** Current record, or null when unknown. */
  get: (runId: string) => Promise<RunRecord | null>
  listByThread?: (threadId: string) => Promise<Array<RunRecord>>
  listReclaimable?: (opts: {
    now: number
    ttlMs: number
  }) => Promise<Array<RunRecord>>
  findActiveRun: (threadId: string) => Promise<RunRecord | null>
}

export function defineRunStore<const T extends RunStore>(store: T): T {
  return store
}

export const DetachableRunCapability =
  createCapability<true>()('detachable-run')

export const [getDetachableRun, provideDetachableRun] = DetachableRunCapability

export const RunDetachedCapability = createCapability<true>()('run-detached')

export const [getRunDetached, provideRunDetached] = RunDetachedCapability

/** In-memory {@link RunStore}. Single process only. */
export class InMemoryRunStore implements RunStore {
  private readonly runs = new Map<string, RunRecord>()

  createOrResume(
    input: Pick<RunRecord, 'runId' | 'threadId' | 'startedAt'> & {
      status?: RunStatus
    },
  ): Promise<RunRecord> {
    const existing = this.runs.get(input.runId)
    if (existing) return Promise.resolve(existing)
    const record: RunRecord = {
      runId: input.runId,
      threadId: input.threadId,
      status: input.status ?? 'running',
      startedAt: input.startedAt,
    }
    this.runs.set(record.runId, record)
    return Promise.resolve(record)
  }

  update(
    runId: string,
    patch: Partial<
      Pick<
        RunRecord,
        | 'status'
        | 'finishedAt'
        | 'error'
        | 'usage'
        | 'sandboxKey'
        | 'detachedSince'
        | 'cancelRequested'
        | 'driverEpoch'
      >
    >,
  ): Promise<void> {
    const existing = this.runs.get(runId)
    if (existing) this.runs.set(runId, { ...existing, ...patch })
    return Promise.resolve()
  }

  get(runId: string): Promise<RunRecord | null> {
    return Promise.resolve(this.runs.get(runId) ?? null)
  }

  listByThread(threadId: string): Promise<Array<RunRecord>> {
    const matching = [...this.runs.values()]
      .filter((run) => run.threadId === threadId)
      .sort((a, b) => a.startedAt - b.startedAt)
    return Promise.resolve(matching)
  }

  listReclaimable(opts: {
    now: number
    ttlMs: number
  }): Promise<Array<RunRecord>> {
    const cutoff = opts.now - opts.ttlMs
    const matching = [...this.runs.values()].filter(
      (run) =>
        run.status === 'running' &&
        run.detachedSince !== undefined &&
        run.detachedSince <= cutoff,
    )
    return Promise.resolve(matching)
  }

  findActiveRun(threadId: string): Promise<RunRecord | null> {
    let active: RunRecord | null = null
    const runs = this.runs.values()
    for (const run of runs) {
      const shouldSkipRun =
        run.threadId !== threadId || run.status !== 'running'
      if (shouldSkipRun) continue
      const isInvalidActive =
        active === null || run.startedAt > active.startedAt
      if (isInvalidActive) active = run
    }
    return Promise.resolve(active)
  }
}
