import { buildBaseUsage } from '@tanstack/ai'
import type { TokenUsage } from '@tanstack/ai'
import type { ChatResponse } from 'ollama'

/**
 * Ollama-specific provider usage details.
 * These fields are unique to Ollama and placed in providerUsageDetails.
 */
export interface OllamaProviderUsageDetails {
  /** Time spent loading the model in nanoseconds */
  loadDuration?: number
  /** Time spent evaluating the prompt in nanoseconds */
  promptEvalDuration?: number
  /** Time spent generating the response in nanoseconds */
  evalDuration?: number
  /** Total duration of the request in nanoseconds */
  totalDuration?: number
  /** Number of prompt evaluation steps */
  promptEvalCount?: number
  /** Number of evaluation steps for generation */
  evalCount?: number
  /** Index signature for Record<string, unknown> compatibility */
  [key: string]: unknown
}

/**
 * Build normalized TokenUsage from Ollama's ChatResponse.
 * Handles duration metrics as provider-specific details.
 */
export function buildOllamaUsage(
  response: ChatResponse,
): TokenUsage | undefined {
  // Ollama provides prompt_eval_count and eval_count
  const promptTokens = response.prompt_eval_count
  const completionTokens = response.eval_count

  // If no token counts are available, return undefined
  if (promptTokens === 0 && completionTokens === 0) {
    return undefined
  }

  const result = buildBaseUsage({
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  })

  // Add provider-specific duration details
  const providerDetails = {
    ...(response.load_duration > 0
      ? { loadDuration: response.load_duration }
      : {}),
    ...(response.prompt_eval_duration > 0
      ? { promptEvalDuration: response.prompt_eval_duration }
      : {}),
    ...(response.eval_duration > 0
      ? { evalDuration: response.eval_duration }
      : {}),
    ...(response.total_duration > 0
      ? { totalDuration: response.total_duration }
      : {}),
  } satisfies OllamaProviderUsageDetails

  if (Object.keys(providerDetails).length > 0) {
    result.providerUsageDetails = providerDetails
  }

  return result
}
