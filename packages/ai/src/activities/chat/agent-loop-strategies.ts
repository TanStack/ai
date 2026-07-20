import type { AgentLoopStrategy } from '../../types'

/**
 * Creates a strategy that continues for a maximum number of **model turns**
 * (iterations), not tool calls.
 *
 * One iteration can still emit many parallel tool calls. Prefer
 * {@link maxToolCalls} (and optionally `maxToolCallsPerTurn` on `chat()`)
 * when you need a tool-call budget.
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
 * Creates a strategy that continues while `toolCallCount < max`.
 *
 * Unlike {@link maxIterations} (which counts model turns), this bounds
 * **emitted** tool calls counted during the run (including ones skipped by
 * `maxToolCallsPerTurn`). Strategies only run between turns, so the turn that
 * crosses `max` is not truncated — the final count (and executions, unless
 * `maxToolCallsPerTurn` is set) may exceed `max`. Pair with
 * `chat({ maxToolCallsPerTurn })` to also cap parallel fan-out inside a single
 * turn.
 *
 * @param max - Maximum cumulative emitted tool calls before stopping further turns
 * @returns AgentLoopStrategy that returns true while `toolCallCount < max`
 *
 * @example
 * ```typescript
 * import { chat, combineStrategies, maxIterations, maxToolCalls } from '@tanstack/ai'
 *
 * const stream = chat({
 *   adapter: openaiText('gpt-4o'),
 *   messages: [...],
 *   tools: [weatherTool],
 *   maxToolCallsPerTurn: 10,
 *   agentLoopStrategy: combineStrategies([
 *     maxIterations(20),
 *     maxToolCalls(20),
 *   ]),
 * })
 * ```
 */
export function maxToolCalls(max: number): AgentLoopStrategy {
  return ({ toolCallCount }) => toolCallCount < max
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
 * @returns AgentLoopStrategy that continues only if all strategies return true
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
 *     maxToolCalls(20),
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
