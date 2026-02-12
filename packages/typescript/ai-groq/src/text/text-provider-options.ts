import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
  CompoundCustom,
  Document,
  ResponseFormatJsonObject,
  ResponseFormatJsonSchema,
  ResponseFormatText,
  SearchSettings,
} from '../message-types'

/**
 * Groq-specific provider options for text/chat models.
 *
 * These options extend the standard Chat Completions API parameters
 * with Groq-specific features like compound models and search settings.
 *
 * @see https://console.groq.com/docs/api-reference#chat
 */
export interface GroqTextProviderOptions {
  /**
   * Whether to enable citations in the response. When enabled, the model will
   * include citations for information retrieved from provided documents or web
   * searches.
   */
  citation_options?: 'enabled' | 'disabled' | null

  /** Custom configuration of models and tools for Compound. */
  compound_custom?: CompoundCustom | null

  /**
   * If set to true, groq will return called tools without validating that the tool
   * is present in request.tools. tool_choice=required/none will still be enforced,
   * but the request cannot require a specific tool be used.
   */
  disable_tool_validation?: boolean

  /**
   * A list of documents to provide context for the conversation. Each document
   * contains text that can be referenced by the model.
   */
  documents?: Array<Document> | null

  /**
   * Number between -2.0 and 2.0. Positive values penalize new tokens based on their
   * existing frequency in the text so far, decreasing the model's likelihood to
   * repeat the same line verbatim.
   */
  frequency_penalty?: number | null

  /**
   * Whether to include reasoning in the response. This field is mutually exclusive
   * with `reasoning_format`.
   */
  include_reasoning?: boolean | null

  /** Modify the likelihood of specified tokens appearing in the completion. */
  logit_bias?: { [key: string]: number } | null

  /**
   * Whether to return log probabilities of the output tokens or not. If true,
   * returns the log probabilities of each output token returned in the `content`
   * of `message`.
   */
  logprobs?: boolean | null

  /**
   * The maximum number of tokens that can be generated in the chat completion. The
   * total length of input tokens and generated tokens is limited by the model's
   * context length.
   */
  max_completion_tokens?: number | null

  /** Request metadata. */
  metadata?: { [key: string]: string } | null

  /**
   * How many chat completion choices to generate for each input message.
   * Currently only n=1 is supported.
   */
  n?: number | null

  /** Whether to enable parallel function calling during tool use. */
  parallel_tool_calls?: boolean | null

  /**
   * Number between -2.0 and 2.0. Positive values penalize new tokens based on
   * whether they appear in the text so far, increasing the model's likelihood to
   * talk about new topics.
   */
  presence_penalty?: number | null

  /**
   * Controls reasoning effort for supported models.
   *
   * - qwen3 models: `'none'` to disable, `'default'` or null to enable
   * - openai/gpt-oss models: `'low'`, `'medium'` (default), or `'high'`
   */
  reasoning_effort?: 'none' | 'default' | 'low' | 'medium' | 'high' | null

  /**
   * Specifies how to output reasoning tokens.
   * This field is mutually exclusive with `include_reasoning`.
   */
  reasoning_format?: 'hidden' | 'raw' | 'parsed' | null

  /**
   * An object specifying the format that the model must output.
   *
   * - `json_schema` — enables Structured Outputs (preferred)
   * - `json_object` — enables the older JSON mode
   * - `text` — plain text output (default)
   *
   * @see https://console.groq.com/docs/structured-outputs
   */
  response_format?:
  | ResponseFormatText
  | ResponseFormatJsonSchema
  | ResponseFormatJsonObject
  | null

  /** Settings for web search functionality when the model uses a web search tool. */
  search_settings?: SearchSettings | null

  /**
   * If specified, our system will make a best effort to sample deterministically,
   * such that repeated requests with the same `seed` and parameters should return
   * the same result.
   */
  seed?: number | null

  /**
   * The service tier to use for the request.
   *
   * - `auto` — automatically select the highest tier available
   * - `flex` — uses the flex tier, which will succeed or fail quickly
   */
  service_tier?: 'auto' | 'on_demand' | 'flex' | 'performance' | null

  /**
   * Up to 4 sequences where the API will stop generating further tokens.
   * The returned text will not contain the stop sequence.
   */
  stop?: string | null | Array<string>

  /** Whether to store the request for future use. */
  store?: boolean | null

  /**
   * Sampling temperature between 0 and 2. Higher values like 0.8 will make the
   * output more random, while lower values like 0.2 will make it more focused
   * and deterministic. We generally recommend altering this or top_p but not both.
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
   * An integer between 0 and 20 specifying the number of most likely tokens to
   * return at each token position. `logprobs` must be set to `true` if this
   * parameter is used.
   */
  top_logprobs?: number | null

  /**
   * An alternative to sampling with temperature, called nucleus sampling, where the
   * model considers the results of the tokens with top_p probability mass. So 0.1
   * means only the tokens comprising the top 10% probability mass are considered.
   */
  top_p?: number | null

  /**
   * A unique identifier representing your end-user, which can help monitor and
   * detect abuse.
   */
  user?: string | null
}

/**
 * Internal options interface used for validation within the adapter.
 * Extends provider options with required fields for API requests.
 */
export interface InternalTextProviderOptions extends GroqTextProviderOptions {
  /** An array of messages comprising the conversation. */
  messages: Array<ChatCompletionMessageParam>

  /**
   * The model name (e.g. "llama-3.3-70b-versatile", "openai/gpt-oss-120b").
   * @see https://console.groq.com/docs/models
   */
  model: string

  /** Whether to stream partial message deltas as server-sent events. */
  stream?: boolean | null

  /**
   * Tools the model may call (functions, code_interpreter, etc).
   * @see https://console.groq.com/docs/tool-use
   */
  tools?: Array<ChatCompletionTool>
}

/**
 * External provider options (what users pass in)
 */
export type ExternalTextProviderOptions = GroqTextProviderOptions

/**
 * Validates text provider options.
 * Basic validation stub — Groq API handles detailed validation.
 */
export function validateTextProviderOptions(
  _options: InternalTextProviderOptions,
): void {
  // Groq API handles detailed validation
}
