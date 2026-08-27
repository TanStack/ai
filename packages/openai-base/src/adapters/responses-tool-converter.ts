import {
  isStrictModeCompatible,
  makeStructuredOutputCompatible,
  stripUnsupportedFormats,
} from '../utils/schema-converter'
import type { JSONSchema, Tool } from '@tanstack/ai'

export interface ResponsesFunctionTool {
  type: 'function'
  name: string
  description?: string | null
  parameters: Record<string, any> | null
  strict: boolean | null
}

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
