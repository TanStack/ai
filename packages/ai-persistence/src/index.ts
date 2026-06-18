// Store contracts + aggregate
export { defineChatPersistence } from './types'
export type {
  PersistenceMode,
  PersistedEvent,
  MessageStore,
  RunStatus,
  RunRecord,
  RunStore,
  EventLog,
  DurableRunStream,
  ApprovalRecord,
  ApprovalStore,
  ArtifactRecord,
  ArtifactStore,
  ChatPersistence,
} from './types'

// Middleware
export { withPersistence } from './middleware'
export type { WithPersistenceOptions } from './middleware'

// Reference in-memory implementation
export { memoryPersistence } from './memory'

// Cursor utilities
export { encodeCursor, decodeCursor, isValidCursor, RunSequence } from './cursor'

// Resume-source adapter (EventLog + RunStore -> core ResumeSource)
export { createResumeSource } from './resume-source'

// History projection (events -> StreamChunk[] timeline for devtools / replay)
export { loadRunHistory } from './history'

// Approval controller
export { createApprovalController } from './approval-controller'
export type { ApprovalController } from './approval-controller'

// Capabilities (incl. re-exported core Locks/ResumeSource tokens)
export {
  PersistenceCapability,
  EventsCapability,
  ApprovalsCapability,
  getPersistence,
  providePersistence,
  getEvents,
  provideEvents,
  getApprovals,
  provideApprovals,
  LocksCapability,
  getLocks,
  provideLocks,
  ResumeSourceCapability,
  getResumeSource,
  provideResumeSource,
} from './capabilities'
