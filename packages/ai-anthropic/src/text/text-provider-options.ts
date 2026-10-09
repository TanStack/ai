import type { AnthropicThinkingFields } from './reasoning'
import type {
  BetaContextManagementConfig,
  BetaMessageParam,
  BetaToolChoiceAny,
  BetaToolChoiceAuto,
  BetaToolChoiceTool,
} from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { CacheControlEphemeral } from '@anthropic-ai/sdk/resources'
import type { AnthropicContainerSkill, AnthropicTool } from '../tools/index'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/messages'

/**
 * Per-prompt metadata Anthropic understands on `systemPrompts` entries.
 *
 * Used via the structured form of `systemPrompts`:
 *
 * @example
 *   import type { AnthropicSystemPromptMetadata } from '@tanstack/ai-anthropic'
 *
 *   chat({
 *     adapter: anthropicText(),
 *     model: 'claude-sonnet-4-6',
 *     systemPrompts: [
 *       {
 *         content: 'Stable instructions — cache me.',
 *         metadata: { cache_control: { type: 'ephemeral' } } satisfies AnthropicSystemPromptMetadata,
 *       },
 *       'Volatile per-request instruction.',
 *     ],
 *   })
 */
export interface AnthropicSystemPromptMetadata {
  /**
   * Anthropic prompt-caching control applied to this system prompt's
   * `TextBlockParam`.
   *
   * @see https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
   */
  cache_control?: CacheControlEphemeral
}

/**
 * Top-level prompt-caching control.
 *
 * Anthropic's Messages API accepts `cache_control` as a request-level
 * parameter: it auto-places the breakpoint on the last cacheable block of the
 * rendered prompt (`tools` → `system` → `messages`). Use this when you don't
 * need per-block placement; for a breakpoint on a specific system prompt, use
 * the structured `systemPrompts` form with
 * {@link AnthropicSystemPromptMetadata} instead.
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */
export interface AnthropicCacheControlOptions {
  cache_control?: CacheControlEphemeral
}

export interface AnthropicContainerOptions {
  /**
   * Container identifier for reuse across requests.
   * Container parameters with skills to be loaded.
   */
  container?: {
    id: string | null
    /**
     * List of skills to load into the container.
     *
     * @deprecated Configure skills on the `code_execution` tool instead:
     * `codeExecutionTool(config, { skills })`. The adapter lifts those into
     * `container.skills` and attaches the required beta headers. Setting
     * skills here bypasses the beta-header wiring and may stop working.
     */
    skills: Array<AnthropicContainerSkill> | null
  } | null
}

export interface AnthropicContextManagementOptions {
  /**
   * Context management configuration.

This allows you to control how Claude manages context across multiple requests, such as whether to clear function results or not.
   */
  context_management?: BetaContextManagementConfig | null
}

export interface AnthropicMCPOptions {
  /**
   * MCP servers to be utilized in this request
   * Maximum of 20 servers
   */
  mcp_servers?: Array<MCPServer>
}

export interface AnthropicServiceTierOptions {
  /**
   * Determines whether to use priority capacity (if available) or standard capacity for this request.
   */
  service_tier?: 'auto' | 'standard_only'
}

export interface AnthropicStopSequencesOptions {
  /**
   * Custom text sequences that will cause the model to stop generating.

Anthropic models will normally stop when they have naturally completed their turn, which will result in a response stop_reason of "end_turn".

If you want the model to stop generating when it encounters custom strings of text, you can use the stop_sequences parameter. If the model encounters one of the custom sequences, the response stop_reason value will be "stop_sequence" and the response stop_sequence value will contain the matched stop sequence.
   */
  stop_sequences?: Array<string>
}

/**
 * `max_tokens` on its own, for models that reject the sampling parameters
 * (`temperature`, `top_p`, `top_k`) — e.g. Claude Fable 5 and Claude Opus
 * 4.7/4.8 reject them outright, and Claude Sonnet 5 returns a 400 when a
 * non-default sampling value is sent.
 */
export interface AnthropicMaxTokensOptions {
  /**
   * The maximum number of tokens to generate before stopping. This parameter only specifies the absolute maximum number of tokens to generate. Required by the API; the adapter defaults to 1024 when omitted.
   * Range x >= 1.
   */
  max_tokens?: number
}

export interface AnthropicToolChoiceOptions {
  tool_choice?: BetaToolChoiceAny | BetaToolChoiceTool | BetaToolChoiceAuto
}

