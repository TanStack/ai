import type OpenAI from 'openai'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type WebSearchPreviewToolConfig = OpenAI.Responses.WebSearchPreviewTool

/** @deprecated Renamed to `WebSearchPreviewToolConfig`. Will be removed in a future release. */
export type WebSearchPreviewTool = WebSearchPreviewToolConfig

export type OpenAIWebSearchPreviewTool = ProviderTool<
  'openai',
  'web_search_preview'
>

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
 * Creates a standard Tool from WebSearchPreviewTool parameters
 */
export function webSearchPreviewTool(
  toolData: WebSearchPreviewToolConfig,
): OpenAIWebSearchPreviewTool {
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'web_search_preview',
    description: 'Search the web (preview version)',
    metadata: toolData,
  } as unknown as OpenAIWebSearchPreviewTool
}
