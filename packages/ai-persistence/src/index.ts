// Store contracts + named chat shapes
export {
  composePersistence,
  defineAIPersistence,
  defineMessageStore,
  defineRunStore,
  defineInterruptStore,
  defineMetadataStore,
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
  AIPersistence,
  AIPersistenceOverrides,
  ComposedAIPersistenceStores,
  // Shared conversation identity from @tanstack/ai. Stores key on
  // Scope.threadId; authorize multi-user access with Scope.userId/tenantId.
  Scope,
} from './types'
// AIPersistenceStores is intentionally NOT re-exported — use a named chat
// shape or AIPersistence<{ messages: MessageStore, … }>.

// Middleware (state only — locks live in @tanstack/ai as withLocks)
export { withPersistence, withGenerationPersistence } from './middleware'

// Server helper: rehydrate a thread's messages for a client load
export { reconstructChat } from './reconstruct'
export type { ReconstructChatOptions } from './reconstruct'

// Reference in-memory implementation (state stores only)
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
