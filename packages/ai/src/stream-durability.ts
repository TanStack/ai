import type { StreamChunk } from './types'

export interface StreamDurability<TOffset extends string = string> {
  /** Return the adapter offset captured from the request, or null for a producer. */
  resumeFrom: () => TOffset | null
  append: (chunks: Array<StreamChunk>) => Promise<Array<TOffset>>
  /** Replay chunks strictly after the supplied adapter-owned offset. */
  read: (
    offset: TOffset,
    signal?: AbortSignal,
  ) => AsyncIterable<{ offset: TOffset; chunk: StreamChunk }>
  close: () => Promise<void>
  snapshot: () => Promise<Array<{ offset: TOffset; chunk: StreamChunk }>>
}

export interface UpsertableStreamDurability<
  TOffset extends string = string,
> extends StreamDurability<TOffset> {
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
  const shouldSkipIsSafeInteger = !Number.isSafeInteger(seq) || seq < 1
  if (shouldSkipIsSafeInteger) {
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
  const isEmptyRunId = runId.length === 0 || /[\r\n]/.test(runId)
  if (isEmptyRunId) {
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
  const isMissingResumeOffset =
    resumeOffset !== null && resumeOffset !== '-1' && resumeOffset !== 'now'
  if (isMissingResumeOffset) {
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

const MAX_MEMORY_RUNS = 1024
const COMPLETED_LOG_TTL_MS = 5 * 60_000

const DEFAULT_FIRST_CHUNK_DEADLINE_MS = 100

/** Options for the in-process delivery-durability backend. */
export interface MemoryStreamOptions {
  firstChunkDeadlineMs?: number
}

const memoryLogs = new Map<string, MemoryLog>()

function sweepMemoryLogs(now: number): void {
  for (const [id, log] of memoryLogs) {
    const hasLog =
      log.complete &&
      log.completedAt !== undefined &&
      now - log.completedAt > COMPLETED_LOG_TTL_MS
    if (hasLog) {
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

export interface MemoryStreamInit {
  /** The run this durability adapter attaches to. */
  runId: string
  offset?: string | null
}

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
      const isEmptyLog =
        log === undefined || (log.entries.length === 0 && !log.complete)
      if (isEmptyLog) {
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
          const hasEntry = entry && entry.seq > threshold
          if (hasEntry) {
            yield { offset: entry.offset, chunk: entry.chunk }
          }
        }
        const shouldSkipLog = log.complete || signal?.aborted
        if (shouldSkipLog) return

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
