import {
  reasoningBudget,
  resolveReasoning,
} from '@tanstack/ai/adapter-internals'
import type { ModelReasoning, ReasoningRequest } from '@tanstack/ai'

/** The answer room pi keeps next to a thinking budget. */
const MIN_ANSWER_TOKENS = 1024

export interface ConverseThinking {
  additionalModelRequestFields?:
    | {
        thinking: { type: 'enabled'; budget_tokens: number }
        anthropic_beta: Array<string>
      }
    | {
        thinking: { type: 'adaptive' }
        output_config: { effort: string }
      }
  /** The smallest `maxTokens` that leaves room for the thinking budget. */
  minMaxTokens?: number
}

/**
 * The Converse thinking fields for `chat({ reasoning })`. Only Claude takes
 * them on Converse (pi's rule):
 * - a budget model: enabled thinking with the budget (pi's table when the
 *   request sets none), and the interleaved-thinking beta.
 * - a model with effort levels: adaptive thinking with the effort.
 * `off` sends nothing, because Claude does not think unless asked.
 */
export function converseThinking(
  model: string,
  request: ReasoningRequest | undefined,
  reasoning: ModelReasoning | undefined,
): ConverseThinking {
  if (!model.includes('anthropic.claude')) return {}
  const resolved = resolveReasoning(request, reasoning)
  if (!resolved || !reasoning || resolved.level === 'off') return {}
  if (reasoning.budget) {
    const budget = reasoningBudget({
      level: resolved.level,
      summary: resolved.summary,
      ...(resolved.budgetTokens !== undefined
        ? { budgetTokens: resolved.budgetTokens }
        : {}),
    })
    return {
      additionalModelRequestFields: {
        thinking: { type: 'enabled', budget_tokens: budget },
        anthropic_beta: ['interleaved-thinking-2025-05-14'],
      },
      minMaxTokens: budget + MIN_ANSWER_TOKENS,
    }
  }
  if (resolved.value === null) return {}
  return {
    additionalModelRequestFields: {
      thinking: { type: 'adaptive' },
      output_config: { effort: resolved.value },
    },
  }
}
