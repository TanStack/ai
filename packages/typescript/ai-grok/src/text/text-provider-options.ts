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
}

/**
 * Grok-specific provider options for text/chat
 * Based on OpenAI-compatible API options
 */
export interface GrokTextProviderOptions extends GrokBaseOptions {}
type ReasoningEffort = 'low' | 'high'
type ReasoningSummary = 'auto' | 'detailed'

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
