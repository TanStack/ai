import { EventType } from '../types'
import type { StreamChunk } from '../types'
import type { AdapterYieldChunk } from './adapter-yield-chunk'
import { isTanstackUsage, rebuildTokenUsage } from './ag-ui-usage'
import { tanstackMetadata } from './merge-metadata'

/**
 * Rebuild TanStack `TokenUsage` (`promptTokens`) from spec `usage[]` plus
 * leftover fields in `metadata.tanstack.usage`. Restore in-process aliases
 * that the wire does not keep (`toolName`, `TOOL_CALL_END.input`). Mutates
 * in place so WeakMap run-id stamps stay attached.
 */
export function restorePublicUsage(chunk: StreamChunk): StreamChunk {
  if (
    (chunk.type === EventType.RUN_FINISHED ||
      chunk.type === EventType.RUN_ERROR) &&
    (Array.isArray(chunk.usage) || isTanstackUsage(chunk.usage))
  ) {
    const rebuilt = rebuildTokenUsage(
      chunk.usage,
      tanstackMetadata(chunk)?.usage,
    )
    if (rebuilt !== undefined) {
      chunk.usage = rebuilt
    }
  }

  if (
    chunk.type === EventType.TOOL_CALL_START &&
    chunk.toolName === undefined &&
    chunk.toolCallName
  ) {
    chunk.toolName = chunk.toolCallName
  }

  if (chunk.type === EventType.TOOL_CALL_END && chunk.input === undefined) {
    const input = tanstackMetadata(chunk)?.input
    if (input !== undefined) {
      chunk.input = input
    }
  }

  return chunk
}

/**
 * Rebuild the pre-wire chunk shape after SSE/HTTP/WS ingest.
 * Copies `metadata.tanstack` extras back to top-level fields and rebuilds
 * TanStack `TokenUsage` from spec `usage[]` when present.
 */
export function restoreInboundChunk(chunk: StreamChunk): AdapterYieldChunk {
  restorePublicUsage(chunk)
  const tanstack = tanstackMetadata(chunk)
  const next = chunk as AdapterYieldChunk & Record<string, unknown>

  if (tanstack == null) {
    return next
  }

  for (const [key, value] of Object.entries(tanstack)) {
    if (key === 'usage' || key === 'interruptErrors') continue
    if (next[key] === undefined && value !== undefined) {
      next[key] = value
    }
  }

  if (tanstack.interruptErrors !== undefined) {
    next['tanstack:interruptErrors'] = tanstack.interruptErrors
  }

  return next
}
