import { EventType } from '../types'
import type { StreamChunk, TokenUsage } from '../types'
import type { AdapterYieldChunk } from './adapter-yield-chunk'
import { toSpecTokenUsage } from './ag-ui-usage'
import type { MetadataRecord } from './merge-metadata'
import { withTanstackMetadata } from './merge-metadata'
import { specKeysFor } from './spec-event-keys'

function isTanstackUsage(usage: unknown): usage is TokenUsage {
  return (
    typeof usage === 'object' &&
    usage != null &&
    !Array.isArray(usage) &&
    'promptTokens' in usage
  )
}

export function normalizeStreamChunk(
  chunk: AdapterYieldChunk,
): Array<StreamChunk> {
  const specKeys = specKeysFor(chunk.type)
  const source = chunk as Record<string, unknown>
  const specChunk: Record<string, unknown> & {
    metadata?: MetadataRecord | null
  } = {}

  for (const key of Object.keys(chunk)) {
    if (specKeys.has(key)) {
      specChunk[key] = source[key]
    }
  }

  const tanstack: MetadataRecord = {}

  if (isTanstackUsage(specChunk.usage)) {
    const { usage, leftover } = toSpecTokenUsage(specChunk.usage, {
      model: chunk.model,
    })
    specChunk.usage = usage
    if (leftover !== undefined) {
      tanstack.usage = leftover
    }
  }

  if (
    chunk.model !== undefined &&
    chunk.type !== EventType.TEXT_MESSAGE_CONTENT &&
    chunk.type !== EventType.TOOL_CALL_ARGS
  ) {
    tanstack.model = chunk.model
  }

  if (chunk.finishReason !== undefined) {
    tanstack.finishReason = chunk.finishReason
  }

  const interruptErrors = chunk['tanstack:interruptErrors']
  if (interruptErrors !== undefined) {
    tanstack.interruptErrors = interruptErrors
  }

  if (chunk.type === EventType.CUSTOM || chunk.type === EventType.RUN_ERROR) {
    if (chunk.threadId !== undefined) {
      tanstack.threadId = chunk.threadId
    }
    if (chunk.runId !== undefined) {
      tanstack.runId = chunk.runId
    }
  }

  const normalized =
    Object.keys(tanstack).length === 0
      ? specChunk
      : withTanstackMetadata(specChunk, tanstack)

  if (chunk.type === EventType.TOOL_CALL_END && chunk.result !== undefined) {
    const parentMessageId = source.parentMessageId
    const resultChunk: Record<string, unknown> & {
      metadata?: MetadataRecord | null
    } = {
      type: EventType.TOOL_CALL_RESULT,
      toolCallId: chunk.toolCallId,
      content: Array.isArray(chunk.result)
        ? JSON.stringify(chunk.result)
        : chunk.result,
      messageId:
        typeof parentMessageId === 'string' && parentMessageId !== ''
          ? parentMessageId
          : chunk.toolCallId,
    }
    if (chunk.state === 'output-error') {
      return [
        normalized as unknown as StreamChunk,
        withTanstackMetadata(resultChunk, {
          state: chunk.state,
        }) as unknown as StreamChunk,
      ]
    }
    return [
      normalized as unknown as StreamChunk,
      resultChunk as unknown as StreamChunk,
    ]
  }

  return [normalized as unknown as StreamChunk]
}
