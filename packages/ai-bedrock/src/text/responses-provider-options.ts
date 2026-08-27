export interface BedrockResponsesProviderOptions {
  /** Continue a stored conversation from a prior response. */
  previous_response_id?: string | null
  /** Whether Bedrock retains the response for 30 days (default true). Set false to opt out. */
  store?: boolean | null
  metadata?: { [key: string]: string } | null
  max_output_tokens?: number | null
  temperature?: number | null
  top_p?: number | null
  parallel_tool_calls?: boolean | null
  tool_choice?:
    | 'none'
    | 'auto'
    | 'required'
    | { type: 'function'; name: string }
    | null
  /** Reasoning controls for reasoning-capable models. */
  reasoning?: { effort?: 'low' | 'medium' | 'high' } | null
  user?: string | null
}

export type ExternalResponsesProviderOptions = BedrockResponsesProviderOptions
