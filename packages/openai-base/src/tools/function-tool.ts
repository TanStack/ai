import {
  isStrictModeCompatible,
  makeStructuredOutputCompatible,
  stripUnsupportedFormats,
} from '../utils/schema-converter'
import type { FunctionTool as FunctionToolConfig } from 'openai/resources/responses/responses'
import type { JSONSchema, Tool } from '@tanstack/ai'

export type { FunctionToolConfig }

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
 *
 * Some tool schemas (e.g. MCP server tools that use `oneOf`, `$ref`, or
 * `$defs`) cannot be expressed under OpenAI's strict Structured Outputs
 * subset. For those we fall back to a non-strict tool definition — stripping
 * only the formats OpenAI rejects — so the tool is still usable instead of
 * failing the request with a 400 "Invalid schema" error.
 */
export function convertFunctionToolToAdapterFormat(
  tool: Tool,
): FunctionToolConfig {
  const inputSchema = (tool.inputSchema ?? {
    type: 'object',
    properties: {},
    required: [],
  }) as JSONSchema

  if (!isStrictModeCompatible(inputSchema)) {
    return {
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: stripUnsupportedFormats(inputSchema),
      strict: false,
    } satisfies FunctionToolConfig
  }

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
  } satisfies FunctionToolConfig
}
