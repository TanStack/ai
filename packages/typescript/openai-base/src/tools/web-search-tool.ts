import type OpenAI from 'openai'
import type { Tool } from '@tanstack/ai'

export type WebSearchToolConfig = OpenAI.Responses.WebSearchTool

/** @deprecated Renamed to `WebSearchToolConfig`. Will be removed in a future release. */
export type WebSearchTool = WebSearchToolConfig

/**
 * Converts a standard Tool to OpenAI WebSearchTool format
 */
export function convertWebSearchToolToAdapterFormat(
  tool: Tool,
): WebSearchToolConfig {
  const metadata = tool.metadata as WebSearchToolConfig
  return metadata
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
