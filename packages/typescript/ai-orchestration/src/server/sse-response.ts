import { toServerSentEventsResponse } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

/**
 * Convert a workflow stream into an SSE Response. Re-export of
 * `toServerSentEventsResponse` for convenience and discoverability inside
 * orchestration consumers.
 */
export function toWorkflowSSEResponse(
  stream: AsyncIterable<StreamChunk>,
): Response {
  return toServerSentEventsResponse(stream)
}
