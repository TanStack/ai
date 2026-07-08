import type { ChatContentCacheControl } from '@openrouter/sdk/models'
import type { JSONSchema, Tool } from '@tanstack/ai'

export interface FunctionTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
  /**
   * Anthropic-style prompt-cache breakpoint for the tool definition.
   *
   * The SDK accepts this camelCase field as a top-level sibling of `function`
   * and remaps it to `cache_control` on the wire (its outbound Zod schema
   * strips an unrecognized snake_case `cache_control`, so the field must be
   * `cacheControl`). Forwarding it lets callers cache tool definitions through
   * OpenRouter exactly as `@tanstack/ai-anthropic` does directly. Uses the
   * SDK's `ChatContentCacheControl` type, matching `OpenRouterSystemPromptMetadata`.
   */
  cacheControl?: ChatContentCacheControl
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

  // Forward an optional cache-control marker so OpenRouter can cache the tool
  // definition (Anthropic prompt caching). Mirrors
  // `convertCustomToolToAdapterFormat` in `@tanstack/ai-anthropic`. The SDK
  // remaps `cacheControl` -> `cache_control` on the wire; a snake_case key is
  // silently stripped by its outbound schema.
  //
  // `Tool.metadata` is `Record<string, any>`, so the field is already
  // assignable here — the annotation narrows it without a cast.
  const cacheControl: ChatContentCacheControl | null | undefined =
    tool.metadata?.cacheControl

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: inputSchema,
    },
    // Only present when supplied — additive and non-breaking.
    ...(cacheControl ? { cacheControl } : {}),
  }
}
