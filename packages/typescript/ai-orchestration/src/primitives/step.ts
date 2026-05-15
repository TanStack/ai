import type {
  StepContext,
  StepDescriptor,
  StepGenerator,
  StepRetryOptions,
} from '../types'

export interface StepOptions {
  /** Retry policy for this step. Overrides the workflow-level
   *  `defaultStepRetry` if both are set. */
  retry?: StepRetryOptions
}

/**
 * Yieldable durable side-effect.
 *
 *     const data = yield* step('fetch-something', async (ctx) => {
 *       const res = await fetch('/api/thing', {
 *         headers: { 'Idempotency-Key': ctx.id },
 *       })
 *       return res.json()
 *     })
 *
 * Semantics:
 *
 *  - On first execution, the engine runs `fn`, persists the resulting
 *    value to the run's step log, and resumes the generator with the
 *    return value.
 *  - On replay (process restart, multi-instance routing), the engine
 *    short-circuits this yield with the recorded result and `fn` is NOT
 *    invoked again.
 *  - The `ctx.id` argument is a deterministic per-step ID — use it as
 *    an idempotency token with external systems so a retried step
 *    (engine crash between execute and persist) doesn't double-trigger
 *    the side effect.
 *
 * If `fn` throws, the rejection propagates back into the workflow
 * generator as a normal `throw` — user code may catch it. The failure
 * is persisted as a log entry with an `error` field; on replay the
 * recorded error is rethrown so the user-side catch logic replays
 * identically.
 *
 * Determinism contract: `fn` may do anything (I/O, randomness, time),
 * but its return value should be stable enough that subsequent
 * generator logic depending on it stays deterministic across replays.
 * The engine doesn't enforce this — replay sees only the recorded
 * return value.
 */
export function* step<T>(
  name: string,
  fn: (ctx: StepContext) => T | Promise<T>,
  options?: StepOptions,
): StepGenerator<T> {
  const descriptor: StepDescriptor = {
    kind: 'step',
    name,
    fn: fn as (ctx: StepContext) => unknown | Promise<unknown>,
    retry: options?.retry,
  }
  return (yield descriptor) as unknown as T
}
