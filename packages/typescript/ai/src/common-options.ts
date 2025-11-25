/**
 * Common options shared across different AI provider implementations.
 * These options represent the standard parameters that work across OpenAI, Anthropic, and Gemini.
 */
export interface CommonOptions {
  /**
   * Controls the randomness of the output.
   * Higher values (e.g., 0.8) make output more random, lower values (e.g., 0.2) make it more focused and deterministic.
   * Range: [0.0, 2.0]
   *
   * Note: Generally recommended to use either temperature or topP, but not both.
   *
   * Provider usage:
   * - OpenAI: `temperature` (number) - in text.top_p field
   * - Anthropic: `temperature` (number) - ranges from 0.0 to 1.0, default 1.0
   * - Gemini: `generationConfig.temperature` (number) - ranges from 0.0 to 2.0
   */
  temperature?: number;

  /**
   * Nucleus sampling parameter. An alternative to temperature sampling.
   * The model considers the results of tokens with topP probability mass.
   * For example, 0.1 means only tokens comprising the top 10% probability mass are considered.
   *
   * Note: Generally recommended to use either temperature or topP, but not both.
   *
   * Provider usage:
   * - OpenAI: `text.top_p` (number)
   * - Anthropic: `top_p` (number | null)
   * - Gemini: `generationConfig.topP` (number)
   */
  topP?: number;

  /**
   * The maximum number of tokens to generate in the response.
   *
   * Provider usage:
   * - OpenAI: `max_output_tokens` (number) - includes visible output and reasoning tokens
   * - Anthropic: `max_tokens` (number, required) - range x >= 1
   * - Gemini: `generationConfig.maxOutputTokens` (number)
   */
  maxTokens?: number;

  /**
   * Additional metadata to attach to the request.
   * Can be used for tracking, debugging, or passing custom information.
   * Structure and constraints vary by provider.
   *
   * Provider usage:
   * - OpenAI: `metadata` (Record<string, string>) - max 16 key-value pairs, keys max 64 chars, values max 512 chars
   * - Anthropic: `metadata` (Record<string, any>) - includes optional user_id (max 256 chars)
   * - Gemini: Not directly available in TextProviderOptions
   */
  metadata?: Record<string, any>;
}
