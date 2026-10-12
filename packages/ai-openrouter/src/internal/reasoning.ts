import type { ResolvedReasoning } from '@tanstack/ai/adapter-internals'

/**
 * The OpenRouter `reasoning.effort` for a resolved `chat({ reasoning })`.
 * `off` is always `none` on OpenRouter, whatever the model's own off value
 * is (pi's rule).
 */
export function openRouterEffort(
  resolved: ResolvedReasoning | undefined,
): string | undefined {
  if (!resolved) return undefined
  if (resolved.level === 'off') return 'none'
  return resolved.value
}
