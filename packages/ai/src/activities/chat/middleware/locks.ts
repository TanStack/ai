import { createCapability } from './capabilities'
import { defineChatMiddleware } from './define'
import type { ChatMiddleware, ChatMiddlewareContext } from './types'

export interface LockStore {
  withLock: <T>(
    key: string,
    fn: (signal: AbortSignal) => Promise<T>,
  ) => Promise<T>
}

export function defineLock(lock: LockStore): LockStore {
  return lock
}

export const LocksCapability = createCapability<LockStore>()('locks')

/** Destructured accessors: `getLocks(ctx)` / `provideLocks(ctx, store)`. */
export const [getLocks, provideLocks] = LocksCapability

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

export function withLocks(locks: LockStore): ChatMiddleware {
  return defineChatMiddleware({
    name: 'locks',
    provides: [LocksCapability],
    setup(ctx: ChatMiddlewareContext) {
      provideLocks(ctx, locks)
    },
  })
}
