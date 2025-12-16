import { convertZodToJsonSchema } from '@tanstack/ai'
import type { Tool } from '@tanstack/ai'

/**
 * Cache control settings for tool responses.
 */
export interface CacheControl {
  type: 'ephemeral'
  ttl?: '5m' | '1h'
}

/**
 * Custom tool definition in Claude Agent SDK format.
 */
export interface CustomTool {
  /**
   * The name of the tool.
   */
  name: string
  /**
   * Tool type - always 'custom' for TanStack AI tools.
   */
  type: 'custom'
  /**
   * A brief description of what the tool does.
   * Tool descriptions should be as detailed as possible for better model performance.
   */
  description: string
  /**
   * This defines the shape of the input that your tool accepts.
   */
  input_schema: {
    type: 'object'
    properties: Record<string, unknown> | null
    required?: Array<string> | null
  }
  /**
   * Optional cache control settings.
   */
  cache_control?: CacheControl | null
}

/**
 * Converts a TanStack AI tool to Claude Agent SDK custom tool format.
 *
 * @param tool - TanStack AI tool definition
 * @returns Claude Agent SDK custom tool format
 */
export function convertCustomToolToAdapterFormat(tool: Tool): CustomTool {
  const metadata =
    (tool.metadata as { cacheControl?: CacheControl | null } | undefined) || {}

  // Convert Zod schema to JSON Schema
  const jsonSchema = convertZodToJsonSchema(tool.inputSchema)

  const inputSchema = {
    type: 'object' as const,
    properties: jsonSchema?.properties || null,
    required: jsonSchema?.required || null,
  }

  return {
    name: tool.name,
    type: 'custom',
    description: tool.description,
    input_schema: inputSchema,
    cache_control: metadata.cacheControl || null,
  }
}
