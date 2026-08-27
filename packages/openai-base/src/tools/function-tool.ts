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
