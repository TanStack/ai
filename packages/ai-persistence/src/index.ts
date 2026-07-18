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
export { withChatPersistence, withGenerationPersistence } from './middleware'

// Reference in-memory implementation
export { memoryPersistence } from './memory'

// Interrupt controller
export { createInterruptController } from './interrupts'
export type { InterruptController } from './interrupts'

// Capabilities (incl. re-exported core Locks token)
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
