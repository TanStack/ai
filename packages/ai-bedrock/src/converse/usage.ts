import { buildBaseUsage } from '@tanstack/ai'
import type { TokenUsage } from '@tanstack/ai'
import type { TokenUsage as ConverseTokenUsage } from '@aws-sdk/client-bedrock-runtime'

/**
 * Build normalized {@link TokenUsage} from a Converse `usage` object.
 *
 * `promptTokens` is the total input. Converse `inputTokens` is only the
 * uncached part, so the cache reads and cache writes are added to it. The two
 * cache parts also go on `promptTokensDetails`. Zero is kept, unlike the
 * Anthropic and OpenAI builders. Bedrock leaves the fields out when no
 * checkpoint applied and sends 0 when one did (a served checkpoint writes 0),
 * so absent and zero are different results.
 */
export function buildConverseUsage(usage: ConverseTokenUsage): TokenUsage {
  const cachedTokens = usage.cacheReadInputTokens
  const cacheWriteTokens = usage.cacheWriteInputTokens
  const promptTokens =
    (usage.inputTokens ?? 0) + (cachedTokens ?? 0) + (cacheWriteTokens ?? 0)
  const completionTokens = usage.outputTokens ?? 0
  const result = buildBaseUsage({
    promptTokens,
    completionTokens,
    // The provider total must not be lower than the sum of the parts.
    totalTokens: Math.max(
      usage.totalTokens ?? 0,
      promptTokens + completionTokens,
    ),
  })

  const promptTokensDetails = {
    ...(cachedTokens !== undefined ? { cachedTokens } : {}),
    ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
  }
  if (Object.keys(promptTokensDetails).length > 0) {
    result.promptTokensDetails = promptTokensDetails
  }

  return result
}
