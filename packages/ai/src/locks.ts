/**
 * Distributed-mutex primitive, shared across the sandbox and persistence
 * layers via the middleware capability system.
 *
 * `LocksCapability` lives in core (rather than in `@tanstack/ai-sandbox` or
 * `@tanstack/ai-persistence`) so there is exactly ONE `'locks'` token: capability
 * names must be globally unique, and both `withSandbox` (which optionally
 * requires it) and `withPersistence` (which provides a durable implementation)
 * must reference the same handle. The in-memory default here is correct within a
 * single process; the persistence layer provides a distributed lock (e.g. a
 * Durable Object) for multi-instance deployments.
 */
import { createCapability } from './activities/chat/middleware/capabilities'

/**
 * Mutual exclusion around a critical section keyed by `key`. Used by the
 * sandbox `ensure` algorithm so two concurrent runs for the same thread don't
 * both create a sandbox, and available to any middleware that needs a named lock.
 */
export interface LockStore {
  withLock: <T>(key: string, fn: () => Promise<T>) => Promise<T>
}

/**
 * The lock capability. PROVIDED by `withPersistence` (durable) and OPTIONALLY
 * required by `withSandbox`. Falls back to {@link InMemoryLockStore} when no
 * middleware provides it.
 */
export const LocksCapability = createCapability<LockStore>()('locks')

/** Destructured accessors: `getLocks(ctx)` / `provideLocks(ctx, store)`. */
export const [getLocks, provideLocks] = LocksCapability

/**
 * In-memory {@link LockStore} — a per-key promise chain. Correct within a
 * single process; multi-instance correctness needs a distributed lock from the
 * persistence layer.
 */
export class InMemoryLockStore implements LockStore {
  private readonly chains = new Map<string, Promise<unknown>>()

  withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prior = this.chains.get(key) ?? Promise.resolve()
    // Chain after the prior holder regardless of how it settled.
    const run = prior.then(fn, fn)
    // Keep the chain alive but swallow rejections so one failure doesn't poison the lock.
    this.chains.set(
      key,
      run.then(
        () => undefined,
        () => undefined,
      ),
    )
    return run
  }
}
