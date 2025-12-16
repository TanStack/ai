import type { ClaudeAgentSdkModel } from '../model-meta'

/**
 * Configuration for ClaudeAgentSdk adapter.
 * Note: No API key required - authentication handled by SDK runtime
 * (Claude Max subscription or ANTHROPIC_API_KEY environment variable).
 */
export interface ClaudeAgentSdkConfig {
  /**
   * Default model to use if not specified in chat options.
   * @default undefined (uses SDK default)
   */
  model?: ClaudeAgentSdkModel
}

/**
 * Extended thinking configuration for Claude models.
 */
export interface ThinkingOptions {
  /**
   * Whether thinking is enabled or disabled.
   */
  type: 'enabled' | 'disabled'
  /**
   * Token budget for thinking (must be < max_tokens).
   * Only applicable when type is 'enabled'.
   */
  budget_tokens?: number
}

/**
 * Claude Agent SDK-specific provider options.
 * Mirrors Anthropic adapter options for feature parity.
 */
export interface ClaudeAgentSdkProviderOptions {
  /**
   * Extended thinking configuration.
   * When enabled, Claude will show its reasoning process before providing the final answer.
   */
  thinking?: ThinkingOptions

  /**
   * Custom stop sequences that will cause the model to stop generating.
   */
  stop_sequences?: Array<string>

  /**
   * Top-K sampling parameter.
   * Only sample from the top K options for each subsequent token.
   * Used to remove "long tail" low probability responses.
   */
  top_k?: number

  /**
   * Maximum conversation turns.
   * Limits how many back-and-forth exchanges occur in agentic mode.
   */
  maxTurns?: number

  /**
   * System prompt override.
   */
  system?: string
}

/**
 * Internal options structure used within the adapter.
 */
export interface InternalClaudeAgentSdkOptions extends ClaudeAgentSdkProviderOptions {
  model: string
  max_tokens: number
  temperature?: number
  top_p?: number
}

/**
 * Validates provider options for Claude Agent SDK.
 */
export function validateTextProviderOptions(options: InternalClaudeAgentSdkOptions): void {
  // Validate top_p and temperature are not both set
  if (options.top_p !== undefined && options.temperature !== undefined) {
    throw new Error('You should either set top_p or temperature, but not both.')
  }

  // Validate max_tokens
  if (options.max_tokens < 1) {
    throw new Error('max_tokens must be at least 1.')
  }

  // Validate thinking options
  const thinking = options.thinking
  if (thinking && thinking.type === 'enabled') {
    if (thinking.budget_tokens !== undefined && thinking.budget_tokens < 1024) {
      throw new Error('thinking.budget_tokens must be at least 1024.')
    }
    if (thinking.budget_tokens !== undefined && thinking.budget_tokens >= options.max_tokens) {
      throw new Error('thinking.budget_tokens must be less than max_tokens.')
    }
  }

  // Validate top_k
  if (options.top_k !== undefined && options.top_k < 1) {
    throw new Error('top_k must be at least 1.')
  }
}
