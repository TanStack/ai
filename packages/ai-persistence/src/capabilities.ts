/**
 * Persistence capability tokens.
 *
 * `withChatPersistence` PROVIDES these so later middleware (and harness adapters)
 * can read durable state. `LocksCapability` and `ResumeSourceCapability` are
 * re-exported from core (`@tanstack/ai`) — they are shared, single-owner tokens
 * (locks with the sandbox layer; the resume source with the chat engine's
 * resume seam).
 */
import { createCapability } from '@tanstack/ai'
import type { AIPersistence, InterruptStore, PublicEventStore } from './types'

export const PersistenceCapability =
  createCapability<AIPersistence>()('persistence')

export const EventsCapability = createCapability<PublicEventStore>()(
  'persistence.publicEvents',
)

export const InterruptsCapability = createCapability<InterruptStore>()(
  'persistence.interrupts',
)

export const [getPersistence, providePersistence] = PersistenceCapability
export const [getEvents, provideEvents] = EventsCapability
export const [getInterrupts, provideInterrupts] = InterruptsCapability

/**
 * @deprecated Use InterruptsCapability.
 * @alias
 */
export const ApprovalsCapability = InterruptsCapability
/**
 * @deprecated Use getInterrupts.
 * @alias
 */
export const getApprovals = getInterrupts
/**
 * @deprecated Use provideInterrupts.
 * @alias
 */
export const provideApprovals = provideInterrupts

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
