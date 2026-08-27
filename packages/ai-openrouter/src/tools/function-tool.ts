import type { ChatContentCacheControl } from '@openrouter/sdk/models'
import type { JSONSchema, Tool } from '@tanstack/ai'

export interface FunctionTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
  cacheControl?: ChatContentCacheControl
}

export function convertFunctionToolToAdapterFormat(tool: Tool): FunctionTool {
  // Tool schemas are already converted to JSON Schema in the ai layer
  const inputSchema = (tool.inputSchema ?? {
    type: 'object',
    properties: {},
    required: [],
  }) as JSONSchema

  const cacheControl: ChatContentCacheControl | null | undefined =
    tool.metadata?.cacheControl

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: inputSchema,
    },
    // Only present when supplied — additive and non-breaking.
    ...(cacheControl ? { cacheControl } : {}),
  }
}
