import type { ChatMiddleware } from './activities/chat/middleware/types'
import type { StreamChunk } from './types'
import { isSpecTopLevelKey } from './utilities/spec-event-keys'

/**
 * Delete unknown top-level keys from a stream chunk.
 * Keep only AG-UI spec keys for this event type.
 * Does not move extras into metadata — normalize already did that.
 * If normalize was skipped, extras are dropped.
 */
export function stripToSpec(chunk: StreamChunk): StreamChunk {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(chunk)) {
    if (isSpecTopLevelKey(chunk.type, key) && value !== undefined) {
      out[key] = value
    }
  }
  return out as StreamChunk
}

/**
 * Middleware that drops non-spec top-level keys from events before they
 * reach consumers. Internal state still sees the un-stripped chunks.
 */
export function stripToSpecMiddleware(): ChatMiddleware {
  return {
    name: 'strip-to-spec',
    onChunk(_ctx, chunk) {
      return stripToSpec(chunk)
    },
  }
}
