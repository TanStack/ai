/**
 * Persistence capability tokens.
 *
 * `withPersistence` PROVIDES these so later middleware (and harness adapters)
 * can read durable state. `LocksCapability` and `ResumeSourceCapability` are
 * re-exported from core (`@tanstack/ai`) — they are shared, single-owner tokens
 * (locks with the sandbox layer; the resume source with the chat engine's
 * resume seam).
 */
import { createCapability } from '@tanstack/ai'
import type { ApprovalStore, ChatPersistence, EventLog } from './types'

export const PersistenceCapability =
  createCapability<ChatPersistence>()('persistence')

export const EventsCapability = createCapability<EventLog>()('persistence.events')

export const ApprovalsCapability =
  createCapability<ApprovalStore>()('persistence.approvals')

export const [getPersistence, providePersistence] = PersistenceCapability
export const [getEvents, provideEvents] = EventsCapability
export const [getApprovals, provideApprovals] = ApprovalsCapability

// Shared, single-owner tokens live in core; re-export so consumers import
// everything persistence-related from this package.
export {
  LocksCapability,
  getLocks,
  provideLocks,
  ResumeSourceCapability,
  getResumeSource,
  provideResumeSource,
} from '@tanstack/ai'
