import type { StepDescriptor } from '../types'

export interface RetryOptions {
  attempts: number
  backoff?: 'none' | 'linear' | 'exponential'
  /** Base delay in ms. Default 100. */
  baseDelayMs?: number
  /** Max delay in ms. Default 5000. */
  maxDelayMs?: number
  /** Predicate — return true to retry on this error. Default: retry any. */
  retryOn?: (err: unknown, attempt: number) => boolean
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function computeDelay(opts: RetryOptions, attempt: number): number {
  const base = opts.baseDelayMs ?? 100
  const max = opts.maxDelayMs ?? 5000
  switch (opts.backoff ?? 'none') {
    case 'none':
      return 0
    case 'linear':
      return Math.min(base * attempt, max)
    case 'exponential':
      return Math.min(base * 2 ** (attempt - 1), max)
  }
}

/**
 * Retry a yield-producing step on failure.
 *
 *     const draft = yield* retry(
 *       () => agents.writer({ topic }),
 *       { attempts: 3, backoff: 'exponential' },
 *     )
 *
 * Each attempt invokes `fn()` fresh, so the underlying generator restarts.
 * Returns an async generator to support delay between retries.
 */
export async function* retry<T>(
  fn: () => Generator<StepDescriptor, T, T>,
  options: RetryOptions,
): AsyncGenerator<StepDescriptor, T, T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      return yield* fn()
    } catch (err) {
      lastErr = err
      if (options.retryOn && !options.retryOn(err, attempt)) {
        throw err
      }
      if (attempt === options.attempts) break
      const ms = computeDelay(options, attempt)
      if (ms > 0) await delay(ms)
    }
  }
  throw lastErr
}
