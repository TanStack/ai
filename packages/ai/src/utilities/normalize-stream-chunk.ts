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

  if (typeof chunk.signature === 'string' && chunk.signature !== '') {
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
    if (thoughtSignature !== undefined && chunk.toolCallId) {
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

  if (chunk.type === EventType.TOOL_CALL_START) {
    if (specChunk.toolCallName === undefined && chunk.toolName) {
      specChunk.toolCallName = chunk.toolName
    }
  }

  if (chunk.type === EventType.RUN_ERROR && chunk.error != null) {
    if (specChunk.message === undefined && chunk.error.message) {
      specChunk.message = chunk.error.message
    }
    if (specChunk.code === undefined && chunk.error.code !== undefined) {
      specChunk.code = chunk.error.code
    }
  }

  const tanstack: MetadataRecord = {}

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

  const skipLeftover = new Set(['result', 'error', 'tanstack:interruptErrors'])
  if (
    chunk.type === EventType.TEXT_MESSAGE_CONTENT ||
    chunk.type === EventType.TOOL_CALL_ARGS
  ) {
    skipLeftover.add('model')
    skipLeftover.add('content')
    skipLeftover.add('args')
  }
  if (chunk.type === EventType.TOOL_CALL_START) {
    skipLeftover.add('toolName')
  }
  for (const key of Object.keys(chunk)) {
    if (specKeys.has(key) || skipLeftover.has(key)) continue
    if (tanstack[key] !== undefined) continue
    const value = source[key]
    if (value !== undefined) {
      tanstack[key] = value
    }
  }

  if (
    (chunk.type === EventType.RUN_FINISHED ||
      chunk.type === EventType.RUN_ERROR) &&
    isTanstackUsage(specChunk.usage)
  ) {
    const { usage, leftover } = toSpecTokenUsage(specChunk.usage, {
      model: typeof chunk.model === 'string' ? chunk.model : undefined,
    })
    specChunk.usage = usage
    if (leftover !== undefined) {
      tanstack.usage = leftover
    }
  }

  const normalized =
    Object.keys(tanstack).length === 0
      ? specChunk
      : withTanstackMetadata(specChunk, tanstack)

  const extras = encryptedValueExtras(chunk)
  const main: Array<StreamChunk> = [normalized as StreamChunk]

  if (chunk.type === EventType.TOOL_CALL_END && chunk.result !== undefined) {
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
      main.push({
        ...resultChunk,
        metadata: { tanstack: { state: chunk.state } },
      })
    } else {
      main.push(resultChunk)
    }
  }

  return [...main, ...extras]
}
