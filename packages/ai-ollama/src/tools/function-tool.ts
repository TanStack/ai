import type { JSONSchema, Tool } from '@tanstack/ai'
import type { Tool as OllamaTool } from 'ollama'

export function convertFunctionToolToAdapterFormat(tool: Tool): OllamaTool {
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
      parameters: inputSchema as NonNullable<
        OllamaTool['function']['parameters']
      >,
    },
  }
}
