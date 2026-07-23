/**
 * Persistence seams for the sandbox layer, re-exported from core `@tanstack/ai`.
 *
 * `SandboxStore` and `LockStore` are the SAME tokens `@tanstack/ai-persistence`
 * provides through `withPersistence`, so a durable store and distributed lock
 * supplied by a persistence middleware reach `withSandbox` transparently. They
 * live in core (their neutral home) so neither package depends on the other; the
 * sandbox layer never hardcodes storage.
 */
export { InMemoryLockStore, InMemorySandboxStore } from '@tanstack/ai'
export type { LockStore, SandboxStore, SandboxRecord } from '@tanstack/ai'
