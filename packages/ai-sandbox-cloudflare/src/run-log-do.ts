/**
 * A durable {@link RunEventLog} backed by Durable Object storage — the storage
 * half of the serverless/edge run model. The coordinator appends every
 * {@link StreamChunk} the agent emits under a monotonic `seq`; clients tail from
 * a cursor. Because events are PERSISTED (not held in a caller's open stream), a
 * reconnecting tab, a dropped WebSocket, or a coordinator that hibernated
 * between chunks all resume cleanly: replay everything after the client's
 * `lastSeq`, then live-tail to terminal.
 *
 * Mirrors {@link InMemoryRunEventLog} exactly.
 * Storage layout (keys scoped by `runId` so one DO can host many runs):
 * - `rec:<runId>`        → the {@link RunLogRecord}
 * - `evt:<runId>:<seq8>` → the chunk for that seq (seq zero-padded to 8 digits
 *                          so `list({ prefix })` returns events in seq order).
 *
 * The live-tail wake-up (the in-memory waiter set) is per-INSTANCE; if the
 * instance is evicted mid-run, a reader re-reads the persisted backlog and the
 * `TAIL_POLL_MS` fallback poll keeps it progressing. No event is ever lost.
 *
 * NOTE: Workers-runtime code — compiles against `@cloudflare/workers-types`.
 */
import { isRunStatus, isTerminalRunStatus } from '@tanstack/ai'
import type {
  RunEvent,
  RunEventLog,
  RunEventLogReadOptions,
  RunLogRecord,
  RunRecordPatch,
} from './run-log'
import type { RunError, StreamChunk, TerminalRunStatus } from '@tanstack/ai'

/** How long a post-eviction reader waits before re-polling storage (ms). */
const TAIL_POLL_MS = 250

const recKey = (runId: string): string => `rec:${runId}`
const evtKey = (runId: string, seq: number): string =>
  `evt:${runId}:${String(seq).padStart(8, '0')}`
const evtPrefix = (runId: string): string => `evt:${runId}:`

/**
 * Reject a `rec:` value written in the 0.x layout (`done`/`error` statuses).
 * Read as-is it looks like a live run, and the stall watchdog would mark a
 * finished run failed.
 */
function checkRecord(
  key: string,
  value: RunLogRecord | undefined,
): RunLogRecord | null {
  if (!value) return null
  if (!isRunStatus(value.status)) {
    throw new Error(
      `run-log: ${key} uses the 0.x record layout (status "${String(value.status)}"). Clear old run records before upgrading to 1.0.`,
    )
  }
  return value
}

export class DurableObjectRunEventLog implements RunEventLog {
  /** Per-run wake-ups for live-tailing readers on THIS instance. */
  private readonly waiters = new Map<string, Set<() => void>>()

  constructor(private readonly storage: DurableObjectStorage) {}

  /** Read the record under `rec:<runId>`. */
  private async getRecord(runId: string): Promise<RunLogRecord | null> {
    return checkRecord(
      recKey(runId),
      await this.storage.get<RunLogRecord>(recKey(runId)),
    )
  }

  private async require(runId: string): Promise<RunLogRecord> {
    const record = await this.getRecord(runId)
    if (!record) throw new Error(`run-log: unknown runId "${runId}"`)
    return record
  }

  /** Wake (and clear) every reader blocked on this run. */
  private wake(runId: string): void {
    const set = this.waiters.get(runId)
    if (!set) return
    const pending = [...set]
    set.clear()
    for (const resolve of pending) resolve()
  }

  async open(input: {
    runId: string
    threadId: string
    startedAt?: number
  }): Promise<RunLogRecord> {
    const existing = await this.getRecord(input.runId)
    if (existing) return existing
    const now = Date.now()
    const record: RunLogRecord = {
      runId: input.runId,
      threadId: input.threadId,
      status: 'running',
      lastSeq: -1,
      startedAt: input.startedAt ?? now,
      updatedAt: now,
    }
    await this.storage.put(recKey(input.runId), record)
    return record
  }

  async append(runId: string, chunk: StreamChunk): Promise<number> {
    const record = await this.require(runId)
    if (isTerminalRunStatus(record.status)) {
      throw new Error(
        `run-log: cannot append to terminal run "${runId}" (status=${record.status})`,
      )
    }
    const seq = record.lastSeq + 1
    const next: RunLogRecord = {
      ...record,
      lastSeq: seq,
      updatedAt: Date.now(),
    }
    // One transaction so the appended event and its bumped record commit
    // together — a reader never sees a lastSeq pointing at a missing event.
    await this.storage.transaction(async (txn) => {
      await txn.put(evtKey(runId, seq), chunk)
      await txn.put(recKey(runId), next)
    })
    this.wake(runId)
    return seq
  }

