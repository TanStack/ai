/**
 * The `'locks'` capability now lives in core `@tanstack/ai` (its neutral home)
 * so the durable lock this package provides via `withPersistence` reaches
 * `@tanstack/ai-sandbox`'s `ensure` through the SAME token reference. This module
 * re-exports it unchanged so persistence consumers keep importing everything
 * lock-related from `@tanstack/ai-persistence`.
 */
export {
  LocksCapability,
  getLocks,
  provideLocks,
  InMemoryLockStore,
} from '@tanstack/ai'
export type { LockStore } from '@tanstack/ai'