export interface AnthropicSamplingOptions {
  /**
   * Only sample from the top K options for each subsequent token.

Used to remove "long tail" low probability responses.
Recommended for advanced use cases only. You usually only need to use temperature.

Required range: x >= 0
   */
  top_k?: number
  /**
   * Amount of randomness injected into the response.
   * Either use this or top_p, but not both.
   * Defaults to 1.0. Ranges from 0.0 to 1.0. Use temperature closer to 0.0 for analytical / multiple choice, and closer to 1.0 for creative and generative tasks.
   * @default 1.0
   */
  temperature?: number
  /**
   * Use nucleus sampling.
   *
   * In nucleus sampling, we compute the cumulative distribution over all the options for each subsequent token in decreasing probability order and cut it off once it reaches a particular probability specified by top_p. You should either alter temperature or top_p, but not both.
   */
  top_p?: number
  /**
   * The maximum number of tokens to generate before stopping. This parameter only specifies the absolute maximum number of tokens to generate. Required by the API; the adapter defaults to 1024 when omitted.
   * Range x >= 1.
   */
  max_tokens?: number
}

export type ExternalTextProviderOptions = AnthropicCacheControlOptions &
  AnthropicContainerOptions &
  AnthropicContextManagementOptions &
  AnthropicMCPOptions &
  AnthropicServiceTierOptions &
  AnthropicStopSequencesOptions &
  AnthropicToolChoiceOptions &
  AnthropicSamplingOptions

export interface InternalTextProviderOptions
  extends
    ExternalTextProviderOptions,
    Omit<AnthropicThinkingFields, 'output_config'> {
  model: string

  messages: Array<BetaMessageParam>

  /**
   * The maximum number of tokens to generate before stopping.  This parameter only specifies the absolute maximum number of tokens to generate.
   * Range x >= 1.
   */
  max_tokens: number
  /**
   * Whether to incrementally stream the response using server-sent events.
   */
  stream?: boolean
  /**
   * System prompt — built by the adapter from the user-facing
   * `systemPrompts: Array<string>` on the chat call. This field is internal:
   * users should pass system prompts via `systemPrompts`, not via
   * `modelOptions`.
   *
   * A system prompt is a way of providing context and instructions to Claude,
   * such as specifying a particular goal or role.
   */
  system?: string | Array<TextBlockParam>

  tools?: Array<AnthropicTool>

  /**
   * Schema-constrained final answer in a single Messages request (issue
   * #605). Set by the engine when the adapter declared
   * `supportsCombinedToolsAndSchema` and a caller passed `outputSchema`
   * to `chat()`. The model emits tool calls during the agent loop and a
   * schema-matching JSON message on the natural final turn — no separate
   * finalization round-trip needed.
   *
   * The SDK type (`BetaOutputConfig`) currently exposes only `effort`;
   * `format` is accepted at runtime per the deprecation notice on the
   * older `output_format` field
   * (https://platform.claude.com/docs/en/build-with-claude/structured-outputs).
   * We type it explicitly here so the adapter call site doesn't need a
   * cast.
   */
  output_config?: {
    effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null
    format?: {
      type: 'json_schema'
      schema: Record<string, unknown>
    }
  }
}

const validateTopPandTemperature = (options: InternalTextProviderOptions) => {
  if (options.top_p !== undefined && options.temperature !== undefined) {
    throw new Error('You should either set top_p or temperature, but not both.')
  }
}

export interface CacheControl {
  type: 'ephemeral'
  ttl: '5m' | '1h'
}

const validateThinking = (options: InternalTextProviderOptions) => {
  const thinking = options.thinking
  if (thinking && thinking.type === 'enabled') {
    if (thinking.budget_tokens < 1024) {
      throw new Error('thinking.budget_tokens must be at least 1024.')
    }
    if (thinking.budget_tokens >= options.max_tokens) {
      throw new Error('thinking.budget_tokens must be less than max_tokens.')
    }
  }
}

interface MCPServer {
  name: string
  url: string
  type: 'url'
  authorization_token?: string | null
  tool_configuration: {
    allowed_tools?: Array<string> | null
    enabled?: boolean | null
  } | null
}

const validateMaxTokens = (options: InternalTextProviderOptions) => {
  if (options.max_tokens < 1) {
    throw new Error('max_tokens must be at least 1.')
  }
}

export const validateTextProviderOptions = (
  options: InternalTextProviderOptions,
) => {
  validateTopPandTemperature(options)
  validateThinking(options)
  validateMaxTokens(options)
}
