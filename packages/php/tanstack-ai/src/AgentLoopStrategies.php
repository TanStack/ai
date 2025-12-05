<?php

namespace TanStack\AI;

/**
 * Agent loop strategies for controlling tool execution loops.
 * 
 * Strategies determine when the agent should continue or stop its agentic loop
 * based on iteration count, finish reason, or other state information.
 */
class AgentLoopStrategies
{
    /**
     * Creates a strategy that continues for a maximum number of iterations.
     * 
     * @param int $max Maximum number of iterations to allow
     * @return callable AgentLoopStrategy that stops after max iterations
     */
    public static function maxIterations(int $max): callable
    {
        return function (array $state) use ($max): bool {
            $iterationCount = $state['iterationCount'] ?? 0;
            return $iterationCount < $max;
        };
    }

    /**
     * Creates a strategy that continues until a specific finish reason is encountered.
     * 
     * @param array<string> $stopReasons Finish reasons that should stop the loop
     * @return callable AgentLoopStrategy that stops on specific finish reasons
     */
    public static function untilFinishReason(array $stopReasons): callable
    {
        return function (array $state): bool {
            $iterationCount = $state['iterationCount'] ?? 0;
            
            // Always allow at least one iteration
            if ($iterationCount === 0) {
                return true;
            }

            // Stop if we hit a stop reason
            $finishReason = $state['finishReason'] ?? null;
            if ($finishReason && in_array($finishReason, $stopReasons, true)) {
                return false;
            }

            // Otherwise continue
            return true;
        };
    }

    /**
     * Creates a strategy that combines multiple strategies with AND logic.
     * All strategies must return true to continue.
     * 
     * @param array<callable> $strategies Array of strategies to combine
     * @return callable AgentLoopStrategy that continues only if all strategies return true
     */
    public static function combineStrategies(array $strategies): callable
    {
        return function (array $state) use ($strategies): bool {
            foreach ($strategies as $strategy) {
                if (!call_user_func($strategy, $state)) {
                    return false;
                }
            }
            return true;
        };
    }
}
