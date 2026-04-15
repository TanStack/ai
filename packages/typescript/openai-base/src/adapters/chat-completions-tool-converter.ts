import { makeStructuredOutputCompatible } from '../utils/schema-converter'
import type { JSONSchema, Tool } from '@tanstack/ai'
import type OpenAI from 'openai'

/**
 * Chat Completions API tool format.
 * This is distinct from the Responses API tool format.
 */
export type ChatCompletionFunctionTool =
  OpenAI.Chat.Completions.ChatCompletionTool

/**
 * Converts a standard Tool to OpenAI Chat Completions ChatCompletionTool format.
 *
 * Tool schemas are already converted to JSON Schema in the ai layer.
 * We apply OpenAI-compatible transformations for strict mode:
 * - All properties in required array
 * - Optional fields made nullable
 * - additionalProperties: false
 *
 * This enables strict mode for all tools automatically.
 */
export function convertFunctionToolToChatCompletionsFormat(
  tool: Tool,
  schemaConverter: (
    schema: Record<string, any>,
    required: Array<string>,
  ) => Record<string, any> = makeStructuredOutputCompatible,
): ChatCompletionFunctionTool {
  const inputSchema = (tool.inputSchema ?? {
    type: 'object',
    properties: {},
    required: [],
  }) as JSONSchema

  const jsonSchema = schemaConverter(inputSchema, inputSchema.required || [])

  // Ensure additionalProperties is false for strict mode
  jsonSchema.additionalProperties = false

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: jsonSchema,
      strict: true,
    },
  } satisfies ChatCompletionFunctionTool
}

/**
 * Converts an array of standard Tools to Chat Completions format.
 * Chat Completions API primarily supports function tools.
 */
export function convertToolsToChatCompletionsFormat(
  tools: Array<Tool>,
  schemaConverter?: (
    schema: Record<string, any>,
    required: Array<string>,
  ) => Record<string, any>,
): Array<ChatCompletionFunctionTool> {
  return tools.map((tool) =>
    convertFunctionToolToChatCompletionsFormat(tool, schemaConverter),
  )
}
