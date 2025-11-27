import type OpenAI from 'openai'
import type { Tool } from '@tanstack/ai'

export type FunctionTool = OpenAI.Responses.FunctionTool

/**
 * Converts a standard Tool to OpenAI FunctionTool format
 */
export function convertFunctionToolToAdapterFormat(tool: Tool): FunctionTool {
  // If tool has metadata (created via functionTool helper), use that
  if (tool.metadata) {
    const metadata = tool.metadata as Omit<FunctionTool, 'type'>
    return {
      type: 'function',
      ...metadata,
    }
  }

  // Otherwise, convert directly from tool.function (regular Tool structure)
  // For Responses API, FunctionTool has name at top level, with function containing description and parameters

  // Determine if we can use strict mode
  // Strict mode requires all properties to be in the required array
  const parameters = tool.function.parameters
  const properties = parameters.properties || {}
  const required = parameters.required || []
  const propertyNames = Object.keys(properties)

  // Only enable strict mode if all properties are required
  // This ensures compatibility with tools that have optional parameters
  const canUseStrict =
    propertyNames.length > 0 &&
    propertyNames.every((prop) => required.includes(prop))

  return {
    type: 'function',
    name: tool.function.name,
    description: tool.function.description,
    parameters: {
      ...tool.function.parameters,
      additionalProperties: false,
    },
    strict: canUseStrict,
  } satisfies FunctionTool
}

/**
 * Creates a standard Tool from FunctionTool parameters
 */
export function functionTool(config: Omit<FunctionTool, 'type'>): Tool {
  return {
    type: 'function',
    function: {
      name: config.name,
      description: config.description ?? '',
      parameters: config.parameters ?? {},
    },
    metadata: {
      ...config,
    },
  }
}
