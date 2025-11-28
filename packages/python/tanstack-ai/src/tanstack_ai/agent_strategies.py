"""
Agent loop strategies for controlling tool execution loops.

Strategies determine when the agent should continue or stop its agentic loop
based on iteration count, finish reason, or other state information.
"""

from typing import List

from .types import AgentLoopState, AgentLoopStrategy


def max_iterations(max_count: int) -> AgentLoopStrategy:
    """
    Creates a strategy that continues for a maximum number of iterations.

    Args:
        max_count: Maximum number of iterations to allow

    Returns:
        AgentLoopStrategy that stops after max iterations

    Example:
        >>> strategy = max_iterations(3)
        >>> # Max 3 iterations
    """

    def strategy(state: AgentLoopState) -> bool:
        return state["iterationCount"] < max_count

    return strategy


def until_finish_reason(stop_reasons: List[str]) -> AgentLoopStrategy:
    """
    Creates a strategy that continues until a specific finish reason is encountered.

    Args:
        stop_reasons: Finish reasons that should stop the loop

    Returns:
        AgentLoopStrategy that stops on specific finish reasons

    Example:
        >>> strategy = until_finish_reason(["stop", "length"])
        >>> # Stops when finish_reason is "stop" or "length"
    """

    def strategy(state: AgentLoopState) -> bool:
        # Always allow at least one iteration
        if state["iterationCount"] == 0:
            return True

        # Stop if we hit a stop reason
        if state["finishReason"] and state["finishReason"] in stop_reasons:
            return False

        # Otherwise continue
        return True

    return strategy


def combine_strategies(strategies: List[AgentLoopStrategy]) -> AgentLoopStrategy:
    """
    Creates a strategy that combines multiple strategies with AND logic.
    All strategies must return True to continue.

    Args:
        strategies: List of strategies to combine

    Returns:
        AgentLoopStrategy that continues only if all strategies return True

    Example:
        >>> strategy = combine_strategies([
        ...     max_iterations(10),
        ...     lambda state: len(state["messages"]) < 100,
        ... ])
    """

    def strategy(state: AgentLoopState) -> bool:
        return all(s(state) for s in strategies)

    return strategy
