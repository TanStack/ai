import type { JSONSchema, Tool } from '@tanstack/ai'

/**
 * Anthropic-style ephemeral cache-control marker. The OpenRouter SDK accepts
 * this (camelCase) on a function tool and remaps it to `cache_control` on the
 * wire, enabling Anthropic prompt caching of tool definitions.
 */
export interface CacheControl {
  type: 'ephemeral'
  ttl?: '5m' | '1h'
}

export interface FunctionTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
  cacheControl?: CacheControl
}

/**
 * Converts a standard Tool to OpenRouter FunctionTool format.
 *
 * Tool schemas are already converted to JSON Schema in the ai layer.
 */
export function convertFunctionToolToAdapterFormat(tool: Tool): FunctionTool {
  // Tool schemas are already converted to JSON Schema in the ai layer
  const inputSchema = (tool.inputSchema ?? {
    type: 'object',
    properties: {},
    required: [],
  }) as JSONSchema

  const result: FunctionTool = {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: inputSchema,
    },
  }

  // Forward an optional cache-control marker so OpenRouter can cache the tool
  // definition (Anthropic prompt caching). Mirrors
  // `convertCustomToolToAdapterFormat` in `@tanstack/ai-anthropic`. The SDK
  // remaps `cacheControl` -> `cache_control` on the wire; a snake_case key is
  // silently stripped by its outbound schema.
  const cacheControl = (
    tool.metadata as { cacheControl?: CacheControl } | undefined
  )?.cacheControl
  if (cacheControl) {
    result.cacheControl = cacheControl
  }

  return result
}
