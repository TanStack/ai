import { convertZodToGrokSchema } from '../utils/schema-converter'
import type { Tool } from '@tanstack/ai'
import type OpenAI from 'openai'

// Use Chat Completions API tool format (not Responses API)
export type FunctionTool = OpenAI.Chat.Completions.ChatCompletionTool

/**
 * Converts a standard Tool to Grok ChatCompletionTool format.
 *
 * Uses the Grok-specific schema converter which applies strict mode transformations:
 * - All properties in required array
 * - Optional fields made nullable
 * - additionalProperties: false
 *
 * This enables strict mode for all tools automatically.
 */
export function convertFunctionToolToAdapterFormat(tool: Tool): FunctionTool {
  // Convert Zod schema to Grok-compatible JSON Schema (with strict mode transformations)
  const jsonSchema = tool.inputSchema
    ? convertZodToGrokSchema(tool.inputSchema)
    : {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      }

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: jsonSchema,
      strict: true, // Always use strict mode since our schema converter handles the requirements
    },
  } satisfies FunctionTool
}
