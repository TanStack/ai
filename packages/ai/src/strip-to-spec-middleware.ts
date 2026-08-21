import type { ChatMiddleware } from './activities/chat/middleware/types'
import type { StreamChunk, TokenUsage } from './types'
import { EventType } from './types'
import { toSpecTokenUsage } from './utilities/ag-ui-usage'
import {
  tanstackMetadata,
  withTanstackMetadata,
} from './utilities/merge-metadata'
import { isSpecTopLevelKey } from './utilities/spec-event-keys'

function isTanstackUsage(usage: unknown): usage is TokenUsage {
  return (
    typeof usage === 'object' &&
    usage != null &&
    !Array.isArray(usage) &&
    'promptTokens' in usage
  )
}

/**
 * Delete unknown top-level keys from a stream chunk.
 * Keep only AG-UI spec keys for this event type.
 * Convert TanStack TokenUsage objects to the spec `usage[]` array.
 */
export function stripToSpec(chunk: StreamChunk): StreamChunk {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(chunk)) {
    if (isSpecTopLevelKey(chunk.type, key) && value !== undefined) {
      out[key] = value
    }
  }

  if (
    (chunk.type === EventType.RUN_FINISHED ||
      chunk.type === EventType.RUN_ERROR) &&
    isTanstackUsage(out.usage)
  ) {
    const model = tanstackMetadata(chunk)?.model
    const { usage, leftover } = toSpecTokenUsage(out.usage, {
      model: typeof model === 'string' ? model : undefined,
    })
    out.usage = usage
    if (leftover !== undefined) {
      return withTanstackMetadata(out as StreamChunk, {
        usage: leftover,
      }) as StreamChunk
    }
  }

  return out as StreamChunk
}

/**
 * Middleware that drops non-spec top-level keys from events before they
 * reach AG-UI wire consumers. Internal chat() state still sees un-stripped chunks.
 */
export function stripToSpecMiddleware(): ChatMiddleware {
  return {
    name: 'strip-to-spec',
    onChunk(_ctx, chunk) {
      return stripToSpec(chunk)
    },
  }
}
