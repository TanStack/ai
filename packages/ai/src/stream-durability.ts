import type { StreamChunk } from './types'

/**
 * A pluggable delivery-durability backend.
 *
 * Offsets are owned by the adapter and opaque to the transport. The generic
 * parameter lets an adapter retain a branded string type across append, read,
 * and resume without requiring core to understand its cursor format.
 */
export interface StreamDurability<TOffset extends string = string> {
  /** Return the adapter offset captured from the request, or null for a producer. */
  resumeFrom: () => TOffset | null
  /**
   * Persist a batch before it is delivered and return exactly one resumable
   * offset for each chunk, in the same order.
   */
  append: (chunks: Array<StreamChunk>) => Promise<Array<TOffset>>
  /** Replay chunks strictly after the supplied adapter-owned offset. */
  read: (
    offset: TOffset,
    signal?: AbortSignal,
  ) => AsyncIterable<{ offset: TOffset; chunk: StreamChunk }>
  /**
   * Terminalize the producer log and unblock live readers. Core awaits this
   * for every producer exit, including completion, cancellation, and failure.
   */
  close: () => Promise<void>
  /**
   * Everything stored for this run **at the moment of the call**, in append
   * order, then resolve.
   *
   * This is the bounded counterpart to {@link StreamDurability.read}. `read`
   * tails: it parks until the log is terminalized or the caller aborts, so it
   * cannot be used to inspect a log whose producer died without calling
   * `close` — that log stays open forever and a `for await` over it never
   * finishes. `snapshot` exists for exactly that case: a producer resuming a
   * run needs to see the prefix a previous host already stored so it can line
   * its own output up against it, and it needs that read to *return*.
   *
   * Implementations MUST:
   *
   * - never wait for more entries — resolve with what is stored, including
   *   while the log is still open and still being appended to;
   * - resolve to an empty array for a run with nothing stored, rather than
   *   throwing. In particular an implementation must not reuse the
   *   unknown-run failure path a from-start `read` join takes (`read('-1')` on
   *   an empty log is allowed to fail; `snapshot()` is not). A backend over a
   *   network may of course still reject on a transport, protocol, or
   *   authorization failure — that is a failed call, not an empty run;
   * - return a fresh array the caller can keep or mutate without reaching the
   *   stored log through it.
   *
   * The result is a point-in-time view and carries no lock: a concurrent
   * `append` may land immediately after the snapshot is taken, so a caller
   * must not treat the last returned offset as the permanent tail.
   */
  snapshot: () => Promise<Array<{ offset: TOffset; chunk: StreamChunk }>>
}

/**
 * A {@link StreamDurability} that can re-persist an already-stored range
 * idempotently.
 *
 * A run driver resuming after a crash re-derives the same offsets from its
 * source position, so replaying an overlapping range must be a no-op rather
 * than producing duplicates. That capability is deliberately a **separate,
 * optional method** instead of an optional parameter on `append`:
 *
 * - Only adapters that actually support it return this type, so a consumer
 *   requiring the capability asks for `UpsertableStreamDurability` and a
 *   mismatch is a compile error rather than a runtime failure buried in a
 *   run log.
 * - Pairing each chunk with its offset structurally makes a length mismatch
 *   and an unpaired chunk unrepresentable. A sparse hole is still
 *   representable, so implementations must reject one explicitly.
 *
 * Implementations MUST validate the entire batch before mutating any stored
 * state (so a rejected call never partially applies), MUST reject an offset
 * they did not mint themselves (every accepted offset is resumable by
 * definition), MUST reject an offset repeated within one batch, and MUST
 * reject a hole in the entries array.
 */
export interface UpsertableStreamDurability<
  TOffset extends string = string,
> extends StreamDurability<TOffset> {
  /**
   * Persist a batch at caller-supplied offsets, replacing any entry already
   * stored at the same offset. Returns the offsets in the order supplied.
   */
  upsert: (
    entries: Array<{ chunk: StreamChunk; offset: TOffset }>,
  ) => Promise<Array<TOffset>>
}

