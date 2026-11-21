import { describe, expect, it } from 'vitest'
import { createRateLimiter } from '../src/rate-limit'

describe('createRateLimiter', () => {
  it('allows up to the limit, then refuses, then recovers', () => {
    let t = 0
    const rl = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t })
    expect(rl.allow('a')).toBe(true)
    expect(rl.allow('a')).toBe(true)
    expect(rl.allow('a')).toBe(false)
    // Window slides: the first two calls age out.
    t = 1001
    expect(rl.allow('a')).toBe(true)
  })

  it('tracks clients independently', () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 })
    expect(rl.allow('a')).toBe(true)
    expect(rl.allow('b')).toBe(true)
    expect(rl.allow('a')).toBe(false)
  })
})

describe('createRateLimiter — bad numbers', () => {
  it('refuses a limit or window that would turn the limiter off', () => {
    // `Number(process.env.RATE_LIMIT)` with the variable unset is NaN.
    expect(() => createRateLimiter({ limit: NaN, windowMs: 1000 })).toThrow(
      RangeError,
    )
    expect(() => createRateLimiter({ limit: 1, windowMs: NaN })).toThrow(
      RangeError,
    )
    expect(() => createRateLimiter({ limit: 1, windowMs: -1 })).toThrow(
      RangeError,
    )
  })
})
