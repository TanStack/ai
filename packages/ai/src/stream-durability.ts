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
  waiters: Array<() => void>
}

const memoryLogs = new Map<string, MemoryLog>()

function getOrCreateLog(id: string): MemoryLog {
  let log = memoryLogs.get(id)
  if (!log) {
    log = { entries: [], complete: false, waiters: [] }
    memoryLogs.set(id, log)
  }
  return log
}

function wakeWaiters(log: MemoryLog): void {
  const waiters = log.waiters
  log.waiters = []
  for (const wake of waiters) wake()
}

/**
 * The zero-infrastructure delivery-durability backend. Its versioned cursor is
 * deliberately private: callers and core only pass the returned string back.
 */
export function memoryStream(request: Request): StreamDurability {
  const resumeOffset = readResumeOffset(request)
  const runId = resolveMemoryRunId(request, resumeOffset)

  return {
    resumeFrom: () => resumeOffset,
    append: (chunks) => {
      const log = getOrCreateLog(runId)
      const firstSeq = (log.entries.at(-1)?.seq ?? 0) + 1
      const offsets = chunks.map((chunk, index) => {
        const seq = firstSeq + index
        const offset = encodeMemoryOffset(runId, seq)
        log.entries.push({ seq, offset, chunk })
        if (isTerminalChunk(chunk)) log.complete = true
        return offset
      })
      wakeWaiters(log)
      return Promise.resolve(offsets)
    },
    close: () => {
      const log = getOrCreateLog(runId)
      log.complete = true
      wakeWaiters(log)
      return Promise.resolve()
    },
    read: async function* (offset, signal) {
      const log = getOrCreateLog(runId)
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

        await new Promise<void>((resolve) => {
          const onAbort = () => {
            const waiterIndex = log.waiters.indexOf(wake)
            if (waiterIndex !== -1) log.waiters.splice(waiterIndex, 1)
            resolve()
          }
          const wake = () => {
            signal?.removeEventListener('abort', onAbort)
            resolve()
          }
          log.waiters.push(wake)
          signal?.addEventListener('abort', onAbort, { once: true })
        })
      }
    },
  }
}
