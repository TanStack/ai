import type OpenAI from 'openai'
import type { JSONSchema, StreamChunk, Tool } from '@tanstack/ai'

export function convertToolsToZAIFormat(
  tools: Array<Tool>,
): Array<OpenAI.Chat.Completions.ChatCompletionTool> {
  return tools.map((tool) => {
    const inputSchema: JSONSchema = tool.inputSchema ?? {
      type: 'object',
      properties: {},
      required: [],
    }

    const parameters: JSONSchema = { ...inputSchema }
    if (parameters.type === 'object') {
      parameters.additionalProperties ??= false
      parameters.required ??= []
      parameters.properties ??= {}
    }

    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters,
      },
    }
  })
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
