import { buildBaseUsage } from '@tanstack/ai'
import type { TokenUsage } from '@tanstack/ai'
import type { TokenUsage as ConverseTokenUsage } from '@aws-sdk/client-bedrock-runtime'

/**
 * Build normalized {@link TokenUsage} from a Converse `usage` object.
 *
 * `inputTokens` is the uncached part of the input only. Cache reads and writes
 * come as separate fields and go on `promptTokensDetails`, same as the Anthropic
 * and OpenAI builders. Zero is kept, unlike those builders. Bedrock leaves the
 * fields out when no checkpoint applied and sends 0 when one did (a served
 * checkpoint writes 0), so absent and zero are different results.
 */
export function buildConverseUsage(usage: ConverseTokenUsage): TokenUsage {
  const result = buildBaseUsage({
    promptTokens: usage.inputTokens ?? 0,
    completionTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
  })

  const cachedTokens = usage.cacheReadInputTokens
  const cacheWriteTokens = usage.cacheWriteInputTokens
  const promptTokensDetails = {
    ...(cachedTokens !== undefined ? { cachedTokens } : {}),
    ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
  }
  if (Object.keys(promptTokensDetails).length > 0) {
    result.promptTokensDetails = promptTokensDetails
  }

  return result
}
