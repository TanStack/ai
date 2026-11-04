import { buildBaseUsage } from '@tanstack/ai'
import type { TokenUsage } from '@tanstack/ai'
import type { ChatUsage, ServerToolUseDetails } from '@openrouter/sdk/models'

/**
 * OpenRouter-specific provider usage details.
 * These fields are unique to OpenRouter and placed in providerUsageDetails.
 */
export type OpenRouterProviderUsageDetails = {
  /** Accepted prediction tokens (speculative decoding) */
  acceptedPredictionTokens?: number
  /** Rejected prediction tokens (speculative decoding) */
  rejectedPredictionTokens?: number
  /** Whether the request used a Bring Your Own Key configuration */
  isByok?: boolean
  /** OpenRouter server-side tool use (e.g. web search) */
  serverToolUseDetails?: ServerToolUseDetails
}

/**
 * Build normalized TokenUsage from OpenRouter's ChatUsage object.
 * Returns `undefined` when the provider reported no usage object, so callers
 * omit the field rather than fabricating zeroed totals.
 */
export function buildOpenRouterUsage(
  usage: ChatUsage | undefined | null,
): TokenUsage<OpenRouterProviderUsageDetails> | undefined {
  if (!usage) return undefined

  const result = buildBaseUsage<OpenRouterProviderUsageDetails>({
    promptTokens: usage.promptTokens || 0,
    completionTokens: usage.completionTokens || 0,
    totalTokens: usage.totalTokens || 0,
  })

  // Add prompt token details (passthrough from SDK)
  if (usage.promptTokensDetails) {
    result.promptTokensDetails = usage.promptTokensDetails
  }

  // Map completion tokens details (passthrough from SDK)
  const details = usage.completionTokensDetails
  if (details) {
    result.completionTokensDetails = {
      ...(details.reasoningTokens != null
        ? { reasoningTokens: details.reasoningTokens }
        : {}),
      ...(details.audioTokens ? { audioTokens: details.audioTokens } : {}),
    }
  }

  // OpenRouter-specific fields go to providerUsageDetails
  const providerDetails = {
    ...(details?.acceptedPredictionTokens
      ? { acceptedPredictionTokens: details.acceptedPredictionTokens }
      : {}),
    ...(details?.rejectedPredictionTokens
      ? { rejectedPredictionTokens: details.rejectedPredictionTokens }
      : {}),
    ...(usage.isByok != null ? { isByok: usage.isByok } : {}),
    ...(usage.serverToolUseDetails
      ? { serverToolUseDetails: usage.serverToolUseDetails }
      : {}),
  } satisfies OpenRouterProviderUsageDetails

  if (Object.keys(providerDetails).length > 0) {
    result.providerUsageDetails = providerDetails
  }

  return result
}
