import type OpenAI from 'openai'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type WebSearchToolConfig = OpenAI.Responses.WebSearchTool

/** @deprecated Renamed to `WebSearchToolConfig`. Will be removed in a future release. */
export type WebSearchTool = WebSearchToolConfig

export type OpenAIWebSearchTool = ProviderTool<'openai', 'web_search'>

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
 * Creates a standard Tool from WebSearchTool parameters
 */
export function webSearchTool(
  toolData: WebSearchToolConfig,
): OpenAIWebSearchTool {
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'web_search',
    description: 'Search the web',
    metadata: toolData,
  } as unknown as OpenAIWebSearchTool
}
