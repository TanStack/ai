import { makeMistralStructuredOutputCompatibleWithMap } from '../utils/schema-converter'
import type { JSONSchema, Tool } from '@tanstack/ai'
import type { ChatCompletionTool } from '../message-types'

export type FunctionTool = ChatCompletionTool

/**
 * Converts a standard Tool to Mistral ChatCompletionTool format.
 *
 * Tool schemas are already JSON Schema in the ai layer. When the schema can
 * be inverted, rewrite it for strict mode (required, nullable optionals,
 * `additionalProperties: false`) and set `strict: true`. Otherwise leave the
 * schema intact and set `strict: false`.
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

  const { schema: jsonSchema, strict } =
    makeMistralStructuredOutputCompatibleWithMap(
      inputSchema,
      inputSchema.required || [],
    )

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: jsonSchema,
      strict,
    },
  } satisfies FunctionTool
}
