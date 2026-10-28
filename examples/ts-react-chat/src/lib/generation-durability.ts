import { memoryStream, resumeServerSentEventsResponse } from '@tanstack/ai'

/**
 * Delivery durability for the generation routes — the layer that makes a run
 * resumable, alongside the state persistence in `generation-server-store.ts`.
 *
 * `memoryStream` logs each chunk so a rejoining client replays it instead of
 * re-running the model. Routes opt in by passing the adapter as `durability` on
 * their `toServerSentEventsResponse`, and by serving
 * {@link replayGenerationIfResuming} from a `GET`.
 *
 * There is no route-side "detach" helper. A durable response already survives a
 * client disconnect: cancelling it cancels only the reader, while the run keeps
 * draining into the log to completion, so a mount-time `joinRun` tails it to the
 * end. The library owns the run's lifetime once `durability` is set.
 *
 * `memoryStream` keeps logs in a process-global map: development and
 * single-process deployments only. Swap it for `durableStream(request, {
 * server })` from `@tanstack/ai-durable-stream` in production; nothing else here
 * changes.
 */

/**
 * The GET half of `joinRun`: replay a run when the request carries a resume
 * offset, otherwise `null` so the route can fall through to whatever else its
 * GET serves (the generation routes also answer `reconstructGeneration` there).
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
