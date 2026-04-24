import { buildBaseUsage } from '@tanstack/ai'
import type { TokenUsage } from '@tanstack/ai'
import type OpenAI_SDK from 'openai'

/**
 * Build normalized TokenUsage from Grok's Chat Completions usage
 * Uses same format as OpenAI Chat Completions (not Responses API)
 */
export function buildGrokUsage(
  usage: OpenAI_SDK.Chat.Completions.ChatCompletion['usage'] | undefined | null,
): TokenUsage | undefined {
  if (!usage) return undefined

  const result = buildBaseUsage({
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
  })

  // Check for completion tokens details (reasoning tokens, etc.)
  // Grok (via OpenAI-compatible API) may provide these for reasoning models
  const completionDetails = usage.completion_tokens_details

  const completionTokensDetails = {
    ...(completionDetails?.reasoning_tokens &&
    completionDetails.reasoning_tokens > 0
      ? { reasoningTokens: completionDetails.reasoning_tokens }
      : {}),
    ...(completionDetails?.audio_tokens && completionDetails.audio_tokens > 0
      ? { audioTokens: completionDetails.audio_tokens }
      : {}),
  }

  // Check for prompt tokens details (cached tokens, etc.)
  const promptDetails = usage.prompt_tokens_details

  const promptTokensDetails = {
    ...(promptDetails?.cached_tokens && promptDetails.cached_tokens > 0
      ? { cachedTokens: promptDetails.cached_tokens }
      : {}),
    ...(promptDetails?.audio_tokens && promptDetails.audio_tokens > 0
      ? { audioTokens: promptDetails.audio_tokens }
      : {}),
  }

  // Add details only if non-empty
  if (Object.keys(completionTokensDetails).length > 0) {
    result.completionTokensDetails = completionTokensDetails
  }
  if (Object.keys(promptTokensDetails).length > 0) {
    result.promptTokensDetails = promptTokensDetails
  }

  return result
}
