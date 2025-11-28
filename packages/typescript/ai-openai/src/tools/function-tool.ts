import type OpenAI from 'openai'
import { convertZodToJsonSchema, type Tool } from '@tanstack/ai'

export type FunctionTool = OpenAI.Responses.FunctionTool

/**
 * Converts a standard Tool to OpenAI FunctionTool format
 */
export function convertFunctionToolToAdapterFormat(tool: Tool): FunctionTool {
  // Convert Zod schema to JSON Schema
  const jsonSchema = convertZodToJsonSchema(tool.inputSchema)

  // Determine if we can use strict mode
  // Strict mode requires all properties to be in the required array
  const properties = jsonSchema.properties || {}
  const required = jsonSchema.required || []
  const propertyNames = Object.keys(properties)

  // Only enable strict mode if all properties are required
  // This ensures compatibility with tools that have optional parameters
  const canUseStrict =
    propertyNames.length > 0 &&
    propertyNames.every((prop: string) => required.includes(prop))

  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: {
      ...jsonSchema,
      additionalProperties: false,
    },
    strict: canUseStrict,
  } satisfies FunctionTool
}
