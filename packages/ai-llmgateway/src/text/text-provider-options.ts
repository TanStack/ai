import type {
  ChatCompletionToolChoiceOption,
  ResponseFormatJsonObject,
  ResponseFormatJsonSchema,
  ResponseFormatText,
} from '../message-types'

/**
 * LLM Gateway provider options for text/chat models.
 *
 * LLM Gateway exposes the OpenAI Chat Completions wire format and routes
 * each request to the underlying provider, so these are the standard Chat
 * Completions parameters. Parameters a routed provider doesn't support are
 * stripped by the gateway before the request is forwarded upstream.
 *
 * @see https://docs.llmgateway.io
 */
export interface LLMGatewayTextProviderOptions {
  /**
   * Number between -2.0 and 2.0. Positive values penalize new tokens based on
   * their existing frequency in the text so far, decreasing the model's
   * likelihood to repeat the same line verbatim.
   */
  frequency_penalty?: number | null

  /**
   * The maximum number of tokens that can be generated in the chat
   * completion. Deprecated by OpenAI in favor of `max_completion_tokens`,
   * but still accepted by the gateway and translated per provider.
   */
  max_tokens?: number | null

  /**
   * An upper bound for the number of tokens that can be generated for a
   * completion, including visible output tokens and reasoning tokens.
   */
  max_completion_tokens?: number | null

  /** Whether to enable parallel function calling during tool use. */
  parallel_tool_calls?: boolean | null

  /**
   * Number between -2.0 and 2.0. Positive values penalize new tokens based on
   * whether they appear in the text so far, increasing the model's likelihood
   * to talk about new topics.
   */
  presence_penalty?: number | null

  /**
   * Controls reasoning effort for reasoning-capable models.
   *
   * The gateway accepts the extended effort scale in addition to OpenAI's
   * `low` / `medium` / `high`; which tiers a given model honors depends on
   * the model and the provider it is routed to. See the model's page on
   * https://llmgateway.io/models for the tiers it supports.
   */
  reasoning_effort?:
    | 'none'
    | 'minimal'
    | 'low'
    | 'medium'
    | 'high'
    | 'xhigh'
    | 'max'
    | null

  /**
   * An object specifying the format that the model must output.
   *
   * - `json_schema` — enables Structured Outputs (preferred)
   * - `json_object` — enables the older JSON mode
   * - `text` — plain text output (default)
   */
  response_format?:
    | ResponseFormatText
    | ResponseFormatJsonSchema
    | ResponseFormatJsonObject
    | null

  /**
   * If specified, the gateway forwards the seed so providers that support it
   * can sample deterministically. Determinism is not guaranteed.
   */
  seed?: number | null

  /**
   * Up to 4 sequences where the API will stop generating further tokens.
   * The returned text will not contain the stop sequence.
   */
  stop?: string | null | Array<string>

  /**
   * Sampling temperature between 0 and 2. Higher values like 0.8 make the
   * output more random, while lower values like 0.2 make it more focused and
   * deterministic. We generally recommend altering this or `top_p` but not
   * both.
   */
  temperature?: number | null

  /**
   * Controls which (if any) tool is called by the model.
   *
   * - `none` — never call tools
   * - `auto` — model decides (default when tools are present)
   * - `required` — model must call tools
   * - Named choice — forces a specific tool
   */
  tool_choice?: ChatCompletionToolChoiceOption | null

  /**
   * An alternative to sampling with temperature, called nucleus sampling,
   * where the model considers the results of the tokens with top_p
   * probability mass. So 0.1 means only the tokens comprising the top 10%
   * probability mass are considered.
   */
  top_p?: number | null

  /**
   * A unique identifier representing your end-user, which can help monitor
   * and detect abuse.
   */
  user?: string | null
}

/**
 * External provider options (what users pass in)
 */
export type ExternalTextProviderOptions = LLMGatewayTextProviderOptions
