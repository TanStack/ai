import { makeMistralStructuredOutputCompatible } from '../utils/schema-converter'
import type { JSONSchema, Tool } from '@tanstack/ai'
import type { ChatCompletionTool } from '../message-types'

export type FunctionTool = ChatCompletionTool

/**
 * Converts a standard Tool to Mistral ChatCompletionTool format.
 *
 * Tool schemas are already converted to JSON Schema in the ai layer.
 * We apply Mistral-specific transformations for strict mode:
 * - All properties in required array
 * - Optional fields made nullable
 * - additionalProperties: false
 */
export function convertFunctionToolToAdapterFormat(tool: Tool): FunctionTool {
  const baseSchema = (tool.inputSchema ?? {
    type: 'object',
    properties: {},
    required: [],
  }) as JSONSchema

  const inputSchema: JSONSchema =
    baseSchema.type === 'object' && !baseSchema.properties
      ? { ...baseSchema, properties: {} }
      : { ...baseSchema }

  const jsonSchema = makeMistralStructuredOutputCompatible(
    inputSchema,
    inputSchema.required || [],
  )

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: jsonSchema,
      strict: true,
    },
  } satisfies FunctionTool
}
