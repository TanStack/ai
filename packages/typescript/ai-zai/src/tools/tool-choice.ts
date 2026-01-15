/**
 * Configuration for forcing a specific function tool.
 */
export interface FunctionToolChoice {
  type: 'function'
  function: {
    name: string
  }
}

/**
 * Configuration for forcing the web search tool.
 */
export interface WebSearchToolChoice {
  type: 'web_search'
}

/**
 * Union of possible tool choice configurations.
 * Can be 'auto', 'none', or a specific tool.
 */
export type ToolChoice =
  | 'auto'
  | 'none'
  | FunctionToolChoice
  | WebSearchToolChoice
