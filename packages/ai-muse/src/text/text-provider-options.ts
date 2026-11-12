/**
 * Muse-specific provider options for text/chat models.
 *
 * Muse exposes an OpenAI-compatible Chat Completions endpoint, so these are
 * the standard Chat Completions parameters. They are the values a caller can
 * pass through `chat({ modelOptions })`.
 */
export interface MuseTextProviderOptions {
  /**
   * Sampling temperature between 0 and 2. Higher values make the output more
   * random; lower values make it more focused and deterministic.
   */
  temperature?: number | null

  /**
   * Nucleus sampling. The model considers the tokens with `top_p` probability
   * mass. 0.1 means only the tokens in the top 10% are considered.
   */
  top_p?: number | null

  /**
   * The maximum number of tokens to generate in the chat completion. The total
   * of input tokens and generated tokens is limited by the model's context
   * window.
   */
  max_completion_tokens?: number | null

  /**
   * Number between -2.0 and 2.0. Positive values penalize new tokens by their
   * frequency so far, so the model is less likely to repeat the same line.
   */
  frequency_penalty?: number | null

  /**
   * Number between -2.0 and 2.0. Positive values penalize new tokens that have
   * already appeared, so the model is more likely to talk about new topics.
   */
  presence_penalty?: number | null

  /**
   * If set, the system makes a best effort to sample deterministically, so
   * repeated requests with the same `seed` and parameters return the same
   * result.
   */
  seed?: number | null

  /**
   * Up to 4 sequences where the API stops generating further tokens. The
   * returned text does not contain the stop sequence.
   */
  stop?: string | null | Array<string>

  /** Whether to enable parallel function calling during tool use. */
  parallel_tool_calls?: boolean | null

  /**
   * A unique identifier for your end-user, which can help monitor and detect
   * abuse.
   */
  user?: string | null
}

/**
 * External provider options (what users pass in).
 */
export type ExternalTextProviderOptions = MuseTextProviderOptions
