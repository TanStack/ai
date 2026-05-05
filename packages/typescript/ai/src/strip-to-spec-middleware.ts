import type { ChatMiddleware } from './activities/chat/middleware/types'
import type { StreamChunk } from './types'

/**
 * Strip only the deprecated nested `error` object from RUN_ERROR events.
 * The flat `message`/`code` fields are the spec-compliant form.
 *
 * All other fields pass through unchanged. @ag-ui/core's BaseEventSchema
 * uses `.passthrough()`, so extra fields (model, content, usage,
 * finishReason, toolName, stepId, etc.) are allowed and won't break
 * spec validation or verifyEvents.
 */
export function stripToSpec(chunk: StreamChunk): StreamChunk {
  // Only strip the deprecated nested error object from RUN_ERROR
  if (
    (chunk as StreamChunk & { type: string }).type === 'RUN_ERROR' &&
    'error' in chunk
  ) {
    const { error: _deprecated, ...rest } = chunk as Record<string, unknown>
    return rest as StreamChunk
  }
  return chunk
}

/**
 * Middleware that ensures events are AG-UI spec compliant.
 * Currently only strips the deprecated nested `error` object from RUN_ERROR.
 * All other fields pass through unchanged (passthrough allowed by spec).
 */
export function stripToSpecMiddleware(): ChatMiddleware {
  return {
    name: 'strip-to-spec',
    onChunk(_ctx, chunk) {
      return stripToSpec(chunk)
    },
  }
}
