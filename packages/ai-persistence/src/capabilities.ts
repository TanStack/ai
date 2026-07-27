/**
 * Persistence capability tokens.
 *
 * `withPersistence` PROVIDES persistence/interrupts so later middleware can
 * read durable chat state. Locks live in `@tanstack/ai/locks` (`withLocks`).
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
