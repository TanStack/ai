import type { ChatMiddleware } from './activities/chat/middleware/types'
import type { StreamChunk } from './types'

/**
 * Fields to always strip from events.
 *
 * - `rawEvent`: Debug-only provider payload, potentially large. Not for wire.
 */
const ALWAYS_STRIP = new Set(['rawEvent'])

/**
 * Per-event-type fields to strip. Only deprecated aliases and fields that
 * conflict with the spec are removed. Extra fields are allowed by @ag-ui/core's
 * BaseEventSchema (.passthrough()), so we keep useful extensions like `model`,
 * `content`, `usage`, `finishReason`, `input`, `result`, etc.
 */
const STRIP_BY_TYPE: Record<string, Set<string>> = {
  TOOL_CALL_START: new Set(['toolName']),
  TOOL_CALL_END: new Set(['toolName']),
  RUN_ERROR: new Set(['error']),
  STEP_STARTED: new Set(['stepId']),
  STEP_FINISHED: new Set(['stepId']),
  STATE_SNAPSHOT: new Set(['state']),
}

/**
 * Strip deprecated aliases and debug fields from a StreamChunk.
 *
 * @ag-ui/core's BaseEventSchema uses `.passthrough()`, so extra fields
 * (model, content, usage, finishReason, etc.) are allowed and won't break
 * spec validation. We only strip:
 * - Deprecated field aliases (toolName, stepId, state) to nudge consumers
 *   toward spec names (toolCallName, stepName, snapshot)
 * - The deprecated nested `error` object on RUN_ERROR (spec uses flat message/code)
 * - `rawEvent` (debug payload, potentially large)
 */
export function stripToSpec(chunk: StreamChunk): StreamChunk {
  const typeStrip = STRIP_BY_TYPE[chunk.type]
  if (!typeStrip && ALWAYS_STRIP.size === 0) return chunk

  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(chunk)) {
    if (ALWAYS_STRIP.has(key)) continue
    if (typeStrip?.has(key)) continue
    result[key] = value
  }

  return result as StreamChunk
}

/**
 * Middleware that strips deprecated aliases and debug fields from events.
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