const MEMORY_OFFSET_PREFIX = 'memory:v1:'

interface MemoryOffset {
  runId: string
  seq: number
}

function encodeMemoryOffset(runId: string, seq: number): string {
  return `${MEMORY_OFFSET_PREFIX}${encodeURIComponent(runId)}:${seq}`
}

function decodeMemoryOffset(offset: string): MemoryOffset {
  if (!offset.startsWith(MEMORY_OFFSET_PREFIX)) {
    throw new Error(`Invalid memory stream offset: ${offset}`)
  }
  const encoded = offset.slice(MEMORY_OFFSET_PREFIX.length)
  const separator = encoded.lastIndexOf(':')
  if (separator === -1) {
    throw new Error(`Invalid memory stream offset: ${offset}`)
  }
  const runId = decodeURIComponent(encoded.slice(0, separator))
  const seq = Number(encoded.slice(separator + 1))
  if (!Number.isSafeInteger(seq) || seq < 1) {
    throw new Error(`Invalid memory stream offset: ${offset}`)
  }
  return { runId, seq }
}

function readResumeOffset(request: Request): string | null {
  const header = request.headers.get('Last-Event-ID')
  if (header) return header
  try {
    return new URL(request.url).searchParams.get('offset')
  } catch {
    return null
  }
}

/**
 * The run id a request names: `X-Run-Id` header first, then `?runId`.
 *
 * The single implementation of that precedence, shared by the durability
 * adapters below and by the resume response helpers' run driver
 * (`stream-to-response.ts`), so the helper and the adapter can never disagree
 * about which run a request is talking about.
 */
export function resolveResumeRunId(request: Request): string | null {
  // A POST producer carries its client-chosen run id in the X-Run-Id header so
  // the request URL stays byte-identical to a plain, non-durable request; the
  // GET join path carries it in the ?runId query instead. Prefer the header,
  // fall back to the query.
  const header = request.headers.get('X-Run-Id')
  if (header) return header
  try {
    return new URL(request.url).searchParams.get('runId')
  } catch {
    return null
  }
}

function assertValidRunId(runId: string): string {
  if (runId.length === 0 || /[\r\n]/.test(runId)) {
    throw new Error(
      `Invalid runId (must be non-empty and contain no CR/LF): ${JSON.stringify(runId)}`,
    )
  }
  return runId
}

function resolveMemoryRunId(
  request: Request,
  resumeOffset: string | null,
): string {
  if (
    resumeOffset !== null &&
    resumeOffset !== '-1' &&
    resumeOffset !== 'now'
  ) {
    return assertValidRunId(decodeMemoryOffset(resumeOffset).runId)
  }
  const requestedRunId = resolveResumeRunId(request)
  return requestedRunId === null
    ? crypto.randomUUID()
    : assertValidRunId(requestedRunId)
}

function memoryThreshold(offset: string, runId: string, tail: number): number {
  if (offset === '-1') return -1
  if (offset === 'now') return tail
  const decoded = decodeMemoryOffset(offset)
  if (decoded.runId !== runId) {
    throw new Error(
      `Memory stream offset belongs to run ${JSON.stringify(decoded.runId)}, not ${JSON.stringify(runId)}`,
    )
  }
  return decoded.seq
}

interface MemoryEntry {
  seq: number
  offset: string
  chunk: StreamChunk
}

/**
 * One validated action from an `upsert` batch. Building the whole plan before
 * applying any of it is what keeps a rejected `upsert` from partially mutating
 * the log.
 */
type UpsertStep =
  | { kind: 'replace'; existing: MemoryEntry; chunk: StreamChunk }
  | { kind: 'push'; seq: number; offset: string; chunk: StreamChunk }

interface MemoryLog {
  entries: Array<MemoryEntry>
  complete: boolean
  /** Epoch ms when the log was terminalized; undefined while still producing. */
  completedAt: number | undefined
  waiters: Array<() => void>
}

