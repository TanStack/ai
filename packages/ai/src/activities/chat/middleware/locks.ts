/**
 * Distributed-mutex primitive — the neutral, shared home for the `'locks'`
 * capability.
 *
 * Capability identity is by object reference (see `createCapability`), so this
 * ONE `LocksCapability` is the single token both `@tanstack/ai-persistence`
 * (which PROVIDES a durable lock) and `@tanstack/ai-sandbox` (whose `ensure`
 * CONSUMES it to serialize resume-or-create) import and re-export. Defining it
 * here — core, depended on by both and depending on neither — is what lets a
 * persistence-provided distributed lock reach `withSandbox` without either
 * package depending on the other.
 */
import { createCapability } from './capabilities'

/**
 * Mutual exclusion around a critical section keyed by `key`. A distributed
 * backend (e.g. a Cloudflare Durable Object) is the only kind safe across
 * instances; the in-memory default is correct within a single process only.
 * Lease-backed implementations abort `signal` as soon as ownership can no longer
 * be guaranteed; the callback must stop externally visible mutations when it
 * aborts. Callbacks that ignore `signal` (e.g. the sandbox `ensure` critical
 * section) remain valid — a `() => Promise<T>` is assignable to the
 * signal-taking parameter.
 */
export interface LockStore {
  withLock: <T>(
    key: string,
    fn: (signal: AbortSignal) => Promise<T>,
  ) => Promise<T>
}

/**
 * The lock capability. Provided by `withPersistence` when a `locks` store is
 * present, or by `withSandboxPersistence` when given one.
 */
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
