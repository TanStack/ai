import type { ProviderUsageDetails, TokenUsage } from '../types'

export interface BaseUsageInput {
  /** Total input/prompt tokens */
  promptTokens: number
  /** Total output/completion tokens */
  completionTokens: number
  /** Total tokens (prompt + completion) */
  totalTokens: number
}

export function buildBaseUsage<TProviderDetails = ProviderUsageDetails>(
  input: BaseUsageInput,
): TokenUsage<TProviderDetails> {
  return {
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens: input.totalTokens,
  }
}
