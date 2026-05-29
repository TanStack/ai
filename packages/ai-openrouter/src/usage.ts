import { buildBaseUsage } from '@tanstack/ai'
import type { UsageTotals } from '@tanstack/ai'
import type { ChatUsage } from '@openrouter/sdk/models'

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
 * Build normalized UsageTotals from OpenRouter's ChatUsage object.
 * OpenRouter already has the detail fields structured correctly. Absent usage
 * collapses to zeroed totals so callers can spread the result unconditionally.
 */
export function buildOpenRouterUsage(
  usage: ChatUsage | undefined,
): UsageTotals {
  const result = buildBaseUsage({
    promptTokens: usage?.promptTokens || 0,
    completionTokens: usage?.completionTokens || 0,
    totalTokens: usage?.totalTokens || 0,
  })

  // Add prompt token details (passthrough from SDK)
  if (usage?.promptTokensDetails) {
    result.promptTokensDetails = usage.promptTokensDetails
  }

  // Map completion tokens details (passthrough from SDK)
  if (usage?.completionTokensDetails) {
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
