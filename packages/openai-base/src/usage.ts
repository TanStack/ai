import { buildBaseUsage } from '@tanstack/ai'
import type { TokenUsage } from '@tanstack/ai'
import type OpenAI from 'openai'

/**
 * Build normalized {@link TokenUsage} from an OpenAI-compatible Chat
 * Completions `usage` object.
 *
 * Shared by every provider that routes through
 * {@link OpenAIBaseChatCompletionsTextAdapter} (OpenAI Chat Completions, Grok,
 * Groq). Surfaces cached prompt tokens and reasoning/audio detail tokens when
 * the provider reports them; absent usage collapses to zeroed totals so callers
 * can spread the result unconditionally.
 */
export function buildChatCompletionsUsage(
  usage: OpenAI.Chat.Completions.ChatCompletion['usage'] | undefined | null,
): TokenUsage {
  const result = buildBaseUsage({
    promptTokens: usage?.prompt_tokens || 0,
    completionTokens: usage?.completion_tokens || 0,
    totalTokens: usage?.total_tokens || 0,
  })

  const completionDetails = usage?.completion_tokens_details
  const completionTokensDetails = {
    ...(completionDetails?.reasoning_tokens
      ? { reasoningTokens: completionDetails.reasoning_tokens }
      : {}),
    ...(completionDetails?.audio_tokens
      ? { audioTokens: completionDetails.audio_tokens }
      : {}),
  }

  const promptDetails = usage?.prompt_tokens_details
  const promptTokensDetails = {
    ...(promptDetails?.cached_tokens
      ? { cachedTokens: promptDetails.cached_tokens }
      : {}),
    ...(promptDetails?.audio_tokens
      ? { audioTokens: promptDetails.audio_tokens }
      : {}),
  }

  if (Object.keys(completionTokensDetails).length > 0) {
    result.completionTokensDetails = completionTokensDetails
  }
  if (Object.keys(promptTokensDetails).length > 0) {
    result.promptTokensDetails = promptTokensDetails
  }

  return result
}

/**
 * Build normalized {@link TokenUsage} from an OpenAI Responses API
 * `ResponseUsage` object.
 *
 * Shared by every provider that routes through
 * {@link OpenAIBaseResponsesTextAdapter}. Surfaces cached prompt tokens and
 * reasoning detail tokens when present; absent usage collapses to zeroed totals.
 */
export function buildResponsesUsage(
  usage: OpenAI.Responses.ResponseUsage | undefined | null,
): TokenUsage {
  const result = buildBaseUsage({
    promptTokens: usage?.input_tokens || 0,
    completionTokens: usage?.output_tokens || 0,
    totalTokens: usage?.total_tokens || 0,
  })

  // Despite the SDK types marking these required, they can be undefined at runtime.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const cachedTokens = usage?.input_tokens_details?.cached_tokens
  if (cachedTokens && cachedTokens > 0) {
    result.promptTokensDetails = {
      ...result.promptTokensDetails,
      cachedTokens,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const reasoningTokens = usage?.output_tokens_details?.reasoning_tokens
  if (reasoningTokens && reasoningTokens > 0) {
    result.completionTokensDetails = {
      ...result.completionTokensDetails,
      reasoningTokens,
    }
  }

  return result
}
