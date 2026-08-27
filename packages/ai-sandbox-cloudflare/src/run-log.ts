import { isTerminalRunStatus } from '@tanstack/ai'
import type {
  RunError,
  RunRecord,
  RunStore,
  StreamChunk,
  TerminalRunStatus,
} from '@tanstack/ai'

export type RunRecordPatch = Parameters<RunStore['update']>[1]

export interface RunLogRecord extends RunRecord {
  /** Seq of the last appended event, or `-1` when no events yet. */
  lastSeq: number
  updatedAt: number
}

/** One persisted event: a chunk plus its monotonic, gap-free sequence number. */
export interface RunEvent {
  seq: number
  chunk: StreamChunk
}

export interface RunEventLogReadOptions {
  fromSeq?: number
  /** Stop tailing when this fires (e.g. the client disconnected). */
  signal?: AbortSignal
}

export interface RunEventLog {
  open: (input: {
    runId: string
    threadId: string
    startedAt?: number
  }) => Promise<RunLogRecord>
  /** Append one chunk; resolves with its assigned `seq`. */
  append: (runId: string, chunk: StreamChunk) => Promise<number>
  /** Move the run to a terminal status. Idempotent for the same status. */
  finish: (
    runId: string,
    status: TerminalRunStatus,
    error?: RunError,
  ) => Promise<void>
  update: (runId: string, patch: RunRecordPatch) => Promise<void>
  /** Current record, or null if the run is unknown. */
  get: (runId: string) => Promise<RunLogRecord | null>
  /** Every run record this log holds. Backs `RunStore.findActiveRun`. */
  list: () => Promise<Array<RunLogRecord>>
  /** Replay-then-tail events with `seq > fromSeq` until the run is terminal. */
  read: (
    runId: string,
    options?: RunEventLogReadOptions,
  ) => AsyncIterable<RunEvent>
}

interface LegacyStoredRunRecord {
  runId: string
  threadId?: string
  status: 'running' | 'done' | 'error' | 'aborted'
  lastSeq: number
  error?: RunError
  createdAt: number
  updatedAt: number
}

const LEGACY_STATUS_MAP = {
  done: 'completed',
  error: 'failed',
} as const

function isLegacyStoredRunRecord(
  value: RunLogRecord | LegacyStoredRunRecord,
): value is LegacyStoredRunRecord {
  // `createdAt` is the discriminant: it exists on every legacy record and on no
  // converged one. Status alone would miss legacy `running`/`aborted` records.
  return 'createdAt' in value
}

export function migrateStoredRunRecord(
  stored: RunLogRecord | LegacyStoredRunRecord,
): { record: RunLogRecord; migrated: boolean } {
  if (!isLegacyStoredRunRecord(stored))
    return { record: stored, migrated: false }
  const status =
    stored.status === 'done' || stored.status === 'error'
      ? LEGACY_STATUS_MAP[stored.status]
      : stored.status
  const record: RunLogRecord = {
    runId: stored.runId,
    // See the module header: the log runs no thread-scoped queries, so a
    // legacy record without a thread gets a self-reference, never a fake one.
    threadId: stored.threadId ?? stored.runId,
    status,
    lastSeq: stored.lastSeq,
    startedAt: stored.createdAt,
    updatedAt: stored.updatedAt,
    ...(isTerminalRunStatus(status) ? { finishedAt: stored.updatedAt } : {}),
    ...(stored.error !== undefined ? { error: stored.error } : {}),
  }
  return { record, migrated: true }
}

/** Per-run state for the in-memory log. */
interface RunState {
  record: RunLogRecord
  chunks: Array<StreamChunk>
  /** Resolved (and cleared) whenever an event is appended or status changes. */
  waiters: Set<() => void>
}

export class InMemoryRunEventLog implements RunEventLog {
  private readonly runs = new Map<string, RunState>()

  private now(): number {
    return Date.now()
  }

  private require(runId: string): RunState {
    const state = this.runs.get(runId)
    if (!state) throw new Error(`run-log: unknown runId "${runId}"`)
    return state
  }

  private wake(state: RunState): void {
    const waiters = [...state.waiters]
    state.waiters.clear()
    for (const resolve of waiters) resolve()
  }

  open(input: {
    runId: string
    threadId: string
    startedAt?: number
  }): Promise<RunLogRecord> {
    const existing = this.runs.get(input.runId)
    if (existing) return Promise.resolve({ ...existing.record })
    const now = this.now()
    const record: RunLogRecord = {
      runId: input.runId,
      threadId: input.threadId,
      status: 'running',
      lastSeq: -1,
      startedAt: input.startedAt ?? now,
      updatedAt: now,
    }
    this.runs.set(input.runId, { record, chunks: [], waiters: new Set() })
    return Promise.resolve({ ...record })
  }

  append(runId: string, chunk: StreamChunk): Promise<number> {
    const state = this.runs.get(runId)
    if (!state) {
      return Promise.reject(new Error(`run-log: unknown runId "${runId}"`))
    }
    if (isTerminalRunStatus(state.record.status)) {
      return Promise.reject(
        new Error(
          `run-log: cannot append to terminal run "${runId}" (status=${state.record.status})`,
        ),
      )
    }
    const seq = state.record.lastSeq + 1
    state.chunks.push(chunk)
    state.record.lastSeq = seq
    state.record.updatedAt = this.now()
    this.wake(state)
    return Promise.resolve(seq)
  }

  finish(
    runId: string,
    status: TerminalRunStatus,
    error?: RunError,
  ): Promise<void> {
    const state = this.runs.get(runId)
    if (!state) {
      return Promise.reject(new Error(`run-log: unknown runId "${runId}"`))
    }
    if (isTerminalRunStatus(state.record.status)) return Promise.resolve()
    const now = this.now()
    state.record.status = status
    if (error !== undefined) state.record.error = error
    state.record.finishedAt = now
    state.record.updatedAt = now
    this.wake(state)
    return Promise.resolve()
  }

  update(runId: string, patch: RunRecordPatch): Promise<void> {
    const state = this.runs.get(runId)
    if (!state) return Promise.resolve() // unknown runId is a no-op
    state.record = { ...state.record, ...patch, updatedAt: this.now() }
    // A patch may terminalize the shared status field (core's driver writes its
    // terminal status through `RunStore.update`) — parked readers must see it.
    this.wake(state)
    return Promise.resolve()
  }

  get(runId: string): Promise<RunLogRecord | null> {
    const state = this.runs.get(runId)
    return Promise.resolve(state ? { ...state.record } : null)
  }

  list(): Promise<Array<RunLogRecord>> {
    return Promise.resolve(
      [...this.runs.values()].map((state) => ({ ...state.record })),
    )
  }

  async *read(
    runId: string,
    options?: RunEventLogReadOptions,
  ): AsyncIterable<RunEvent> {
    const state = this.require(runId)
    const signal = options?.signal
    let cursor = options?.fromSeq ?? -1
    while (!signal?.aborted) {
      while (cursor < state.record.lastSeq) {
        cursor += 1
        const chunk = state.chunks[cursor]
        if (chunk !== undefined) yield { seq: cursor, chunk }
      }
      if (isTerminalRunStatus(state.record.status)) return
      await this.waitForChange(state, signal)
    }
  }

  private waitForChange(state: RunState, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      const wake = (): void => {
        state.waiters.delete(wake)
        if (signal) signal.removeEventListener('abort', wake)
        resolve()
      }
      state.waiters.add(wake)
      if (signal) signal.addEventListener('abort', wake, { once: true })
    })
  }
}
