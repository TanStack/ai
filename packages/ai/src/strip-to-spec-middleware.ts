import type { StreamChunk } from './types'
import { EventType } from './types'
import type { AdapterYieldChunk } from './utilities/adapter-yield-chunk'
import { isTanstackUsage, toSpecTokenUsage } from './utilities/ag-ui-usage'
import {
  tanstackMetadata,
  withTanstackMetadata,
} from './utilities/merge-metadata'
import { normalizeStreamChunk } from './utilities/normalize-stream-chunk'
import { isSpecTopLevelKey } from './utilities/spec-event-keys'

export function stripToSpec(
  chunk: StreamChunk | AdapterYieldChunk,
): StreamChunk {
  const out: Record<string, unknown> = {}
  const entries = Object.entries(chunk)
  for (const [key, value] of entries) {
    const isSpecKey = isSpecTopLevelKey(chunk.type, key) && value !== undefined
    if (isSpecKey) {
      out[key] = value
    }
  }

  const isChunk =
    (chunk.type === EventType.RUN_FINISHED ||
      chunk.type === EventType.RUN_ERROR) &&
    isTanstackUsage(out.usage)
  if (isChunk) {
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

export function toWireChunk(
  chunk: StreamChunk | AdapterYieldChunk,
): StreamChunk {
  const [normalized] = normalizeStreamChunk(chunk)
  return stripToSpec(normalized ?? chunk)
}
