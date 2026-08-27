import { buildBaseUsage } from '@tanstack/ai'
import type { TokenUsage } from '@tanstack/ai'
import type { ChatResponse } from 'ollama'

export type OllamaProviderUsageDetails = {
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
}

export function buildOllamaUsage(
  response: ChatResponse,
): TokenUsage | undefined {
  const promptTokens = response.prompt_eval_count || 0
  const completionTokens = response.eval_count || 0
  const hasTokenCounts = promptTokens > 0 || completionTokens > 0

  const result = buildBaseUsage<OllamaProviderUsageDetails>({
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  })

  // Add provider-specific duration details. Durations are optional too; guard
  // each before comparing so missing fields don't throw under strict mode.
  const providerDetails = {
    ...(response.load_duration ? { loadDuration: response.load_duration } : {}),
    ...(response.prompt_eval_duration
      ? { promptEvalDuration: response.prompt_eval_duration }
      : {}),
    ...(response.eval_duration ? { evalDuration: response.eval_duration } : {}),
    ...(response.total_duration
      ? { totalDuration: response.total_duration }
      : {}),
  } satisfies OllamaProviderUsageDetails

  const hasProviderDetails = Object.keys(providerDetails).length > 0
  if (hasProviderDetails) {
    result.providerUsageDetails = providerDetails
  }

  // Nothing useful to report: no token counts and no duration metrics.
  const nothingToReport = !hasTokenCounts && !hasProviderDetails
  if (nothingToReport) {
    return undefined
  }

  return result
}
