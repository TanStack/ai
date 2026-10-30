/**
 * Z.AI provider options for text/chat models.
 *
 * Z.AI speaks OpenAI Chat Completions with two restrictions this adapter
 * handles instead of exposing:
 *
 * - `response_format` accepts `json_object` but not `json_schema`, so the
 *   adapter falls back to JSON mode plus a schema system prompt.
 * - `tool_choice` accepts only `"auto"`, so the adapter always sends that.
 *
 * @see https://docs.z.ai/api-reference/llm/chat-completion
 */
export interface ZAITextProviderOptions {
  /**
   * Sampling temperature (0-2). Higher values make output more random.
   */
  temperature?: number | null

  /**
   * Nucleus sampling probability mass (0-1).
   */
  top_p?: number | null

  /**
   * Maximum number of tokens to generate. Z.AI reads `max_tokens`.
   */
  max_tokens?: number | null

  /**
   * Up to 4 sequences where the API stops generating further tokens.
   */
  stop?: string | Array<string> | null

  /**
   * Deterministic sampling seed.
   */
  seed?: number | null

  /**
   * Penalize tokens by their frequency in the text so far (-2 to 2).
   */
  frequency_penalty?: number | null

  /**
   * Penalize tokens by whether they appeared in the text so far (-2 to 2).
   */
  presence_penalty?: number | null

  /**
   * Response format. Z.AI rejects `json_schema`; use `structuredOutput` (or
   * `outputSchema` on `chat()`) for schema-constrained responses, which the
   * adapter sends as `json_object` plus a schema system prompt.
   */
  response_format?: { type: 'text' } | { type: 'json_object' } | null

  /**
   * Zhipu AI thinking mode (GLM-4.7 and newer).
   */
  thinking?: {
    type: 'enabled' | 'disabled'
    /**
     * Set to `false` to keep reasoning context across turns (GLM-4.7+).
     * @default true
     */
    clear_thinking?: boolean
  }

  /**
   * Reasoning effort (GLM-5.2).
   */
  reasoning_effort?: 'low' | 'medium' | 'high' | 'max'

  /**
   * Stream tool-call arguments as they are generated (GLM-4.7+).
   */
  tool_stream?: boolean
}

/**
 * External provider options (what users pass in `modelOptions`).
 */
export type ExternalTextProviderOptions = ZAITextProviderOptions
