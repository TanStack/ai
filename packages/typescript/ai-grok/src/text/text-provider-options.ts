import type { FunctionTool } from '../tools/function-tool'

/**
 * Grok Text Provider Options
 *
 * Grok uses an OpenAI-compatible Chat Completions API.
 * However, not all OpenAI features may be supported by Grok.
 */

/**
 * Base provider options for Grok text/chat models
 */
export interface GrokBaseOptions {
  /**
   * A unique identifier representing your end-user.
   * Can help xAI to monitor and detect abuse.
   */
  user?: string
  /**
   * What additional output data to include in the response. Currently the only supported value is 
reasoning.encrypted_content
 which returns an encrypted version of the reasoning tokens.
   */
  include?: Array<'reasoning.encrypted_content'>
  /**
   * Whether to return log probabilities of the output tokens or not. If true, returns the log probabilities of each output token returned in the content of message.
   */
  logprobs?: boolean
  /**
   * Whether to enable parallel tool calls.
   * @default true
   */
  parallel_tool_calls?: boolean

  tool_choice?:
    | 'none'
    | 'auto'
    | 'required'
    | { type: 'function'; function: { [key: string]: string } }
  /**
   * The ID of the previous response from the model.
   */
  previous_response_id?: string
  /**
   * Whether to store the input message(s) and model response for later retrieval.
   * @default true
   */
  store?: boolean
  /**
   * An integer between 0 and 8 specifying the number of most likely tokens to return at each token position, each with an associated log probability. logprobs must be set to true if this parameter is used.
   */
  top_logprobs?: number
}

/**
 * Grok-specific provider options for text/chat
 * Based on OpenAI-compatible API options
 */
export interface GrokTextProviderOptions extends GrokBaseOptions {}
type ReasoningEffort = 'low' | 'medium' | 'high'
type ReasoningSummary = 'auto' | 'detailed' | 'concise'

/**
 * Reasoning options for most models (excludes 'concise' summary).
 */
export interface ReasoningOptions {
  reasoning?: {
    effort?: ReasoningEffort

    summary?: ReasoningSummary
  }
}
/**
 * Internal options interface for validation
 * Used internally by the adapter
 */
export interface InternalTextProviderOptions extends GrokTextProviderOptions {
  model: string
  stream?: boolean
  tools?: Array<FunctionTool>
}

/**
 * External provider options (what users pass in)
 */
export type ExternalTextProviderOptions = GrokTextProviderOptions
