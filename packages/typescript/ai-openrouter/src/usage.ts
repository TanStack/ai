import { buildBaseUsage } from '@tanstack/ai'
import type { TokenUsage } from '@tanstack/ai'
import type { ChatGenerationTokenUsage } from '@openrouter/sdk/models'

/**
 * OpenRouter-specific provider usage details.
 * These fields are unique to OpenRouter and placed in providerUsageDetails.
 */
export interface OpenRouterProviderUsageDetails {
  /** Accepted prediction tokens (speculative decoding) */
  acceptedPredictionTokens?: number
  /** Rejected prediction tokens (speculative decoding) */
  rejectedPredictionTokens?: number
  /** Index signature for Record<string, unknown> compatibility */
  [key: string]: unknown
}

/**
 * Build normalized TokenUsage from OpenRouter's ChatGenerationTokenUsage
 * OpenRouter already has the detail fields structured correctly
 */
export function buildOpenRouterUsage(
  usage: ChatGenerationTokenUsage | undefined,
): TokenUsage | undefined {
  if (!usage) return undefined

  const result = buildBaseUsage({
    promptTokens: usage.promptTokens || 0,
    completionTokens: usage.completionTokens || 0,
    totalTokens: usage.totalTokens || 0,
  })

  // Add prompt token details (passthrough from SDK)
  if (usage.promptTokensDetails) {
    result.promptTokensDetails = usage.promptTokensDetails ?? undefined
  }

  // Map completion tokens details (passthrough from SDK)
  if (usage.completionTokensDetails) {
    const details = usage.completionTokensDetails
    result.completionTokensDetails = {
      ...(details.reasoningTokens
        ? { reasoningTokens: details.reasoningTokens }
        : {}),
      ...(details.audioTokens ? { audioTokens: details.audioTokens } : {}),
    }

    // Add OpenRouter-specific prediction tokens to providerUsageDetails
    const providerDetails = {
      ...(details.acceptedPredictionTokens
        ? { acceptedPredictionTokens: details.acceptedPredictionTokens }
        : {}),
      ...(details.rejectedPredictionTokens
        ? { rejectedPredictionTokens: details.rejectedPredictionTokens }
        : {}),
    } satisfies OpenRouterProviderUsageDetails

    if (Object.keys(providerDetails).length > 0) {
      result.providerUsageDetails = providerDetails
    }
  }

  return result
}
