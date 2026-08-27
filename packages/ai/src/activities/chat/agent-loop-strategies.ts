import type { AgentLoopStrategy } from '../../types'

export function maxIterations(max: number): AgentLoopStrategy {
  return ({ iterationCount }) => iterationCount < max
}

export function untilFinishReason(
  stopReasons: Array<string>,
): AgentLoopStrategy {
  return ({ finishReason, iterationCount }) => {
    // Always allow at least one iteration
    if (iterationCount === 0) return true

    // Stop if we hit a stop reason
    const hasFinishReason = finishReason && stopReasons.includes(finishReason)
    if (hasFinishReason) {
      return false
    }

    // Otherwise continue
    return true
  }
}

export function combineStrategies(
  strategies: Array<AgentLoopStrategy>,
): AgentLoopStrategy {
  return (state) => {
    return strategies.every((strategy) => strategy(state))
  }
}
