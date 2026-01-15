import type { JSONSchema, Tool } from '@tanstack/ai'
import type OpenAI from 'openai'

export type FunctionTool = OpenAI.Chat.Completions.ChatCompletionTool

/**
 * Converts a standard Tool to Zhipu AI FunctionTool format.
 */
export function convertFunctionToolToAdapterFormat(tool: Tool): FunctionTool {
  const inputSchema = (tool.inputSchema ?? {
    type: 'object',
    properties: {},
    required: [],
  }) as JSONSchema

  // Ensure basic JSON Schema structure
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
      parameters: parameters as any,
    },
  }
}
