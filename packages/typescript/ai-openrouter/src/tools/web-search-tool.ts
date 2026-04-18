import type { ProviderTool, Tool } from '@tanstack/ai'

export interface WebSearchToolConfig {
  type: 'web_search'
  web_search: {
    engine?: 'native' | 'exa'
    max_results?: number
    search_prompt?: string
  }
}

/** @deprecated Renamed to `WebSearchToolConfig`. Will be removed in a future release. */
export type WebSearchTool = WebSearchToolConfig

export type OpenRouterWebSearchTool = ProviderTool<'openrouter', 'web_search'>

/**
 * Converts a standard Tool to OpenRouter WebSearchTool format.
 */
export function convertWebSearchToolToAdapterFormat(
  tool: Tool,
): WebSearchToolConfig {
  const metadata = tool.metadata as WebSearchToolConfig
  return metadata
}

/**
 * Creates a branded web search tool for use with OpenRouter models.
 *
 * The web search tool is available across all OpenRouter chat models via the
 * OpenRouter gateway. Pass the returned value in the `tools` array when calling
 * a chat function.
 */
export function webSearchTool(options?: {
  engine?: 'native' | 'exa'
  maxResults?: number
  searchPrompt?: string
}): OpenRouterWebSearchTool {
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'web_search',
    description: '',
    metadata: {
      type: 'web_search' as const,
      web_search: {
        engine: options?.engine,
        max_results: options?.maxResults,
        search_prompt: options?.searchPrompt,
      },
    },
  } as unknown as OpenRouterWebSearchTool
}
