import type { TokenUsage } from '../types'

/**
 * Input parameters for building base TokenUsage.
 * Provider functions should extract these from their SDK's response.
 */
export interface BaseUsageInput {
  /** Total input/prompt tokens */
  promptTokens: number
  /** Total output/completion tokens */
  completionTokens: number
  /** Total tokens (prompt + completion) */
  totalTokens: number
}

/**
 * Builds the base TokenUsage object with core fields.
 * Provider-specific functions should use this and then add their own details.
 *
 * @param input - The base token counts
 * @returns A TokenUsage object with promptTokens, completionTokens, totalTokens
 *
 * @example
 * ```typescript
 * const base = buildBaseUsage({
 *   promptTokens: 100,
 *   completionTokens: 50,
 *   totalTokens: 150
 * });
 * // Returns: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
 * ```
 */
export function buildBaseUsage(input: BaseUsageInput): TokenUsage {
  return {
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens: input.totalTokens,
  }
}
