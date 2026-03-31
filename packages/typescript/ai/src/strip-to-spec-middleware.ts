import type { ChatMiddleware } from './activities/chat/middleware/types'
import type { StreamChunk } from './types'

/**
 * Set of fields to always strip from events (TanStack extensions not in @ag-ui/core spec).
 */
const ALWAYS_STRIP = new Set(['model', 'rawEvent'])

/**
 * Per-event-type fields to strip. These are TanStack-internal extension fields
 * and deprecated aliases that should not appear on the wire.
 */
const STRIP_BY_TYPE: Record<string, Set<string>> = {
  TEXT_MESSAGE_CONTENT: new Set(['content']),
  TOOL_CALL_START: new Set(['toolName', 'index', 'providerMetadata']),
  TOOL_CALL_ARGS: new Set(['args']),
  TOOL_CALL_END: new Set(['toolName', 'toolCallName', 'input', 'result']),
  RUN_FINISHED: new Set(['finishReason', 'usage']),
  RUN_ERROR: new Set(['error']),
  STEP_STARTED: new Set(['stepId', 'stepType']),
  STEP_FINISHED: new Set(['stepId', 'delta', 'content']),
  STATE_SNAPSHOT: new Set(['state']),
}

/**
 * Strip non-spec fields from a StreamChunk, producing an @ag-ui/core spec-compliant event.
 */
export function stripToSpec(chunk: StreamChunk): StreamChunk {
  const typeStrip = STRIP_BY_TYPE[chunk.type]
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(chunk)) {
    if (ALWAYS_STRIP.has(key)) continue
    if (typeStrip?.has(key)) continue
    result[key] = value
  }

  return result as StreamChunk
}

/**
 * Middleware that strips non-spec fields from events.
 * Should always be the LAST middleware in the chain.
 */
export function stripToSpecMiddleware(): ChatMiddleware {
  return {
    name: 'strip-to-spec',
    onChunk(_ctx, chunk) {
      return stripToSpec(chunk)
    },
  }
}
