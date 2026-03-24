import type { JSONSchema, SchemaInput, Tool } from '@tanstack/ai'
import type { CacheControl } from '../text/text-provider-options'

export interface CustomTool {
  /**
   * The name of the tool.
   */
  name: string
  type: 'custom'
  /**
   * A brief description of what the tool does. Tool descriptions should be as detailed as possible. The more information that the model has about what the tool is and how to use it, the better it will perform. You can use natural language descriptions to reinforce important aspects of the tool input JSON schema.
   */
  description: string
  /**
   * This defines the shape of the input that your tool accepts and that the model will produce.
   */
  input_schema: JSONSchema & { type: 'object' }

  cache_control?: CacheControl | null
}

export function convertCustomToolToAdapterFormat(tool: Tool): CustomTool {
  const metadata =
    (tool.metadata as { cacheControl?: CacheControl | null } | undefined) || {}

  // Pass through the full JSON Schema (including oneOf/anyOf for discriminated unions)
  // instead of destructuring only properties/required.
  // type: 'object' is forced last since the Anthropic API requires it at the top level.
  const inputSchema: JSONSchema & { type: 'object' } = {
    ...tool.inputSchema,
    type: 'object',
  }

  return {
    name: tool.name,
    type: 'custom',
    description: tool.description,
    input_schema: inputSchema,
    cache_control: metadata.cacheControl || null,
  }
}

export function customTool(
  name: string,
  description: string,
  inputSchema: SchemaInput,
  cacheControl?: CacheControl | null,
): Tool {
  return {
    name,
    description,
    inputSchema,
    metadata: {
      cacheControl,
    },
  }
}
