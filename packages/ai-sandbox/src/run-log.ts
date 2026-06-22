/**
 * Resumable run event-log — the primitive that lets a trigger (e.g. a
 * Cloudflare Worker) start an agent run and return immediately while a durable
 * orchestrator (e.g. a Durable Object) drives the run and persists every
 * emitted {@link StreamChunk} under a monotonic `seq`.
 *
 * Clients tail the log from a cursor (`fromSeq`), so a dropped connection, a new
 * browser tab, or an orchestrator that hibernated between chunks all reconnect
 * cleanly: replay everything after the client's last-seen `seq`, then live-tail
 * until the run reaches a terminal status. The *run* never depends on any single
 * connection staying open — that is what makes the serverless/edge model work.
 *
 * This module is transport- and storage-agnostic. {@link InMemoryRunEventLog} is
 * the default (single-process / tests); a durable backend (DO storage, KV, SQL)
 * implements the same {@link RunEventLog} interface — see the Cloudflare example.
 */
import type { StreamChunk } from '@tanstack/ai'

/** Lifecycle status of a run. `done`/`error`/`aborted` are terminal. */
export type RunStatus = 'pending' | 'running' | 'done' | 'error' | 'aborted'

const TERMINAL: ReadonlySet<RunStatus> = new Set<RunStatus>([
  'done',
  'error',
  'aborted',
])

/** Whether a run status is terminal (no further events will be appended). */
export function isTerminalRunStatus(status: RunStatus): boolean {
  return TERMINAL.has(status)
}

export interface RunError {
  message: string
  code?: string
}

/** Durable bookkeeping for a single run. */
export interface RunRecord {
  runId: string
  threadId?: string
  status: RunStatus
  /** Seq of the last appended event, or `-1` when no events yet. */
  lastSeq: number
  error?: RunError
  createdAt: number
  updatedAt: number
}

/** One persisted event: a chunk plus its monotonic, gap-free sequence number. */
export interface RunEvent {
  seq: number
  chunk: StreamChunk
}

export interface RunEventLogReadOptions {
  /**
   * Exclusive cursor: only events with `seq > fromSeq` are yielded. Pass the
   * client's last-seen `seq` to resume; omit (or `-1`) to replay from the start.
   */
  fromSeq?: number
  /** Stop tailing when this fires (e.g. the client disconnected). */
  signal?: AbortSignal
}

/**
 * Append-only, `seq`-indexed log of a run's stream, with resumable reads.
 *
 * Contract:
 * - `append` assigns the next `seq` (0, 1, 2, …) and returns it.
 * - `read` yields the backlog after `fromSeq` in order, then live-tails new
 *   events, and RETURNS once the run is terminal and the cursor has caught up.
 * - All methods reject for an unknown `runId` except `get`, which resolves null.
 */
export interface RunEventLog {
  /** Idempotently create (or return) the run record. */
  open: (input: { runId: string; threadId?: string }) => Promise<RunRecord>
  /** Append one chunk; resolves with its assigned `seq`. */
  append: (runId: string, chunk: StreamChunk) => Promise<number>
  /** Move the run to a terminal status. Idempotent for the same status. */
  finish: (
    runId: string,
    status: 'done' | 'error' | 'aborted',
    error?: RunError,
  ) => Promise<void>
  /** Current record, or null if the run is unknown. */
  get: (runId: string) => Promise<RunRecord | null>
  /** Replay-then-tail events with `seq > fromSeq` until the run is terminal. */
  read: (
    runId: string,
    options?: RunEventLogReadOptions,
  ) => AsyncIterable<RunEvent>
}

/** Per-run state for the in-memory log. */
interface RunState {
  record: RunRecord
  chunks: Array<StreamChunk>
  /** Resolved (and cleared) whenever an event is appended or status changes. */
  waiters: Set<() => void>
}

/**
 * Single-process {@link RunEventLog}. Backs `read`'s live-tail with an internal
 * waiter set: `append`/`finish` wake every blocked reader. Suitable for a
 * long-running Node host, tests, and as the reference implementation a durable
 * backend mirrors.
 */
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

  // Mutators return a Promise without `async` so contract violations REJECT
  // (rather than throwing synchronously from a Promise-typed method — a
  // `.catch()` footgun) without an `await`-less async body.
  open(input: { runId: string; threadId?: string }): Promise<RunRecord> {
    const existing = this.runs.get(input.runId)
    if (existing) return Promise.resolve({ ...existing.record })
    const now = this.now()
    const record: RunRecord = {
      runId: input.runId,
      ...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
      status: 'running',
      lastSeq: -1,
      createdAt: now,
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
    const seq = state.chunks.length
    state.chunks.push(chunk)
    state.record.lastSeq = seq
    state.record.updatedAt = this.now()
    this.wake(state)
    return Promise.resolve(seq)
  }

  finish(
    runId: string,
    status: 'done' | 'error' | 'aborted',
    error?: RunError,
  ): Promise<void> {
    const state = this.runs.get(runId)
    if (!state) {
      return Promise.reject(new Error(`run-log: unknown runId "${runId}"`))
    }
    if (isTerminalRunStatus(state.record.status)) return Promise.resolve()
    state.record.status = status
    if (error !== undefined) state.record.error = error
    state.record.updatedAt = this.now()
    this.wake(state)
    return Promise.resolve()
  }

  get(runId: string): Promise<RunRecord | null> {
    const state = this.runs.get(runId)
    return Promise.resolve(state ? { ...state.record } : null)
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
