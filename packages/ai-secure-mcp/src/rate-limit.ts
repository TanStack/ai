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
