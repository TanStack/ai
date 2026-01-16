import type { Tool } from '@tanstack/ai'

/**
 * Definition of the Z.AI Web Search tool structure.
 */
export interface ZaiWebSearchTool {
  type: 'web_search'
  web_search?: {
    enable?: boolean
    search_query?: string
    search_result?: boolean
  }
}

/**
 * Alias for the Z.AI Web Search tool.
 */
export type WebSearchTool = ZaiWebSearchTool

/**
 * Converts a standard Tool to Zhipu AI WebSearchTool format
 */
export function convertWebSearchToolToAdapterFormat(
  tool: Tool,
): ZaiWebSearchTool {
  const metadata = tool.metadata as ZaiWebSearchTool['web_search']
  return {
    type: 'web_search',
    web_search: metadata,
  }
}

/**
 * Creates a standard Tool from WebSearchTool parameters
 */
export function webSearchTool(config?: ZaiWebSearchTool['web_search']): Tool {
  return {
    name: 'web_search',
    description: 'Search the web',
    metadata: config || { enable: true },
  }
}
