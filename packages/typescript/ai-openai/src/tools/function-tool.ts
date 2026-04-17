import { makeOpenAIStructuredOutputCompatible } from '../utils/schema-converter'
import type { JSONSchema, Tool } from '@tanstack/ai'
import type OpenAI from 'openai'

export type FunctionToolConfig = OpenAI.Responses.FunctionTool

/** @deprecated Renamed to `FunctionToolConfig`. Will be removed in a future release. */
export type FunctionTool = FunctionToolConfig

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
export function convertFunctionToolToAdapterFormat(
  tool: Tool,
): FunctionToolConfig {
  // Tool schemas are already converted to JSON Schema in the ai layer
  // Apply OpenAI-specific transformations for strict mode
  const inputSchema = (tool.inputSchema ?? {
    type: 'object',
    properties: {},
    required: [],
  }) as JSONSchema

  const jsonSchema = makeOpenAIStructuredOutputCompatible(
    inputSchema,
    inputSchema.required || [],
  )

  // Ensure additionalProperties is false for strict mode
  jsonSchema.additionalProperties = false

  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: jsonSchema,
    strict: true, // Always use strict mode since our schema converter handles the requirements
  } satisfies FunctionToolConfig
}
