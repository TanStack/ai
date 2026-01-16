import type { FunctionTool } from '../tools/function-tool'

/**
 * DeepSeek Text Provider Options
 *
 * DeepSeek uses an OpenAI-compatible Chat Completions API.
 * However, not all OpenAI features may be supported by DeepSeek.
 */

/**
 * Base provider options for DeepSeek text/chat models
 */
export interface DeepSeekBaseOptions {
  /**
   * A unique identifier representing your end-user.
   * Can help DeepSeek to monitor and detect abuse.
   */
  user?: string
}

/**
 * DeepSeek-specific provider options for text/chat
 * Based on OpenAI-compatible API options
 */
export interface DeepSeekTextProviderOptions extends DeepSeekBaseOptions {
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
  /**
   * Enable thinking mode for chain-of-thought reasoning
   * When enabled, the model will output reasoning content before the final answer
   * Automatically enabled for deepseek-reasoner model
   */
  thinking?: boolean
}

/**
 * Internal options interface for validation
 * Used internally by the adapter
 */
export interface InternalTextProviderOptions extends DeepSeekTextProviderOptions {
  model: string
  stream?: boolean
  tools?: Array<FunctionTool>
}

/**
 * External provider options (what users pass in)
 */
export type ExternalTextProviderOptions = DeepSeekTextProviderOptions

/**
 * Validates text provider options
 */
export function validateTextProviderOptions(
  _options: InternalTextProviderOptions,
): void {
  // Basic validation can be added here if needed
  // For now, DeepSeek API will handle validation
}
