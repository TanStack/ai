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
export interface GrokTextProviderOptions extends GrokBaseOptions {
  /**
   * Temperature for response generation (0-2)
   * Higher values make output more random, lower values more focused
   */
  temperature?: number
  /**
   * Top-p sampling parameter (0-1)
   * Alternative to temperature, nucleus sampling
   */
  top_p?: number
  /**
   * Maximum tokens in the response
   */
  max_tokens?: number
  /**
   * Frequency penalty (-2.0 to 2.0)
   */
  frequency_penalty?: number
  /**
   * Presence penalty (-2.0 to 2.0)
   */
  presence_penalty?: number
  /**
   * Stop sequences
   */
  stop?: string | Array<string>
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

/**
 * Validates text provider options
 */
export function validateTextProviderOptions(
  _options: InternalTextProviderOptions,
): void {
  // Basic validation can be added here if needed
  // For now, Grok API will handle validation
}
