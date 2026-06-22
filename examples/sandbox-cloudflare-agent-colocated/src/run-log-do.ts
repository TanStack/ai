/**
 * A durable {@link RunEventLog} backed by Durable Object storage.
 *
 * This is the storage half of the serverless/edge run model. The coordinator DO
 * appends every {@link StreamChunk} the agent emits under a monotonic `seq`, and
 * clients tail from a cursor. Because the events are PERSISTED (not held in a
 * caller's open stream), a reconnecting browser tab, a dropped WebSocket, or a
 * coordinator that hibernated between chunks all resume cleanly: replay
 * everything after the client's `lastSeq`, then live-tail to terminal.
 *
 * In THIS (co-located) example the chunks don't come from a local `chat()` call
 * — they arrive as NDJSON from the in-container runner over `POST /run`. The
 * log doesn't care where a chunk originated: the coordinator just appends each
 * line as it streams in, and the resumable-cursor tail works identically.
 *
 * Mirrors {@link InMemoryRunEventLog} from `@tanstack/ai-sandbox` exactly:
 * - `append` assigns the next gap-free `seq` (0, 1, 2, …) and returns it.
 * - `read` replays the backlog after `fromSeq` in order, then live-tails new
 *   events, and RETURNS once the run is terminal and the cursor has caught up.
 * - all methods reject for an unknown `runId` except `get`, which resolves null.
 *
 * Storage layout (all keys scoped by `runId` so one DO can host many runs):
 * - `rec:<runId>`            → the {@link RunRecord} (status, lastSeq, error…)
 * - `evt:<runId>:<seq8>`     → the {@link StreamChunk} for that seq, where
 *                              `seq8` is the seq zero-padded to 8 digits so the
 *                              storage `list({ prefix })` returns events in seq
 *                              order for an efficient ranged backlog replay.
 *
 * HIBERNATION / RESUME. The record and every event survive hibernation because
 * they live in storage, not memory. The live-tail wake-up (the in-memory waiter
 * set) is intentionally per-INSTANCE: it only has to wake readers attached to
 * the SAME running DO instance that is appending — which is the case here, since
 * the coordinator both drives the run and serves the WebSocket tails from one
 * instance. If the instance is evicted mid-run, the next `read` simply re-reads
 * the persisted backlog from storage and polls until the record turns terminal;
 * no event is ever lost. We therefore keep a short fallback poll in `read` so a
 * reader that outlived its waiter (post-eviction) still makes progress.
 *
 * NOTE: compile-only reference — not runtime-verified in this repo (no Workers
 * runtime here). It compiles against the real `@cloudflare/workers-types` and
 * implements the proven {@link RunEventLog} contract. Copied verbatim from
 * `examples/sandbox-cloudflare-agent/src/run-log-do.ts` (this is a standalone
 * example; copying keeps it self-contained).
 */
import { isTerminalRunStatus } from '@tanstack/ai-sandbox'
import type {
  RunError,
  RunEvent,
  RunEventLog,
  RunEventLogReadOptions,
  RunRecord,
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
    // One transaction so an appended event and its bumped record commit
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
    status: 'done' | 'error' | 'aborted',
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

    while (true) {
      if (signal?.aborted) return
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
   * fallback poll fires. The poll is what lets a reader that outlived its
   * in-memory waiter (e.g. after the appending instance was evicted) keep
   * making progress against persisted storage.
   */
  private waitForChange(runId: string, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      let set = this.waiters.get(runId)
      if (!set) {
        set = new Set()
        this.waiters.set(runId, set)
      }
      const localSet = set
      const settle = (): void => {
        localSet.delete(wake)
        clearTimeout(timer)
        if (signal) signal.removeEventListener('abort', wake)
        resolve()
      }
      const wake = (): void => settle()
      const timer = setTimeout(wake, TAIL_POLL_MS)
      localSet.add(wake)
      if (signal) signal.addEventListener('abort', wake, { once: true })
    })
  }
}
