/**
 * Distributed-mutex primitive — coordination, not state persistence.
 *
 * Its own subpath (`@tanstack/ai/locks`) so it stays out of the main barrel and
 * consumers opt in explicitly. Provide a store with `withLocks`; downstream
 * middleware (e.g. `@tanstack/ai-sandbox`'s `ensure`) reads it via `getLocks` /
 * `LocksCapability`. Import from here, not from `@tanstack/ai-persistence`.
 */
export {
  LocksCapability,
  getLocks,
  provideLocks,
  InMemoryLockStore,
  withLocks,
  defineLock,
} from './activities/chat/middleware/index'
export type { LockStore } from './activities/chat/middleware/index'
