import type { JSONSchema, Tool } from '@tanstack/ai'

export interface FunctionTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

/**
 * Converts a standard Tool to OpenRouter FunctionTool format.
 *
 * Tool schemas are already converted to JSON Schema in the ai layer.
 */
export function convertFunctionToolToAdapterFormat(tool: Tool): FunctionTool {
  // Tool schemas are already converted to JSON Schema in the ai layer
  const inputSchema = (tool.inputSchema ?? {
    type: 'object',
    properties: {},
    required: [],
  }) as JSONSchema

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: inputSchema,
    },
  }
}
