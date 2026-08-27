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
  ) => AsyncIterable<{ /**
   * Resume offset captured by the consumer (`resumeFrom()` returns it).
   * Defaults to `null` (a producer / from-start reader).
   */
offset: TOffset; chunk: StreamChunk }>
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
  /** The run this durability adapter attaches to. */
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
  const isBadSeq = !Number.isSafeInteger(seq) || seq < 1
  if (isBadSeq) {
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
  const header = request.headers.get('X-Run-Id')
  if (header) return header
  try {
    return new URL(request.url).searchParams.get('runId')
  } catch {
    return null
  }
}

function assertValidRunId(runId: string): string {
  const isBadRunId = runId.length === 0 || /[\r\n]/.test(runId)
  if (isBadRunId) {
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
  const hasConcreteOffset =
    resumeOffset !== null && resumeOffset !== '-1' && resumeOffset !== 'now'
  if (hasConcreteOffset) {
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
    const isExpiredLog =
      log.complete &&
      log.completedAt !== undefined &&
      now - log.completedAt > COMPLETED_LOG_TTL_MS
    if (isExpiredLog) {
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
 * Explicit construction for {@link memoryStream}, for callers that don't have
 * the incoming `Request` — e.g. a TanStack Start server function implementing
 * a `joinRun` replay for a run id it received as call data:
 *
 * ```ts
 * const durability = memoryStream({ runId })
 * for await (const chunk of replayRunStream(durability)) yield chunk
 * ```
 */
export interface MemoryStreamInit {
  /** The run this durability adapter attaches to. */
  runId: string
  offset?: string | null
}

/**
 * The zero-infrastructure delivery-durability backend. Its versioned cursor is
 * deliberately private: callers and core only pass the returned string back.
 *
 * Construct from the incoming `Request` (HTTP transports) or from an explicit
 * {@link MemoryStreamInit} (server functions / direct calls that already know
 * the run id).
 *
 * Logs live in a process-global map, so this backend is for development, tests,
 * and single-process deployments only. Completed runs are evicted after a grace
 * window (see {@link COMPLETED_LOG_TTL_MS}); a resume of an evicted or unknown
 * run fails loudly rather than hanging.
 */
export function memoryStream(
  source: Request | MemoryStreamInit,
  options: MemoryStreamOptions = {},
): UpsertableStreamDurability {
  const resumeOffset =
    source instanceof Request
      ? readResumeOffset(source)
      : (source.offset ?? null)
  const runId =
    source instanceof Request
      ? resolveMemoryRunId(source, resumeOffset)
      : assertValidRunId(source.runId)
  const firstChunkDeadlineMs =
    options.firstChunkDeadlineMs ?? DEFAULT_FIRST_CHUNK_DEADLINE_MS

  return {
    resumeFrom: () => resumeOffset,
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

      const seen = new Set<string>()
      // Tail as it will stand once every push planned so far has been applied,
      // so intra-batch ordering is validated up front too.
      let plannedTailSeq = tailSeq
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
      const log = memoryLogs.get(runId)
      if (log === undefined) return Promise.resolve([])
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

      let log = memoryLogs.get(runId)
      if (log === undefined || (log.entries.length === 0 && !log.complete)) {
        if (!isFromStartJoin) {
          throw new Error(
            `Unknown or expired memory stream run: ${JSON.stringify(runId)}`,
          )
        }
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
        const isReadDone = log.complete || signal?.aborted
        if (isReadDone) return

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
              const isEmptyLog =
                log.entries.length === 0 &&
                !log.complete &&
                memoryLogs.get(runId) === log
              if (isEmptyLog) {
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

/**
 * Replay a run's delivery-durability log as a bare stream of chunks, for
 * callers that serve a `joinRun` handler without an HTTP `Response` — e.g. a
 * TanStack Start server function returning an async iterable:
 *
 * ```ts
 * async function* joinImageRun({ data: runId }: { data: string }) {
 *   yield* replayRunStream(memoryStream({ runId }))
 * }
 *
 * // Serve it from a server function whose handler is the generator above
 * // (`createServerFn({ method: 'GET' }).inputValidator(...)`).
 * ```
 *
 * NOTE: the example deliberately declares the generator separately instead of
 * inlining it into the server-fn builder chain. TanStack Start's server-fn
 * Vite plugin decides whether a module needs compiling by regex-matching the
 * SOURCE for a dotted `handler(` call, and JSDoc survives into `dist` — an
 * inlined chain here would make every Start app treat this package as a
 * server-fn module and try to resolve its framework's `@tanstack/*-start`
 * package, failing the build wherever that framework is not the one installed.
 *
 * Reads from `offset` (default `'-1'` — from the start) and tails until the
 * producer closes the log or `signal` aborts, exactly like the HTTP
 * `resumeServerSentEventsResponse` path.
 */
export async function* replayRunStream<TOffset extends string>(
  durability: StreamDurability<TOffset>,
  offset?: TOffset,
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  // '-1' is the from-start replay sentinel every shipped backend honors.
  const from = offset ?? ('-1' as TOffset)
  const records = durability.read(from, signal)
  for await (const { chunk } of records) {
    yield chunk
  }
}
