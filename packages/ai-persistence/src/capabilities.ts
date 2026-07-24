/**
 * Persistence capability tokens.
 *
 * `withPersistence` PROVIDES these so later middleware (and harness adapters)
 * can read durable state. `LocksCapability` is defined in `./locks` (see the note
 * there): sandbox persistence, the only cross-package consumer, is deferred, so
 * the token lives local to this package for now.
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

// Locks token lives in this package (see ./locks); re-export so consumers import
// everything persistence-related from here.
export { LocksCapability, getLocks, provideLocks } from './locks'
