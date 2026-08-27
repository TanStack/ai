import { buildBaseUsage } from '@tanstack/ai'
import type { TokenUsage } from '@tanstack/ai'
import type OpenAI from 'openai'

export function buildChatCompletionsUsage(
  usage: OpenAI.Chat.Completions.ChatCompletion['usage'] | undefined | null,
): TokenUsage | undefined {
  if (!usage) return undefined

  const result = buildBaseUsage({
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
  })

  const completionDetails = usage.completion_tokens_details
  const completionTokensDetails = {
    ...(completionDetails?.reasoning_tokens
      ? { reasoningTokens: completionDetails.reasoning_tokens }
      : {}),
    ...(completionDetails?.audio_tokens
      ? { audioTokens: completionDetails.audio_tokens }
      : {}),
  }

  const promptDetails = usage.prompt_tokens_details
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

export function buildResponsesUsage(
  usage: OpenAI.Responses.ResponseUsage | undefined | null,
): TokenUsage | undefined {
  if (!usage) return undefined

  const result = buildBaseUsage({
    promptTokens: usage.input_tokens || 0,
    completionTokens: usage.output_tokens || 0,
    totalTokens: usage.total_tokens || 0,
  })

  // Despite the SDK types marking these required, they can be undefined at runtime.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const cachedTokens = usage.input_tokens_details?.cached_tokens
  if (cachedTokens && cachedTokens > 0) {
    result.promptTokensDetails = {
      ...result.promptTokensDetails,
      cachedTokens,
    }
  }

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

export function buildImagesUsage(
  usage: OpenAI.Images.ImagesResponse['usage'] | undefined | null,
): TokenUsage | undefined {
  if (!usage) return undefined

  const result = buildBaseUsage({
    promptTokens: usage.input_tokens || 0,
    completionTokens: usage.output_tokens || 0,
    totalTokens: usage.total_tokens || 0,
  })

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
