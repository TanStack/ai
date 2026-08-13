import {
  isStrictModeCompatible,
  makeStructuredOutputCompatible,
  stripUnsupportedFormats,
} from '../utils/schema-converter'
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
 * This enables strict mode for tools whose schemas fit OpenAI's strict subset.
 *
 * Schemas using keywords outside that subset (`oneOf`/`allOf`/`not`/`$ref`/
 * `$defs` — common with MCP servers like Notion) can't be coerced to a
 * strict-valid shape, and `strict: true` would make the Responses API reject
 * the ENTIRE request with a 400. Such tools are emitted with `strict: false`
 * (their schema passed through, only unsupported `format` keywords stripped) so
 * they stay callable.
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

  // Schema outside OpenAI's strict subset: send non-strict so the tool still
  // works instead of 400-ing the whole request.
  if (!isStrictModeCompatible(inputSchema)) {
    return {
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: stripUnsupportedFormats(inputSchema),
      strict: false,
    }
  }

  // Shallow-copy the converter's result before mutating — a subclass-supplied
  // schemaConverter has no contract requirement to return a fresh object;
  // mutating in place could corrupt the caller's tool definition.
  const jsonSchema = {
    ...schemaConverter(inputSchema, inputSchema.required || []),
  }
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
