/**
 * Adapts the persistence {@link PublicEventStore} (+ optional {@link RunStore}) to the
 * core `ResumeSource` contract the `chat()` resume seam consumes. Cursors are
 * decoded to a per-run sequence so replay returns only events after the point
 * the client last saw.
 */
import { decodeCursor } from './cursor'
import type { ResumeSource, RunStatus, StreamChunk } from '@tanstack/ai'
import type { PublicEventStore, RunStore } from './types'

async function publicEventExistsAtSeq(
  events: PublicEventStore,
  runId: string,
  seq: number,
): Promise<boolean> {
  for await (const persisted of events.read(runId, { afterSeq: seq - 1 })) {
    return persisted.seq === seq
  }
  return false
}

export function createResumeSource(
  events: PublicEventStore,
  runs?: RunStore,
): ResumeSource {
  return {
    async hasRun(runId) {
      if (runs && !(await runs.get(runId))) return false
      return events.hasRun(runId)
    },
    async *replay(runId, afterCursor): AsyncIterable<StreamChunk> {
      if (runs && !(await runs.get(runId))) {
        throw new Error(`Resume replay references unknown run ${runId}.`)
      }
      let afterSeq: number | undefined
      if (afterCursor) {
        const decoded = decodeCursor(afterCursor)
        if (decoded.seq < 1) {
          throw new Error(
            `Resume cursor sequence ${decoded.seq} is invalid; expected a persisted event sequence >= 1.`,
          )
        }
        if (decoded.runId !== runId) {
          throw new Error(
            `Resume cursor runId ${decoded.runId} does not match replay runId ${runId}.`,
          )
        }
        const latestSeq = await events.latestSeq(runId)
        if (latestSeq === 0) {
          throw new Error(
            `Resume cursor references run ${runId}, but no public events are persisted.`,
          )
        }
        if (decoded.seq > latestSeq) {
          throw new Error(
            `Resume cursor sequence ${decoded.seq} is beyond latest persisted sequence ${latestSeq} for run ${runId}.`,
          )
        }
        if (!(await publicEventExistsAtSeq(events, runId, decoded.seq))) {
          throw new Error(
            `Resume cursor sequence ${decoded.seq} does not reference a persisted public event for run ${runId}.`,
          )
        }
        afterSeq = decoded.seq
      }
      for await (const { event } of events.read(
        runId,
        afterSeq === undefined ? undefined : { afterSeq },
      )) {
        yield event
      }
    },
    async getStatus(runId): Promise<RunStatus | null> {
      const run = await runs?.get(runId)
      return run ? run.status : null
    },
  }
}
