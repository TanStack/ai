import { convertToolsToProviderFormat } from '../tools/tool-converter'
import type OpenAI from 'openai'
import type { StreamChunk, Tool } from '@tanstack/ai'

export function convertToolsToZAIFormat(
  tools: Array<Tool>,
): Array<OpenAI.Chat.Completions.ChatCompletionTool> {
  // We cast to unknown first because ZaiTool (which includes WebSearchTool) 
  // might strictly not match OpenAI's definition if OpenAI types don't include 'web_search' type.
  return convertToolsToProviderFormat(tools) as unknown as Array<OpenAI.Chat.Completions.ChatCompletionTool>
}

export function mapZAIErrorToStreamChunk(error: any): StreamChunk {
  const timestamp = Date.now()
  const id = `zai-${timestamp}-${Math.random().toString(36).slice(2)}`

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

  return {
    type: 'error',
    id,
    model: 'unknown',
    timestamp,
    error: {
      message,
      code,
    },
  }
}
