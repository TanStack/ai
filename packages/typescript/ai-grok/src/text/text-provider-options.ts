import type OpenAI from 'openai'
import type { FunctionTool } from '../tools/function-tool'

/**
 * Grok Text Provider Options
 *
 * The Grok text adapter targets xAI's `/v1/responses` endpoint, which is
 * Responses-API compatible. These options mirror the option fragments used by
 * the OpenAI Responses adapter so callers can opt into reasoning, structured
 * output, parallel tool calling, encrypted-reasoning round-tripping, and so on.
 *
 * Common knobs (temperature, topP, maxTokens, metadata) live on the top-level
 * `chat()` / `generate()` call as part of `TextOptions`. Everything below goes
 * inside `modelOptions`.
 */

/**
 * Base Responses-API options for Grok text/chat models.
 */
export interface GrokBaseOptions {
  /**
   * Specify additional output data to include in the model response.
   *
   * Notably `reasoning.encrypted_content` returns an encrypted version of the
   * reasoning tokens so they can be replayed in subsequent stateless requests.
   * The Grok adapter sets `['reasoning.encrypted_content']` by default; pass
   * `[]` (or omit specific entries) to opt out.
   */
  include?: Array<OpenAI.Responses.ResponseIncludable> | null

  /**
   * The unique ID of a previous response to chain from. Use this to create
   * multi-turn conversations on the server.
   */
  previous_response_id?: string | null

  /**
   * Whether to store the generated model response on the server for later
   * retrieval. The Grok adapter defaults to `false` so that encrypted reasoning
   * content is the round-trip mechanism (compatible with zero data retention
   * setups). Pass `true` to opt back into server-side storage.
   */
  store?: boolean | null

  /**
   * The truncation strategy to use for the model response.
   *
   * - `auto`: drop earlier conversation items if the input exceeds the
   *   model's context window.
   * - `disabled` (default): fail the request with a 400 if the input is too
   *   long.
   */
  truncation?: 'auto' | 'disabled' | null

  /**
   * A unique identifier representing your end-user. Helps xAI detect abuse.
   */
  user?: string
}

type ReasoningSummary = 'auto' | 'concise' | 'detailed'
type SupportedReasoningEffort = 'minimal' | 'low' | 'medium' | 'high'

/**
 * Full reasoning controls for models that accept explicit effort selection.
 */
export interface GrokReasoningOptions {
  reasoning?: {
    /** Guides how much chain-of-thought computation to spend. */
    effort?: SupportedReasoningEffort
    /** A summary of the reasoning performed by the model. */
    summary?: ReasoningSummary
  } | null
}

/**
 * Limited reasoning controls for models that reason automatically but reject an
 * explicit `reasoning.effort` parameter.
 */
export interface GrokReasoningOptionsWithoutEffort {
  reasoning?: {
    /** A summary of the reasoning performed by the model. */
    summary?: ReasoningSummary
  } | null
}

/**
 * Structured output configuration. Prefer the top-level `outputSchema` on
 * `chat()` / `generate()` for the common case; this escape hatch is here for
 * advanced use of Grok's `text.format` field (e.g. plain text formatting hints).
 */
export interface GrokStructuredOutputOptions {
  text?: OpenAI.Responses.ResponseTextConfig
}

export interface GrokToolsOptions {
  /**
   * The maximum number of total tool calls the model may make in this response.
   */
  max_tool_calls?: number | null

  /**
   * Whether to allow the model to run tool calls in parallel. Defaults to
   * provider behavior (typically `true`).
   */
  parallel_tool_calls?: boolean | null

  /**
   * How the model should select which tool (or tools) to use.
   */
  tool_choice?: OpenAI.Responses.ResponseCreateParams['tool_choice']
}

export interface GrokStreamingOptions {
  /**
   * Options for streaming responses. Only set when `stream: true`.
   */
  stream_options?: {
    /**
     * Disable obfuscation padding on streaming deltas to save bandwidth on
     * trusted network paths.
     */
    include_obfuscation?: boolean
  } | null
}

export interface GrokMetadataOptions {
  /**
   * Set of up to 16 key-value pairs that can be attached to the response.
   * Keys: max 64 chars. Values: max 512 chars.
   */
  metadata?: Record<string, string> | null
}

export type GrokSharedTextProviderOptions =
  GrokBaseOptions &
    GrokStructuredOutputOptions &
    GrokToolsOptions &
    GrokStreamingOptions &
    GrokMetadataOptions

export type ExternalTextProviderOptions =
  GrokSharedTextProviderOptions & GrokReasoningOptions

export type ExternalTextProviderOptionsWithoutEffort =
  GrokSharedTextProviderOptions & GrokReasoningOptionsWithoutEffort

/**
 * Internal options interface used inside the adapter while building the
 * Responses-API request body. Not part of the public surface.
 */
export interface InternalTextProviderOptions extends ExternalTextProviderOptions {
  input: string | OpenAI.Responses.ResponseInput
  instructions?: string | null
  max_output_tokens?: number | null
  model: string
  stream?: boolean
  temperature?: number | null
  top_p?: number | null
  tools?: Array<FunctionTool>
}

/**
 * Validates text provider options. Runtime guard kept as defense-in-depth so a
 * provider 400 is converted into a clearer local SDK error.
 */
export function validateTextProviderOptions(
  options: InternalTextProviderOptions,
): void {
  if (options.reasoning?.effort) {
    const unsupportedReasoningEffortModels = new Set([
      'grok-4.3',
      'grok-4.2',
    ])

    if (unsupportedReasoningEffortModels.has(options.model)) {
      throw new Error(
        `${options.model} does not support modelOptions.reasoning.effort on xAI's Responses API. Remove reasoning.effort for this model and rely on the model's default reasoning behavior.`,
      )
    }
  }
}
