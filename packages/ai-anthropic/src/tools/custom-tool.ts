import type { JSONSchema, SchemaInput, Tool } from '@tanstack/ai'
import type { CacheControl } from '../text/text-provider-options'

export interface CustomToolConfig {
  name: string
  type: 'custom'
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, any> | null
    required?: Array<string> | null
  }

  cache_control?: CacheControl | null
}

/** @deprecated Renamed to `CustomToolConfig`. Will be removed in a future release. */
export type CustomTool = CustomToolConfig

export function convertCustomToolToAdapterFormat(tool: Tool): CustomToolConfig {
  const metadata =
    (tool.metadata as { cacheControl?: CacheControl | null } | undefined) || {}

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
