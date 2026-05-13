import type { WebSearchPreviewToolConfig } from '../types/tools'
import type { Tool } from '@tanstack/ai'

export type { WebSearchPreviewToolConfig }

/** @deprecated Renamed to `WebSearchPreviewToolConfig`. Will be removed in a future release. */
export type WebSearchPreviewTool = WebSearchPreviewToolConfig

/**
 * Converts a standard Tool to OpenAI WebSearchPreviewTool format. Force the
 * literal `type: 'web_search_preview'` instead of trusting `metadata.type`,
 * since a hand-authored tool with a missing or wrong `type` would emit a
 * malformed payload while the dispatcher already routed by `tool.name`.
 */
export function convertWebSearchPreviewToolToAdapterFormat(
  tool: Tool,
): WebSearchPreviewToolConfig {
  const metadata = tool.metadata as Omit<WebSearchPreviewToolConfig, 'type'>
  return {
    ...metadata,
    type: 'web_search_preview',
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
