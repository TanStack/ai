import { createCapability } from './capabilities'
import { defineChatMiddleware } from './define'
import type { ChatMiddleware, ChatMiddlewareContext } from './types'

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
 * Type a {@link LockStore} implementation inline: pass the object and get
 * autocomplete + contract checking, with no separate `: LockStore` annotation.
 * Hand the result to {@link withLocks}.
 */
export function defineLock(lock: LockStore): LockStore {
  return lock
}

/**
 * The lock capability. Provided by {@link withLocks} or any middleware that
 * calls {@link provideLocks}.
 */
export const LocksCapability = createCapability<LockStore>()('locks')

/** Destructured accessors: `getLocks(ctx)` / `provideLocks(ctx, store)`. */
export const /** Destructured accessors: `getLocks(ctx)` / `provideLocks(ctx, store)`. */
[getLocks, provideLocks] = LocksCapability

/**
 * In-memory {@link LockStore} — a per-key promise chain. Correct within a single
 * process; multi-instance correctness needs a distributed lock backend.
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

/**
 * Provide a {@link LockStore} on the chat middleware capability bus.
 *
 * Coordination only — independent of chat state persistence. A lock provided
 * here reaches any later middleware that reads {@link LocksCapability}
 * (including `withSandbox`).
 *
 * ```ts
 * middleware: [
 *   withLocks(distributedLocks),
 *   withSandbox(sandbox),
 * ]
 * ```
 */
export function withLocks(locks: LockStore): ChatMiddleware {
  return defineChatMiddleware({
    name: 'locks',
    provides: [LocksCapability],
    setup(ctx: ChatMiddlewareContext) {
      provideLocks(ctx, locks)
    },
  })
}
