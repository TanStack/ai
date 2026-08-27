import { isTerminalRunStatus } from '@tanstack/ai'
import { migrateStoredRunRecord } from './run-log'
import type {
  RunEvent,
  RunEventLog,
  RunEventLogReadOptions,
  RunLogRecord,
  RunRecordPatch,
} from './run-log'
import type { RunError, StreamChunk, TerminalRunStatus } from '@tanstack/ai'

/** How long a post-eviction reader waits before re-polling storage (ms). */
const /** How long a post-eviction reader waits before re-polling storage (ms). */
  TAIL_POLL_MS = 250

/**
 * What a `rec:` key may hold: the converged layout, or the pre-convergence one
 * `migrateStoredRunRecord` still reads. Typed as the migration function's input
 * so a read is forced through it.
 */
type StoredRunRecord = Parameters<typeof migrateStoredRunRecord>[0]

const recKey = (runId: string): string => `rec:${runId}`
const evtKey = (runId: string, seq: number): string =>
  `evt:${runId}:${String(seq).padStart(8, '0')}`
const evtPrefix = (runId: string): string => `evt:${runId}:`

export class DurableObjectRunEventLog implements RunEventLog {
  /** Per-run wake-ups for live-tailing readers on THIS instance. */
  private readonly waiters = new Map<string, Set<() => void>>()

  constructor(private readonly storage: DurableObjectStorage) {}

  /**
   * Read (and, when needed, migrate + write back) the record under `rec:<runId>`.
   * The single storage read path — everything else goes through here so no
   * caller can observe the legacy layout.
   */
  private async getRecord(runId: string): Promise<RunLogRecord | null> {
    const stored = await this.storage.get<StoredRunRecord>(recKey(runId))
    if (!stored) return null
    const { record, migrated } = migrateStoredRunRecord(stored)
    if (migrated) await this.storage.put(recKey(runId), record)
    return record
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

  async update(runId: string, patch: RunRecordPatch): Promise<void> {
    const record = await this.getRecord(runId)
    if (!record) return // unknown runId is a no-op
    const next: RunLogRecord = { ...record, ...patch, updatedAt: Date.now() }
    await this.storage.put(recKey(runId), next)
    this.wake(runId)
  }

  async get(runId: string): Promise<RunLogRecord | null> {
    return this.getRecord(runId)
  }

  /**
   * Every run record this log holds, migrated. The coordinator's stall
   * watchdog iterates this instead of listing `rec:` keys itself, so the
   * storage layout (and its migration) stays this module's private concern.
   */
  async list(): Promise<Array<RunLogRecord>> {
    const stored = await this.storage.list<StoredRunRecord>({ prefix: 'rec:' })
    const records: Array<RunLogRecord> = []
    for (const [key, value] of stored) {
      const { record, migrated } = migrateStoredRunRecord(value)
      if (migrated) await this.storage.put(key, record)
      records.push(record)
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
      /** Wake (and clear) every reader blocked on this run. */
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
