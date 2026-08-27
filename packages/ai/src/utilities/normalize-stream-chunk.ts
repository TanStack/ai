import { EventType } from '../types'
import type { StreamChunk, ToolCallResultEvent } from '../types'
import type { AdapterYieldChunk } from './adapter-yield-chunk'
import { isTanstackUsage, toSpecTokenUsage } from './ag-ui-usage'
import type { MetadataRecord } from './merge-metadata'
import { withTanstackMetadata } from './merge-metadata'
import { reasoningEncryptedValue } from './reasoning-encrypted-value'
import { specKeysFor } from './spec-event-keys'

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function encryptedValueExtras(chunk: AdapterYieldChunk): Array<StreamChunk> {
  const extras: Array<StreamChunk> = []
  const timestamp =
    'timestamp' in chunk && typeof chunk.timestamp === 'number'
      ? chunk.timestamp
      : undefined

  const isInvalidChunk =
    typeof chunk.signature === 'string' && chunk.signature !== ''
  if (isInvalidChunk) {
    const source = chunk as Record<string, unknown>
    const toolCallId = stringField(source.toolCallId)
    const entityId =
      stringField(chunk.stepId) ??
      stringField(source.stepName) ??
      stringField(source.messageId) ??
      toolCallId
    if (entityId !== undefined) {
      extras.push(
        reasoningEncryptedValue({
          subtype: toolCallId && !chunk.stepId ? 'tool-call' : 'message',
          entityId,
          encryptedValue: chunk.signature,
          timestamp,
        }),
      )
    }
  }

  if (chunk.type === EventType.TOOL_CALL_START) {
    const thoughtSignature = stringField(
      (chunk.metadata as { thoughtSignature?: unknown } | undefined)
        ?.thoughtSignature,
    )
    const hasThoughtSignature =
      thoughtSignature !== undefined && chunk.toolCallId
    if (hasThoughtSignature) {
      extras.push(
        reasoningEncryptedValue({
          subtype: 'tool-call',
          entityId: chunk.toolCallId,
          encryptedValue: thoughtSignature,
          timestamp,
        }),
      )
    }
  }

  return extras
}

function copySpecFields(
  chunk: AdapterYieldChunk,
  source: Record<string, unknown>,
): Record<string, unknown> & { metadata?: MetadataRecord | null } {
  const specKeys = specKeysFor(chunk.type)
  const specChunk: Record<string, unknown> & {
    metadata?: MetadataRecord | null
  } = {}
  const keys = Object.keys(chunk)
  for (const key of keys) {
    if (specKeys.has(key)) {
      specChunk[key] = source[key]
    }
  }
  if (chunk.type === EventType.TOOL_CALL_START) {
    const hasSpecChunk = specChunk.toolCallName === undefined && chunk.toolName
    if (hasSpecChunk) {
      specChunk.toolCallName = chunk.toolName
    }
  }
  const isChunk = chunk.type === EventType.RUN_ERROR && chunk.error != null
  if (isChunk) {
    const hasSpecChunk2 = specChunk.message === undefined && chunk.error.message
    if (hasSpecChunk2) {
      specChunk.message = chunk.error.message
    }
    const hasSpecChunk3 =
      specChunk.code === undefined && chunk.error.code !== undefined
    if (hasSpecChunk3) {
      specChunk.code = chunk.error.code
    }
  }
  return specChunk
}

function leftoverSkipKeys(chunk: AdapterYieldChunk): Set<string> {
  const skipLeftover = new Set(['result', 'error', 'tanstack:interruptErrors'])
  const hasChunk =
    chunk.type === EventType.TEXT_MESSAGE_CONTENT ||
    chunk.type === EventType.TOOL_CALL_ARGS
  if (hasChunk) {
    skipLeftover.add('model')
    skipLeftover.add('content')
    skipLeftover.add('args')
  }
  if (chunk.type === EventType.TOOL_CALL_START) {
    skipLeftover.add('toolName')
  }
  return skipLeftover
}

function collectTanstackMetadata(
  chunk: AdapterYieldChunk,
  source: Record<string, unknown>,
  specChunk: Record<string, unknown>,
): MetadataRecord {
  const tanstack: MetadataRecord = {}
  const hasChunk =
    chunk.model !== undefined &&
    chunk.type !== EventType.TEXT_MESSAGE_CONTENT &&
    chunk.type !== EventType.TOOL_CALL_ARGS
  if (hasChunk) {
    tanstack.model = chunk.model
  }
  if (chunk.finishReason !== undefined) {
    tanstack.finishReason = chunk.finishReason
  }
  const interruptErrors = chunk['tanstack:interruptErrors']
  if (interruptErrors !== undefined) {
    tanstack.interruptErrors = interruptErrors
  }
  const hasChunk2 =
    chunk.type === EventType.CUSTOM || chunk.type === EventType.RUN_ERROR
  if (hasChunk2) {
    if (chunk.threadId !== undefined) {
      tanstack.threadId = chunk.threadId
    }
    if (chunk.runId !== undefined) {
      tanstack.runId = chunk.runId
    }
  }
  const specKeys = specKeysFor(chunk.type)
  const skipLeftover = leftoverSkipKeys(chunk)
  const keys = Object.keys(chunk)
  for (const key of keys) {
    const shouldSkipSpecKeys = specKeys.has(key) || skipLeftover.has(key)
    if (shouldSkipSpecKeys) continue
    if (tanstack[key] !== undefined) continue
    const value = source[key]
    if (value !== undefined) {
      tanstack[key] = value
    }
  }
  const isChunk =
    (chunk.type === EventType.RUN_FINISHED ||
      chunk.type === EventType.RUN_ERROR) &&
    isTanstackUsage(specChunk.usage)
  if (isChunk) {
    const { usage, leftover } = toSpecTokenUsage(specChunk.usage, {
      model: typeof chunk.model === 'string' ? chunk.model : undefined,
    })
    specChunk.usage = usage
    if (leftover !== undefined) {
      tanstack.usage = leftover
    }
  }
  return tanstack
}

function toolCallEndResultChunks(
  chunk: AdapterYieldChunk,
  source: Record<string, unknown>,
): Array<StreamChunk> {
  const isIncompleteChunk =
    chunk.type !== EventType.TOOL_CALL_END || chunk.result === undefined
  if (isIncompleteChunk) {
    return []
  }
  const parentMessageId = source.parentMessageId
  const resultChunk: ToolCallResultEvent = {
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
      {
        ...resultChunk,
        metadata: { tanstack: { state: chunk.state } },
      },
    ]
  }
  return [resultChunk]
}

export function normalizeStreamChunk(
  chunk: AdapterYieldChunk,
): Array<StreamChunk> {
  const source = chunk as Record<string, unknown>
  const specChunk = copySpecFields(chunk, source)
  const tanstack = collectTanstackMetadata(chunk, source, specChunk)
  const normalized =
    Object.keys(tanstack).length === 0
      ? specChunk
      : withTanstackMetadata(specChunk, tanstack)
  return [
    normalized as StreamChunk,
    ...toolCallEndResultChunks(chunk, source),
    ...encryptedValueExtras(chunk),
  ]
}
