import { makeStructuredOutputCompatible } from './schema-converter'
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
