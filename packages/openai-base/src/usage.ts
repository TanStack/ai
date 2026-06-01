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

  // Predicted Outputs accepted/rejected counts have no canonical TokenUsage
  // slot but are still billed (rejected tokens included), so surface them under
  // providerUsageDetails — matching how the OpenRouter adapter exposes them.
  const providerUsageDetails = {
    ...(completionDetails?.accepted_prediction_tokens
      ? {
          acceptedPredictionTokens:
            completionDetails.accepted_prediction_tokens,
        }
      : {}),
    ...(completionDetails?.rejected_prediction_tokens
      ? {
          rejectedPredictionTokens:
            completionDetails.rejected_prediction_tokens,
        }
      : {}),
  }
  if (Object.keys(providerUsageDetails).length > 0) {
    result.providerUsageDetails = providerUsageDetails
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

/**
 * Build normalized {@link TokenUsage} from an OpenAI Images API `usage` object.
 *
 * Shared by every provider that generates images through the OpenAI Images SDK
 * (OpenAI, Grok). Token-billed image models (e.g. gpt-image-1) report an input
 * breakdown of text vs image tokens, which is surfaced on `promptTokensDetails`.
 * Models that don't return usage (e.g. DALL·E) yield `undefined` so callers can
 * omit the field rather than emit zeroed totals.
 */
export function buildImagesUsage(
  usage: OpenAI.Images.ImagesResponse['usage'] | undefined | null,
): TokenUsage | undefined {
  if (!usage) return undefined

  const result = buildBaseUsage({
    promptTokens: usage.input_tokens || 0,
    completionTokens: usage.output_tokens || 0,
    totalTokens: usage.total_tokens || 0,
  })

  // The SDK types input_tokens_details (and its numeric fields) as required, but
  // real responses — e.g. from DALL·E or other non-token-billed models — can
  // omit them, so treat the breakdown as optional.
  const inputDetails = usage.input_tokens_details as
    | { text_tokens?: number; image_tokens?: number }
    | undefined
  const promptTokensDetails = {
    ...(inputDetails?.text_tokens
      ? { textTokens: inputDetails.text_tokens }
      : {}),
    ...(inputDetails?.image_tokens
      ? { imageTokens: inputDetails.image_tokens }
      : {}),
  }
  if (Object.keys(promptTokensDetails).length > 0) {
    result.promptTokensDetails = promptTokensDetails
  }

  return result
}
