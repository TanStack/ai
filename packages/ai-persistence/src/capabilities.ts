/**
 * Persistence capability tokens.
 *
 * `withChatPersistence` PROVIDES these so later middleware (and harness adapters)
 * can read durable state. `LocksCapability` is re-exported from core
 * (`@tanstack/ai`): the `'locks'` token lives in core so there is exactly one of
 * it, shared by both the sandbox and persistence layers — neither layer owns it.
 */
import { createCapability } from '@tanstack/ai'
import type { AIPersistence, InterruptStore } from './types'

export const PersistenceCapability =
  createCapability<AIPersistence>()('persistence')

export const InterruptsCapability = createCapability<InterruptStore>()(
  'persistence.interrupts',
)

export const [getPersistence, providePersistence] = PersistenceCapability
export const [getInterrupts, provideInterrupts] = InterruptsCapability

// Shared, single-owner tokens live in core; re-export so consumers import
// everything persistence-related from this package.
export { LocksCapability, getLocks, provideLocks } from '@tanstack/ai'
