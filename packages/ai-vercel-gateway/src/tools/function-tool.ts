import { makeStructuredOutputCompatible } from '@tanstack/openai-base'
import type { JSONSchema, Tool } from '@tanstack/ai'

export interface FunctionTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
    strict?: boolean
  }
}

export function convertFunctionToolToAdapterFormat(tool: Tool): FunctionTool {
  const inputSchema = (tool.inputSchema ?? {
    type: 'object',
    properties: {},
    required: [],
  }) as JSONSchema

  if (inputSchema.type === 'object' && !inputSchema.properties) {
    inputSchema.properties = {}
  }

  const jsonSchema = makeStructuredOutputCompatible(
    inputSchema,
    inputSchema.required || [],
  )

  jsonSchema.additionalProperties = false

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: jsonSchema,
      strict: true,
    },
  }
}
