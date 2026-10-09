import { resolveReasoning } from '@tanstack/ai/adapter-internals'
import type { ThinkingConfig, ThinkingLevel } from '@google/genai'
import type { ModelReasoning, ReasoningRequest } from '@tanstack/ai'

/**
 * pi's thinking budgets for the Gemini 2.5 models. `-1` asks Gemini for a
 * dynamic budget.
 */
function budgetFor(model: string, level: string): number {
  const high = model.includes('2.5-pro')
    ? 32768
    : model.includes('2.5-flash')
      ? 24576
      : undefined
  if (high === undefined) return -1
  const minimal = model.includes('2.5-flash-lite') ? 512 : 128
  const budgets: Record<string, number> = {
    minimal,
    low: 2048,
    medium: 8192,
    high,
  }
  return budgets[level] ?? high
}

/**
 * The `thinkingConfig` for `chat({ reasoning })`:
 * - `off`: a zero thinking budget. A model that cannot stop thinking never
 *   gets here, because the clamp moves `off` to its lowest level.
 * - a model with effort levels (Gemini 3): `thinkingLevel`.
 * - a budget model (Gemini 2.5): `thinkingBudget`, from `budgetTokens` or
 *   pi's table.
 * `summary` turns `includeThoughts` on.
 */
export function geminiThinkingConfig(
  model: string,
  request: ReasoningRequest | undefined,
  reasoning: ModelReasoning | undefined,
): ThinkingConfig | undefined {
  const resolved = resolveReasoning(request, reasoning)
  if (!resolved || !reasoning) return undefined
  if (resolved.level === 'off') return { thinkingBudget: 0 }
  const includeThoughts = resolved.summary
  if (!reasoning.budget && resolved.value !== null) {
    return {
      includeThoughts,
      // The map values are the lowercase names of the SDK enum values.
      thinkingLevel: resolved.value.toUpperCase() as ThinkingLevel,
    }
  }
  return {
    includeThoughts,
    thinkingBudget: resolved.budgetTokens ?? budgetFor(model, resolved.level),
  }
}

/** The Interactions API thinking fields for `chat({ reasoning })`. */
export function interactionsThinking(
  request: ReasoningRequest | undefined,
  reasoning: ModelReasoning | undefined,
): { thinking_level?: string; thinking_summaries?: 'auto' | 'none' } {
  const resolved = resolveReasoning(request, reasoning)
  if (!resolved || resolved.level === 'off') return {}
  return {
    thinking_level: resolved.value ?? resolved.level,
    thinking_summaries: resolved.summary ? 'auto' : 'none',
  }
}
