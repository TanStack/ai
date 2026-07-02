/**
 * History projection — read a persisted run's events back as a `StreamChunk`
 * timeline. This is the `events -> StreamChunk[]` projection devtools (and any
 * client) consume to render or replay a PAST run through the exact same
 * chunk-rendering path they use for live runs. Live devtools observation is
 * unchanged; this adds the read-from-store side.
 */
import type { StreamChunk } from '@tanstack/ai'
import type { PublicEventStore } from './types'

/**
 * Collect a run's persisted events into an ordered `StreamChunk[]` timeline.
 * `afterSeq` skips events up to and including that sequence (e.g. for paging).
 */
export async function loadRunHistory(
  events: PublicEventStore,
  runId: string,
  opts?: { afterSeq?: number },
): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const { event } of events.read(runId, opts)) {
    chunks.push(event)
  }
  return chunks
}
