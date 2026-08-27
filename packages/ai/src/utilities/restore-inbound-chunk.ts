import { EventType } from '../types'
import type { StreamChunk } from '../types'
import type { AdapterYieldChunk } from './adapter-yield-chunk'
import { isTanstackUsage, rebuildTokenUsage } from './ag-ui-usage'
import { tanstackMetadata } from './merge-metadata'

export function restorePublicUsage(chunk: StreamChunk): StreamChunk {
  const isInvalidChunk =
    (chunk.type === EventType.RUN_FINISHED ||
      chunk.type === EventType.RUN_ERROR) &&
    (Array.isArray(chunk.usage) || isTanstackUsage(chunk.usage))
  if (isInvalidChunk) {
    const rebuilt = rebuildTokenUsage(
      chunk.usage,
      tanstackMetadata(chunk)?.usage,
    )
    if (rebuilt !== undefined) {
      chunk.usage = rebuilt
    }
  }

  const isChunk =
    chunk.type === EventType.TOOL_CALL_START &&
    chunk.toolName === undefined &&
    chunk.toolCallName
  if (isChunk) {
    chunk.toolName = chunk.toolCallName
  }

  const isChunk2 =
    chunk.type === EventType.TOOL_CALL_END && chunk.input === undefined
  if (isChunk2) {
    const input = tanstackMetadata(chunk)?.input
    if (input !== undefined) {
      chunk.input = input
    }
  }

  return chunk
}

export function restoreInboundChunk(chunk: StreamChunk): AdapterYieldChunk {
  restorePublicUsage(chunk)
  const tanstack = tanstackMetadata(chunk)
  const next = chunk as AdapterYieldChunk & Record<string, unknown>

  if (tanstack == null) {
    return next
  }

  const entries = Object.entries(tanstack)
  for (const [key, value] of entries) {
    const shouldSkipKey = key === 'usage' || key === 'interruptErrors'
    if (shouldSkipKey) continue
    const hasNext = next[key] === undefined && value !== undefined
    if (hasNext) {
      next[key] = value
    }
  }

  if (tanstack.interruptErrors !== undefined) {
    next['tanstack:interruptErrors'] = tanstack.interruptErrors
  }

  return next
}
