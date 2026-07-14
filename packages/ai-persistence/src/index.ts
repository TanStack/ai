// Store contracts + aggregate
export { composePersistence, defineAIPersistence } from './types'
export type {
  MessageStore,
  RunStatus,
  RunRecord,
  RunStore,
  InterruptRecord,
  InterruptBatchRecord,
  InterruptStore,
  LegacyInterruptRecordInput,
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

// Middleware
export {
  InterruptReplaySignal,
  InterruptResumeValidationError,
  validateInterruptResumeBatch,
  withChatPersistence,
  withGenerationPersistence,
} from './middleware'
export type {
  GenerationArtifactDescriptor,
  GenerationArtifactExtractionInput,
  GenerationArtifactNameInput,
  ValidateInterruptResumeBatchInput,
  ValidatedInterruptResumeBatch,
  WithPersistenceOptions,
} from './middleware'

// Authenticated recovery helpers (route registration remains application-owned)
export {
  createInterruptRecoveryHandler,
  getInterruptRecoveryState,
} from './recovery'
export type {
  GetInterruptRecoveryStateOptions,
  InterruptRecoveryAuthorization,
  InterruptRecoveryHandlerOptions,
} from './recovery'

export type {
  PersistedArtifactActivity,
  PersistedArtifactRef,
  PersistedArtifactRole,
} from '@tanstack/ai'

// Reference in-memory implementation
export { memoryPersistence } from './memory'

// Interrupt controller
export {
  createInterruptController,
  hasExactInterruptIds,
  InterruptStoreCorruptionError,
  projectInterruptRecovery,
} from './interrupts'
export type { InterruptController } from './interrupts'

// Capabilities (incl. re-exported core Locks token)
export {
  PersistenceCapability,
  InterruptsCapability,
  InterruptPersistenceCapability,
  getPersistence,
  providePersistence,
  getInterrupts,
  provideInterrupts,
  getInterruptPersistence,
  provideInterruptPersistence,
  LocksCapability,
  getLocks,
  provideLocks,
} from './capabilities'
