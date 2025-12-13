import type {
  PerformanceConfigLatency,
  ServiceTierType,
  ToolChoice,
} from '@aws-sdk/client-bedrock-runtime'
import type { DocumentType } from '@smithy/types'

/**
 * Bedrock provider options interfaces
 * Split by feature for per-model type-safety
 *
 * Note: Common options (maxTokens, temperature, topP) are passed via ChatOptions.options,
 * not via providerOptions. These interfaces only contain Bedrock-specific options.
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html
 */

export interface BedrockBaseOptions {
  /**
   * Only sample from the top K options for each subsequent token.
   * Not all models support this parameter.
   */
  topK?: number
  /**
   * Sequences that will cause the model to stop generating further tokens.
   */
  stopSequences?: Array<string>
}

export interface BedrockAdditionalFieldsOptions {
  /**
   * Escape hatch for provider-specific fields not exposed by the Converse API.
   * Use this to pass model-specific parameters directly.
   */
  additionalModelRequestFields?: Record<string, DocumentType>
}

export interface BedrockPerformanceOptions {
  /**
   * Performance configuration for latency optimization.
   * When set to 'optimized', uses latency-optimized inference for supported models.
   *
   * Supported models (as of 2025):
   * - Amazon Nova Pro
   * - Anthropic Claude 3.5 Haiku
   * - Meta Llama 3.1 70B/405B Instruct
   *
   * Benefits: Up to 42% faster time-to-first-token (TTFT) and 77% more output tokens/second.
   *
   * @see https://docs.aws.amazon.com/bedrock/latest/userguide/latency-optimized-inference.html
   */
  performanceConfig?: {
    latency: PerformanceConfigLatency
  }
}

export interface BedrockServiceTierOptions {
  /**
   * Service tier configuration for request prioritization.
   *
   * - `priority`: For mission-critical apps needing rapid response (25% better latency, premium pricing)
   * - `default`: Standard tier for everyday AI tasks
   * - `flex`: Cost-effective for non-time-critical workloads (discounted pricing)
   * - `reserved`: Predictable performance with guaranteed tokens-per-minute capacity
   *
   * @see https://docs.aws.amazon.com/bedrock/latest/userguide/service-tiers.html
   */
  serviceTier?: {
    type: ServiceTierType
  }
}

export interface BedrockRequestMetadataOptions {
  /**
   * Metadata as key-value pairs for request tracking and log filtering.
   * Useful for analytics, debugging, and cost allocation.
   *
   * @example
   * ```typescript
   * requestMetadata: {
   *   userId: '12345',
   *   sessionId: 'abc-def',
   *   feature: 'chat-assistant'
   * }
   * ```
   *
   * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html
   */
  requestMetadata?: Record<string, string>
}

export interface BedrockToolChoiceOptions {
  /**
   * Controls how the model selects and invokes tools.
   *
   * - `auto`: Model autonomously decides whether to call a tool or generate text (default)
   * - `any`: Model must invoke at least one tool from the provided list
   * - `tool`: Model must use a specific named tool
   *
   * Supported by: Anthropic Claude 3+, Amazon Nova models
   *
   * @example
   * ```typescript
   * // Let model decide
   * toolChoice: { auto: {} }
   *
   * // Force tool use
   * toolChoice: { any: {} }
   *
   * // Use specific tool
   * toolChoice: { tool: { name: 'get_weather' } }
   * ```
   *
   * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ToolChoice.html
   */
  toolChoice?: ToolChoice
}

export interface BedrockAnthropicReasoningOptions {
  /**
   * Configuration for Claude's extended thinking capabilities.
   * Only applicable to Claude reasoning models on Bedrock.
   *
   * Note: When thinking is enabled, `temperature`, `topP`, and `topK` cannot be modified.
   * Streaming is required when `maxTokens` > 21,333.
   *
   * @see https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-extended-thinking.html
   * @see https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking
   */
  reasoningConfig?: {
    /**
     * Whether reasoning is enabled or disabled.
     */
    type: 'enabled' | 'disabled'
    /**
     * Token budget for reasoning/thinking.
     * Minimum: 1024, Maximum: 64000
     */
    budgetTokens?: number
  }
}

export interface BedrockReasoningEffortOptions {
  /**
   * Configuration for reasoning effort on non-Anthropic models.
   * Applicable to Amazon Nova, DeepSeek R1, Mistral Magistral, NVIDIA Nemotron, Moonshot Kimi.
   */
  reasoningConfig?: {
    /**
     * Whether reasoning is enabled or disabled.
     */
    type: 'enabled' | 'disabled'
    /**
     * Maximum reasoning effort level.
     */
    maxReasoningEffort?: 'low' | 'medium' | 'high'
  }
}

export interface BedrockAnthropicOptions {
  /**
   * Anthropic-specific beta features.
   * Only applicable to Claude models on Bedrock.
   * @see https://docs.anthropic.com/en/api/versioning#beta-features
   */
  anthropicBeta?: Array<string>
}

export type BedrockProviderOptions = BedrockBaseOptions &
  BedrockAdditionalFieldsOptions &
  BedrockAnthropicReasoningOptions &
  BedrockPerformanceOptions &
  BedrockServiceTierOptions &
  BedrockRequestMetadataOptions &
  BedrockToolChoiceOptions

