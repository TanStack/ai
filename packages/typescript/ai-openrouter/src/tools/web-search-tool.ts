import type { ProviderTool, Tool } from '@tanstack/ai'

/**
 * Stable runtime marker used to identify a `webSearchTool()`-created tool so
 * `convertToolsToProviderFormat` can route it without relying on the mutable
 * public `tool.name`.
 */
export const WEB_SEARCH_TOOL_KIND = 'openrouter.web_search'

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

/** A tool is a webSearchTool() output iff its metadata carries our branded kind marker. */
export function isWebSearchTool(tool: Tool): boolean {
  const kind = (tool.metadata as { __kind?: unknown } | undefined)?.__kind
  return kind === WEB_SEARCH_TOOL_KIND
}

/**
 * Converts a branded web-search tool to OpenRouter's wire format. Throws if
 * the metadata doesn't match the expected shape — callers must gate on
 * `isWebSearchTool()` first.
 */
export function convertWebSearchToolToAdapterFormat(
  tool: Tool,
): WebSearchToolConfig {
  const metadata = tool.metadata as
    | {
        __kind?: unknown
        type?: unknown
        web_search?: unknown
      }
    | undefined
  if (
    !metadata ||
    metadata.__kind !== WEB_SEARCH_TOOL_KIND ||
    metadata.type !== 'web_search' ||
    typeof metadata.web_search !== 'object' ||
    metadata.web_search === null ||
    Array.isArray(metadata.web_search)
  ) {
    throw new Error(
      `convertWebSearchToolToAdapterFormat: tool "${tool.name}" is not a valid webSearchTool() output (missing branded metadata).`,
    )
  }
  return {
    type: 'web_search',
    web_search: metadata.web_search as WebSearchToolConfig['web_search'],
  }
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
      __kind: WEB_SEARCH_TOOL_KIND,
      type: 'web_search' as const,
      web_search: {
        engine: options?.engine,
        max_results: options?.maxResults,
        search_prompt: options?.searchPrompt,
      },
    },
  } as unknown as OpenRouterWebSearchTool
}
