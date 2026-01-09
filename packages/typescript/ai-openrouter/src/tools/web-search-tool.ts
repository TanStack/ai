export interface WebSearchTool {
  type: 'web_search'
  web_search: {
    engine?: 'native' | 'exa'
    max_results?: number
    search_prompt?: string
  }
}

export function createWebSearchTool(options?: {
  engine?: 'native' | 'exa'
  maxResults?: number
  searchPrompt?: string
}): WebSearchTool {
  return {
    type: 'web_search',
    web_search: {
      engine: options?.engine,
      max_results: options?.maxResults,
      search_prompt: options?.searchPrompt,
    },
  }
}
