/**
 * Distributed-mutex primitive for the persistence layer.
 *
 * ponytail: the `'locks'` capability token is defined LOCALLY here. Capability
 * identity is by object reference (see `createCapability`), not by name, so this
 * token does NOT interoperate with the identically-named `LocksCapability` that
 * `@tanstack/ai-sandbox` owns. That is fine for this batch: the only consumer of
 * a persistence-provided lock store is `withSandbox`, and sandbox persistence is
 * deferred. When it lands, share ONE handle between provider and consumer (the
 * neutral home is core `@tanstack/ai`); until then this token has no cross-package
 * consumer and just keeps the persistence API self-contained.
 */
import { createCapability } from '@tanstack/ai'

/**
 * Mutual exclusion around a critical section keyed by `key`. A cloudflare
 * Durable Object store is the only backend here that is safe across instances;
 * the in-memory default is correct within a single process only. Lease-backed
 * implementations abort `signal` as soon as ownership can no longer be
 * guaranteed; the callback must stop externally visible mutations when it aborts.
 */
export interface LockStore {
  withLock: <T>(
    key: string,
    fn: (signal: AbortSignal) => Promise<T>,
  ) => Promise<T>
}

/** The lock capability. Provided by `withPersistence` when a `locks` store is present. */
export const LocksCapability = createCapability<LockStore>()('locks')

/** Destructured accessors: `getLocks(ctx)` / `provideLocks(ctx, store)`. */
export const [getLocks, provideLocks] = LocksCapability

/**
 * In-memory {@link LockStore} — a per-key promise chain. Correct within a single
 * process; multi-instance correctness needs a distributed lock from the backend.
 */
export class InMemoryLockStore implements LockStore {
  private readonly chains = new Map<string, Promise<unknown>>()

  withLock<T>(
    key: string,
    fn: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const prior = this.chains.get(key) ?? Promise.resolve()
    const runCriticalSection = () => fn(new AbortController().signal)
    // Chain after the prior holder regardless of how it settled.
    const run = prior.then(runCriticalSection, runCriticalSection)
    // Swallow rejections so one failure doesn't poison the lock, then drop the
    // chain entry once this tail is still the latest — otherwise long-lived
    // processes accumulate settled promises for every distinct key forever.
    const settled = run.then(
      () => undefined,
      () => undefined,
    )
    this.chains.set(key, settled)
    void settled.then(() => {
      if (this.chains.get(key) === settled) {
        this.chains.delete(key)
      }
    })
    return run
  }
}
