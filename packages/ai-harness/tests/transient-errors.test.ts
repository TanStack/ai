import { afterEach, describe, expect, it, vi } from 'vitest'
import { isTransientModelError, retryTransientErrors } from '../src'
import type { ModelErrorContext } from '../src'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const context = (message: string, retries = 0): ModelErrorContext => ({
  // The policy reads only the error, the retries, the partial flag, and the
  // signal.
  session: undefined as never,
  operationId: 'op-1',
  error: { message },
  retries,
  partial: false,
  signal: new AbortController().signal,
})

describe('isTransientModelError', () => {
  it.each([
    'Overloaded',
    'Rate limit exceeded',
    'Too Many Requests',
    '429 status code',
    '500 Internal Server Error',
    '502 Bad Gateway',
    '503 Service Unavailable',
    '504 Gateway Timeout',
    'network error',
    'connection reset by peer',
    'socket hang up',
    'fetch failed',
    'request timed out',
    'terminated',
    'Provider finish_reason: error',
  ])('treats "%s" as transient', (message) => {
    expect(isTransientModelError({ message })).toBe(true)
  })

  it.each([
    'prompt is too long: 250000 tokens > 200000 maximum',
    'Invalid API key',
    'Provider finish_reason: error_quota',
    'Provider finish_reason: content_filter',
  ])('treats "%s" as terminal', (message) => {
    expect(isTransientModelError({ message })).toBe(false)
  })

  it('reads the error code too', () => {
    expect(
      isTransientModelError({ message: 'failed', code: 'rate_limit_exceeded' }),
    ).toBe(true)
  })
})

describe('retryTransientErrors', () => {
  it('waits base * 2^retries, times the jitter, then retries', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(1)
    const policy = retryTransientErrors({ maxRetries: 3, baseDelayMs: 1_000 })

    let answer: string | undefined = 'pending'
    void policy(context('503 Service Unavailable', 1)).then((value) => {
      answer = value
    })
    await vi.advanceTimersByTimeAsync(1_999)
    expect(answer).toBe('pending')
    await vi.advanceTimersByTimeAsync(1)
    expect(answer).toBe('retry')
  })

  it('uses the smallest jitter of 0.75', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const policy = retryTransientErrors({ baseDelayMs: 2_000 })

    let answer: string | undefined = 'pending'
    void policy(context('overloaded')).then((value) => {
      answer = value
    })
    await vi.advanceTimersByTimeAsync(1_499)
    expect(answer).toBe('pending')
    await vi.advanceTimersByTimeAsync(1)
    expect(answer).toBe('retry')
  })

  it('gives up after maxRetries, and at once for a terminal error', async () => {
    const policy = retryTransientErrors({ maxRetries: 2, baseDelayMs: 1 })

    expect(await policy(context('overloaded', 2))).toBeUndefined()
    expect(await policy(context('Invalid API key'))).toBeUndefined()
  })

  it('stops the wait when the turn is cancelled', async () => {
    const policy = retryTransientErrors({ baseDelayMs: 60_000 })
    const controller = new AbortController()
    const answer = policy({
      ...context('overloaded'),
      signal: controller.signal,
    })

    controller.abort()

    expect(await answer).toBeUndefined()
  })

  it('takes its own transient check', async () => {
    const policy = retryTransientErrors({
      baseDelayMs: 1,
      isTransient: (error) => error.message.includes('[retry-me]'),
    })

    expect(await policy(context('boom [retry-me]'))).toBe('retry')
    expect(await policy(context('overloaded'))).toBeUndefined()
  })
})
