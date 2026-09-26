/**
 * Limits for a whole subagent tree. The root run makes one budget, and every
 * child shares it, so a child cannot reset it.
 */
export interface SubagentLimits {
  /** How deep the tree may grow. The root run is depth 0. */
  maxDepth?: number
  /** How many children one run may have running at once. */
  maxConcurrent?: number
  /** How many children the whole tree may start. */
  maxCalls?: number
  /** How long one child may run. Never later than its parent's own deadline. */
  timeoutMs?: number
}

/** The shared budget of one subagent tree. */
export class SubagentBudget {
  private constructor(
    readonly limits: SubagentLimits,
    /** The depth of the run that owns this budget view. */
    readonly depth: number,
    private readonly shared: { calls: number },
    /** Epoch ms after which this run's children must stop, if any. */
    readonly deadline: number | undefined,
  ) {}

  /** A budget for a root run. */
  static root(limits: SubagentLimits = {}): SubagentBudget {
    return new SubagentBudget(limits, 0, { calls: 0 }, undefined)
  }

  /** How many children the tree started so far. */
  get calls(): number {
    return this.shared.calls
  }

  /**
   * Reserve one child spawn. Returns the refusal message the model sees, or
   * `undefined` when the child may start. `active` is how many children this
   * run has running now.
   */
  reserve(active: number): string | undefined {
    const { maxDepth, maxCalls, maxConcurrent } = this.limits
    if (maxDepth !== undefined && this.depth + 1 > maxDepth) {
      return `subagent limit reached (maxDepth ${maxDepth})`
    }
    if (maxCalls !== undefined && this.shared.calls >= maxCalls) {
      return `subagent limit reached (maxCalls ${maxCalls})`
    }
    if (maxConcurrent !== undefined && active >= maxConcurrent) {
      return `subagent limit reached (maxConcurrent ${maxConcurrent})`
    }
    this.shared.calls += 1
    return undefined
  }

  /** Milliseconds a child started now may run, or `undefined` for no limit. */
  childTimeout(now = Date.now()): number | undefined {
    const own = this.limits.timeoutMs
    const remaining =
      this.deadline === undefined ? undefined : Math.max(0, this.deadline - now)
    if (own === undefined) return remaining
    return remaining === undefined ? own : Math.min(own, remaining)
  }

  /** The budget a child's own subagents use: one level deeper, same counters. */
  child(deadline?: number): SubagentBudget {
    return new SubagentBudget(
      this.limits,
      this.depth + 1,
      this.shared,
      deadline ?? this.deadline,
    )
  }
}
