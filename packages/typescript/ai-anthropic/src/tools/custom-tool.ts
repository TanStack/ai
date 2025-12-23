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
  input_schema: {
    type: 'object'
    properties: Record<string, any> | null
    required?: Array<string> | null
  }

  cache_control?: CacheControl | null
}

export function convertCustomToolToAdapterFormat(tool: Tool): CustomTool {
  const metadata =
    (tool.metadata as { cacheControl?: CacheControl | null } | undefined) || {}

  // Tool schemas are already converted to JSON Schema in the ai layer
  const jsonSchema = (tool.inputSchema ?? {
    type: 'object',
    properties: {},
    required: [],
  }) as JSONSchema

  const inputSchema = {
    type: 'object' as const,
    properties: jsonSchema.properties || null,
    required: jsonSchema.required || null,
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