/**
 * Bounds for the in-process log store. `memoryStream` is the dev/single-process
 * backend; without eviction its module-global Map would grow without bound on a
 * long-lived server (one retained chunk buffer per run, forever). Completed logs
 * are swept after a grace window — late resumers/joiners still work briefly —
 * and a hard cap drops the oldest completed logs under pressure. Active
 * (incomplete) logs are never evicted, so an in-flight run is never dropped.
 */
const MAX_MEMORY_RUNS = 1024
const COMPLETED_LOG_TTL_MS = 5 * 60_000

/**
 * How long a from-start join (`-1` / `now`) waits for a run's first chunk before
 * failing. Bounds the "joined a run that never produces" case so a consumer
 * gets a surfaced error instead of an indefinitely-open, event-less connection.
 *
 * Defaults short: the common from-start join is a reload rejoining a run whose
 * producer ran in a PRIOR request, so an in-flight run's log already holds
 * chunks (it streams immediately, deadline never applies) and an empty log means
 * the run is gone — failing fast lets the client re-enable input near-instantly
 * instead of hanging. Raise `firstChunkDeadlineMs` for backends where a producer
 * legitimately starts well after a joiner attaches (a queued/deferred job).
 */
const DEFAULT_FIRST_CHUNK_DEADLINE_MS = 100

/** Options for the in-process delivery-durability backend. */
export interface MemoryStreamOptions {
  /**
   * Milliseconds a from-start join waits for the run's first chunk before
   * throwing. Defaults to {@link DEFAULT_FIRST_CHUNK_DEADLINE_MS} (100ms) —
   * raise it if a producer can legitimately start long after a joiner attaches.
   */
  firstChunkDeadlineMs?: number
}

const memoryLogs = new Map<string, MemoryLog>()

/**
 * Evict completed logs past their grace window, then, if still over the cap,
 * drop the oldest completed logs (the Map preserves insertion order) until back
 * under the cap. Never touches an incomplete (in-flight) log.
 */
function sweepMemoryLogs(now: number): void {
  for (const [id, log] of memoryLogs) {
    if (
      log.complete &&
      log.completedAt !== undefined &&
      now - log.completedAt > COMPLETED_LOG_TTL_MS
    ) {
      memoryLogs.delete(id)
    }
  }
  if (memoryLogs.size <= MAX_MEMORY_RUNS) return
  for (const [id, log] of memoryLogs) {
    if (memoryLogs.size <= MAX_MEMORY_RUNS) break
    if (log.complete) memoryLogs.delete(id)
  }
}

function getOrCreateLog(id: string): MemoryLog {
  let log = memoryLogs.get(id)
  if (!log) {
    sweepMemoryLogs(Date.now())
    log = { entries: [], complete: false, completedAt: undefined, waiters: [] }
    memoryLogs.set(id, log)
  }
  return log
}

function markComplete(log: MemoryLog): void {
  if (!log.complete) {
    log.complete = true
    log.completedAt = Date.now()
  }
}

function wakeWaiters(log: MemoryLog): void {
  const waiters = log.waiters
  log.waiters = []
  for (const wake of waiters) wake()
}

/**
 * The zero-infrastructure delivery-durability backend. Its versioned cursor is
 * deliberately private: callers and core only pass the returned string back.
 *
 * Logs live in a process-global map, so this backend is for development, tests,
 * and single-process deployments only. Completed runs are evicted after a grace
 * window (see {@link COMPLETED_LOG_TTL_MS}); a resume of an evicted or unknown
 * run fails loudly rather than hanging.
 */
