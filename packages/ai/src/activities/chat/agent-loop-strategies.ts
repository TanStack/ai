import type { AgentLoopStrategy } from '../../types'

/**
 * Creates a strategy that continues for a maximum number of **model turns**
 * (iterations), not tool calls.
 *
 * One iteration can still emit many parallel tool calls. For a tool-call
 * budget, use middleware with `onBeforeToolCall` (per-turn cap) and
 * `onShouldContinue` (cumulative run budget) — see the docs recipe under
 * Agentic Cycle.
 *
 * @param max - Maximum number of model turns to allow
 * @returns AgentLoopStrategy that stops after max iterations
 *
 * @example
 * ```typescript
 * const stream = chat({
 *   adapter: openaiText(),
 *   model: "gpt-4o",
 *   messages: [...],
 *   tools: [weatherTool],
 *   agentLoopStrategy: maxIterations(3), // Max 3 model turns
 * });
 * ```
 */
export function maxIterations(max: number): AgentLoopStrategy {
  return ({ iterationCount }) => iterationCount < max
}

/**
 * Creates a strategy that continues until a specific finish reason is encountered
 *
 * @param stopReasons - Finish reasons that should stop the loop
 * @returns AgentLoopStrategy that stops on specific finish reasons
 *
 * @example
 * ```typescript
 * const stream = chat({
 *   adapter: openaiText(),
 *   model: "gpt-4o",
 *   messages: [...],
 *   tools: [weatherTool],
 *   agentLoopStrategy: untilFinishReason(["stop", "length"]),
 * });
 * ```
 */
export function untilFinishReason(
  stopReasons: Array<string>,
): AgentLoopStrategy {
  return ({ finishReason, iterationCount }) => {
    // Always allow at least one iteration
    if (iterationCount === 0) return true

    // Stop if we hit a stop reason
    if (finishReason && stopReasons.includes(finishReason)) {
      return false
    }

    // Otherwise continue
    return true
  }
}

/**
 * Creates a strategy that combines multiple strategies with AND logic
 * All strategies must return true to continue
 *
 * @param strategies - Array of strategies to combine
 * @returns AgentLoopStrategy that continues only if all strategies agree
 *
 * @example
 * ```typescript
 * const stream = chat({
 *   adapter: openaiText(),
 *   model: "gpt-4o",
 *   messages: [...],
 *   tools: [weatherTool],
 *   agentLoopStrategy: combineStrategies([
 *     maxIterations(10),
 *     ({ messages }) => messages.length < 100,
 *   ]),
 * });
 * ```
 */
export function combineStrategies(
  strategies: Array<AgentLoopStrategy>,
): AgentLoopStrategy {
  return (state) => {
    return strategies.every((strategy) => strategy(state))
  }
}
