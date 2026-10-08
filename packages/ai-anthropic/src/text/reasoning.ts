import {
  reasoningBudget,
  resolveReasoning,
} from '@tanstack/ai/adapter-internals'
import type { ModelReasoning, ReasoningRequest } from '@tanstack/ai'

export type AnthropicEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

const EFFORTS: ReadonlyArray<string> = ['low', 'medium', 'high', 'xhigh', 'max']
export const isAnthropicEffort = (value: unknown): value is AnthropicEffort =>
  typeof value === 'string' && EFFORTS.includes(value)

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

/** pi's `mapThinkingLevelToEffort` for a level the map does not name. */
const defaultEffort = (level: string): AnthropicEffort =>
  level === 'minimal' || level === 'low'
    ? 'low'
    : level === 'medium'
      ? 'medium'
      : 'high'

/** The Messages API thinking fields for one request. */
export interface AnthropicThinkingFields {
  thinking?:
    | {
        type: 'adaptive'
        display: 'summarized' | 'omitted'
        block_binding?: { prefix_mismatch_behavior: 'drop_block' }
      }
    | { type: 'enabled'; budget_tokens: number }
    | { type: 'disabled' }
  effort?: AnthropicEffort
  output_config?: { effort: AnthropicEffort }
  /**
   * Mid-conversation effort: the effort of this turn. It goes into the
   * messages, not into the request fields.
   */
  messageEffort?: AnthropicEffort
}

/**
 * The thinking fields for `chat({ reasoning })`:
 * - mid-conversation effort (`reasoning.midConversationEffort`, pi's
 *   managed effort): always adaptive thinking with `block_binding` and a
 *   fixed `output_config.effort: 'high'`. The level's effort is
 *   `messageEffort` (`high` without a level).
 * - `off`: thinking disabled. A model that cannot stop thinking never gets
 *   here, because the clamp moves `off` to its lowest level.
 * - budget thinking (`thinking.type: 'enabled'`, pi's table when the
 *   request sets no `budgetTokens`) when `reasoning.adaptive` is `false`, or
 *   for a budget model that sets `budgetTokens`. Without `adaptive`, also
 *   for a budget model without a map or outside `ADAPTIVE_THINKING`.
 * - otherwise adaptive thinking with the model's effort for the level, or
 *   pi's default effort when the map has none. `summary` picks whether the
 *   thinking text streams back.
 */
export function anthropicThinking(
  model: string,
  request: ReasoningRequest | undefined,
  reasoning: ModelReasoning | undefined,
): AnthropicThinkingFields {
  const resolved = resolveReasoning(request, reasoning)
  if (reasoning && reasoning.midConversationEffort)
    return {
      thinking: {
        type: 'adaptive',
        display: resolved?.summary === false ? 'omitted' : 'summarized',
        block_binding: { prefix_mismatch_behavior: 'drop_block' },
      },
      output_config: { effort: 'high' },
      messageEffort: resolved ? effortOf(resolved) : 'high',
    }
  if (!resolved || !reasoning) return {}
  if (resolved.level === 'off') return { thinking: { type: 'disabled' } }
  const adaptive =
    reasoning.adaptive ??
    (!reasoning.budget ||
      (reasoning.map !== undefined && ADAPTIVE_THINKING.test(model)))
  const budgetOnly =
    !adaptive || (reasoning.budget && resolved.budgetTokens !== undefined)
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
  const effort = effortOf(resolved)
  return TOP_LEVEL_EFFORT.has(model)
    ? { thinking, effort }
    : { thinking, output_config: { effort } }
}

/** The map's effort for the level, else pi's default effort. */
function effortOf(resolved: {
  level: string
  value: string | null
}): AnthropicEffort {
  return isAnthropicEffort(resolved.value)
    ? resolved.value
    : defaultEffort(resolved.level)
}
