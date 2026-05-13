import type OpenAI from 'openai'
import type { Tool } from '@tanstack/ai'

export type WebSearchToolConfig = OpenAI.Responses.WebSearchTool

/** @deprecated Renamed to `WebSearchToolConfig`. Will be removed in a future release. */
export type WebSearchTool = WebSearchToolConfig

/**
 * Converts a standard Tool to OpenAI WebSearchTool format. Spread `metadata`
 * first, then force `type: 'web_search'` last to keep the runtime `type`
 * matching the discriminator the dispatcher routed by — otherwise a tool
 * authored by hand with a different `metadata.type` would emit a malformed
 * payload.
 */
export function convertWebSearchToolToAdapterFormat(
  tool: Tool,
): WebSearchToolConfig {
  const metadata = tool.metadata as Omit<WebSearchToolConfig, 'type'>
  return {
    ...metadata,
    type: 'web_search',
  }
}

/**
 * Creates a standard Tool from WebSearchTool parameters.
 *
 * Base (non-branded) factory. Providers that need branded return types should
 * re-wrap this in their own package.
 */
export function webSearchTool(toolData: WebSearchToolConfig): Tool {
  return {
    name: 'web_search',
    description: 'Search the web',
    metadata: toolData,
  }
}
