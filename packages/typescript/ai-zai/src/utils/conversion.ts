import { convertToolsToProviderFormat } from '../tools/tool-converter'
import type OpenAI from 'openai'
import type { StreamChunk, Tool } from '@tanstack/ai'

/** Cast an event object to StreamChunk. Adapters construct events with string
 *  literal types which are structurally compatible with the EventType enum. */
const asChunk = (chunk: Record<string, unknown>) =>
  chunk as unknown as StreamChunk

/**
 * Converts TanStack Tools to Z.AI compatible OpenAI format.
 * Handles both function tools and web search tools.
 */
export function convertToolsToZAIFormat(
  tools: Array<Tool>,
): Array<OpenAI.Chat.Completions.ChatCompletionTool> {
  return convertToolsToProviderFormat(
    tools,
  ) as unknown as Array<OpenAI.Chat.Completions.ChatCompletionTool>
}

export function mapZAIErrorToStreamChunk(
  error: any,
  runId: string,
  threadId: string,
  model: string,
): StreamChunk {
  const timestamp = Date.now()

  let message = 'Unknown error occurred'
  let code: string | undefined

  if (error && typeof error === 'object') {
    const maybeMessage =
      error.error?.message ?? error.message ?? error.toString?.()

    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      message = maybeMessage
    }

    const maybeCode =
      error.code ?? error.error?.code ?? error.type ?? error.error?.type

    if (typeof maybeCode === 'string' && maybeCode.trim()) {
      code = maybeCode
    } else if (typeof error.status === 'number') {
      code = String(error.status)
    }
  } else if (typeof error === 'string' && error.trim()) {
    message = error
  }

  return asChunk({
    type: 'RUN_ERROR',
    runId,
    threadId,
    message,
    code,
    model,
    timestamp,
    error: {
      message,
      code,
    },
  })
}
