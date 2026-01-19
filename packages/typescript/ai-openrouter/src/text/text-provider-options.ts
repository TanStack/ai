import type { OPENROUTER_CHAT_MODELS } from '../model-meta'

type OpenRouterChatModel = (typeof OPENROUTER_CHAT_MODELS)[number]
export interface WebPlugin {
  /**
   * The plugin identifier. Currently only 'web' is supported.
   */
  id: 'web'
  /**
   * The search engine to use for web search.
   * @default 'native'
   */
  engine?: 'native' | 'exa'
  /**
   * Maximum number of search results to return.
   */
  max_results?: number
  /**
   * Custom search prompt to guide the web search.
   */
  search_prompt?: string
}

export interface ProviderPreferences {
  /**
   * An ordered list of provider names. The router will attempt to use the first available provider from this list.
   * https://openrouter.ai/docs/guides/routing/provider-selection
   */
  order?: Array<string>
  /**
   * Whether to allow fallback to other providers if the preferred ones are unavailable.
   * @default true
   */
  allow_fallbacks?: boolean
  /**
   * Whether to require all parameters to be supported by the provider.
   * @default false
   */
  require_parameters?: boolean
  /**
   * Controls whether to allow providers that may collect data.
   * 'allow' - Allow all providers
   * 'deny' - Only use providers that don't collect data
   */
  data_collection?: 'allow' | 'deny'
  /**
   * Whether to prefer Zero Data Retention (ZDR) providers.
   */
  zdr?: boolean
  /**
   * An exclusive list of provider names to use. Only these providers will be considered.
   */
  only?: Array<string>
  /**
   * A list of provider names to exclude from consideration.
   */
  ignore?: Array<string>
  /**
   * A list of quantization levels to allow (e.g., 'int4', 'int8', 'fp8', 'fp16', 'bf16').
   */
  quantizations?: Array<string>
  /**
   * How to sort/prioritize providers.
   * 'price' - Sort by lowest price
   * 'throughput' - Sort by highest throughput
   */
  sort?: 'price' | 'throughput'
  /**
   * Maximum price limits for tokens.
   */
  max_price?: {
    /**
     * Maximum price per completion token in credits.
     */
    completion_tokens?: number
    /**
     * Maximum price per prompt token in credits.
     */
    prompt_tokens?: number
  }
}

export interface ReasoningOptions {
  /**
   * The level of reasoning effort the model should apply.
   * Higher values produce more thorough reasoning but use more tokens.
   */
  effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high'
  /**
   * Maximum number of tokens to allocate for reasoning.
   */
  max_tokens?: number
  /**
   * Whether to exclude reasoning content from the response.
   */
  exclude?: boolean
}

export interface StreamOptions {
  /**
   * Whether to include token usage information in the stream.
   */
  include_usage?: boolean
}

export interface ImageConfig {
  /**
   * The aspect ratio for generated images.
   */
  aspect_ratio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | string
}

export interface PredictionOptions {
  /**
   * The type of prediction. Currently only 'content' is supported.
   */
  type: 'content'
  /**
   * The predicted content string to reduce latency.
   * Providing a predicted output can help reduce response time.
   */
  content: string
}

export interface WebSearchOptions {
  /**
   * Controls the amount of search data retrieved.
   * - 'low' - Minimal search context
   * - 'medium' - Moderate search context (default)
   * - 'high' - Maximum search context
   */
  search_context_size?: 'low' | 'medium' | 'high'
}

export type OpenRouterCommonOptions = {
  /**
   * A list of model IDs to use as fallbacks if the primary model is unavailable.
   */
  models?: Array<OpenRouterChatModel>
  /**
   * The model variant to use, if supported by the model.
   * Will be appended to the model ID.
   */
  variant?: 'free' | 'nitro' | 'online' | 'exacto' | 'extended' | 'thinking'
  /**
   * The routing strategy to use.
   * 'fallback' - Try models in order until one succeeds
   */
  route?: 'fallback'
  /**
   * Provider routing preferences.
   * https://openrouter.ai/docs/guides/routing/provider-selection
   */
  provider?: ProviderPreferences
  /**
   * A unique identifier representing your end-user for abuse monitoring.
   */
  user?: string
  /**
   * Metadata to attach to the request for tracking and analytics.
   */
  metadata?: Record<string, string>

  /**
   * Plugins to enable for the request (e.g., web search).
   * https://openrouter.ai/docs/features/web-search
   */
  plugins?: Array<WebPlugin>
  /**
   * Debug options for troubleshooting.
   */
  debug?: {
    /**
     * Whether to echo the upstream request body in the response for debugging.
     */
    echo_upstream_body?: boolean
  }
  /**
   * Prediction parameter to reduce latency by providing the model with a predicted output.
   * This can help improve response times by giving the model a head start.
   * https://openrouter.ai/docs/requests
   */
  prediction?: PredictionOptions

  /**
   * Message transforms to apply (e.g., 'middle-out' for context compression).
   */
  transforms?: Array<string>

  /**
   * Options for streaming responses.
   */
  stream_options?: StreamOptions
  /**
   * Whether to allow the model to call multiple tools in parallel.
   * @default true
   */
  parallel_tool_calls?: boolean

  /**
   * The modalities to enable for the response.
   */
  modalities?: Array<'text' | 'image'>
}

