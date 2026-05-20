import type { StepDescriptor, StepGenerator } from '../types'

/**
 * Durable UUID. Generates a fresh v4 UUID on first execution and
 * returns the recorded value on every replay thereafter.
 *
 *     const correlationId = yield* uuid()
 *
 * Use this instead of `crypto.randomUUID()` directly inside workflow
 * code: a bare call would produce a different value on replay,
 * defeating any cross-system correlation the ID is supposed to give.
 */
export function* uuid(): StepGenerator<string> {
  const descriptor: StepDescriptor = { kind: 'uuid' }
  return (yield descriptor) as unknown as string
}
