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
 * implements the same {@link RunEventLog} interface — see
 * {@link DurableObjectRunEventLog} in `./run-log-do`.
 *
 * ---
 *
 * CONVERGED VOCABULARY (v1) + LIVE-DATA MIGRATION:
 *
 * This module used to keep a legacy vocabulary distinct from core's
 * (`TerminalRunStatus = 'done' | 'error' | 'aborted'`, a `RunRecord` with
 * `lastSeq`/`createdAt`/`updatedAt` and an optional `threadId`), deferred
 * because adopting core's shape meant migrating the Durable Object's persisted
 * record layout. That migration is now done: run statuses, `RunError`, and the
 * record's lifecycle fields come from `@tanstack/ai` (`'completed' | 'failed'
 * | 'aborted'` terminal set, `startedAt`/`finishedAt`, required `threadId`),
 * and {@link RunLogRecord} is core's {@link RunRecord} plus the two fields only
 * an event log needs: the `lastSeq` cursor and the `updatedAt` activity clock.
 *
 * Records persisted under the legacy layout are migrated **in place, on first
 * read**, by {@link migrateStoredRunRecord}:
 *
 * - `status` `'done'` → `'completed'`, `'error'` → `'failed'`
 *   (`'running'`/`'aborted'` are unchanged);
 * - `createdAt` → `startedAt`; a terminal record gains
 *   `finishedAt = updatedAt` (the closest stored approximation);
 * - a record persisted without `threadId` gets `threadId = runId`. The log
 *   performs no thread-scoped queries, so this self-reference can never leak
 *   into thread history; it exists only to satisfy the converged shape.
 *
 * `DurableObjectRunEventLog` writes the migrated record back on the read that
 * migrated it, so each record pays the conversion exactly once. The migration
 * is client-visible where the record is: `GET /runs/:id` and the WebSocket
 * terminal `status` frame now carry core's status strings and field names.
 */
import { isTerminalRunStatus } from '@tanstack/ai'
import type {
  RunError,
  RunRecord,
  RunStore,
  StreamChunk,
  TerminalRunStatus,
} from '@tanstack/ai'

/**
 * The mutable-field patch a {@link RunStore.update} accepts, reused verbatim so
 * the log can back a `RunStore` without restating (and drifting from) the pick.
 */
export type RunRecordPatch = Parameters<RunStore['update']>[1]

/**
 * Durable bookkeeping for one run in the event log: core's {@link RunRecord}
 * plus the two fields only an event log needs.
 */
export interface RunLogRecord extends RunRecord {
  /** Seq of the last appended event, or `-1` when no events yet. */
  lastSeq: number
  /**
   * Epoch ms of the last append or status change — the activity clock a stall
   * watchdog reads. Distinct from `finishedAt`, which is set once, at terminal.
   */
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
 * - Unknown-run behavior is method-specific: `append`/`finish`/`read` reject,
 *   `get` resolves null, and `update` is a no-op.
 */
export interface RunEventLog {
  /**
   * Idempotently create (or return) the run record. An existing record is
   * returned unchanged; `startedAt` (default `Date.now()`) applies only on
   * first creation — matching core's `RunStore.createOrResume` invariant, which
   * `runLogStore` maps directly onto this method.
   */
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
  /**
   * Patch the record's mutable fields ({@link RunRecordPatch}). Unknown and
   * already-terminal runs are NO-OPs (never a throw, never a create), preserving
   * the first terminal status against late driver updates.
   *
   * MUST wake blocked readers, exactly like `append`/`finish`: the record and
   * the event log share one status field here, so a driver that terminalizes
   * through its `RunStore` — core's `pipeToRunLog` writes its terminal status
   * via `runs.update`, not `finish` — is ending the log with this call.
   */
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

/**
 * The record layout this log persisted before converging on core's run
 * vocabulary. Never constructed by current code — it exists so
 * {@link migrateStoredRunRecord} can name what it reads out of old storage.
 */
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

/**
 * Convert a stored record to the converged {@link RunLogRecord} layout.
 *
 * Total over both layouts: a converged record passes through unchanged
 * (`migrated: false`), a legacy one is mapped as documented in the module
 * header (`migrated: true`) so a durable backend can write the result back and
 * pay the conversion exactly once.
 */
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
    // Derive seq from the record's cursor (not `chunks.length`) so the gap-free
    // invariant holds the same way the durable backend computes it, even if the
    // backlog is ever trimmed/compacted.
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

  touch(runId: string): Promise<void> {
    const state = this.runs.get(runId)
    if (!state || isTerminalRunStatus(state.record.status)) {
      return Promise.resolve()
    }
    state.record.updatedAt = this.now()
    return Promise.resolve()
  }

  finishIfStale(
    runId: string,
    cutoff: number,
    chunk: Extract<StreamChunk, { type: 'RUN_ERROR' }>,
  ): Promise<boolean> {
    const state = this.runs.get(runId)
    if (
      !state ||
      isTerminalRunStatus(state.record.status) ||
      state.record.updatedAt >= cutoff
    ) {
      return Promise.resolve(false)
    }

    const now = this.now()
    const seq = state.record.lastSeq + 1
    state.chunks.push(chunk)
    state.record.lastSeq = seq
    state.record.status = 'failed'
    state.record.error = {
      message: chunk.message,
      ...(chunk.code !== undefined ? { code: chunk.code } : {}),
    }
    state.record.finishedAt = now
    state.record.updatedAt = now
    this.wake(state)
    return Promise.resolve(true)
  }

  update(runId: string, patch: RunRecordPatch): Promise<void> {
    const state = this.runs.get(runId)
    if (!state || isTerminalRunStatus(state.record.status)) {
      return Promise.resolve()
    }
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
