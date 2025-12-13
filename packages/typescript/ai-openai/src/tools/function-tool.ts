import { convertZodToOpenAISchema } from '../utils/schema-converter'
import type { Tool } from '@tanstack/ai'
import type OpenAI from 'openai'

export type FunctionTool = OpenAI.Responses.FunctionTool

/**
 * Converts a standard Tool to OpenAI FunctionTool format.
 *
 * Uses the OpenAI-specific schema converter which applies strict mode transformations:
 * - All properties in required array
 * - Optional fields made nullable
 * - additionalProperties: false
 *
 * This enables strict mode for all tools automatically.
 */
export function convertFunctionToolToAdapterFormat(tool: Tool): FunctionTool {
  // Convert Zod schema to OpenAI-compatible JSON Schema (with strict mode transformations)
  const jsonSchema = tool.inputSchema
    ? convertZodToOpenAISchema(tool.inputSchema)
    : {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      }

  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: jsonSchema,
    strict: true, // Always use strict mode since our schema converter handles the requirements
  } satisfies FunctionTool
}