export interface OpenRouterBaseOptions {
  /**
   * Constrains the verbosity of the model's response.
   */
  verbosity?: 'low' | 'medium' | 'high'
  /**
   * Up to 4 sequences where the API will stop generating further tokens.
   */
  stop?: string | Array<string>
  /**
   * Legacy parameter to include reasoning steps in the response.
   */
  include_reasoning?: boolean

  /**
   * The maximum number of tokens to generate in the completion.
   */
  max_completion_tokens?: number
  /**
   * What sampling temperature to use, between 0 and 2. Higher values make output more random.
   * @default 1
   */
  temperature?: number
  /**
   * Nucleus sampling: only consider tokens with top_p cumulative probability.
   * @default 1
   */
  top_p?: number
  /**
   * Only sample from the top K options for each subsequent token.
   */
  top_k?: number
  /**
   * Penalizes new tokens based on their existing frequency in the text so far.
   * Range: -2.0 to 2.0
   */
  frequency_penalty?: number
  /**
   * Penalizes new tokens based on whether they appear in the text so far.
   * Range: -2.0 to 2.0
   */
  presence_penalty?: number
  /**
   * Penalizes tokens that have already appeared in the generated text.
   * Range: 0.0 to 2.0 (1.0 = no penalty)
   */
  repetition_penalty?: number
  /**
   * Modify the likelihood of specified tokens appearing in the completion.
   * Maps token IDs to bias values from -100 to 100.
   */
  logit_bias?: { [key: number]: number }
  /**
   * Whether to return log probabilities of the output tokens.
   */
  logprobs?: boolean
  /**
   * Number of most likely tokens to return at each position (0-20). Requires logprobs: true.
   */
  top_logprobs?: number
  /**
   * Minimum probability threshold for token sampling.
   */
  min_p?: number
  /**
   * Consider only top tokens with "top_a" cumulative probability.
   */
  top_a?: number
  /**
   * Random seed for deterministic sampling. Same seed should produce same results.
   */
  seed?: number
  /**
   * Force the model to respond in a specific format.
   */
  response_format?: { type: 'json_object' }

  /**
   * Reasoning configuration for models that support chain-of-thought reasoning.
   */
  reasoning?: ReasoningOptions

  /**
   * Configuration for image generation in the response.
   */
  image_config?: ImageConfig
  /**
   * Controls which (if any) tool the model should use.
   * 'none' - Don't call any tools
   * 'auto' - Model decides whether to call tools
   * 'required' - Model must call at least one tool
   * Or specify a specific function to call
   */
  tool_choice?:
    | 'none'
    | 'auto'
    | 'required'
    | {
        type: 'function'
        function: {
          name: string
        }
      }

  /**
   * Web search options for controlling search behavior.
   * This is separate from the plugins array and provides additional control over search context.
   * https://openrouter.ai/docs/guides/features/plugins/web-search
   */
  web_search_options?: WebSearchOptions
}

export type ExternalTextProviderOptions = OpenRouterBaseOptions

export interface InternalTextProviderOptions extends ExternalTextProviderOptions {
  /**
   * The model ID to use for the request.
   * https://openrouter.ai/models
   */
  model: string
  /**
   * The model variant to use, if supported by the model.
   * Will be appended to the model ID.
   */
  variant?: 'free' | 'nitro' | 'online' | 'exacto' | 'extended' | 'thinking'
  /**
   * The messages to send to the model.
   */
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool'
    content:
      | string
      | Array<{
          type:
            | 'text'
            | 'image_url'
            | 'audio_url'
            | 'video_url'
            | 'document_url'
          text?: string
          image_url?: {
            url: string
            detail?: 'auto' | 'low' | 'high'
          }
          audio_url?: { url: string }
          video_url?: { url: string }
          document_url?: { url: string }
        }>
    tool_call_id?: string
    name?: string
  }>
  /**
   * Tools the model may call (functions).
   */
  tools?: Array<{
    type: 'function'
    function: {
      name: string
      description?: string
      parameters: Record<string, unknown>
    }
  }>
  /**
   * Controls which (if any) tool the model should use.
   */
  tool_choice?:
    | 'none'
    | 'auto'
    | 'required'
    | {
        type: 'function'
        function: {
          name: string
        }
      }
}
