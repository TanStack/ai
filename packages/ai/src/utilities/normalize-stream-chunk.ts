import { EventType } from '../types'
import type { StreamChunk, ToolCallResultEvent } from '../types'
import type { AdapterYieldChunk } from './adapter-yield-chunk'
import { isTanstackUsage, toSpecTokenUsage } from './ag-ui-usage'
import type { MetadataRecord } from './merge-metadata'
import { tanstackMetadata, withTanstackMetadata } from './merge-metadata'
import { finishToolCallArguments } from './tool-call-arguments'
import { reasoningEncryptedValue } from './reasoning-encrypted-value'
import { specKeysFor } from './spec-event-keys'

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function chunkFields(chunk: object) {
  const fields: Record<string, unknown> = {}
  for (const key of Object.keys(chunk)) {
    fields[key] = Reflect.get(chunk, key)
  }
  return fields
}

function encryptedValueExtras(chunk: AdapterYieldChunk): Array<StreamChunk> {
  const extras: Array<StreamChunk> = []
  const timestamp =
    'timestamp' in chunk && typeof chunk.timestamp === 'number'
      ? chunk.timestamp
      : undefined

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
  const source = chunkFields(chunk)
  const specChunk: Record<string, unknown> & {
    metadata?: MetadataRecord | null
  } = {}

  for (const key of Object.keys(chunk)) {
    if (specKeys.has(key)) {
      specChunk[key] = source[key]
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
  // A TOOL_CALL_END sends its arguments once, as `args` made to match
  // `input`. `restorePublicUsage` parses `input` back from it.
  let sendsArgs = false
  if (
    chunk.type === EventType.TOOL_CALL_END &&
    typeof (chunk.args ?? tanstackMetadata(chunk)?.args) === 'string'
  ) {
    sendsArgs = true
    tanstack.args = finishToolCallArguments('', chunk).args
    skipLeftover.add('input')
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

  if (sendsArgs) delete tanstackMetadata(normalized)?.input

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
