import { buildBaseUsage } from '@tanstack/ai'
import type { TokenUsage } from '@tanstack/ai'
import type OpenAI_SDK from 'openai'

/**
 * Build normalized TokenUsage from OpenAI's ResponseUsage
 */
export function buildOpenAIUsage(
  usage: OpenAI_SDK.Responses.ResponseUsage | undefined,
): TokenUsage | undefined {
  if (!usage) return undefined

  const result = buildBaseUsage({
    promptTokens: usage.input_tokens || 0,
    completionTokens: usage.output_tokens || 0,
    totalTokens: usage.total_tokens || 0,
  })

  // Add prompt token details if available
  // Note: Despite TypeScript types saying these are required, they can be undefined at runtime
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const cachedTokens = usage.input_tokens_details?.cached_tokens
  if (cachedTokens && cachedTokens > 0) {
    result.promptTokensDetails = {
      ...result.promptTokensDetails,
      cachedTokens,
    }
  }

  // Add completion token details if available
  // Note: Despite TypeScript types saying these are required, they can be undefined at runtime
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const reasoningTokens = usage.output_tokens_details?.reasoning_tokens
  if (reasoningTokens && reasoningTokens > 0) {
    result.completionTokensDetails = {
      ...result.completionTokensDetails,
      reasoningTokens,
    }
  }

  return result
}
