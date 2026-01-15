import type OpenAI from 'openai'

// Core, always-available options for Z.AI API
export interface ZAIBaseOptions {
  /**
   * Whether to run the model response in the background.
   * @default false
   */
  background?: boolean

  /**
   * The conversation that this response belongs to.
   */
  conversation?: string | { id: string }

  /**
   * Specify additional output data to include in the model response.
   */
  include?: Array<OpenAI.Responses.ResponseIncludable>

  /**
   * The unique ID of the previous response to the model. Use this to create multi-turn conversations.
   */
  previous_response_id?: string

  /**
   * Reference to a prompt template and its variables.
   */
  prompt?: {
    id: string
    version?: string
    variables?: Record<string, any>
  }

  /**
   * Used by Z.AI to cache responses for similar requests to optimize cache hit rates.
   */
  prompt_cache_key?: string

  /**
   * The retention policy for the prompt cache.
   */
  prompt_cache_retention?: 'in-memory' | '24h'

  /**
   * A stable identifier used to help detect users of your application.
   */
  safety_identifier?: string

  /**
   * Specifies the processing type used for serving the request.
   * @default 'auto'
   */
  service_tier?: 'auto' | 'default' | 'flex' | 'priority'

  /**
   * Whether to store the generated model response for later retrieval via API.
   * @default true
   */
  store?: boolean

  /**
   * Constrains the verbosity of the model's response.
   */
  verbosity?: 'low' | 'medium' | 'high'

  /**
   * An integer between 0 and 20 specifying the number of most likely tokens to return.
   */
  top_logprobs?: number

  /**
   * The truncation strategy to use for the model response.
   */
  truncation?: 'auto' | 'disabled'
}

// Feature fragments that can be stitched per-model

type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high'
type ReasoningSummary = 'auto' | 'detailed'

/**
 * Reasoning options for Z.AI models.
 */
export interface ZAIReasoningOptions {
  /**
   * Reasoning controls for models that support it.
   * Lets you guide how much chain-of-thought computation to spend.
   */
  reasoning?: {
    /**
     * Controls the amount of reasoning effort.
     * Supported values: none, low, medium, high
     */
    effort?: ReasoningEffort
    /**
     * A summary of the reasoning performed by the model.
     */
    summary?: ReasoningSummary
  }

  /**
   * Zhipu AI Thinking Mode (GLM-4.7/4.6/4.5)
   */
  thinking?: {
    type: 'enabled' | 'disabled'
    /**
     * For GLM-4.7 preserved thinking. Set to false to retain reasoning context.
     * @default true
     */
    clear_thinking?: boolean
  }
}

export interface ZAIStructuredOutputOptions {
  /**
   * Configuration options for a text response from the model.
   * Can be plain text or structured JSON data.
   */
  text?: OpenAI.Responses.ResponseTextConfig
}

export interface ZAIToolsOptions {
  /**
   * The maximum number of total calls to built-in tools that can be processed in a response.
   */
  max_tool_calls?: number

  /**
   * Whether to allow the model to run tool calls in parallel.
   * @default true
   */
  parallel_tool_calls?: boolean

  /**
   * Configuration for tool choices.
   */
  tool_choice?: 'auto' | 'none' | 'required' | OpenAI.Chat.ChatCompletionToolChoiceOption

  /**
   * A list of tools the model may call.
   */
  tools?: Array<OpenAI.Chat.ChatCompletionTool>

  /**
   * Whether to stream tool calls.
   * Supported by GLM-4.7
   */
  tool_stream?: boolean
}

export interface ZAIStreamingOptions {
  /**
   * Whether to stream back partial progress.
   * @default false
   */
  stream?: boolean

  /**
   * Options for streaming including usage stats.
   */
  stream_options?: {
    include_usage?: boolean
  }
}

export interface ZAIMetadataOptions {
  /**
   * A unique identifier representing your end-user.
   */
  user?: string

  /**
   * Developer-defined tags and values for tracking and debugging.
   */
  metadata?: Record<string, string>

  /**
   * Accept-Language header for Z.AI API.
   * @default 'en-US,en'
   */
  acceptLanguage?: string
}

/**
 * Complete text provider options for Z.AI.
 * Combines all available options for maximum flexibility.
 */
export interface ZAITextOptions
  extends ZAIBaseOptions,
    ZAIReasoningOptions,
    ZAIStructuredOutputOptions,
    ZAIToolsOptions,
    ZAIStreamingOptions,
    ZAIMetadataOptions {}
