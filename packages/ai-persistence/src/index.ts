// Store contracts + named chat shapes
export {
  composePersistence,
  defineAIPersistence,
  defineMessageStore,
  defineRunStore,
  defineInterruptStore,
  defineMetadataStore,
  defineGenerationRunStore,
  defineArtifactStore,
  defineBlobStore,
} from './types'
export type {
  MessageStore,
  RunStatus,
  RunRecord,
  RunStore,
  InterruptRecord,
  InterruptStatus,
  InterruptStore,
  MetadataStore,
  // Named product shapes (prefer these over a sparse bag)
  ChatTranscriptStores,
  ChatPersistenceStores,
  ChatWithInterruptsStores,
  ChatTranscriptPersistence,
  ChatPersistence,
  ChatWithInterruptsPersistence,
  // Generation run store contract
  GenerationRunStatus,
  GenerationRunRecord,
  GenerationRunStore,
  // Generation artifact + blob store contracts
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
  AIPersistenceOverrides,
  ComposedAIPersistenceStores,
  // Shared conversation identity from @tanstack/ai. Stores key on
  // Scope.threadId; authorize multi-user access with Scope.userId/tenantId.
  Scope,
} from './types'
// AIPersistenceStores is intentionally NOT re-exported — use a named chat
// shape or AIPersistence<{ messages: MessageStore, … }>.

// Core artifact wire types (re-exported for convenience)
export type {
  PersistedArtifactActivity,
  PersistedArtifactRef,
  PersistedArtifactRole,
} from '@tanstack/ai'

// Middleware (chat state — locks live in @tanstack/ai as withLocks)
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

// Server helper: rehydrate the last generation job for a client load
export {
  reconstructGeneration,
  getGenerationHydration,
} from './reconstruct-generation'
export type {
  ReconstructedGeneration,
  ReconstructGenerationOptions,
  GetGenerationHydrationOptions,
} from './reconstruct-generation'

// Server helpers: retrieve a persisted generation artifact + its bytes
export {
  retrieveArtifact,
  retrieveBlob,
  artifactBlobKey,
  resolveArtifactBlobKey,
} from './retrieve'

// Reference in-memory implementation
export { memoryPersistence } from './memory'

// Interrupt controller
export { createInterruptController } from './interrupts'
export type { InterruptController } from './interrupts'

// Persistence-owned capabilities only. Locks: @tanstack/ai.
export {
  PersistenceCapability,
  InterruptsCapability,
  getPersistence,
  providePersistence,
  getInterrupts,
  provideInterrupts,
} from './capabilities'
