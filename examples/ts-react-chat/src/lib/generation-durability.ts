import {
  EventType,
  memoryStream,
  resumeServerSentEventsResponse,
} from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

/**
 * Delivery durability for the generation routes — the layer that makes a run
 * resumable, under the state persistence in `generation-server-store.ts`.
 *
 * Resumability is automatic on the CLIENT and opt-in on the SERVER. A hook
 * using an HTTP connection adapter re-attaches to an in-flight run on mount by
 * issuing `GET <route>?offset=-1&runId=…`; if the route never opted in, that
 * request falls through to the SPA's HTML shell and the client fails trying to
 * parse it as SSE ("Stream response body read failed"). So every streaming
 * generation route here answers it.
 *
 * Two of the three durability layers live in this file:
 *
 * - DELIVERY — `memoryStream` logs each chunk so a rejoining client replays it
 *   instead of re-running the model. Routes opt in by passing the adapter as
 *   `durability` on their response, and by serving
 *   {@link replayGenerationIfResuming} from a `GET`.
 * - RUN LIFETIME — {@link startDetachedGeneration} unhooks the run from the
 *   request so a reload cannot kill it. Only worth it when a run is long enough
 *   that losing it hurts (video), since a detached run keeps billing after the
 *   user leaves. Short activities let the run die with the request and are
 *   simply re-run.
 *
 * `memoryStream` keeps logs in a process-global map: development and
 * single-process deployments only. Swap it for `durableStream(request, {
 * server })` from `@tanstack/ai-durable-stream` in production; nothing else
 * here changes.
 */

/** Runs whose producer is still appending, so a retried POST attaches instead. */
const activeProducers = new Set<string>()

/** Internal base for the synthetic Requests `memoryStream` is keyed by. */
const DURABILITY_ORIGIN = 'http://generation.internal/'

/**
 * Start `makeStream()` detached from the HTTP request, appending every chunk to
 * `runId`'s delivery log. A second call for a run already in flight is a no-op,
 * so a retried POST attaches to the existing producer rather than generating
 * (and billing) twice.
 *
 * Pair with {@link tailGenerationResponse}, which streams the log to the caller
 * — cancelling that response then cancels a reader, never the producer.
 */
export function startDetachedGeneration(
  runId: string,
  makeStream: () => AsyncIterable<StreamChunk>,
): void {
  if (activeProducers.has(runId)) return
  activeProducers.add(runId)

  // Producer-mode handle, keyed by runId via the X-Run-Id header.
  const sink = memoryStream(
    new Request(DURABILITY_ORIGIN, { headers: { 'X-Run-Id': runId } }),
  )

  void (async () => {
    try {
      for await (const chunk of makeStream()) {
        await sink.append([chunk])
      }
    } catch (error) {
      // The run threw before emitting a terminal chunk (the persistence
      // middleware's onError already recorded the failure). Append a RUN_ERROR
      // so readers unblock instead of waiting on a stream that never finishes.
      await sink.append([
        {
          type: EventType.RUN_ERROR,
          message: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        } as StreamChunk,
      ])
    } finally {
      await sink.close()
      activeProducers.delete(runId)
    }
  })()
}

/**
 * Stream a detached run to THIS client by tailing its log from the start.
 *
 * The generous first-chunk deadline is deliberate: this reader races the
 * producer the same request just started. The default is tuned short for the
 * opposite case — a reload rejoin, where an empty log means the run is gone.
 */
export function tailGenerationResponse(runId: string): Response {
  const reader = memoryStream(
    new Request(
      `${DURABILITY_ORIGIN}?offset=-1&runId=${encodeURIComponent(runId)}`,
    ),
    { firstChunkDeadlineMs: 10_000 },
  )
  return resumeServerSentEventsResponse({ adapter: reader })
}

/**
 * The GET half of `joinRun`: replay a run when the request carries a resume
 * offset, otherwise `null` so the route can fall through to whatever else its
 * GET serves (image also answers `reconstructGeneration` there).
 *
 * The run id rides the `X-Run-Id` header or `?runId`, and the offset the
 * `Last-Event-ID` header or `?offset` — ask the adapter via `resumeFrom()`
 * rather than sniffing query params.
 */
export function replayGenerationIfResuming(request: Request): Response | null {
  const durability = memoryStream(request)
  if (durability.resumeFrom() === null) return null
  return resumeServerSentEventsResponse({ adapter: durability })
}
