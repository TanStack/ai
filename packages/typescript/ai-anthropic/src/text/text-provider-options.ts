import type {
  BetaContextManagementConfig,
  BetaToolChoiceAny,
  BetaToolChoiceAuto,
  BetaToolChoiceTool,
} from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { AnthropicTool } from '../tools'
import type {
  MessageParam,
  TextBlockParam,
} from '@anthropic-ai/sdk/resources/messages'

export interface AnthropicContainerOptions {
  /**
   * Container identifier for reuse across requests.
   * Container parameters with skills to be loaded.
   */
  container?: {
    id: string | null
    /**
     * List of skills to load into the container
     */
    skills: Array<{
      /**
       * Between 1-64 characters
       */
      skill_id: string

      type: 'anthropic' | 'custom'
      /**
       * Skill version or latest by default
       */
      version?: string
    }> | null
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

export interface AnthropicThinkingOptions {
  /**
     * Configuration for enabling Claude's extended thinking.

When enabled, responses include thinking content blocks showing Claude's thinking process before the final answer. Requires a minimum budget of 1,024 tokens and counts towards your max_tokens limit.
     */
  thinking?:
    | {
        /**
* Determines how many tokens Claude can use for its internal reasoning process. Larger budgets can enable more thorough analysis for complex problems, improving response quality.

Must be ≥1024 and less than max_tokens
*/
        budget_tokens: number

        type: 'enabled'
      }
    | {
        type: 'disabled'
      }
}

export interface AnthropicAdaptiveThinkingOptions {
  /**
   * Configuration for Claude's adaptive thinking (Opus 4.6+).
   *
   * In adaptive mode, Claude dynamically decides when and how much to think.
   * Use the effort parameter to control thinking depth.
   * `thinking: {type: "enabled"}` with `budget_tokens` is deprecated on Opus 4.6.
   */
  thinking?:
    | {
        type: 'adaptive'
      }
    | {
        /**
         * @deprecated Use `type: 'adaptive'` with the effort parameter on Opus 4.6+.
         */
        budget_tokens: number
        type: 'enabled'
      }
    | {
        type: 'disabled'
      }
}

export interface AnthropicEffortOptions {
  /**
   * Controls the thinking depth for adaptive thinking mode (Opus 4.6+).
   *
   * - `max`: Absolute highest capability
   * - `high`: Default - Claude will almost always think
   * - `medium`: Balanced cost-quality
   * - `low`: May skip thinking for simpler problems
   */
  effort?: 'max' | 'high' | 'medium' | 'low'
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
}

export type ExternalTextProviderOptions = AnthropicContainerOptions &
  AnthropicContextManagementOptions &
  AnthropicMCPOptions &
  AnthropicServiceTierOptions &
  AnthropicStopSequencesOptions &
  AnthropicThinkingOptions &
  AnthropicToolChoiceOptions &
  AnthropicSamplingOptions &
  Partial<AnthropicAdaptiveThinkingOptions> &
  Partial<AnthropicEffortOptions>

export interface InternalTextProviderOptions extends ExternalTextProviderOptions {
  model: string

  messages: Array<MessageParam>

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
    * stem prompt.
 
 A system prompt is a way of providing context and instructions to Claude, such as specifying a particular goal or role.
    */
  system?: string | Array<TextBlockParam>
  /**
   * Amount of randomness injected into the response.
   * Either use this or top_p, but not both.
   * Defaults to 1.0. Ranges from 0.0 to 1.0. Use temperature closer to 0.0 for analytical / multiple choice, and closer to 1.0 for creative and generative tasks.
   * @default 1.0
   */
  temperature?: number

  tools?: Array<AnthropicTool>

  /**
   * Use nucleus sampling.

In nucleus sampling, we compute the cumulative distribution over all the options for each subsequent token in decreasing probability order and cut it off once it reaches a particular probability specified by top_p. You should either alter temperature or top_p, but not both.
   */
  top_p?: number
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
