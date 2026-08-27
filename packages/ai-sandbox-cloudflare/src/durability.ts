import type { RunStore, StreamChunk, StreamDurability } from '@tanstack/ai'
import type { RunEventLog } from './run-log'

/**
 * Expose a {@link RunEventLog} as core's `RunStore`, for the `runs` half of
 * `RunDeps`. A pure rename layer — the invariants (idempotent `createOrResume`,
 * no-op `update` on an unknown run) are the log's own.
 */
export function runLogStore(log: RunEventLog): RunStore {
  return {
    createOrResume: ({ runId, threadId, startedAt }) =>
      log.open({ runId, threadId, startedAt }),
    update: (runId, patch) => log.update(runId, patch),
    get: (runId) => log.get(runId),
    findActiveRun: async (threadId) => {
      let active = null
      for (const record of await log.list()) {
        const isInactiveForThread =
          record.threadId !== threadId || record.status !== 'running'
        if (isInactiveForThread) {
          continue
        }
        if (active === null || record.startedAt > active.startedAt) {
          active = record
        }
      }
      return active
    },
  }
}

const RUN_LOG_OFFSET_PREFIX = 'cfrunlog:v1:'

function encodeOffset(runId: string, seq: number): string {
  return `${RUN_LOG_OFFSET_PREFIX}${encodeURIComponent(runId)}:${seq}`
}

function decodeOffset(offset: string): {
  /** The run this durability adapter attaches to. */
  runId: string
  seq: number
} {
  if (!offset.startsWith(RUN_LOG_OFFSET_PREFIX)) {
    throw new Error(`Invalid run-log stream offset: ${offset}`)
  }
  const encoded = offset.slice(RUN_LOG_OFFSET_PREFIX.length)
  const separator = encoded.lastIndexOf(':')
  if (separator === -1) {
    throw new Error(`Invalid run-log stream offset: ${offset}`)
  }
  const runId = decodeURIComponent(encoded.slice(0, separator))
  const seq = Number(encoded.slice(separator + 1))
  const isInvalidSeq = !Number.isSafeInteger(seq) || seq < 0
  if (isInvalidSeq) {
    throw new Error(`Invalid run-log stream offset: ${offset}`)
  }
  return { runId, seq }
}

/** Construction input for {@link runLogStream}. */
export interface RunLogStreamInit {
  /** The run this durability adapter attaches to. */
  runId: string
  /**
   * Resume offset captured by the consumer (`resumeFrom()` returns it).
   * Defaults to `null` (a producer / from-start reader).
   */
  offset?: string | null
}

/**
 * Expose one run of a {@link RunEventLog} as core's `StreamDurability`, for the
 * `durability` half of `RunDeps`: `(runId) => runLogStream(log, { runId })`.
 *
 * The run must already exist — core's driver guarantees it (`createOrResume`
 * runs before the first `append`), and a standalone consumer opens it first.
 * `append` and `read` on an unknown run reject, per the log's own contract;
 * `snapshot` resolves `[]`, per `StreamDurability`'s.
 *
 * Offsets encode the log's monotonic `seq` (versioned, run-scoped, opaque to
 * callers). The `'-1'` (from-start) and `'now'` (tail-only) read sentinels
 * every shipped backend honors are supported.
 */
export function runLogStream(
  log: RunEventLog,
  init: RunLogStreamInit,
): StreamDurability {
  const { runId } = init
  const resumeOffset = init.offset ?? null

  const seqAfter = async (offset: string): Promise<number> => {
    if (offset === '-1') return -1
    if (offset === 'now') return (await log.get(runId))?.lastSeq ?? -1
    const decoded = decodeOffset(offset)
    if (decoded.runId !== runId) {
      throw new Error(
        `Run-log stream offset belongs to run ${JSON.stringify(decoded.runId)}, not ${JSON.stringify(runId)}`,
      )
    }
    return decoded.seq
  }

  return {
    resumeFrom: () => resumeOffset,
    append: async (chunks) => {
      const offsets: Array<string> = []
      for (const chunk of chunks) {
        offsets.push(encodeOffset(runId, await log.append(runId, chunk)))
      }
      return offsets
    },
    read: async function* (offset, signal) {
      const fromSeq = await seqAfter(offset)
      const events = log.read(runId, {
        fromSeq,
        ...(signal !== undefined ? { signal } : {}),
      })
      for await (const event of events) {
        yield { offset: encodeOffset(runId, event.seq), chunk: event.chunk }
      }
    },
    close: () => log.finish(runId, 'completed'),
    snapshot: async () => {
      const record = await log.get(runId)
      // Unknown run resolves to [] — the contract forbids reusing the
      // unknown-run failure path a from-start `read` join takes.
      if (record !== null && record.lastSeq >= 0) {
        const lastSeq = record.lastSeq
        const entries: Array<{ offset: string; chunk: StreamChunk }> = []
        const events = log.read(runId, { fromSeq: -1 })
        for await (const event of events) {
          entries.push({
            offset: encodeOffset(runId, event.seq),
            chunk: event.chunk,
          })
          // Stop at the lastSeq captured BEFORE the read: `read` live-tails an
          // open log, and a snapshot must return a point-in-time view instead.
          if (event.seq >= lastSeq) break
        }
        return entries
      }
      return []
    },
  }
}
