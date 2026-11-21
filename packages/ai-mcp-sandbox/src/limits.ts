import type { Limits } from './types'

/** Intersect a manifest's limits with server caps: the tighter of each. */
export function intersectLimits(
  limits: Limits,
  caps: Partial<Limits> | undefined,
): Limits {
  if (!caps) return limits
  const tighter = (a: number, b: number | undefined) =>
    b === undefined ? a : Math.min(a, b)
  return {
    wallClockMs: tighter(limits.wallClockMs, caps.wallClockMs),
    memoryMb: tighter(limits.memoryMb, caps.memoryMb),
    maxInjectedCalls: tighter(limits.maxInjectedCalls, caps.maxInjectedCalls),
    resultBytes: tighter(limits.resultBytes, caps.resultBytes),
  }
}

/** Thrown by a facade when the run exceeds its injected-call budget. */
export class InjectedCallLimitError extends Error {
  constructor(max: number) {
    super(`Injected-call limit reached (${max})`)
    this.name = 'InjectedCallLimitError'
  }
}

/** A shared counter: `tick()` before each facade call, throws past `max`. */
export function makeCallCounter(max: number) {
  let count = 0
  return {
    tick() {
      count += 1
      if (count > max) throw new InjectedCallLimitError(max)
    },
    get count() {
      return count
    },
  }
}
