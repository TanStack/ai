import { firstNumber } from '../utilities/numbers'
import type { AttributeValue } from '@opentelemetry/api'
import type { TokenUsage } from '../types'

export function usageAttributes(
  usage: TokenUsage,
): Record<string, AttributeValue> {
  const attrs: Record<string, AttributeValue> = {
    'gen_ai.usage.input_tokens': usage.promptTokens,
    'gen_ai.usage.output_tokens': usage.completionTokens,
  }
  if (usage.billed !== undefined) {
    const quantity = firstNumber(usage.billed.quantity)
    if (quantity !== undefined) {
      attrs['tanstack.ai.usage.billed_quantity'] = quantity
      attrs['tanstack.ai.usage.billed_unit'] = usage.billed.unit
    }
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
