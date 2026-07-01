/**
 * A durable {@link RunEventLog} backed by Durable Object storage — the storage
 * half of the serverless/edge run model. The coordinator appends every
 * {@link StreamChunk} the agent emits under a monotonic `seq`; clients tail from
 * a cursor. Because events are PERSISTED (not held in a caller's open stream), a
 * reconnecting tab, a dropped WebSocket, or a coordinator that hibernated
 * between chunks all resume cleanly: replay everything after the client's
 * `lastSeq`, then live-tail to terminal.
 *
 * Mirrors {@link InMemoryRunEventLog} from `@tanstack/ai-sandbox` exactly.
 * Storage layout (keys scoped by `runId` so one DO can host many runs):
 * - `rec:<runId>`        → the {@link RunRecord}
 * - `evt:<runId>:<seq8>` → the chunk for that seq (seq zero-padded to 8 digits
 *                          so `list({ prefix })` returns events in seq order).
 *
 * The live-tail wake-up (the in-memory waiter set) is per-INSTANCE; if the
 * instance is evicted mid-run, a reader re-reads the persisted backlog and the
 * `TAIL_POLL_MS` fallback poll keeps it progressing. No event is ever lost.
 *
 * NOTE: Workers-runtime code — compiles against `@cloudflare/workers-types`.
 */
import { isTerminalRunStatus } from '@tanstack/ai-sandbox'
import type {
  RunError,
  RunEvent,
  RunEventLog,
  RunEventLogReadOptions,
  RunRecord,
  TerminalRunStatus,
} from '@tanstack/ai-sandbox'
import type { StreamChunk } from '@tanstack/ai'

/** How long a post-eviction reader waits before re-polling storage (ms). */
const TAIL_POLL_MS = 250

const recKey = (runId: string): string => `rec:${runId}`
const evtKey = (runId: string, seq: number): string =>
  `evt:${runId}:${String(seq).padStart(8, '0')}`
const evtPrefix = (runId: string): string => `evt:${runId}:`

export class DurableObjectRunEventLog implements RunEventLog {
  /** Per-run wake-ups for live-tailing readers on THIS instance. */
  private readonly waiters = new Map<string, Set<() => void>>()

  constructor(private readonly storage: DurableObjectStorage) {}

  private async require(runId: string): Promise<RunRecord> {
    const record = await this.storage.get<RunRecord>(recKey(runId))
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

  async open(input: { runId: string; threadId?: string }): Promise<RunRecord> {
    const existing = await this.storage.get<RunRecord>(recKey(input.runId))
    if (existing) return existing
    const now = Date.now()
    const record: RunRecord = {
      runId: input.runId,
      ...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
      status: 'running',
      lastSeq: -1,
      createdAt: now,
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
    const next: RunRecord = { ...record, lastSeq: seq, updatedAt: Date.now() }
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
    const next: RunRecord = {
      ...record,
      status,
      ...(error !== undefined ? { error } : {}),
      updatedAt: Date.now(),
    }
    await this.storage.put(recKey(runId), next)
    this.wake(runId)
  }

  async get(runId: string): Promise<RunRecord | null> {
    return (await this.storage.get<RunRecord>(recKey(runId))) ?? null
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
