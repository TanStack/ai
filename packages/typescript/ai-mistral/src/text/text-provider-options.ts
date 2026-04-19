import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
  ResponseFormatJsonObject,
  ResponseFormatJsonSchema,
  ResponseFormatText,
} from '../message-types'

/**
 * Mistral-specific provider options for text/chat models.
 *
 * @see https://docs.mistral.ai/api/
 */
export interface MistralTextProviderOptions {
  /**
   * Sampling temperature. The default varies by model; lower values make output
   * more deterministic. We recommend altering this OR `top_p`, not both.
   */
  temperature?: number | null

  /**
   * Nucleus sampling — consider the tokens with `top_p` probability mass.
   */
  top_p?: number | null

  /**
   * The maximum number of tokens to generate.
   */
  max_tokens?: number | null

  /**
   * Stop sequences where the API will stop generating further tokens.
   */
  stop?: string | Array<string> | null

  /**
   * A seed for deterministic sampling. Repeated requests with the same seed
   * and parameters should return the same result (best-effort).
   */
  random_seed?: number | null

  /**
   * Specifies the format the model must output.
   */
  response_format?:
    | ResponseFormatText
    | ResponseFormatJsonSchema
    | ResponseFormatJsonObject
    | null

  /**
   * Controls which (if any) tool is called by the model.
   */
  tool_choice?: ChatCompletionToolChoiceOption | null

  /**
   * Whether parallel tool calls are allowed during tool use.
   */
  parallel_tool_calls?: boolean | null

  /**
   * Number between -2.0 and 2.0. Positive values penalize tokens based on
   * their frequency in the text so far.
   */
  frequency_penalty?: number | null

  /**
   * Number between -2.0 and 2.0. Positive values penalize tokens based on
   * whether they appear in the text so far.
   */
  presence_penalty?: number | null

  /**
   * How many chat completion choices to generate for each input message.
   */
  n?: number | null

  /**
   * Prediction — used to speed up generation with speculative decoding.
   */
  prediction?: { type: 'content'; content: string } | null

  /**
   * Safe prompt — enables safety guarding injected into the system prompt.
   */
  safe_prompt?: boolean | null
}

/**
 * Internal options interface used for validation within the adapter.
 */
export interface InternalTextProviderOptions
  extends MistralTextProviderOptions {
  messages: Array<ChatCompletionMessageParam>
  model: string
  stream?: boolean | null
  tools?: Array<ChatCompletionTool>
}

/**
 * External provider options (what users pass in).
 */
export type ExternalTextProviderOptions = MistralTextProviderOptions

/**
 * Validates text provider options.
 * Basic validation stub — Mistral API handles detailed validation.
 */
export function validateTextProviderOptions(
  _options: InternalTextProviderOptions,
): void {
  // Mistral API handles detailed validation
}
