import type OpenAI from 'openai'
import type { Tool } from '@tanstack/ai'

export type WebSearchPreviewToolConfig = OpenAI.Responses.WebSearchPreviewTool

/** @deprecated Renamed to `WebSearchPreviewToolConfig`. Will be removed in a future release. */
export type WebSearchPreviewTool = WebSearchPreviewToolConfig

/**
 * Converts a standard Tool to OpenAI WebSearchPreviewTool format
 */
export function convertWebSearchPreviewToolToAdapterFormat(
  tool: Tool,
): WebSearchPreviewToolConfig {
  const metadata = tool.metadata as WebSearchPreviewToolConfig
  return {
    type: metadata.type,
    search_context_size: metadata.search_context_size,
    user_location: metadata.user_location,
  }
}

/**
 * Creates a standard Tool from WebSearchPreviewTool parameters.
 *
 * Base (non-branded) factory. Providers that need branded return types should
 * re-wrap this in their own package.
 */
export function webSearchPreviewTool(
  toolData: WebSearchPreviewToolConfig,
): Tool {
  return {
    name: 'web_search_preview',
    description: 'Search the web (preview version)',
    metadata: toolData,
  }
}