  async finish(
    runId: string,
    status: TerminalRunStatus,
    error?: RunError,
  ): Promise<void> {
    const record = await this.require(runId)
    if (isTerminalRunStatus(record.status)) return
    const now = Date.now()
    const next: RunLogRecord = {
      ...record,
      status,
      ...(error !== undefined ? { error } : {}),
      finishedAt: now,
      updatedAt: now,
    }
    await this.storage.put(recKey(runId), next)
    this.wake(runId)
  }

  async touch(runId: string): Promise<void> {
    await this.storage.transaction(async (txn) => {
      const record = checkRecord(
        recKey(runId),
        await txn.get<RunLogRecord>(recKey(runId)),
      )
      if (!record || isTerminalRunStatus(record.status)) return
      await txn.put(recKey(runId), { ...record, updatedAt: Date.now() })
    })
    // Activity without a new event or status transition gives a tailing reader
    // nothing to observe, so intentionally do not wake it.
  }

  async finishIfStale(
    runId: string,
    cutoff: number,
    chunk: Extract<StreamChunk, { type: 'RUN_ERROR' }>,
  ): Promise<boolean> {
    const finished = await this.storage.transaction(async (txn) => {
      const record = checkRecord(
        recKey(runId),
        await txn.get<RunLogRecord>(recKey(runId)),
      )
      if (
        !record ||
        isTerminalRunStatus(record.status) ||
        record.updatedAt >= cutoff
      )
        return false

      const now = Date.now()
      const seq = record.lastSeq + 1
      const next: RunLogRecord = {
        ...record,
        status: 'failed',
        lastSeq: seq,
        error: {
          message: chunk.message,
          ...(chunk.code !== undefined ? { code: chunk.code } : {}),
        },
        finishedAt: now,
        updatedAt: now,
      }
      // Read the current activity clock and commit the terminal event + record
      // in this one transaction. Keep wake-ups outside: transaction callbacks
      // may be retried and must contain no external work.
      await txn.put(evtKey(runId, seq), chunk)
      await txn.put(recKey(runId), next)
      return true
    })
    if (finished) this.wake(runId)
    return finished
  }

  async update(runId: string, patch: RunRecordPatch): Promise<void> {
    const updated = await this.storage.transaction(async (txn) => {
      const record = checkRecord(
        recKey(runId),
        await txn.get<RunLogRecord>(recKey(runId)),
      )
      if (!record || isTerminalRunStatus(record.status)) return false
      await txn.put(recKey(runId), {
        ...record,
        ...patch,
        updatedAt: Date.now(),
      })
      return true
    })
    // A patch may terminalize the shared status field (core's driver writes its
    // terminal status through `RunStore.update`) — wake only after that update
    // commits. A late update racing a terminal writer is an atomic no-op.
    if (updated) this.wake(runId)
  }

  async get(runId: string): Promise<RunLogRecord | null> {
    return this.getRecord(runId)
  }

  /**
   * Every run record this log holds. The coordinator's stall watchdog
   * iterates this instead of listing `rec:` keys itself, so the storage layout
   * stays this module's private concern.
   */
  async list(): Promise<Array<RunLogRecord>> {
    const stored = await this.storage.list<RunLogRecord>({ prefix: 'rec:' })
    const records: Array<RunLogRecord> = []
    for (const [key, value] of stored) {
      // Skip, not throw: one 0.x record must not stop the watchdog for live runs.
      if (isRunStatus(value.status)) records.push(value)
      else
        console.error(`run-log: skipping ${key}, it uses the 0.x record layout`)
    }
    return records
  }

  async *read(
    runId: string,
    options?: RunEventLogReadOptions,
  ): AsyncIterable<RunEvent> {
    await this.require(runId)
    const signal = options?.signal
    let cursor = options?.fromSeq ?? -1

    while (!signal?.aborted) {
      const record = await this.require(runId)
      // Drain the persisted backlog after the cursor in seq order. The
      // zero-padded keys make the prefix list naturally ordered.
      if (cursor < record.lastSeq) {
        const events = await this.storage.list<StreamChunk>({
          prefix: evtPrefix(runId),
          start: evtKey(runId, cursor + 1),
        })
        for (const [, chunk] of events) {
          cursor += 1
          yield { seq: cursor, chunk }
          if (signal?.aborted) return
        }
        continue
      }
      if (isTerminalRunStatus(record.status)) return
      await this.waitForChange(runId, signal)
    }
  }

  /**
   * Resolve when an append/finish wakes this run, the signal aborts, or the
   * fallback poll fires (the poll lets a reader that outlived its in-memory
   * waiter — e.g. after the appending instance was evicted — keep progressing).
   */
  private waitForChange(runId: string, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      let set = this.waiters.get(runId)
      if (!set) {
        set = new Set()
        this.waiters.set(runId, set)
      }
      const localSet = set
      const wake = (): void => {
        localSet.delete(wake)
        clearTimeout(timer)
        if (signal) signal.removeEventListener('abort', wake)
        resolve()
      }
      const timer = setTimeout(wake, TAIL_POLL_MS)
      localSet.add(wake)
      if (signal) signal.addEventListener('abort', wake, { once: true })
    })
  }
}
