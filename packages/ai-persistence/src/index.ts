// Store contracts + aggregate
export {
  AppendConflictError,
  defineAIPersistence,
  defineChatPersistence,
  validatePersistenceFeatures,
} from './types'
export type {
  PersistenceMode,
  PersistenceFeature,
  PersistedEvent,
  PersistedPublicEvent,
  PersistedInternalEvent,
  MessageStore,
  RunStatus,
  RunRecord,
  RunStore,
  EventLog,
  PublicEventStore,
  InternalEventStore,
  DurableRunStream,
  InterruptRecord,
  InterruptStore,
  ApprovalRecord,
  ApprovalStore,
  MetadataStore,
  ArtifactRecord,
  ArtifactStore,
  AIPersistence,
  ChatPersistence,
} from './types'

// Middleware
export { withPersistence } from './middleware'
export type { WithPersistenceOptions } from './middleware'

// Reference in-memory implementation
export { memoryPersistence } from './memory'

// Cursor utilities
export {
  encodeCursor,
  decodeCursor,
  isValidCursor,
  RunSequence,
} from './cursor'

// Resume-source adapter (EventLog + RunStore -> core ResumeSource)
export { createResumeSource } from './resume-source'

// History projection (events -> StreamChunk[] timeline for devtools / replay)
export { loadRunHistory } from './history'

// Interrupt controller
export { createInterruptController } from './interrupts'
export type { InterruptController } from './interrupts'

// Deprecated approval compatibility
export { createApprovalController } from './approval-controller'
export type { ApprovalController } from './approval-controller'

// Capabilities (incl. re-exported core Locks/ResumeSource tokens)
export {
  PersistenceCapability,
  EventsCapability,
  InterruptsCapability,
  ApprovalsCapability,
  getPersistence,
  providePersistence,
  getEvents,
  provideEvents,
  getInterrupts,
  provideInterrupts,
  getApprovals,
  provideApprovals,
  LocksCapability,
  getLocks,
  provideLocks,
  ResumeSourceCapability,
  getResumeSource,
  provideResumeSource,
} from './capabilities'
