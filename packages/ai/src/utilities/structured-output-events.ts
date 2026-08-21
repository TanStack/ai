import { EventType } from '../types'
import type { AdapterYieldChunk } from './adapter-yield-chunk'

export function structuredOutputStartChunk(args: {
  messageId: string
  model: string
  threadId: string
  runId: string
  timestamp?: number
}): AdapterYieldChunk {
  return {
    type: EventType.CUSTOM,
    name: 'structured-output.start',
    value: { messageId: args.messageId },
    model: args.model,
    timestamp: args.timestamp ?? Date.now(),
    threadId: args.threadId,
    runId: args.runId,
  }
}

export function structuredOutputCompleteChunk(args: {
  messageId: string
  model: string
  threadId: string
  runId: string
  object: unknown
  raw: string
  timestamp?: number
}): AdapterYieldChunk {
  return {
    type: EventType.CUSTOM,
    name: 'structured-output.complete',
    value: {
      object: args.object,
      raw: args.raw,
      messageId: args.messageId,
    },
    model: args.model,
    timestamp: args.timestamp ?? Date.now(),
    threadId: args.threadId,
    runId: args.runId,
  }
}
