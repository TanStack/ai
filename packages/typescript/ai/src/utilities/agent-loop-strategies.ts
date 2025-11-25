import type { AgentLoopStrategy } from "../types";

/**
 * Creates a strategy that continues for a maximum number of iterations
 *
 * @param max - Maximum number of iterations to allow
 * @returns AgentLoopStrategy that stops after max iterations
 *
 * @example
 * ```typescript
 * const stream = chat({
 *   adapter: openai(),
 *   model: "gpt-4o",
 *   messages: [...],
 *   tools: [weatherTool],
 *   agentLoopStrategy: maxIterations(3), // Max 3 iterations
 * });
 * ```
 */
export function maxIterations(max: number): AgentLoopStrategy {
  return ({ iterationCount }) => iterationCount < max;
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
 *   adapter: openai(),
 *   model: "gpt-4o",
 *   messages: [...],
 *   tools: [weatherTool],
 *   agentLoopStrategy: untilFinishReason(["stop", "length"]),
 * });
 * ```
 */
export function untilFinishReason(stopReasons: string[]): AgentLoopStrategy {
  return ({ finishReason, iterationCount }) => {
    // Always allow at least one iteration
    if (iterationCount === 0) return true;

    // Stop if we hit a stop reason
    if (finishReason && stopReasons.includes(finishReason)) {
      return false;
    }

    // Otherwise continue
    return true;
  };
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
 *   adapter: openai(),
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
  strategies: AgentLoopStrategy[]
): AgentLoopStrategy {
  return (state) => {
    return strategies.every((strategy) => strategy(state));
  };
}
