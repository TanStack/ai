/**
 * Adapts the persistence {@link EventLog} (+ optional {@link RunStore}) to the
 * core `ResumeSource` contract the `chat()` resume seam consumes. Cursors are
 * decoded to a per-run sequence so replay returns only events after the point
 * the client last saw.
 */
import { decodeCursor, isValidCursor } from './cursor'
import type { ResumeSource, RunStatus, StreamChunk } from '@tanstack/ai'
import type { EventLog, RunStore } from './types'

export function createResumeSource(
  events: EventLog,
  runs?: RunStore,
): ResumeSource {
  return {
    hasRun: (runId) => events.hasRun(runId),
    async *replay(runId, afterCursor): AsyncIterable<StreamChunk> {
      const afterSeq =
        afterCursor && isValidCursor(afterCursor)
          ? decodeCursor(afterCursor).seq
          : undefined
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
