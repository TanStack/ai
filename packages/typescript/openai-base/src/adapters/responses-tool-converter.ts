import { makeStructuredOutputCompatible } from '../utils/schema-converter'
import type { JSONSchema, Tool } from '@tanstack/ai'

/**
 * Responses API function tool format.
 * This is distinct from the Chat Completions API tool format.
 *
 * The Responses API uses a flatter structure:
 *   { type: 'function', name: string, description?: string, parameters: object, strict?: boolean }
 *
 * vs. Chat Completions:
 *   { type: 'function', function: { name, description, parameters }, strict?: boolean }
 */
export interface ResponsesFunctionTool {
  type: 'function'
  name: string
  description?: string | null
  parameters: Record<string, any> | null
  strict: boolean | null
}

/**
 * Converts a standard Tool to the Responses API FunctionTool format.
 *
 * Tool schemas are already converted to JSON Schema in the ai layer.
 * We apply OpenAI-compatible transformations for strict mode:
 * - All properties in required array
 * - Optional fields made nullable
 * - additionalProperties: false
 *
 * This enables strict mode for all tools automatically.
 */
export function convertFunctionToolToResponsesFormat(
  tool: Tool,
  schemaConverter: (
    schema: Record<string, any>,
    required: Array<string>,
  ) => Record<string, any> = makeStructuredOutputCompatible,
): ResponsesFunctionTool {
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
    name: tool.name,
    description: tool.description,
    parameters: jsonSchema,
    strict: true,
  }
}

/**
 * Converts an array of standard Tools to Responses API format.
 * The Responses API primarily supports function tools at the base level.
 */
export function convertToolsToResponsesFormat(
  tools: Array<Tool>,
  schemaConverter?: (
    schema: Record<string, any>,
    required: Array<string>,
  ) => Record<string, any>,
): Array<ResponsesFunctionTool> {
  return tools.map((tool) =>
    convertFunctionToolToResponsesFormat(tool, schemaConverter),
  )
}
