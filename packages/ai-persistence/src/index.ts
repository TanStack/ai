// Store contracts + aggregate
export {
  defineAIPersistence,
  defineChatPersistence,
  validatePersistenceFeatures,
} from './types'
export type {
  PersistenceMode,
  PersistenceFeature,
  MessageStore,
  RunStatus,
  RunRecord,
  RunStore,
  InterruptRecord,
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
  ChatPersistence,
} from './types'

// Middleware
export { withChatPersistence, withGenerationPersistence } from './middleware'
export type {
  GenerationArtifactDescriptor,
  GenerationArtifactExtractionInput,
  GenerationArtifactNameInput,
  WithPersistenceOptions,
} from './middleware'

export type {
  PersistedArtifactActivity,
  PersistedArtifactRef,
  PersistedArtifactRole,
} from '@tanstack/ai'

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
