export interface OpenAICompatibleBaseOptions {
  temperature?: number
  top_p?: number
  max_tokens?: number
  frequency_penalty?: number
  presence_penalty?: number
  stop?: string | Array<string>
  user?: string
}

export interface OpenAICompatibleReasoningOptions {
  reasoning?: {
    effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high'
    summary?: 'auto' | 'detailed'
  }
}

export interface OpenAICompatibleStructuredOutputOptions {
  text?: {
    format: {
      type: string
      name?: string
      schema?: Record<string, unknown>
      strict?: boolean
    }
  }
}

export interface OpenAICompatibleToolsOptions {
  max_tool_calls?: number
  parallel_tool_calls?: boolean
  tool_choice?:
    | 'auto'
    | 'none'
    | 'required'
    | { type: 'function'; function: { name: string } }
}

export interface OpenAICompatibleStreamingOptions {
  stream_options?: { include_usage?: boolean }
}
