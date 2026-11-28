/**
 * A per-client sliding-window rate limiter. It keeps the recent call times for
 * each client and refuses a call that would pass the limit in the window.
 *
 * ponytail: in-memory per process. For many server instances, swap in a shared
 * store behind the same `allow` method.
 */
export interface RateLimiter {
  /** Returns true when the call is within the limit, and records it. */
  allow: (clientId: string) => boolean
}

export function createRateLimiter(options: {
  /** The most calls allowed in one window. */
  limit: number
  /** The window length in ms. */
  windowMs: number
  /** A clock in ms, for tests. */
  now?: () => number
}): RateLimiter {
  // A NaN limit or window makes every comparison false, so nothing is ever
  // limited. Refuse it at construction; use `rateLimit: false` to turn it off.
  if (
    !(options.limit > 0) ||
    !Number.isFinite(options.windowMs) ||
    options.windowMs <= 0
  ) {
    throw new RangeError(
      `limit must be positive and windowMs finite and positive, got ${options.limit} and ${options.windowMs}`,
    )
  }
  const hits = new Map<string, Array<number>>()
  const now = options.now ?? (() => Date.now())
  return {
    allow: (clientId) => {
      const at = now()
      const cutoff = at - options.windowMs
      const recent = (hits.get(clientId) ?? []).filter((t) => t > cutoff)
      if (recent.length >= options.limit) {
        hits.set(clientId, recent)
        return false
      }
      recent.push(at)
      hits.set(clientId, recent)
      return true
    },
  }
}
