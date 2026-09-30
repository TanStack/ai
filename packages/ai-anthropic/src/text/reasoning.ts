import {
  reasoningBudget,
  resolveReasoning,
} from '@tanstack/ai/adapter-internals'
import type { ModelReasoning, ReasoningRequest } from '@tanstack/ai'

type AnthropicEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

const EFFORTS: ReadonlyArray<string> = ['low', 'medium', 'high', 'xhigh', 'max']
const isEffort = (value: string): value is AnthropicEffort =>
  EFFORTS.includes(value)

/**
 * Claude 4.6 takes the effort as the top-level `effort` field. Claude 4.7 and
 * later take `output_config.effort`.
 */
const TOP_LEVEL_EFFORT = new Set(['claude-opus-4-6', 'claude-sonnet-4-6'])

/**
 * The Claude models with adaptive thinking: 4.6 and later (pi's list). An
 * older model with effort levels, such as Opus 4.5, still thinks with a
 * token budget.
 */
const ADAPTIVE_THINKING = /opus-4-[6-9]|sonnet-4-[6-9]|opus-5|sonnet-5|fable-5/

/** The Messages API thinking fields for one request. */
export interface AnthropicThinkingFields {
  thinking?:
    | { type: 'adaptive'; display: 'summarized' | 'omitted' }
    | { type: 'enabled'; budget_tokens: number }
    | { type: 'disabled' }
  effort?: AnthropicEffort
  output_config?: { effort: AnthropicEffort }
}

/**
 * The thinking fields for `chat({ reasoning })`:
 * - `off`: thinking disabled. A model that cannot stop thinking never gets
 *   here, because the clamp moves `off` to its lowest level.
 * - a budget model without adaptive thinking, or a request with
 *   `budgetTokens`: `thinking.type: 'enabled'` with the budget (pi's table
 *   when the request sets none).
 * - otherwise adaptive thinking with the model's effort for the level.
 *   `summary` picks whether the thinking text streams back.
 */
export function anthropicThinking(
  model: string,
  request: ReasoningRequest | undefined,
  reasoning: ModelReasoning | undefined,
): AnthropicThinkingFields {
  const resolved = resolveReasoning(request, reasoning)
  if (!resolved || !reasoning) return {}
  if (resolved.level === 'off') return { thinking: { type: 'disabled' } }
  const budgetOnly =
    reasoning.budget &&
    (resolved.budgetTokens !== undefined ||
      !reasoning.map ||
      !ADAPTIVE_THINKING.test(model))
  if (budgetOnly)
    return {
      thinking: {
        type: 'enabled',
        budget_tokens: reasoningBudget({
          level: resolved.level,
          summary: resolved.summary,
          ...(resolved.budgetTokens !== undefined
            ? { budgetTokens: resolved.budgetTokens }
            : {}),
        }),
      },
    }
  const thinking = {
    type: 'adaptive' as const,
    display: resolved.summary ? ('summarized' as const) : ('omitted' as const),
  }
  const effort = resolved.value
  if (!reasoning.map || effort === null || !isEffort(effort))
    return { thinking }
  return TOP_LEVEL_EFFORT.has(model)
    ? { thinking, effort }
    : { thinking, output_config: { effort } }
}
