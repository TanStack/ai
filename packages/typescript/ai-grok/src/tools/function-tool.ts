import { makeGrokStructuredOutputCompatible } from '../utils/schema-converter'
import type { JSONSchema, Tool } from '@tanstack/ai'
import type OpenAI from 'openai'

// Use Chat Completions API tool format (not Responses API)
export type FunctionTool = OpenAI.Chat.Completions.ChatCompletionTool

/**
 * Converts a standard Tool to Grok ChatCompletionTool format.
 *
 * Tool schemas are already converted to JSON Schema in the ai layer.
 * We apply Grok-specific transformations for strict mode:
 * - All properties in required array
 * - Optional fields made nullable
 * - additionalProperties: false
 *
 * This enables strict mode for all tools automatically.
 */
export function convertFunctionToolToAdapterFormat(tool: Tool): FunctionTool {
  // Tool schemas are already converted to JSON Schema in the ai layer
  // Apply Grok-specific transformations for strict mode
  const inputSchema = (tool.inputSchema ?? {
    type: 'object',
    properties: {},
    required: [],
  }) as JSONSchema

  const jsonSchema = makeGrokStructuredOutputCompatible(
    inputSchema,
    inputSchema.required || [],
  )

  // Ensure additionalProperties is false for strict mode
  jsonSchema.additionalProperties = false

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
