import type { StreamChunk } from './types'
import { EventType } from './types'
import type { AdapterYieldChunk } from './utilities/adapter-yield-chunk'
import { isTanstackUsage, toSpecTokenUsage } from './utilities/ag-ui-usage'
import {
  tanstackMetadata,
  withTanstackMetadata,
} from './utilities/merge-metadata'
import { isSpecTopLevelKey } from './utilities/spec-event-keys'

/**
 * Delete unknown top-level keys from a stream chunk.
 * Keep only AG-UI spec keys for this event type.
 * Convert TanStack TokenUsage objects to the spec `usage[]` array.
 */
export function stripToSpec(
  chunk: StreamChunk | AdapterYieldChunk,
): StreamChunk {
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
