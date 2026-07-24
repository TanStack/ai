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

function readRunId(request: Request): string | null {
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
  const requestedRunId = readRunId(request)
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

function isTerminalChunk(chunk: StreamChunk): boolean {
  return chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR'
}

interface MemoryEntry {
  seq: number
  offset: string
  chunk: StreamChunk
}

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
 */
const DEFAULT_FIRST_CHUNK_DEADLINE_MS = 30_000

/** Options for the in-process delivery-durability backend. */
export interface MemoryStreamOptions {
  /**
   * Milliseconds a from-start join waits for the run's first chunk before
   * throwing. Defaults to {@link DEFAULT_FIRST_CHUNK_DEADLINE_MS}.
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
): StreamDurability {
  const resumeOffset = readResumeOffset(request)
  const runId = resolveMemoryRunId(request, resumeOffset)
  const firstChunkDeadlineMs =
    options.firstChunkDeadlineMs ?? DEFAULT_FIRST_CHUNK_DEADLINE_MS

  return {
    resumeFrom: () => resumeOffset,
    append: (chunks) => {
      const log = getOrCreateLog(runId)
      const firstSeq = (log.entries.at(-1)?.seq ?? 0) + 1
      const offsets = chunks.map((chunk, index) => {
        const seq = firstSeq + index
        const offset = encodeMemoryOffset(runId, seq)
        log.entries.push({ seq, offset, chunk })
        if (isTerminalChunk(chunk)) markComplete(log)
        return offset
      })
      wakeWaiters(log)
      return Promise.resolve(offsets)
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
            if (isTerminalChunk(entry.chunk)) return
          }
        }
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
