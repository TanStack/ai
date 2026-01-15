export interface FunctionToolChoice {
  type: 'function'
  function: {
    name: string
  }
}

export interface WebSearchToolChoice {
  type: 'web_search'
}

export type ToolChoice =
  | 'auto'
  | 'none'
  | FunctionToolChoice
  | WebSearchToolChoice
