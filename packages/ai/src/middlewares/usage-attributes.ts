import { firstNumber } from '../utilities/numbers'
import type { AttributeValue } from '@opentelemetry/api'
import type { TokenUsage } from '../types'

/**
 * Build the full set of `gen_ai.usage.*` span attributes from a `TokenUsage`.
 *
 * Beyond input/output tokens, this emits provider-reported cost, total tokens,
 * cache and reasoning breakdowns, duration-based billing, and media unit counts
 * — every field is guarded so spans stay clean when a provider doesn't report
 * it. Cache and reasoning use the official GenAI semconv names;
 * `gen_ai.usage.cost` and `gen_ai.usage.total_tokens` are de-facto extensions
 * consumed by backends like PostHog (which otherwise re-derive cost from their
 * own price tables, losing cache discounts and gateway markup). Fields with no
 * semconv or de-facto convention (`costDetails`, `durationSeconds`,
 * `unitsBilled`) are TanStack-namespaced.
 *
 * Shared by `otelMiddleware` across every activity (chat and the media
 * activities) so usage lands identically whichever activity produced the span.
 *
 * Deliberately not emitted: `providerUsageDetails` (a provider-shaped bag,
 * unsafe to spread onto spans) and the per-modality token breakdowns
 * (`promptTokensDetails.audioTokens`, etc.) — those can balloon the attribute
 * set and have no agreed convention yet.
 */
export function usageAttributes(
  usage: TokenUsage,
): Record<string, AttributeValue> {
  const attrs: Record<string, AttributeValue> = {
    'gen_ai.usage.input_tokens': usage.promptTokens,
    'gen_ai.usage.output_tokens': usage.completionTokens,
  }
  const optional: Array<[key: string, value: unknown]> = [
    ['gen_ai.usage.total_tokens', usage.totalTokens],
    ['gen_ai.usage.cost', usage.cost],
    [
      'gen_ai.usage.cache_read.input_tokens',
      usage.promptTokensDetails?.cachedTokens,
    ],
    [
      'gen_ai.usage.cache_creation.input_tokens',
      usage.promptTokensDetails?.cacheWriteTokens,
    ],
    [
      'gen_ai.usage.reasoning.output_tokens',
      usage.completionTokensDetails?.reasoningTokens,
    ],
    ['tanstack.ai.usage.duration_seconds', usage.durationSeconds],
    ['tanstack.ai.usage.units_billed', usage.unitsBilled],
    ['tanstack.ai.usage.upstream_cost', usage.costDetails?.upstreamCost],
    [
      'tanstack.ai.usage.upstream_input_cost',
      usage.costDetails?.upstreamInputCost,
    ],
    [
      'tanstack.ai.usage.upstream_output_cost',
      usage.costDetails?.upstreamOutputCost,
    ],
  ]
  for (const [key, value] of optional) {
    const num = firstNumber(value)
    if (num !== undefined) attrs[key] = num
  }
  return attrs
}
