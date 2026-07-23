// Store contracts + aggregate
export { composePersistence, defineAIPersistence } from './types'
export type {
  MessageStore,
  RunStatus,
  RunRecord,
  RunStore,
  InterruptRecord,
  InterruptStatus,
  InterruptStore,
  MetadataStore,
  AIPersistence,
  AIPersistenceStores,
  AIPersistenceOverrides,
  ComposedAIPersistenceStores,
} from './types'

// Middleware
export { withPersistence, withGenerationPersistence } from './middleware'

// Server helper: rehydrate a thread's messages for a client load
export { reconstructChat } from './reconstruct'
export type { ReconstructChatOptions } from './reconstruct'

// Reference in-memory implementation
export { memoryPersistence } from './memory'

// Interrupt controller
export { createInterruptController } from './interrupts'
export type { InterruptController } from './interrupts'

// Capabilities. The Locks token is re-exported from core `@tanstack/ai` (its
// neutral home) so a persistence-provided distributed lock reaches the sandbox
// layer through the same token reference.
export {
  PersistenceCapability,
  InterruptsCapability,
  getPersistence,
  providePersistence,
  getInterrupts,
  provideInterrupts,
  LocksCapability,
  getLocks,
  provideLocks,
} from './capabilities'

// Lock primitive (re-exported from core; see ./locks)
export { InMemoryLockStore } from './locks'
export type { LockStore } from './locks'
