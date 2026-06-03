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
  // Only strip the deprecated nested error object from RUN_ERROR.
  // StreamChunk is a closed discriminated union with no index signature,
  // so we need to bypass the overlap check to destructure into a record
  // and drop the legacy field.
  if (chunk.type === 'RUN_ERROR' && 'error' in chunk) {
    // eslint-disable-next-line no-restricted-syntax -- structural narrowing into a record (see comment above)
    const { error: _deprecated, ...rest } = chunk as unknown as Record<
      string,
      unknown
    >
    // eslint-disable-next-line no-restricted-syntax -- inverse cast; `rest` is structurally a subset of RunErrorEvent
    return rest as unknown as StreamChunk
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
