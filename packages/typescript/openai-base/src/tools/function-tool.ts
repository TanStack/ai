import { makeStructuredOutputCompatible } from '../utils/schema-converter'
import type { JSONSchema, Tool } from '@tanstack/ai'
import type OpenAI from 'openai'

export type FunctionTool = OpenAI.Responses.FunctionTool

/**
 * Converts a standard Tool to OpenAI FunctionTool format.
 *
 * Tool schemas are already converted to JSON Schema in the ai layer.
 * We apply OpenAI-specific transformations for strict mode:
 * - All properties in required array
 * - Optional fields made nullable
 * - additionalProperties: false
 *
 * This enables strict mode for all tools automatically.
 */
export function convertFunctionToolToAdapterFormat(tool: Tool): FunctionTool {
  const inputSchema = (tool.inputSchema ?? {
    type: 'object',
    properties: {},
    required: [],
  }) as JSONSchema

  const jsonSchema = makeStructuredOutputCompatible(
    inputSchema,
    inputSchema.required || [],
  )

  jsonSchema.additionalProperties = false

  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: jsonSchema,
    strict: true,
  } satisfies FunctionTool
}
