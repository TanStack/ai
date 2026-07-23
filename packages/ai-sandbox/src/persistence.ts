/**
 * `withSandboxPersistence({ store, locks? })` — provide durable sandbox
 * resume state to `withSandbox`.
 *
 * `withSandbox` OPTIONALLY consumes `SandboxStoreCapability` (which sandbox
 * instance to resume for a key) and `LocksCapability` (mutual exclusion around
 * ensure). This middleware provides durable implementations of them; compose it
 * BEFORE `withSandbox` in the chain.
 *
 * The `locks` store is optional: omit it and `withSandbox` falls back to its
 * in-process lock (correct for a single instance). Supply a distributed lock
 * (e.g. `createDurableObjectLockStore` from `@tanstack/ai-persistence-cloudflare`)
 * for multi-instance correctness. Because the `'locks'` token is the shared core
 * token, a `withPersistence({ stores: { locks } })` already in the chain
 * supplies the same lock — pass `locks` here only when sandbox is used WITHOUT
 * chat persistence.
 *
 * @example
 * ```ts
 * chat({
 *   adapter,
 *   messages,
 *   middleware: [
 *     withSandboxPersistence({
 *       store: createD1SandboxStore(env.DB),
 *       locks: createDurableObjectLockStore(env.LOCKS),
 *     }),
 *     withSandbox(mySandbox),
 *   ],
 * })
 * ```
 */
import { defineChatMiddleware } from '@tanstack/ai'
import {
  LocksCapability,
  SandboxStoreCapability,
  provideLocks,
  provideSandboxStore,
} from './capabilities'
import type { ChatMiddleware } from '@tanstack/ai'
import type { LockStore, SandboxStore } from './store'

/** Options for {@link withSandboxPersistence}. */
export interface SandboxPersistenceOptions {
  /** Durable {@link SandboxStore} mapping a sandbox key to its resume record. */
  store: SandboxStore
  /**
   * Distributed {@link LockStore} serializing ensure across instances. Omit for
   * single-instance deployments (in-process fallback), or when a
   * `withPersistence` in the chain already provides one.
   */
  locks?: LockStore
}

export function withSandboxPersistence(
  options: SandboxPersistenceOptions,
): ChatMiddleware {
  const { store, locks } = options
  const provides = [SandboxStoreCapability, ...(locks ? [LocksCapability] : [])]
  return defineChatMiddleware({
    name: 'sandbox-persistence',
    provides,
    setup(ctx) {
      provideSandboxStore(ctx, store)
      if (locks) provideLocks(ctx, locks)
    },
  })
}
