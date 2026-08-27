import type { RunStore, StreamChunk, StreamDurability } from '@tanstack/ai'
import type { RunEventLog } from './run-log'

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

function decodeOffset(offset: string): { runId: string; seq: number } {
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
  offset?: string | null
}

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
