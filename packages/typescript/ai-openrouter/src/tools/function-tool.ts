import { convertZodToJsonSchema } from '@tanstack/ai'
import type { Tool } from '@tanstack/ai'

export interface FunctionTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

export function convertFunctionToolToAdapterFormat(tool: Tool): FunctionTool {
  const jsonSchema = tool.inputSchema
    ? convertZodToJsonSchema(tool.inputSchema)
    : {}

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: jsonSchema || {},
    },
  }
}
