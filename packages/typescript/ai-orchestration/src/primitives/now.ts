import type { StepDescriptor, StepGenerator } from '../types'

/**
 * Durable timestamp. Returns `Date.now()` on first execution and the
 * recorded value on every replay thereafter.
 *
 *     const startedAt = yield* now()
 *
 * Use this instead of `Date.now()` directly inside workflow code: a
 * bare `Date.now()` would produce a different value on replay,
 * silently corrupting state-derived UI, retry intervals, or any other
 * computation that flows from "when did this happen."
 */
export function* now(): StepGenerator<number> {
  const descriptor: StepDescriptor = { kind: 'now' }
  // eslint-disable-next-line no-restricted-syntax -- yield expression has unknown type; engine guarantees a number resume value (recorded timestamp)
  return (yield descriptor) as unknown as number
}
