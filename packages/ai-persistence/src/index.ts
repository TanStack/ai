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
  ArtifactRecord,
  ArtifactStore,
  BlobBody,
  BlobRecord,
  BlobObject,
  BlobListPage,
  BlobPutOptions,
  BlobListOptions,
  BlobStore,
  AIPersistence,
  AIPersistenceStores,
  AIPersistenceOverrides,
  ComposedAIPersistenceStores,
} from './types'

// Core artifact wire types (re-exported for convenience)
export type {
  PersistedArtifactActivity,
  PersistedArtifactRef,
  PersistedArtifactRole,
} from '@tanstack/ai'

// Middleware
export { withPersistence, withGenerationPersistence } from './middleware'
export type {
  WithPersistenceOptions,
  GenerationArtifactDescriptor,
  GenerationArtifactExtractionInput,
  GenerationArtifactNameInput,
} from './middleware'

// Server helper: rehydrate a thread's messages for a client load
export { reconstructChat } from './reconstruct'
export type { ReconstructChatOptions } from './reconstruct'

// Reference in-memory implementation
export { memoryPersistence } from './memory'

// Interrupt controller
export { createInterruptController } from './interrupts'
export type { InterruptController } from './interrupts'

// Capabilities (incl. the Locks token, owned by this package)
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

// Lock primitive (owned here; sandbox persistence will bridge the token later)
export { InMemoryLockStore } from './locks'
export type { LockStore } from './locks'