export function memoryStream(
  request: Request,
  options: MemoryStreamOptions = {},
): UpsertableStreamDurability {
  const resumeOffset = readResumeOffset(request)
  const runId = resolveMemoryRunId(request, resumeOffset)
  const firstChunkDeadlineMs =
    options.firstChunkDeadlineMs ?? DEFAULT_FIRST_CHUNK_DEADLINE_MS

  return {
    resumeFrom: () => resumeOffset,
    // `async` so every failure surfaces as a rejected promise rather than a
    // synchronous throw at the call site — `append` is declared to return a
    // Promise, so callers must be able to `.catch()` every failure mode.
    append: async (chunks) => {
      const log = getOrCreateLog(runId)
      const firstSeq = (log.entries.at(-1)?.seq ?? 0) + 1
      const offsets = chunks.map((chunk, index) => {
        const seq = firstSeq + index
        const offset = encodeMemoryOffset(runId, seq)
        log.entries.push({ seq, offset, chunk })
        return offset
      })
      wakeWaiters(log)
      return offsets
    },
    // `async` for the same reason as `append`: every validation failure below
    // must be observable via `.catch()`, never as a synchronous throw.
    upsert: async (entries) => {
      const log = getOrCreateLog(runId)
      const tailSeq = log.entries.at(-1)?.seq ?? 0

      // Validate the WHOLE batch before touching `log.entries`, so a rejected
      // upsert never partially applies and a caller that catches and retries
      // can be sure no prefix landed.
      const seen = new Set<string>()
      // Tail as it will stand once every push planned so far has been applied,
      // so intra-batch ordering is validated up front too.
      let plannedTailSeq = tailSeq
      // `Array.from` rather than `entries.map`: `map` SKIPS holes in a sparse
      // array, which would leave the plan short and make the apply loop below
      // read `undefined` partway through, after earlier steps had already
      // mutated the log. `Array.from` invokes this callback for every index,
      // so a hole is rejected here, before anything is touched.
      const plan = Array.from(entries, (entry, index): UpsertStep => {
        if (entry === undefined) {
          throw new Error(
            `memoryStream: entries[${index}] is missing; entries must be dense`,
          )
        }
        const { chunk, offset } = entry
        let decoded: MemoryOffset
        try {
          decoded = decodeMemoryOffset(offset)
        } catch (cause) {
          throw new Error(
            `memoryStream: entries[${index}].offset ${JSON.stringify(offset)} is not a resumable memory stream offset: ${cause instanceof Error ? cause.message : String(cause)}`,
          )
        }
        if (decoded.runId !== runId) {
          throw new Error(
            `memoryStream: entries[${index}].offset ${JSON.stringify(offset)} belongs to run ${JSON.stringify(decoded.runId)}, not ${JSON.stringify(runId)}`,
          )
        }
        const seq = decoded.seq
        if (seen.has(offset)) {
          throw new Error(
            `memoryStream: entries[${index}].offset ${JSON.stringify(offset)} is repeated within the batch; each offset may appear at most once`,
          )
        }
        seen.add(offset)
        const existing = log.entries.find((stored) => stored.offset === offset)
        if (existing) return { kind: 'replace', existing, chunk }
        // A not-yet-stored offset must sit strictly after the current tail.
        // `read()` walks `entries` in array order and filters `seq > threshold`,
        // so a pushed entry has to keep the seqs monotonically increasing;
        // reusing the offset's own decoded seq also keeps a returned offset's
        // threshold exactly consistent with the entry it names. Gaps are fine —
        // nothing depends on seqs being contiguous, only on them increasing —
        // so do NOT "fix" this to renumber densely.
        if (seq <= plannedTailSeq) {
          throw new Error(
            `memoryStream: entries[${index}].offset ${JSON.stringify(offset)} is not stored yet but claims position ${seq}, at or before the tail ${plannedTailSeq}; a new offset must come after every stored and preceding entry`,
          )
        }
        plannedTailSeq = seq
        return { kind: 'push', seq, offset, chunk }
      })

      // Validation passed for every entry — mutation below cannot fail.
      for (const step of plan) {
        if (step.kind === 'replace') {
          step.existing.chunk = step.chunk
        } else {
          log.entries.push({
            seq: step.seq,
            offset: step.offset,
            chunk: step.chunk,
          })
        }
      }
      wakeWaiters(log)
      return plan.map((step) =>
        step.kind === 'replace' ? step.existing.offset : step.offset,
      )
    },
    snapshot: () => {
      // Peek, never getOrCreateLog: an unknown run must resolve to `[]`, and
      // inserting an empty, never-completed log here would leave a permanent
      // entry the sweep cannot reclaim (it only reclaims complete logs).
      const log = memoryLogs.get(runId)
      if (log === undefined) return Promise.resolve([])
      // Fresh outer array AND fresh pair objects, so a caller that mutates the
      // result cannot reach `log.entries` or the stored entries through it.
      // Never touches `log.waiters` — a snapshot is a point-in-time read and
      // returns even while the log is open and still being appended to.
      return Promise.resolve(
        log.entries.map((entry) => ({
          offset: entry.offset,
          chunk: entry.chunk,
        })),
      )
    },
    close: () => {
      const log = getOrCreateLog(runId)
      markComplete(log)
      wakeWaiters(log)
      return Promise.resolve()
    },
    read: async function* (offset, signal) {
      const isFromStartJoin = offset === '-1' || offset === 'now'

      // Peek, never getOrCreateLog. A concrete resume offset for an absent run
      // means the run was evicted (or never lived in this process) and will not
      // reappear — fail WITHOUT inserting a log. Inserting here would leave a
      // permanent empty, never-completed log (sweep only reclaims complete
      // ones), so client-supplied offsets could grow the map without bound and
      // defeat the eviction this backend relies on.
      let log = memoryLogs.get(runId)
      if (log === undefined || (log.entries.length === 0 && !log.complete)) {
        if (!isFromStartJoin) {
          throw new Error(
            `Unknown or expired memory stream run: ${JSON.stringify(runId)}`,
          )
        }
        // A from-start join may legitimately attach before the producer creates
        // the log (second-tab race); create it so a later append reuses the
        // same entry. If no producer ever arrives, the first-chunk deadline
        // below deletes this phantom before rejecting.
        log = getOrCreateLog(runId)
      }

      const threshold = memoryThreshold(
        offset,
        runId,
        log.entries.at(-1)?.seq ?? 0,
      )
      let index = 0

      for (;;) {
        while (index < log.entries.length) {
          const entry = log.entries[index]
          index += 1
          if (entry && entry.seq > threshold) {
            yield { offset: entry.offset, chunk: entry.chunk }
          }
        }
        // A terminal chunk (RUN_FINISHED / RUN_ERROR) does NOT end the read: an
        // agent-loop run emits one per iteration (finishReason "tool_calls" then
        // "stop"), so stopping on the first would truncate a tool-calling run at
        // its first tool call. The producer signals true completion by calling
        // `close()` (it does so on every exit — see StreamDurability.close), which
        // sets `log.complete`. Read tails until then, or until the caller aborts.
        if (log.complete || signal?.aborted) return

        // Bound only the wait for the very first chunk: once a run has produced
        // anything, its producer owns termination and a caught-up reader may
        // legitimately park indefinitely between chunks.
        const deadlineForFirstChunk =
          log.entries.length === 0 ? firstChunkDeadlineMs : undefined

        await new Promise<void>((resolve, reject) => {
          let timer: ReturnType<typeof setTimeout> | undefined
          const cleanup = () => {
            if (timer !== undefined) clearTimeout(timer)
            signal?.removeEventListener('abort', onAbort)
            const waiterIndex = log.waiters.indexOf(wake)
            if (waiterIndex !== -1) log.waiters.splice(waiterIndex, 1)
          }
          const onAbort = () => {
            cleanup()
            resolve()
          }
          const wake = () => {
            cleanup()
            resolve()
          }
          log.waiters.push(wake)
          signal?.addEventListener('abort', onAbort, { once: true })
          if (deadlineForFirstChunk !== undefined) {
            timer = setTimeout(() => {
              cleanup()
              // No producer ever created data for this joined run. Drop the
              // phantom log we created above so it does not linger uncollected
              // (it is empty and will never be marked complete).
              if (
                log.entries.length === 0 &&
                !log.complete &&
                memoryLogs.get(runId) === log
              ) {
                memoryLogs.delete(runId)
              }
              reject(
                new Error(
                  `Memory stream run produced no data within ${deadlineForFirstChunk}ms: ${JSON.stringify(runId)}`,
                ),
              )
            }, deadlineForFirstChunk)
          }
        })
      }
    },
  }
}
